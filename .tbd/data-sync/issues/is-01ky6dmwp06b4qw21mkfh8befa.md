---
type: is
id: is-01ky6dmwp06b4qw21mkfh8befa
title: "Doctrine reconciliation (terminal): ratify-only vs references/docs-core/docs/doctrine/**"
kind: task
status: closed
priority: 2
version: 3
labels:
  - epic:serve-v1
  - group:window-8
  - kind:doctrine-reconciliation
dependencies: []
parent_id: is-01ky6dm7cmm0kzaza6379jer1p
created_at: 2026-07-23T02:42:34.303Z
updated_at: 2026-07-23T05:13:03.749Z
closed_at: 2026-07-23T05:13:03.748Z
close_reason: "ratify-only proof: green union re-gate on integrated tip; ratified serve-daemon behaviors into agents-parallel-execution-doctrine.md"
---
Goal: diff shipped daemon against agents-parallel-execution-doctrine.md + agents-doctrine.md; codify ONLY what the code already does (e.g. the daemon as sole author of its bead transitions — single-writer analog; sessions-are-cattle recovery). Anything aspirational -> follow-up beads, never doctrine. Green union re-gate on the integrated tip IS the ratify-only proof; red -> revert doctrine edit to no-op and note for synthesize-session.
Files (write-scope): references/docs-core/docs/doctrine/**
Gate: full union gate on integrated tip + bash references/docs-core/docs/scripts/doctrine-lint.sh
Blocked-by: every other bead in epic:serve-v1 (terminal node).
spec: docs/tasks/ongoing/serve-v1/serve-v1-spec.md#phase-7-step-7.2
