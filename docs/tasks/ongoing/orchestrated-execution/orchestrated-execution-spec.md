# Orchestrated Execution: Technical Specification

**Version**: 1.0.0
**Status**: Draft
**Author**: Architect (session-composed)
**Date**: 2026-07-08
**Brief**: `docs/tasks/ongoing/orchestrated-execution/orchestrated-execution-brief.md`

---

## 1. Overview

### 1.1 Objective

Evolve substrate's execution model from two hard-coded extremes (monolithic `execute`, one-agent-per-bead `orchestrate`) into a single **context-budget partition**: the bead DAG is cut into K "windows" of file-adjacent beads, one sub-agent per window, sized so no window rots or auto-compacts. Make **orchestration the primary execution door**; demote `execute` to the explicit **attended** single-window mode.

### 1.2 Constraints

- MUST keep the orchestrator a pure coordinator — dispatches K windows, never implements code.
- MUST preserve every binding invariant of `agents-parallel-execution-doctrine.md` (single-writer tracker, file-disjoint parallel waves, merge-on-green, gate-before-close, one squash commit on trunk, branch-off-current-tip spine).
- MUST reuse `substrate.yaml` (policy) + `.substrate/` (engine state); no new top-level store; no ephemeral/`spool`-style delete-on-read for run-state.
- MUST keep the partition a deviatable prior (graph-spec suggests, orchestrator may re-batch, deviations logged).
- MUST hold OpenCode parity for every changed skill/agent.
- MUST NOT introduce a compile/test gate that doesn't exist — this is a plugin repo of markdown contracts + bash; verification is **structural** (see §6, §12.0).

### 1.3 Success Criteria (binary)

- SC1: `agents-parallel-execution-doctrine.md` contains a "Grouping & windows" section defining the group-runner role; all prior invariants remain and are cross-referenced.
- SC2: `substrate.yaml` schema carries an `execution:` block; the adopt/init `.gitignore` ignores `.substrate/runs/`; a documented `.substrate/execution-state.json` schema exists.
- SC3: `graph-spec` computes the partition and writes `group:<window-N>` on every bead; `bead-graph.sh` renders windows.
- SC4: `bead-implementer` runs N beads per window, gating each in sequence, reporting a per-bead pass/fail ledger; retains `permission.task: deny` + no-tbd/no-push.
- SC5: `orchestrate` dispatches one group-runner per window (one worktree/seed per group), reads the partition, logs deviations to `.substrate/runs/`, writes `.substrate/execution-state.json` before the trunk squash.
- SC6: `orchestrate` is the primary door in `README`/`CLAUDE.md`/SDD pipeline; `architect-spec` hands off to it by default; `execute` is documented as the attended mode.
- SC7: OpenCode parity audit is empty and every changed command/agent is re-translated.

---

## 2. Scope

| In Scope | Out of Scope |
|----------|--------------|
| Context-budget partition of the DAG into `group:` windows | Changing the DAG decomposition algorithm itself (Kahn/edges) |
| Group-runner (N beads / one worktree) | Nested subagents (depth-2 remains forbidden) |
| `orchestrate` as primary door; `execute` → attended mode | Removing `execute` entirely (it survives as attended) |
| Durable run-state in `.substrate/`; policy in `substrate.yaml` | A live TUI rewrite (bead-tui gains a window lane later, not here) |
| Heuristic + tunable defaults | Empirical calibration of cost weights (follow-up) |
| OpenCode parity for changed surfaces | New OpenCode capabilities |

---

## 3. Architecture

### 3.1 The partition (the spine)

One operation underlies both old skills: **partition the DAG into agent-sized windows.** A *window* is a set of beads sharing a `group:<window-N>` label, chosen so its accumulated context cost stays under the budget. `execute`(attended) = K collapses to 1 with a human in the loop; `orchestrate` = K windows, agent-coordinated.

**Grouping signal = file-adjacency.** Co-edited beads (they touch overlapping `Files`) belong in the *same* window — one warm worktree keeps their shared files in context across all of them. File-disjoint chains go in *separate* windows — isolation, and parallel where edges allow. This is the same disjointness signal orchestrate already uses to parallelize, now also used to *group*.

### 3.2 Roles (unchanged invariants + one redefinition)

