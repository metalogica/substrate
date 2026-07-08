---
type: is
id: is-01kx1kctkafg5yb25axygv1vss
title: bead-graph.sh window rendering
kind: task
status: closed
priority: 2
version: 4
labels:
  - epic:orchestrated-execution
dependencies: []
parent_id: is-01kx1kacgks16j4ddk86vt5ps1
created_at: 2026-07-08T19:31:07.497Z
updated_at: 2026-07-08T20:35:00.084Z
closed_at: 2026-07-08T20:35:00.084Z
close_reason: null
---
## Acceptance criterion
Group beads by group: label in waves + mermaid overlay; backward-compatible when absent.

## Gate (structural — plugin repo, no compile/test)
- `bash -n references/docs-core/docs/scripts/bead-graph.sh`
- `grep -qi "group" references/docs-core/docs/scripts/bead-graph.sh`

## Files
- references/docs-core/docs/scripts/bead-graph.sh

## Spec
docs/tasks/ongoing/orchestrated-execution/orchestrated-execution-spec.md#4.4

## blocked-by
B6

## State-transfer prompt
> substrate plugin repo, main, trunk-commits. Read the Spec section above. Gate is structural (grep/parity/bash -n). Keep SKILL bodies <500 lines. Commit atomically; end msg with Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>.
