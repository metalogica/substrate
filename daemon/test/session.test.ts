import { describe, it, expect } from "vitest";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  runSession,
  buildSpawnArgs,
  sessionLogPath,
  parseUsage,
  type SessionSpec,
  type SpawnFn,
  type SpawnResult,
} from "../src/session.js";

// A recorded `claude -p --output-format json` result. This is the shape the CLI
// emits: a `result` object carrying snake_case token counts under `usage` and a
// `total_cost_usd`. Trimmed to the fields the ledger consumes plus a few of the
// drift-tolerant siblings, to prove the parser ignores what it doesn't model.
const RECORDED_RESULT = JSON.stringify({
  type: "result",
  subtype: "success",
  is_error: false,
  duration_ms: 18342,
  num_turns: 7,
  result: "Branch pushed and PR opened.",
  session_id: "0e5c1a2b-9f3d-4c77-8b21-5a1e6f0c9d44",
  total_cost_usd: 0.1873,
  usage: {
    input_tokens: 12045,
    output_tokens: 3120,
    cache_read_input_tokens: 8800,
  },
});

function tempRepo(): string {
  return mkdtempSync(join(tmpdir(), "serve-session-"));
}

function makeSpec(repoRoot: string, over: Partial<SessionSpec> = {}): SessionSpec {
  return {
    beadId: "sub-wiya",
    ordinal: 1,
    prompt: "<lane prompt>",
    worktree: "/tmp/repo-serve/sub-wiya",
    model: null,
    repoRoot,
    ...over,
  };
}

describe("buildSpawnArgs (§5.2)", () => {
  it("emits the verbatim headless argv without --model when the lane pins none", () => {
    const { command, args } = buildSpawnArgs(makeSpec("/repo", { model: null }));
    expect(command).toBe("claude");
    expect(args).toEqual([
      "-p",
      "<lane prompt>",
      "--output-format",
      "json",
      "--dangerously-skip-permissions",
    ]);
    expect(args).not.toContain("--model");
  });

  it("appends --model <model> when the lane pins one", () => {
    const { args } = buildSpawnArgs(makeSpec("/repo", { model: "opus" }));
    expect(args.slice(-2)).toEqual(["--model", "opus"]);
  });
});

describe("sessionLogPath (§5.2)", () => {
  it("forms .substrate/serve/logs/<bead-id>.<n>.log under the repo root", () => {
    expect(sessionLogPath("/repo", "sub-wiya", 3)).toBe(
      join("/repo", ".substrate", "serve", "logs", "sub-wiya.3.log"),
    );
  });
});

describe("parseUsage (§3.2b)", () => {
  it("extracts {inputTokens, outputTokens, costUsd} from a recorded JSON result", () => {
    expect(parseUsage(RECORDED_RESULT)).toEqual({
      inputTokens: 12045,
      outputTokens: 3120,
      costUsd: 0.1873,
    });
  });

  it("returns null on non-JSON output (drift-tolerant, not a failure signal)", () => {
    expect(parseUsage("not json at all")).toBeNull();
  });

  it("returns null when usage/cost fields are absent", () => {
    expect(parseUsage(JSON.stringify({ type: "result", result: "hi" }))).toBeNull();
  });
});

describe("runSession (§5.2 contract)", () => {
  it("spawns in the worktree cwd, parses usage, writes the log, and does NOT decide success", async () => {
    const repo = tempRepo();
    try {
      const spec = makeSpec(repo, {
        beadId: "sub-wiya",
        ordinal: 2,
        worktree: "/tmp/repo-serve/sub-wiya",
        model: "opus",
      });

      // Mock spawn: assert it is invoked with the §5.2 argv + worktree cwd, and
      // return the recorded fixture — no real `claude` process is ever created.
      let observedCommand = "";
      let observedArgs: readonly string[] = [];
      let observedCwd = "";
      const spawn: SpawnFn = async (command, args, cwd): Promise<SpawnResult> => {
        observedCommand = command;
        observedArgs = args;
        observedCwd = cwd;
        return { exitCode: 0, stdout: RECORDED_RESULT };
      };

      const outcome = await runSession(spec, spawn);

      // Spawn was invoked verbatim, in the bead's worktree.
      expect(observedCommand).toBe("claude");
      expect(observedArgs).toEqual([
        "-p",
        "<lane prompt>",
        "--output-format",
        "json",
        "--dangerously-skip-permissions",
        "--model",
        "opus",
      ]);
      expect(observedCwd).toBe("/tmp/repo-serve/sub-wiya");

      // Usage parsed for the ledger.
      expect(outcome.usage).toEqual({
        inputTokens: 12045,
        outputTokens: 3120,
        costUsd: 0.1873,
      });

      // Raw outcome only — the type carries no `success`; the caller observes it.
      expect(outcome.exitCode).toBe(0);
      expect(outcome).not.toHaveProperty("success");

      // Log path formed correctly, and the raw output was persisted there.
      const expectedLog = join(
        repo,
        ".substrate",
        "serve",
        "logs",
        "sub-wiya.2.log",
      );
      expect(outcome.logPath).toBe(expectedLog);
      expect(readFileSync(expectedLog, "utf8")).toBe(RECORDED_RESULT);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  it("appends to the log across sessions at the same ordinal (never truncates)", async () => {
    const repo = tempRepo();
    try {
      const spec = makeSpec(repo, { beadId: "sub-wiya", ordinal: 1 });
      const spawn: SpawnFn = async () => ({ exitCode: 0, stdout: "line-A\n" });
      await runSession(spec, spawn);
      const spawn2: SpawnFn = async () => ({ exitCode: 1, stdout: "line-B\n" });
      const second = await runSession(spec, spawn2);

      expect(readFileSync(second.logPath, "utf8")).toBe("line-A\nline-B\n");
      // Non-zero exit is surfaced raw, not interpreted as failure here.
      expect(second.exitCode).toBe(1);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  it("returns null usage (not an error) when the session output is unparseable", async () => {
    const repo = tempRepo();
    try {
      const spawn: SpawnFn = async () => ({ exitCode: 0, stdout: "garbled" });
      const outcome = await runSession(makeSpec(repo), spawn);
      expect(outcome.usage).toBeNull();
      expect(outcome.exitCode).toBe(0);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });
});
