---
type: is
id: is-01kx1kcpf6k0wanrjjzjws63z9
title: "Add execution: block to substrate.yaml emission"
kind: task
status: closed
priority: 2
version: 5
labels:
  - epic:orchestrated-execution
dependencies:
  - type: blocks
    target: is-01kx1kcsqgnpxn6erxf3dvvz3p
parent_id: is-01kx1kacgks16j4ddk86vt5ps1
created_at: 2026-07-08T19:31:03.269Z
updated_at: 2026-07-08T20:34:55.545Z
closed_at: 2026-07-08T20:34:55.544Z
close_reason: null
---
## Acceptance criterion
adopt emits substrate.yaml with an execution: block (context-budget, default-rung) sibling to worktree-seed/toolchain-pin.

## Gate (structural — plugin repo, no compile/test)
- `grep -q "execution:" skills/adopt/SKILL.md`
- `grep -q "context-budget" skills/adopt/SKILL.md`

## Files
- skills/adopt/SKILL.md

## Spec
docs/tasks/ongoing/orchestrated-execution/orchestrated-execution-spec.md#4.2

## blocked-by
B1

## State-transfer prompt
> substrate plugin repo, main, trunk-commits. Read the Spec section above. Gate is structural (grep/parity/bash -n). Keep SKILL bodies <500 lines. Commit atomically; end msg with Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>.
