// triage.ts — entry: claim + route + (dispatch) ONE named bead NOW (§2.1, §3.2
// triage verb; Phase 3 Step 3.2). This is the manual sibling of the tick: it
// SHARES the tick's claim → route path but skips the poll — no interval wait, no
// PR sweep, no capacity gate, no FIFO discovery. The human names the bead; triage
// runs that one bead's lifecycle transition immediately.
//
// Reuse, not duplication (bead sub-fu3f): the claim transition is `queue.ts`'s
// `Queue.claim`, the routing decision is `router.ts`'s pure `route()`, the stamp
// and bounce effects are `queue.ts` / `router.ts` again. This file only
// orchestrates them for a single named bead and owns the argv/print shell.
//
// DISPATCH IS STUBBED (bead sub-fu3f): the real dispatch chain — worktree +
// headless session + PR + `in-review` stamp (§4 step 6, §5.2) — is wired into
// BOTH `tick.ts` and `triage.ts` by a LATER bead (sub-35nn). Here dispatch is an
// injectable seam (`Dispatch`) whose default is a no-op that reports "stubbed".
// sub-35nn replaces the default with the real chain in one place; the triage
// verb's job in THIS bead ends at claim + route + stamp.

import { pathToFileURL } from "node:url";

import { Queue } from "./queue.js";
import { route as routeBead, logOverride, kindOf } from "./router.js";
import type { Bead, Route } from "./queue.js";
import type { RouteDecision } from "./router.js";

/**
 * The queue capabilities the triage verb consumes — a structural subset of
 * {@link Queue} so a test can drive a hand-rolled fake instead of a real tbd
 * repo. This is EXACTLY the real `Queue`'s public surface the triage span needs —
 * `list` (resolve target) + `claim` (§3.1) + `stamp` (route/note) + `release`
 * (bounce) — so `new Queue(...)` satisfies it structurally with no adaptation.
 *
 * NOTE (bead sub-fu3f → sub-35nn): the router's richer `BounceAdapter`
 * (release + addLabel + note) is NOT yet implemented by `Queue` (it exposes only
 * `stamp({note})`, not a bare `addLabel`). So triage records a bounce as a
 * release + a `stamp` note here, rather than calling `router.bounce`. sub-35nn —
 * which owns wiring the real bounce path into both `tick.ts` and this file — can
 * upgrade the `needs-spec` bounce to re-apply the label once `Queue` grows that
 * verb; the pure §5.1 `route()` decision below is already reused verbatim.
 */
export interface TriageQueue {
  /** Discover claimable beads (groomed+open, FIFO). Used to resolve the target by id. */
  list(): Bead[];
  /** groomed → claimed (§3.1): status → in_progress, assignee → serve, drop `groomed`. */
  claim(id: string): void;
  /** claimed → routed (§3.1): add `route:<lane>` and/or a working note. */
  stamp(id: string, stamp: { route?: Route; note?: string; inReview?: boolean }): void;
  /** any → released (§3.1): restore `groomed`, clear assignee, status → open. */
  release(id: string): void;
}

/**
 * The DISPATCH SEAM (bead sub-fu3f → sub-35nn). Given a freshly-claimed + routed
 * bead and its lane, kick off the build (worktree + headless session + PR, §5.2).
 * The default {@link stubDispatch} is a no-op — dispatch is deferred to sub-35nn,
 * which will inject the real chain into both `tick.ts` and this file. Kept as a
 * single named parameter so wiring it later is a one-line change per call site.
 */
export type Dispatch = (bead: Bead, lane: Route) => void;

/** Default dispatch: a no-op STUB until sub-35nn wires the real §5.2 chain. */
export const stubDispatch: Dispatch = (_bead, _lane) => {
  // no-op: worktree + headless session + PR land in sub-35nn.
};

/** Everything the core triage function needs, injected so it is pure + testable. */
export interface TriageDeps {
  /** Queue adapter (real {@link Queue} in `main`, a fake in tests). */
  queue: TriageQueue;
  /** Dispatch seam (§5.2). Defaults to {@link stubDispatch}. */
  dispatch?: Dispatch;
}

/** How the triage of one named bead ended — surfaced for the print line + tests. */
export type TriageOutcome =
  | { status: "not-found"; bead: string }
  | { status: "routed"; bead: string; lane: Route; priorKind: string | undefined }
  | { status: "bounced"; bead: string; reason: string };

/**
 * Triage ONE named bead now (§3.2, Phase 3 Step 3.2). Shares the tick's claim →
 * route path (`Queue.claim` + `router.route`) but skips the poll: no PR sweep, no
 * capacity check, no FIFO — the caller named the bead, we run its transition.
 *
 * Flow:
 *   1. Resolve the named bead off the board (groomed+open, via `queue.list`).
 *      Not found / not claimable → `not-found` (no mutation).
 *   2. Claim it (§3.1 groomed → claimed) — the committing step, same as the tick.
 *   3. Route it with the pure §5.1 `route()` decision (no model, human prior only).
 *      - route  → stamp `route:<lane>` + `serve: routed <lane> (prior kind:<k>)`
 *                 (§3.1 claimed → routed), log any override, then DISPATCH (stubbed).
 *      - bounce → release the claim + record why (§3.1 claimed → bounced).
 *
 * Returns a {@link TriageOutcome}; the caller prints one concise result line. No
 * argv, no stdout, no process — that shell is {@link main}.
 */
