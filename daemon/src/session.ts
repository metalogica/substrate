// session.ts — the headless lane session contract (spec §5.2 + §3.2b).
//
// Spawns a single headless `claude -p` session in a bead's worktree, tees its
// output to a per-bead session log, and parses token/cost usage from the JSON
// result for the events.jsonl ledger (§3.2b).
//
// CONTRACT — SUCCESS IS NOT DECIDED HERE. Per §5.2, a lane's success is
// *observed* by the caller (branch pushed ∧ PR open), NEVER parsed from the
// session's self-report — `claude -p` output/behavior drift is an accepted v1
// risk (spec §8 risk table). This module therefore returns only the RAW outcome
// (exit code, parsed usage, log path). It makes no pass/fail judgement; the
// dispatch loop verifies the PR by observation and interprets these fields.

import { appendFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";

/**
 * Token/cost usage extracted from a headless session's `--output-format json`
 * result, in the shape the events.jsonl ledger stores (§3.2b).
 */
export interface Usage {
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

/**
 * The raw, un-judged outcome of a headless session (§5.2). Note the deliberate
 * absence of any `success` field: this module does not decide success — the
 * caller does, by observing the branch/PR. `usage` is `null` when the result
 * JSON could not be parsed or carried no usage (the session may still have
 * succeeded — verify by observation, not by this).
 */
export interface SessionOutcome {
  /** Process exit code; `null` if the process was terminated by a signal. */
  exitCode: number | null;
  /** Parsed usage for the ledger, or `null` when unavailable/unparseable. */
  usage: Usage | null;
  /** Absolute-or-repo-relative path to the appended session log. */
  logPath: string;
  /** The full raw stdout captured (also written to {@link logPath}). */
  rawOutput: string;
}

/** Inputs describing one lane session to spawn (§5.2). */
export interface SessionSpec {
  /** Bead id — names the log file. */
  beadId: string;
  /** Session ordinal `n` — the `.<n>.` in the log filename. */
  ordinal: number;
  /** The fully-composed lane prompt (bead + rules + skill invocation). */
  prompt: string;
  /** The bead's worktree; becomes the spawned process `cwd`. */
  worktree: string;
  /** Model override for `--model`, or `null` to inherit the session default. */
  model: string | null;
  /**
   * Repo root under which `.substrate/serve/logs/` lives. The log is written
   * here, NOT in the worktree, so logs survive worktree reaping (§7 tidy).
   */
  repoRoot: string;
}

/**
 * The result of running the spawn command: its exit code and the captured
 * stdout. This is the seam tests mock — a {@link SpawnFn} lets `runSession`
 * be proven with a recorded JSON fixture and no real `claude` invocation.
 */
export interface SpawnResult {
  exitCode: number | null;
  stdout: string;
}

/**
 * Injectable spawn seam. Given the command, argv, and cwd, run it to completion
 * and resolve with its exit code + captured stdout. The production
 * implementation shells out to `claude`; tests substitute a mock.
 */
export type SpawnFn = (
  command: string,
  args: readonly string[],
  cwd: string,
) => Promise<SpawnResult>;

/**
 * The subset of the `claude -p --output-format json` result we depend on. Only
 * the usage/cost fields are load-bearing; everything else is drift-tolerant and
 * intentionally not modelled. `usage.input_tokens` / `usage.output_tokens` are
 * the CLI's snake_case token counts; `total_cost_usd` is the run cost.
 */
interface ClaudeJsonResult {
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
  };
  total_cost_usd?: number;
}

/**
 * Build the argv for the headless spawn, verbatim per §5.2:
 *
 *   claude -p "<prompt>" --output-format json --dangerously-skip-permissions [--model <model>]
 *
 * `--model` is appended only when a lane pins one. Returns the `claude` command
 * separately from its args so the {@link SpawnFn} seam receives them unsplit.
 */
export function buildSpawnArgs(spec: SessionSpec): {
  command: string;
  args: string[];
} {
  const args = [
    "-p",
    spec.prompt,
    "--output-format",
    "json",
    "--dangerously-skip-permissions",
  ];
  if (spec.model !== null) {
    args.push("--model", spec.model);
  }
  return { command: "claude", args };
}

/**
 * Form the per-bead session log path (§5.2):
 *   <repoRoot>/.substrate/serve/logs/<bead-id>.<n>.log
 * where `n` is the session ordinal.
 */
export function sessionLogPath(
  repoRoot: string,
  beadId: string,
  ordinal: number,
): string {
  return join(
    repoRoot,
    ".substrate",
    "serve",
    "logs",
    `${beadId}.${ordinal}.log`,
  );
}

/**
 * Parse usage from a headless session's raw JSON stdout (§3.2b). Returns `null`
 * when the output is not valid JSON or carries no usage — a `null` here is NOT
 * a failure signal (success is observed, not parsed); it only means the ledger
 * entry has no usage for this session.
 */
export function parseUsage(rawOutput: string): Usage | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawOutput);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;

  const result = parsed as ClaudeJsonResult;
  const inputTokens = result.usage?.input_tokens;
  const outputTokens = result.usage?.output_tokens;
  const costUsd = result.total_cost_usd;

  // Require all three fields present and numeric; a partial result yields no
  // usage rather than a misleading zero-filled ledger entry.
  if (
    typeof inputTokens !== "number" ||
    typeof outputTokens !== "number" ||
    typeof costUsd !== "number"
  ) {
    return null;
  }

  return { inputTokens, outputTokens, costUsd };
}

/**
 * Run one headless lane session (§5.2). Spawns via the injected {@link SpawnFn}
 * with `cwd` = the bead's worktree, appends the raw output to the per-bead
 * session log, parses usage for the ledger, and returns the RAW outcome.
 *
 * This function does NOT decide success — see {@link SessionOutcome}. The caller
 * verifies the branch/PR by observation and interprets `exitCode`/`usage`.
 */
export async function runSession(
  spec: SessionSpec,
  spawn: SpawnFn,
): Promise<SessionOutcome> {
  const { command, args } = buildSpawnArgs(spec);
  const logPath = sessionLogPath(spec.repoRoot, spec.beadId, spec.ordinal);

  const { exitCode, stdout } = await spawn(command, args, spec.worktree);

  // Append (never truncate) so re-runs at the same ordinal accrete history.
  mkdirSync(dirname(logPath), { recursive: true });
  appendFileSync(logPath, stdout, "utf8");

  return {
    exitCode,
    usage: parseUsage(stdout),
    logPath,
    rawOutput: stdout,
  };
}
