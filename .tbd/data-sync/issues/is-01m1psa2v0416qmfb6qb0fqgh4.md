---
type: is
id: is-01m1psa2v0416qmfb6qb0fqgh4
title: "[A5] synthesize-session draft header: drop Version, add Last verified"
kind: chore
status: closed
priority: 2
version: 5
spec_path: docs/tasks/ongoing/doctrine-crud/doctrine-crud-spec.md
labels:
  - epic:doctrine-crud
  - group:window-3
dependencies:
  - type: blocks
    target: is-01m1pscbrksgrqbb20d214c5r0
  - type: blocks
    target: is-01m1psctqf6wvm23qk4g53be9w
parent_id: is-01m1ps9c5z7rzs68pv70hac2ww
created_at: 2026-09-04T18:01:19.455Z
updated_at: 2026-09-04T19:09:34.689Z
closed_at: 2026-09-04T19:09:34.689Z
close_reason: gate green — merged and verified on the integrated tip (epic:doctrine-crud, run doctrine-crud-20260904-1422)
---
## Why now
synthesize-session Step 4b dictates `**Version**: 0.1.0` in the draft-doctrine header it
writes — the last emitter of the dead field once [A1] lands. Spec §3 Phase 1 / A5.

## Acceptance
- skills/synthesize-session/SKILL.md:232 header spec becomes Status: Draft +
  Last verified: <date> (no Version). Any other in-file mentions of the draft header
  updated consistently. opencode mirror re-translated. Repo gate green.

## State-transfer prompt
> Working in metalogica/substrate. Task: drop **Version** from the draft-doctrine header
> synthesize-session dictates; add **Last verified**.
> Relevant files:
> - skills/synthesize-session/SKILL.md:232 ("Header stays **Status**: Draft,
>   **Version**: 0.1.0 …") and its Step-8 review-line at ~:475
> - opencode/command/substrate/synthesize-session.md — mirror
> Constraints — do NOT modify: the writer-reuse contract with add-doctrine.
> Verification: repo gate; grep 'Version' in both files shows no draft-header mention.
