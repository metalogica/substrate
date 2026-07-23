---
type: is
id: is-01ky6dmjhj6vka3a77e359eecw
title: session.ts headless spawn contract + log capture + JSON usage parse
kind: task
status: closed
priority: 2
version: 6
labels:
  - epic:serve-v1
  - group:window-5
dependencies:
  - type: blocks
    target: is-01ky6dmk48fm2wgb8p7nr53f08
  - type: blocks
    target: is-01ky6dmntxm3wq4qsa4nc5v0k9
  - type: blocks
    target: is-01ky6dmwp06b4qw21mkfh8befa
parent_id: is-01ky6dm7cmm0kzaza6379jer1p
created_at: 2026-07-23T02:42:23.920Z
updated_at: 2026-07-23T04:16:56.473Z
closed_at: 2026-07-23T04:16:56.472Z
close_reason: "gate green: session.ts headless spawn contract (union tip b2eb552)"
---
Goal: spawn claude -p "<lane prompt>" --output-format json --dangerously-skip-permissions [--model], cwd = worktree; append log .substrate/serve/logs/<bead>.<n>.log; parse usage (tokens/cost) from JSON result for events ledger (spec 5.2 + 3.2b). Success is OBSERVED by caller, never parsed from output. Spawn mocked in tests.
Files (creates): daemon/src/session.ts daemon/test/session.test.ts
Consumes: b1 config.ts.
Gate: cd daemon && pnpm gate
Acceptance: contract + usage parse unit-proven with recorded JSON fixture.
spec: docs/tasks/ongoing/serve-v1/serve-v1-spec.md#phase-4-step-4.2
