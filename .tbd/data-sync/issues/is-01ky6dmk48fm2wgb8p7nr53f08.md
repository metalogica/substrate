---
type: is
id: is-01ky6dmk48fm2wgb8p7nr53f08
title: Dispatch integration in tick.ts + PR idempotency (gh pr view || create)
kind: task
status: open
priority: 2
version: 5
labels:
  - epic:serve-v1
  - group:window-2
dependencies:
  - type: blocks
    target: is-01ky6dmntxm3wq4qsa4nc5v0k9
  - type: blocks
    target: is-01ky6dmwp06b4qw21mkfh8befa
parent_id: is-01ky6dm7cmm0kzaza6379jer1p
created_at: 2026-07-23T02:42:24.520Z
updated_at: 2026-07-23T04:45:38.871Z
---
Goal: wire route->worktree->session into the tick (spec section 4 step 6 + 5.2 failure policy: retry once next tick then bounce with note); PR creation idempotent by observation; stamp bead in-review with PR url. LIVE DRILL (out-of-band): one groomed kind:task bead on a scratch GitHub repo -> substrate triage -> real headless session -> open PR; kill/rerun mid-flow -> no duplicate branch/PR.
Files (modifies): daemon/src/tick.ts daemon/src/triage.ts
Consumes: b4 tick, b5 router, b7 worktree, b8 session.
Gate: cd daemon && pnpm gate  ·  OUT-OF-BAND: live drill (Policy-4: merge on green, close after drill; record checklist in notes)
Acceptance: mocked-dispatch tests green; drill checklist complete.
spec: docs/tasks/ongoing/serve-v1/serve-v1-spec.md#phase-4-step-4.3

## Notes

merged c97aeb1; headless gate green (99 tests). Awaiting OUT-OF-BAND live drill: scratch GitHub repo -> substrate triage -> real headless session -> open PR; kill/rerun -> no dup. Dependents already unblocked by merge.
