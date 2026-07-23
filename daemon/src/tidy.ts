// tidy.ts — the reconcile-from-observed-truth reaper (spec §7).
//
// Invoked three ways: as the `tidy` verb, on merge detection during a tick, and
// at serve boot (the crash-recovery path). Its whole job is to make the world
// consistent from OBSERVED TRUTH ONLY — the three sources {tbd, git, gh} — and
// then rewrite `state.json` from that observation. It NEVER reconstructs state
// from the prior `state.json`; a `kill -9` at any instant must boot into a
// consistent world, and trusting a possibly-torn prior state would defeat that.
//
// The reconcile logic (§7):
//   1. For each worktree under the serve root:
//        - its PR merged/closed  → reap worktree + branch + prune.
//        - no live in-flight entry AND no open PR → reap + release the bead's
//          claim (restore `groomed` via queue.release).
//   2. For each `assignee=serve, in_progress` bead with no worktree and no PR
//      → release the claim (an orphaned claim: crashed before the worktree, or
//        after the reap).
//   3. Rewrite `state.json` from observed truth only ({tbd, git, gh}).
//
// Every side-effecting collaborator is injected as a narrow adapter so vitest
// drives this against fakes/fixtures with zero real git/gh/tbd. The real daemon
// binds these to queue.ts / worktree.ts / prs.ts / state.ts.

import type { State, InFlight } from "./state.js";
import { SCHEMA_VERSION } from "./state.js";
import type { WorktreePlan } from "./worktree.js";

// ── Injected adapter surfaces ────────────────────────────────────────────────
//
// Each is the minimal slice of a real module tidy consumes, declared
// structurally so a fake object satisfies it directly and the real class/module
// (Queue, worktree.ts fns, prs.ts, state.ts) binds without an adapter shim.

/** Release a claimed bead back to the board (queue.ts `release` → `groomed`). */
export interface QueueAdapter {
  /** any → released (§3.1): restore `groomed`, clear assignee, reopen. */
  release(beadId: string): void;
}

/** Reap a bead's worktree + branch + prune (worktree.ts `reapWorktree`). */
export interface WorktreeAdapter {
  reap(plan: WorktreePlan): Promise<void>;
}

/**
 * The gh/GitHub view tidy needs: for a bead, is there a *live* (open) PR, and is
 * the bead's PR merged/closed? Backed by prs.ts (owned-PR selection + merge
 * detection) in the daemon; a lookup table in tests.
 */
export interface PrAdapter {
  /** True when the bead currently has an OPEN pull request. */
  hasOpenPR(beadId: string): Promise<boolean>;
  /** True when the bead's PR is merged or closed (terminal). */
  isMergedOrClosed(beadId: string): Promise<boolean>;
}

/** state.json writer (state.ts `writeState`, curried over its path). */
export interface StateAdapter {
  write(state: State): void;
}

// ── Observed inputs (the truth tidy reconciles against) ──────────────────────

/**
 * A worktree found on disk under the serve root — the git-observed truth. Maps a
 * checkout back to the bead + branch it belongs to (parsed from the sibling
 * layout `../<repo>-serve/<bead-id>/` + its branch).
 */
export interface ObservedWorktree {
  bead: string;
  plan: WorktreePlan;
}

/**
 * A tbd-observed claim: a bead with `assignee=serve` in `in_progress`. This is
 * the source-of-truth roster of what the daemon believes it owns, read straight
 * from tbd (never from state.json).
 */
export interface ObservedClaim {
  bead: string;
}

/** Everything tidy observes about the world, from {git, tbd} up front. */
export interface Observed {
  /** Worktrees present on disk under the serve root (git truth). */
  worktrees: readonly ObservedWorktree[];
  /** `assignee=serve, in_progress` beads (tbd truth). */
  claims: readonly ObservedClaim[];
}

/** The collaborators tidy drives; all injectable for tests. */
export interface TidyDeps {
  queue: QueueAdapter;
  worktree: WorktreeAdapter;
  prs: PrAdapter;
  state: StateAdapter;
}

/** One reconcile action taken, for the returned report + the events ledger. */
export type TidyAction =
  /** A worktree was reaped because its PR is merged/closed. */
  | { kind: "reap-merged"; bead: string }
  /** A worktree + claim were reaped/released: no in-flight entry, no open PR. */
  | { kind: "reap-orphan-worktree"; bead: string }
  /** An orphan claim (no worktree, no PR) was released back to the board. */
  | { kind: "release-orphan-claim"; bead: string };

/** What one reconcile pass did + the state it rewrote from observed truth. */
export interface TidyResult {
  actions: TidyAction[];
  /** The freshly-rebuilt state, written to state.json (observed truth only). */
  state: State;
}

// ── The reconcile pass ───────────────────────────────────────────────────────

/**
 * Reconcile the world from observed truth (§7) and rewrite `state.json`.
 *
 * `liveInFlight` is the set of bead ids the *running* daemon still holds in
 * memory as active in-flight work — used only to distinguish "a worktree whose
 * owning session is still alive" from "a stranded worktree". At serve boot /
 * verb invocation there is no live process, so it is empty and every
 * PR-less worktree is treated as stranded. It is NEVER sourced from a prior
 * `state.json` — that would smuggle stale state back into the rebuild.
 *
 * Returns the actions taken and the rebuilt state; the state is written via the
 * injected {@link StateAdapter} before returning.
 */
