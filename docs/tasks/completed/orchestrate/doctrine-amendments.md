# Doctrine Review — Orchestrate

**Phase 7.1 of `orchestrate-spec.md`.** Reviews the delivered skill / agent / routing / parity
against `agents-parallel-execution-doctrine.md`, `agents-doctrine.md` (the doctrine-on-doctrines),
and the plugin principles in `CLAUDE.md`.

## Compliance

| Principle (source) | Verdict | Evidence |
|---|---|---|
| **Progressive disclosure** — SKILL body ≤ ~500 lines, links don't restate (CLAUDE.md) | ✅ | `skills/orchestrate/SKILL.md` = 156 lines; rationale lives in the doctrine, the skill links to it (§Policy-N references throughout). |
| **Fail-fast** (user preference; root CLAUDE.md gate policy) | ✅ | orchestrate aborts on missing `epic:<slug>` beads, `bead-graph.sh` parse error, or a missing `substrate.yaml` `gate` block — it never probes a toolchain. |
| **Agents spawned by skills, never by the user; one-level depth** (CLAUDE.md) | ✅ | `bead-implementer` is dispatched by the `orchestrate` skill; `permission.task: deny` makes it a leaf (mirrors `doctrine-architect`). Orchestration runs at skill/primary-agent level. |
| **Single-writer tracker + batch sync** (parallel-exec §Policy-1, §Policy-3) | ✅ | Only the orchestrator runs `tbd`/`git push`; `bead-implementer`'s standing rule forbids both; exactly one `tbd sync` at epic close. |
| **Integration branch + merge-on-green + branch-off-current-tip** (§Policy-2) | ✅ | `feat/<epic-slug>`; worktree per bead off the current tip; merge-on-green; dependents dispatch off the updated tip. |
| **Two-stage gate + re-gate the integrated tip** (§Policy-4, §Supporting) | ✅ | Headless-green → merge + unblock; out-of-band → leave open + noted; orchestrator re-gates `feat/<epic-slug>` each wave. |
| **File-disjoint waves, worktree hygiene, seed + toolchain-pin, unattended signing** (§Supporting) | ✅ | Pairwise-Files guard; `git worktree remove` post-merge; `worktree-seed[]` + `toolchain-pin.install` before dispatch; `gpgsign false` for the run + **unconditional** restore + signed squash on trunk. |
| **Parity rule** (CLAUDE.md, opencode/README.md) | ✅ | `opencode/command/substrate/orchestrate.md` + `opencode/agent/bead-implementer.md` shipped; parity audit empty (12/12); skill count 11→12 everywhere; `doctrine-lint` green. |
| **Tool-agnostic; no Workflow hardwiring** (spec §1.2) | ✅ | Agent↔Task is the only seam; CC Workflow fast-path is additive; OpenCode form documents the sequential fallback. |

## New patterns introduced

- **`bead-implementer`** is substrate's **second subagent** — the first *mutating* one
  (`edit/bash: allow`), where `doctrine-architect` is read/analyze-only (`edit: deny`). The
  companion-subagent pattern (one analyst, one implementer, both `task: deny`) is now established.
- **Skill-to-skill routing gate** — `execute` Step-0 is the first instance of one skill *delegating*
  to another based on a runtime assessment (≥3 file-disjoint beads + tracker + confirm), with a
  fail-safe default. A reusable shape for future "one entry point, two machines underneath" skills.

## Outdated rules found

None. The parallel-execution doctrine's role framing ("Orchestrator" / "Subagent") was **abstract by
design**; the only change made to a doctrine was an **additive one-line pointer** in its §Roles
naming the concrete `/substrate:orchestrate` skill + `bead-implementer` agent — the abstract framing
is preserved, no operational loop was imported into the doctrine (agents-doctrine §7.3
duplication-drift guard honored).

## Binding amendments required

**None.** No doctrine policy needs rewriting. The single doctrine edit (the §Roles pointer) is
additive and already applied.

## Missing coverage / deferred (filed as follow-up beads, Step 7.2)

1. **E2E dry-run (Phase 6)** — deferred; no graphed epic + root `bead-graph.sh` in the plugin repo
   itself, and keylark slice-2 is a separate live runtime. Exact manual command recorded in
   `e2e-dryrun.md`. → follow-up bead.
2. **CC Workflow fast-path polish** — v1 documents the fast-path over the NL floor; a concrete
   journaled-resume Workflow script for the per-wave pipeline is not yet authored. → follow-up bead.
3. **Checkpoint-sync control** — the doctrine allows "an explicitly agreed checkpoint" sync between
   epic-open and epic-close; orchestrate v1 only does the single epic-close sync. A `--checkpoint`
   control is a natural follow-up. → follow-up bead.
