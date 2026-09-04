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
 * Does this repo have an `origin` remote at all? A local-only board (`git init`
 * with nothing pushed) has none, and every `origin/*` probe below would fail —
 * so we ask once and take the local path instead of throwing.
 */
export async function hasOrigin(repoRoot: string, git: GitExec = realGit): Promise<boolean> {
  try {
    const out = await git(["remote"], repoRoot);
    return out.split(/\r?\n/).some((line) => line.trim() === "origin");
  } catch {
    return false;
  }
}

/**
 * Resolve the repo's trunk branch. Prefers the default branch on `origin`
 * (`origin/HEAD`, else `origin/main`, else `origin/master`), then falls back to
 * a LOCAL trunk (`main`, `master`, else whatever branch `HEAD` is on) so a repo
 * with no remote still resolves. Returns the short branch name (e.g. `main`).
 *
 * The local fallback is what makes `mode: local` possible at all: before it,
 * a `git init` board with nothing pushed threw here and no bead could ever be
 * dispatched.
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

  // No usable origin ref — resolve a LOCAL trunk instead.
  for (const candidate of ["main", "master"]) {
    try {
      await git(["rev-parse", "--verify", `refs/heads/${candidate}`], repoRoot);
      return candidate;
    } catch {
      // try next
    }
  }
  // Last resort: whatever branch the checkout is currently on.
  try {
    const head = (await git(["rev-parse", "--abbrev-ref", "HEAD"], repoRoot)).trim();
    if (head && head !== "HEAD") return head;
  } catch {
    // detached or unborn HEAD — fall through to the error.
  }

  throw new Error(
    "resolveTrunk: could not determine a trunk branch (no origin/HEAD, origin/main, origin/master, local main/master, or a named HEAD)",
  );
}

/** A created worktree: where it is, and the commit its branch was cut from. */
export interface CreatedWorktree {
  readonly plan: WorktreePlan;
  /**
   * The sha the branch was cut from. `mode: local` needs this to answer "did the
   * session actually commit anything?" — `rev-list --count <baseSha>..HEAD` — so
   * it is captured at creation rather than re-derived later, when the trunk may
   * already have moved.
   */
  readonly baseSha: string;
}

/**
 * Create the bead's worktree and report where its branch starts (§3.3).
 *
 * With a remote (`remote: true`, the default): fetch the trunk fresh from origin,
 * then cut the branch from `origin/<trunk>` so it starts at the current origin tip.
 * Without one (`remote: false` — a local-only board): skip the fetch entirely and
 * cut from the LOCAL `<trunk>` ref, since `origin/<trunk>` does not exist.
 *
 * Idempotency is the caller's concern (boot-reap, §7) — this assumes a clean slot.
 */
export async function createWorktree(opts: {
  repoRoot: string;
  plan: WorktreePlan;
  trunk: string;
  git?: GitExec;
  /** Whether an `origin` remote exists. Defaults to `true` (the §3.3 contract). */
  remote?: boolean;
}): Promise<CreatedWorktree> {
  const git = opts.git ?? realGit;
  const { repoRoot, plan, trunk } = opts;
  const remote = opts.remote ?? true;

  const base = remote ? `origin/${trunk}` : trunk;
  if (remote) {
    // Fetch the trunk fresh so the branch is cut off the current origin tip.
    await git(["fetch", "origin", trunk], repoRoot);
  }
  await git(["worktree", "add", "-b", plan.branch, plan.path, base], repoRoot);

  // Record the starting commit while it is unambiguous — read from the worktree
  // itself, so it is the sha actually checked out rather than a re-resolution.
  let baseSha = "";
  try {
    baseSha = (await git(["rev-parse", "HEAD"], plan.path)).trim();
  } catch {
    // A stubbed git (tests) may not answer rev-parse; an empty baseSha degrades
    // the commit count to "everything reachable from HEAD", never to a crash.
  }

  return { plan, baseSha };
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
