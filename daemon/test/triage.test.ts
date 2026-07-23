// triage.test.ts — fake-driven tests for the manual `substrate triage <bead-id>`
// verb (spec §3.2, Phase 3 Step 3.2). Triage SHARES the tick's claim → route path
// but for ONE named bead and with no poll. We inject a fake queue (structural
// TriageQueue) rather than drive a real tbd repo — queue.test.ts already proves
// the real transitions the fake stands in for, and router.test.ts proves the pure
// §5.1 decision; here we prove triage's ORCHESTRATION of a single named bead:
//   - resolve the named bead + claim it + stamp its route (the acceptance path),
//   - route by kind (feature/task → quick, bug → bug),
//   - bounce an un-routable bead back to the board (missing kind / needs-spec),
//   - not-found when the id is not on the board (no mutation),
//   - the injectable DISPATCH seam (stubbed for sub-fu3f) is invoked on a route.

import { describe, it, expect } from "vitest";
import {
  triage,
  parseArgs,
  formatOutcome,
  stubDispatch,
  type TriageQueue,
  type Dispatch,
} from "../src/triage.js";
import type { Bead, Route } from "../src/queue.js";

/** Build a groomed, board-ready {@link Bead} with the given labels. */
function bead(id: string, labels: string[], seq = 0): Bead {
  return {
    id,
    internalId: `is-${String(seq).padStart(26, "0")}`,
    title: `bead ${id}`,
    status: "open",
    labels: ["groomed", ...labels],
    assignee: undefined,
  };
}

/** Recorded mutation, in call order, for asserting the claim → route span. */
type Call =
  | { op: "claim"; id: string }
  | { op: "stamp"; id: string; route?: Route; note?: string; inReview?: boolean }
  | { op: "release"; id: string };

/**
 * A fake queue implementing the {@link TriageQueue} span. `list()` returns the
 * seeded board; every mutation is recorded so a test can assert exactly what triage
 * did (claim, then stamp OR release+stamp-note). `claim` mirrors the real transition
 * (bead leaves the board) so a re-list would not re-find it.
 */
function fakeQueue(board: Bead[]): TriageQueue & { calls: Call[] } {
  let beads = [...board];
  const calls: Call[] = [];
  return {
    calls,
    list: () => [...beads],
    claim(id) {
      calls.push({ op: "claim", id });
      beads = beads.filter((b) => b.id !== id);
    },
    stamp(id, s) {
      calls.push({ op: "stamp", id, ...s });
    },
    release(id) {
      calls.push({ op: "release", id });
    },
  };
}

