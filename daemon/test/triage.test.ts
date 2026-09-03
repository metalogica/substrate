// triage.test.ts — fake-driven tests for the manual `substrate triage <bead-id>`
// verb (spec §3.2, Phase 3 Step 3.2). Triage SHARES the tick's claim → route path
// but for ONE named bead and with no poll. We inject a fake queue (structural
// TriageQueue) rather than drive a real tbd repo — queue.test.ts already proves
// the real transitions the fake stands in for, and router.test.ts proves the pure
// §5.1 decision; here we prove triage's ORCHESTRATION of a single named bead:
//   - resolve the named bead + claim it + stamp its route (the acceptance path),
//   - route by kind (feature/task → quick, bug → bug),
//   - bounce an un-routable bead back to the board (missing kind / needs-spec),
//   - not-found when the id is not on the board (no mutation),
//   - the injectable DISPATCH seam (stubbed for sub-fu3f) is invoked on a route.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  triage,
  parseArgs,
  formatOutcome,
  stubDispatch,
  ensurePr,
  createDispatch,
  lanePrompt,
  type TriageQueue,
  type Dispatch,
  type GhResult,
  type DispatchDeps,
} from "../src/triage.js";
import { DEFAULT_CONFIG } from "../src/config.js";
import type { Bead, Route } from "../src/queue.js";

/** Build a groomed, board-ready {@link Bead} with the given labels. */
function bead(id: string, labels: string[], seq = 0): Bead {
  return {
    id,
    internalId: `is-${String(seq).padStart(26, "0")}`,
    title: `bead ${id}`,
    status: "open",
    labels: ["groomed", ...labels],
    assignee: undefined,
  };
}

/** Recorded mutation, in call order, for asserting the claim → route span. */
type Call =
  | { op: "claim"; id: string }
  | { op: "stamp"; id: string; route?: Route; note?: string; inReview?: boolean }
  | { op: "release"; id: string }
  | { op: "addLabel"; id: string; label: string };

/**
 * A fake queue implementing the {@link TriageQueue} span. `list()` returns the
 * seeded board; every mutation is recorded so a test can assert exactly what triage
 * did (claim, then stamp OR release+addLabel/note). `claim` mirrors the real
 * transition (bead leaves the board) so a re-list would not re-find it.
 */
function fakeQueue(board: Bead[]): TriageQueue & { calls: Call[] } {
  let beads = [...board];
  const calls: Call[] = [];
  return {
    calls,
    list: () => [...beads],
    claim(id) {
      calls.push({ op: "claim", id });
      beads = beads.filter((b) => b.id !== id);
    },
    stamp(id, s) {
      calls.push({ op: "stamp", id, ...s });
    },
    release(id) {
      calls.push({ op: "release", id });
    },
    addLabel(id, label) {
      calls.push({ op: "addLabel", id, label });
    },
  };
}

/** A dispatch mock that always observes the work landed (§5.2). */
function prOpenDispatch(ref = "https://gh/pr/1"): Dispatch {
  return async (_bead, lane) => ({ status: "landed", ref, branch: `serve/${lane}` });
}

/** A dispatch mock that observes NOTHING landed (§5.2). */
function noPrDispatch(logPath = "/logs/x.1.log"): Dispatch {
  return async (_bead, lane) => ({ status: "no-landing", logPath, branch: `serve/${lane}` });
}

