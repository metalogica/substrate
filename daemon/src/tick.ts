// tick.ts — one poll cycle as a PURE ORCHESTRATION function (spec §4).
//
// The tick is the daemon's heartbeat: sweep owned PRs, check capacity, discover
// claimable beads, claim the head, route it. Every adapter it touches — the
// queue (tbd), state (state.json), config, and the clock — is INJECTED via a
// deps object, so vitest can drive the orchestration against fakes without a
// real tbd repo, real filesystem, or real wall clock.
//
// CRASH-IDEMPOTENCE (spec §4, §7): the cycle is designed so a crash between any
// two sub-steps leaves recoverable state. The queue mutations are the source of
// truth (a claimed bead is `in_progress`+assigned in tbd, off the board); the
// in-memory `State` this function returns is OBSERVABILITY ONLY. Boot-reap (§7)
// reconstructs invariants from {tbd, git, gh}, NEVER from state.json — so we
// never gate correctness on the in-memory snapshot surviving a crash. Concretely
// the ordering is: (1) sweep PRs, (2) read capacity from truth-derived inFlight,
// (3) discover from tbd, (4) claim in tbd (the committing step), (5) route.
// A crash after (4) but before we persist leaves the bead claimed in tbd; the
// next boot reaps or resumes it from that truth.

import { route as routeBead, logOverride, bounce } from "./router.js";
import { bounceAdapter } from "./triage.js";
import type { Bead, Route } from "./queue.js";
import type { InFlight, State } from "./state.js";
import type { Config, Lane } from "./config.js";
import type { Dispatch, DispatchResult } from "./triage.js";
import type { Comment, InFlightRef, OwnedPR, PullRequest } from "./prs.js";

/** The lane a claimed bead is routed to (§5.1). Mirrors config's lane keys. */
export type Lane_ = keyof Config["lanes"];

/**
 * Queue capabilities the tick consumes (a structural subset of `Queue`). Typed
 * as an interface so tests can pass a hand-rolled fake instead of constructing a
 * real {@link import("./queue.js").Queue} bound to a fixture repo.
 */
export interface QueuePort {
  /** Discover claimable beads: groomed+open, `needs-spec` excluded, FIFO by ULID. */
  list(): Bead[];
  /** groomed → claimed (§3.1): the committing step of the cycle. */
  claim(id: string): void;
  /** claimed → routed / routed → in-review (§3.1): route label, in-review, note. */
  stamp(id: string, stamp: { route?: Route; note?: string; inReview?: boolean }): void;
  /** any → released (§3.1): restore `groomed`, clear assignee, status → open. */
  release(id: string): void;
  /** Add a single label (§3.1): re-apply `needs-spec` on a spec-lane bounce. */
  addLabel(id: string, label: string): void;
  /**
   * in-review → closed (§3.1): close a bead the daemon manages once its PR merged.
   * The daemon is the single writer for ITS beads at runtime; the PR-sweep calls
   * this with the merge SHA as the reason (§6 merge detection).
   */
  close(id: string, reason: string): void;
}

/** Monotonic-enough clock; injected so tests pin `lastTick` deterministically. */
export interface Clock {
  /** Current instant as an ISO-8601 string (what `state.lastTick` stores). */
  nowIso(): string;
}

/** The real clock — `new Date().toISOString()`. Swapped for a fake in tests. */
export const systemClock: Clock = {
  nowIso: () => new Date().toISOString(),
};

/**
 * The PR-sweep seam (spec §4 step 1, §6). PR work outranks new claims, so it
 * runs FIRST every cycle. It takes the current in-flight set, does the §6 PR loop
 * (actualize new comments, detect merges → tidy + close), and returns the
 * (possibly retired) in-flight set the capacity check then reads.
 *
 * The return may be sync or a promise: the built-in {@link noopPrSweep} is a sync
 * pass-through (used by the pre-sub-x881 contract + ordering tests), while the
 * real {@link createPrSweep} sweep is async because it shells out to gh + spawns
 * actualize sessions + calls tidy. The tick `await`s whichever it is injected.
 */
export type PrSweep = (inFlight: InFlight[]) => InFlight[] | Promise<InFlight[]>;

/** Default PR-sweep: a no-op pass-through (no PR ports injected). */
export const noopPrSweep: PrSweep = (inFlight) => inFlight;

/**
 * The gh/PR view the sweep consumes for ONE tick (§6). Injectable so vitest drives
 * the sweep off fakes/fixtures with zero real `gh`/`git`. Backed in the daemon by
 * `prs.ts` (owned-PR selection, ETag-conditioned comment polling, merge detection).
 */
