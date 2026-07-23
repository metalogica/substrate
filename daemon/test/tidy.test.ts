// tidy.test.ts — the reconcile-from-observed-truth reaper (spec §7).
//
// tidy's whole contract is crash recovery: from OBSERVED truth ({tbd, git, gh})
// alone, make the world consistent and rewrite state.json. These tests drive
// `reconcile` against injected fakes (no real git/gh/tbd) and prove the three
// load-bearing behaviours:
//   1. orphan-release   — an assignee=serve/in_progress bead with no worktree
//                          and no PR is released back to the board.
//   2. merged-reap      — a worktree whose PR is merged/closed is reaped.
//   3. truth-rewrite    — the rebuilt state.json is derived from the observed
//                          inputs, NOT reconstructed from any prior state.json.

import { describe, it, expect } from "vitest";
import {
  reconcile,
  type TidyDeps,
  type Observed,
  type ObservedWorktree,
  type QueueAdapter,
  type WorktreeAdapter,
  type PrAdapter,
  type StateAdapter,
} from "../src/tidy.js";
import { SCHEMA_VERSION, type State } from "../src/state.js";
import type { WorktreePlan } from "../src/worktree.js";

// ── Fakes: record every side effect; answer gh questions from a table ────────

function fakeQueue(): QueueAdapter & { released: string[] } {
  const released: string[] = [];
  return {
    released,
    release(beadId: string): void {
      released.push(beadId);
    },
  };
}

function fakeWorktree(): WorktreeAdapter & { reaped: WorktreePlan[] } {
  const reaped: WorktreePlan[] = [];
  return {
    reaped,
    async reap(plan: WorktreePlan): Promise<void> {
      reaped.push(plan);
    },
  };
}

/** gh view driven by two per-bead lookup tables (open PR? / merged-or-closed?). */
function fakePrs(tables: {
  openPR?: Record<string, boolean>;
  mergedOrClosed?: Record<string, boolean>;
}): PrAdapter {
  const openPR = tables.openPR ?? {};
  const mergedOrClosed = tables.mergedOrClosed ?? {};
  return {
    async hasOpenPR(beadId: string): Promise<boolean> {
      return openPR[beadId] ?? false;
    },
    async isMergedOrClosed(beadId: string): Promise<boolean> {
      return mergedOrClosed[beadId] ?? false;
    },
  };
}

function fakeState(): StateAdapter & { written: State[] } {
  const written: State[] = [];
  return {
    written,
    write(state: State): void {
      written.push(state);
    },
  };
}

/** Assemble a fake dep bundle plus handles to inspect each collaborator. */
function makeDeps(prs: PrAdapter): {
  deps: TidyDeps;
  queue: QueueAdapter & { released: string[] };
  worktree: WorktreeAdapter & { reaped: WorktreePlan[] };
  state: StateAdapter & { written: State[] };
} {
  const queue = fakeQueue();
  const worktree = fakeWorktree();
  const state = fakeState();
  return { deps: { queue, worktree, prs, state }, queue, worktree, state };
}

/** A worktree observed on disk for `bead`, under the sibling serve root. */
function observedWorktree(bead: string): ObservedWorktree {
  const plan: WorktreePlan = {
    path: `/repo-serve/${bead}`,
    branch: `serve/${bead}-slug`,
  };
  return { bead, plan };
}

// A frozen clock so rebuilt timestamps are assertable.
const FIXED = "2026-07-23T00:00:00.000Z";
const now = (): string => FIXED;

