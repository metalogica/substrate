// pipeline-render.test.ts — the shared aerial renderer (§3.2), the events ledger
// (§3.2b), and the boot-reap consistency drill at fixture level (§7).
//
// Three load-bearing behaviours proven headlessly (no real git/tbd/gh/claude):
//   1. renderer     — a golden snapshot of the aerial view + the staleness warning.
//   2. events       — the JSONL line shape (§3.2b), optional fields dropped.
//   3. boot-reap    — kill-9-mid-build → restart → reconcile yields a consistent
//                     board/state: the stranded worktree is reaped + released and
//                     the rewritten state has no ghost in-flight entry.

import { describe, it, expect } from "vitest";

import {
  renderPipeline,
  tickHealthLine,
  type PipelineSnapshot,
} from "../src/pipeline-render.js";
import { snapshotFromState, EMPTY_FACTS } from "../src/status.js";
import {
  serializeEvent,
  createEventWriter,
  type ServeEvent,
  type EventWriter,
} from "../src/events.js";
import { bootReap } from "../src/serve.js";
import {
  reconcile,
  type Observed,
  type ObservedWorktree,
  type QueueAdapter,
  type WorktreeAdapter,
  type PrAdapter,
  type StateAdapter,
} from "../src/tidy.js";
import { SCHEMA_VERSION, type State } from "../src/state.js";
import type { WorktreePlan } from "../src/worktree.js";

// ── 1. Renderer snapshot (§3.2) ──────────────────────────────────────────────

/** A fully-populated snapshot with a FRESH tick (well within 2× the interval). */
function freshSnapshot(): PipelineSnapshot {
  return {
    board: ["sub-aaaa", "sub-bbbb"],
    claimed: ["sub-cccc"],
    building: ["sub-dddd"],
    inReview: ["sub-eeee"],
    merged: ["sub-ffff"],
    bounced: ["sub-gggg"],
    lastTick: "2026-07-22T12:00:00.000Z",
    pollIntervalSec: 60,
    now: "2026-07-22T12:00:30.000Z", // 30s after last tick — fresh (< 120s)
  };
}

describe("renderPipeline (aerial view, §3.2)", () => {
  it("renders the five stations, the bounced row, and a fresh tick line (golden)", () => {
    expect(renderPipeline(freshSnapshot())).toMatchInlineSnapshot(`
      "serve — aerial pipeline (§3.2)
      ──────────────────────────────
      board        │ sub-aaaa sub-bbbb
      claimed      │ sub-cccc
      building     │ sub-dddd
      in-review    │ sub-eeee
      merged (24h) │ sub-ffff
      bounced      │ sub-gggg

      tick: last 2026-07-22T12:00:00.000Z
      "
    `);
  });

  it("renders a dim placeholder at empty stations", () => {
    const empty: PipelineSnapshot = {
      board: [],
      claimed: [],
      building: [],
      inReview: [],
      merged: [],
      bounced: [],
      lastTick: null,
      pollIntervalSec: 60,
      now: "2026-07-22T12:00:00.000Z",
    };
    const out = renderPipeline(empty);
    expect(out).toContain("board        │ ·");
    expect(out).toContain("tick: no tick yet");
  });
});

describe("tickHealthLine (staleness warning, §3.2)", () => {
  it("warns STALE when lastTick exceeds 2× the poll interval", () => {
    const snap: PipelineSnapshot = {
      ...freshSnapshot(),
      lastTick: "2026-07-22T12:00:00.000Z",
      pollIntervalSec: 60,
      now: "2026-07-22T12:05:00.000Z", // 300s > 2×60=120s → stale
    };
    const line = tickHealthLine(snap);
    expect(line).toContain("STALE");
    expect(line).toContain("300s ago");
    expect(line).toContain("2× 60s");
  });

  it("does not warn when the last tick is within 2× the interval", () => {
    expect(tickHealthLine(freshSnapshot())).not.toContain("STALE");
  });

  it("reports no-tick-yet (never stale) before the first tick", () => {
    expect(tickHealthLine({ ...freshSnapshot(), lastTick: null })).toBe("tick: no tick yet");
  });
});