export interface PrPort {
  /**
   * The owned PRs for the current in-flight set (§6): open PRs whose head branch
   * matches `branchPrefix` and maps to an in-flight bead. The daemon binds this to
   * `gh pr list` + `prs.selectOwnedPRs`; tests return a canned list.
   */
  ownedPrs(inFlight: readonly InFlightRef[]): Promise<OwnedPR[]>;
  /**
   * The UNADDRESSED comments for an owned PR since the last seen id, deduped by
   * comment id, with the advanced cursor (§6 "dedup replies by comment id"). The
   * daemon binds this to ETag-conditioned polling + `prs.advanceComments`; a 304 /
   * no-new-comment poll returns `fresh: []` (and the cursor unchanged) so the
   * sweep takes the no-op path.
   */
  freshComments(owned: OwnedPR): Promise<{ fresh: Comment[]; cursor: number }>;
  /**
   * Merge detection for an owned PR (§6): `mergedAt` non-null, or the
   * `git merge-base --is-ancestor` fallback. Backed by `prs.detectMerge`.
   */
  detectMerge(pr: PullRequest): Promise<{ merged: boolean; sha: string | null }>;
}

/**
 * Spawn ONE fresh actualize session in a bead's worktree (§6). A brand-new
 * session (not a resumed one) with the batched, deduped comments — its prompt is
 * composed by the caller ({@link createPrSweep} via {@link actualizePrompt}) and
 * the rules are *address, push, reply to each comment via gh, never merge*. The
 * daemon binds this to `session.ts` `runSession` over the real `claude` spawn;
 * tests substitute a recorder. Returns nothing the sweep judges — success is
 * observed on the NEXT poll (new commit / reply), same as the lane contract.
 */
export type ActualizeSession = (spec: ActualizeSpec) => Promise<void>;

/** What one fresh actualize session needs to spawn (§6). */
export interface ActualizeSpec {
  /** The in-flight bead whose PR is being actualized. */
  bead: string;
  /** The bead's worktree — the fresh session runs in the SAME worktree (§6). */
  worktree: string;
  /** The owned PR number the comments belong to (for the reply `gh` calls). */
  pr: number;
  /** The batched, deduped, unaddressed comments this session must address (§6). */
  comments: readonly Comment[];
  /** The fully-composed actualize prompt (diff context + batched comments + rules). */
  prompt: string;
}

/** The tidy hook the sweep fires on a detected merge (§7 reconcile). Injectable. */
export type TidyHook = (bead: string, mergeSha: string | null) => Promise<void>;

/** Everything the real §6 sweep drives, injected so it stays fake-testable. */
export interface PrSweepDeps {
  /** The gh/PR view (owned PRs, fresh comments, merge detection). */
  prs: PrPort;
  /** Fresh-session spawner for actualize (§6). */
  actualize: ActualizeSession;
  /** Tidy hook fired on a detected merge (§7). */
  tidy: TidyHook;
  /**
   * The queue — the sweep only ever CLOSES a bead here (its merged bead, with the
   * merge SHA). Runtime single-writer for the daemon's own beads (§3.1).
   */
  queue: Pick<QueuePort, "close">;
  /** The branch prefix owned PRs must match (`config.branchPrefix`). */
  branchPrefix: string;
}

/**
 * Compose the fresh actualize session's prompt (§6): PR diff context + ALL the
 * unaddressed comments, batched (locks brief OQ3: batch per poll, keyed by comment
 * ids), and the standing rules — *address, push, reply to each comment via `gh`,
 * never merge*. Kept pure + deterministic so the spawn spec is unit-testable.
 *
 * The comments are already deduped + id-sorted by the caller (via
 * `prs.advanceComments`); we render them keyed by id so the session can reply to
 * each by id and a re-poll never double-replies.
 */
export function actualizePrompt(bead: string, pr: number, comments: readonly Comment[]): string {
  const lines = comments.map(
    (c) => `- [#${c.id} ${c.kind} by ${c.author}] ${c.body}`,
  );
  return [
    `You are a serve-v1 actualize worker for bead ${bead} (PR #${pr}).`,
    `A reviewer left new feedback on your open PR. Address ALL of the comments`,
    `below in this SAME worktree, then push. Reply to EACH comment via \`gh\``,
    `(keyed by its #id, so a re-poll never double-replies). Standing rules:`,
    `address every comment; commit + push the branch; reply to each comment via`,
    `\`gh\`; NEVER merge; never run tbd.`,
    `Unaddressed comments (batched this poll, keyed by id):`,
    ...lines,
  ].join("\n");
}

