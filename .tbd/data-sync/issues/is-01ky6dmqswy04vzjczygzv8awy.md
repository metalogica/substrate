---
type: is
id: is-01ky6dmqswy04vzjczygzv8awy
title: pipeline-render.ts + status.ts + serve loop assembly + events.jsonl writes
kind: task
status: closed
priority: 2
version: 6
labels:
  - epic:serve-v1
  - group:window-2
dependencies:
  - type: blocks
    target: is-01ky6dms50fe9q5waepv2r7p21
  - type: blocks
    target: is-01ky6dmsxcepw4jkz0ybdkszd9
  - type: blocks
    target: is-01ky6dmwp06b4qw21mkfh8befa
parent_id: is-01ky6dm7cmm0kzaza6379jer1p
created_at: 2026-07-23T02:42:29.307Z
updated_at: 2026-07-23T05:02:24.582Z
closed_at: 2026-07-23T05:02:24.581Z
close_reason: "gate green: pipeline-render + status + serve loop assembly + events.jsonl (119 tests)"
---
Goal: shared aerial ASCII pipeline renderer (board->claimed->building->in-review->merged 24h + bounced + tick health) consumed by status.ts (staleness warn at 2x interval); serve.ts full loop: boot-reap -> interval ticks, PR-sweep-first; events.jsonl append at every transition incl. session usage (spec 3.2/3.2b).
Files (creates/modifies): daemon/src/pipeline-render.ts daemon/src/status.ts daemon/src/serve.ts daemon/src/tick.ts daemon/test/pipeline-render.test.ts
Consumes: b2 serve wiring, b11 full tick chain, b12 tidy (boot-reap).
Gate: cd daemon && pnpm gate
Acceptance: renderer snapshot test; kill -9 mid-build -> restart -> consistent board/state (fixture-level).
spec: docs/tasks/ongoing/serve-v1/serve-v1-spec.md#phase-6-step-6.2
