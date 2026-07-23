# Substrate Serve v1: Technical Specification

**Version**: 1.0.0
**Status**: Draft
**Author**: rei nova (via socratic design session, 2026-07-22)
**Date**: 2026-07-22
**Brief**: `docs/tasks/ongoing/serve-v1/serve-v1-brief.md`

---

## 1. Overview

### 1.1 Objective

Add a **`daemon/`** Node/TypeScript package and four CLI verbs — **`substrate serve`**,
**`substrate status`**, **`substrate tidy`**, **`substrate triage <bead-id>`** — that together form
the local-first pull consumer of the tbd board: poll → claim → route → dispatch a headless Claude
Code session in an isolated worktree → open a PR → actualize PR review comments → detect merge →
reap. The daemon is a thin scheduler/observer; all intelligence stays in substrate skills. tbd is
the queue; `{bead, branch, PR, worktree}` is the only resume state; sessions are cattle.

### 1.2 Constraints

(Full list in the brief; binding ones restated.)

- MUST be local-first: foreground process, cwd repo only, no webhooks, no VPS, no new datastore.
  `.substrate/serve/state.json` is observability only — every fact re-derivable from {tbd, git, gh}.
- MUST claim via plain tbd transitions (status `in_progress` + `assignee=serve` + remove `groomed`
  label). The git-ref CAS claim protocol is explicitly deferred to the VPS phase.
- MUST NOT run `/architect-spec`. Spec-needing beads bounce to the board (`needs-spec`, claim
  released).
- MUST end every unit in a human-reviewed PR; no auto-merge.
- MUST make external side effects idempotent by observation (`gh pr view || gh pr create`,
  branch-exists checks, comment-reply dedup by comment id).
- MUST reap on boot (stale worktrees, orphaned claims, merged leftovers) before the first tick.
- MUST cap concurrency (default 1, config max 2) and shell out to `tbd`/`git`/`gh`/`claude` —
  never reimplement their stores/APIs.
- MUST handle Ctrl-C gracefully: release claims of un-dispatched beads, leave worktrees for
  boot-reap, flush state.json.
- SHOULD keep the daemon replaceable: the VPS phase must be a deployment change, not a rewrite.

### 1.3 Success Criteria

- `substrate serve` boots in a tbd-enabled repo, passes preflight (tbd/gh/claude/git present, gh
  authed), reaps, then ticks on the configured interval.
- A `groomed` bead with `kind:feature` is claimed within one tick, routed `route:quick`, built by a
  headless `/substrate:quick-spec` session in a sibling worktree, and lands as an open PR whose URL
  is stamped on the bead — with zero human involvement.
- A `groomed` bead with `needs-spec` (or no usable `kind`) bounces: claim released, `needs-spec`
  noted, visible on the board again. The daemon never invokes architect-spec.
- A human PR review comment is actualized by a **fresh** session (changes pushed + reply posted)
  proving the cattle model; killing serve mid-run and restarting duplicates nothing.
- Merging the PR triggers tidy: worktree reaped, branch deleted, claim released, bead closed with
  the merge SHA. `substrate status` reflects every stage truthfully from `state.json`.
- Gate green throughout: `cd daemon && pnpm gate` (tsc `--noEmit` + vitest).

---

## 2. Architecture

### 2.1 Package layout

```
daemon/
  package.json          # own package; deps: tsx, typescript, vitest, yaml (parsing only)
  tsconfig.json
  src/
    serve.ts            # entry: preflight → boot-reap → tick loop → SIGINT handler
    status.ts           # entry: render state.json snapshot
    tidy.ts             # entry: manual reap
    triage.ts           # entry: claim+route+dispatch ONE bead now
    config.ts           # .substrate/serve.yaml loader + defaults
    tick.ts             # one poll cycle (pure orchestration, unit-testable)
    queue.ts            # tbd CLI adapter: list/claim/release/stamp/close (shells out, --json)
    router.ts           # deterministic route: kind+labels → quick | bug | bounce
    worktree.ts         # sibling-dir worktree lifecycle + seed
    session.ts          # headless claude spawn contract + log capture
    prs.ts              # gh adapter: ETag polling, PR create/view, comments, merge detection
    state.ts            # state.json read/write (atomic, versioned)
  test/                 # vitest; fixture tbd repo under test/fixtures/
```

Runtime = `tsx` (no build step); the gate still runs `tsc --noEmit`. Root `package.json` is
untouched; `daemon/` is self-contained.

### 2.2 CLI wiring

`scripts/substrate` gains four cases, each `exec`-ing `tsx` against the corresponding entry with
the repo root as cwd argument:

