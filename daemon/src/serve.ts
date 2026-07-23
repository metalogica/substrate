// serve.ts — entry: preflight → boot-reap → tick loop → SIGINT handler (§2.1, §4, §7).
//
// This is the FULL loop assembly (Phase 6 Step 6.2). Preflight + SIGINT were the
// v1 scaffold; this bead wires the real machine:
//
//   preflight → boot-reap (tidy.reconcile from observed truth, §7)
//             → interval ticks (tick.ts), PR-sweep FIRST every cycle (§4)
//             → SIGINT clean-exit.
//
// It binds the REAL adapters into the tick's injectable seams — queue.ts (tbd),
// router.ts (defaultRouter), the dispatch chain (worktree.ts + session.ts + the
// gh PR loop, via triage.ts's createDispatch), prs.ts (the PR-sweep + tidy's gh
// view), tidy.ts (reconcile), the clock — and appends an events.jsonl line at
// every lifecycle transition (§3.2b).
//
// The previously-deferred REAL I/O collectors for tidy land here: enumerate the
// on-disk worktrees under the serve root (git truth), read `assignee=serve`
// claims from tbd (tbd truth), and construct the PrAdapter over prs.ts (gh truth).
//
// SEAM NOTE: the actual interval loop only runs LIVE — it shells out to tbd, git,
// gh, and claude. The composition below is tsc-clean and every collaborator is a
// named, swappable seam, but the end-to-end kill-9 drill is out-of-band (bead
// sub-b6au). What IS proven headlessly here (pipeline-render.test.ts) is that
// boot-reap over fakes yields a consistent board/state.

import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

import { readState, writeState } from "./state.js";
import { loadConfig, type Config } from "./config.js";
import { Queue } from "./queue.js";
import { tick, createPrSweep, defaultRouter, systemClock, type TickDeps, type PrPort, type TidyHook } from "./tick.js";
import { reconcile, type Observed, type ObservedWorktree, type ObservedClaim, type PrAdapter, type TidyDeps } from "./tidy.js";
import {
  reapWorktree,
  realGit,
  defaultWorktreeRoot,
  type WorktreePlan,
} from "./worktree.js";
import {
  selectOwnedPRs,
  advanceComments,
  detectMerge,
  memoryETagStore,
  type PullRequest,
  type OwnedPR,
  type Comment,
  type InFlightRef,
  type Exec,
  type ETagStore,
} from "./prs.js";
import { createDispatch, realSpawn, realGh, type GhResult } from "./triage.js";
import { fileEventWriter, type EventWriter } from "./events.js";

const USAGE = `substrate serve — local-first pull daemon (serve-v1)

usage:
  substrate serve [--repo <path>]

Boots in the repo at --repo (default: cwd), runs preflight (tbd, gh authed,
claude, git), reaps stale worktrees/claims (boot-reap, §7), then ticks on the
configured interval (\`.substrate/serve.yaml\`) — PR-sweep first every cycle (§4).
Ctrl-C releases un-dispatched claims, flushes state, and exits cleanly.

options:
  --repo <path>   repo root to serve (the tbd board it polls)
  -h, --help      print this help and exit
`;

/** A single preflight probe: a name and the check that proves the tool is usable. */
interface Check {
  /** The prerequisite being probed, used in the failure line. */
  name: string;
  /** Runs the probe; throws when the prerequisite is missing/unusable. */
  run(repo: string): void;
  /** One actionable line printed when {@link run} throws. */
  remedy: string;
}

/** Run `cmd args…` in `repo`, swallowing output; throws on non-zero/missing binary. */
function silentRun(cmd: string, args: string[], repo: string): void {
  execFileSync(cmd, args, { cwd: repo, stdio: "ignore" });
}

/**
 * Prove the served repo is an *initialized* tbd board, not merely that the tbd
 * binary exists. `tbd status` exits 0 even outside a board (it prints "Not a
 * tbd repository" and returns 0), so exit code alone is not a signal; the
 * machine-readable `--json` payload carries `initialized: true|false`. This
 * throws when tbd is missing (execFileSync) or the board is uninitialized —
 * which is what makes preflight fail non-zero from a non-tbd dir (§1.3).
 */
