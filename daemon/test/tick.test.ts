// tick.test.ts — fixture/fake-driven tests for the one-poll-cycle orchestration
// (spec §4). We inject FAKE adapters (queue, clock, PR-sweep, router) rather than
// drive a real tbd repo: the tick is PURE orchestration, so fakes prove its logic
// — claim transition, FIFO head selection, capacity gate, PR-sweep-first ordering
// — faster and more precisely than a real fixture (queue.test.ts already proves
// the real tbd transitions the fake stands in for).

import { describe, it, expect } from "vitest";
import {
  tick,
  applyDispatchPolicy,
  RETRIED_LABEL,
  type QueuePort,
  type Clock,
  type Router,
  type PrSweep,
  type TickDeps,
} from "../src/tick.js";
import type { Dispatch } from "../src/triage.js";
import type { Bead, Route } from "../src/queue.js";
import { emptyState, type InFlight, type State } from "../src/state.js";
import { DEFAULT_CONFIG, type Config } from "../src/config.js";

/** Build a Bead with a ULID-ordered internalId derived from `seq`. */
function bead(seq: number, over: Partial<Bead> = {}): Bead {
  const ulid = `is-${String(seq).padStart(26, "0")}`;
  return {
    id: over.id ?? `fx-${seq}`,
    internalId: over.internalId ?? ulid,
    title: over.title ?? `bead ${seq}`,
    status: over.status ?? "open",
    // Default to a routable bead (kind:feature → quick lane under defaultRouter).
    labels: over.labels ?? ["groomed", "kind:feature"],
    assignee: over.assignee,
    ...over,
  };
}

/** Recorded queue mutation kinds for asserting the claim/route/dispatch span. */
type Call =
  | { op: "claim"; id: string }
  | { op: "stamp"; id: string; route?: Route; note?: string; inReview?: boolean }
  | { op: "release"; id: string }
  | { op: "addLabel"; id: string; label: string };

/**
 * A fake queue that records claims + mutations. `list()` returns the given beads
 * verbatim — the tick trusts the adapter's FIFO/exclusion contract (proven in
 * queue.test), so ordering here is asserted by controlling what the fake returns.
 */
function fakeQueue(
  initial: Bead[],
): QueuePort & { claimed: string[]; remaining: () => Bead[]; calls: Call[] } {
  let beads = [...initial];
  const claimed: string[] = [];
  const calls: Call[] = [];
  return {
    list: () => [...beads],
    claim: (id: string) => {
      claimed.push(id);
      calls.push({ op: "claim", id });
      // Mirror the real transition: a claimed bead leaves the board.
      beads = beads.filter((b) => b.id !== id);
    },
    stamp: (id, s) => calls.push({ op: "stamp", id, ...s }),
    release: (id) => calls.push({ op: "release", id }),
    addLabel: (id, label) => calls.push({ op: "addLabel", id, label }),
    claimed,
    remaining: () => [...beads],
    calls,
  };
}

/** A frozen clock — pins `lastTick` for deterministic assertions. */
const FIXED_ISO = "2026-07-22T12:00:00.000Z";
const fixedClock: Clock = { nowIso: () => FIXED_ISO };

/** A config with an explicit concurrency, else defaulted. */
function configWith(concurrency: number): Config {
  return { ...DEFAULT_CONFIG, concurrency };
}

/** One in-flight entry to fill capacity. */
function inFlight(bead: string): InFlight {
  return {
    bead,
    lane: "quick",
    worktree: `/wt/${bead}`,
    branch: `serve/${bead}`,
    pr: null,
    phase: "building",
    sessionPid: null,
    startedAt: FIXED_ISO,
  };
}

/** Base deps with the fixed clock; caller overrides queue/state/etc. */
function deps(over: Partial<TickDeps> & { queue: QueuePort }): TickDeps {
  return {
    config: configWith(1),
    state: emptyState(),
    clock: fixedClock,
    ...over,
  };
}

/** A dispatch mock that observes an open PR (§5.2 pr-open). */
function prOpenDispatch(prUrl = "https://gh/pr/1"): Dispatch {
  return async (_b, lane) => ({ status: "pr-open", prUrl, branch: `serve/${lane}` });
}
/** A dispatch mock that observes NO PR (§5.2 no-pr). */
function noPrDispatch(logPath = "/logs/x.1.log"): Dispatch {
  return async (_b, lane) => ({ status: "no-pr", logPath, branch: `serve/${lane}` });
}

