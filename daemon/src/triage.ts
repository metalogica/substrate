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
// DISPATCH (bead sub-35nn): the real dispatch chain — route → worktree +
// headless session + PR + `in-review` stamp (§4 step 6, §5.2) — is wired into
// BOTH `tick.ts` and `triage.ts` here via {@link createDispatch}. The default
// {@link stubDispatch} remains a no-op for tests that only exercise the claim →
// route span; production call sites inject {@link createDispatch(...)}.

import { pathToFileURL } from "node:url";
import { spawn } from "node:child_process";

import { Queue } from "./queue.js";
import { loadConfig } from "./config.js";
import { route as routeBead, logOverride, kindOf, bounce } from "./router.js";
import {
  realGit,
  planWorktree,
  createWorktree,
  resolveTrunk,
  hasOrigin,
  type GitExec,
} from "./worktree.js";
import { runSession, type SessionSpec, type SpawnFn } from "./session.js";
import { observeLocal, type ShellExec } from "./observe.js";
import { loadGate, type Gate } from "./gate.js";
import type { Bead, Route } from "./queue.js";
import type { RouteDecision, BounceAdapter } from "./router.js";
import type { Config, Mode } from "./config.js";

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
  /** claimed → routed / routed → in-review (§3.1): add `route:<lane>`, `in-review`, and/or a note. */
  stamp(id: string, stamp: { route?: Route; note?: string; inReview?: boolean }): void;
  /** any → released (§3.1): restore `groomed`, clear assignee, status → open. */
  release(id: string): void;
  /** Add a single label (§3.1): re-apply `needs-spec` on a spec-lane bounce. */
  addLabel(id: string, label: string): void;
}

/**
 * Adapt a {@link TriageQueue} to the router's {@link BounceAdapter} (§3.1). The
 * real {@link Queue} carries a note via `stamp({ note })`, not a bare `note()`,
 * so we bridge it here — restoring the §3.1 `needs-spec` re-label path through
 * `router.bounce` instead of hand-rolling release + stamp-note in the caller.
 */
export function bounceAdapter(queue: TriageQueue): BounceAdapter {
  return {
    release: (id) => queue.release(id),
    addLabel: (id, label) => queue.addLabel(id, label),
    note: (id, note) => queue.stamp(id, { note: `serve: bounced (${note})` }),
  };
}

/**
 * The DISPATCH SEAM (§4 step 6, §5.2). Given a freshly-claimed + routed bead and
 * its lane, run the build chain — worktree + headless session + PR — and return
 * how it ended so the caller can stamp/hold/bounce the claim per the §5.2 failure
 * policy. Async because the chain shells out to git/claude/gh. In tests the whole
 * seam is mocked; production injects {@link createDispatch}.
 */
export type Dispatch = (bead: Bead, lane: Route) => Promise<DispatchResult>;

/**
 * The observed outcome of one dispatch (§5.2 — success is OBSERVED, never
 * self-reported). Exactly one of:
 *   - `landed`     → the work is verifiably there: the caller stamps `in-review`
 *                    with `ref` as the evidence.
 *   - `no-landing` → nothing verifiable arrived: the caller holds the claim, notes
 *                    `serve: lane failed (log <path>)`, and retries next tick.
 *
 * The arms are named for the OUTCOME rather than for GitHub because what counts
 * as evidence is mode-dependent (config `mode`): in `github` mode `ref` is the
 * PR url (branch pushed ∧ PR open); in `local` mode it is `<worktree>#<branch>`,
 * backed by "≥1 commit ∧ the repo's own gate green in that worktree". The failure
 * POLICY does not vary with mode — see `tick.applyDispatchPolicy`.
 */
export type DispatchResult =
  | { status: "landed"; ref: string; branch: string; reason?: undefined }
  | { status: "no-landing"; logPath: string; branch: string; reason?: string };

/** Default dispatch: a no-op STUB for tests that only exercise the claim→route span. */
export const stubDispatch: Dispatch = async (_bead, lane) => {
  // no-op stub — returns a benign `landed` so the routed path completes; the
  // real chain is {@link createDispatch}. Tests that assert dispatch wiring
  // inject their own mock instead of relying on this.
  return { status: "landed", ref: "", branch: `serve/${lane}` };
};

