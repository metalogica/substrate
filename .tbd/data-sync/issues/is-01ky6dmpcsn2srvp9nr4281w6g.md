---
type: is
id: is-01ky6dmpcsn2srvp9nr4281w6g
title: "tidy.ts reaper: verb + on-merge + boot-reap, reconcile from observed truth"
kind: task
status: closed
priority: 2
version: 5
labels:
  - epic:serve-v1
  - group:window-4
dependencies:
  - type: blocks
    target: is-01ky6dmqswy04vzjczygzv8awy
  - type: blocks
    target: is-01ky6dmwp06b4qw21mkfh8befa
parent_id: is-01ky6dm7cmm0kzaza6379jer1p
created_at: 2026-07-23T02:42:27.864Z
updated_at: 2026-07-23T04:25:24.142Z
closed_at: 2026-07-23T04:25:24.141Z
close_reason: "gate green: tidy.ts reaper core (union tip 86a0a9e)"
---
Goal: spec section 7 — reap merged/closed-PR worktrees + branches; no-live-entry+no-open-PR -> reap + release claim (restore groomed); orphaned serve claims with no worktree/PR -> release; rewrite state.json from {tbd,git,gh} truth ONLY (never from state.json itself).
Files (creates): daemon/src/tidy.ts daemon/test/tidy.test.ts
Consumes: b3 queue, b7 worktree, b10 prs.
Gate: cd daemon && pnpm gate
Acceptance: orphan-release + merged-reap + truth-rewrite unit-proven.
spec: docs/tasks/ongoing/serve-v1/serve-v1-spec.md#phase-6-step-6.1