describe("tick — one poll cycle (§4)", () => {
  it("claims the FIFO head and routes it (claim transition)", async () => {
    const q = fakeQueue([bead(1), bead(2), bead(3)]);
    // No dispatch seam → stop at route (pre-dispatch contract).
    const result = await tick(deps({ queue: q }));

    // The head (oldest ULID) is the one claimed.
    expect(q.claimed).toEqual(["fx-1"]);
    expect(result.claimed?.id).toBe("fx-1");
    // Claiming took it off the board (leaves-the-board transition, §3.1).
    expect(q.remaining().map((b) => b.id)).toEqual(["fx-2", "fx-3"]);
    // Default router (kind:feature) → quick lane.
    expect(result.routedTo).toBe("quick");
    expect(result.stopReason).toBeNull();
    expect(result.dispatch).toBeNull();
    // lastTick advanced to the injected clock's instant.
    expect(result.state.lastTick).toBe(FIXED_ISO);
  });

  it("selects the FIFO head even when list() order is respected", async () => {
    // The adapter guarantees FIFO; the tick must take element [0], not scan.
    const q = fakeQueue([bead(10), bead(20), bead(30)]);
    const result = await tick(deps({ queue: q }));
    expect(result.claimed?.id).toBe("fx-10");
    expect(q.claimed).toEqual(["fx-10"]);
  });

  it("respects capacity — stops before discovering when inFlight >= concurrency", async () => {
    const q = fakeQueue([bead(1)]);
    const state: State = { ...emptyState(), inFlight: [inFlight("busy-1")] };
    const result = await tick(deps({ queue: q, config: configWith(1), state }));

    // At capacity → no claim attempted at all.
    expect(q.claimed).toEqual([]);
    expect(result.claimed).toBeNull();
    expect(result.routedTo).toBeNull();
    expect(result.stopReason).toBe("at-capacity");
    // Board untouched.
    expect(q.remaining().map((b) => b.id)).toEqual(["fx-1"]);
  });

  it("respects capacity — claims when there is headroom (concurrency 2)", async () => {
    const q = fakeQueue([bead(1)]);
    const state: State = { ...emptyState(), inFlight: [inFlight("busy-1")] };
    const result = await tick(deps({ queue: q, config: configWith(2), state }));

    // One in flight, cap 2 → headroom → claim proceeds.
    expect(q.claimed).toEqual(["fx-1"]);
    expect(result.claimed?.id).toBe("fx-1");
    expect(result.stopReason).toBeNull();
  });

  it("stops on an empty queue without claiming", async () => {
    const q = fakeQueue([]);
    const result = await tick(deps({ queue: q }));
    expect(q.claimed).toEqual([]);
    expect(result.claimed).toBeNull();
    expect(result.stopReason).toBe("empty-queue");
    expect(result.state.lastTick).toBe(FIXED_ISO);
  });

  it("sweeps owned PRs BEFORE claiming (PR work outranks new claims, §4.1)", async () => {
    const order: string[] = [];
    const q = fakeQueue([bead(1)]);
    // Wrap claim to record ordering.
    const claim = q.claim;
    q.claim = (id: string) => {
      order.push("claim");
      claim(id);
    };
    const sweepPrs: PrSweep = (inFlightIn) => {
      order.push("sweep");
      return inFlightIn;
    };
    await tick(deps({ queue: q, sweepPrs }));

    expect(order).toEqual(["sweep", "claim"]);
  });

  it("uses the post-sweep inFlight set for the capacity check", async () => {
    // Sweep RETIRES the one in-flight bead (e.g. its PR merged) → headroom opens.
    const q = fakeQueue([bead(1)]);
    const state: State = { ...emptyState(), inFlight: [inFlight("merged-1")] };
    const sweepPrs: PrSweep = () => []; // everything retired
    const result = await tick(deps({ queue: q, config: configWith(1), state, sweepPrs }));

    // Post-sweep inFlight is empty → capacity available → claim proceeds.
    expect(q.claimed).toEqual(["fx-1"]);
    expect(result.state.inFlight).toEqual([]);
    expect(result.stopReason).toBeNull();
  });

  it("routes via the injected router seam (bounce releases the claim via router.bounce)", async () => {
    const q = fakeQueue([bead(1)]);
    const bouncing: Router = () => ({ lane: null, laneConfig: null, bounceReason: "needs-groom: missing kind" });
    const result = await tick(deps({ queue: q, route: bouncing }));

    // Claimed, then the bounce released the claim + noted the reason (§3.1).
    expect(q.claimed).toEqual(["fx-1"]);
    expect(q.calls).toContainEqual({ op: "release", id: "fx-1" });
    expect(result.routedTo).toBeNull();
    expect(result.stopReason).toBe("bounced");
    expect(result.dispatch).toBeNull();
  });

  it("re-applies needs-spec on a spec-lane bounce (router.bounce label path)", async () => {
    const q = fakeQueue([bead(1, { labels: ["groomed", "needs-spec"] })]);
    const bouncing: Router = () => ({ lane: null, laneConfig: null, bounceReason: "needs-spec" });
    await tick(deps({ queue: q, route: bouncing }));
    expect(q.calls).toContainEqual({ op: "release", id: "fx-1" });
    expect(q.calls).toContainEqual({ op: "addLabel", id: "fx-1", label: "needs-spec" });
  });

  it("routes to the lane the router chooses", async () => {
    const q = fakeQueue([bead(1)]);
    const toBug: Router = (_b, cfg) => ({ lane: "bug", laneConfig: cfg.lanes.bug, bounceReason: null });
    const result = await tick(deps({ queue: q, route: toBug }));
    expect(result.routedTo).toBe("bug");
    expect(result.stopReason).toBeNull();
  });
});

