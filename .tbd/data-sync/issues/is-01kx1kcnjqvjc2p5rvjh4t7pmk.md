---
type: is
id: is-01kx1kcnjqvjc2p5rvjh4t7pmk
title: Mirror group-runner role in agents-doctrine
kind: task
status: closed
priority: 2
version: 4
labels:
  - epic:orchestrated-execution
dependencies: []
parent_id: is-01kx1kacgks16j4ddk86vt5ps1
created_at: 2026-07-08T19:31:02.358Z
updated_at: 2026-07-08T20:34:54.685Z
closed_at: 2026-07-08T20:34:54.685Z
close_reason: null
---
## Acceptance criterion
agents-doctrine role table references the group-runner (window) role consistently.

## Gate (structural — plugin repo, no compile/test)
- `grep -qi "group-runner\|window" references/docs-core/docs/doctrine/agents-doctrine.md`

## Files
- references/docs-core/docs/doctrine/agents-doctrine.md

## Spec
docs/tasks/ongoing/orchestrated-execution/orchestrated-execution-spec.md#4.1

## blocked-by
B1

## State-transfer prompt
> substrate plugin repo, main, trunk-commits. Read the Spec section above. Gate is structural (grep/parity/bash -n). Keep SKILL bodies <500 lines. Commit atomically; end msg with Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>.
