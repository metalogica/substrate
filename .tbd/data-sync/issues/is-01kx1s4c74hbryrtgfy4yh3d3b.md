---
type: is
id: is-01kx1s4c74hbryrtgfy4yh3d3b
title: "[followup] orchestrate: verify epic spec is on the integration branch before dispatch"
kind: task
status: open
priority: 3
version: 1
labels:
  - epic:orchestrated-execution
  - followup
dependencies: []
parent_id: is-01kx1kacgks16j4ddk86vt5ps1
created_at: 2026-07-08T21:11:22.083Z
updated_at: 2026-07-08T21:11:22.083Z
---
[followup] From the orchestrate review (keylark slice-5 audit). Low bite (we commit specs before orchestrate); a cheap guard.

## Goal
orchestrate dispatches group-runners into worktrees off the integration tip but never verifies the
spec file their beads back-link to (spec:<path>#<section>) actually exists on that branch before
dispatch. A graphed-but-uncommitted spec would leave a cold runner opening a spec-ref that isn't
there.

## Files
- skills/orchestrate/SKILL.md (Step 4 setup or Step 5c pre-dispatch)
- opencode/command/substrate/orchestrate.md (parity)

## Gate (structural)
- grep: orchestrate asserts the epic's spec path is tracked on feat/<epic-slug> before first dispatch
- parity comm empty

## State-transfer
After cutting feat/<epic-slug>, confirm the spec is tracked on that branch
(git cat-file -e HEAD:<spec-path>); fail-fast with an explanation if absent (repo fail-fast pref).