describe("tick — dispatch step 6 + §5.2 failure policy", () => {
  it("dispatches a routed bead and stamps in-review on an observed PR", async () => {
    const q = fakeQueue([bead(1)]);
    const result = await tick(deps({ queue: q, dispatch: prOpenDispatch("https://gh/pr/7") }));

    expect(result.routedTo).toBe("quick");
    // Route stamp, then in-review stamp with the PR url.
    expect(q.calls).toContainEqual({ op: "stamp", id: "fx-1", route: "quick", note: "serve: routed quick" });
    expect(q.calls).toContainEqual({ op: "stamp", id: "fx-1", inReview: true, note: "serve: PR https://gh/pr/7" });
    expect(result.dispatch).toEqual({ status: "in-review", prUrl: "https://gh/pr/7" });
  });

  it("first no-PR: HOLDS the claim, notes the failure, marks retried (retry next tick)", async () => {
    const q = fakeQueue([bead(1)]); // no RETRIED_LABEL yet
    const result = await tick(deps({ queue: q, dispatch: noPrDispatch("/logs/fx-1.1.log") }));

    expect(q.calls).toContainEqual({ op: "stamp", id: "fx-1", note: "serve: lane failed (log /logs/fx-1.1.log)" });
    expect(q.calls).toContainEqual({ op: "addLabel", id: "fx-1", label: RETRIED_LABEL });
    // Claim HELD — no release on the first failure.
    expect(q.calls.some((c) => c.op === "release")).toBe(false);
    expect(result.dispatch).toEqual({ status: "held-retry", logPath: "/logs/fx-1.1.log" });
  });

  it("second no-PR (already retried): BOUNCES with the failure note", async () => {
    // A bead that already carries the retry marker → second failure bounces.
    const q = fakeQueue([bead(1, { labels: ["groomed", "kind:feature", RETRIED_LABEL] })]);
    const result = await tick(deps({ queue: q, dispatch: noPrDispatch("/logs/fx-1.2.log") }));

    expect(q.calls).toContainEqual({ op: "release", id: "fx-1" });
    expect(q.calls).toContainEqual({
      op: "stamp",
      id: "fx-1",
      note: "serve: bounced (serve: lane failed (log /logs/fx-1.2.log))",
    });
    expect(result.dispatch).toEqual({ status: "bounced-failed", logPath: "/logs/fx-1.2.log" });
  });
});

describe("applyDispatchPolicy — §5.2 in isolation", () => {
  const b = bead(1);

  it("pr-open → stamp in-review + PR url", () => {
    const q = fakeQueue([]);
    const out = applyDispatchPolicy(q, b, { status: "pr-open", prUrl: "u", branch: "br" });
    expect(out).toEqual({ status: "in-review", prUrl: "u" });
    expect(q.calls).toContainEqual({ op: "stamp", id: b.id, inReview: true, note: "serve: PR u" });
  });

  it("first no-pr → held-retry (note + retry marker, no release)", () => {
    const q = fakeQueue([]);
    const out = applyDispatchPolicy(q, b, { status: "no-pr", logPath: "/l", branch: "br" });
    expect(out).toEqual({ status: "held-retry", logPath: "/l" });
    expect(q.calls.some((c) => c.op === "release")).toBe(false);
    expect(q.calls).toContainEqual({ op: "addLabel", id: b.id, label: RETRIED_LABEL });
  });

  it("retried no-pr → bounced-failed (release + note)", () => {
    const q = fakeQueue([]);
    const retried = bead(1, { labels: ["groomed", RETRIED_LABEL] });
    const out = applyDispatchPolicy(q, retried, { status: "no-pr", logPath: "/l", branch: "br" });
    expect(out).toEqual({ status: "bounced-failed", logPath: "/l" });
    expect(q.calls).toContainEqual({ op: "release", id: retried.id });
  });
});