/**
 * Build the REAL §6 PR-sweep from injectable ports — the "PR-sweep first" step
 * the tick orders before any new claim. For each in-flight bead's owned PR:
 *
 *   1. MERGE FIRST — `prs.detectMerge`. Merged → fire the {@link TidyHook}
 *      (§7 reconcile: reap worktree/branch), then `queue.close(bead, "merged <sha>")`
 *      (the daemon closing a bead it manages at runtime), and RETIRE the bead from
 *      the returned in-flight set. No actualize on a merged PR.
 *   2. ELSE ACTUALIZE — `prs.freshComments` (ETag-conditioned, deduped by id via
 *      `advanceComments`). Any `fresh` comment → spawn ONE fresh session in the
 *      same worktree with the batched comments ({@link actualizePrompt}). A 304 /
 *      no-new-comment poll yields `fresh: []` → NO-OP (the free 304 path, §6). The
 *      bead stays in-flight.
 *
 * Beads with no owned PR (still building / PR not yet observed) pass through
 * unchanged. Returns the surviving in-flight set (merged beads removed) for the
 * tick's capacity check. Every effect is behind an injected port — no gh/git/
 * claude/tbd here — so the whole loop is proven against fakes.
 */
export function createPrSweep(deps: PrSweepDeps): PrSweep {
  return async (inFlight: InFlight[]): Promise<InFlight[]> => {
    const refs: InFlightRef[] = inFlight.map((f) => ({ bead: f.bead, branch: f.branch }));
    const owned = await deps.prs.ownedPrs(refs);
    const ownedByBead = new Map<string, OwnedPR>();
    for (const o of owned) ownedByBead.set(o.bead, o);

    const retired = new Set<string>();

    for (const f of inFlight) {
      const o = ownedByBead.get(f.bead);
      if (o === undefined) continue; // no owned PR yet — still building; skip.

      // 1. Merge detection FIRST (§6). A merged PR is terminal — tidy + close +
      //    retire; never actualize a PR that already landed.
      const merge = await deps.prs.detectMerge(o.pr);
      if (merge.merged) {
        await deps.tidy(f.bead, merge.sha);
        deps.queue.close(f.bead, `merged ${merge.sha ?? "(sha unknown)"}`);
        retired.add(f.bead);
        continue;
      }

      // 2. Actualize (§6). Poll comments deduped-by-id; a 304/no-new poll → no-op.
      const { fresh } = await deps.prs.freshComments(o);
      if (fresh.length === 0) continue; // 304 / nothing new — the free path.

      await deps.actualize({
        bead: f.bead,
        worktree: f.worktree,
        pr: o.pr.number,
        comments: fresh,
        prompt: actualizePrompt(f.bead, o.pr.number, fresh),
      });
    }

    // The surviving in-flight set: merged beads retired, everything else kept.
    return inFlight.filter((f) => !retired.has(f.bead));
  };
}

/**
 * The route seam (spec §4 step 5, §5.1). Decides which lane a freshly-claimed
 * bead goes to (and may bounce it back to the board). The default now delegates
 * to the REAL `router.ts` (kind:* → lane, bounce on missing-kind / needs-spec);
 * tests still inject a fake to drive specific arms.
 */
export type Router = (bead: Bead, config: Config) => RouteDecision;

/** The outcome of routing a claimed bead (§5.1). */
export interface RouteDecision {
  /** Chosen lane, or `null` when the bead is bounced back to the board. */
  lane: Lane_ | null;
  /** The resolved lane config, or `null` on a bounce. */
  laneConfig: Lane | null;
  /** The bounce reason (§3.1), or `null` on a route. Drives the re-label vs note. */
  bounceReason?: string | null;
}

/**
 * Default router: the REAL §5.1 decision (`router.route`) mapped into the tick's
 * {@link RouteDecision} shape. A `bounce` becomes `lane: null` carrying the reason
 * so the tick can drive `router.bounce` (re-apply `needs-spec` / note the gap).
 */
export const defaultRouter: Router = (bead, config) => {
  const decision = routeBead(bead);
  logOverride(bead, decision);
  if (decision.action === "bounce") {
    return { lane: null, laneConfig: null, bounceReason: decision.reason };
  }
  return { lane: decision.lane, laneConfig: config.lanes[decision.lane], bounceReason: null };
};