/**
 * Everything the real dispatch chain needs, injected so vitest drives it with
 * fakes (no real git/claude/gh). Assembled by {@link createDispatch}.
 */
export interface DispatchDeps {
  /** Repo root whose trunk the worktree branch is cut from, and where logs live. */
  repoRoot: string;
  /** Loaded config — mode, lane skills/models, branchPrefix, worktreeRoot. */
  config: Config;
  /** git runner (worktree lifecycle). Defaults to {@link realGit}. */
  git?: GitExec;
  /** headless-session spawn seam (§5.2). Mocked in tests; real `claude` in prod. */
  spawn: SpawnFn;
  /**
   * `gh`/`git` process runner for the idempotent PR loop (§6). Only consulted in
   * `mode: github`; a local-mode daemon never shells out to `gh` at all.
   */
  gh: (argv: readonly string[]) => Promise<GhResult>;
  /** Resolve the trunk branch; defaults to {@link resolveTrunk}. Overridable in tests. */
  trunk?: (repoRoot: string, git: GitExec) => Promise<string>;
  /**
   * The repo's declared gate (`substrate.yaml`) — the `mode: local` done-signal.
   * Defaults to reading it from `repoRoot` at dispatch time so an edited gate
   * takes effect without restarting the daemon.
   */
  gate?: Gate | null;
  /** Shell seam for running gate commands in the worktree (`mode: local`). */
  shell?: ShellExec;
  /** Whether the repo has an `origin` remote. Defaults to probing {@link hasOrigin}. */
  remote?: (repoRoot: string, git: GitExec) => Promise<boolean>;
}

/** One shelled-out `gh`/`git` result for the PR loop (subset of prs.ts ExecResult). */
export interface GhResult {
  code: number;
  stdout: string;
  stderr: string;
}

/** Everything the core triage function needs, injected so it is pure + testable. */
export interface TriageDeps {
  /** Queue adapter (real {@link Queue} in `main`, a fake in tests). */
  queue: TriageQueue;
  /** Dispatch seam (§5.2). Defaults to {@link stubDispatch}. */
  dispatch?: Dispatch;
}

/**
 * Compose the REAL dispatch chain (§4 step 6, §5.2) from injectable adapters —
 * the single place both `triage.ts` and `tick.ts` wire worktree + session +
 * observation:
 *
 *   1. Resolve the trunk + plan the bead's sibling worktree (`worktree.ts`).
 *   2. Create it, branch cut off `origin/<trunk>` — or off the LOCAL `<trunk>`
 *      when the repo has no remote (`createWorktree`), recording the base sha.
 *   3. Spawn the headless lane session in that worktree (`runSession`, §5.2).
 *   4. OBSERVE whether it landed — the one step that varies with `config.mode`:
 *        - `github` → `gh pr view <branch> || gh pr create` ({@link ensurePr});
 *          killing/rerunning mid-flow never dups a branch/PR.
 *        - `local`  → ≥1 commit over the base sha ∧ the repo's own `substrate.yaml`
 *          gate green in the worktree ({@link observeLocal}).
 *   5. Return `landed` (with the evidence) or `no-landing` (log path + reason) —
 *      the CALLER decides the claim's fate (stamp `in-review` vs hold+retry),
 *      never this function.
 *
 * Success is observed, not parsed from the session self-report (§5.2) — in either
 * mode. The session's exit code is recorded for the ledger, but it is the
 * independent observation in step 4 that gates `landed`.
 */
