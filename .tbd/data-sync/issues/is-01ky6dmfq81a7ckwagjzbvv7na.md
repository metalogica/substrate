---
type: is
id: is-01ky6dmfq81a7ckwagjzbvv7na
title: "triage.ts manual verb: claim+route+dispatch ONE bead immediately"
kind: task
status: closed
priority: 2
version: 4
labels:
  - epic:serve-v1
  - group:window-3
dependencies:
  - type: blocks
    target: is-01ky6dmwp06b4qw21mkfh8befa
parent_id: is-01ky6dm7cmm0kzaza6379jer1p
created_at: 2026-07-23T02:42:21.031Z
updated_at: 2026-07-23T04:31:54.635Z
closed_at: 2026-07-23T04:31:54.634Z
close_reason: "gate green: triage.ts manual verb (dispatch stubbed)"
---
Goal: substrate triage <bead-id> shares tick internals — skips the poll wait; same claim/route path; dispatch may be stubbed until b9 lands (then integrates). Live check on a scratch repo: routes and stamps.
Files (creates): daemon/src/triage.ts
Consumes: b4 tick internals, b5 router.
Gate: cd daemon && pnpm gate
Acceptance: fixture bead routed + stamped via the verb.
spec: docs/tasks/ongoing/serve-v1/serve-v1-spec.md#phase-3-step-3.2