describe("snapshotFromState (status derivation, §3.2)", () => {
  it("splits inFlight into building vs in-review by phase and carries bounced", () => {
    const state: State = {
      schemaVersion: SCHEMA_VERSION,
      lastTick: "2026-07-22T12:00:00.000Z",
      inFlight: [
        { bead: "sub-b1", lane: "quick", worktree: "/w/b1", branch: "serve/b1", pr: null, phase: "building", sessionPid: null, startedAt: "t" },
        { bead: "sub-r1", lane: "quick", worktree: "/w/r1", branch: "serve/r1", pr: "url", phase: "in-review", sessionPid: null, startedAt: "t" },
      ],
      bounced: ["sub-x1"],
      recentEvents: [],
    };
    const snap = snapshotFromState(state, EMPTY_FACTS, 60, "2026-07-22T12:00:30.000Z");
    expect(snap.building).toEqual(["sub-b1"]);
    expect(snap.inReview).toEqual(["sub-r1"]);
    expect(snap.bounced).toEqual(["sub-x1"]);
    expect(snap.lastTick).toBe("2026-07-22T12:00:00.000Z");
  });
});

// ── 2. Events ledger (§3.2b) ─────────────────────────────────────────────────

describe("serializeEvent (events.jsonl line, §3.2b)", () => {
  const now = () => "2026-07-22T12:00:00.000Z";

  it("stamps ts + bead + event and drops absent optional fields", () => {
    const line = serializeEvent({ event: "claim", bead: "sub-abcd" }, now);
    expect(JSON.parse(line)).toEqual({
      ts: "2026-07-22T12:00:00.000Z",
      bead: "sub-abcd",
      event: "claim",
    });
  });

  it("carries lane, pr, sessionOrdinal, and usage when present", () => {
    const ev: ServeEvent = {
      event: "dispatch",
      bead: "sub-abcd",
      lane: "quick",
      pr: "https://gh/pr/1",
      sessionOrdinal: 1,
      usage: { inputTokens: 10, outputTokens: 20, costUsd: 0.03 },
    };
    expect(JSON.parse(serializeEvent(ev, now))).toEqual({
      ts: "2026-07-22T12:00:00.000Z",
      bead: "sub-abcd",
      event: "dispatch",
      lane: "quick",
      pr: "https://gh/pr/1",
      sessionOrdinal: 1,
      usage: { inputTokens: 10, outputTokens: 20, costUsd: 0.03 },
    });
  });

  it("createEventWriter emits one serialized line per event through its sink", () => {
    const lines: string[] = [];
    const writer = createEventWriter((line) => lines.push(line), now);
    writer.emit({ event: "route", bead: "sub-1", lane: "quick" });
    writer.emit({ event: "bounce", bead: "sub-2" });
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[0]!).event).toBe("route");
    expect(JSON.parse(lines[1]!).event).toBe("bounce");
  });
});

// ── 3. Boot-reap consistency drill (§7) ──────────────────────────────────────
//
// The kill-9-mid-build → restart story at fixture level. A worktree was cut for
// a bead whose build session was killed before it opened a PR (kill -9 mid-build).
// On restart there is no live process, so boot-reap must reap that stranded
// worktree, RELEASE the bead's claim back to the board, and rewrite state.json
// with NO ghost in-flight entry for it. Driven against fakes — the same
// collaborators serve.ts binds to real git/tbd/gh live.