/**
 * @deprecated Retained as a named seam for tests that want the pre-router stub
 * (route everything to `quick`, never bounce). Production uses {@link defaultRouter}.
 */
export const stubRouter: Router = (_bead, config) => ({
  lane: "quick",
  laneConfig: config.lanes.quick,
  bounceReason: null,
});

/** Everything one tick needs, injected so the orchestration is pure + testable. */
export interface TickDeps {
  queue: QueuePort;
  config: Config;
  /** The current observability state (truth lives in tbd/git/gh, not here). */
  state: State;
  /** Clock for stamping `lastTick`. Defaults to {@link systemClock}. */
  clock?: Clock;
  /** PR-sweep seam (step 1). Defaults to {@link noopPrSweep}. */
  sweepPrs?: PrSweep;
  /** Route seam (step 5). Defaults to {@link defaultRouter}. */
  route?: Router;
  /**
   * Dispatch seam (step 6, §5.2): worktree + headless session + PR. When ABSENT
   * the tick stops after routing (claim → route only), leaving dispatch to the
   * caller — the pre-sub-35nn contract. When INJECTED, the tick runs the real
   * chain and applies the §5.2 observed-success / retry-once-then-bounce policy.
   */
  dispatch?: Dispatch;
}

/** Why a tick stopped short of claiming — surfaced for observability/tests. */
export type TickStop = "at-capacity" | "empty-queue" | "bounced";

/** What the dispatch of the claimed bead resolved to this cycle (§5.2). */
export type DispatchOutcome =
  /** Branch pushed ∧ PR open: bead stamped `in-review` with the url. */
  | { status: "in-review"; prUrl: string }
  /** Session exited without a PR, first failure: claim HELD, retry next tick. */
  | { status: "held-retry"; logPath: string }
  /** Second failure: claim released, bounced with the failure note. */
  | { status: "bounced-failed"; logPath: string };

/** The outcome of one poll cycle. `state` is the new observability snapshot. */
export interface TickResult {
  /** The updated observability state (new `lastTick`, unchanged inFlight here). */
  state: State;
  /** The bead claimed this cycle, or `null` if none was (stopped short). */
  claimed: Bead | null;
  /** The lane it was routed to, or `null` if not claimed / bounced. */
  routedTo: Lane_ | null;
  /** Present when the cycle stopped before claiming; `null` when it claimed. */
  stopReason: TickStop | null;
  /**
   * The dispatch outcome (§5.2), or `null` when no dispatch ran this cycle
   * (no dispatch seam injected, or the bead was bounced at routing).
   */
  dispatch: DispatchOutcome | null;
}

/**
 * Marker label the tick stamps when a lane fails its FIRST dispatch (§5.2). Its
 * presence on a claimed bead means "already retried once" — the next `no-pr`
 * bounces instead of holding. Observable in tbd, so it survives a crash (§7).
 */
export const RETRIED_LABEL = "serve:retried";

/**
 * Run ONE poll cycle (spec §4). Pure orchestration over injected adapters:
 * returns a new {@link TickResult}; the caller persists `result.state`. Ordering
 * is fixed by §4 and crash-idempotent:
 *
 *   1. Sweep owned PRs first (PR work outranks new claims).
 *   2. Capacity check — stop if `inFlight >= concurrency`.
 *   3. Discover — FIFO groomed+open beads, `needs-spec` excluded (queue.list).
 *   4. Claim the head bead (the committing step; tbd becomes the truth).
 *   5. Route (§5.1) — a bounce releases the claim immediately (`router.bounce`).
 *   6. Dispatch (§5.2) — worktree + headless session + PR; on the observed
 *      outcome, stamp `in-review` (PR open), or apply retry-once-then-bounce.
 *      Only runs when a `dispatch` seam is injected; else the tick stops at route
 *      (pre-sub-35nn contract) and the caller dispatches.
 *
 * Async because dispatch shells out. `state.lastTick` always advances; `inFlight`
 * reflects the post-sweep set. This function never touches the filesystem, tbd,
 * or the wall clock directly — all of that is behind the injected ports.
 */
