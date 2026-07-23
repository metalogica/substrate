import { describe, it, expect } from "vitest";
import {
  type Exec,
  type ExecResult,
  type PullRequest,
  type Comment,
  memoryETagStore,
  selectOwnedPRs,
  pollWithETag,
  advanceComments,
  detectMerge,
} from "../src/prs.js";

// ── Recorded gh fixtures ─────────────────────────────────────────────────────
// These are the raw `gh api -i` responses captured from real GitHub polls,
// replayed here so the adapter is proven without a single network call. Each
// stubbed Exec asserts the exact argv it expects, then returns a fixture.

/** A `gh api -i` 200 response: status line, headers (incl. ETag), blank, body. */
function ghResponse(
  status: number,
  headers: Record<string, string>,
  body: string,
): string {
  const head = [`HTTP/2.0 ${status}`];
  for (const [k, v] of Object.entries(headers)) head.push(`${k}: ${v}`);
  return head.join("\r\n") + "\r\n\r\n" + body;
}

function ok(stdout: string): ExecResult {
  return { code: 0, stdout, stderr: "" };
}

/** Build an Exec that expects a specific argv and returns a canned result. */
function stubExec(
  expect304Header: boolean,
  result: ExecResult,
): { exec: Exec; calls: string[][] } {
  const calls: string[][] = [];
  const exec: Exec = async (argv) => {
    calls.push([...argv]);
    const hasCond = argv.includes("If-None-Match: W/\"etag-v1\"");
    if (expect304Header && !hasCond) {
      throw new Error("expected If-None-Match header on the conditional poll");
    }
    return result;
  };
  return { exec, calls };
}

// The comment cursor fixture: what GitHub returned across two polls.
const COMMENTS_POLL_1: Comment[] = [
  { id: 101, kind: "issue", body: "please rename this", author: "rev", createdAt: "2026-07-22T10:00:00Z" },
  { id: 102, kind: "review", body: "extract a helper", author: "rev", createdAt: "2026-07-22T10:01:00Z" },
];

const COMMENTS_POLL_2: Comment[] = [
  // 101 + 102 re-appear (GitHub returns the whole thread) — must be deduped.
  { id: 101, kind: "issue", body: "please rename this", author: "rev", createdAt: "2026-07-22T10:00:00Z" },
  { id: 102, kind: "review", body: "extract a helper", author: "rev", createdAt: "2026-07-22T10:01:00Z" },
  // one genuinely new comment:
  { id: 103, kind: "review", body: "add a test for this", author: "rev", createdAt: "2026-07-22T10:05:00Z" },
];

describe("selectOwnedPRs (§6 owned-PR mapping)", () => {
  const inFlight = [
    { bead: "sub-abc1", branch: "serve/sub-abc1-slug" },
    { bead: "sub-def2", branch: "serve/sub-def2-slug" },
  ];

  it("keeps open, prefix-matching PRs mapped to an in-flight bead", () => {
    const prs: PullRequest[] = [
      { number: 1, headRefName: "serve/sub-abc1-slug", state: "OPEN", mergedAt: null, mergeCommit: null },
    ];
    const owned = selectOwnedPRs(prs, inFlight, "serve/");
    expect(owned).toEqual([{ bead: "sub-abc1", pr: prs[0] }]);
  });

  it("drops closed PRs, wrong-prefix branches, and unmapped branches", () => {
    const prs: PullRequest[] = [
      { number: 1, headRefName: "serve/sub-abc1-slug", state: "MERGED", mergedAt: "x", mergeCommit: "sha" },
      { number: 2, headRefName: "feature/other", state: "OPEN", mergedAt: null, mergeCommit: null },
      { number: 3, headRefName: "serve/sub-zzz9-slug", state: "OPEN", mergedAt: null, mergeCommit: null },
    ];
    expect(selectOwnedPRs(prs, inFlight, "serve/")).toEqual([]);
  });
});

