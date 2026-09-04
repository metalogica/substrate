---
type: is
id: is-01m1pyk69rcb2rdnz25ng7pq2p
title: "orchestrate: verify an epic's declared preconditions before cutting the integration branch"
kind: feature
status: open
priority: 1
version: 1
spec_path: docs/tasks/ongoing/doctrine-crud/doctrine-crud-spec.md
labels:
  - src:synth-doctrine-crud
dependencies: []
created_at: 2026-09-04T19:33:40.791Z
updated_at: 2026-09-04T19:33:40.791Z
---
---
originating-spec: docs/tasks/ongoing/doctrine-crud/doctrine-crud-spec.md
originating-session: 2026-09-04
cross-repo: in-repo
effort: S
---

## Why now (session signal)
The epic:doctrine-crud epic bead declared, in prose in its body:

    ## Preconditions (before /substrate:orchestrate — NOT before bead work planning)
    - Merge feat/doctrine-ambient-skills (be283dd) — D1 sweeps ambient stubs via
      doctrine-skills-sync.sh; A2's rule numbering follows its lint rule 4.
    - Merge feat/serve-local-mode (2c653bf) — B4's target skills/serve-bead/SKILL.md
      exists only there.

Neither branch was merged. Five of fourteen beads (A2, D1, C1, B4, R) reference files that existed
only on those branches. Nothing in `/substrate:orchestrate` reads, checks, or even acknowledges a
declared precondition — Step 2 reads the DAG, Step 3 reads substrate.yaml, Step 4 cuts the branch.
The miss was caught only because the orchestrator happened to read the epic body while collecting
Goal/Files/Gate tuples. Had it not, wave 2 would have failed on a missing `doctrine-skills-sync.sh`
and wave 4 on a missing `skills/serve-bead/SKILL.md` — after three windows of work had already
merged.

## Acceptance criterion
`/substrate:orchestrate` gains a step between Step 2 (read the DAG) and Step 4 (cut the integration
branch) that reads the epic bead's body for a `## Preconditions` block, and for each declared item
either verifies it mechanically or surfaces it for confirmation BEFORE any worktree exists. A
declared-but-unmet precondition must halt with an explanation, never dispatch. Absent block = silent
no-op. `opencode/command/substrate/orchestrate.md` re-translated.

## Notes
Design question the implementer must settle: preconditions are free prose today, so a mechanical
check needs either a convention (e.g. `- merge <branch> (<sha>)` parsed into
`git merge-base --is-ancestor`) or a fall back to surfacing the block verbatim and pausing. Prefer
the narrow parse for the merge case (it is the common one and is exactly checkable) plus
surface-and-pause for everything else — do not invent a general precondition DSL.

Related but distinct: sub-7710 (cut feat/<epic> from origin/<trunk>, or warn when local trunk is
ahead) is about the base being *stale*; this is about the base being *incomplete*.

## Dependencies
- blocked-by: []

## State-transfer prompt
> Working in metalogica/substrate. Task: make /substrate:orchestrate verify an epic's declared
> preconditions before it cuts the integration branch.
> Relevant files:
> - skills/orchestrate/SKILL.md — Step 2 (read the DAG) and Step 4 (setup); the new step goes
>   between them, before any `git worktree add`
> - opencode/command/substrate/orchestrate.md — mirror (parity rule, CLAUDE.md)
> - skills/graph-spec/SKILL.md — where the epic bead body is authored; consider whether the
>   preconditions block should get a stated shape there rather than staying free prose
> Relevant prior commits:
> - 753ec9c — the epic whose preconditions were missed; its spec's `### Post-execution notes`
>   records the incident
> Constraints — do NOT modify: the fail-fast posture (abort with an explanation, never probe or
> retry); the Step 2 rule that the DAG is read, never re-derived.
> Verification:
> - bash references/docs-core/docs/scripts/doctrine-lint.sh
> - The skill's text must show both arms: a met precondition proceeding silently, and an unmet one
>   halting before any worktree is created.