```bash
serve)  exec npx -y tsx "$root/daemon/src/serve.ts"  --repo "$PWD" "$@" ;;
status) exec npx -y tsx "$root/daemon/src/status.ts" --repo "$PWD" "$@" ;;
tidy)   exec npx -y tsx "$root/daemon/src/tidy.ts"   --repo "$PWD" "$@" ;;
triage) exec npx -y tsx "$root/daemon/src/triage.ts" --repo "$PWD" "$@" ;;
```

(Exact invocation may pin the daemon's own node_modules; resolved in Phase 1.)

### 2.3 Config — `.substrate/serve.yaml` (in the target repo, optional; all defaulted)

```yaml
pollIntervalSec: 60
concurrency: 1            # max in-flight beads; hard cap 2 in v1
lanes:
  quick:    { skill: "quick-spec", model: null }   # null = inherit
  bug:      { skill: "diagnose",   model: null }
branchPrefix: "serve/"
worktreeRoot: null        # default: ../<repo-name>-serve/
```

---

## 3. Bead lifecycle & state

### 3.1 Transitions (all via `tbd` CLI; daemon = single writer for its own transitions)

| Transition | Mechanics |
|---|---|
| groomed → claimed | `tbd update <id> --status in_progress --assignee serve` + remove `groomed` label (bead leaves the board) |
| claimed → routed | add `route:quick` \| `route:bug` + note `serve: routed <lane> (prior kind:<k>)`; log any prior-override |
| claimed → bounced | add `needs-spec` (or note `needs-groom: missing kind`), remove assignee, status → open (bead returns to board) |
| routed → in-review | note `serve: PR <url>` + label `in-review` after PR creation |
| in-review → closed | on merge: `tbd close <id> --reason "merged <sha>"` |
| any → released | on Ctrl-C/boot-reap of an un-dispatched or dead claim: restore `groomed`, clear assignee, status → open |

### 3.2 `state.json` (observability only, atomic writes, `schemaVersion: 1`)

```json
{ "lastTick": "...", "inFlight": [ { "bead": "...", "lane": "quick",
  "worktree": "...", "branch": "...", "pr": "...", "phase": "building|in-review",
  "sessionPid": 0, "startedAt": "..." } ],
  "bounced": ["..."], "recentEvents": ["..."] }
```

`substrate status` renders the **aerial pipeline view** from it (plus tbd/gh facts): ASCII
stations `board → claimed → building → in-review → merged (24h)` with live bead ids, bounced
row, and tick health; staleness warning when `lastTick` exceeds 2× the poll interval. The
renderer lives in its own module (`pipeline-render.ts`) so a later board-TUI Factory tab can
reuse it. No socket in v1.

### 3.2b `events.jsonl` — the append-only ledger (v1, day one)

`.substrate/serve/events.jsonl`: one line per lifecycle event — `{ts, bead, event:
claim|route|bounce|dispatch|pr-open|actualize|merge|tidy|release, lane?, pr?, sessionOrdinal?,
usage?: {inputTokens, outputTokens, costUsd}}`. Usage comes from the headless session's
`--output-format json` result (§5.2). This is history, not state — never read by the tick, never
reconstructible later, and the data source for the v2 `substrate report` verb (merged beads/week
vs tokens spent = the factory-ROI metric).

### 3.3 Worktrees

Sibling root: `../<repo>-serve/<bead-id>/`, branch `serve/<bead-id>-<slug>` cut from
`origin/<trunk>` fresh at dispatch. Never inside the repo tree. Reap = `git worktree remove
--force` + branch delete + `git worktree prune`.

---

## 4. The tick (one poll cycle)

1. **Sweep owned PRs** (§6) — comments to actualize, merges to tidy. (PR work outranks new claims.)
2. **Capacity check** — `inFlight < concurrency` else stop.
3. **Discover** — `tbd list --label groomed --status open --json`, exclude `needs-spec`; FIFO by
   ULID.
4. **Claim** the head bead (§3.1).
5. **Route** (§5.1). Bounce releases the claim immediately.
6. **Dispatch** (§5.2) — worktree + headless session; on session exit, verify PR by observation,
   stamp bead, move to `in-review`.

Every step is idempotent against a crash between any two sub-steps: boot-reap (§7) restores
invariants from {tbd, git, gh} truth, never from `state.json`.

## 5. Routing & lanes

### 5.1 Deterministic router (v1 locks brief OQ1)

Pure function of the groomed bead's own metadata — **no model call in the tick**:

- `needs-spec` label → **bounce** (spec lane is human, by design).
- `kind:bug` → **bug** lane (`/substrate:diagnose`).
- `kind:feature` | `kind:task` → **quick** lane (`/substrate:quick-spec`).
- missing/other `kind` → **bounce** with `needs-groom: missing kind` — incomplete grooming is the
  human's signal, not the machine's guess. Model-assisted `/substrate:triage` (NL) is v2.

The human prior is therefore never overridden in v1 — only *followed* or *returned*; the override
log obligation is trivially satisfied and the hook for it stays in `router.ts`.

### 5.2 Headless lane session contract

```
cwd   = the bead's worktree
spawn = claude -p "<lane prompt>" --output-format json --dangerously-skip-permissions [--model <lane.model>]
log   → .substrate/serve/logs/<bead-id>.<n>.log   (append; n = session ordinal)
usage → parsed from the JSON result (tokens, cost) and appended to events.jsonl (§3.2b)
```

Lane prompt inlines: the bead (id, title, description, labels), the standing rules (*"work only in
this worktree; commit as you go; push the branch and open a PR with `gh pr create` unless one
exists; never merge; never run tbd"*), and the skill invocation (`/substrate:quick-spec …` or
`/substrate:diagnose …`). Success = **observed**, not reported: branch pushed ∧ PR open. Session
exit without a PR → bead noted `serve: lane failed (log <path>)`, claim held, retried once next
tick, then bounced with the failure note. Permission bypass is scoped by cwd + prompt and accepted
as a v1 single-operator risk (brief constraint); recorded in README.

## 6. PR loop

- **Owned PR** = open PR whose head branch matches `branchPrefix` and maps to an in-flight bead.
- **Poll**: `gh api` with stored ETags (`If-None-Match`; 304 = free). Fetch review threads +
  issue comments since last seen id.
- **Actualize**: new *submitted* review or top-level comment → spawn a **fresh** session in the
  same worktree, prompt = PR diff context + all unaddressed comments (batched — locks brief OQ3:
  batch per poll, keyed by comment ids), rules = *address, push, reply to each comment via `gh`,
  never merge*. Dedup replies by comment id before spawning.
- **Merge detection**: PR `mergedAt` non-null (or `git merge-base --is-ancestor` fallback) →
  tidy that bead (§7) + close it with the merge SHA.

## 7. Tidy & recovery

`tidy.ts` (invoked as the verb, on merge detection, and at serve boot):

1. For each worktree under the serve root: PR merged/closed → reap worktree + branch + prune;
   no live in-flight entry and no open PR → reap + release the bead's claim (restore `groomed`).
2. For each `assignee=serve, in_progress` bead with no worktree and no PR → release claim.
3. Rewrite `state.json` from observed truth.

This is the whole crash story: kill -9 at any point, `substrate serve` boots into a consistent
state. Epic-grade recovery (green-prefix merges) is out of scope — v1 lanes are single-bead.

---

## 8. Prompt Execution Strategy

<!-- PROTOCOL: references/docs-core/docs/protocol/sdd/execution-format.md (phases → steps → Verify → Gate)
     Gate for all phases: cd daemon && pnpm gate   (= tsc --noEmit && vitest run)
     Phases 4,5,7 add live drills (real repo, real gh) as out-of-band verification. -->

### Phase 1: Package scaffold + CLI verbs

#### Step 1.1: `daemon/` package + gate
`package.json` (tsx, typescript, vitest, yaml; `"gate": "tsc --noEmit && vitest run"`),
`tsconfig.json` (strict), empty entries for the four verbs each printing a stub line, `config.ts`
with defaults + yaml override, `state.ts` atomic read/write + schemaVersion.

##### Verify
- `test -f daemon/package.json && grep -q '"gate"' daemon/package.json`
- `cd daemon && pnpm install && pnpm gate`

#### Step 1.2: Wire `scripts/substrate` + preflight + SIGINT
Add the four cases (§2.2); `serve.ts` preflight (tbd, gh authed, claude, git — fail with one
actionable line each), SIGINT handler (release un-dispatched claims, flush state, exit 0).

##### Verify
- `bash scripts/substrate serve --help` prints usage from a non-tbd dir and exits non-zero on preflight
- `grep -qE "serve\)" scripts/substrate && grep -qE "triage\)" scripts/substrate`

#### Gate
- `cd daemon && pnpm gate`; verbs dispatch end-to-end to stubs.

### Phase 2: Queue adapter + tick + claim

#### Step 2.1: `queue.ts` tbd adapter
list/claim/release/stamp/close via `tbd … --json` subprocesses; typed results; no store parsing.

#### Step 2.2: `tick.ts` skeleton
Capacity → discover (FIFO by ULID, exclude `needs-spec`) → claim → (route stub) with §3.1
transitions; injectable adapters so vitest drives it against a fixture repo under
`daemon/test/fixtures/` (a real tiny tbd repo created in test setup).

##### Verify
- Vitest: claim removes `groomed`+sets assignee; release restores; FIFO order; capacity respected.

#### Gate
- `cd daemon && pnpm gate` (fixture-driven tick tests green).

### Phase 3: Router + bounce + manual `triage` verb

#### Step 3.1: `router.ts` (§5.1) + bounce transitions + override-log hook
#### Step 3.2: `triage.ts` = claim+route+dispatch one bead immediately (shares tick internals)

##### Verify
- Vitest: kind:bug→bug; kind:feature/task→quick; needs-spec→bounce; missing kind→bounce w/ note.
- Live: `substrate triage <fixture-bead>` routes and stamps on a scratch repo.

#### Gate
- `cd daemon && pnpm gate`.

### Phase 4: Worktrees + headless dispatch + PR creation

#### Step 4.1: `worktree.ts` sibling lifecycle (create off fresh trunk, reap, prune; §3.3)
#### Step 4.2: `session.ts` spawn contract (§5.2) + log capture + observed-success check
#### Step 4.3: PR idempotency: `gh pr view <branch> || gh pr create`; stamp bead `in-review`

##### Verify
- Vitest (worktree lifecycle on a fixture git repo; session spawn mocked).
- **Live drill**: one groomed `kind:task` bead in a scratch GitHub repo → `substrate triage <id>`
  → real headless session → open PR, URL on the bead. Kill/rerun triage mid-flow → no duplicate
  branch/PR.

#### Gate
- `cd daemon && pnpm gate` + live drill checklist recorded in the bead notes.

### Phase 5: PR polling + actualization + merge detection

#### Step 5.1: `prs.ts` ETag polling + owned-PR mapping + comment cursor (dedup by comment id)
#### Step 5.2: Actualize session (fresh spawn, batched comments, reply via gh) + merge detection

##### Verify
- Vitest with recorded gh fixtures: 304 path, new-comment batch, merged detection.
- **Live drill**: comment on the Phase-4 PR → fresh session pushes a change + replies; merge the
  PR → detected within one tick.

#### Gate
- `cd daemon && pnpm gate` + live drill.

### Phase 6: Tidy + status + serve loop assembly

#### Step 6.1: `tidy.ts` (§7: verb + on-merge + boot-reap) — reconcile from {tbd, git, gh} only
#### Step 6.2: `pipeline-render.ts` (shared aerial-view renderer, §3.2) + `status.ts` (render +
staleness warning); `serve.ts` full loop (boot-reap → interval ticks → PR-sweep-first ordering §4);
events.jsonl writes at every transition (§3.2b)

