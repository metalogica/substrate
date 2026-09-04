---
type: is
id: is-01m1psctqf6wvm23qk4g53be9w
title: "[R] Terminal doctrine reconciliation (ratify-only)"
kind: task
status: closed
priority: 2
version: 3
spec_path: docs/tasks/ongoing/doctrine-crud/doctrine-crud-spec.md
labels:
  - epic:doctrine-crud
  - group:window-9
  - kind:doctrine-reconciliation
dependencies: []
parent_id: is-01m1ps9c5z7rzs68pv70hac2ww
created_at: 2026-09-04T18:02:49.455Z
updated_at: 2026-09-04T19:09:34.738Z
closed_at: 2026-09-04T19:09:34.738Z
close_reason: gate green — merged and verified on the integrated tip (epic:doctrine-crud, run doctrine-crud-20260904-1422)
---
## Why now
Terminal node per graph-spec Step 4.6 — the epic's in-epic sink for doctrine change,
ratify-only. This epic EDITS the doctrine system itself, so reconciliation checks the
meta-level: do the agents-doctrine sections shipped by A2/B1/C1/F1 agree with the
scripts and skills that actually landed? Spec §3 Phase 5 / R.

## Acceptance
- Against the fully-integrated epic: agents-doctrine §§1.1/2/3/5/6/8 statements match
  the shipped lint rules (4+5), sync/digest scripts, paths: schema, and Last-verified
  loop; discrepancies are ratify-only fixes applied to docs/doctrine copies in
  references/docs-core/. Non-ratify follow-ups become ordinary beads (never a queue).
- Write-scope: references/docs-core/docs/doctrine/** (+ docs/doctrine/** if the repo
  self-adopts by then). Repo gate green.

## State-transfer prompt
> Working in metalogica/substrate, all other epic:doctrine-crud beads closed. Task:
> ratify-only doctrine reconciliation for the doctrine-crud epic.
> Relevant files:
> - references/docs-core/docs/doctrine/agents-doctrine.md — the target
> - references/docs-core/docs/scripts/{doctrine-lint.sh,doctrine-skills-sync.sh,
>   doctrine-digest.sh} — ground truth to reconcile against
> Constraints — ratify-only: never a rule change that obliges shipped code to change;
> file those as ordinary beads instead.
> Verification: repo gate; a short reconciliation note in the commit body.