export async function reconcile(
  deps: TidyDeps,
  observed: Observed,
  opts: { liveInFlight?: ReadonlySet<string>; now?: () => string } = {},
): Promise<TidyResult> {
  const live = opts.liveInFlight ?? new Set<string>();
  const now = opts.now ?? (() => new Date().toISOString());

  const actions: TidyAction[] = [];
  // Beads whose claim is gone (reaped/released) — excluded from the rebuilt
  // in-flight roster even if they still appear in the observed claims.
  const released = new Set<string>();
  // Beads whose worktree survived this pass (still legitimately building).
  const survivingWorktrees = new Map<string, ObservedWorktree>();

  // ── Step 1: reconcile each observed worktree ──────────────────────────────
  for (const wt of observed.worktrees) {
    const mergedOrClosed = await deps.prs.isMergedOrClosed(wt.bead);
    if (mergedOrClosed) {
      // PR merged/closed → the work landed; reap the worktree + branch + prune.
      // The claim is closed by the in-review→closed transition elsewhere, not
      // released — so we do NOT restore `groomed`.
      await deps.worktree.reap(wt.plan);
      actions.push({ kind: "reap-merged", bead: wt.bead });
      continue;
    }

    const openPR = await deps.prs.hasOpenPR(wt.bead);
    const stillLive = live.has(wt.bead);
    if (!openPR && !stillLive) {
      // Stranded worktree: no live in-flight entry AND no open PR → reap the
      // worktree and release the bead's claim back to the board (restore
      // `groomed`), so the work is re-pullable.
      await deps.worktree.reap(wt.plan);
      deps.queue.release(wt.bead);
      released.add(wt.bead);
      actions.push({ kind: "reap-orphan-worktree", bead: wt.bead });
      continue;
    }

    // Legitimately in-flight (open PR and/or a live session) — keep it.
    survivingWorktrees.set(wt.bead, wt);
  }

  // ── Step 2: reconcile claims with no worktree and no PR ───────────────────
  for (const claim of observed.claims) {
    if (survivingWorktrees.has(claim.bead)) continue; // has a worktree — handled above
    if (released.has(claim.bead)) continue; // already released via its worktree
    const openPR = await deps.prs.hasOpenPR(claim.bead);
    if (openPR) continue; // in-review with a live PR but no local worktree — leave it
    // Orphan claim: assignee=serve/in_progress but no worktree and no PR →
    // release it back to the board.
    deps.queue.release(claim.bead);
    released.add(claim.bead);
    actions.push({ kind: "release-orphan-claim", bead: claim.bead });
  }

  // ── Step 3: rewrite state.json from observed truth ONLY ───────────────────
  const state = await rebuildState(deps, observed, {
    surviving: survivingWorktrees,
    released,
    live,
    now,
  });
  deps.state.write(state);

  return { actions, state };
}

/**
 * Rebuild {@link State} purely from what we just observed — the surviving
 * worktrees and the tbd/gh facts about them. Nothing here reads a prior
 * `state.json`: the in-flight roster is exactly the worktrees that survived
 * reconcile, and each entry's phase/pr is derived from observed gh truth.
 *
 * `bounced` is the set of beads reconcile released back to the board this pass
 * (observed, not remembered), and `recentEvents` is a fresh, derived line per
 * surviving in-flight bead — history proper lives in `events.jsonl`, not here.
 */
async function rebuildState(
  deps: TidyDeps,
  _observed: Observed,
  ctx: {
    surviving: ReadonlyMap<string, ObservedWorktree>;
    released: ReadonlySet<string>;
    live: ReadonlySet<string>;
    now: () => string;
  },
): Promise<State> {
  const startedAt = ctx.now();
  const inFlight: InFlight[] = [];

  for (const wt of ctx.surviving.values()) {
    const openPR = await deps.prs.hasOpenPR(wt.bead);
    inFlight.push({
      bead: wt.bead,
      lane: "quick",
      worktree: wt.plan.path,
      branch: wt.plan.branch,
      // Observed: a live PR means we're in review; otherwise still building.
      pr: openPR ? "" : null,
      phase: openPR ? "in-review" : "building",
      sessionPid: null,
      startedAt,
    });
  }

  return {
    schemaVersion: SCHEMA_VERSION,
    lastTick: ctx.now(),
    inFlight,
    bounced: [...ctx.released],
    recentEvents: inFlight.map((f) => `tidy: in-flight ${f.bead} (${f.phase})`),
  };
}

// ── CLI entry (the `tidy` verb) ──────────────────────────────────────────────
//
// The verb's real-adapter wiring — enumerating on-disk worktrees under the serve
// root, reading `assignee=serve` claims from tbd, and binding prs.ts/queue.ts/
// worktree.ts/state.ts — lands with the serve integration bead (it depends on
// the observed-truth collectors, which live outside this bead's write-scope).
// The reconcile core above IS the tidy logic; this entry only reports that the
// verb is wired but the collectors are not yet bound.

/** Invoked when run directly as the `tidy` verb (`tsx src/tidy.ts`). */
export function main(): void {
  process.stdout.write(
    "tidy: reconcile core ready; observed-truth collectors bind at serve integration (§7)\n",
  );
}

// Run only when executed as a script, not when imported by tests.
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
