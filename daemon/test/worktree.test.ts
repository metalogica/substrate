import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  slugify,
  branchName,
  defaultWorktreeRoot,
  planWorktree,
  resolveTrunk,
  createWorktree,
  reapWorktree,
  realGit,
} from "../src/worktree.js";

// ── Pure helpers (no git) ────────────────────────────────────────────────────

describe("slugify", () => {
  it("lowercases and collapses non-alnum runs to single dashes", () => {
    expect(slugify("Fix Login  Flow!")).toBe("fix-login-flow");
  });
  it("trims leading/trailing dashes", () => {
    expect(slugify("  --Hello, World--  ")).toBe("hello-world");
  });
  it("returns empty string for punctuation-only input", () => {
    expect(slugify("!!!")).toBe("");
  });
});

describe("branchName", () => {
  it("composes <prefix><bead>-<slug> with the default prefix", () => {
    expect(branchName("sub-abc1", "Fix Login")).toBe("serve/sub-abc1-fix-login");
  });
  it("honors a custom prefix verbatim", () => {
    expect(branchName("sub-abc1", "x", "factory/")).toBe("factory/sub-abc1-x");
  });
  it("omits the trailing -<slug> when the slug is empty", () => {
    expect(branchName("sub-abc1", "!!!")).toBe("serve/sub-abc1");
  });
});

describe("defaultWorktreeRoot", () => {
  it("is a sibling `../<repo>-serve` of the repo dir", () => {
    expect(defaultWorktreeRoot("/home/u/code/myrepo")).toBe(
      "/home/u/code/myrepo-serve",
    );
  });
});

describe("planWorktree", () => {
  it("places the checkout at <root>/<bead-id> using the default sibling root", () => {
    const plan = planWorktree({
      repoRoot: "/home/u/code/myrepo",
      beadId: "sub-abc1",
      slug: "fix login",
    });
    expect(plan.path).toBe("/home/u/code/myrepo-serve/sub-abc1");
    expect(plan.branch).toBe("serve/sub-abc1-fix-login");
  });
  it("honors an explicit worktreeRoot override", () => {
    const plan = planWorktree({
      repoRoot: "/home/u/code/myrepo",
      beadId: "sub-abc1",
      slug: "x",
      worktreeRoot: "/tmp/custom-root",
    });
    expect(plan.path).toBe("/tmp/custom-root/sub-abc1");
  });
});

// ── Full lifecycle on a throwaway fixture git repo ───────────────────────────

/**
 * Build a fixture: a bare "origin" repo with one commit on `main` and a working
 * clone wired to it. Returns the clone path (the daemon's "repoRoot") — worktrees
 * are cut off `origin/main` from here, mirroring the real dispatch.
 */
function makeFixture(): { root: string; repoRoot: string } {
  const root = mkdtempSync(join(tmpdir(), "serve-wt-"));
  const origin = join(root, "origin.git");
  const seed = join(root, "seed");
  const repoRoot = join(root, "clone");

  const runIn = (cwd: string, args: string[]) =>
    execFileSync("git", args, { cwd, stdio: "pipe" });

  // Bare origin.
  execFileSync("git", ["init", "--bare", "-b", "main", origin], { stdio: "pipe" });

  // Seed working tree → one commit → push to origin/main.
  execFileSync("git", ["init", "-b", "main", seed], { stdio: "pipe" });
  runIn(seed, ["config", "user.email", "fixture@example.com"]);
  runIn(seed, ["config", "user.name", "Fixture"]);
  writeFileSync(join(seed, "README.md"), "seed\n", "utf8");
  runIn(seed, ["add", "-A"]);
  runIn(seed, ["commit", "-m", "seed"]);
  runIn(seed, ["remote", "add", "origin", origin]);
  runIn(seed, ["push", "origin", "main"]);

  // The daemon's repoRoot: a clone of origin, with origin/HEAD set to main.
  execFileSync("git", ["clone", origin, repoRoot], { stdio: "pipe" });
  runIn(repoRoot, ["config", "user.email", "fixture@example.com"]);
  runIn(repoRoot, ["config", "user.name", "Fixture"]);

  return { root, repoRoot };
}