- **Orchestrator** (depth-0 skill loop): sole writer to `tbd`/remote; reads the partition; dispatches K group-runners; merges-on-green; re-gates the integrated tip; writes run-state. **Never implements.**
- **Group-runner** (depth-1, was `bead-implementer`): implements the N beads of one window in one worktree, **gating each in sequence**; reports per-bead pass/fail. Touches neither `tbd` nor remote (`permission.task: deny`). *Redefinition of the old one-bead subagent.*

### 3.3 Within-group vs across-group (resolves the tip re-sync ambiguity)

- **Within a group:** the runner works sequentially in **one worktree** off the current integration tip. Beads in a group co-edit the same files by construction, so bead 1 → gate → bead 2 (sees bead 1's edits) → gate → … No mid-group integration re-fetch; the shared worktree *is* the shared context.
- **Across groups:** the orchestrator merges a window's branch on green, advances the integration tip, and only then dispatches windows whose blockers are now merged. Tip re-sync happens at **window boundaries**, preserving the branch-off-current-tip spine.
- **Failure semantics:** a bead failing mid-window blocks the *rest of that window* (left open) but not windows outside it. The orchestrator reads the per-bead ledger to decide.

### 3.4 State & policy homes

| Artifact | Home | Lifecycle |
|---|---|---|
| Partition/heuristic policy (`context-budget`, `default-rung`) | `substrate.yaml` → `execution:` block | committed config |
| Chosen partition + per-bead outcome ledger + run-log pointers | `.substrate/execution-state.json` | committed state (mirrors `synthesis-state.json`) |
| Per-window heavy debug trace + deviation log | `.substrate/runs/<epic>/<run-id>/` | gitignored, TTL-swept |
| Per-bead partition membership | `group:<window-N>` label in `tbd` (frontmatter under tracker=none) | with the DAG |
| Spec back-link for a cold runner | `spec: <path>#<section>` per bead | with the bead |

### 3.5 Terminology (naming fork → option (b))

Orchestration is the **primary execution strategy and door**. Strategy vocabulary:
- **orchestrated** (default) — K partitioned windows, agent-coordinated, unattended.
- **attended** — single window, one implementing agent, human co-pilots with phase-gate pauses. This is `/substrate:execute`.

---

## 4. Implementation Details

### 4.1 Doctrine (`references/docs-core/docs/doctrine/agents-parallel-execution-doctrine.md`)

New subsection **"Grouping & windows — context-budget partitioning"** slotted between *Roles* and *Policies*. Redefine the subagent role → group-runner. Specify §3.3 (within/across group). Add the `group:<window-N>` label to the vocabulary. Restate that single-writer, file-disjoint waves, merge-on-green, gate-before-close are **unchanged**. Mirror the role rename in `agents-doctrine.md`'s role table.

### 4.2 State contracts

- **`substrate.yaml` `execution:` block** (emitted by `skills/adopt/SKILL.md`; documented in the doctrine):
  ```yaml
  execution:
    context-budget: 0.4      # max fraction of a window a group may fill before graph-spec splits it
    default-rung: auto       # auto | monolith | phase | group | per-bead
  ```
- **`.substrate/execution-state.json`** (documented schema; written by orchestrate):
  ```json
  {
    "<epic>": {
      "run-id": "<epic>-<YYYYMMDD-HHMM>",
      "partition": { "window-1": ["<bead-id>", "..."], "window-2": ["..."] },
      "deviations": [{ "from": "graph-spec", "reason": "<why re-batched>", "windows": {} }],
      "outcomes": { "<bead-id>": { "status": "pass|fail|open", "commit": "<sha|null>" } },
      "run-log": ".substrate/runs/<epic>/<run-id>/"
    }
  }
  ```
- **`.gitignore`**: add `.substrate/runs/` to the adopt/init emission + `references/templates/.gitignore` + this repo's own `.gitignore`. `.substrate/execution-state.json` stays tracked.

### 4.3 graph-spec (`skills/graph-spec/SKILL.md`)

Insert a partition substep **after the Kahn cycle-check (Step 4), before persistence (Step 5)**:
1. Walk beads in topological order; estimate per-bead cost = Σ(bytes of `Files`) + heavy-ref surcharge (schema/contract/migration reads) + gate-log weight + effort(XS..L).
2. Accumulate; open a new `window-N` when cumulative cost crosses `context-budget`; **snap boundaries to file-adjacency** (never split a co-edited chain).
3. Flag any single bead whose cost alone exceeds budget as **under-decomposed** → warn + recommend splitting the bead (do not silently over-fill).
In **Step 5 persistence**, add the label: `tbd create ... -l "epic:<slug>" -l "group:<window-N>"` (Branch A) / `group: <window-N>` frontmatter (Branch B). Also stamp `spec: <spec-path>#<section>` per bead. Extend **Step 6** to render windows (`bead-graph.sh` gains a window overlay / `--group-windows`).

### 4.4 bead-graph.sh (`references/docs-core/docs/scripts/bead-graph.sh`)

Add window rendering: group beads by their `group:` label within the wave view (and a boxed overlay in mermaid). Backward compatible — absent labels render as today.

### 4.5 bead-implementer → group-runner (`agents/bead-implementer.md`)

- Generalize "exactly one bead" → "exactly one **group** of N beads."
- Input: N sequenced tuples `{Goal_i, Files_i, Gate_i, spec-ref_i}`.
- Workflow: for i=1..N — implement bead i → run Gate i → on pass proceed; on fail, **stop**, mark bead i failed, leave beads i+1..N unstarted.
- Report: N blocks (one per bead) + a per-bead pass/fail ledger the orchestrator parses. Retain `permission.task: deny`, no-`tbd`, no-`git push`.

### 4.6 orchestrate → primary door (`skills/orchestrate/SKILL.md`)

- **Step 2 (read DAG):** also parse `group:` labels; the orchestrator MAY re-batch (deviation) — log the reason + resulting windows to `.substrate/runs/<epic>/<run-id>/deviation-log`.
- **Step 5a/5c (dispatch):** dispatch unit changes bead → **group**; one `git worktree` + one seed + one `toolchain-pin.install` **per window**; dispatch one group-runner per ready window; pass the N tuples.
- **Step 5e/5f (gate/merge):** unchanged mechanics, applied at window granularity; merge-on-green advances the tip; per-bead outcomes come from the runner's ledger.
- **Step 6 (finalize):** write `.substrate/execution-state.json` (partition + outcomes + run-log pointer) and commit it alongside the trunk squash.
- **Description/when-to-use:** broaden to "the primary execution door."

### 4.7 execute → attended mode (`skills/execute/SKILL.md`)

- Rescope: `execute` is the **attended single-window** strategy — one implementing agent, phase-gate pauses, human co-pilots. Keep the Step-0 routing mechanics but flip the framing: orchestrated is the default; `execute` is chosen when the operator wants to watch/adapt one window, or the spec fits one window and they prefer HIL.
- Update the description + when-to-use accordingly.

### 4.8 Cross-skill hand-offs + docs

- `skills/architect-spec/SKILL.md` **Step 10 hand-off** → default to `/substrate:orchestrate` (mention `execute` as the attended alternative).
- `skills/synthesize-session/SKILL.md` lifecycle references to `execute` → reflect orchestrate-primary.
- `README.md` skill table + lifecycle diagram; `CLAUDE.md` skill descriptions + pipeline: lead with `orchestrate`; document `execute` as attended.
- Canonicalize the strategy vocabulary (orchestrated / attended) once in the doctrine and reference it.

### 4.9 OpenCode parity

Re-translate into `opencode/`: `graph-spec`, `orchestrate` (primary), `execute` (attended), `bead-implementer` (group-runner), plus the `architect-spec`/`synthesize-session` hand-off edits. Update `opencode/CONVENTIONS.md` only if a new empirically-verified fact is introduced.

---

## 5. Error Handling

| Error | Cause | Handling |
|-------|-------|----------|
| Under-decomposed bead (cost > budget) | A single bead too heavy for one window | graph-spec warns + recommends split; does not silently over-fill |
| Group has file-overlap across beads that should be parallel | Mis-grouping | file-adjacency snap guarantees co-edited beads share a window; disjoint chains split — no intra-group parallel edit |
| Mid-window bead failure | Gate red on bead i | runner stops, marks i failed, leaves i+1..N open; orchestrator blocks rest of window, siblings continue |
| Orchestrator re-batches away from suggestion | Runtime judgment | deviation logged to run-log with reason; execution-state records both planned + actual |
| Stale spool-style trust | — | N/A: run-state is durable + re-verified; no delete-on-read here |
| Parity drift | Skill changed, command not | Phase 8 gate: `comm` audit MUST be empty |

---

## 6. Testing Strategy (plugin-repo = structural)

This repo has **no compile/test suite** (per `CLAUDE.md`: skills are natural-language contracts). Verification is structural and binary:

| Layer | Focus | Command shape |
|-------|-------|---------------|
| Contract presence | The intended edit landed | `grep -q "<new anchor>" <file>` |
| Regression | Superseded text is gone | `! grep -q "<old anchor>" <file>` |
| Reference integrity | Cross-referenced paths exist | `test -e <path>` per reference |
| Parity | skills ↔ opencode commands | `comm -23 <(ls skills|sort) <(ls opencode/command/substrate|sed 's/\.md$//'|sort)` empty |
| Config validity | YAML/JSON parse | `python3 -c "import yaml; yaml.safe_load(...)"` / `jq . <file>` |
| Graph smoke | window rendering runs | `bash references/docs-core/docs/scripts/bead-graph.sh --epic orchestrated-execution` |

See §12.0 for the canonical gate definitions the Verify blocks reference.

---

## 7. Failure Modes (FMEA)

| # | Failure Mode | Severity | Mitigation |
|---|--------------|----------|------------|
| 1 | Doctrine amended but skills don't conform | High | Skills phases (3–6) each cross-ref the doctrine section; Phase 9 doctrine review |
| 2 | Group-runner corrupts shared toolchain for later beads in window | Medium | `toolchain-pin.install` idempotent; runner reports cross-bead toolchain mutation |
| 3 | `execute` rescope breaks existing hand-offs that name it | High | Phase 7 updates architect-spec + synthesize-session pointers atomically; grep gate for stale `execute` default |
| 4 | Parity forgotten on a changed skill | High | Phase 8 dedicated; `comm` audit gate |
| 5 | `.substrate/runs/` accidentally committed | Medium | Phase 2 adds `.gitignore` entry + Verify greps it |
| 6 | Partition over-fills a window (rot returns) | High | under-decomposition warning + `context-budget` ceiling in graph-spec |
| 7 | Deviation invisible ex-post | Medium | execution-state records planned+actual; deviation-log in run-dir |

---

## 8. Prompt Execution Strategy

<!-- PROTOCOL: docs/protocol/sdd/execution-format.md · gates are STRUCTURAL (see §6, §12.0) -->

### Phase 1: Doctrine & role contract

#### Step 1.1: Add "Grouping & windows" + group-runner role to the parallel-execution doctrine

Read §12.A (anchors) and §4.1. Edit `references/docs-core/docs/doctrine/agents-parallel-execution-doctrine.md`: insert a "Grouping & windows — context-budget partitioning" section between the Roles and Policies sections. Define window, `group:<window-N>` label, group-runner role, §3.3 within/across-group tip re-sync, and restate the preserved invariants (single-writer, file-disjoint waves, merge-on-green, gate-before-close). Update the role paragraph from "one subagent per bead" to the group-runner definition.

Tools to use: Read, Edit

##### Verify

- `grep -q "Grouping & windows" references/docs-core/docs/doctrine/agents-parallel-execution-doctrine.md`
- `grep -q "group-runner" references/docs-core/docs/doctrine/agents-parallel-execution-doctrine.md`
- `grep -qi "single-writer" references/docs-core/docs/doctrine/agents-parallel-execution-doctrine.md`

#### Step 1.2: Mirror the role rename in agents-doctrine.md

Update the role table/paragraph in `references/docs-core/docs/doctrine/agents-doctrine.md` to reference the group-runner (window) role consistently.

##### Verify

- `grep -qi "group-runner\|window" references/docs-core/docs/doctrine/agents-doctrine.md`

#### Gate

- `grep -q "Grouping & windows" references/docs-core/docs/doctrine/agents-parallel-execution-doctrine.md`

### Phase 2: State plumbing

#### Step 2.1: Add the `execution:` block to the substrate.yaml emission

Edit `skills/adopt/SKILL.md` where it emits `substrate.yaml` to include the `execution:` block (§4.2) as a sibling to `worktree-seed`/`toolchain-pin`. Document the block + the `.substrate/execution-state.json` schema in the doctrine section from Phase 1.

Tools to use: Read, Edit

##### Verify

- `grep -q "execution:" skills/adopt/SKILL.md`
- `grep -q "context-budget" skills/adopt/SKILL.md`

#### Step 2.2: Ignore `.substrate/runs/` in the emitted + template + repo gitignores

Add `.substrate/runs/` to the `.gitignore` that adopt/init emit, to `references/templates/.gitignore`, and to this repo's own `.gitignore`. Keep `.substrate/execution-state.json` tracked.

##### Verify

- `grep -q "\.substrate/runs" references/templates/.gitignore`
- `grep -q "\.substrate/runs" .gitignore`

#### Gate

- `grep -q "execution:" skills/adopt/SKILL.md && grep -q "\.substrate/runs" .gitignore`

### Phase 3: graph-spec — compute + emit the partition

#### Step 3.1: Insert the context-budget partition substep

Read §12.A. Edit `skills/graph-spec/SKILL.md`: after the Kahn cycle-check step, before persistence, add the partition substep (§4.3 items 1–3: cost estimate, window cut at `context-budget`, file-adjacency snap, under-decomposition warning).

Tools to use: Read, Edit

##### Verify

- `grep -qi "context-budget\|partition\|window" skills/graph-spec/SKILL.md`
- `grep -qi "under-decompos" skills/graph-spec/SKILL.md`

#### Step 3.2: Write `group:` + `spec:` on each bead during persistence

Edit the persistence step to add `-l "group:<window-N>"` (Branch A) and `group:`/`spec:` frontmatter (Branch B).

##### Verify

- `grep -q "group:" skills/graph-spec/SKILL.md`
- `grep -q "spec:" skills/graph-spec/SKILL.md`

#### Step 3.3: Render windows in bead-graph.sh

Edit `references/docs-core/docs/scripts/bead-graph.sh` to group by `group:` label (backward compatible when absent).

##### Verify

- `bash -n references/docs-core/docs/scripts/bead-graph.sh`
- `grep -qi "group" references/docs-core/docs/scripts/bead-graph.sh`

#### Gate

- `bash -n references/docs-core/docs/scripts/bead-graph.sh`
- `grep -q "group:" skills/graph-spec/SKILL.md`

### Phase 4: bead-implementer → group-runner

#### Step 4.1: Generalize to N-bead group with per-bead sequential gating

Read §12.A. Edit `agents/bead-implementer.md`: "exactly one bead" → "exactly one group of N beads"; input = N `{Goal,Files,Gate,spec-ref}` tuples; workflow implements bead i → gates i → stop-on-fail; retain `permission.task: deny` + no-tbd/no-push.

Tools to use: Read, Edit

##### Verify

- `grep -qi "group of N\|group-runner\|each bead in" agents/bead-implementer.md`
- `grep -q "permission" agents/bead-implementer.md && grep -qi "deny" agents/bead-implementer.md`

#### Step 4.2: Per-bead pass/fail ledger in the report

Edit the report format to emit one block per bead + a per-bead pass/fail ledger.

##### Verify

- `grep -qi "ledger\|per-bead\|pass/fail" agents/bead-implementer.md`

#### Gate

- `grep -qi "group" agents/bead-implementer.md && grep -qi "deny" agents/bead-implementer.md`

### Phase 5: orchestrate — consume partition + become primary door

#### Step 5.1: Read `group:` labels + log deviations

Read §12.A. Edit `skills/orchestrate/SKILL.md` Step 2 to parse `group:` labels and log any re-batching deviation to `.substrate/runs/<epic>/<run-id>/`.

Tools to use: Read, Edit

##### Verify

- `grep -q "group:" skills/orchestrate/SKILL.md`
- `grep -qi "deviation" skills/orchestrate/SKILL.md`

#### Step 5.2: Dispatch one group-runner per window (one worktree/seed per group)

Edit the dispatch steps: unit bead → group; one worktree + seed + `toolchain-pin.install` per window; pass N tuples to the group-runner.

##### Verify

- `grep -qi "per window\|per group\|group-runner" skills/orchestrate/SKILL.md`

#### Step 5.3: Write execution-state.json before the trunk squash + promote description

Edit the finalize step to write `.substrate/execution-state.json` (partition + outcomes + run-log pointer) and commit it with the squash. Broaden the skill description/when-to-use to "primary execution door."

##### Verify

- `grep -q "execution-state.json" skills/orchestrate/SKILL.md`
- `grep -qi "primary" skills/orchestrate/SKILL.md`

#### Gate

- `grep -q "execution-state.json" skills/orchestrate/SKILL.md && grep -q "group:" skills/orchestrate/SKILL.md`

### Phase 6: execute — rescope to attended mode

#### Step 6.1: Reframe execute as the attended single-window strategy

Read §12.A. Edit `skills/execute/SKILL.md`: rescope to attended (one implementing agent, phase-gate pauses, human co-pilots); orchestrated is the default; update description + when-to-use.

Tools to use: Read, Edit

##### Verify

- `grep -qi "attended" skills/execute/SKILL.md`
- `grep -qi "orchestrate" skills/execute/SKILL.md`

#### Gate

- `grep -qi "attended" skills/execute/SKILL.md`

### Phase 7: Cross-skill hand-offs + terminology/docs

#### Step 7.1: Repoint architect-spec + synthesize-session to orchestrate-primary

Edit `skills/architect-spec/SKILL.md` Step 10 hand-off to default to `/substrate:orchestrate` (execute = attended alternative). Update `skills/synthesize-session/SKILL.md` lifecycle references.

Tools to use: Read, Edit

##### Verify

- `grep -q "orchestrate" skills/architect-spec/SKILL.md`
- `grep -qi "attended\|orchestrate" skills/synthesize-session/SKILL.md`

#### Step 7.2: Lead docs with orchestrate; document execute as attended

Edit `README.md` (skill table + lifecycle diagram) and `CLAUDE.md` (skill descriptions + pipeline) so orchestrate is primary and execute is the attended mode. Canonicalize the strategy vocabulary.

##### Verify

- `grep -qi "attended" README.md`
- `grep -qi "attended" CLAUDE.md`

#### Gate

- `grep -q "orchestrate" skills/architect-spec/SKILL.md && grep -qi "attended" README.md`

### Phase 8: OpenCode parity

#### Step 8.1: Re-translate changed commands + agent

Re-translate into `opencode/`: `graph-spec`, `orchestrate`, `execute`, `bead-implementer`, and the architect-spec/synthesize-session hand-off edits. Follow `opencode/README.md` parity rule + `CONVENTIONS.md`.

Tools to use: Read, Edit, Write

##### Verify

- `grep -qi "group\|window" opencode/command/substrate/orchestrate.md`
- `grep -qi "attended" opencode/command/substrate/execute.md`

#### Gate

- `[ -z "$(comm -23 <(ls skills | sort) <(ls opencode/command/substrate | sed 's/\.md$//' | sort))" ]`

### Phase 9: Doctrine Review (MANDATORY)

#### Step 9.1: Review implementation against doctrines

Review all edits against `agents-parallel-execution-doctrine.md` + `agents-doctrine.md` + `CLAUDE.md` architectural principles. Confirm: orchestrator never implements; single-writer intact; file-disjoint waves intact; parity held; progressive-disclosure (SKILL bodies < ~500 lines) respected. Record any amendment at `docs/tasks/ongoing/orchestrated-execution/doctrine-amendments.md`.

##### Verify

- `test -f docs/tasks/ongoing/orchestrated-execution/doctrine-amendments.md && echo "Amendments documented" || echo "No amendments needed"`

#### Step 9.2: Queue amendments for human triage (if any)

If amendments exist, copy to `docs/tasks/ongoing/doctrine-updates/orchestrated-execution-amendments.md`.

##### Verify

- `ls docs/tasks/ongoing/doctrine-updates/ 2>/dev/null || echo "No doctrine updates pending"`

---

## 9. Operational Checks

```bash
# Parity (expected: empty)
comm -23 <(ls skills | sort) <(ls opencode/command/substrate | sed 's/\.md$//' | sort)

# No stale "execute is the default executor" framing (expected: no primary-default hits)
grep -rn "run.*substrate:execute" skills/architect-spec/SKILL.md

# Run-state is ignored, plan-state is tracked (expected: runs ignored)
git check-ignore .substrate/runs/x 2>/dev/null && echo "runs ignored OK"
```

---

## 10. Spec Completeness Checklist

### Semantic Completeness
- [x] Data structures defined (execution-state.json, execution: block, group label)
- [x] Terms defined (window, group-runner, attended/orchestrated)
- [x] State transitions exhaustive (within/across group; mid-window failure)
- [x] Nullability explicit (outcome.commit nullable)

### Verification Completeness
- [x] Each phase has executable (structural) verification
- [x] Invariants have audit commands (§9)
- [x] Success criteria binary (§1.3)

### Recovery Completeness
- [x] FMEA present (§7)
- [x] Idempotency (toolchain-pin idempotent; grep-based verifies are re-runnable)
- [x] Rollback (each phase is its own commit; git revert per phase)

### Context Completeness
- [x] Brief linked
- [x] Decision rationale captured (§3.5, Change Log)
- [x] Change log present

### Boundary Completeness
- [x] Scope table present
- [x] Permissions explicit (group-runner `permission.task: deny`)
- [x] External dependencies listed (tbd, git worktree, bead-graph.sh)

---

## 11. Change Log

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2026-07-08 | Initial spec. Naming fork: user initially chose default (a) [execute stays door], then **changed to (b): orchestrate becomes the primary door, execute demotes to attended mode]** — spec composed around (b). |

