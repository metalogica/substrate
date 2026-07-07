---
type: is
id: is-01kwys60mhhfrk70erxcm4hrvz
title: "[open-question] Should the plugin repo self-adopt its kernel to dogfood orchestrate in-repo?"
kind: task
status: open
priority: 4
version: 1
labels:
  - epic:orchestrate
  - synth
  - parked
dependencies: []
parent_id: is-01kwyqmd14n7ey3kqmtfh6qvg1
created_at: 2026-07-07T17:14:32.464Z
updated_at: 2026-07-07T17:14:32.464Z
---
---
type: open-question
status: parked
epic: orchestrate
originating-spec: docs/tasks/completed/orchestrate/orchestrate-spec.md
originating-session: 2026-07-07
---

# Should the substrate plugin repo self-adopt its own kernel so orchestrate can be dogfooded in-repo?

## The question
The plugin repo keeps its meta-doctrines + scripts under `references/docs-core/docs/` (a template tree),
not at repo root. So root `docs/scripts/bead-graph.sh` and `docs/scripts/doctrine-lint.sh` do not resolve
here, and Phase 6's E2E dry-run of `/substrate:orchestrate` cannot run in-repo (no graphed epic renderable
at root). Should substrate `/substrate:adopt` itself — install a root kernel — so it can dogfood its own
orchestrate/graph-spec pipeline on its own epics? Or is the template-only layout deliberate and dogfooding
belongs exclusively in a consumer repo (keylark)?

## Why parked
No doctrine claim is at stake and nothing is currently miscoached — the template layout is intentional
(brief OQ#6 acknowledged it). The answer depends on whether in-repo dogfooding is judged worth the
duplication of a root kernel alongside the template tree.

## When to revisit
Next time someone wants to run a graphed substrate epic *in this repo* (e.g. to validate an orchestrate
change end-to-end without a separate consumer repo), or if the keylark E2E (sub-glyc) proves insufficient
as the sole behavioral proof.
