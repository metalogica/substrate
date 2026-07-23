---
type: is
id: is-01ky6dmegwbdx2kpcjmmez4m6j
title: router.ts deterministic route + bounce transitions + override-log hook
kind: task
status: closed
priority: 2
version: 6
labels:
  - epic:serve-v1
  - group:window-3
dependencies:
  - type: blocks
    target: is-01ky6dmfq81a7ckwagjzbvv7na
  - type: blocks
    target: is-01ky6dmk48fm2wgb8p7nr53f08
  - type: blocks
    target: is-01ky6dmwp06b4qw21mkfh8befa
parent_id: is-01ky6dm7cmm0kzaza6379jer1p
created_at: 2026-07-23T02:42:19.803Z
updated_at: 2026-07-23T04:25:23.466Z
closed_at: 2026-07-23T04:25:23.465Z
close_reason: "gate green: router.ts deterministic route (union tip 86a0a9e)"
---
Goal: pure function (spec 5.1): needs-spec->bounce; kind:bug->bug lane; kind:feature|task->quick; missing/other kind->bounce with needs-groom note. Bounce = release claim + label/note via queue adapter. Override-log hook stays (trivially satisfied in v1 — no model, prior only followed or returned).
Files (creates): daemon/src/router.ts daemon/test/router.test.ts
Consumes: b3 queue types/transitions.
Gate: cd daemon && pnpm gate
Acceptance: all four route cases unit-proven incl. bounce notes.
spec: docs/tasks/ongoing/serve-v1/serve-v1-spec.md#phase-3-step-3.1