describe("triage — claim + route + dispatch ONE named bead now (§3.2 + §4.6)", () => {
  it("claims + routes + stamps, then stamps in-review on an observed PR (acceptance path)", async () => {
    const q = fakeQueue([bead("fx-a", ["kind:feature"])]);
    const outcome = await triage("fx-a", { queue: q, dispatch: prOpenDispatch("https://gh/pr/9") });

    // Claimed first (the committing step), then stamped route:quick + note.
    expect(q.calls[0]).toEqual({ op: "claim", id: "fx-a" });
    expect(q.calls[1]).toEqual({
      op: "stamp",
      id: "fx-a",
      route: "quick",
      note: "serve: routed quick (prior kind:feature)",
    });
    // Then routed → in-review with the observed evidence (§3.1, §5.2).
    expect(q.calls[2]).toEqual({
      op: "stamp",
      id: "fx-a",
      inReview: true,
      note: "serve: landed https://gh/pr/9",
    });
    expect(q.calls).toHaveLength(3);

    expect(outcome).toEqual({
      status: "in-review",
      bead: "fx-a",
      lane: "quick",
      priorKind: "feature",
      ref: "https://gh/pr/9",
    });
  });

  it("routes a kind:task bead to the quick lane", async () => {
    const q = fakeQueue([bead("fx-t", ["kind:task"])]);
    const outcome = await triage("fx-t", { queue: q, dispatch: prOpenDispatch() });
    expect(outcome).toMatchObject({ status: "in-review", lane: "quick" });
    expect(q.calls).toContainEqual({
      op: "stamp",
      id: "fx-t",
      route: "quick",
      note: "serve: routed quick (prior kind:task)",
    });
  });

  it("routes a kind:bug bead to the bug lane", async () => {
    const q = fakeQueue([bead("fx-b", ["kind:bug"])]);
    const outcome = await triage("fx-b", { queue: q, dispatch: prOpenDispatch() });
    expect(outcome).toMatchObject({ status: "in-review", lane: "bug", priorKind: "bug" });
    expect(q.calls[0]).toEqual({ op: "claim", id: "fx-b" });
    expect(q.calls[1]).toEqual({
      op: "stamp",
      id: "fx-b",
      route: "bug",
      note: "serve: routed bug (prior kind:bug)",
    });
  });

  it("holds the claim + notes the failure when dispatch observes NO PR (§5.2 lane-failed)", async () => {
    const q = fakeQueue([bead("fx-f", ["kind:feature"])]);
    const outcome = await triage("fx-f", { queue: q, dispatch: noPrDispatch("/logs/fx-f.1.log") });

    // Claimed + routed, then a failure NOTE — but NO release (claim is held).
    expect(q.calls[0]).toEqual({ op: "claim", id: "fx-f" });
    expect(q.calls[1]).toMatchObject({ op: "stamp", route: "quick" });
    expect(q.calls[2]).toEqual({
      op: "stamp",
      id: "fx-f",
      note: "serve: lane failed (log /logs/fx-f.1.log)",
    });
    expect(q.calls.some((c) => c.op === "release")).toBe(false); // claim HELD
    expect(outcome).toEqual({
      status: "lane-failed",
      bead: "fx-f",
      lane: "quick",
      priorKind: "feature",
      logPath: "/logs/fx-f.1.log",
    });
  });

  it("bounces a missing-kind bead back to the board (claim then release + note)", async () => {
    const q = fakeQueue([bead("fx-m", [])]); // groomed but no kind:*
    const outcome = await triage("fx-m", { queue: q, dispatch: prOpenDispatch() });

    // Claimed, then released with the grooming-gap reason as a note (§3.1 bounced).
    expect(q.calls[0]).toEqual({ op: "claim", id: "fx-m" });
    expect(q.calls[1]).toEqual({ op: "release", id: "fx-m" });
    expect(q.calls[2]).toEqual({
      op: "stamp",
      id: "fx-m",
      note: "serve: bounced (needs-groom: missing kind)",
    });
    expect(outcome).toEqual({
      status: "bounced",
      bead: "fx-m",
      reason: "needs-groom: missing kind",
    });
  });

  it("bounces a needs-spec bead, RE-APPLYING the needs-spec label (§3.1, sub-35nn fix)", async () => {
    const q = fakeQueue([bead("fx-s", ["needs-spec", "kind:feature"])]);
    const outcome = await triage("fx-s", { queue: q, dispatch: prOpenDispatch() });

    // router.bounce: release the claim, then RE-APPLY needs-spec (not a note).
    expect(q.calls[0]).toEqual({ op: "claim", id: "fx-s" });
    expect(q.calls[1]).toEqual({ op: "release", id: "fx-s" });
    expect(q.calls[2]).toEqual({ op: "addLabel", id: "fx-s", label: "needs-spec" });
    expect(q.calls.some((c) => c.op === "stamp")).toBe(false); // no note for needs-spec
    expect(outcome).toMatchObject({ status: "bounced", reason: "needs-spec" });
  });

  it("reports not-found without mutating when the id is not on the board", async () => {
    const q = fakeQueue([bead("fx-a", ["kind:feature"])]);
    const outcome = await triage("fx-missing", { queue: q, dispatch: prOpenDispatch() });
    expect(outcome).toEqual({ status: "not-found", bead: "fx-missing" });
    expect(q.calls).toEqual([]); // nothing claimed, nothing stamped
  });

  it("invokes the injected dispatch seam once, with the routed bead + lane", async () => {
    const q = fakeQueue([bead("fx-d", ["kind:bug"])]);
    const dispatched: Array<{ id: string; lane: Route }> = [];
    const dispatch: Dispatch = async (b, lane) => {
      dispatched.push({ id: b.id, lane });
      return { status: "landed", ref: "u", branch: "b" };
    };

    await triage("fx-d", { queue: q, dispatch });
    expect(dispatched).toEqual([{ id: "fx-d", lane: "bug" }]);
  });

  it("does NOT dispatch a bounced bead", async () => {
    const q = fakeQueue([bead("fx-m", [])]);
    let dispatchCount = 0;
    const dispatch: Dispatch = async () => {
      dispatchCount++;
      return { status: "landed", ref: "u", branch: "b" };
    };
    await triage("fx-m", { queue: q, dispatch });
    expect(dispatchCount).toBe(0);
  });

  it("the default dispatch stub returns a benign landed (real chain is createDispatch)", async () => {
    const out = await stubDispatch(bead("fx-x", ["kind:feature"]), "quick");
    expect(out).toMatchObject({ status: "landed" });
  });
});

