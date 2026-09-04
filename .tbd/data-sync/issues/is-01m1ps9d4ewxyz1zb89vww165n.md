---
type: is
id: is-01m1ps9d4ewxyz1zb89vww165n
title: "[D1] add-doctrine --retire: archive doctrine, drop manifest entry, sweep ambient stub"
kind: feature
status: closed
priority: 2
version: 4
spec_path: docs/tasks/ongoing/doctrine-crud/doctrine-crud-spec.md
labels:
  - epic:doctrine-crud
  - group:window-1
dependencies:
  - type: blocks
    target: is-01m1psctqf6wvm23qk4g53be9w
parent_id: is-01m1ps9c5z7rzs68pv70hac2ww
created_at: 2026-09-04T18:00:57.229Z
updated_at: 2026-09-04T19:09:34.659Z
closed_at: 2026-09-04T19:09:34.659Z
close_reason: gate green — merged and verified on the integrated tip (epic:doctrine-crud, run doctrine-crud-20260904-1422)
---
## Why now
Doctrine CRUD has no D: a dead doctrine keeps its binding authority and its ambient
stub forever. Spec §3 Phase 1 / D1. Precondition: feat/doctrine-ambient-skills merged
(doctrine-skills-sync.sh sweeps the stub).

## Acceptance
- /substrate:add-doctrine --retire <name>: confirm → remove manifest entry (text-edit,
  comment-preserving) → git mv doctrine to docs/doctrine/archive/ → fold still-true
  rules into surviving doctrines → run docs/scripts/doctrine-skills-sync.sh → lint green.
- opencode mirror re-translated. Repo gate green.

## State-transfer prompt
> Working in metalogica/substrate. Task: add a --retire arm to add-doctrine.
> Relevant files:
> - skills/add-doctrine/SKILL.md — add the arm (after [A1] lands; same file)
> - references/docs-core/docs/scripts/doctrine-skills-sync.sh — sweep semantics to reuse
> - references/docs-core/docs/scripts/doctrine-lint.sh — rules the end-state must satisfy
> Constraints — do NOT modify: the sync script itself; lint rules.
> Verification: repo gate; a dry-run retire narrative in the skill shows manifest entry
> gone + archive path + stub swept.