---

## 12. Appendix — session-captured artifacts (for a cold executor)

### 12.0 Repo state + gate definition (READ FIRST)

- **This is the substrate PLUGIN repo**, not a scaffolded project. No `pnpm app:*`; **no compile/test**. Gates are **structural** (grep/parity/bash -n/yaml-parse) — see §6.
- Branch at authoring: `main` @ `b37f96f`. Commit each phase atomically; end messages with `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>` (repo convention; trunk commits, no branch unless asked).
- Tracker: `tbd` on PATH, prefix `sub-`. Single-writer during graph/orchestrate.
- Progressive disclosure: keep SKILL bodies under ~500 lines; bulk content → `references/`.

### 12.A Exact edit anchors (from session analysis)

**Doctrine** `references/docs-core/docs/doctrine/agents-parallel-execution-doctrine.md`: Roles (~§22-32), Policies (~§34+), single-writer (~§36-40), integration/merge (~§42-47), file-disjoint waves (~§78-82). New "Grouping & windows" section goes **between Roles and Policies**.

**graph-spec** `skills/graph-spec/SKILL.md`: partition substep after **Step 4 (Kahn)**, before **Step 5 (persist)**. Step 5 = `tbd create ... -l "epic:<slug>"` (add `-l "group:<window-N>"`). Step 6 already calls `bead-graph.sh`.

