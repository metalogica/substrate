// worktree.ts — sibling-directory git worktree lifecycle (spec §3.3).
//
// Sibling root: `../<repo>-serve/<bead-id>/`, branch `serve/<bead-id>-<slug>` cut
// **fresh from `origin/<trunk>`** at dispatch. Never inside the repo tree.
// Reap = `git worktree remove --force <path>` + branch delete + `git worktree prune`.
//
// git calls go through an injectable `GitExec` so tests drive the lifecycle against
// a throwaway fixture repo (and, where useful, a stub). Path/branch derivation is
// factored into pure helpers so the naming contract is unit-testable without git.

import { execFile } from "node:child_process";
import { basename, dirname, join, resolve } from "node:path";
import { promisify } from "node:util";

const execFileP = promisify(execFile);

/**
 * Injectable git runner. Resolves with stdout (trimmed by callers as needed);
 * rejects when git exits non-zero. `cwd` is the directory git runs in.
 */
export type GitExec = (args: string[], cwd: string) => Promise<string>;

/** Default {@link GitExec}: shells out to the real `git` binary via execFile. */
export const realGit: GitExec = async (args, cwd) => {
  const { stdout } = await execFileP("git", args, { cwd });
  return stdout;
};

/** Everything needed to place and name one bead's worktree. */
export interface WorktreePlan {
  /** Absolute path the worktree checkout lives at. */
  readonly path: string;
  /** Branch name cut for this bead. */
  readonly branch: string;
}

// ── Pure helpers (no git) ────────────────────────────────────────────────────

/**
 * Slugify a bead title/summary for use in a branch name: lowercase, non-alnum
 * runs → single `-`, trimmed of leading/trailing `-`. Empty input → "".
 */
export function slugify(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Branch name for a bead: `<prefix><bead-id>-<slug>` (e.g. `serve/sub-abc1-fix-login`).
 * When the slug is empty the trailing `-<slug>` is omitted so the branch stays clean.
 * `prefix` is the config `branchPrefix` (defaults to `serve/`), kept verbatim.
 */
export function branchName(beadId: string, slug: string, prefix = "serve/"): string {
  const s = slugify(slug);
  return s ? `${prefix}${beadId}-${s}` : `${prefix}${beadId}`;
}

/**
 * Default sibling worktree root for a repo at `repoRoot`: `../<repo>-serve/`,
 * resolved absolute. Sibling of the repo dir — never inside the repo tree.
 */
export function defaultWorktreeRoot(repoRoot: string): string {
  const abs = resolve(repoRoot);
  const repoName = basename(abs);
  return join(dirname(abs), `${repoName}-serve`);
}

/**
 * Resolve the full {@link WorktreePlan} for a bead: where its checkout goes and
 * what branch it gets. `worktreeRoot` overrides the default sibling root (config
 * `worktreeRoot`); pass `null` to use {@link defaultWorktreeRoot}.
 */
export function planWorktree(opts: {
  repoRoot: string;
  beadId: string;
  slug: string;
  branchPrefix?: string;
  worktreeRoot?: string | null;
}): WorktreePlan {
  const root =
    opts.worktreeRoot != null
      ? resolve(opts.worktreeRoot)
      : defaultWorktreeRoot(opts.repoRoot);
  return {
    path: join(root, opts.beadId),
    branch: branchName(opts.beadId, opts.slug, opts.branchPrefix),
  };
}

// ── Git-touching lifecycle ───────────────────────────────────────────────────

/**
 * Resolve the repo's trunk branch (the default branch on `origin`). Reads
 * `origin/HEAD`; falls back to `main` then `master` if the symbolic ref is
 * unset (common in fixture repos with no configured HEAD). Returns the short
 * branch name (e.g. `main`).
 */
export async function resolveTrunk(repoRoot: string, git: GitExec = realGit): Promise<string> {
  try {
    const ref = (await git(["symbolic-ref", "refs/remotes/origin/HEAD"], repoRoot)).trim();
    // e.g. "refs/remotes/origin/main" → "main"
    const short = ref.replace(/^refs\/remotes\/origin\//, "");
    if (short) return short;
  } catch {
    // origin/HEAD not set — fall through to name probing.
  }
  for (const candidate of ["main", "master"]) {
    try {
      await git(["rev-parse", "--verify", `origin/${candidate}`], repoRoot);
      return candidate;
    } catch {
      // try next
    }
  }
  throw new Error(
    "resolveTrunk: could not determine origin trunk (no origin/HEAD, origin/main, or origin/master)",
  );
}

/**
 * Create the bead's worktree: fetch the trunk fresh from origin, then
 * `git worktree add -b <branch> <path> origin/<trunk>` so the branch is cut
 * from the freshly-fetched trunk tip at dispatch time (§3.3). Returns the plan.
 *
 * Idempotency is the caller's concern (boot-reap, §7) — this assumes a clean slot.
 */
export async function createWorktree(opts: {
  repoRoot: string;
  plan: WorktreePlan;
  trunk: string;
  git?: GitExec;
}): Promise<WorktreePlan> {
  const git = opts.git ?? realGit;
  const { repoRoot, plan, trunk } = opts;
  // Fetch the trunk fresh so the branch is cut off the current origin tip.
  await git(["fetch", "origin", trunk], repoRoot);
  await git(
    ["worktree", "add", "-b", plan.branch, plan.path, `origin/${trunk}`],
    repoRoot,
  );
  return plan;
}

/**
 * Reap a bead's worktree: force-remove the checkout, delete its branch, and
 * prune stale worktree metadata. **Idempotent** — reaping an already-gone
 * worktree/branch does not throw; each sub-step swallows the "not found" error
 * and the terminal `prune` always runs so metadata is left consistent.
 */
export async function reapWorktree(opts: {
  repoRoot: string;
  plan: WorktreePlan;
  git?: GitExec;
}): Promise<void> {
  const git = opts.git ?? realGit;
  const { repoRoot, plan } = opts;

  // Force-remove the checkout. Absent worktree → git errors; swallow it.
  try {
    await git(["worktree", "remove", "--force", plan.path], repoRoot);
  } catch {
    // Already removed (or never created) — reap stays idempotent.
  }

  // Delete the branch. Absent branch → git errors; swallow it.
  try {
    await git(["branch", "-D", plan.branch], repoRoot);
  } catch {
    // Already deleted — idempotent.
  }

  // Always prune dangling worktree admin entries; safe to run repeatedly.
  await git(["worktree", "prune"], repoRoot);
}
