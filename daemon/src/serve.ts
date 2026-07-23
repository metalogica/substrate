// serve.ts — entry: preflight → boot-reap → tick loop → SIGINT handler (§2.1).
// v1 scaffold: this bead is CLI wiring + preflight + signal handling only. The
// boot-reap and tick loop (§4) land in later beads — see the TODO below.

import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";

import { readState, writeState } from "./state.js";

const USAGE = `substrate serve — local-first pull daemon (serve-v1)

usage:
  substrate serve [--repo <path>]

Boots in the repo at --repo (default: cwd), runs preflight (tbd, gh authed,
claude, git), reaps stale worktrees/claims, then ticks on the configured
interval (\`.substrate/serve.yaml\`). Ctrl-C releases un-dispatched claims,
flushes state, and exits cleanly.

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
 * Install the SIGINT handler (§1.2 Ctrl-C contract). On Ctrl-C, release
 * un-dispatched claims, flush state.json, and exit 0 — worktrees are left for
 * boot-reap. The claim-release wiring lands with the queue adapter (later
 * beads); until then the handler flushes state and exits cleanly.
 */
function installSigintHandler(repo: string): void {
  let handling = false;
  process.on("SIGINT", () => {
    if (handling) return; // second Ctrl-C is a no-op; we're already shutting down
    handling = true;
    process.stderr.write("\nserve: SIGINT — releasing un-dispatched claims, flushing state…\n");
    // TODO(serve-v1, later bead): release un-dispatched claims via queue.ts
    //   (tbd release + drop `assignee=serve`) before flushing. The worktrees of
    //   dispatched beads are intentionally left for boot-reap (§7).
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

  // TODO(serve-v1, later bead): boot-reap (§7) then the tick loop (§4) —
  //   sweep owned PRs → capacity check → discover → claim → route → dispatch,
  //   every `config.pollIntervalSec`. This bead wires the CLI, preflight, and
  //   signal handling only; the scheduler is a stub.
  process.stdout.write("serve: preflight passed; tick loop not yet implemented (stub)\n");
}

main();
