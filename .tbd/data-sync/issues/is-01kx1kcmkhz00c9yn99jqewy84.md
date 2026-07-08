---
type: is
id: is-01kx1kcmkhz00c9yn99jqewy84
title: "Doctrine: Grouping & windows + group-runner role + state contracts"
kind: task
status: closed
priority: 2
version: 10
labels:
  - epic:orchestrated-execution
dependencies:
  - type: blocks
    target: is-01kx1kcnjqvjc2p5rvjh4t7pmk
  - type: blocks
    target: is-01kx1kcpf6k0wanrjjzjws63z9
  - type: blocks
    target: is-01kx1kcqfcmrp0z69k1by3t5w7
  - type: blocks
    target: is-01kx1kcrkfjtwtz492naj107dr
  - type: blocks
    target: is-01kx1kcsqgnpxn6erxf3dvvz3p
  - type: blocks
    target: is-01kx1kcvfypdwvgyv9qbfgb8ea
parent_id: is-01kx1kacgks16j4ddk86vt5ps1
created_at: 2026-07-08T19:31:01.361Z
updated_at: 2026-07-08T20:34:53.260Z
closed_at: 2026-07-08T20:34:53.259Z
close_reason: null
---
## Acceptance criterion
New "Grouping & windows" section between Roles and Policies; group-runner role; within/across-group tip re-sync; group:<window-N> label + execution-state.json schema documented; prior invariants restated intact.

## Gate (structural — plugin repo, no compile/test)
- `grep -q "Grouping & windows" references/docs-core/docs/doctrine/agents-parallel-execution-doctrine.md`
- `grep -q "group-runner" references/docs-core/docs/doctrine/agents-parallel-execution-doctrine.md`

## Files
- references/docs-core/docs/doctrine/agents-parallel-execution-doctrine.md

## Spec
docs/tasks/ongoing/orchestrated-execution/orchestrated-execution-spec.md#4.1

## blocked-by
(none)

## State-transfer prompt
> substrate plugin repo, main, trunk-commits. Read the Spec section above. Gate is structural (grep/parity/bash -n). Keep SKILL bodies <500 lines. Commit atomically; end msg with Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>.