describe("triage — argv shell", () => {
  it("parses a bare bead id, defaulting --repo to cwd", () => {
    const parsed = parseArgs(["fx-a"]);
    expect(parsed).toEqual({ bead: "fx-a", repo: process.cwd() });
  });

  it("parses --repo alongside the positional bead id (either order)", () => {
    expect(parseArgs(["--repo", "/tmp/board", "fx-a"])).toEqual({
      bead: "fx-a",
      repo: "/tmp/board",
    });
    expect(parseArgs(["fx-a", "--repo", "/tmp/board"])).toEqual({
      bead: "fx-a",
      repo: "/tmp/board",
    });
  });

  it("returns null for --help and when no bead id is given", () => {
    expect(parseArgs(["--help"])).toBeNull();
    expect(parseArgs(["-h"])).toBeNull();
    expect(parseArgs(["--repo", "/tmp/board"])).toBeNull(); // no positional
    expect(parseArgs([])).toBeNull();
  });

  it("formats each outcome as one concise result line", () => {
    expect(
      formatOutcome({ status: "in-review", bead: "fx-a", lane: "quick", priorKind: "feature", ref: "https://gh/pr/9" }),
    ).toBe("triage: fx-a → route:quick → in-review (https://gh/pr/9)");
    expect(
      formatOutcome({ status: "lane-failed", bead: "fx-f", lane: "quick", priorKind: "feature", logPath: "/l.log" }),
    ).toContain("lane failed (log /l.log)");
    expect(
      formatOutcome({ status: "bounced", bead: "fx-m", reason: "needs-groom: missing kind" }),
    ).toBe("triage: fx-m bounced — needs-groom: missing kind");
    expect(formatOutcome({ status: "not-found", bead: "fx-x" })).toContain("not on the board");
  });
});

/**
 * A gh/git runner fake: a scripted queue of {@link GhResult}s (in call order),
 * recording every argv it was asked to run so idempotency can be asserted.
 */
function fakeGh(responses: GhResult[]): {
  run: (argv: readonly string[]) => Promise<GhResult>;
  calls: string[][];
} {
  const calls: string[][] = [];
  let i = 0;
  return {
    calls,
    run: async (argv) => {
      calls.push([...argv]);
      const r = responses[i] ?? { code: 1, stdout: "", stderr: "no more responses" };
      i++;
      return r;
    },
  };
}

const ok = (stdout: string): GhResult => ({ code: 0, stdout, stderr: "" });
const fail = (stderr = "not found"): GhResult => ({ code: 1, stdout: "", stderr });

describe("ensurePr — idempotent PR by observation (§6, Step 4.3)", () => {
  const b = bead("fx-pr", ["kind:feature"]);

  it("REUSES an existing PR (gh pr view succeeds) — creates NOTHING", async () => {
    const gh = fakeGh([ok("https://gh/pr/existing\n")]);
    const url = await ensurePr(gh.run, "serve/fx-pr-x", b, "/wt/fx-pr");

    expect(url).toBe("https://gh/pr/existing");
    // Exactly one call — the view. No `gh pr create` (no duplicate branch/PR).
    expect(gh.calls).toHaveLength(1);
    expect(gh.calls[0]!.slice(0, 3)).toEqual(["gh", "pr", "view"]);
    expect(gh.calls.some((c) => c.includes("create"))).toBe(false);
  });

  it("creates a PR only when none is observed, then reads back its url", async () => {
    // view → not found; create → ok; confirm view → url.
    const gh = fakeGh([fail(), ok(""), ok("https://gh/pr/new\n")]);
    const url = await ensurePr(gh.run, "serve/fx-pr-x", b, "/wt/fx-pr");

    expect(url).toBe("https://gh/pr/new");
    expect(gh.calls[0]!.slice(0, 3)).toEqual(["gh", "pr", "view"]);
    expect(gh.calls[1]!.slice(0, 3)).toEqual(["gh", "pr", "create"]);
    expect(gh.calls[2]!.slice(0, 3)).toEqual(["gh", "pr", "view"]);
  });

  it("re-running after a mid-flow kill finds the existing PR — no duplicate create", async () => {
    // Second run: the PR from the first (partial) run is already open.
    const gh = fakeGh([ok("https://gh/pr/existing\n")]);
    await ensurePr(gh.run, "serve/fx-pr-x", b, "/wt/fx-pr");
    expect(gh.calls.filter((c) => c.includes("create"))).toHaveLength(0);
  });

  it("returns null when neither view nor create yields a PR (§5.2 no-pr)", async () => {
    const gh = fakeGh([fail(), fail("create refused")]);
    const url = await ensurePr(gh.run, "serve/fx-pr-x", b, "/wt/fx-pr");
    expect(url).toBeNull();
  });
});

