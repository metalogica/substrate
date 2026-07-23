// tick.test.ts — fixture/fake-driven tests for the one-poll-cycle orchestration
// (spec §4). We inject FAKE adapters (queue, clock, PR-sweep, router) rather than
// drive a real tbd repo: the tick is PURE orchestration, so fakes prove its logic
// — claim transition, FIFO head selection, capacity gate, PR-sweep-first ordering
// — faster and more precisely than a real fixture (queue.test.ts already proves
// the real tbd transitions the fake stands in for).

import { describe, it, expect } from "vitest";
import {
  tick,
  type QueuePort,
  type Clock,
  type Router,
  type PrSweep,
  type TickDeps,
} from "../src/tick.js";
import type { Bead } from "../src/queue.js";
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
    labels: over.labels ?? ["groomed"],
    assignee: over.assignee,
    ...over,
  };
}

/**
 * A fake queue that records claims. `list()` returns the given beads verbatim —
 * the tick trusts the adapter's FIFO/exclusion contract (proven in queue.test),
 * so ordering here is asserted by controlling what the fake returns.
 */
function fakeQueue(initial: Bead[]): QueuePort & { claimed: string[]; remaining: () => Bead[] } {
  let beads = [...initial];
  const claimed: string[] = [];
  return {
    list: () => [...beads],
    claim: (id: string) => {
      claimed.push(id);
      // Mirror the real transition: a claimed bead leaves the board.
      beads = beads.filter((b) => b.id !== id);
    },
    claimed,
    remaining: () => [...beads],
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

describe("tick — one poll cycle (§4)", () => {
  it("claims the FIFO head and routes it (claim transition)", () => {
    const q = fakeQueue([bead(1), bead(2), bead(3)]);
    const result = tick(deps({ queue: q }));

    // The head (oldest ULID) is the one claimed.
    expect(q.claimed).toEqual(["fx-1"]);
    expect(result.claimed?.id).toBe("fx-1");
    // Claiming took it off the board (leaves-the-board transition, §3.1).
    expect(q.remaining().map((b) => b.id)).toEqual(["fx-2", "fx-3"]);
    // Default stub router → quick lane.
    expect(result.routedTo).toBe("quick");
    expect(result.stopReason).toBeNull();
    // lastTick advanced to the injected clock's instant.
    expect(result.state.lastTick).toBe(FIXED_ISO);
  });

  it("selects the FIFO head even when list() order is respected", () => {
    // The adapter guarantees FIFO; the tick must take element [0], not scan.
    const q = fakeQueue([bead(10), bead(20), bead(30)]);
    const result = tick(deps({ queue: q }));
    expect(result.claimed?.id).toBe("fx-10");
    expect(q.claimed).toEqual(["fx-10"]);
  });

  it("respects capacity — stops before discovering when inFlight >= concurrency", () => {
    const q = fakeQueue([bead(1)]);
    const state: State = { ...emptyState(), inFlight: [inFlight("busy-1")] };
    const result = tick(deps({ queue: q, config: configWith(1), state }));

    // At capacity → no claim attempted at all.
    expect(q.claimed).toEqual([]);
    expect(result.claimed).toBeNull();
    expect(result.routedTo).toBeNull();
    expect(result.stopReason).toBe("at-capacity");
    // Board untouched.
    expect(q.remaining().map((b) => b.id)).toEqual(["fx-1"]);
  });

  it("respects capacity — claims when there is headroom (concurrency 2)", () => {
    const q = fakeQueue([bead(1)]);
    const state: State = { ...emptyState(), inFlight: [inFlight("busy-1")] };
    const result = tick(deps({ queue: q, config: configWith(2), state }));

    // One in flight, cap 2 → headroom → claim proceeds.
    expect(q.claimed).toEqual(["fx-1"]);
    expect(result.claimed?.id).toBe("fx-1");
    expect(result.stopReason).toBeNull();
  });

  it("stops on an empty queue without claiming", () => {
    const q = fakeQueue([]);
    const result = tick(deps({ queue: q }));
    expect(q.claimed).toEqual([]);
    expect(result.claimed).toBeNull();
    expect(result.stopReason).toBe("empty-queue");
    expect(result.state.lastTick).toBe(FIXED_ISO);
  });

  it("sweeps owned PRs BEFORE claiming (PR work outranks new claims, §4.1)", () => {
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
    tick(deps({ queue: q, sweepPrs }));

    expect(order).toEqual(["sweep", "claim"]);
  });

  it("uses the post-sweep inFlight set for the capacity check", () => {
    // Sweep RETIRES the one in-flight bead (e.g. its PR merged) → headroom opens.
    const q = fakeQueue([bead(1)]);
    const state: State = { ...emptyState(), inFlight: [inFlight("merged-1")] };
    const sweepPrs: PrSweep = () => []; // everything retired
    const result = tick(deps({ queue: q, config: configWith(1), state, sweepPrs }));

    // Post-sweep inFlight is empty → capacity available → claim proceeds.
    expect(q.claimed).toEqual(["fx-1"]);
    expect(result.state.inFlight).toEqual([]);
    expect(result.stopReason).toBeNull();
  });

  it("routes via the injected router seam (bounce releases: lane null)", () => {
    const q = fakeQueue([bead(1)]);
    const bouncing: Router = () => ({ lane: null, laneConfig: null });
    const result = tick(deps({ queue: q, route: bouncing }));

    // Still claimed (the bounce release of the claim is a later-bead concern),
    // but routedTo is null and the stop reason is `bounced`.
    expect(q.claimed).toEqual(["fx-1"]);
    expect(result.routedTo).toBeNull();
    expect(result.stopReason).toBe("bounced");
  });

  it("routes to the lane the router chooses", () => {
    const q = fakeQueue([bead(1)]);
    const toBug: Router = (_b, cfg) => ({ lane: "bug", laneConfig: cfg.lanes.bug });
    const result = tick(deps({ queue: q, route: toBug }));
    expect(result.routedTo).toBe("bug");
    expect(result.stopReason).toBeNull();
  });
});
