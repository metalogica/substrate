---
type: is
id: is-01kx1kd0sx8a8jzdctce4x7ag9
title: "bead-tui: orchestration pane (visualize strategy/rung used)"
kind: feature
status: open
priority: 2
version: 3
labels:
  - epic:orchestrated-execution
dependencies: []
parent_id: is-01kx1kacgks16j4ddk86vt5ps1
created_at: 2026-07-08T19:31:13.852Z
updated_at: 2026-07-08T20:36:13.082Z
closed_at: null
close_reason: null
---
## Acceptance criterion
DEFERRED follow-up (out of spec phase scope per §2). Add an orchestration pane to bead-tui reading .substrate/execution-state.json + group: labels; visually shows which flow the run used: monolith (1 window all beads) / phase-windowed / group-windowed (file-adjacency) / per-bead fleet, with windows as lanes + live per-bead status.

## Gate (structural — plugin repo, no compile/test)
- `node -c references/docs-core/docs/scripts/bead-tui/watch.mjs`

## Files
- references/docs-core/docs/scripts/bead-tui/watch.mjs

## Spec
docs/tasks/ongoing/orchestrated-execution/orchestrated-execution-spec.md#3.4

## blocked-by
B6, B8

## State-transfer prompt
> substrate plugin repo, main, trunk-commits. Read the Spec section above. Gate is structural (grep/parity/bash -n). Keep SKILL bodies <500 lines. Commit atomically; end msg with Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>.
