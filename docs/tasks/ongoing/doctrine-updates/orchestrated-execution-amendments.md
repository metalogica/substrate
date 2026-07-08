# Doctrine Amendments — orchestrated-execution

**Spec:** `docs/tasks/ongoing/orchestrated-execution/orchestrated-execution-spec.md`
**Reviewed against:** `agents-parallel-execution-doctrine.md`, `agents-doctrine.md`, `CLAUDE.md` architectural principles
**Date:** 2026-07-08

## Compliance verdict (Phase 9 review)

All binding invariants **hold** after the change:

- **Orchestrator never implements.** `orchestrate/SKILL.md` Roles + doctrine §Roles restate "Never implements code"; the dispatch unit changed (bead → window) but the orchestrator still only reads the partition, dispatches group-runners, merges, re-gates, and writes run-state.
- **Single-writer tracker** intact — only the orchestrator runs `tbd update/close/sync` / `git push`; the group-runner keeps `permission.task: deny` + the verbatim no-tbd/no-push rule.
- **File-disjoint waves** intact — the pairwise-Files guard now applies at *window* granularity (union of a window's beads' Files); within-window co-editing is by construction, sequential in one worktree.
- **Merge-on-green, gate-before-close, two-stage out-of-band gate, one signed squash on trunk, branch-off-current-tip** — all preserved and cross-referenced from the new §Grouping & windows.
- **OpenCode parity** — `comm` audit empty; all changed surfaces re-translated.
- **Progressive disclosure** — every *changed* skill body is well under ~500 lines (orchestrate 190, execute ~205, graph-spec ~160, adopt ~200, architect-spec 208).

No blocking amendment. Three **non-blocking observations** are queued for human triage below.

## Observations queued for triage (not fixed here — out of this spec's scope)

### A1 — `orchestrate` has no task-archival step, but `synthesize-session` presumes one

`/substrate:execute` Step 5 archives `docs/tasks/ongoing/<f>/` → `docs/tasks/completed/<f>/`.
`/substrate:orchestrate` lands a signed squash but **does not archive the task dir**. Yet
`synthesize-session`'s precondition is "spec archived to `docs/tasks/completed/<feature>/`". This
spec made orchestrate the *primary* door and softened synthesize-session's wording to be
executor-agnostic, but the archival gap is now load-bearing on the primary path.
**Proposed:** add an archive + (optional) `synthesize-session` hand-off step to `orchestrate` Step 6,
mirroring `execute` Step 5/Step 7. Small, isolated; a good follow-up bead.

### A2 — `orchestrate` requires a `substrate.yaml` gate; the plugin repo itself has none (dogfood blocker)

§12.B invited running this spec *through the orchestration model it defines*. That was **not
possible**: `/substrate:orchestrate` aborts (correctly, per its REFUSE table) when `substrate.yaml`'s
`gate` block is missing, and the substrate **plugin** repo has no `substrate.yaml` — its gates are
**structural** (grep / `bash -n` / parity / yaml-parse), declared inline per spec-phase (§6/§12.0).
So the spec was executed via the **attended sequential path** instead. The gap is a genuine one:
the orchestration machinery assumes a single `substrate.yaml` gate command, which doesn't fit a
markdown-contract repo whose verification is structural.
**Proposed (either):** (a) let `substrate.yaml`'s `gate.*` accept structural commands so the plugin
repo can declare its own gate and self-orchestrate; or (b) document that orchestrate targets
scaffolded/adopted repos and the plugin repo dogfoods via attended `execute`. Decision for a human.

### A3 — Two pre-existing skill bodies exceed the ~500-line progressive-disclosure ceiling

`synthesize-session/SKILL.md` (566) and `deploy/SKILL.md` (530) are over ~500 lines. **Not caused by
this spec** (this change touched only synthesize-session's lifecycle diagram + two precondition
lines; deploy was untouched), but surfaced by the Phase-9 sweep.
**Proposed:** a housekeeping bead to move bulk content from those two bodies into `references/`.
