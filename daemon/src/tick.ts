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

import type { Bead } from "./queue.js";
import type { InFlight, State } from "./state.js";
import type { Config, Lane } from "./config.js";

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
 * bead goes to (and, in the full design, may bounce it back to the board). The
 * real router — `router.ts`, wired in a LATER bead — inspects `kind:*` labels
 * and the config lanes. For now this is an injectable STUB; the default routes
 * every claimed bead to the `quick` lane and never bounces.
 *
 * TODO(serve-v1, later bead): replace the default with the real `router.ts`
 * (kind:* → lane mapping, prior-override logging, bounce-on-missing-kind).
 */
export type Router = (bead: Bead, config: Config) => RouteDecision;

/** The outcome of routing a claimed bead (§5.1). */
export interface RouteDecision {
  /** Chosen lane, or `null` when the bead is bounced back to the board. */
  lane: Lane_ | null;
  /** The resolved lane config, or `null` on a bounce. */
  laneConfig: Lane | null;
}

/** Default router STUB: route everything to `quick`, never bounce (§5.1 later). */
export const stubRouter: Router = (_bead, config) => ({
  lane: "quick",
  laneConfig: config.lanes.quick,
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
  /** Route seam (step 5). Defaults to {@link stubRouter}. */
  route?: Router;
}

/** Why a tick stopped short of claiming — surfaced for observability/tests. */
export type TickStop = "at-capacity" | "empty-queue" | "bounced";

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
}

/**
 * Run ONE poll cycle (spec §4). Pure orchestration over injected adapters:
 * returns a new {@link TickResult}; the caller persists `result.state` and
 * dispatches `result.claimed`. Ordering is fixed by §4 and crash-idempotent:
 *
 *   1. Sweep owned PRs first (PR work outranks new claims).
 *   2. Capacity check — stop if `inFlight >= concurrency`.
 *   3. Discover — FIFO groomed+open beads, `needs-spec` excluded (queue.list).
 *   4. Claim the head bead (the committing step; tbd becomes the truth).
 *   5. Route — stub for now; a bounce releases the claim (later bead wires it).
 *
 * The returned `state.lastTick` is always advanced; `inFlight` reflects the
 * post-sweep set. This function never touches the filesystem, tbd, or the wall
 * clock directly — all of that is behind the injected ports.
 */
export function tick(deps: TickDeps): TickResult {
  const clock = deps.clock ?? systemClock;
  const sweepPrs = deps.sweepPrs ?? noopPrSweep;
  const route = deps.route ?? stubRouter;

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
    return {
      state: nextState,
      claimed: null,
      routedTo: null,
      stopReason: "at-capacity",
    };
  }

  // Step 3 — Discover (§4.3). The queue adapter already applies groomed+open,
  // excludes `needs-spec`, and sorts FIFO by ULID — the head is the oldest.
  const board = deps.queue.list();
  const head = board[0];
  if (!head) {
    return {
      state: nextState,
      claimed: null,
      routedTo: null,
      stopReason: "empty-queue",
    };
  }

  // Step 4 — Claim the head bead (§4.4, §3.1 groomed → claimed). This is the
  // committing step: after it, tbd shows the bead in_progress+assigned and off
  // the board. A crash immediately after this leaves that truth for boot-reap.
  deps.queue.claim(head.id);

  // Step 5 — Route (§4.5, §5.1). STUB for now (real router.ts lands later). A
  // bounce (lane === null) releases the claim; the dispatch of a routed bead is
  // step 6, owned by the caller / a later bead.
  const decision = route(head, deps.config);
  if (decision.lane === null) {
    return {
      state: nextState,
      claimed: head,
      routedTo: null,
      stopReason: "bounced",
    };
  }

  return {
    state: nextState,
    claimed: head,
    routedTo: decision.lane,
    stopReason: null,
  };
}
