---
type: is
id: is-01ky6dmg8n181n7j8zctckfa1x
title: "worktree.ts sibling lifecycle: create off fresh trunk, reap, prune"
kind: task
status: closed
priority: 2
version: 6
labels:
  - epic:serve-v1
  - group:window-4
dependencies:
  - type: blocks
    target: is-01ky6dmk48fm2wgb8p7nr53f08
  - type: blocks
    target: is-01ky6dmpcsn2srvp9nr4281w6g
  - type: blocks
    target: is-01ky6dmwp06b4qw21mkfh8befa
parent_id: is-01ky6dm7cmm0kzaza6379jer1p
created_at: 2026-07-23T02:42:21.588Z
updated_at: 2026-07-23T04:16:53.693Z
closed_at: 2026-07-23T04:16:53.693Z
close_reason: "gate green: worktree.ts sibling lifecycle (union tip b2eb552)"
---
Goal: sibling root ../<repo>-serve/<bead-id>/ (spec 3.3), branch serve/<bead-id>-<slug> cut from origin/<trunk>; reap = worktree remove --force + branch delete + prune. Vitest on a fixture git repo.
Files (creates): daemon/src/worktree.ts daemon/test/worktree.test.ts
Consumes: b1 scaffold only (file-disjoint from phases 2-3).
Gate: cd daemon && pnpm gate
Acceptance: lifecycle proven on fixture repo incl. reap idempotency.
spec: docs/tasks/ongoing/serve-v1/serve-v1-spec.md#phase-4-step-4.1
