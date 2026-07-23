---
type: is
id: is-01ky6dmntxm3wq4qsa4nc5v0k9
title: Actualize sessions (batched comments) + merge detection in tick.ts
kind: task
status: open
priority: 2
version: 5
labels:
  - epic:serve-v1
  - group:window-2
dependencies:
  - type: blocks
    target: is-01ky6dmqswy04vzjczygzv8awy
  - type: blocks
    target: is-01ky6dmwp06b4qw21mkfh8befa
parent_id: is-01ky6dm7cmm0kzaza6379jer1p
created_at: 2026-07-23T02:42:27.292Z
updated_at: 2026-07-23T04:53:18.712Z
---
Goal: new submitted review / top-level comment -> FRESH session in same worktree, batched unaddressed comments, reply via gh, never merge; dedup replies by comment id before spawn; merge detection (mergedAt or merge-base --is-ancestor) -> tidy hook + close bead with sha (spec section 6). LIVE DRILL (out-of-band): comment on the b9 PR -> fresh session pushes + replies; merge -> detected within one tick.
Files (modifies): daemon/src/tick.ts
Consumes: b8 session, b9 dispatch chain, b10 prs.
Gate: cd daemon && pnpm gate  ·  OUT-OF-BAND: live drill (Policy-4)
Acceptance: fixture tests green; drill recorded.
spec: docs/tasks/ongoing/serve-v1/serve-v1-spec.md#phase-5-step-5.2

## Notes

merged 596e910; headless gate green (107 tests). Awaiting OUT-OF-BAND live drill: comment on PR -> fresh session pushes+replies; merge -> detected within one tick. Dependents unblocked by merge.
