// observe.test.ts — the `mode: local` done-signal (§5.2, locally).
//
// This is the module that decides whether a headless session's work counts, so
// the tests are written around the ways it could WRONGLY say yes: no commits, a
// red gate, an unreadable worktree, a repo that declares no gate at all. Saying
// yes in any of those cases means trusting the session's self-report, which is
// exactly what §5.2 forbids.
//
// Both effects are injected — git reads and the shell — so nothing here runs a
// real command or touches a real repo.

import { describe, it, expect } from "vitest";
import { observeLocal, type ShellExec } from "../src/observe.js";
import type { GitExec } from "../src/worktree.js";
import type { Gate } from "../src/gate.js";

/** A git stub answering the one read observeLocal makes: the commit count. */
function gitWithCommits(count: number): GitExec {
  return async (args) => {
    if (args[0] === "rev-list" && args[1] === "--count") return `${count}\n`;
    return "";
  };
}

/** A git stub whose commit-count read fails (unreadable/absent worktree). */
const gitThatFails: GitExec = async () => {
  throw new Error("not a git repository");
};

/** A shell stub: every command exits `code`, recording what it was asked to run. */
function shellExiting(code: number): ShellExec & { ran: string[] } {
  const ran: string[] = [];
  const run: ShellExec = async (command) => {
    ran.push(command);
    return { code, stdout: "", stderr: "" };
  };
  return Object.assign(run, { ran });
}

const GATE: Gate = { compile: "compile-cmd", test: "test-cmd" };
const BASE = "basesha";

describe("observeLocal — the local landed/not-landed decision", () => {
  it("lands when the branch has commits AND every gate command is green", async () => {
    const shell = shellExiting(0);
    const out = await observeLocal({
      worktree: "/wt/a",
      baseSha: BASE,
      gate: GATE,
      git: gitWithCommits(2),
      shell,
    });
    expect(out).toEqual({ landed: true, commits: 2 });
    // Every declared command actually ran, in gate order.
    expect(shell.ran).toEqual(["compile-cmd", "test-cmd"]);
  });

  it("does NOT land when the session made no commits", async () => {
    // The deliberate refuse-path: /substrate:serve-bead exits without committing
    // on an under-specified bead, so the daemon bounces it instead of guessing.
    const shell = shellExiting(0);
    const out = await observeLocal({
      worktree: "/wt/a",
      baseSha: BASE,
      gate: GATE,
      git: gitWithCommits(0),
      shell,
    });
    expect(out).toEqual({ landed: false, reason: "session made no commits" });
  });

  it("skips the gate entirely when there are no commits (nothing to verify)", async () => {
    const shell = shellExiting(0);
    await observeLocal({
      worktree: "/wt/a",
      baseSha: BASE,
      gate: GATE,
      git: gitWithCommits(0),
      shell,
    });
    expect(shell.ran).toEqual([]); // no test suite paid for on an empty branch
  });

  it("does NOT land when a gate command is red, even with commits present", async () => {
    const out = await observeLocal({
      worktree: "/wt/a",
      baseSha: BASE,
      gate: GATE,
      git: gitWithCommits(5),
      shell: shellExiting(1),
    });
    expect(out.landed).toBe(false);
    if (!out.landed) expect(out.reason).toContain("gate failed: compile-cmd");
  });

  it("short-circuits on the FIRST red command", async () => {
    // A red compile must not pay for the full test run behind it.
    const shell = shellExiting(1);
    await observeLocal({
      worktree: "/wt/a",
      baseSha: BASE,
      gate: GATE,
      git: gitWithCommits(1),
      shell,
    });
    expect(shell.ran).toEqual(["compile-cmd"]);
  });

  it("refuses when the repo declares no gate — there is nothing to observe", async () => {
    const out = await observeLocal({
      worktree: "/wt/a",
      baseSha: BASE,
      gate: null,
      git: gitWithCommits(3),
      shell: shellExiting(0),
    });
    expect(out.landed).toBe(false);
    if (!out.landed) expect(out.reason).toContain("no gate");
  });

  it("refuses when the base sha is unknown rather than counting from the root", async () => {
    // Counting from the root would report a fresh, untouched worktree as having
    // "landed" the repo's entire history — a false pass on every dispatch.
    const out = await observeLocal({
      worktree: "/wt/a",
      baseSha: "",
      gate: GATE,
      git: gitWithCommits(999),
      shell: shellExiting(0),
    });
    expect(out.landed).toBe(false);
    if (!out.landed) expect(out.reason).toContain("commit count");
  });

  it("refuses when the commit count cannot be read at all", async () => {
    const out = await observeLocal({
      worktree: "/wt/gone",
      baseSha: BASE,
      gate: GATE,
      git: gitThatFails,
      shell: shellExiting(0),
    });
    expect(out.landed).toBe(false);
  });

  it("counts commits against the base sha, in the worktree", async () => {
    const calls: Array<{ args: string[]; cwd: string }> = [];
    await observeLocal({
      worktree: "/wt/a",
      baseSha: BASE,
      gate: GATE,
      git: async (args, cwd) => {
        calls.push({ args: [...args], cwd });
        return "1\n";
      },
      shell: shellExiting(0),
    });
    expect(calls[0]).toEqual({
      args: ["rev-list", "--count", `${BASE}..HEAD`],
      cwd: "/wt/a",
    });
  });

  it("runs gate commands in the WORKTREE, not the repo root", async () => {
    const cwds: string[] = [];
    await observeLocal({
      worktree: "/wt/a",
      baseSha: BASE,
      gate: { compile: "c" },
      git: gitWithCommits(1),
      shell: async (_cmd, cwd) => {
        cwds.push(cwd);
        return { code: 0, stdout: "", stderr: "" };
      },
    });
    expect(cwds).toEqual(["/wt/a"]);
  });
});
