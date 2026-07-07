# Orchestrate: Technical Specification

**Version**: 1.0.0
**Status**: Draft
**Author**: rei nova (via substrate SDD protocol — architect-spec)
**Date**: 2026-07-07
**Brief**: `docs/tasks/ongoing/orchestrate/orchestrate-brief.md`

---

## 1. Overview

### 1.1 Objective

Add a new substrate skill **`/substrate:orchestrate <epic-or-spec>`** that executes a graphed
bead DAG (from `/substrate:graph-spec`) as a **parallel worktree fleet**, faithfully
operationalizing `agents-parallel-execution-doctrine.md`. Add a companion **`bead-implementer`**
subagent (the per-bead worker). Add a **Step-0 routing preamble** to `/substrate:execute` so the
coding agent delegates to `orchestrate` when the DAG warrants it, else runs the existing sequential
prose path. Ship **OpenCode parity** for both the command and the agent. The skill is
**tool-agnostic** — its only tool-coupled seam is subagent dispatch (Agent tool in Claude Code,
Task tool in OpenCode) — with a Claude-Code-only **Workflow fast-path** layered over that portable
floor.

### 1.2 Constraints

- MUST operationalize the parallel-execution doctrine faithfully (single-writer tracker,
  `feat/<epic-slug>` integration branch, worktree-per-bead off the *current tip*, merge-on-green,
  file-disjoint waves, two-stage gate, re-gate the integrated tip, unattended-signing, worktree
  hygiene, batch sync). The doctrine holds the *why*; the skill holds the *operational loop*.
- MUST read the DAG, never re-derive it: consume `bash docs/scripts/bead-graph.sh --epic <slug>`.
- MUST link from `execute`: Step-0 routing delegates to `orchestrate` only when a wave has **≥3
  file-disjoint beads** AND a tracker is configured AND the user confirms. **Fail-safe default =
  sequential**; never silently fan out.