/** Fakes recording every side effect; gh answered from tables. */
function fakeQueue(): QueueAdapter & { released: string[] } {
  const released: string[] = [];
  return { released, release: (bead) => void released.push(bead) };
}
function fakeWorktree(): WorktreeAdapter & { reaped: WorktreePlan[] } {
  const reaped: WorktreePlan[] = [];
  return { reaped, reap: async (plan) => void reaped.push(plan) };
}
function fakePrs(tables: { openPR?: Record<string, boolean>; mergedOrClosed?: Record<string, boolean> }): PrAdapter {
  return {
    hasOpenPR: async (b) => tables.openPR?.[b] ?? false,
    isMergedOrClosed: async (b) => tables.mergedOrClosed?.[b] ?? false,
  };
}
function fakeState(): StateAdapter & { written: State[] } {
  const written: State[] = [];
  return { written, write: (s) => void written.push(s) };
}
function collectingWriter(): EventWriter & { events: ServeEvent[] } {
  const events: ServeEvent[] = [];
  return { events, emit: (ev) => void events.push(ev) };
}

function observedWorktree(bead: string): ObservedWorktree {
  return { bead, plan: { path: `/repo-serve/${bead}`, branch: `serve/${bead}` } };
}

describe("bootReap (kill-9-mid-build → restart consistency, §7)", () => {
  it("reaps the stranded worktree, releases the claim, and writes a ghost-free state", async () => {
    // A bead mid-build when the daemon was killed: worktree on disk, claim in tbd,
    // but NO open PR (the session died before pushing).
    const bead = "sub-dead9";
    const queue = fakeQueue();
    const worktree = fakeWorktree();
    const state = fakeState();
    const prs = fakePrs({ openPR: {}, mergedOrClosed: {} }); // no PR at all
    const events = collectingWriter();

    const observed: Observed = {
      worktrees: [observedWorktree(bead)],
      claims: [{ bead }],
    };

    await bootReap({ deps: { queue, worktree, prs, state }, observed, events });

    // Reaped + released back to the board.
    expect(worktree.reaped.map((p) => p.branch)).toEqual([`serve/${bead}`]);
    expect(queue.released).toEqual([bead]);

    // The rewritten state has NO ghost in-flight entry, and the bead shows bounced.
    expect(state.written).toHaveLength(1);
    const rewritten = state.written[0]!;
    expect(rewritten.inFlight).toEqual([]);
    expect(rewritten.bounced).toContain(bead);

    // Ledgered as a tidy + release transition (§3.2b).
    const kinds = events.events.map((e) => e.event);
    expect(kinds).toContain("tidy");
    expect(kinds).toContain("release");
  });

  it("keeps a legitimately in-flight worktree (open PR) — not reaped, stays in state", async () => {
    const bead = "sub-live1";
    const queue = fakeQueue();
    const worktree = fakeWorktree();
    const state = fakeState();
    const prs = fakePrs({ openPR: { [bead]: true } }); // live PR → in-review
    const events = collectingWriter();

    const observed: Observed = { worktrees: [observedWorktree(bead)], claims: [{ bead }] };
    await bootReap({ deps: { queue, worktree, prs, state }, observed, events });

    // Not reaped, not released — it is legitimate in-flight work.
    expect(worktree.reaped).toEqual([]);
    expect(queue.released).toEqual([]);
    const rewritten = state.written[0]!;
    expect(rewritten.inFlight.map((f) => f.bead)).toEqual([bead]);
    expect(rewritten.inFlight[0]!.phase).toBe("in-review");
  });

  it("reconcile is idempotent — a second boot over already-clean truth is a no-op reap", async () => {
    // After the first reap, the worktree is gone: observed truth has no worktree
    // and the claim was released, so a second boot reaps/releases nothing.
    const queue = fakeQueue();
    const worktree = fakeWorktree();
    const state = fakeState();
    const prs = fakePrs({});
    const observed: Observed = { worktrees: [], claims: [] };

    const result = await reconcile({ queue, worktree, prs, state }, observed, {
      liveInFlight: new Set<string>(),
    });
    expect(result.actions).toEqual([]);
    expect(result.state.inFlight).toEqual([]);
  });
});
