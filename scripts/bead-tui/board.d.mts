// Hand-written types for board.mjs. watch.mjs is zero-dep plain ESM by design
// (it ships wherever bead-graph.sh ships, with no build step), so the daemon's
// `tsc --noEmit` gate reads this sibling declaration rather than a compiled
// artifact. Keep it in sync with board.mjs by hand — there is no generator.

export interface BoardRow {
  id: string;
  title?: string;
  status?: string;
  kind?: string;
  labels?: string[];
  priority?: number;
}

export interface BoardPartition<R extends BoardRow = BoardRow> {
  /** open, unfiled, not yet groomed — the raw triage pile */
  un: R[];
  /** open, unfiled, labelled `groomed` — fleshed out, ready to hand off */
  gr: R[];
  /** `[...un, ...gr]` — cursor order */
  flat: R[];
  /** open beads excluded because they are filed under an epic */
  filedOpen: number;
}

export function partitionBoard<R extends BoardRow>(
  rows: Iterable<R>,
  unassignedIds: ReadonlySet<string>,
): BoardPartition<R>;
