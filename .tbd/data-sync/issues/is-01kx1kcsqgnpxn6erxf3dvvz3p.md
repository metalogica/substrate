---
type: is
id: is-01kx1kcsqgnpxn6erxf3dvvz3p
title: "graph-spec: partition heuristic + group:/spec: labels"
kind: task
status: closed
priority: 2
version: 8
labels:
  - epic:orchestrated-execution
dependencies:
  - type: blocks
    target: is-01kx1kctkafg5yb25axygv1vss
  - type: blocks
    target: is-01kx1kcvfypdwvgyv9qbfgb8ea
  - type: blocks
    target: is-01kx1kcz1kxx8jvc2n86m3emat
  - type: blocks
    target: is-01kx1kd0sx8a8jzdctce4x7ag9
parent_id: is-01kx1kacgks16j4ddk86vt5ps1
created_at: 2026-07-08T19:31:06.608Z
updated_at: 2026-07-08T20:34:59.216Z
closed_at: 2026-07-08T20:34:59.215Z
close_reason: null
---
## Acceptance criterion
After Kahn, before persist: cost estimate, window cut at context-budget, file-adjacency snap, under-decomposition warning; write group:<window-N> + spec: on each bead.

## Gate (structural — plugin repo, no compile/test)
- `grep -qi "context-budget\|partition\|window" skills/graph-spec/SKILL.md`
- `grep -q "group:" skills/graph-spec/SKILL.md`

## Files
- skills/graph-spec/SKILL.md

## Spec
docs/tasks/ongoing/orchestrated-execution/orchestrated-execution-spec.md#4.3

## blocked-by
B1, B3

## State-transfer prompt
> substrate plugin repo, main, trunk-commits. Read the Spec section above. Gate is structural (grep/parity/bash -n). Keep SKILL bodies <500 lines. Commit atomically; end msg with Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>.
