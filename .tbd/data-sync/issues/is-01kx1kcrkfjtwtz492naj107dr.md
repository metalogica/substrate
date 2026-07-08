---
type: is
id: is-01kx1kcrkfjtwtz492naj107dr
title: bead-implementer -> group-runner (N beads, per-bead gating, ledger)
kind: task
status: closed
priority: 2
version: 6
labels:
  - epic:orchestrated-execution
dependencies:
  - type: blocks
    target: is-01kx1kcvfypdwvgyv9qbfgb8ea
  - type: blocks
    target: is-01kx1kcz1kxx8jvc2n86m3emat
parent_id: is-01kx1kacgks16j4ddk86vt5ps1
created_at: 2026-07-08T19:31:05.454Z
updated_at: 2026-07-08T20:34:57.807Z
closed_at: 2026-07-08T20:34:57.807Z
close_reason: null
---
## Acceptance criterion
Generalize to N-bead group; sequential implement->gate per bead, stop-on-fail; per-bead pass/fail ledger in report; retain permission.task: deny + no-tbd/no-push.

## Gate (structural — plugin repo, no compile/test)
- `grep -qi "group of N\|group-runner\|each bead in" agents/bead-implementer.md`
- `grep -qi "deny" agents/bead-implementer.md`

## Files
- agents/bead-implementer.md

## Spec
docs/tasks/ongoing/orchestrated-execution/orchestrated-execution-spec.md#4.5

## blocked-by
B1

## State-transfer prompt
> substrate plugin repo, main, trunk-commits. Read the Spec section above. Gate is structural (grep/parity/bash -n). Keep SKILL bodies <500 lines. Commit atomically; end msg with Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>.