export function triage(id: string, deps: TriageDeps): TriageOutcome {
  const dispatch = deps.dispatch ?? stubDispatch;

  // Step 1 — resolve the named bead off the board. A groomed+open bead is exactly
  // what `queue.list()` returns (FIFO), so we find our target by id there. An id
  // that is absent (already claimed, closed, needs-spec-excluded, or unknown) is
  // not triageable — report `not-found` and mutate nothing.
  const target = deps.queue.list().find((b) => b.id === id);
  if (!target) {
    return { status: "not-found", bead: id };
  }

  // Step 2 — claim (§3.1 groomed → claimed). Same committing step the tick runs;
  // after it, tbd shows the bead in_progress+assigned and off the board.
  deps.queue.claim(target.id);

  // Step 3 — route via the pure §5.1 decision (no model; human prior only).
  const decision: RouteDecision = routeBead(target);
  logOverride(target, decision);

  if (decision.action === "bounce") {
    // claimed → bounced (§3.1): release the claim (restores `groomed`, clears the
    // assignee, status → open), then record WHY as a working note. We go through
    // `Queue`'s real surface (release + stamp-note) rather than `router.bounce`,
    // because `Queue` does not yet expose the bare `addLabel` its `BounceAdapter`
    // wants — see the TriageQueue note. sub-35nn upgrades the `needs-spec` arm to
    // re-apply the label once that verb exists.
    deps.queue.release(target.id);
    deps.queue.stamp(target.id, { note: `serve: bounced (${decision.reason})` });
    return { status: "bounced", bead: target.id, reason: decision.reason };
  }

  // claimed → routed (§3.1): stamp the route label + the note carrying the prior
  // kind (§3.1 table: `serve: routed <lane> (prior kind:<k>)`).
  const priorKind = kindOf(target);
  const lane = decision.lane;
  deps.queue.stamp(target.id, {
    route: lane,
    note: `serve: routed ${lane} (prior kind:${priorKind ?? "?"})`,
  });

  // Step 6 (§4) — DISPATCH. Stubbed for bead sub-fu3f; sub-35nn wires the real
  // worktree + headless session + PR chain behind this seam.
  dispatch(target, lane);

  return { status: "routed", bead: target.id, lane, priorKind };
}

const USAGE = `substrate triage — claim + route ONE bead now (serve-v1)

usage:
  substrate triage <bead-id> [--repo <path>]

Runs the daemon's claim → route path for ONE named bead immediately, skipping the
poll wait. The bead must be on the board (groomed + open). Claims it, routes it by
its \`kind:\` label (§5.1), and stamps the route — or bounces it back to the board
when it is un-routable (needs-spec / missing kind). Dispatch (worktree + headless
session) is not yet wired (later bead).

options:
  --repo <path>   repo root whose tbd board holds the bead (default: cwd)
  -h, --help      print this help and exit
`;

/** Parsed triage argv: the target bead id and the repo to run against. */
interface TriageArgs {
  repo: string;
  bead: string;
}

/**
 * Parse `<bead-id>` (first positional) and `--repo <path>` (default cwd). Returns
 * `null` for `--help`, or when no bead id was given (usage error) — the caller
 * prints usage and exits non-zero in the latter case.
 */
export function parseArgs(argv: string[]): TriageArgs | null {
  let repo = process.cwd();
  let bead: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === undefined) continue;
    if (arg === "-h" || arg === "--help") return null;
    if (arg === "--repo") {
      const next = argv[i + 1];
      if (next !== undefined) {
        repo = next;
        i++;
      }
      continue;
    }
    if (bead === undefined && !arg.startsWith("-")) {
      bead = arg;
    }
  }
  if (bead === undefined) return null;
  return { repo, bead };
}

/** Render a {@link TriageOutcome} as the one concise result line the verb prints. */
export function formatOutcome(outcome: TriageOutcome): string {
  switch (outcome.status) {
    case "not-found":
      return `triage: ${outcome.bead} not on the board (not groomed/open) — nothing to do`;
    case "routed":
      return `triage: ${outcome.bead} → route:${outcome.lane} (prior kind:${outcome.priorKind ?? "?"})`;
    case "bounced":
      return `triage: ${outcome.bead} bounced — ${outcome.reason}`;
  }
}

/**
 * The thin argv shell (§2.1): parse argv, build a real {@link Queue} bound to the
 * target repo, run {@link triage} for the named bead (dispatch STUBBED), print one
 * result line. Exit non-zero on a usage error or a bead that was not on the board.
 */
export function main(argv: string[] = process.argv.slice(2)): void {
  const parsed = parseArgs(argv);
  if (parsed === null) {
    process.stdout.write(USAGE);
    return;
  }
  const { repo, bead } = parsed;

  const queue = new Queue({ cwd: repo });
  // dispatch defaults to the stub (sub-35nn wires the real chain here + in tick).
  const outcome = triage(bead, { queue });

  process.stdout.write(formatOutcome(outcome) + "\n");
  if (outcome.status === "not-found") {
    process.exit(1);
  }
}

/**
 * Run `main()` only when this file is the process entry point (invoked as
 * `tsx src/triage.ts`), NOT when it is imported (e.g. by the vitest suite, which
 * exercises {@link triage}/{@link parseArgs} directly). `process.argv[1]` is the
 * script tsx was pointed at; compare it to this module's own path.
 */
const isEntry = process.argv[1] !== undefined
  && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isEntry) {
  main();
}
