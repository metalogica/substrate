---
type: is
id: is-01m1psa2fvsznem9a1afs855je
title: "[A4] adopt: harvest-then-delete pre-existing changelogs in target doctrines"
kind: task
status: closed
priority: 2
version: 5
spec_path: docs/tasks/ongoing/doctrine-crud/doctrine-crud-spec.md
labels:
  - epic:doctrine-crud
  - group:window-2
dependencies:
  - type: blocks
    target: is-01m1psb44k0wgb53t54k8v8e20
  - type: blocks
    target: is-01m1psctqf6wvm23qk4g53be9w
parent_id: is-01m1ps9c5z7rzs68pv70hac2ww
created_at: 2026-09-04T18:01:19.098Z
updated_at: 2026-09-04T19:09:34.670Z
closed_at: 2026-09-04T19:09:34.670Z
close_reason: gate green — merged and verified on the integrated tip (epic:doctrine-crud, run doctrine-crud-20260904-1422)
---
## Why now
Once [A2]'s lint rule ships, any adopted repo whose existing doctrines carry changelogs
would fail its own gate — adopt must harvest first so it keeps its "leaves doctrine-lint
green" promise. Harvest is re-indexing, not deletion: rationale-bearing rows (cf.
clawcraft treasury 1.4.0) move inline to the section they cite. Spec §3 Phase 1 / A4.

## Acceptance
- New adopt step (between Steps 5 and 8): detect `## Change Log` / `**Version**` in the
  TARGET repo's doctrines; per row, if its why-narrative is absent at the cited section,
  fold it inline as a why-note; delete table+headers; removal commit body carries the
  harvested table verbatim; user confirms before deletion (fail-fast on decline).
- opencode/command/substrate/adopt.md re-translated. Repo gate green.

## State-transfer prompt
> Working in metalogica/substrate. Task: add a harvest-then-delete step to
> /substrate:adopt for pre-existing changelogs in target-repo doctrines.
> Relevant files:
> - skills/adopt/SKILL.md Steps 5–8 — insertion point (before the Step-8 green gate)
> - opencode/command/substrate/adopt.md — mirror
> Reference example of a rationale-dense row worth folding inline: clawcraft
> treasury-doctrine §9 row 1.4.0 (stale-vs-gap 409/422 narrative).
> Constraints — do NOT modify: adopt's existing kernel-copy or tbd-init steps.
> Verification: repo gate; the step's narrative covers rows-with-rationale, rows-without,
> and the decline path.
