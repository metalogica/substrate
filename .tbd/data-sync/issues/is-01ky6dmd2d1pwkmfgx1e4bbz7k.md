---
type: is
id: is-01ky6dmd2d1pwkmfgx1e4bbz7k
title: "tick.ts skeleton: capacity -> discover -> claim (injectable adapters)"
kind: task
status: closed
priority: 2
version: 6
labels:
  - epic:serve-v1
  - group:window-2
dependencies:
  - type: blocks
    target: is-01ky6dmfq81a7ckwagjzbvv7na
  - type: blocks
    target: is-01ky6dmk48fm2wgb8p7nr53f08
  - type: blocks
    target: is-01ky6dmwp06b4qw21mkfh8befa
parent_id: is-01ky6dm7cmm0kzaza6379jer1p
created_at: 2026-07-23T02:42:18.316Z
updated_at: 2026-07-23T04:25:22.979Z
closed_at: 2026-07-23T04:25:22.978Z
close_reason: "gate green: tick.ts skeleton (union tip 86a0a9e)"
---
Goal: one poll cycle as a pure orchestration fn (spec section 4): PR-sweep placeholder first, capacity check vs concurrency, discover groomed (FIFO ULID, exclude needs-spec), claim head, route stub. Adapters injected so vitest drives against fixtures. Crash-idempotent between any two sub-steps.
Files (creates/modifies): daemon/src/tick.ts daemon/test/tick.test.ts
Consumes: b3 queue adapter; b1 state.ts/config.ts; b2 serve.ts wiring.
Gate: cd daemon && pnpm gate
Acceptance: fixture tests prove claim transition, FIFO order, capacity respected.
spec: docs/tasks/ongoing/serve-v1/serve-v1-spec.md#phase-2-step-2.2
