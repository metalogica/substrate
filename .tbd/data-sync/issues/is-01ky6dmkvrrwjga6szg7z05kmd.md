---
type: is
id: is-01ky6dmkvrrwjga6szg7z05kmd
title: prs.ts ETag polling + owned-PR mapping + comment cursor
kind: task
status: closed
priority: 2
version: 6
labels:
  - epic:serve-v1
  - group:window-6
dependencies:
  - type: blocks
    target: is-01ky6dmntxm3wq4qsa4nc5v0k9
  - type: blocks
    target: is-01ky6dmpcsn2srvp9nr4281w6g
  - type: blocks
    target: is-01ky6dmwp06b4qw21mkfh8befa
parent_id: is-01ky6dm7cmm0kzaza6379jer1p
created_at: 2026-07-23T02:42:25.271Z
updated_at: 2026-07-23T04:16:58.489Z
closed_at: 2026-07-23T04:16:58.489Z
close_reason: "gate green: prs.ts gh ETag polling (union tip b2eb552)"
---
Goal: gh api with stored ETags (If-None-Match, 304 free), owned PR = open PR with branchPrefix head mapped to in-flight bead; fetch review threads + issue comments since last seen id; dedup by comment id (spec section 6). Vitest with recorded gh fixtures (304 path, new-comment batch, merged detection).
Files (creates): daemon/src/prs.ts daemon/test/prs.test.ts
Consumes: b1 scaffold.
Gate: cd daemon && pnpm gate
Acceptance: fixture-proven 304/batch/merge paths.
spec: docs/tasks/ongoing/serve-v1/serve-v1-spec.md#phase-5-step-5.1
