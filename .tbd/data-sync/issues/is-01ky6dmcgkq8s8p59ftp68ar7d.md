---
type: is
id: is-01ky6dmcgkq8s8p59ftp68ar7d
title: "queue.ts tbd adapter: list/claim/release/stamp/close via --json subprocess"
kind: task
status: closed
priority: 2
version: 7
labels:
  - epic:serve-v1
  - group:window-3
dependencies:
  - type: blocks
    target: is-01ky6dmd2d1pwkmfgx1e4bbz7k
  - type: blocks
    target: is-01ky6dmegwbdx2kpcjmmez4m6j
  - type: blocks
    target: is-01ky6dmpcsn2srvp9nr4281w6g
  - type: blocks
    target: is-01ky6dmwp06b4qw21mkfh8befa
parent_id: is-01ky6dm7cmm0kzaza6379jer1p
created_at: 2026-07-23T02:42:17.747Z
updated_at: 2026-07-23T04:16:52.280Z
closed_at: 2026-07-23T04:16:52.279Z
close_reason: "gate green: queue.ts tbd adapter (union tip b2eb552)"
---
Goal: typed adapter shelling to tbd CLI (spec 3.1 transitions): claim = status in_progress + assignee serve + remove groomed label; release restores; stamp route/PR notes; close with reason. No store parsing. Vitest units against a fixture tbd repo created in test setup.
Files (creates): daemon/src/queue.ts daemon/test/queue.test.ts daemon/test/fixtures/**
Consumes: b1 scaffold (tsconfig, vitest).
Gate: cd daemon && pnpm gate
Acceptance: claim removes groomed+sets assignee; release restores; FIFO by ULID.
spec: docs/tasks/ongoing/serve-v1/serve-v1-spec.md#phase-2-step-2.1
