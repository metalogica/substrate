// pipeline-render.ts — the shared aerial ASCII pipeline renderer (spec §3.2).
//
// Renders the daemon's board as an aerial view of stations the work flows through:
//
//   board → claimed → building → in-review → merged (24h)
//
// with the live bead ids parked at each station, a `bounced` row for beads kicked
// back to the board, and a tick-health line (last tick + a staleness warning when
// `lastTick` exceeds 2× the poll interval).
//
// This is a PURE function of a {@link PipelineSnapshot} — no fs, no tbd, no gh, no
// wall clock (the "now" used for staleness is passed in). That keeps it
// snapshot-testable AND reusable: a future board-TUI Factory tab renders the same
// view from the same snapshot without dragging in the daemon's I/O (§3.2).

import type { State } from "./state.js";

/** A facts snapshot the renderer draws — assembled by `status.ts` from state + tbd/gh. */
export interface PipelineSnapshot {
  /** Bead ids sitting on the board, groomed + open (tbd truth). */
  board: readonly string[];
  /** Bead ids claimed but not yet building (claimed, pre-worktree). */
  claimed: readonly string[];
  /** In-flight beads whose lane session is building (no PR yet). */
  building: readonly string[];
  /** In-flight beads with an open PR awaiting merge/review. */
  inReview: readonly string[];
  /** Beads merged within the last 24h (the `merged (24h)` station). */
  merged: readonly string[];
  /** Beads bounced back to the board this session (the `bounced` row). */
  bounced: readonly string[];
  /** ISO timestamp of the last completed tick, or `null` before the first. */
  lastTick: string | null;
  /** Poll interval (seconds) — staleness threshold is 2× this. */
  pollIntervalSec: number;
  /** "Now" for the staleness computation, injected so the render is deterministic. */
  now: string;
}

/** The five pipeline stations, in flow order (§3.2). */
const STATIONS: readonly { key: keyof PipelineSnapshot; label: string }[] = [
  { key: "board", label: "board" },
  { key: "claimed", label: "claimed" },
  { key: "building", label: "building" },
  { key: "inReview", label: "in-review" },
  { key: "merged", label: "merged (24h)" },
];

/** Render a station's parked bead ids, or a dim `·` when empty. */
function renderStationBeads(ids: readonly string[]): string {
  return ids.length > 0 ? ids.join(" ") : "·";
}

/**
 * Compute the tick-health line (§3.2): the last-tick timestamp plus a staleness
 * WARNING when the gap from `lastTick` to `now` exceeds 2× the poll interval —
 * the signal that the daemon has stalled (a tick should land every interval).
 *
 * `lastTick === null` (no tick yet) is reported as "no tick yet", not stale — a
 * freshly-booted daemon that has not completed a cycle is not a stalled one.
 */
export function tickHealthLine(snap: PipelineSnapshot): string {
  if (snap.lastTick === null) {
    return "tick: no tick yet";
  }
  const last = Date.parse(snap.lastTick);
  const now = Date.parse(snap.now);
  const ageSec = (now - last) / 1000;
  const staleAfterSec = snap.pollIntervalSec * 2;
  if (Number.isFinite(ageSec) && ageSec > staleAfterSec) {
    return `tick: last ${snap.lastTick} — STALE (${Math.round(ageSec)}s ago, > 2× ${snap.pollIntervalSec}s poll)`;
  }
  return `tick: last ${snap.lastTick}`;
}

/**
 * Render the aerial pipeline view (§3.2) from a {@link PipelineSnapshot}. The
 * output is a stable, line-oriented ASCII block:
 *
 *   - a titled header,
 *   - one aligned row per station (`<label> │ <bead ids | ·>`),
 *   - a `bounced` row,
 *   - the tick-health line (with the staleness warning when stale).
 *
 * Deterministic given the snapshot (including its injected `now`), so a golden
 * snapshot test pins the exact bytes and a board-TUI tab can reuse it verbatim.
 */
export function renderPipeline(snap: PipelineSnapshot): string {
  // Align the station/bounced labels into a fixed gutter so the columns line up.
  const labels = [...STATIONS.map((s) => s.label), "bounced"];
  const gutter = Math.max(...labels.map((l) => l.length));
  const pad = (label: string): string => label.padEnd(gutter, " ");

  const lines: string[] = [];
  lines.push("serve — aerial pipeline (§3.2)");
  lines.push("─".repeat("serve — aerial pipeline (§3.2)".length));

  for (const station of STATIONS) {
    const ids = snap[station.key] as readonly string[];
    lines.push(`${pad(station.label)} │ ${renderStationBeads(ids)}`);
  }

  // The bounced row sits below the stations: beads kicked back to the board.
  lines.push(`${pad("bounced")} │ ${renderStationBeads(snap.bounced)}`);

  lines.push("");
  lines.push(tickHealthLine(snap));

  return lines.join("\n") + "\n";
}