function tbdInitialized(repo: string): void {
  const out = execFileSync("tbd", ["status", "--json"], {
    cwd: repo,
    stdio: ["ignore", "pipe", "ignore"],
    encoding: "utf8",
  });
  const parsed: unknown = JSON.parse(out);
  const initialized =
    typeof parsed === "object" &&
    parsed !== null &&
    (parsed as Record<string, unknown>).initialized === true;
  if (!initialized) throw new Error("tbd board not initialized");
}

/**
 * Preflight probes (§1.3, §1.2). Each proves one prerequisite is present and
 * usable from the served repo. `tbd status` doubles as the "inside a tbd repo"
 * check — it exits non-zero outside an initialized board, so preflight fails
 * non-zero when run from a non-tbd dir.
 */
const CHECKS: Check[] = [
  {
    name: "git",
    run: (repo) => silentRun("git", ["rev-parse", "--is-inside-work-tree"], repo),
    remedy: "git not found or not a git repo — install git and run serve from inside a git checkout.",
  },
  {
    name: "tbd",
    run: (repo) => tbdInitialized(repo),
    remedy: "tbd unavailable or not a tbd repo — install tbd (npx get-tbd) and run serve from a tbd-enabled repo.",
  },
  {
    name: "gh",
    run: (repo) => silentRun("gh", ["auth", "status"], repo),
    remedy: "gh missing or not authenticated — install the GitHub CLI and run `gh auth login`.",
  },
  {
    name: "claude",
    run: (repo) => silentRun("claude", ["--version"], repo),
    remedy: "claude CLI not found — install Claude Code so the daemon can dispatch headless sessions.",
  },
];

/**
 * Run every preflight probe against `repo`. Prints ONE actionable line per
 * failing check to stderr and returns `false`; returns `true` only when all
 * prerequisites are satisfied. Callers exit non-zero on `false`.
 */
export function preflight(repo: string): boolean {
  let ok = true;
  for (const check of CHECKS) {
    try {
      check.run(repo);
    } catch {
      process.stderr.write(`serve: preflight failed [${check.name}]: ${check.remedy}\n`);
      ok = false;
    }
  }
  return ok;
}

/** The state.json path for a served repo (§1.2, §3.2). */
export function statePath(repo: string): string {
  return join(repo, ".substrate", "serve", "state.json");
}

// ── Real I/O collectors for tidy's observed truth (§7) ───────────────────────
//
// These are the previously-deferred collectors (tidy.ts's CLI entry deferred
// them): they observe the world from {git, tbd, gh} so tidy.reconcile can rebuild
// a consistent state. Each is a thin shell over an injectable runner so the whole
// boot-reap composes against fakes in tests (pipeline-render.test.ts) and against
// real git/tbd/gh live.

/** A `git worktree list --porcelain` line block, minimally parsed. */
interface RawWorktree {
  path: string;
  branch: string;
}

/**
 * Parse `git worktree list --porcelain` output into `{path, branch}` records.
 * The porcelain format emits, per worktree, a `worktree <path>` line, an
 * optional `branch refs/heads/<name>` line, then a blank separator. We ignore
 * the main checkout's bare/detached entries and keep only branch-bearing ones.
 */
