---
type: is
id: is-01kx1kcz1kxx8jvc2n86m3emat
title: OpenCode parity (graph-spec, orchestrate, execute, bead-implementer, hand-offs)
kind: task
status: closed
priority: 2
version: 5
labels:
  - epic:orchestrated-execution
dependencies:
  - type: blocks
    target: is-01kx1kczx2vn5fktpnp36zzp7v
parent_id: is-01kx1kacgks16j4ddk86vt5ps1
created_at: 2026-07-08T19:31:12.050Z
updated_at: 2026-07-08T20:35:06.042Z
closed_at: 2026-07-08T20:35:06.041Z
close_reason: null
---
## Acceptance criterion
Re-translate changed commands + agent + hand-off edits per opencode/README.md parity rule; parity audit empty.

## Gate (structural — plugin repo, no compile/test)
- `grep -qi "group\|window" opencode/command/substrate/orchestrate.md`
- `[ -z "$(comm -23 <(ls skills | sort) <(ls opencode/command/substrate | sed "s/\.md$//" | sort))" ]`

## Files
- opencode/command/substrate/{graph-spec,orchestrate,execute}.md
- opencode/agent/bead-implementer.md

## Spec
docs/tasks/ongoing/orchestrated-execution/orchestrated-execution-spec.md#4.9

## blocked-by
B5, B6, B8, B9, B10

## State-transfer prompt
> substrate plugin repo, main, trunk-commits. Read the Spec section above. Gate is structural (grep/parity/bash -n). Keep SKILL bodies <500 lines. Commit atomically; end msg with Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>.
