---
type: is
id: is-01kx1kcvfypdwvgyv9qbfgb8ea
title: "orchestrate: consume partition + deviation log + execution-state.json + primary door"
kind: task
status: closed
priority: 2
version: 9
labels:
  - epic:orchestrated-execution
dependencies:
  - type: blocks
    target: is-01kx1kcwbmw06bdf82jf4wq3n0
  - type: blocks
    target: is-01kx1kcx8gn2hj5234ymxggn23
  - type: blocks
    target: is-01kx1kcy4da3pjs7k17x623765
  - type: blocks
    target: is-01kx1kcz1kxx8jvc2n86m3emat
  - type: blocks
    target: is-01kx1kd0sx8a8jzdctce4x7ag9
parent_id: is-01kx1kacgks16j4ddk86vt5ps1
created_at: 2026-07-08T19:31:08.414Z
updated_at: 2026-07-08T20:35:01.492Z
closed_at: 2026-07-08T20:35:01.491Z
close_reason: null
---
## Acceptance criterion
Read group: labels; dispatch one group-runner per window (one worktree/seed per group); log deviations to .substrate/runs; write execution-state.json before trunk squash; broaden to primary door.

## Gate (structural — plugin repo, no compile/test)
- `grep -q "execution-state.json" skills/orchestrate/SKILL.md`
- `grep -q "group:" skills/orchestrate/SKILL.md`
- `grep -qi "primary" skills/orchestrate/SKILL.md`

## Files
- skills/orchestrate/SKILL.md

## Spec
docs/tasks/ongoing/orchestrated-execution/orchestrated-execution-spec.md#4.6

## blocked-by
B1, B5, B6

## State-transfer prompt
> substrate plugin repo, main, trunk-commits. Read the Spec section above. Gate is structural (grep/parity/bash -n). Keep SKILL bodies <500 lines. Commit atomically; end msg with Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>.