**execute** `skills/execute/SKILL.md`: **Step 0** routing gate (currently: delegate to orchestrate iff epic graphed + a wave has ≥3 file-disjoint beads + tracker + user confirm). Flip framing to attended-vs-unattended; orchestrated default.

**orchestrate** `skills/orchestrate/SKILL.md`: Step 2 read-DAG (add `group:` parse + deviation log); Step 5a/5c dispatch (bead→group, one worktree/seed per group, line ~113 "one bead-implementer per bead" → per group); Step 6 (add execution-state.json write before squash at ~line 141).

**bead-implementer** `agents/bead-implementer.md`: line ~12 "exactly one bead" → group; Goal/Files/Gate (~34-40) → N tuples; run-the-Gate (~47) → per-bead loop; report (~50-70) → N blocks + ledger; keep `permission.task: deny` (~line 9).

**worktree-seed/toolchain-pin**: one worktree+seed+install **per window** (was per bead) → seeding cost O(K) not O(N); `toolchain-pin.install` must stay idempotent.

### 12.B This spec is its own first dogfood

Graph this spec (`/substrate:graph-spec`) and run it via the orchestration model it defines. The DAG is a mostly-serial spine (1→2→3→4→5→6→7→8→9) with 3↔4 and doc-work partially parallel — a real, non-trivial partition test. Expect graph-spec to group Phases into a handful of windows; watch whether the orchestrator re-batches and whether the deviation is logged.
