---
type: is
id: is-01kx1kcqfcmrp0z69k1by3t5w7
title: Ignore .substrate/runs/ (templates + repo)
kind: task
status: closed
priority: 2
version: 4
labels:
  - epic:orchestrated-execution
dependencies: []
parent_id: is-01kx1kacgks16j4ddk86vt5ps1
created_at: 2026-07-08T19:31:04.300Z
updated_at: 2026-07-08T20:34:56.953Z
closed_at: 2026-07-08T20:34:56.952Z
close_reason: null
---
## Acceptance criterion
.substrate/runs/ gitignored in adopt/init emission + repo; execution-state.json stays tracked.

## Gate (structural — plugin repo, no compile/test)
- `grep -q "\.substrate/runs" references/templates/.gitignore`
- `grep -q "\.substrate/runs" .gitignore`

## Files
- references/templates/.gitignore
- .gitignore

## Spec
docs/tasks/ongoing/orchestrated-execution/orchestrated-execution-spec.md#4.2

## blocked-by
B1

## State-transfer prompt
> substrate plugin repo, main, trunk-commits. Read the Spec section above. Gate is structural (grep/parity/bash -n). Keep SKILL bodies <500 lines. Commit atomically; end msg with Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>.