export function createDispatch(deps: DispatchDeps): Dispatch {
  const git = deps.git ?? realGit;
  const resolveTrunkFn = deps.trunk ?? ((root, g) => resolveTrunk(root, g));
  const hasRemote = deps.remote ?? ((root, g) => hasOrigin(root, g));
  const mode: Mode = deps.config.mode;

  return async (bead: Bead, lane: Route): Promise<DispatchResult> => {
    // 1–2. Worktree cut off the trunk (§3.3). In local mode there may be no
    //      remote at all, so the branch is cut from the local ref and no fetch runs.
    const trunk = await resolveTrunkFn(deps.repoRoot, git);
    const remote = mode === "github" ? true : await hasRemote(deps.repoRoot, git);
    const plan = planWorktree({
      repoRoot: deps.repoRoot,
      beadId: bead.id,
      slug: bead.title,
      branchPrefix: deps.config.branchPrefix,
      worktreeRoot: deps.config.worktreeRoot,
    });
    const { baseSha } = await createWorktree({
      repoRoot: deps.repoRoot,
      plan,
      trunk,
      git,
      remote,
    });

    // 3. Headless lane session in the worktree (§5.2). Its outcome is un-judged.
    const laneConfig = deps.config.lanes[lane];
    const spec: SessionSpec = {
      beadId: bead.id,
      ordinal: 1,
      prompt: lanePrompt(bead, laneConfig.skill, mode),
      worktree: plan.path,
      model: laneConfig.model,
      repoRoot: deps.repoRoot,
    };
    const session = await runSession(spec, deps.spawn);

    // 4. OBSERVE (§5.2). Mode decides what counts as evidence; nothing else does.
    if (mode === "github") {
      const prUrl = await ensurePr(deps.gh, plan.branch, bead, plan.path);
      if (prUrl !== null) {
        return { status: "landed", ref: prUrl, branch: plan.branch };
      }
      return { status: "no-landing", logPath: session.logPath, branch: plan.branch };
    }

    // Local: read the gate at dispatch time so editing substrate.yaml takes
    // effect without a daemon restart.
    const gate = deps.gate !== undefined ? deps.gate : loadGate(deps.repoRoot);
    const observed = await observeLocal({
      worktree: plan.path,
      baseSha,
      gate,
      git,
      shell: deps.shell,
    });
    if (observed.landed) {
      return {
        status: "landed",
        ref: `${plan.path}#${plan.branch}`,
        branch: plan.branch,
      };
    }
    return {
      status: "no-landing",
      logPath: session.logPath,
      branch: plan.branch,
      reason: observed.reason,
    };
  };
}

/**
 * Idempotent PR creation by observation (§6, spec Step 4.3): `gh pr view
 * <branch>` first — if a PR already exists (a prior, killed dispatch opened it)
 * return its url and create NOTHING. Only when view finds none do we `gh pr
 * create`. Re-running mid-flow therefore never yields a duplicate branch/PR.
 *
 * Returns the PR url on success, or `null` when neither an existing nor a freshly
 * created PR could be observed (the §5.2 `no-pr` failure signal).
 */
export async function ensurePr(
  gh: (argv: readonly string[]) => Promise<GhResult>,
  branch: string,
  bead: Bead,
  worktree: string,
): Promise<string | null> {
  // Observe first: does a PR for this head branch already exist?
  const view = await gh([
    "gh",
    "pr",
    "view",
    branch,
    "--json",
    "url",
    "--jq",
    ".url",
  ]);
  if (view.code === 0) {
    const url = view.stdout.trim();
    if (url) return url;
  }

  // None observed → create one from the worktree, then read back its url.
  const create = await gh([
    "gh",
    "pr",
    "create",
    "--head",
    branch,
    "--title",
    bead.title || bead.id,
    "--body",
    `serve: ${bead.id}`,
    "--fill",
  ]);
  if (create.code !== 0) {
    return null;
  }

  // Re-observe to get the canonical url (create may print it, but view is the
  // authoritative read and keeps the "observed" contract).
  const confirm = await gh([
    "gh",
    "pr",
    "view",
    branch,
    "--json",
    "url",
    "--jq",
    ".url",
  ]);
  if (confirm.code === 0) {
    const url = confirm.stdout.trim();
    if (url) return url;
  }
  // Fall back to whatever `gh pr create` printed (usually the PR url).
  const printed = create.stdout.trim();
  return printed || null;
}

