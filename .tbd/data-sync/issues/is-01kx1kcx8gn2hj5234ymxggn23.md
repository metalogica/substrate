---
type: is
id: is-01kx1kcx8gn2hj5234ymxggn23
title: Repoint architect-spec + synthesize-session hand-offs to orchestrate
kind: task
status: closed
priority: 2
version: 5
labels:
  - epic:orchestrated-execution
dependencies:
  - type: blocks
    target: is-01kx1kcz1kxx8jvc2n86m3emat
parent_id: is-01kx1kacgks16j4ddk86vt5ps1
created_at: 2026-07-08T19:31:10.224Z
updated_at: 2026-07-08T20:35:03.813Z
closed_at: 2026-07-08T20:35:03.812Z
close_reason: null
---
## Acceptance criterion
architect-spec Step 10 hand-off defaults to /substrate:orchestrate (execute = attended alt); synthesize-session lifecycle refs updated.

## Gate (structural — plugin repo, no compile/test)
- `grep -q "orchestrate" skills/architect-spec/SKILL.md`
- `grep -qi "attended\|orchestrate" skills/synthesize-session/SKILL.md`

## Files
- skills/architect-spec/SKILL.md
- skills/synthesize-session/SKILL.md

## Spec
docs/tasks/ongoing/orchestrated-execution/orchestrated-execution-spec.md#4.8

## blocked-by
B8, B9

## State-transfer prompt
> substrate plugin repo, main, trunk-commits. Read the Spec section above. Gate is structural (grep/parity/bash -n). Keep SKILL bodies <500 lines. Commit atomically; end msg with Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>.
