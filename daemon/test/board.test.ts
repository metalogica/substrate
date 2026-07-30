// board.test.ts — the Planning board's membership predicate (scripts/bead-tui/board.mjs).
//
// This test exists because of a specific silent failure: the board used to gate on an
// opt-in `inbox` label that only the TUI's own capture key applied, so every bead created
// by `tbd create` — the normal way beads appear during a working session — was invisible
// here. In a project with 19 open beads the board rendered "UNGROOMED · 2". No error, no
// count, and a heading that told a plausible wrong story about why.
//
// The regression this guards is therefore narrow and load-bearing: a bead created with NO
// labels at all must land on the board. Everything else here pins the partition around it.
//
// Pure data — no tbd binary, no TTY, no poll loop. The predicate was extracted out of
// watch.mjs precisely so this could be true.

import { describe, it, expect } from "vitest";
import { partitionBoard, type BoardRow } from "../../scripts/bead-tui/board.mjs";

/** A snapshot row as watch.mjs builds them from `tbd list --json`. */
const row = (id: string, over: Partial<BoardRow> = {}): BoardRow => ({
  id,
  title: id,
  status: "open",
  kind: "task",
  labels: [],
  priority: 2,
  ...over,
});

/** MEMBERSHIP.unassigned: open beads no epic container has claimed. */
const unassigned = (...ids: string[]) => new Set(ids);

describe("partitionBoard", () => {
  it("shows a bead created with no labels at all — the CLI-created case", () => {
    // Exactly what `tbd create "title"` produces: no `inbox`, no `groomed`, no `epic:`.
    const bare = row("sub-a1");
    const { un, gr, flat } = partitionBoard([bare], unassigned("sub-a1"));

    expect(un.map((r) => r.id)).toEqual(["sub-a1"]);
    expect(gr).toEqual([]);
    expect(flat).toHaveLength(1);
  });

  it("does not require any opt-in label — a bead carrying `inbox` is treated identically", () => {
    // Legacy beads still carry `inbox` from the old capture path. It must be inert, not
    // privileged: if it still sorted differently, the two creation paths would still diverge.
    const legacy = row("sub-a1", { labels: ["inbox"] });
    const fresh = row("sub-b2");
    const { un } = partitionBoard([legacy, fresh], unassigned("sub-a1", "sub-b2"));

    expect(un.map((r) => r.id)).toEqual(["sub-a1", "sub-b2"]);
  });

  it("splits UNGROOMED from GROOMED on the `groomed` label", () => {
    const rows = [row("sub-a1"), row("sub-b2", { labels: ["groomed"] })];
    const { un, gr, flat } = partitionBoard(rows, unassigned("sub-a1", "sub-b2"));

    expect(un.map((r) => r.id)).toEqual(["sub-a1"]);
    expect(gr.map((r) => r.id)).toEqual(["sub-b2"]);
    expect(flat.map((r) => r.id)).toEqual(["sub-a1", "sub-b2"]); // cursor order: un then gr
  });

  it("excludes epic-filed beads and counts them, so the board can say what it hides", () => {
    const rows = [
      row("sub-a1"),
      row("sub-b2", { labels: ["epic:perf"] }),
      row("sub-c3", { labels: ["epic:perf"] }),
    ];
    const { flat, filedOpen } = partitionBoard(rows, unassigned("sub-a1"));

    expect(flat.map((r) => r.id)).toEqual(["sub-a1"]);
    expect(filedOpen).toBe(2);
  });

  it("does not count epic containers as hidden work — they are their own card on Epics", () => {
    const rows = [row("sub-a1"), row("sub-e0", { kind: "epic", labels: ["epic:perf"] })];
    const { flat, filedOpen } = partitionBoard(rows, unassigned("sub-a1"));

    expect(flat.map((r) => r.id)).toEqual(["sub-a1"]);
    expect(filedOpen).toBe(0);
  });

  it("keeps in_progress on the board and drops closed", () => {
    const rows = [
      row("sub-a1", { status: "in_progress" }),
      row("sub-b2", { status: "closed" }),
    ];
    // A closed bead is not in MEMBERSHIP.unassigned, but assert on status too so the
    // predicate stays correct if that ever changes upstream.
    const { flat, filedOpen } = partitionBoard(rows, unassigned("sub-a1", "sub-b2"));

    expect(flat.map((r) => r.id)).toEqual(["sub-a1"]);
    expect(filedOpen).toBe(0);
  });

  it("sorts by priority then id within a section", () => {
    const rows = [
      row("sub-c3", { priority: 2 }),
      row("sub-a1", { priority: 3 }),
      row("sub-b2", { priority: 0 }),
    ];
    const { un } = partitionBoard(rows, unassigned("sub-a1", "sub-b2", "sub-c3"));

    expect(un.map((r) => r.id)).toEqual(["sub-b2", "sub-c3", "sub-a1"]);
  });

  it("union(board, filed) accounts for every open bead — nothing falls between the views", () => {
    // The property the whole design rests on: membership is the complement of epic
    // membership, so an open bead is on Planning or on Epics, never neither.
    const rows = [
      row("sub-a1"),
      row("sub-b2", { labels: ["groomed"] }),
      row("sub-c3", { labels: ["epic:perf"] }),
      row("sub-d4", { status: "in_progress", labels: ["epic:perf"] }),
      row("sub-e5", { status: "closed" }),
    ];
    const { flat, filedOpen } = partitionBoard(rows, unassigned("sub-a1", "sub-b2"));
    const openNonEpic = rows.filter(
      (r) => (r.status === "open" || r.status === "in_progress") && r.kind !== "epic",
    ).length;

    expect(flat.length + filedOpen).toBe(openNonEpic);
  });
});