describe("createDispatch — mode: github, route→worktree→session→PR wiring (mocked, §4.6/§5.2)", () => {
  const b = bead("fx-w", ["kind:feature"]);

  // A real temp repoRoot so `runSession`'s log write lands on a writable path —
  // still no real git/claude/gh; only the local logs dir is touched.
  let repoRoot: string;
  beforeEach(() => {
    repoRoot = mkdtempSync(join(tmpdir(), "serve-dispatch-"));
  });
  afterEach(() => {
    rmSync(repoRoot, { recursive: true, force: true });
  });

  /**
   * Base deps with all external effects mocked — no real git/claude/gh. Pinned to
   * `mode: github` explicitly: `DEFAULT_CONFIG.mode` is now `local`, so leaving it
   * implicit here would silently exercise the wrong observation path.
   */
  function dispatchDeps(over: Partial<DispatchDeps> = {}): DispatchDeps {
    return {
      repoRoot,
      config: { ...DEFAULT_CONFIG, mode: "github" },
      // Fake git: swallow every worktree command, return empty stdout.
      git: async () => "",
      // Fake trunk resolver — no real origin.
      trunk: async () => "main",
      // Fake session spawn — a benign JSON result, no real `claude`.
      spawn: async () => ({ exitCode: 0, stdout: '{"total_cost_usd":0}' }),
      // Fake gh: an already-open PR (view succeeds).
      gh: async () => ok("https://gh/pr/w\n"),
      ...over,
    };
  }

  it("drives worktree → session → PR and reports pr-open on an observed PR", async () => {
    const gitCalls: string[][] = [];
    const spawnCalls: Array<{ command: string; cwd: string }> = [];
    const dispatch = createDispatch(
      dispatchDeps({
        git: async (args) => {
          gitCalls.push([...args]);
          return "";
        },
        spawn: async (command, _args, cwd) => {
          spawnCalls.push({ command, cwd });
          return { exitCode: 0, stdout: "{}" };
        },
        gh: async () => ok("https://gh/pr/w\n"),
      }),
    );

    const result = await dispatch(b, "quick");

    // Worktree was created (fetch + worktree add both ran through git).
    expect(gitCalls.some((c) => c[0] === "fetch")).toBe(true);
    expect(gitCalls.some((c) => c[0] === "worktree" && c[1] === "add")).toBe(true);
    // Session spawned `claude` in the bead's worktree.
    expect(spawnCalls).toHaveLength(1);
    expect(spawnCalls[0]!.command).toBe("claude");
    expect(spawnCalls[0]!.cwd).toContain("fx-w");
    // Observed PR → landed with the url as the evidence ref.
    expect(result).toMatchObject({ status: "landed", ref: "https://gh/pr/w" });
  });

  it("reports no-landing with the session log path when no PR is observed (§5.2)", async () => {
    const dispatch = createDispatch(
      dispatchDeps({ gh: async () => fail() }), // view fails, create fails (same fake)
    );
    const result = await dispatch(b, "quick");
    expect(result.status).toBe("no-landing");
    if (result.status === "no-landing") {
      expect(result.logPath).toContain("fx-w.1.log");
    }
  });
});

