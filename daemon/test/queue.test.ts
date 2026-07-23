// queue.test.ts — drives the REAL `tbd` CLI against a throwaway fixture repo
// created per-test, proving the §3.1 transitions the daemon depends on:
//   - claim removes `groomed` + sets assignee (bead leaves the board)
//   - release restores `groomed` + clears assignee (bead returns to the board)
//   - list() is FIFO by ULID and excludes `needs-spec`
//
// No mocking of tbd: the adapter is only trustworthy if it drives the actual
// binary. If `tbd` is absent we skip loudly rather than pass vacuously — though
// on the build machine it IS present at `tbd`.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  Queue,
  GROOMED_LABEL,
  NEEDS_SPEC_LABEL,
  SERVE_ASSIGNEE,
  type Bead,
} from "../src/queue.js";

/** Is a working `tbd` binary on PATH? Gate the suite on it. */
function tbdAvailable(): boolean {
  const r = spawnSync("tbd", ["--version"], { encoding: "utf8" });
  return r.status === 0;
}

const HAS_TBD = tbdAvailable();

/** Run a git/tbd command inside the fixture repo, returning stdout. */
function run(bin: string, args: string[], cwd: string): string {
  return execFileSync(bin, args, { cwd, encoding: "utf8" });
}

/** `tbd show <id> --json` decoded — the ground-truth read for assertions. */
function show(cwd: string, id: string): Record<string, unknown> {
  return JSON.parse(run("tbd", ["show", id, "--json"], cwd)) as Record<
    string,
    unknown
  >;
}

/** Create a groomed bead in the fixture, returning its public id. */
function seed(cwd: string, title: string, extraLabels: string[] = []): string {
  const labelArgs = [GROOMED_LABEL, ...extraLabels].flatMap((l) => [
    "--label",
    l,
  ]);
  const out = run("tbd", ["create", title, ...labelArgs, "--json"], cwd);
  return String((JSON.parse(out) as { id: string }).id);
}

describe.skipIf(!HAS_TBD)("queue.ts tbd adapter", () => {
  let dir: string;
  let queue: Queue;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "serve-queue-"));
    // A real tiny tbd repo: git init → tbd init. --no-sync everywhere keeps it
    // offline and fast; the adapter's own calls inherit --json only.
    run("git", ["init", "-q"], dir);
    run("git", ["config", "user.email", "serve-test@example.com"], dir);
    run("git", ["config", "user.name", "serve-test"], dir);
    run("tbd", ["init", "--prefix", "fx", "--quiet"], dir);
    queue = new Queue({ cwd: dir });
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("claim removes the groomed label and sets the serve assignee", () => {
    const id = seed(dir, "claimable bead");

    // Precondition: on the board, groomed, no assignee.
    const before = show(dir, id);
    expect(before.labels).toContain(GROOMED_LABEL);
    expect(before.status).toBe("open");
    expect(before.assignee ?? "").toBe("");

    queue.claim(id);

    const after = show(dir, id);
    expect(after.labels).not.toContain(GROOMED_LABEL);
    expect(after.status).toBe("in_progress");
    expect(after.assignee).toBe(SERVE_ASSIGNEE);
  });

  it("release restores groomed, clears the assignee, and reopens the bead", () => {
    const id = seed(dir, "bounced bead");
    queue.claim(id);
    // Sanity: it really left the board first.
    expect(show(dir, id).labels).not.toContain(GROOMED_LABEL);

    queue.release(id);

    const after = show(dir, id);
    expect(after.labels).toContain(GROOMED_LABEL);
    expect(after.status).toBe("open");
    expect(after.assignee ?? "").toBe("");
  });

  it("list() returns groomed+open beads FIFO by ULID (creation order)", () => {
    // Seeded in order a, b, c → ULIDs ascend → list() must return a, b, c.
    const a = seed(dir, "first");
    const b = seed(dir, "second");
    const c = seed(dir, "third");

    const ids = queue.list().map((x: Bead) => x.id);
    expect(ids).toEqual([a, b, c]);

    // Claiming the head removes it; the next-oldest becomes the head.
    queue.claim(a);
    expect(queue.list().map((x: Bead) => x.id)).toEqual([b, c]);
  });

  it("list() excludes needs-spec beads even when groomed+open", () => {
    const keep = seed(dir, "ready");
    const skip = seed(dir, "ungroomed", [NEEDS_SPEC_LABEL]);

    const ids = queue.list().map((x: Bead) => x.id);
    expect(ids).toContain(keep);
    expect(ids).not.toContain(skip);
  });

  it("list() models the bead shape it consumes (id, internalId, labels)", () => {
    seed(dir, "shaped");
    const [bead] = queue.list();
    expect(bead).toBeDefined();
    expect(typeof bead!.id).toBe("string");
    expect(bead!.internalId).toMatch(/^is-/);
    expect(bead!.labels).toContain(GROOMED_LABEL);
  });
});
