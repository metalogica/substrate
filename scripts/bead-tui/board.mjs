// board.mjs — the Planning board's membership predicate, extracted pure.
//
// Split out of watch.mjs for one reason: this predicate is the screen's only
// load-bearing logic, and its failure mode is SILENT. A board that renders
// "UNGROOMED · 2" when 19 beads are open reads as "no outstanding work" rather
// than "work you cannot see" — the most expensive way a triage surface can lie.
// Pure + dependency-free means it is unit-testable without a tbd binary, a TTY,
// or the poll loop (see daemon/test/board.test.ts).
//
// MEMBERSHIP IS DERIVED, NEVER OPT-IN. A bead is on the board iff it is open and
// not filed under an epic. There is no label to remember and therefore none to
// forget: a bead created by a bare `tbd create` — an agent's or a human's, at the
// CLI or through the TUI's `n` key — lands on the board by construction.
//
// The invariant this buys: union(Planning, Epics) covers EVERY open bead. The
// board is the complement of epic membership, so no bead can fall between the
// two views in any state. The predicate's history is the argument for keeping it
// derived: it used to be an opt-in `inbox` label that only the TUI's own capture
// key applied, which made every CLI-created bead invisible here with no error, no
// count, and a heading ("unfiled tasks") that told a plausible wrong story about
// why. Reintroducing any opt-in filter reintroduces that class of bug.

/**
 * Partition snapshot rows into the board's two sections.
 *
 * @param rows          all snapshot rows (`{ id, title, status, kind, labels, priority }`)
 * @param unassignedIds ids of open beads claimed by no epic (`MEMBERSHIP.unassigned`)
 * @returns `{ un, gr, flat, filedOpen }` — ungroomed rows, groomed rows, their
 *          concatenation (cursor order), and the count of open beads the board
 *          excludes because they are filed under an epic. `filedOpen` is what
 *          lets the render say what it is hiding instead of implying nothing exists.
 */
export function partitionBoard(rows, unassignedIds) {
  const all = [...rows];
  const isOpen = (r) => r.status === 'open' || r.status === 'in_progress';
  const onBoard = all.filter((r) => isOpen(r) && unassignedIds.has(r.id));
  const groomed = (r) => (r.labels || []).includes('groomed');
  const byPri = (a, b) => (a.priority ?? 2) - (b.priority ?? 2) || (a.id < b.id ? -1 : 1);
  const un = onBoard.filter((r) => !groomed(r)).sort(byPri);
  const gr = onBoard.filter(groomed).sort(byPri);
  // Epic containers are represented by their own card on Epics, so they are not
  // "hidden work" — only their open members count as filed-and-excluded.
  const filedOpen = all.filter((r) => isOpen(r) && r.kind !== 'epic' && !unassignedIds.has(r.id)).length;
  return { un, gr, flat: [...un, ...gr], filedOpen };
}