export async function tick(deps: TickDeps): Promise<TickResult> {
  const clock = deps.clock ?? systemClock;
  const sweepPrs = deps.sweepPrs ?? noopPrSweep;
  const route = deps.route ?? defaultRouter;

  // Step 1 — Sweep owned PRs FIRST (§4.1). PR work outranks new claims. The
  // sweep may retire in-flight beads (merged → tidy + close) or leave them
  // (actualize new comments in-place); we take its result as the authoritative
  // post-sweep inFlight set for the capacity check below. `await` because the
  // real §6 sweep ({@link createPrSweep}) shells out; the no-op default is sync.
  const inFlight = await sweepPrs(deps.state.inFlight);

  // The new observability snapshot. `lastTick` always advances so a stalled
  // daemon is visible in `status`. Truth still lives in {tbd, git, gh}.
  const nextState: State = {
    ...deps.state,
    inFlight,
    lastTick: clock.nowIso(),
  };

  // Step 2 — Capacity check (§4.2). Stop before discovering if we're full.
  if (inFlight.length >= deps.config.concurrency) {
    return { state: nextState, claimed: null, routedTo: null, stopReason: "at-capacity", dispatch: null };
  }

  // Step 3 — Discover (§4.3). The queue adapter already applies groomed+open,
  // excludes `needs-spec`, and sorts FIFO by ULID — the head is the oldest.
  const board = deps.queue.list();
  const head = board[0];
  if (!head) {
    return { state: nextState, claimed: null, routedTo: null, stopReason: "empty-queue", dispatch: null };
  }

  // Step 4 — Claim the head bead (§4.4, §3.1 groomed → claimed). This is the
  // committing step: after it, tbd shows the bead in_progress+assigned and off
  // the board. A crash immediately after this leaves that truth for boot-reap.
  deps.queue.claim(head.id);

  // Step 5 — Route (§4.5, §5.1). A bounce (lane === null) releases the claim
  // NOW via `router.bounce` (re-apply `needs-spec` / note the grooming gap).
  const decision = route(head, deps.config);
  if (decision.lane === null) {
    bounce(bounceAdapter(deps.queue), head, decision.bounceReason ?? "needs-groom: missing kind");
    return { state: nextState, claimed: head, routedTo: null, stopReason: "bounced", dispatch: null };
  }

  const lane = decision.lane;

  // No dispatch seam injected → stop at route (pre-sub-35nn contract). The
  // caller owns dispatch; the routed bead is reported for it to pick up.
  if (!deps.dispatch) {
    return { state: nextState, claimed: head, routedTo: lane, stopReason: null, dispatch: null };
  }

  // Stamp the route label + prior-kind note (§3.1 claimed → routed) before the
  // build, so an owned-PR sweep can map the branch back even if dispatch crashes.
  deps.queue.stamp(head.id, {
    route: lane,
    note: `serve: routed ${lane}`,
  });

  // Step 6 — Dispatch (§4.6, §5.2). Success is OBSERVED (branch pushed ∧ PR
  // open), never self-reported. Apply the §5.2 failure policy on the result.
  const result = await deps.dispatch(head, lane as Route);
  const dispatch = applyDispatchPolicy(deps.queue, head, result);

  return { state: nextState, claimed: head, routedTo: lane, stopReason: null, dispatch };
}

/**
 * Apply the §5.2 observed-success / retry-once-then-bounce policy to a dispatch
 * result, driving the claim's fate through the queue — the single place the
 * failure policy lives:
 *
 *   - `pr-open`  → stamp `in-review` + `serve: PR <url>` (routed → in-review).
 *   - `no-pr`, first failure (no {@link RETRIED_LABEL}) → HOLD the claim, note
 *     `serve: lane failed (log <path>)`, add the retry marker → retried next tick.
 *   - `no-pr`, already retried → BOUNCE: release the claim + the failure note
 *     (via `router.bounce`), so the bead returns to the board with the reason.
 *
 * Pure over the injected queue — no git/gh/fs — so the policy is unit-testable.
 */
export function applyDispatchPolicy(
  queue: QueuePort,
  bead: Bead,
  result: DispatchResult,
): DispatchOutcome {
  if (result.status === "pr-open") {
    queue.stamp(bead.id, { inReview: true, note: `serve: PR ${result.prUrl}` });
    return { status: "in-review", prUrl: result.prUrl };
  }

  // no-pr (§5.2). Second failure (retry marker already present) → bounce.
  const failNote = `serve: lane failed (log ${result.logPath})`;
  if (bead.labels.includes(RETRIED_LABEL)) {
    bounce(bounceAdapter(queue), bead, failNote);
    return { status: "bounced-failed", logPath: result.logPath };
  }

  // First failure → hold the claim, note it, mark retried for next tick.
  queue.stamp(bead.id, { note: failNote });
  queue.addLabel(bead.id, RETRIED_LABEL);
  return { status: "held-retry", logPath: result.logPath };
}