describe("lanePrompt — the §5.2 headless prompt", () => {
  it("inlines the bead, its kind hint, the mode, and the skill invocation", () => {
    const p = lanePrompt(bead("fx-p", ["kind:bug"]), "serve-bead", "local");
    expect(p).toContain("fx-p");
    expect(p).toContain("Kind: bug"); // the routing prior, passed as a HINT
    expect(p).toContain("Mode: local"); // decides commit-only vs commit-and-push
    expect(p).toContain("/substrate:serve-bead");
  });

  it("does NOT carry the standing rules — those live in the skill", () => {
    // Regression guard: the prompt used to hardcode "push the branch and open a
    // PR with `gh pr create`" in TypeScript, which made the lane contract
    // un-editable without a daemon release — and wrong outright in local mode.
    const p = lanePrompt(bead("fx-p", ["kind:task"]), "serve-bead", "local");
    expect(p).not.toContain("gh pr create");
    expect(p).not.toContain("push the");
  });
});

describe("createDispatch — mode: local, the gate-green done-signal", () => {
  const b = bead("fx-l", ["kind:task"]);

  let repoRoot: string;
  beforeEach(() => {
    repoRoot = mkdtempSync(join(tmpdir(), "serve-local-"));
  });
  afterEach(() => {
    rmSync(repoRoot, { recursive: true, force: true });
  });

  /**
   * Local-mode deps. `git` answers the two reads the local path makes — the base
   * sha at creation and the commit count afterwards — from `commits`, so a test
   * can say "the session committed N times" without a real repo.
   */
  function localDeps(over: {
    commits?: number;
    gateExit?: number;
    gate?: Partial<DispatchDeps>["gate"];
  } = {}): DispatchDeps {
    const commits = over.commits ?? 1;
    return {
      repoRoot,
      config: { ...DEFAULT_CONFIG, mode: "local" },
      git: async (args) => {
        if (args[0] === "rev-parse" && args[1] === "HEAD") return "basesha\n";
        if (args[0] === "rev-list" && args[1] === "--count") return `${commits}\n`;
        return "";
      },
      trunk: async () => "main",
      remote: async () => false, // a local-only board: no origin at all
      spawn: async () => ({ exitCode: 0, stdout: '{"total_cost_usd":0}' }),
      // Any `gh` call here is a bug — local mode must never shell out to it.
      gh: async () => {
        throw new Error("gh must not be invoked in mode: local");
      },
      gate: over.gate !== undefined ? over.gate : { compile: "true" },
      shell: async () => ({ code: over.gateExit ?? 0, stdout: "", stderr: "" }),
    };
  }

  it("lands on ≥1 commit + a green gate, with the worktree as the evidence ref", async () => {
    const result = await createDispatch(localDeps({ commits: 1, gateExit: 0 }))(b, "quick");
    expect(result.status).toBe("landed");
    if (result.status === "landed") {
      expect(result.ref).toContain("fx-l");
      expect(result.ref).toContain("#serve/fx-l");
    }
  });

  it("never fetches, and cuts the branch from the LOCAL trunk when there is no origin", async () => {
    const gitCalls: string[][] = [];
    const deps = localDeps();
    const dispatch = createDispatch({
      ...deps,
      git: async (args, cwd) => {
        gitCalls.push([...args]);
        return deps.git!(args, cwd);
      },
    });
    await dispatch(b, "quick");

    expect(gitCalls.some((c) => c[0] === "fetch")).toBe(false);
    const add = gitCalls.find((c) => c[0] === "worktree" && c[1] === "add");
    expect(add?.at(-1)).toBe("main"); // not `origin/main`
  });

  it("does NOT land when the session made no commits (the refuse-arm)", async () => {
    // This is the path /substrate:serve-bead takes ON PURPOSE for an
    // under-specified bead: exit without committing, so the daemon bounces it
    // back to the board rather than shipping a guess.
    const result = await createDispatch(localDeps({ commits: 0 }))(b, "quick");
    expect(result.status).toBe("no-landing");
    if (result.status === "no-landing") {
      expect(result.reason).toContain("no commits");
    }
  });

  it("does NOT land when the gate is red, even with commits present", async () => {
    const result = await createDispatch(localDeps({ commits: 3, gateExit: 1 }))(b, "quick");
    expect(result.status).toBe("no-landing");
    if (result.status === "no-landing") {
      expect(result.reason).toContain("gate failed");
    }
  });

  it("refuses rather than trusting the session when the repo declares no gate", async () => {
    // With no gate there is nothing to observe, so accepting the commit would
    // mean taking the session's word for it — exactly what §5.2 forbids.
    const result = await createDispatch(localDeps({ commits: 1, gate: null }))(b, "quick");
    expect(result.status).toBe("no-landing");
    if (result.status === "no-landing") {
      expect(result.reason).toContain("no gate");
    }
  });
});