describe("tidy.reconcile — §7", () => {
  it("releases an orphan claim (assignee=serve, no worktree, no PR)", async () => {
    // tbd observes a claim; git observes NO worktree; gh observes NO PR.
    const prs = fakePrs({}); // every bead: no open PR, not merged/closed
    const { deps, queue, worktree } = makeDeps(prs);
    const observed: Observed = {
      worktrees: [],
      claims: [{ bead: "sub-orph" }],
    };

    const result = await reconcile(deps, observed, { now });

    // The claim is released back to the board; nothing to reap (no worktree).
    expect(queue.released).toEqual(["sub-orph"]);
    expect(worktree.reaped).toEqual([]);
    expect(result.actions).toEqual([
      { kind: "release-orphan-claim", bead: "sub-orph" },
    ]);
    // The released bead does not survive into the rebuilt in-flight roster.
    expect(result.state.inFlight).toEqual([]);
    expect(result.state.bounced).toEqual(["sub-orph"]);
  });

  it("does NOT release an orphan-looking claim that still has an open PR", async () => {
    // Guard: a claim with no local worktree but a live PR is in-review — leave it.
    const prs = fakePrs({ openPR: { "sub-rev": true } });
    const { deps, queue } = makeDeps(prs);
    const observed: Observed = { worktrees: [], claims: [{ bead: "sub-rev" }] };

    const result = await reconcile(deps, observed, { now });

    expect(queue.released).toEqual([]);
    expect(result.actions).toEqual([]);
  });

  it("reaps a worktree whose PR is merged/closed (no release — the work landed)", async () => {
    const prs = fakePrs({ mergedOrClosed: { "sub-done": true } });
    const { deps, queue, worktree } = makeDeps(prs);
    const wt = observedWorktree("sub-done");
    const observed: Observed = { worktrees: [wt], claims: [] };

    const result = await reconcile(deps, observed, { now });

    // Worktree reaped; claim NOT released (in-review→closed handles the claim).
    expect(worktree.reaped).toEqual([wt.plan]);
    expect(queue.released).toEqual([]);
    expect(result.actions).toEqual([
      { kind: "reap-merged", bead: "sub-done" },
    ]);
    // A reaped-merged bead does not survive as in-flight.
    expect(result.state.inFlight).toEqual([]);
  });

  it("reaps AND releases a stranded worktree (no live entry, no open PR)", async () => {
    // Crash between dispatch and PR: worktree on disk, no PR, no live session.
    const prs = fakePrs({}); // no open PR, not merged
    const { deps, queue, worktree } = makeDeps(prs);
    const wt = observedWorktree("sub-strand");
    const observed: Observed = {
      worktrees: [wt],
      claims: [{ bead: "sub-strand" }],
    };

    const result = await reconcile(deps, observed, { now });

    expect(worktree.reaped).toEqual([wt.plan]);
    expect(queue.released).toEqual(["sub-strand"]);
    expect(result.actions).toEqual([
      { kind: "reap-orphan-worktree", bead: "sub-strand" },
    ]);
    // Released → not counted twice by the step-2 claim sweep, and not in-flight.
    expect(result.state.inFlight).toEqual([]);
    expect(result.state.bounced).toEqual(["sub-strand"]);
  });

  it("keeps a live worktree with an open PR (marks it in-review)", async () => {
    const prs = fakePrs({ openPR: { "sub-live": true } });
    const { deps, queue, worktree } = makeDeps(prs);
    const wt = observedWorktree("sub-live");
    const observed: Observed = {
      worktrees: [wt],
      claims: [{ bead: "sub-live" }],
    };

    const result = await reconcile(deps, observed, { now });

    expect(worktree.reaped).toEqual([]);
    expect(queue.released).toEqual([]);
    const [entry] = result.state.inFlight;
    expect(entry).toBeDefined();
    expect(entry!.bead).toBe("sub-live");
    expect(entry!.phase).toBe("in-review");
    expect(entry!.branch).toBe(wt.plan.branch);
    expect(entry!.worktree).toBe(wt.plan.path);
  });

  it("rebuilds state.json from OBSERVED truth, not from a prior state.json", async () => {
    // The prior state claims TWO in-flight beads and a bounced+events history.
    // We hand reconcile a DIFFERENT observed world; the rewrite must reflect the
    // observation, with zero leakage of the prior state's contents.
    const priorState: State = {
      schemaVersion: SCHEMA_VERSION,
      lastTick: "1999-01-01T00:00:00.000Z",
      inFlight: [
        {
          bead: "sub-ghost1",
          lane: "quick",
          worktree: "/stale/ghost1",
          branch: "serve/sub-ghost1",
          pr: "https://example/pr/1",
          phase: "in-review",
          sessionPid: 111,
          startedAt: "1999-01-01T00:00:00.000Z",
        },
        {
          bead: "sub-ghost2",
          lane: "bug",
          worktree: "/stale/ghost2",
          branch: "serve/sub-ghost2",
          pr: null,
          phase: "building",
          sessionPid: 222,
          startedAt: "1999-01-01T00:00:00.000Z",
        },
      ],
      bounced: ["sub-oldbounce"],
      recentEvents: ["ancient: do not resurrect me"],
    };

    // Observed truth: exactly ONE building worktree, `sub-real`, with an open PR.
    const prs = fakePrs({ openPR: { "sub-real": true } });
    const { deps, state } = makeDeps(prs);
    const wt = observedWorktree("sub-real");
    const observed: Observed = {
      worktrees: [wt],
      claims: [{ bead: "sub-real" }],
    };

    // reconcile is NOT given priorState — it has no channel to read it. We prove
    // the output depends only on `observed` by asserting none of the prior
    // ghosts appear and every field is derived from the observation.
    const result = await reconcile(deps, observed, { now });

    // Exactly the observed bead is in-flight; both ghosts are gone.
    expect(result.state.inFlight.map((f) => f.bead)).toEqual(["sub-real"]);
    const ids = new Set(result.state.inFlight.map((f) => f.bead));
    expect(ids.has("sub-ghost1")).toBe(false);
    expect(ids.has("sub-ghost2")).toBe(false);

    // Prior bounced/events are NOT carried forward — this is a fresh derivation.
    expect(result.state.bounced).not.toContain("sub-oldbounce");
    expect(result.state.recentEvents).not.toContain(
      "ancient: do not resurrect me",
    );

    // Timestamps come from the injected clock, not the prior lastTick.
    expect(result.state.lastTick).toBe(FIXED);
    expect(result.state.lastTick).not.toBe(priorState.lastTick);
    expect(result.state.schemaVersion).toBe(SCHEMA_VERSION);

    // The rebuilt entry's fields are derived from the observed worktree + gh.
    const [entry] = result.state.inFlight;
    expect(entry!.worktree).toBe(wt.plan.path);
    expect(entry!.branch).toBe(wt.plan.branch);
    expect(entry!.phase).toBe("in-review"); // open PR observed
    expect(entry!.startedAt).toBe(FIXED);

    // And it was actually persisted via the injected state writer, exactly once.
    expect(state.written).toHaveLength(1);
    expect(state.written[0]).toEqual(result.state);
  });
});