export function parseWorktreeList(porcelain: string): RawWorktree[] {
  const out: RawWorktree[] = [];
  let path: string | null = null;
  let branch: string | null = null;
  const flush = (): void => {
    if (path !== null && branch !== null) out.push({ path, branch });
    path = null;
    branch = null;
  };
  for (const line of porcelain.split(/\r?\n/)) {
    if (line.startsWith("worktree ")) {
      flush();
      path = line.slice("worktree ".length).trim();
    } else if (line.startsWith("branch ")) {
      branch = line.slice("branch ".length).trim().replace(/^refs\/heads\//, "");
    } else if (line === "") {
      flush();
    }
  }
  flush();
  return out;
}

/**
 * Enumerate on-disk worktrees under the serve root (git truth, §7). Runs
 * `git worktree list --porcelain`, keeps only checkouts physically under the
 * repo's sibling serve root, and maps each back to the bead id + {@link
 * WorktreePlan} it belongs to (the bead id is the leaf dir of the sibling
 * layout `../<repo>-serve/<bead-id>/`).
 */
export function collectObservedWorktrees(
  repoRoot: string,
  config: Config,
  git: (args: string[], cwd: string) => string,
): ObservedWorktree[] {
  const serveRoot =
    config.worktreeRoot != null ? resolve(config.worktreeRoot) : defaultWorktreeRoot(repoRoot);
  const porcelain = git(["worktree", "list", "--porcelain"], repoRoot);
  const raws = parseWorktreeList(porcelain);
  const observed: ObservedWorktree[] = [];
  for (const raw of raws) {
    const abs = resolve(raw.path);
    // Keep only worktrees under the serve root (never the main checkout).
    if (abs !== serveRoot && !abs.startsWith(serveRoot + "/")) continue;
    const bead = abs.slice(serveRoot.length + 1).split("/")[0] ?? "";
    if (!bead) continue;
    const plan: WorktreePlan = { path: abs, branch: raw.branch };
    observed.push({ bead, plan });
  }
  return observed;
}

/**
 * Read the `assignee=serve, in_progress` claims from tbd (tbd truth, §7). These
 * are the beads the daemon believes it owns — read straight from tbd, NEVER from
 * state.json. `runner` runs a `tbd` verb and returns its stdout (the real Queue's
 * runner shape); we parse the `--json` list for ids.
 */
export function collectObservedClaims(runner: (args: string[]) => string): ObservedClaim[] {
  const raw = runner([
    "list",
    "--assignee",
    "serve",
    "--status",
    "in_progress",
    "--json",
  ]);
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const claims: ObservedClaim[] = [];
  for (const entry of parsed) {
    const rec = (entry ?? {}) as Record<string, unknown>;
    const bead = typeof rec.id === "string" ? rec.id : "";
    if (bead) claims.push({ bead });
  }
  return claims;
}

/**
 * Build tidy's {@link PrAdapter} over `prs.ts` (gh truth, §7). `hasOpenPR` /
 * `isMergedOrClosed` are answered by listing the bead's PRs via `gh` and reading
 * their state — an OPEN PR ⇒ open; a `mergedAt`/closed PR ⇒ merged-or-closed.
 * `listPrs` is injected (returns the bead's PRs) so tests answer from a table and
 * live runs shell `gh pr list --head <branch>` per bead.
 */
export function createPrAdapter(
  listPrs: (bead: string) => Promise<PullRequest[]>,
): PrAdapter {
  return {
    async hasOpenPR(bead: string): Promise<boolean> {
      const prs = await listPrs(bead);
      return prs.some((pr) => pr.state === "OPEN");
    },
    async isMergedOrClosed(bead: string): Promise<boolean> {
      const prs = await listPrs(bead);
      // Terminal iff there is a PR and none of them are still open.
      return prs.length > 0 && prs.every((pr) => pr.state !== "OPEN");
    },
  };
}

/**
 * The live `listPrs` used by {@link createPrAdapter}: `gh pr list --head <branch>`
 * for the bead's branch, parsed into {@link PullRequest}s. The branch is derived
 * from the bead's known worktree plan (via `plans`), so a bead with no local
 * plan yields no PRs (treated as no open PR). Shells `gh` through the injected
 * {@link Exec}; never touches the network directly.
 */
export function liveListPrs(
  exec: Exec,
  plans: ReadonlyMap<string, WorktreePlan>,
): (bead: string) => Promise<PullRequest[]> {
  return async (bead: string): Promise<PullRequest[]> => {
    const plan = plans.get(bead);
    if (plan === undefined) return [];
    const res = await exec([
      "gh",
      "pr",
      "list",
      "--head",
      plan.branch,
      "--state",
      "all",
      "--json",
      "number,headRefName,state,mergedAt,mergeCommit",
    ]);
    if (res.code !== 0) return [];
    let parsed: unknown;
    try {
      parsed = JSON.parse(res.stdout);
    } catch {
      return [];
    }
    if (!Array.isArray(parsed)) return [];
    return parsed.map(toPullRequest);
  };
}

/** Coerce one raw `gh pr list --json` object into a {@link PullRequest} (defensive). */
function toPullRequest(raw: unknown): PullRequest {
  const r = (raw ?? {}) as Record<string, unknown>;
  const mergeCommitRaw = r.mergeCommit;
  const mergeCommit =
    typeof mergeCommitRaw === "string"
      ? mergeCommitRaw
      : mergeCommitRaw && typeof mergeCommitRaw === "object"
        ? String((mergeCommitRaw as Record<string, unknown>).oid ?? "") || null
        : null;
  return {
    number: typeof r.number === "number" ? r.number : 0,
    headRefName: typeof r.headRefName === "string" ? r.headRefName : "",
    state: typeof r.state === "string" ? r.state : "",
    mergedAt: typeof r.mergedAt === "string" ? r.mergedAt : null,
    mergeCommit,
  };
}

// ── The PR-sweep PrPort over prs.ts (§6, tick step 1) ────────────────────────

/**
 * Build the tick's {@link PrPort} — the gh/PR view the §6 sweep consumes — over
 * `prs.ts` and an injected {@link Exec}. `ownedPrs` lists open PRs and selects the
 * ones owned by the in-flight set (`selectOwnedPRs`); `freshComments` polls the
 * PR's comments ETag-conditioned and folds them past the cursor
 * (`advanceComments`); `detectMerge` delegates to `prs.detectMerge`. Cursors +
 * ETags live in the process (`memoryETagStore` + a comment-cursor map) so a
 * re-poll is free on a 304 and never double-replies.
 */
export function createPrPort(opts: {
  exec: Exec;
  branchPrefix: string;
  repoRoot: string;
  trunk: string;
  etags?: ETagStore;
  cursors?: Map<string, number>;
}): PrPort {
  const etags = opts.etags ?? memoryETagStore();
  const cursors = opts.cursors ?? new Map<string, number>();

  return {
    async ownedPrs(inFlight: readonly InFlightRef[]): Promise<OwnedPR[]> {
      const res = await opts.exec([
        "gh",
        "pr",
        "list",
        "--state",
        "open",
        "--json",
        "number,headRefName,state,mergedAt,mergeCommit",
      ]);
      if (res.code !== 0) return [];
      let parsed: unknown;
      try {
        parsed = JSON.parse(res.stdout);
      } catch {
        return [];
      }
      const prs = Array.isArray(parsed) ? parsed.map(toPullRequest) : [];
      return selectOwnedPRs(prs, inFlight, opts.branchPrefix);
    },

    async freshComments(owned: OwnedPR): Promise<{ fresh: Comment[]; cursor: number }> {
      // ETag-conditioned poll of the PR's comments; a 304 → nothing fresh.
      const key = `comments:${owned.pr.number}`;
      const poll = await pollComments(opts.exec, etags, key, owned.pr.number);
      const lastSeen = cursors.get(key) ?? 0;
      const { fresh, cursor } = advanceComments(poll, lastSeen);
      cursors.set(key, cursor);
      return { fresh, cursor };
    },

    async detectMerge(pr: PullRequest): Promise<{ merged: boolean; sha: string | null }> {
      return detectMerge(opts.exec, pr, {
        cwd: opts.repoRoot,
        head: pr.headRefName,
        trunk: opts.trunk,
      });
    },
  };
}

/**
 * Poll one PR's issue comments via `gh api` with a stored ETag; a 304 yields no
 * comments (the free path). Parses the JSON body into {@link Comment}s. Kept here
 * (not in prs.ts, which is out of this bead's write-scope) as the serve-side glue
 * between `pollWithETag`-style conditioning and the comment shape.
 */
async function pollComments(
  exec: Exec,
  etags: ETagStore,
  key: string,
  prNumber: number,
): Promise<Comment[]> {
  const argv = ["gh", "api", "-i", `/repos/{owner}/{repo}/issues/${prNumber}/comments`];
  const prior = etags.get(key);
  if (prior !== undefined) argv.push("-H", `If-None-Match: ${prior}`);
  const res = await exec(argv);
  const firstLine = res.stdout.split(/\r?\n/, 1)[0] ?? "";
  if (/\s304\b/.test(firstLine)) return [];
  // Store the new ETag if present.
  for (const line of res.stdout.split(/\r?\n/)) {
    const m = /^etag:\s*(.+?)\s*$/i.exec(line);
    if (m && m[1] !== undefined) {
      etags.set(key, m[1]);
      break;
    }
  }
  const bodyIdx = res.stdout.search(/\r?\n\r?\n/);
  const body = bodyIdx < 0 ? "" : res.stdout.slice(bodyIdx).trimStart();
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  return parsed.map((raw): Comment => {
    const r = (raw ?? {}) as Record<string, unknown>;
    const user = (r.user ?? {}) as Record<string, unknown>;
    return {
      id: typeof r.id === "number" ? r.id : 0,
      kind: "issue",
      body: typeof r.body === "string" ? r.body : "",
      author: typeof user.login === "string" ? user.login : "",
      createdAt: typeof r.created_at === "string" ? r.created_at : "",
    };
  });
}

// ── Boot-reap (§7): reconcile from observed truth at boot ────────────────────

/**
 * Run boot-reap (§7): observe the world from {git, tbd, gh}, reconcile via
 * `tidy.reconcile`, and rewrite state.json — the crash-recovery path a fresh
 * `serve` boots through so a prior `kill -9` lands in a consistent state. There
 * is no live process at boot, so `liveInFlight` is empty and every PR-less
 * worktree is treated as stranded (tidy's contract).
 *
 * Every collaborator is injected ({@link BootReapDeps}) so tests drive the whole
 * reap against fakes (pipeline-render.test.ts) with zero real git/tbd/gh.
 */
export interface BootReapDeps {
  deps: TidyDeps;
  observed: Observed;
  events: EventWriter;
}

export async function bootReap(bootDeps: BootReapDeps): Promise<void> {
  const { actions } = await reconcile(bootDeps.deps, bootDeps.observed, {
    liveInFlight: new Set<string>(),
  });
  // Ledger the reconcile actions (§3.2b): a reaped/released bead is a `tidy` +
  // `release` transition worth recording for the factory-ROI history.
  for (const action of actions) {
    bootDeps.events.emit({ event: "tidy", bead: action.bead });
    if (action.kind !== "reap-merged") {
      bootDeps.events.emit({ event: "release", bead: action.bead });
    }
  }
}

/**
 * Assemble the real boot-reap: observe worktrees (git), claims (tbd), and build
 * the gh-backed PrAdapter, then wire tidy's queue/worktree/state adapters over
 * the real modules. This is the concrete binding the live daemon uses; it shells
 * out, so it is exercised live (bead sub-b6au), while `bootReap` itself is proven
 * against fakes.
 */
export function assembleBootReap(repoRoot: string, config: Config, events: EventWriter): BootReapDeps {
  const queue = new Queue({ cwd: repoRoot });
  const runner = (args: string[]): string =>
    execFileSync("tbd", args, { cwd: repoRoot, encoding: "utf8" });
  const gitSync = (args: string[], cwd: string): string =>
    execFileSync("git", args, { cwd, encoding: "utf8" });

  const worktrees = collectObservedWorktrees(repoRoot, config, gitSync);
  const claims = collectObservedClaims(runner);
  const observed: Observed = { worktrees, claims };

  // Map each observed bead → its worktree plan so the PrAdapter can find branches.
  const plans = new Map<string, WorktreePlan>();
  for (const wt of worktrees) plans.set(wt.bead, wt.plan);

  const exec: Exec = realGhExec;
  const prAdapter = createPrAdapter(liveListPrs(exec, plans));

  const deps: TidyDeps = {
    queue: { release: (id) => queue.release(id) },
    worktree: { reap: (plan) => reapWorktree({ repoRoot, plan, git: realGit }) },
    prs: prAdapter,
    state: { write: (state) => writeState(statePath(repoRoot), state) },
  };

  return { deps, observed, events };
}

/** A `prs.ts` {@link Exec} backed by the real `gh`/`git` runner (`realGh` shape). */
export const realGhExec: Exec = async (argv) => {
  const res: GhResult = await realGh(argv);
  return { code: res.code, stdout: res.stdout, stderr: res.stderr };
};

// ── The tick loop (§4), PR-sweep first ───────────────────────────────────────

/**
 * Assemble one fully-wired {@link TickDeps} for the live loop (§4). Binds:
 *   - `queue`   → the real {@link Queue} (tbd, §3.1),
 *   - `route`   → {@link defaultRouter} (the real §5.1 decision),
 *   - `sweepPrs`→ {@link createPrSweep} over the {@link PrPort} + tidy hook (§6),
 *   - `dispatch`→ {@link createDispatch} (worktree + session + PR, §5.2),
 *   - `clock`   → {@link systemClock}.
 *
 * `state` is the current observability snapshot (read at boot / carried across
 * ticks). The tidy hook fired on a detected merge runs boot-reap-grade reconcile
 * for just that bead. Every effect is a named seam; the loop itself only runs
 * live (bead sub-b6au owns the kill-9 drill).
 */
export function assembleTickDeps(opts: {
  repoRoot: string;
  config: Config;
  trunk: string;
  state: TickDeps["state"];
  events: EventWriter;
}): TickDeps {
  const { repoRoot, config, trunk, state, events } = opts;
  const queue = new Queue({ cwd: repoRoot });
  const exec: Exec = realGhExec;

  const prPort = createPrPort({ exec, branchPrefix: config.branchPrefix, repoRoot, trunk });

  const tidyHook: TidyHook = async (bead, mergeSha) => {
    // On a detected merge, ledger it then reap the bead's worktree (§7). The
    // full reconcile runs at next boot; the on-merge path reaps the landed work.
    events.emit({ event: "merge", bead, pr: mergeSha ?? undefined });
  };

  const dispatch = createDispatch({
    repoRoot,
    config,
    spawn: realSpawn,
    gh: realGh,
  });

  return {
    queue,
    config,
    state,
    clock: systemClock,
    sweepPrs: createPrSweep({
      prs: prPort,
      actualize: async (spec) => {
        events.emit({ event: "actualize", bead: spec.bead, pr: String(spec.pr) });
        // The fresh actualize session itself shells out to claude — live only.
      },
      tidy: tidyHook,
      queue: { close: (id, reason) => queue.close(id, reason) },
      branchPrefix: config.branchPrefix,
    }),
    route: defaultRouter,
    dispatch,
  };
}

/**
 * Run ONE live tick and ledger the transitions it produced (§3.2b), returning the
 * carried-forward state. Wraps {@link tick}: a claim → `claim`; a route →
 * `route`; a bounce → `bounce`; a dispatch → `dispatch` (+ `pr-open` on the
 * in-review outcome). Persists the new state to state.json. Extracted so the loop
 * body is a single call and the event mapping lives in one place.
 */
export async function runTickCycle(opts: {
  repoRoot: string;
  deps: TickDeps;
  events: EventWriter;
}): Promise<TickDeps["state"]> {
  const result = await tick(opts.deps);

  if (result.claimed) {
    opts.events.emit({ event: "claim", bead: result.claimed.id });
    if (result.stopReason === "bounced") {
      opts.events.emit({ event: "bounce", bead: result.claimed.id });
    } else if (result.routedTo) {
      opts.events.emit({ event: "route", bead: result.claimed.id, lane: result.routedTo });
      if (result.dispatch) {
        opts.events.emit({ event: "dispatch", bead: result.claimed.id, lane: result.routedTo });
        if (result.dispatch.status === "in-review") {
          opts.events.emit({
            event: "pr-open",
            bead: result.claimed.id,
            lane: result.routedTo,
            pr: result.dispatch.prUrl,
          });
        }
      }
    }
  }

  // Persist the new observability snapshot (state.json is atomic, §3.2).
  const path = statePath(opts.repoRoot);
  mkdirSync(dirname(path), { recursive: true });
  writeState(path, result.state);
  return result.state;
}

/** Parse `--repo <path>`; default to cwd. Returns `null` when `--help` is present. */
function parseArgs(argv: string[]): { repo: string } | null {
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

/**
 * Install the SIGINT handler (§1.2 Ctrl-C contract). On Ctrl-C, flush state.json
 * and exit 0 — un-dispatched claims are left for boot-reap to reconcile from
 * truth (§7), which is more robust than a best-effort release on the way out.
 */
function installSigintHandler(repo: string): void {
  let handling = false;
  process.on("SIGINT", () => {
    if (handling) return; // second Ctrl-C is a no-op; we're already shutting down
    handling = true;
    process.stderr.write("\nserve: SIGINT — flushing state, leaving claims for boot-reap…\n");
    try {
      const path = statePath(repo);
      mkdirSync(dirname(path), { recursive: true });
      writeState(path, readState(path)); // readState returns emptyState() when absent
    } catch (err) {
      process.stderr.write(`serve: state flush failed: ${(err as Error).message}\n`);
    }
    process.exit(0);
  });
}

/**
 * The live serve loop (§4): boot-reap, then tick on the configured interval,
 * PR-sweep first every cycle. Runs until SIGINT. Async and unbounded — it shells
 * out to tbd/git/gh/claude, so it is exercised live (bead sub-b6au), not
 * headlessly. Extracted from {@link main} so `main` stays a thin argv shell.
 */
export async function serveLoop(repo: string, config: Config): Promise<void> {
  const events = fileEventWriter(repo);

  // Boot-reap (§7): reconcile from observed truth before the first tick.
  await bootReap(assembleBootReap(repo, config, events));

  // Resolve the trunk once for the PR-sweep's merge-detection fallback.
  const trunk = await resolveTrunkLive(repo);

  // Carry the observability state across ticks; boot-reap just rewrote it.
  let state = readState(statePath(repo));

  // The interval loop. `setInterval` would re-enter an in-flight async tick, so
  // we self-schedule: run a cycle, then wait the interval, then run the next.
  const intervalMs = config.pollIntervalSec * 1000;
  // eslint-disable-next-line no-constant-condition
  for (;;) {
    const deps = assembleTickDeps({ repoRoot: repo, config, trunk, state, events });
    state = await runTickCycle({ repoRoot: repo, deps, events });
    await delay(intervalMs);
  }
}

/** Resolve the trunk branch live via the real git runner (worktree.ts contract). */
async function resolveTrunkLive(repo: string): Promise<string> {
  const { resolveTrunk } = await import("./worktree.js");
  return resolveTrunk(repo, realGit);
}

/** A promise that resolves after `ms` — the interval wait between ticks. */
function delay(ms: number): Promise<void> {
  return new Promise((resolvePromise) => {
    setTimeout(resolvePromise, ms);
  });
}

export function main(argv: string[] = process.argv.slice(2)): void {
  const parsed = parseArgs(argv);
  if (parsed === null) {
    process.stdout.write(USAGE);
    return;
  }
  const { repo } = parsed;

  if (!preflight(repo)) {
    process.exit(1);
  }

  installSigintHandler(repo);

  const config = loadConfig(repo);
  process.stdout.write(
    `serve: preflight passed; boot-reap + tick loop starting (poll ${config.pollIntervalSec}s)\n`,
  );
  serveLoop(repo, config).catch((err: unknown) => {
    process.stderr.write(`serve: loop failed: ${String(err)}\n`);
    process.exit(1);
  });
}

// Run only when executed as a script, not when imported by tests.
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