describe("worktree lifecycle on a fixture repo", () => {
  let fixture: { root: string; repoRoot: string };

  beforeEach(() => {
    fixture = makeFixture();
  });

  afterEach(() => {
    rmSync(fixture.root, { recursive: true, force: true });
  });

  it("resolves the trunk from origin/HEAD", async () => {
    const trunk = await resolveTrunk(fixture.repoRoot, realGit);
    expect(trunk).toBe("main");
  });

  it("creates a sibling worktree cut fresh from origin/<trunk>, then reaps it", async () => {
    const { repoRoot } = fixture;
    const trunk = await resolveTrunk(repoRoot, realGit);
    const plan = planWorktree({
      repoRoot,
      beadId: "sub-abc1",
      slug: "fix login",
      worktreeRoot: join(fixture.root, "myrepo-serve"),
    });

    await createWorktree({ repoRoot, plan, trunk, git: realGit });

    // Checkout exists on disk and carries the seeded content.
    expect(existsSync(plan.path)).toBe(true);
    expect(existsSync(join(plan.path, "README.md"))).toBe(true);

    // The branch was cut and git knows the worktree.
    const branches = execFileSync("git", ["branch", "--list", plan.branch], {
      cwd: repoRoot,
      encoding: "utf8",
    });
    expect(branches).toContain(plan.branch);
    const wtList = execFileSync("git", ["worktree", "list"], {
      cwd: repoRoot,
      encoding: "utf8",
    });
    expect(wtList).toContain(plan.path);

    // Reap: checkout gone, branch gone, worktree metadata pruned.
    await reapWorktree({ repoRoot, plan, git: realGit });
    expect(existsSync(plan.path)).toBe(false);
    const branchesAfter = execFileSync("git", ["branch", "--list", plan.branch], {
      cwd: repoRoot,
      encoding: "utf8",
    });
    expect(branchesAfter.trim()).toBe("");
    const wtListAfter = execFileSync("git", ["worktree", "list"], {
      cwd: repoRoot,
      encoding: "utf8",
    });
    expect(wtListAfter).not.toContain(plan.path);
  });

  it("reap is idempotent — reaping twice does not throw", async () => {
    const { repoRoot } = fixture;
    const trunk = await resolveTrunk(repoRoot, realGit);
    const plan = planWorktree({
      repoRoot,
      beadId: "sub-idem",
      slug: "idempotent",
      worktreeRoot: join(fixture.root, "myrepo-serve"),
    });

    await createWorktree({ repoRoot, plan, trunk, git: realGit });

    // First reap tears everything down.
    await expect(
      reapWorktree({ repoRoot, plan, git: realGit }),
    ).resolves.toBeUndefined();

    // Second reap on an already-gone worktree/branch must be a no-op, not an error.
    await expect(
      reapWorktree({ repoRoot, plan, git: realGit }),
    ).resolves.toBeUndefined();

    // Reaping a plan that was never created is also a no-op.
    const ghost = planWorktree({
      repoRoot,
      beadId: "sub-ghost",
      slug: "never",
      worktreeRoot: join(fixture.root, "myrepo-serve"),
    });
    await expect(
      reapWorktree({ repoRoot, plan: ghost, git: realGit }),
    ).resolves.toBeUndefined();
  });

  it("createWorktree drives git with an injectable exec (call recording)", async () => {
    // Prove the seam: a stub GitExec captures the exact argv order without touching disk.
    const calls: string[][] = [];
    const stub = async (args: string[]) => {
      calls.push(args);
      return "";
    };
    const plan = planWorktree({
      repoRoot: "/repo",
      beadId: "sub-x",
      slug: "y",
      worktreeRoot: "/wt",
    });
    await createWorktree({ repoRoot: "/repo", plan, trunk: "main", git: stub });
    expect(calls[0]).toEqual(["fetch", "origin", "main"]);
    expect(calls[1]).toEqual([
      "worktree",
      "add",
      "-b",
      "serve/sub-x-y",
      "/wt/sub-x",
      "origin/main",
    ]);
  });
});