/**
 * Compose the headless lane prompt (§5.2): the FACTS about this bead, plus the
 * skill invocation. Kept small + deterministic so the session spec is testable.
 *
 * The standing rules deliberately do NOT live here. They used to — this function
 * hardcoded "push the branch and open a PR with `gh pr create`" — which meant the
 * lane contract could only change by editing and re-releasing the daemon. They
 * now live in `skills/serve-bead/SKILL.md`, versioned with the repo. What the
 * prompt still carries is the state the skill cannot discover for itself: which
 * bead, its `kind` (the routing prior, passed as a HINT so the skill can adapt
 * its approach without a second routing decision), and the `mode`, which decides
 * whether the session pushes its branch or stops at a local commit.
 */
export function lanePrompt(bead: Bead, skill: string, mode: Mode = "local"): string {
  const lines = [
    `You are a substrate serve worker for bead ${bead.id}: "${bead.title}".`,
    `Kind: ${kindOf(bead) ?? "unknown"} · Labels: ${bead.labels.join(", ") || "(none)"}`,
    `Mode: ${mode}`,
  ];
  return [...lines, "", `Run /substrate:${skill} to execute this bead.`].join("\n");
}

/** How the triage of one named bead ended — surfaced for the print line + tests. */
export type TriageOutcome =
  | { status: "not-found"; bead: string }
  | { status: "in-review"; bead: string; lane: Route; priorKind: string | undefined; ref: string }
  | {
      status: "lane-failed";
      bead: string;
      lane: Route;
      priorKind: string | undefined;
      logPath: string;
      reason?: string;
    }
  | { status: "bounced"; bead: string; reason: string };

/**
 * Triage ONE named bead now (§3.2, Phase 3 Step 3.2 + §4 step 6). Shares the
 * tick's claim → route → dispatch path but skips the poll: no PR sweep, no
 * capacity check, no FIFO — the caller named the bead, we run its transition.
 *
 * Flow:
 *   1. Resolve the named bead off the board (groomed+open, via `queue.list`).
 *      Not found / not claimable → `not-found` (no mutation).
 *   2. Claim it (§3.1 groomed → claimed) — the committing step, same as the tick.
 *   3. Route it with the pure §5.1 `route()` decision (no model, human prior only).
 *      - bounce → `router.bounce` (release + re-apply `needs-spec` OR note the gap).
 *      - route  → stamp `route:<lane>`, then DISPATCH (§4 step 6, §5.2).
 *   4. On dispatch: success is OBSERVED (branch pushed ∧ PR open, §5.2) —
 *      `pr-open` → stamp `in-review` + `serve: PR <url>`; `no-pr` → HOLD the claim
 *      and note `serve: lane failed (log <path>)` (the human re-runs triage; the
 *      idempotent PR view means a rerun never dups a branch/PR). Triage is a
 *      one-shot verb, so the tick — not triage — owns the retry-once-then-bounce.
 *
 * Async because the real dispatch chain shells out; tests await it with a mocked
 * dispatch. No argv, no stdout, no process — that shell is {@link main}.
 */
export async function triage(id: string, deps: TriageDeps): Promise<TriageOutcome> {
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
    // claimed → bounced (§3.1) via `router.bounce`: release the claim, then either
    // re-apply the `needs-spec` label (spec lane is human) or note the grooming
    // gap. The `bounceAdapter` bridges the real `Queue` (which carries notes via
    // `stamp`) to the router's `BounceAdapter`, restoring the §3.1 re-label path.
    bounce(bounceAdapter(deps.queue), target, decision.reason);
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

  // Step 6 (§4) — DISPATCH the real chain: worktree + headless session + PR. The
  // result is OBSERVED, never self-reported (§5.2).
  const result = await dispatch(target, lane);

  if (result.status === "landed") {
    // routed → in-review (§3.1): flip the bead to `in-review` and record the
    // evidence — a PR url in github mode, `<worktree>#<branch>` in local mode, so
    // the board points straight at where the work is.
    deps.queue.stamp(target.id, {
      inReview: true,
      note: `serve: landed ${result.ref}`,
    });
    return { status: "in-review", bead: target.id, lane, priorKind, ref: result.ref };
  }

  // no-landing (§5.2): the lane did not land. HOLD the claim (do not release) and
  // note the failure with its log AND why, so the board says what went wrong; the
  // human re-runs triage (idempotent in both modes).
  deps.queue.stamp(target.id, {
    note: failureNote(result.logPath, result.reason),
  });
  return {
    status: "lane-failed",
    bead: target.id,
    lane,
    priorKind,
    logPath: result.logPath,
    reason: result.reason,
  };
}

