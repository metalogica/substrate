# Orchestrated Execution: Brief

**Author**: rei nova + Claude (session-converged)
**Date**: 2026-07-08
**Status**: Ready for spec

---

## 1. Background

substrate today exposes two execution skills at opposite extremes of a single hidden axis:

- `/substrate:execute` — **one monolithic agent** runs the whole spec in one context window, sequentially.
- `/substrate:orchestrate` — **one agent per bead**, each in a fresh worktree window (a fleet).

The framing has always been *parallelism* (serial vs. fleet). That misses the axis that actually bites: **context**. A monolithic run of a deep spec accumulates every file read, edit, and gate log into one window; by the later beads the window suffers genuine long-context attention degradation ("context rot") and, worse, hits **auto-compaction** — a discrete cliff that silently drops the detail those late beads needed. Meanwhile per-bead orchestration throws away *coherence*: co-edited beads cold-start in separate windows, each re-reading the same files.

Both skills are degenerate endpoints of one operation: **partition the bead DAG into agent-sized context windows.** `execute` = 1 window for all N beads; `orchestrate` = N windows, one per bead. Neither lets the system choose the right K.

## 2. User Story

As an operator running a large, graphed spec, I want execution to be **partitioned into context-budget-sized windows automatically** — grouping co-edited beads into one warm window, isolating disjoint chains into separate (and where safe, parallel) windows — so that no single window rots or compacts mid-run, and so I can diagnose *ex-post* exactly what each window did. I want the primary execution door to be **orchestration** (the partitioned fleet), with an explicit **attended** mode for when I want to co-pilot a single window.

## 3. Constraints

- **MUST** keep the orchestrator a pure coordinator — it dispatches K sub-agent windows and **never implements code itself** (K = 1..N; the four "rungs" monolith/phase/group/per-bead are one dial).
- **MUST** preserve every binding invariant of `agents-parallel-execution-doctrine.md`: single-writer tracker (only the orchestrator writes `tbd`/remote), file-disjoint parallel waves, merge-on-green unblocks dependents, gate-before-close, one squash commit on trunk.
- **MUST** make execution transparent for ex-post diagnosis: durable, inspectable run-state (no ephemeral/delete-on-read store like `spool`).
- **MUST** reuse existing stores — `substrate.yaml` (policy) and `.substrate/` (engine state) — not invent new top-level locations.
- **MUST** keep the partition a *deviatable prior*: `graph-spec` suggests it, the orchestrator may re-batch, deviations are logged.
- **MUST** keep OpenCode parity (binding rule) for every changed skill/agent.
- **MUST NOT** break the existing serial-dependency-spine guarantee (a bead branches off the current integration tip containing its merged blockers).
- **SHOULD** keep the trivial case cheap: a small spec collapses to K=1 (one window, whole spec).

## 4. Resolved Decisions (this session's Socratic Q&A)

1. **Partition = a `group:<window-N>` label** written per-bead by `graph-spec`; `bead-graph.sh` renders the windows; the orchestrator reads the labels and may re-batch.
2. **Coordinator never implements.** Dispatch unit becomes a *bead group*, not a bead. `bead-implementer` becomes a **group-runner**: runs N beads in one worktree, gating each in sequence, reporting per-bead pass/fail.
3. **Heuristic** (in `graph-spec`): per-bead cost ≈ files-bytes + heavy-ref reads + gate-log weight + effort; accumulate along topological order; cut a window at the context budget; groups snap to file-adjacency; a single bead over budget = **under-decomposed → split-back signal**.
4. **State reuse:** `substrate.yaml` gains an `execution:` policy block (context-budget, default-rung) as a sibling to `worktree-seed`/`toolchain-pin`. `.substrate/execution-state.json` (**committed**) holds the partition + per-bead outcome ledger + pointers to run-logs. `.substrate/runs/<epic>/<run-id>/` (**gitignored**) holds the heavy per-window debug trace; deviations from the suggested partition are logged there.
5. **Spec back-link:** each bead carries `spec: <path>#<section>` — read-on-demand (not inlined), so a cold group-runner can expand to the full spec if it detects a gap.
6. **Terminology (naming fork → option (b)):** orchestration becomes the **primary door**. `/substrate:orchestrate` is what `architect-spec`/`graph-spec` hand off to by default and what the docs lead with. `/substrate:execute` **demotes to the attended single-window sub-mode** (human co-pilots one implementing agent with phase-gate pauses). The execute/orchestrate boundary rotates from *parallel-vs-serial* to *attended-vs-unattended*.

## 5. Success Criteria (binary)

- `graph-spec` writes a `group:<window-N>` label on every bead and prints the window partition via `bead-graph.sh`.
- `agents-parallel-execution-doctrine.md` defines the group-runner role + a "Grouping & windows" section, with all prior invariants intact.
- `orchestrate` dispatches one group-runner per window (one worktree/seed per group), reads the partition, logs deviations, and writes `.substrate/execution-state.json` before the trunk squash commit.
- `bead-implementer` runs N beads per window, gates each in sequence, and reports a per-bead pass/fail ledger.
- `substrate.yaml` carries an `execution:` block; `.gitignore` ignores `.substrate/runs/`; `.substrate/execution-state.json` validates against its documented schema.
- The docs (`README`, `CLAUDE.md`, SDD pipeline) lead with `orchestrate` as primary; `execute` is documented as the attended mode; `architect-spec` hands off to `orchestrate` by default.
- OpenCode parity holds: `comm -23 <(ls skills) <(ls opencode/command/substrate ...)` is empty and each changed command is re-translated.

## 6. References

- `references/docs-core/docs/doctrine/agents-parallel-execution-doctrine.md` (binding — this change amends it)
- `references/docs-core/docs/doctrine/agents-doctrine.md`
- `skills/graph-spec/SKILL.md`, `skills/execute/SKILL.md`, `skills/orchestrate/SKILL.md`
- `agents/bead-implementer.md`
- `CLAUDE.md` (architectural principles; skill inventory)
- `opencode/CONVENTIONS.md`, `opencode/README.md` (parity rule)
- Session origin: the `/substrate:spool` design conversation (durable-vs-ephemeral state distinction) that surfaced the context axis.

## 7. Open Questions

None blocking. The one fork (naming) resolved to **(b)** above. Heuristic constants (context-budget fraction, cost weights) are tunable via `substrate.yaml` and default-set in the spec; calibration is a follow-up, not a blocker.