describe("triage — claim + route ONE named bead now (§3.2, Step 3.2)", () => {
  it("claims + routes + stamps a kind:feature bead (acceptance path)", () => {
    const q = fakeQueue([bead("fx-a", ["kind:feature"])]);
    const outcome = triage("fx-a", { queue: q });

    // Claimed first (the committing step), then stamped route:quick + note.
    expect(q.calls[0]).toEqual({ op: "claim", id: "fx-a" });
    expect(q.calls[1]).toEqual({
      op: "stamp",
      id: "fx-a",
      route: "quick",
      note: "serve: routed quick (prior kind:feature)",
    });
    // Exactly claim + stamp — no bounce, no extra mutation.
    expect(q.calls).toHaveLength(2);

    expect(outcome).toEqual({
      status: "routed",
      bead: "fx-a",
      lane: "quick",
      priorKind: "feature",
    });
  });

  it("routes a kind:task bead to the quick lane", () => {
    const q = fakeQueue([bead("fx-t", ["kind:task"])]);
    const outcome = triage("fx-t", { queue: q });
    expect(outcome).toMatchObject({ status: "routed", lane: "quick" });
    expect(q.calls).toContainEqual({
      op: "stamp",
      id: "fx-t",
      route: "quick",
      note: "serve: routed quick (prior kind:task)",
    });
  });

  it("routes a kind:bug bead to the bug lane", () => {
    const q = fakeQueue([bead("fx-b", ["kind:bug"])]);
    const outcome = triage("fx-b", { queue: q });
    expect(outcome).toMatchObject({ status: "routed", lane: "bug", priorKind: "bug" });
    expect(q.calls[0]).toEqual({ op: "claim", id: "fx-b" });
    expect(q.calls[1]).toEqual({
      op: "stamp",
      id: "fx-b",
      route: "bug",
      note: "serve: routed bug (prior kind:bug)",
    });
  });

  it("bounces a missing-kind bead back to the board (claim then release + note)", () => {
    const q = fakeQueue([bead("fx-m", [])]); // groomed but no kind:*
    const outcome = triage("fx-m", { queue: q });

    // Claimed, then released with the grooming-gap reason as a note (§3.1 bounced).
    expect(q.calls[0]).toEqual({ op: "claim", id: "fx-m" });
    expect(q.calls[1]).toEqual({ op: "release", id: "fx-m" });
    expect(q.calls[2]).toEqual({
      op: "stamp",
      id: "fx-m",
      note: "serve: bounced (needs-groom: missing kind)",
    });
    expect(outcome).toEqual({
      status: "bounced",
      bead: "fx-m",
      reason: "needs-groom: missing kind",
    });
  });

  it("bounces a needs-spec bead back to the board (release + reason note)", () => {
    const q = fakeQueue([bead("fx-s", ["needs-spec", "kind:feature"])]);
    const outcome = triage("fx-s", { queue: q });

    expect(q.calls[0]).toEqual({ op: "claim", id: "fx-s" });
    expect(q.calls[1]).toEqual({ op: "release", id: "fx-s" });
    expect(q.calls[2]).toEqual({
      op: "stamp",
      id: "fx-s",
      note: "serve: bounced (needs-spec)",
    });
    expect(outcome).toMatchObject({ status: "bounced", reason: "needs-spec" });
  });

  it("reports not-found without mutating when the id is not on the board", () => {
    const q = fakeQueue([bead("fx-a", ["kind:feature"])]);
    const outcome = triage("fx-missing", { queue: q });
    expect(outcome).toEqual({ status: "not-found", bead: "fx-missing" });
    expect(q.calls).toEqual([]); // nothing claimed, nothing stamped
  });

  it("invokes the injected dispatch seam once, with the routed bead + lane", () => {
    const q = fakeQueue([bead("fx-d", ["kind:bug"])]);
    const dispatched: Array<{ id: string; lane: Route }> = [];
    const dispatch: Dispatch = (b, lane) => dispatched.push({ id: b.id, lane });

    triage("fx-d", { queue: q, dispatch });
    expect(dispatched).toEqual([{ id: "fx-d", lane: "bug" }]);
  });

  it("does NOT dispatch a bounced bead", () => {
    const q = fakeQueue([bead("fx-m", [])]);
    let dispatchCount = 0;
    const dispatch: Dispatch = () => {
      dispatchCount++;
    };
    triage("fx-m", { queue: q, dispatch });
    expect(dispatchCount).toBe(0);
  });

  it("the default dispatch stub is a no-op (sub-fu3f: dispatch deferred to sub-35nn)", () => {
    // Proves the seam's default does nothing observable — the triage verb's job in
    // this bead ends at claim + route + stamp; dispatch is stubbed.
    expect(stubDispatch(bead("fx-x", ["kind:feature"]), "quick")).toBeUndefined();
  });
});

describe("triage — argv shell", () => {
  it("parses a bare bead id, defaulting --repo to cwd", () => {
    const parsed = parseArgs(["fx-a"]);
    expect(parsed).toEqual({ bead: "fx-a", repo: process.cwd() });
  });

  it("parses --repo alongside the positional bead id (either order)", () => {
    expect(parseArgs(["--repo", "/tmp/board", "fx-a"])).toEqual({
      bead: "fx-a",
      repo: "/tmp/board",
    });
    expect(parseArgs(["fx-a", "--repo", "/tmp/board"])).toEqual({
      bead: "fx-a",
      repo: "/tmp/board",
    });
  });

  it("returns null for --help and when no bead id is given", () => {
    expect(parseArgs(["--help"])).toBeNull();
    expect(parseArgs(["-h"])).toBeNull();
    expect(parseArgs(["--repo", "/tmp/board"])).toBeNull(); // no positional
    expect(parseArgs([])).toBeNull();
  });

  it("formats each outcome as one concise result line", () => {
    expect(
      formatOutcome({ status: "routed", bead: "fx-a", lane: "quick", priorKind: "feature" }),
    ).toBe("triage: fx-a → route:quick (prior kind:feature)");
    expect(
      formatOutcome({ status: "bounced", bead: "fx-m", reason: "needs-groom: missing kind" }),
    ).toBe("triage: fx-m bounced — needs-groom: missing kind");
    expect(formatOutcome({ status: "not-found", bead: "fx-x" })).toContain("not on the board");
  });
});