##### Verify
- Vitest: orphaned-claim release; merged-worktree reap; state rewrite from observed truth.
- **Live drill**: kill -9 serve mid-build → restart → boot-reap yields consistent board/state;
  `substrate status` truthful at every stage.

#### Gate
- `cd daemon && pnpm gate`.

### Phase 7: End-to-end drill + docs + doctrine reconciliation

#### Step 7.1: Full lifecycle drill on a scratch repo
groomed → claim → route → build → PR → comment → actualize → merge → tidy → closed bead; plus the
bounce path; plus Ctrl-C mid-tick. Record the checklist in the epic bead.

#### Step 7.2: Docs + reconciliation
README (verb table, config, the permission-bypass standing risk), `scripts/substrate` help text,
CHANGELOG. Diff against `references/docs-core/docs/doctrine/agents-parallel-execution-doctrine.md`
+ the agents meta-doctrine; codify only what the shipped code already does (single-writer analog:
the daemon is the sole author of its transitions); anything aspirational → follow-up beads, not
doctrine.

##### Verify
- `grep -q "substrate serve" README.md && grep -qi "skip-permissions\|permission bypass" README.md`
- doctrine-lint green.

#### Gate
- `cd daemon && pnpm gate` + full-drill checklist complete.

---

## 9. Risks & standing notes

| Risk | Disposition |
|---|---|
| Headless permission bypass on the operator's machine | Accepted v1 (single operator, cwd-scoped); README standing risk; revisit with sandboxing at VPS phase |
| Laptop contention (CPU/tokens vs. sync spec work) | concurrency default 1; the pain is the measured argument for the VPS phase |
| Label-based claim races (TUI vs daemon, same store) | Accepted locally (serialized through the local store, tiny window); §5 ref-CAS is the VPS upgrade |
| `claude -p` output/behavior drift | Success is observed (branch ∧ PR), never parsed from session output |
| gh rate limits | ETag/304 polling; owned-PR scope keeps N small |
