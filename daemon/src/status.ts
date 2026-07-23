// status.ts — the `status` verb (spec §3.2): render the aerial pipeline view.
//
// Reads the observability `state.json` (via state.ts) + config (poll interval,
// for the staleness threshold), derives the aerial-view {@link PipelineSnapshot},
// and renders it through the SHARED `pipeline-render.ts` module (so a future
// board-TUI Factory tab reuses the same renderer). Board/claimed/merged facts are
// tbd/gh-derived; they are injected so the verb stays testable and degrades to
// state-only when those facts are unavailable.
//
// The staleness WARNING (§3.2) is computed in the renderer from `lastTick` vs a
// `now` this verb stamps and the poll interval from config — `status` only
// assembles the snapshot; the renderer owns the health line.

import { join } from "node:path";

import { readState, type State } from "./state.js";
import { loadConfig } from "./config.js";
import { renderPipeline, type PipelineSnapshot } from "./pipeline-render.js";

/**
 * The tbd/gh facts `status` folds in beyond `state.json`: beads on the board, the
 * claimed-but-not-building set, and the beads merged in the last 24h. Injectable
 * so tests drive them from fixtures and the verb degrades to empty facts (state
 * only) when tbd/gh are unavailable.
 */
export interface StatusFacts {
  board: readonly string[];
  claimed: readonly string[];
  merged: readonly string[];
}

/** Empty facts — the state-only fallback when tbd/gh cannot be consulted. */
export const EMPTY_FACTS: StatusFacts = { board: [], claimed: [], merged: [] };

/**
 * Derive the aerial-view {@link PipelineSnapshot} (§3.2) from the observability
 * state, the tbd/gh facts, and the poll interval. `building` / `in-review` are
 * split out of `state.inFlight` by each entry's observed `phase`; `bounced` comes
 * straight off `state.bounced`. Pure — no I/O, `now` injected — so it is testable.
 */
export function snapshotFromState(
  state: State,
  facts: StatusFacts,
  pollIntervalSec: number,
  now: string,
): PipelineSnapshot {
  const building: string[] = [];
  const inReview: string[] = [];
  for (const f of state.inFlight) {
    if (f.phase === "in-review") inReview.push(f.bead);
    else building.push(f.bead);
  }
  return {
    board: facts.board,
    claimed: facts.claimed,
    building,
    inReview,
    merged: facts.merged,
    bounced: state.bounced,
    lastTick: state.lastTick,
    pollIntervalSec,
    now,
  };
}

/** The state.json path for a served repo (§1.2, §3.2) — mirrors serve.ts. */
export function statePath(repoRoot: string): string {
  return join(repoRoot, ".substrate", "serve", "state.json");
}

/**
 * Render the full `status` view for a repo: load state + config, assemble the
 * snapshot (with the supplied tbd/gh facts, defaulting to state-only), and render
 * via the shared renderer. `now` is injectable for deterministic tests; the verb
 * stamps the wall clock.
 */
export function renderStatus(
  repoRoot: string,
  facts: StatusFacts = EMPTY_FACTS,
  now: string = new Date().toISOString(),
): string {
  const state = readState(statePath(repoRoot));
  const config = loadConfig(repoRoot);
  const snapshot = snapshotFromState(state, facts, config.pollIntervalSec, now);
  return renderPipeline(snapshot);
}

/**
 * Parse `--repo <path>`; default to cwd. Returns `null` when `--help` is present
 * so the caller prints usage. Mirrors serve.ts / triage.ts argv handling.
 */
export function parseArgs(argv: string[]): { repo: string } | null {
  let repo = process.cwd();
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "-h" || arg === "--help") return null;
    if (arg === "--repo") {
      const next = argv[i + 1];
      if (next !== undefined) {
        repo = next;
        i++;
      }
    }
  }
  return { repo };
}

const USAGE = `substrate status — aerial pipeline view (serve-v1)

usage:
  substrate status [--repo <path>]

Renders the daemon's board as an aerial view of the stations work flows through
(board → claimed → building → in-review → merged), a bounced row, and tick health
(with a staleness warning when the last tick is older than 2× the poll interval).
Reads .substrate/serve/state.json; degrades to state-only facts when tbd/gh are
not consulted.

options:
  --repo <path>   repo root to report on (default: cwd)
  -h, --help      print this help and exit
`;

/** The thin argv shell for the `status` verb: parse argv, render, print. */
export function main(argv: string[] = process.argv.slice(2)): void {
  const parsed = parseArgs(argv);
  if (parsed === null) {
    process.stdout.write(USAGE);
    return;
  }
  process.stdout.write(renderStatus(parsed.repo));
}

// Run only when executed as a script, not when imported by tests.
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
