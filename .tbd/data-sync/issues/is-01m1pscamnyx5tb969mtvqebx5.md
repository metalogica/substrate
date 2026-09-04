---
type: is
id: is-01m1pscamnyx5tb969mtvqebx5
title: "[B2] graph-spec Step 4.55: stamp doctrine:<id> labels from write-scope ∩ paths"
kind: feature
status: closed
priority: 2
version: 7
spec_path: docs/tasks/ongoing/doctrine-crud/doctrine-crud-spec.md
labels:
  - epic:doctrine-crud
  - group:window-5
dependencies:
  - type: blocks
    target: is-01m1pscb225qs354mgq7vvs2jw
  - type: blocks
    target: is-01m1pscbddvsgvnzxfnvdm4e06
  - type: blocks
    target: is-01m1pscbrksgrqbb20d214c5r0
  - type: blocks
    target: is-01m1psctqf6wvm23qk4g53be9w
parent_id: is-01m1ps9c5z7rzs68pv70hac2ww
created_at: 2026-09-04T18:02:32.981Z
updated_at: 2026-09-04T19:09:34.716Z
closed_at: 2026-09-04T19:09:34.716Z
close_reason: gate green — merged and verified on the integrated tip (epic:doctrine-crud, run doctrine-crud-20260904-1422)
---
## Why now
Graph-spec computes per-bead write-scopes (Step 3 creates/consumes) — the exact input
doctrine binding needs — but nothing consumes them for doctrine. Stamping doctrine:<id>
at graph time formalizes the operator's manual preload workflow on the DAG itself.
Blocked by B1 (paths: exists). Spec §3 Phase 3 / B2.

## Acceptance
- New Step 4.55 in skills/graph-spec/SKILL.md: per bead, add `doctrine:<id>` for each
  manifest entry whose paths: globs intersect the bead's write-scope (creates ∪
  modifies). Runs AFTER 4.5 (windows exist), BEFORE 4.6 (terminal node exempt from
  generic stamping — it gets no doctrine labels beyond its own special-case).
- Step 5 persistence: extra `-l "doctrine:<id>"` flags on the same tbd create line
  (:128); markdown-tracker Branch B: `doctrine:` list in frontmatter.
- New Constraints bullet; no-manifest / no-paths projects: step is a silent no-op.
- opencode/command/substrate/graph-spec.md re-translated. Repo gate green.

## State-transfer prompt
> Working in metalogica/substrate. Task: graph-spec stamps doctrine:<id> labels from
> write-scope ∩ manifest paths.
> Relevant files:
> - skills/graph-spec/SKILL.md — Step 3 (:62, write-scope capture), Step 4.5 (:83),
>   Step 4.6 (:107, exemption), Step 5 (:119-134, persistence idiom)
> - opencode/command/substrate/graph-spec.md — mirror
> Constraints — do NOT modify: edge inference (Step 4), window partition mechanics
> (4.5), the terminal-node contract (4.6).
> Verification: repo gate; the skill's worked example shows a bead with files under a
> paths: glob carrying the doctrine label, and the terminal node carrying none.