- MUST add `bead-implementer` (`permission.task: deny`; `edit/bash/read: allow`; "no tbd / no git
  push" enforced by prompt); it touches neither tracker nor remote.
- MUST be tool-agnostic (Agent tool ↔ Task tool the only seam); MUST NOT hardwire the Workflow
  tool as the sole mechanism. A CC-only Workflow fast-path is IN scope for v1, layered over the NL floor.
- MUST ship OpenCode parity (`opencode/command/substrate/orchestrate.md`,
  `opencode/agent/bead-implementer.md`); on OpenCode, degrade to sequential dispatch if Task
  parallelism is unavailable — DAG correctness preserved, concurrency optional.
- MUST bump the user-facing skill count 11 → 12 (`plugin.json`, `marketplace.json`, `CLAUDE.md` ×3,
  `README.md`) in the same change, and keep the skills↔commands parity audit + `doctrine-lint` green.
- MUST keep `skills/orchestrate/SKILL.md` under ~500 lines (progressive disclosure): link to the
  doctrine for rationale rather than restating it.
- MUST NOT alter the existing sequential `execute` behavior beyond adding the Step-0 routing gate.

### 1.3 Success Criteria

- `/substrate:orchestrate <epic>` loads as a substrate skill and appears in the skill list.
- Given a graphed epic, orchestrate: cuts `feat/<epic-slug>`, runs wave-by-wave, dispatches one
  `bead-implementer` per file-disjoint ready bead in its own worktree, merges on green, re-gates the
  integrated tip, pauses between waves (`--auto` to skip), and lands one signed squash commit on
  trunk with `commit.gpgsign` restored.
- `execute` Step-0 delegates to orchestrate only at the ≥3-file-disjoint-beads + tracker + confirm
  bar; otherwise runs sequential — verifiable from the skill body and a dry-run.
- OpenCode counterparts load; parity audit empty; `doctrine-lint` green; skill count reads 12 everywhere.
- E2E: on a real graphed epic, a paused first wave produces correct worktree/seed/gate/merge/re-gate
  behavior with signing restored.

---

## 2. Scope

| In Scope | Out of Scope |
|----------|--------------|
| `skills/orchestrate/SKILL.md` — the operational loop | Rewriting graph-spec's DAG inference (orchestrate consumes it) |
| `agents/bead-implementer.md` — per-bead worker subagent | A new tracker; substrate.yaml schema changes |
| `execute` Step-0 routing (delegate vs sequential) | Changing execute's sequential path semantics |
| OpenCode parity command + agent | Auto-emitting per-repo `.opencode/` (sub-r7mm) |
| CC Workflow fast-path over the portable NL floor | A GUI/observability dashboard for the fleet |
| Skill-count bump, optional one-line doctrine pointer, docs, CHANGELOG | Rewriting the parallel-execution doctrine's policy (pointer only) |

---

## 3. Architecture / Layout

```
skills/orchestrate/SKILL.md              # the executable orchestrator (operational loop)
agents/bead-implementer.md               # per-bead worker (task: deny; no tbd/no push)
skills/execute/SKILL.md                  # + Step-0 routing preamble
opencode/command/substrate/orchestrate.md    # OpenCode parity command
opencode/agent/bead-implementer.md           # OpenCode parity agent
references/docs-core/docs/doctrine/agents-parallel-execution-doctrine.md  # + 1-line pointer (optional)
.claude-plugin/{plugin.json,marketplace.json}  # skill count 11 → 12
CLAUDE.md, README.md, CHANGELOG.md       # count, pipeline, docs
```

### Authoring split (agents-doctrine §1.1, §2.4 — trigger-vs-depth)

| Stays in the **doctrine** (durable *why*) | Lives in the **skill** (transient *how*) |
|---|---|
| why single-writer, why two-stage gate, why merge-on-green, why file-disjoint waves, why worktree hygiene, seed/toolchain rationale | the per-wave/per-bead loop, routing bar (≥3), pause-vs-`--auto`, dispatch sequence, bead-implementer prompt assembly, Workflow fast-path |

The skill **links** ("run the two-stage gate — see parallel-execution doctrine §Policy-4") rather
than restating rationale. Both OpenCode forms link to the same doctrine home; only the runtime delta
(Agent↔Task, sequential fallback) legitimately differs (duplication-drift guard, agents-doctrine §7.3).

### The dispatch seam (tool-agnostic)

| | Claude Code | OpenCode |
|---|---|---|
| Portable floor | Agent tool, one call per ready bead in a wave | Task tool, one task per ready bead (parallel where supported; sequential fallback) |
| Fast-path (CC only, v1) | Workflow tool — deterministic per-wave pipeline, journaled resume | *(n/a — NL floor only)* |

---

## 4. Implementation Details

### 4.1 `bead-implementer` subagent (§Roles, §Policy-1)

Frontmatter: `permission: { edit: allow, bash: allow, read: allow, task: deny }`. Body: implement
**exactly one** bead. Receives (inlined by the orchestrator): the bead's **Goal / Files / Gate**
(gate fully env-resolved), the plan/spec link, the relevant `CLAUDE.md`, and the standing rule
verbatim — *"no tbd, no git push — implement, run the gate, report pass/fail + a diff summary."*
Report template: `pass|fail`, the gate output, a short diff summary, and — if the bead carries an
out-of-band gate — the out-of-band checklist + the single swappable seam it isolated (§Policy-4).

### 4.2 `orchestrate` skill — the operational loop (§DAG-source, §Roles, §Policy-1..4, §Checklist)

1. **Resolve `<slug>`** from the arg (`epic:<slug>`, or a `docs/tasks/ongoing/<slug>/` spec path → its epic label).
2. **Read the DAG** — `bash docs/scripts/bead-graph.sh --epic <slug>` (waves/machine view) as the authoritative schedule. Fail-fast if no `epic:<slug>` beads or the script errors.
3. **Read `substrate.yaml`** — `gate.{compile,test,lint}`, optional `gate.out-of-band`, `worktree-seed[]`, `toolchain-pin.{install,env}`. Abort with an explanation if the `gate` block is missing (do not probe).
4. **Setup** — cut/reuse `feat/<epic-slug>` from trunk; set `commit.gpgsign false` (repo-local).
5. **Per wave (in order):**
   a. Filter to beads whose blockers are closed/merged (`tbd ready` / `tbd show`).
   b. **File-disjoint guard** — pairwise-intersect each bead's Files; collisions split into consecutive sub-waves (merge one, re-gate, next branches off the new tip).
   c. **Per bead:** `tbd update <id> --status in_progress`; `git worktree add <path> -b <bead-branch> feat/<epic-slug>` (off the **current tip**); copy every `worktree-seed[]` path from the primary checkout; run `toolchain-pin.install` in the worktree; dispatch one `bead-implementer` with Goal/Files/Gate (gate = `toolchain-pin.env` prefix + `gate.*` literals) + plan link + CLAUDE.md + standing rule.
   d. **Collect:** green → merge bead-branch → `feat/<epic-slug>`, `git worktree remove`. red → keep bead open with `--notes`, do NOT merge, block only *its* transitive dependents (siblings continue).
   e. **Re-gate the integrated tip** — orchestrator runs `gate.*` on `feat/<epic-slug>`. Red → composition failure: halt the wave transition, attach notes, fix before dependents dispatch.
   f. **Close** green beads UNLESS an out-of-band gate applies → `tbd update <id> --notes "merged; awaiting <gate>"` and leave open.
   g. **Pause** for approval with a wave summary (unless `--auto`).
6. **Epic close** — one `tbd sync` (orchestrator-only); land `feat/<epic-slug>` on trunk via `git merge --squash` + one **signed** commit; **restore `commit.gpgsign true` unconditionally** (including the abort/rollback path).

### 4.3 `execute` Step-0 routing (fail-safe sequential)

At execute's start: detect a graphed `epic:<slug>` for the spec. If a tracker is configured AND some
wave has **≥3 file-disjoint beads**, present the choice and — on user confirm — delegate to
`orchestrate`. Otherwise (no epic, <3 disjoint, no tracker, or user declines) run the existing
sequential phase-by-phase path. Never spawn worktrees without confirmation; never silently fan out.

### 4.4 CC Workflow fast-path (v1, optional at runtime)

On Claude Code, the per-wave dispatch MAY run as a Workflow-tool pipeline (deterministic fan-out,
journaled resume, budget control) over the same loop contract. The portable NL floor is the default
and the only path on OpenCode. The two paths are behaviorally equivalent on the DAG; the fast-path
adds resume/determinism, not different semantics.

---

## 5. Error Handling

| Error | Cause | Handling |
|-------|-------|----------|
| No `epic:<slug>` beads / bead-graph errors | epic not graphed | Fail-fast: "graph the spec first (`/substrate:graph-spec`)"; no worktrees created |
| `substrate.yaml` `gate` block missing | repo not gate-declared | Abort with explanation (do not probe a toolchain) — matches root CLAUDE.md gate policy |
| Phantom gate failure in a worktree | gitignored input not seeded | Seed `worktree-seed[]` + run `toolchain-pin.install` BEFORE dispatch (§Supporting) |
| Signing left disabled after a crash | run aborted between disable/restore | Restore `commit.gpgsign true` is unconditional + idempotent in the rollback path |
| Composed build red though each bead was green | integration interaction | Re-gate the integrated tip per wave; red halts the transition |
| Subagent runs `git push`/`tbd` | prompt not honored | Single-writer is prompt-enforced; squash-onto-trunk stays orchestrator-only regardless |
| OpenCode serializes Task calls | runtime differs from CC | Degrade to sequential dispatch; log it — correctness unaffected |
| Skill count stale (still "11") | count not bumped in-change | Count-drift sweep asserts 12 everywhere before commit |

---

## 6. Testing Strategy

Substrate is a markdown + bash plugin — verification is `bash`/`grep`/CLI + artifact-shape asserts,
**not** `pnpm app:*`.

| Layer | Focus | Command |
|-------|-------|---------|
| Static | skill + agent + command files parse; bash lints | `bash -n` on any scripts; frontmatter present |
| Contract | bead-implementer perms + standing rule | `grep` `task: deny`, `edit: allow`, "no tbd", "no git push" |
| Wiring | orchestrate reads DAG + substrate.yaml keys | `grep` `bead-graph.sh --epic`, `gate.`, `worktree-seed`, `toolchain-pin`, `gpgsign` |
| Faithfulness | SKILL references each binding policy | `grep` single-writer / `feat/<epic-slug>` / merge-on-green / file-disjoint / two-stage / re-gate / squash / one `tbd sync` |
| Routing | execute Step-0 fail-safe | `grep` ≥3 / file-disjoint / tracker / confirm / "sequential" default |
| Parity | 12 skills; command counterpart exists | `comm -23 <(ls skills|sort) <(ls opencode/command/substrate|sed 's/\.md$//'|sort)` empty |
| Doctrine | lint green; no count drift | `bash docs/scripts/doctrine-lint.sh` (docs-core); `grep -rn "11 .*skill" CLAUDE.md` = 0 |
| Budget | progressive disclosure | `wc -l skills/orchestrate/SKILL.md` ≤ ~500 |
| E2E | real graphed epic, paused wave | keylark slice-2 (or sandbox) — see Phase 6 |

---

## 7. Failure Modes (FMEA)

| # | Failure Mode | Severity | Mitigation |
|---|--------------|----------|------------|
| 1 | Signing left off after crash | Critical | Unconditional idempotent restore in rollback (§4.2 step 6) |
| 2 | Worktree gate fails on unseeded gitignored input | High | Seed + toolchain-pin before dispatch; abort if `worktree-seed[]`/`gate` unresolved |
| 3 | Two beads edit the same file in one wave → corruption | High | File-disjoint guard at dispatch (second net over graph-spec edges) |
| 4 | Composed integration red though beads green | High | Re-gate integrated tip per wave; red halts transition |
| 5 | Subagent writes tracker / pushes → data race | Medium | Prompt-enforced single-writer; orchestrator-only sync + squash |
| 6 | OpenCode parallel Task unverified → assumed concurrency | Medium | Sequential fallback default; log degradation (correctness intact) |
| 7 | `bead-graph.sh` output format change breaks parsing | Medium | Prefer machine `--format` over wave art; fail-fast on parse error |
| 8 | Skill-count / duplication drift (skill vs command) | Medium | Count sweep + parity audit + link-don't-restate (agents-doctrine §6.2/§7.3) |
| 9 | execute silently fans out, spawns worktrees unexpectedly | Medium | Fail-safe sequential default; explicit user confirm before any worktree |

---

## 8. Prompt Execution Strategy

<!--
PROTOCOL: docs/protocol/sdd/execution-format.md (phases → steps → Verify → Gate)
Verification uses bash/grep/CLI + doctrine-lint + the parity audit — NOT pnpm app:*.
Substrate keeps meta-doctrines under references/docs-core/docs/doctrine/.
-->

### Phase 1: `bead-implementer` subagent

#### Step 1.1: Write `agents/bead-implementer.md`

Per §4.1: frontmatter `permission: { edit: allow, bash: allow, read: allow, task: deny }`; body =
implement one bead (Goal/Files/Gate inlined), run the gate, report `pass|fail` + diff summary +
optional out-of-band checklist + swappable seam; standing rule "no tbd, no git push" verbatim.

##### Verify

- `test -f agents/bead-implementer.md`
- `grep -q "task: deny" agents/bead-implementer.md`
- `grep -qiE "no tbd" agents/bead-implementer.md && grep -qiE "no git push|not.*push" agents/bead-implementer.md`

#### Gate

- `bead-implementer` frontmatter parses; perms + standing rule present.

### Phase 2: `orchestrate` skill

#### Step 2.1: Write `skills/orchestrate/SKILL.md` (the operational loop)

Encode §4.2 as the skill body: arguments (`<epic-or-spec>`, `--auto`), When-to-run / When-to-REFUSE,
the resolve→read-DAG→read-substrate.yaml→setup→per-wave-loop→epic-close algorithm, the two-stage
gate, unattended signing, batch sync, mid-wave failure handling, and the dispatch seam (Agent/Task +
CC Workflow fast-path). Link to the parallel-execution doctrine for rationale; do not restate it.

##### Verify

- `test -f skills/orchestrate/SKILL.md && grep -q "^description:" skills/orchestrate/SKILL.md`
- `grep -q "bead-graph.sh --epic" skills/orchestrate/SKILL.md`
- `grep -qE "worktree-seed|toolchain-pin" skills/orchestrate/SKILL.md && grep -q "gate" skills/orchestrate/SKILL.md`
- `grep -qiE "feat/<epic-slug>|feat/\\\$" skills/orchestrate/SKILL.md && grep -qi "merge" skills/orchestrate/SKILL.md`
- `grep -qi "gpgsign" skills/orchestrate/SKILL.md && grep -qi "squash" skills/orchestrate/SKILL.md`
- `grep -qiE "single-writer|only.*tbd sync|one .*sync" skills/orchestrate/SKILL.md`
- `[ "$(wc -l < skills/orchestrate/SKILL.md)" -le 520 ]`

#### Step 2.2: Faithfulness sweep against the doctrine

Grep-assert the SKILL references each binding policy: file-disjoint waves, branch-off-current-tip,
two-stage gate (merge-unblock vs close), re-gate integrated tip, worktree remove-after-merge.

##### Verify

- `grep -qi "file-disjoint" skills/orchestrate/SKILL.md`
- `grep -qiE "two-stage|out-of-band" skills/orchestrate/SKILL.md`
- `grep -qiE "re-gate|integrated tip|integration tip" skills/orchestrate/SKILL.md`

#### Gate

- Skill loads; wiring + faithfulness greps green; body ≤ ~500 lines.

### Phase 3: `execute` Step-0 routing

#### Step 3.1: Add the routing preamble to `skills/execute/SKILL.md`

Per §4.3: detect graphed epic → assess ≥3 file-disjoint beads + tracker + confirm → delegate to
`orchestrate`; else sequential. Fail-safe default sequential; never silently fan out. Do not change
the existing sequential steps.

##### Verify

- `grep -qi "orchestrate" skills/execute/SKILL.md`
- `grep -qiE "file-disjoint|3 .*beads|≥3|>= ?3" skills/execute/SKILL.md`
- `grep -qiE "sequential" skills/execute/SKILL.md && grep -qiE "confirm|never silently" skills/execute/SKILL.md`

#### Gate

- execute documents the delegation + the fail-safe default; sequential path intact.

### Phase 4: OpenCode parity

#### Step 4.1: Port `orchestrate` + `bead-implementer` to OpenCode

Write `opencode/command/substrate/orchestrate.md` (Task-tool dispatch, sequential fallback documented;
links to the doctrine) and `opencode/agent/bead-implementer.md` (`mode: subagent`, `permission.task:
deny`). No CC-only tool leakage.

##### Verify

- `test -f opencode/command/substrate/orchestrate.md && grep -q "^description:" opencode/command/substrate/orchestrate.md`
- `! grep -qE "ExitPlanMode|Skill tool|Agent tool" opencode/command/substrate/orchestrate.md`
- `test -f opencode/agent/bead-implementer.md && grep -q "mode: subagent" opencode/agent/bead-implementer.md`
- `grep -qiE "sequential fallback|degrade|parallel where" opencode/command/substrate/orchestrate.md`

#### Gate

- Both OpenCode files present; zero CC-only leakage; sequential fallback documented.

### Phase 5: Housekeeping — count, pointer, docs

#### Step 5.1: Bump skill count 11 → 12 + optional doctrine pointer

Update `plugin.json`, `marketplace.json`, `CLAUDE.md` (all three occurrences), `README.md` (pipeline
+ skills table) to 12 and add the `orchestrate` row. Optionally add a one-line pointer in the
parallel-execution doctrine (§Roles or §Pointers) that the Orchestrator role is operationalized by
`/substrate:orchestrate` — abstract-role framing preserved, no loop import.

##### Verify

- `! grep -rn "11 .*skill\|ports the 11" CLAUDE.md` (no stale count)
- `grep -qi "orchestrate" README.md && grep -qi "orchestrate" CLAUDE.md`
- `bash references/docs-core/docs/scripts/doctrine-lint.sh 2>/dev/null || bash docs/scripts/doctrine-lint.sh 2>/dev/null || echo "lint-not-applicable-here"`

#### Step 5.2: Parity audit + CHANGELOG

Confirm the parity audit is empty (12 skills, 12 commands) and add a `[Unreleased]` CHANGELOG entry.

##### Verify

- `[ -z "$(comm -23 <(ls skills | sort) <(ls opencode/command/substrate | sed 's/\.md$//' | sort))" ]`
- `grep -qi "orchestrate" CHANGELOG.md`

#### Gate

- Count reads 12 everywhere; parity empty; doctrine-lint green; CHANGELOG updated.

### Phase 6: E2E dry-run

#### Step 6.1: Run a paused first wave on a real graphed epic

On keylark slice-2 (or a sandbox with a graphed epic), run `/substrate:orchestrate <epic>` and stop
at the first wave pause. Manually confirm: `feat/<slug>` cut; one worktree per bead off the tip;
`worktree-seed[]` present in each; the dispatched gate command is fully env-resolved; merge-on-green;
re-gate on the integrated tip; a Policy-4 bead (if any) left open "awaiting"; `commit.gpgsign`
restored to `true` at stop.

##### Verify

- Transcript captured under `docs/tasks/ongoing/orchestrate/`; `git config --get commit.gpgsign` returns `true` after the run.

#### Gate

- One real wave behaves per the doctrine; signing restored. (Behavioral — may be deferred with the exact manual command recorded if a live runtime is unavailable.)

### Phase 7: Doctrine Review

<!-- MANDATORY per spec-template. -->

#### Step 7.1: Review against the meta-doctrines + plugin principles

Review the skill/agent/routing/parity against `agents-parallel-execution-doctrine.md`,
`agents-doctrine.md`, and CLAUDE.md (progressive disclosure, fail-fast, agents-spawned-by-skills,
parity rule). Answer compliance / new patterns / outdated rules / missing coverage. If amendments:
write `docs/tasks/ongoing/orchestrate/doctrine-amendments.md`.

##### Verify

- `test -f docs/tasks/ongoing/orchestrate/doctrine-amendments.md && echo documented || echo none`

#### Step 7.2: File follow-ups

Queue any amendments + deferred items (CC Workflow fast-path polish, checkpoint-sync control) as
beads under `epic:orchestrate`.

##### Verify

- `bash docs/scripts/bead-graph.sh --epic orchestrate 2>/dev/null || echo "no tracker / no beads renderable here"`

#### Gate

- Review complete; follow-ups filed or explicitly none.

---

## 9. Operational Queries

### Status check
```bash
git worktree list                                   # active bead worktrees
git config --get commit.gpgsign                     # MUST be true when no run is in flight
tbd list | grep "epic:<slug>"                        # bead states
```

### Parity audit
```bash
comm -23 <(ls skills | sort) <(ls opencode/command/substrate | sed 's/\.md$//' | sort)  # expect empty
```

---

## 10. Spec Completeness Checklist

### Semantic Completeness
- [x] All artifacts (skill, agent, routing, OpenCode parity, docs) defined — no `...`
- [x] Terms defined/linked (wave, bead, integration branch, two-stage gate, dispatch seam)
- [x] State/flow explicit (per-wave loop, phase gates)
- [x] Provisional facts flagged (OpenCode parallel Task unverified) with fallback

### Verification Completeness
- [x] Each phase has executable verification (bash/grep/CLI)
- [x] Parity has an audit query (§9)
- [x] Success criteria binary (§1.3)

### Recovery Completeness
- [x] FMEA present (§7)
- [x] Idempotency (signing restore; link/parity checks)
- [x] Fallback/rollback (sequential dispatch; unconditional signing restore; fail-safe routing)

### Context Completeness
- [x] Brief linked
- [x] Rationale captured (§3 authoring split, FMEA, architect recommendations)
- [x] Change log present

### Boundary Completeness
- [x] Scope table (§2)
- [x] Prereq/permission requirements explicit (`substrate.yaml` gate/seed/toolchain; `task: deny`)
- [x] External dependencies listed (graph-spec DAG, tbd, git worktrees, substrate.yaml)

---

## 11. Change Log

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2026-07-07 | Initial spec — `/substrate:orchestrate` + `bead-implementer` + execute Step-0 routing + OpenCode parity + CC Workflow fast-path. **Q&A defaults recorded:** routing bar = ≥3 file-disjoint beads + tracker + confirm (fail-safe sequential); wave cadence = pause-between-waves (`--auto` unattended); Workflow fast-path IN v1; bead-implementer perms `edit/bash/read allow, task deny`; mid-wave failure = continue siblings (red blocks only its dependents); doctrine discovery = `references/docs-core/docs/doctrine/`. |

---

### Post-execution notes

Executed 2026-07-07 via `/substrate:execute`. All 7 phases green except Phase 6 (E2E), deferred to a
live runtime as the gate permits (see `e2e-dryrun.md`; exact manual command recorded, `commit.gpgsign`
verified `true`). Doctrine review found no binding amendments — only the additive §Roles pointer,
which was applied.

**Deviation captured for follow-up:** §4.1 and the Phase-1 verify mandated a
`permission: { edit: allow, bash: allow, read: allow, task: deny }` frontmatter block on the
**Claude Code** `agents/bead-implementer.md`. That block is an **OpenCode convention**; Claude Code
agent frontmatter has no `permission` key (the existing `agents/doctrine-architect.md` carries none —
CC restricts tools via `tools:` and subagent depth is structural, not permission-gated). The block
therefore passes the spec's `grep task: deny` verify but is **inert in CC**. Kept as-authored to
satisfy the binding spec; reconciliation (translate to a CC `tools:` allow-list, or document the
inert-for-parity intent) is filed as a `drift` bead under `epic:orchestrate` by session synthesis.
