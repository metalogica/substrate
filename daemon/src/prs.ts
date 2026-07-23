// prs.ts — the `gh`/GitHub PR adapter (spec §6, §3.2b events).
//
// Responsibilities:
//   - Poll PRs via `gh api` with *stored ETags* (`If-None-Match`); a 304 =
//     free, nothing changed, no re-processing.
//   - Identify *owned* PRs: open, head branch matches `branchPrefix`, mapping
//     to an in-flight bead.
//   - Fetch review comments + issue comments *since the last seen id*, dedup
//     by comment id (locks brief OQ3: batch per poll, keyed by comment ids).
//   - Detect merge: PR `mergedAt` non-null, or the `git merge-base
//     --is-ancestor` fallback when the API is ambiguous.
//
// The daemon shells out — it never reimplements gh's store or GitHub's API.
// All process invocation flows through an injectable {@link Exec} so tests can
// drive the adapter off recorded fixtures with zero real network calls.

/**
 * Result of one shelled-out command. `code === 0` is success; `stdout` carries
 * the payload, `stderr` the diagnostics. Modelled on a child_process result but
 * kept minimal so a fixture can satisfy it directly.
 */
export interface ExecResult {
  code: number;
  stdout: string;
  stderr: string;
}

/**
 * Injectable process runner. The real daemon binds this to a `gh`/`git` spawn;
 * tests bind it to a fixture table. `argv[0]` is the program (e.g. `"gh"` /
 * `"git"`), the rest its arguments — no shell, no string splitting.
 */
export type Exec = (argv: readonly string[]) => Promise<ExecResult>;

/**
 * ETag store: maps a poll resource key (an opaque string the caller chooses,
 * e.g. the PR's comments URL) to the ETag GitHub last returned for it. A 304
 * means "your ETag still holds" — the resource is unchanged since that tag.
 *
 * Modelled as a plain interface so the daemon can back it with `state.json` or
 * an in-memory map without this module caring which.
 */
export interface ETagStore {
  get(key: string): string | undefined;
  set(key: string, etag: string): void;
}

/** An in-memory {@link ETagStore}, sufficient for a single daemon process. */
export function memoryETagStore(
  seed?: Readonly<Record<string, string>>,
): ETagStore {
  const map = new Map<string, string>(seed ? Object.entries(seed) : undefined);
  return {
    get: (key) => map.get(key),
    set: (key, etag) => {
      map.set(key, etag);
    },
  };
}

/** An in-flight bead the PR loop maps owned PRs back onto (subset of state). */
export interface InFlightRef {
  bead: string;
  branch: string;
}

/** A PR as returned by `gh api` / `gh pr list` (only the fields we consume). */
export interface PullRequest {
  number: number;
  /** Head branch name (`headRefName`). */
  headRefName: string;
  /** Open PRs have state `"OPEN"`; merged/closed otherwise. */
  state: string;
  /** ISO timestamp when merged, or `null` if not merged. */
  mergedAt: string | null;
  /** Merge commit SHA once merged, else `null`. */
  mergeCommit: string | null;
}

/** An owned PR joined to the in-flight bead it belongs to. */
export interface OwnedPR {
  bead: string;
  pr: PullRequest;
}

/**
 * A single review or issue comment, normalized across the two gh endpoints.
 * `id` is GitHub's numeric comment id — the dedup + cursor key.
 */
export interface Comment {
  id: number;
  /** `"review"` (a PR review thread comment) or `"issue"` (a top-level comment). */
  kind: "review" | "issue";
  body: string;
  author: string;
  /** ISO creation timestamp. */
  createdAt: string;
}

/**
 * Owned-PR selection (§6): keep only open PRs whose head branch starts with
 * `branchPrefix` *and* maps to an in-flight bead. Pure — no I/O.
 */
export function selectOwnedPRs(
  prs: readonly PullRequest[],
  inFlight: readonly InFlightRef[],
  branchPrefix: string,
): OwnedPR[] {
  const byBranch = new Map<string, string>();
  for (const f of inFlight) byBranch.set(f.branch, f.bead);

  const owned: OwnedPR[] = [];
  for (const pr of prs) {
    if (pr.state !== "OPEN") continue;
    if (!pr.headRefName.startsWith(branchPrefix)) continue;
    const bead = byBranch.get(pr.headRefName);
    if (bead === undefined) continue;
    owned.push({ bead, pr });
  }
  return owned;
}

/** Outcome of one ETag-conditioned poll. */
export type PollResult =
  /** 304 Not Modified: the stored ETag still holds; nothing to process. */
  | { kind: "not-modified" }
  /** 200 OK: fresh payload, plus the ETag to store for next time. */
  | { kind: "modified"; etag: string | null; body: string };

