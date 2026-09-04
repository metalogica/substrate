// observe.ts — the `mode: local` done-signal (the local analogue of §5.2's
// "branch pushed ∧ PR open").
//
// §5.2's load-bearing rule is that a lane's success is OBSERVED by the daemon,
// never parsed from the session's self-report. With no GitHub there is no PR to
// observe, so we observe the two things that are locally checkable and that the
// session cannot fake by claiming them:
//
//   1. the worktree branch carries at least one commit over the sha it was cut
//      from, and
//   2. the repo's OWN gate (`substrate.yaml`) is green when run in that worktree.
//
// The session already ran the gate itself — that is how it knew when to stop.
// Running it again here is not redundant: the session runs it to decide, the
// daemon runs it to VERIFY. A session that stops early, commits red, or reports
// success it did not achieve fails this check and falls into the existing
// retry-once-then-bounce policy unchanged.

import { spawn } from "node:child_process";

import { gateCommands, type Gate } from "./gate.js";
import { realGit, type GitExec } from "./worktree.js";

/** One shelled-out gate command's result. */
export interface ShellResult {
  code: number;
  stdout: string;
  stderr: string;
}

/**
 * Injectable shell seam. Gate commands are SHELL strings authored by the repo
 * (`cd daemon && pnpm exec tsc --noEmit`), not argv arrays, so they need a shell
 * to run — hence a distinct seam from the argv-shaped {@link GitExec}. Tests
 * substitute a recorder and never execute anything.
 */
export type ShellExec = (command: string, cwd: string) => Promise<ShellResult>;

/** Production {@link ShellExec}: run the command under `sh -c` in `cwd`. */
export const realShell: ShellExec = (command, cwd) =>
  new Promise((resolvePromise) => {
    const child = spawn("sh", ["-c", command], { cwd });
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
 * What the local observation concluded. `landed` carries the commit count for
 * the bead's note; the failure arm carries a human-readable reason that ends up
 * in the tbd note, so the board says WHY a bead came back rather than just that
 * it did.
 */
export type LocalObservation =
  | { landed: true; commits: number }
  | { landed: false; reason: string };

/**
 * Count commits on the worktree's branch since it was cut. An empty `baseSha`
 * means creation could not record a starting point, so nothing can be proven —
 * we return `null` (unknown) rather than counting from the root, which would
 * report a fresh, untouched worktree as having "landed" its entire history.
 */
async function commitsSince(
  worktree: string,
  baseSha: string,
  git: GitExec,
): Promise<number | null> {
  if (!baseSha) return null;
  try {
    const out = await git(["rev-list", "--count", `${baseSha}..HEAD`], worktree);
    const n = Number.parseInt(out.trim(), 10);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

/**
 * Observe whether a local lane landed. Ordering is deliberate:
 *
 *   1. commits first — cheap, and a session that produced nothing has nothing
 *      worth gating. This is also the arm the `/substrate:serve-bead` refuse-path
 *      lands in on purpose: an under-specified bead exits WITHOUT committing, so
 *      it reports here as "no commits" and the daemon bounces it back to the
 *      board carrying that reason.
 *   2. gate second — the repo's own compile/test/lint, run verbatim in the
 *      worktree, short-circuiting on the first failure so a red compile does not
 *      pay for a full test run.
 *
 * A repo that declares no gate is NOT silently accepted: `gateCommands` returns
 * `[]` and we refuse, because with no gate there is no observable done-signal and
 * accepting the commit would mean trusting the session's self-report — exactly
 * what §5.2 forbids. `serve.ts`'s preflight catches this at boot so it surfaces
 * before any bead is claimed, not after a session has already been paid for.
 */
export async function observeLocal(opts: {
  worktree: string;
  baseSha: string;
  gate: Gate | null;
  git?: GitExec;
  shell?: ShellExec;
}): Promise<LocalObservation> {
  const git = opts.git ?? realGit;
  const shell = opts.shell ?? realShell;

  const commits = await commitsSince(opts.worktree, opts.baseSha, git);
  if (commits === null) {
    return { landed: false, reason: "could not read the worktree's commit count" };
  }
  if (commits === 0) {
    return { landed: false, reason: "session made no commits" };
  }

  const commands = gateCommands(opts.gate);
  if (commands.length === 0) {
    return { landed: false, reason: "substrate.yaml declares no gate to verify against" };
  }

  for (const command of commands) {
    const res = await shell(command, opts.worktree);
    if (res.code !== 0) {
      return { landed: false, reason: `gate failed: ${command} (exit ${res.code})` };
    }
  }

  return { landed: true, commits };
}