describe("pollWithETag (§6 ETag polling)", () => {
  it("304 path: sends If-None-Match and reports not-modified (free, no re-processing)", async () => {
    const store = memoryETagStore({ "pr/1/comments": 'W/"etag-v1"' });
    const { exec, calls } = stubExec(true, ok(ghResponse(304, {}, "")));

    const res = await pollWithETag(exec, store, "pr/1/comments", "/repos/o/r/issues/1/comments");

    expect(res.kind).toBe("not-modified");
    // The conditional header was actually sent.
    expect(calls[0]).toContain("If-None-Match: W/\"etag-v1\"");
    // The stored ETag is untouched by a 304.
    expect(store.get("pr/1/comments")).toBe('W/"etag-v1"');
  });

  it("200 path: returns the fresh body and stores the new ETag for next time", async () => {
    const store = memoryETagStore(); // cold: no prior ETag
    const body = JSON.stringify(COMMENTS_POLL_1);
    const { exec, calls } = stubExec(false, ok(ghResponse(200, { ETag: 'W/"etag-v2"' }, body)));

    const res = await pollWithETag(exec, store, "pr/1/comments", "/repos/o/r/issues/1/comments");

    expect(res.kind).toBe("modified");
    if (res.kind === "modified") {
      expect(res.etag).toBe('W/"etag-v2"');
      expect(JSON.parse(res.body)).toEqual(COMMENTS_POLL_1);
    }
    // A cold poll sends no conditional header.
    expect(calls[0]?.some((a) => a.startsWith("If-None-Match"))).toBe(false);
    // The new ETag is now stored → the next poll will be conditional.
    expect(store.get("pr/1/comments")).toBe('W/"etag-v2"');
  });

  it("second poll after a 200 becomes conditional and can go 304 (no re-processing)", async () => {
    const store = memoryETagStore();

    // First poll: 200, seeds the ETag.
    const first = stubExec(false, ok(ghResponse(200, { ETag: 'W/"etag-v1"' }, "[]")));
    await pollWithETag(first.exec, store, "pr/1/comments", "/p");
    expect(store.get("pr/1/comments")).toBe('W/"etag-v1"');

    // Second poll: the stored ETag is replayed and GitHub answers 304.
    const second = stubExec(true, ok(ghResponse(304, {}, "")));
    const res = await pollWithETag(second.exec, store, "pr/1/comments", "/p");
    expect(res.kind).toBe("not-modified");
    expect(second.calls[0]).toContain("If-None-Match: W/\"etag-v1\"");
  });
});

describe("advanceComments (§6 dedup by comment id + cursor)", () => {
  it("new-comment-batch path: only ids past the cursor are fresh, deduped, ordered", () => {
    // Poll 1: cold cursor (0). Both comments are new.
    const p1 = advanceComments(COMMENTS_POLL_1, 0);
    expect(p1.fresh.map((c) => c.id)).toEqual([101, 102]);
    expect(p1.cursor).toBe(102);

    // Poll 2: cursor is 102. 101+102 re-appear (deduped/below cursor); only 103 is fresh.
    const p2 = advanceComments(COMMENTS_POLL_2, p1.cursor);
    expect(p2.fresh.map((c) => c.id)).toEqual([103]);
    expect(p2.cursor).toBe(103);
  });

  it("re-processing a stale batch yields nothing (idempotent against a repeated poll)", () => {
    // Same batch, cursor already past it → no fresh work, cursor holds.
    const again = advanceComments(COMMENTS_POLL_1, 102);
    expect(again.fresh).toEqual([]);
    expect(again.cursor).toBe(102);
  });

  it("dedups duplicate ids within a single batch", () => {
    const dup: Comment[] = [
      { id: 200, kind: "issue", body: "a", author: "x", createdAt: "t" },
      { id: 200, kind: "review", body: "a", author: "x", createdAt: "t" },
      { id: 201, kind: "issue", body: "b", author: "x", createdAt: "t" },
    ];
    const { fresh, cursor } = advanceComments(dup, 0);
    expect(fresh.map((c) => c.id)).toEqual([200, 201]);
    expect(cursor).toBe(201);
  });
});

describe("detectMerge (§6 merge detection)", () => {
  const trunkGit = { cwd: "/repo", head: "serve/sub-abc1-slug", trunk: "origin/main" };

  it("merged path: mergedAt non-null → merged with the merge SHA, no git call", async () => {
    let called = false;
    const exec: Exec = async () => {
      called = true;
      return ok("");
    };
    const pr: PullRequest = {
      number: 1, headRefName: "serve/sub-abc1-slug", state: "MERGED",
      mergedAt: "2026-07-22T12:00:00Z", mergeCommit: "deadbeef",
    };
    const res = await detectMerge(exec, pr, trunkGit);
    expect(res).toEqual({ merged: true, sha: "deadbeef" });
    expect(called).toBe(false); // primary signal short-circuits the git fallback
  });

  it("fallback path: mergedAt null but head is an ancestor of trunk (git exit 0) → merged", async () => {
    const calls: string[][] = [];
    const exec: Exec = async (argv) => {
      calls.push([...argv]);
      return { code: 0, stdout: "", stderr: "" }; // --is-ancestor: yes
    };
    const pr: PullRequest = {
      number: 1, headRefName: "serve/sub-abc1-slug", state: "CLOSED",
      mergedAt: null, mergeCommit: null,
    };
    const res = await detectMerge(exec, pr, trunkGit);
    expect(res).toEqual({ merged: true, sha: null });
    expect(calls[0]).toEqual([
      "git", "-C", "/repo", "merge-base", "--is-ancestor",
      "serve/sub-abc1-slug", "origin/main",
    ]);
  });

  it("fallback path: not an ancestor (git exit 1) → not merged", async () => {
    const exec: Exec = async () => ({ code: 1, stdout: "", stderr: "" });
    const pr: PullRequest = {
      number: 1, headRefName: "serve/sub-abc1-slug", state: "OPEN",
      mergedAt: null, mergeCommit: null,
    };
    const res = await detectMerge(exec, pr, trunkGit);
    expect(res).toEqual({ merged: false, sha: null });
  });
});
