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
 * runs FIRST every cycle. The real sweep (actualize comments, tidy merges) lands
 * in a LATER bead; for now this is an injectable placeholder that returns the
 * (possibly updated) inFlight set. Tests inject a spy to prove ordering; the
 * default is a no-op pass-through.
 *
 * TODO(serve-v1, later bead): replace the default with the real §6 sweep —
 * comment actualization + merge tidy driven off `prs.ts`.
 */
export type PrSweep = (inFlight: InFlight[]) => InFlight[];

/** Default PR-sweep: a no-op pass-through until the real §6 sweep lands. */
export const noopPrSweep: PrSweep = (inFlight) => inFlight;

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
  // sweep may retire in-flight beads (merged) or leave them; we take its result
  // as the authoritative post-sweep inFlight set for the capacity check below.
  const inFlight = sweepPrs(deps.state.inFlight);

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
