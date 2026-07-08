---
type: is
id: is-01kx1s4dmmta5x30x031cf3xjp
title: "[followup] graph-spec+orchestrate: destructive-migration / serial-spine annotation"
kind: task
status: open
priority: 3
version: 1
labels:
  - epic:orchestrated-execution
  - followup
dependencies: []
parent_id: is-01kx1kacgks16j4ddk86vt5ps1
created_at: 2026-07-08T21:11:23.540Z
updated_at: 2026-07-08T21:11:23.540Z
---
[followup] From the orchestrate review (keylark slice-5 audit). Low bite now (keylark migrations are append-only, key-qhc5); would bite a future re-root slice.

## Goal
Neither graph-spec nor orchestrate annotates a destructive (non-additive) migration or a forced
serial spine. A bead that re-roots a migration must never run parallel to, or merge ahead of, work
depending on the old root, but nothing marks it. The file-disjoint guard can't see a semantic hazard
with no file overlap.

## Files
- skills/graph-spec/SKILL.md (Step 3: a destructive / serial-spine tag)
- skills/orchestrate/SKILL.md (honor the tag: run such a bead alone in its wave)
- opencode/command/substrate/{graph-spec,orchestrate}.md (parity)
- references/docs-core/docs/doctrine/agents-parallel-execution-doctrine.md (rationale)

## Gate (structural)
- grep: graph-spec can tag a bead destructive/serial-spine; orchestrate serializes it
- parity comm empty

## State-transfer
graph-spec detects (or accepts a spec annotation for) a destructive-migration/serial-spine bead and
tags it; orchestrate then runs it alone in its wave (no sibling windows) - a semantic analogue of the
file-disjoint guard.