/**
 * The working note recorded on a failed lane (§5.2). Carries the log path always,
 * and the observation's reason when there is one — local mode can say *why*
 * ("session made no commits", "gate failed: …"), which is the difference between
 * a board that explains itself and one that just says a bead came back.
 */
export function failureNote(logPath: string, reason?: string): string {
  return reason
    ? `serve: lane failed — ${reason} (log ${logPath})`
    : `serve: lane failed (log ${logPath})`;
}

const USAGE = `substrate triage — claim + route ONE bead now (serve-v1)

usage:
  substrate triage <bead-id> [--repo <path>]

Runs the daemon's claim → route path for ONE named bead immediately, skipping the
poll wait. The bead must be on the board (groomed + open). Claims it, routes it by
its \`kind:\` label (§5.1), stamps the route, then DISPATCHES it — cuts a worktree,
runs a headless lane session, and opens a PR (idempotent: an existing PR is reused,
never duplicated) — flipping the bead to \`in-review\` with the PR url. A bead that
is un-routable (needs-spec / missing kind) is bounced back to the board instead.

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
    case "in-review":
      return `triage: ${outcome.bead} → route:${outcome.lane} → in-review (${outcome.ref})`;
    case "lane-failed":
      return `triage: ${outcome.bead} → route:${outcome.lane} — ${
        outcome.reason ?? "lane failed"
      } (log ${outcome.logPath}); claim held, re-run to retry`;
    case "bounced":
      return `triage: ${outcome.bead} bounced — ${outcome.reason}`;
  }
}

/**
 * Production {@link SpawnFn} (§5.2): shell out to `claude` (or any command),
 * inheriting stdio-less capture, resolving with the exit code + collected stdout.
 * Node builtins only — no new deps.
 */
export const realSpawn: SpawnFn = (command, args, cwd) =>
  new Promise((resolvePromise) => {
    const child = spawn(command, [...args], { cwd });
    let stdout = "";
    child.stdout?.on("data", (d: Buffer) => {
      stdout += d.toString("utf8");
    });
    child.on("error", () => resolvePromise({ exitCode: 127, stdout }));
    child.on("close", (code) => resolvePromise({ exitCode: code, stdout }));
  });

/** Production `gh`/`git` runner for the idempotent PR loop — `argv[0]` is the binary. */
export const realGh = (argv: readonly string[]): Promise<GhResult> =>
  new Promise((resolvePromise) => {
    const [bin, ...rest] = argv;
    const child = spawn(bin ?? "", rest, {});
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (d: Buffer) => {
      stdout += d.toString("utf8");
    });
    child.stderr?.on("data", (d: Buffer) => {
      stderr += d.toString("utf8");
    });
    child.on("error", () => resolvePromise({ code: 127, stdout, stderr }));
    child.on("close", (code) => resolvePromise({ code: code ?? 1, stdout, stderr }));
  });

/**
 * The thin argv shell (§2.1): parse argv, build a real {@link Queue} bound to the
 * target repo, assemble the REAL dispatch chain (worktree + session + PR), run
 * {@link triage} for the named bead, print one result line. Exit non-zero on a
 * usage error or a bead that was not on the board.
 */
export async function main(argv: string[] = process.argv.slice(2)): Promise<void> {
  const parsed = parseArgs(argv);
  if (parsed === null) {
    process.stdout.write(USAGE);
    return;
  }
  const { repo, bead } = parsed;

  const queue = new Queue({ cwd: repo });
  const config = loadConfig(repo);
  const dispatch = createDispatch({
    repoRoot: repo,
    config,
    spawn: realSpawn,
    gh: realGh,
  });
  const outcome = await triage(bead, { queue, dispatch });

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
  main().catch((err: unknown) => {
    process.stderr.write(`triage: ${String(err)}\n`);
    process.exit(1);
  });
}