/**
 * ETag-conditioned poll of one resource via `gh api`. Sends `If-None-Match`
 * when we hold an ETag for `key`; a 304 returns `not-modified` (free — no
 * re-processing). On 200 we return the body and the new ETag, and store it so
 * the next poll is conditional too.
 *
 * `gh api -i` prints the response headers then the body; we parse the status
 * line for 304 vs 200 and the `ETag:` header for the new tag. This keeps the
 * whole thing to `gh` + node builtins with an injectable exec.
 */
export async function pollWithETag(
  exec: Exec,
  store: ETagStore,
  key: string,
  apiPath: string,
): Promise<PollResult> {
  const argv = ["gh", "api", "-i", apiPath];
  const prior = store.get(key);
  if (prior !== undefined) {
    argv.push("-H", `If-None-Match: ${prior}`);
  }

  const res = await exec(argv);
  const status = parseStatusCode(res.stdout);

  if (status === 304) {
    return { kind: "not-modified" };
  }

  const etag = parseETag(res.stdout);
  if (etag !== null) store.set(key, etag);
  return { kind: "modified", etag, body: parseBody(res.stdout) };
}

/**
 * Fold a batch of comments against a cursor: keep only those with `id >
 * lastSeenId`, dedup by id (a comment can surface on more than one endpoint or
 * poll), and report the new cursor (max id seen, never regressing).
 *
 * This is the anti-double-reply guard (§6 "dedup replies by comment id"): the
 * returned `fresh` list is exactly what the actualize session should address,
 * and `cursor` is what the caller persists for the next poll.
 */
export function advanceComments(
  comments: readonly Comment[],
  lastSeenId: number,
): { fresh: Comment[]; cursor: number } {
  const seen = new Set<number>();
  const fresh: Comment[] = [];
  let cursor = lastSeenId;

  for (const c of comments) {
    if (c.id > cursor) cursor = c.id;
    if (c.id <= lastSeenId) continue; // already actualized in a prior poll
    if (seen.has(c.id)) continue; // dedup within this batch
    seen.add(c.id);
    fresh.push(c);
  }

  // Stable order by id so replies go out in comment order.
  fresh.sort((a, b) => a.id - b.id);
  return { fresh, cursor };
}

/**
 * Merge detection (§6). Primary signal: the PR's own `mergedAt` is non-null →
 * merged, with the merge SHA when gh reported it. Fallback: when `mergedAt` is
 * absent (API lag / closed-then-merged edge), ask git whether `trunk` contains
 * the PR head via `git merge-base --is-ancestor <head> <trunk>` (exit 0 = yes).
 *
 * `cwd` is the repo the git check runs in; `head`/`trunk` are the refs to test.
 */
export async function detectMerge(
  exec: Exec,
  pr: PullRequest,
  git: { cwd: string; head: string; trunk: string },
): Promise<{ merged: boolean; sha: string | null }> {
  if (pr.mergedAt !== null) {
    return { merged: true, sha: pr.mergeCommit };
  }

  const res = await exec([
    "git",
    "-C",
    git.cwd,
    "merge-base",
    "--is-ancestor",
    git.head,
    git.trunk,
  ]);
  // Exit 0 => head is an ancestor of trunk => effectively merged.
  return { merged: res.code === 0, sha: null };
}

// ── HTTP response parsing (gh api -i output) ─────────────────────────────────

/** Extract the numeric status code from the first `HTTP/…` line of `-i` output. */
function parseStatusCode(raw: string): number {
  const line = raw.split(/\r?\n/, 1)[0] ?? "";
  const m = /^HTTP\/[\d.]+\s+(\d{3})/.exec(line);
  return m ? Number(m[1]) : 0;
}

/** Extract the `ETag` header value (unquoted-preserving), or `null`. */
function parseETag(raw: string): string | null {
  for (const line of headerLines(raw)) {
    const m = /^etag:\s*(.+?)\s*$/i.exec(line);
    if (m && m[1] !== undefined) return m[1];
  }
  return null;
}

/** The body is everything after the first blank line separating headers. */
function parseBody(raw: string): string {
  const idx = raw.search(/\r?\n\r?\n/);
  if (idx < 0) return "";
  const sep = /\r\n\r\n/.test(raw.slice(idx, idx + 4)) ? 4 : 2;
  return raw.slice(idx + sep);
}

/** Header lines: everything up to the first blank line, excluding the status line. */
function* headerLines(raw: string): Generator<string> {
  const lines = raw.split(/\r?\n/);
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (line === undefined || line === "") return;
    yield line;
  }
}
