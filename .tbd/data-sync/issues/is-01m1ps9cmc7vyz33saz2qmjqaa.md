---
type: is
id: is-01m1ps9cmc7vyz33saz2qmjqaa
title: "[A1] add-doctrine stub sheds history metadata (Change Log/Version/Date → Last verified)"
kind: task
status: closed
priority: 2
version: 9
spec_path: docs/tasks/ongoing/doctrine-crud/doctrine-crud-spec.md
labels:
  - epic:doctrine-crud
  - group:window-1
dependencies:
  - type: blocks
    target: is-01m1ps9d4ewxyz1zb89vww165n
  - type: blocks
    target: is-01m1psb44k0wgb53t54k8v8e20
  - type: blocks
    target: is-01m1psb4g82k24mbnehym6x33d
  - type: blocks
    target: is-01m1psb4vkxvpm6r073rdz0j8s
  - type: blocks
    target: is-01m1psb571st0ez8jf7w9080kv
  - type: blocks
    target: is-01m1psctqf6wvm23qk4g53be9w
parent_id: is-01m1ps9c5z7rzs68pv70hac2ww
created_at: 2026-09-04T18:00:56.715Z
updated_at: 2026-09-04T19:09:34.633Z
closed_at: 2026-09-04T19:09:34.632Z
close_reason: gate green — merged and verified on the integrated tip (epic:doctrine-crud, run doctrine-crud-20260904-1422)
---
## Why now
The add-doctrine stub mandates a Change Log table + Version/Date headers that field
evidence (clawcraft: 5 heaviest doctrines never adopted the table; substrate's own
baselines frozen at 1.0.0) shows are dead-or-misfiled apparatus. Spec §3 Phase 1 / A1.

## Acceptance
- Stub (skills/add-doctrine/SKILL.md:80-133) has NO §6 Change Log, NO **Version**,
  NO **Date**; HAS `**Last verified**: <today>`; sections renumbered.
- New constraint: MUST NOT emit changelog/version headers in a doctrine stub.
- opencode/command/substrate/add-doctrine.md re-translated (parity rule).
- Repo gate green.

## State-transfer prompt
> Working in metalogica/substrate. Task: strip history metadata from the doctrine stub
> that /substrate:add-doctrine scaffolds, replacing it with a Last-verified attestation.
> Relevant files:
> - skills/add-doctrine/SKILL.md:80-133 — the Step-3 stub template (the target)
> - skills/add-doctrine/SKILL.md ##Constraints — add the MUST-NOT
> - opencode/command/substrate/add-doctrine.md — mirror, re-translate same change
> Constraints — do NOT modify: Step 4 manifest writer shape; the synthesize-session
> writer-reuse contract (content stays a parameter of the writer).
> Verification: repo substrate.yaml gate; grep confirms no 'Change Log' in the stub.
