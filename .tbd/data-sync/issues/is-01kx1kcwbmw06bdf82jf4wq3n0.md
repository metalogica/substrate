---
type: is
id: is-01kx1kcwbmw06bdf82jf4wq3n0
title: execute -> attended single-window mode
kind: task
status: closed
priority: 2
version: 7
labels:
  - epic:orchestrated-execution
dependencies:
  - type: blocks
    target: is-01kx1kcx8gn2hj5234ymxggn23
  - type: blocks
    target: is-01kx1kcy4da3pjs7k17x623765
  - type: blocks
    target: is-01kx1kcz1kxx8jvc2n86m3emat
parent_id: is-01kx1kacgks16j4ddk86vt5ps1
created_at: 2026-07-08T19:31:09.299Z
updated_at: 2026-07-08T20:35:02.365Z
closed_at: 2026-07-08T20:35:02.365Z
close_reason: null
---
## Acceptance criterion
Rescope execute to attended (one implementing agent, phase-gate pauses, human co-pilots); orchestrated is default; update description + when-to-use.

## Gate (structural — plugin repo, no compile/test)
- `grep -qi "attended" skills/execute/SKILL.md`
- `grep -qi "orchestrate" skills/execute/SKILL.md`

## Files
- skills/execute/SKILL.md

## Spec
docs/tasks/ongoing/orchestrated-execution/orchestrated-execution-spec.md#4.7

## blocked-by
B8

## State-transfer prompt
> substrate plugin repo, main, trunk-commits. Read the Spec section above. Gate is structural (grep/parity/bash -n). Keep SKILL bodies <500 lines. Commit atomically; end msg with Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>.
