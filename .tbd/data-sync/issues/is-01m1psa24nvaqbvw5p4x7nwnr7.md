---
type: is
id: is-01m1psa24nvaqbvw5p4x7nwnr7
title: "[A3] Strip dead Version headers from the three baseline doctrines"
kind: chore
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
created_at: 2026-09-04T18:01:18.741Z
updated_at: 2026-09-04T19:09:34.665Z
closed_at: 2026-09-04T19:09:34.665Z
close_reason: gate green — merged and verified on the integrated tip (epic:doctrine-crud, run doctrine-crud-20260904-1422)
---
## Why now
The three baseline doctrines carry `**Version**: 1.0.0` headers that have never been
bumped — dead apparatus and drift-bait for the Gate-2 eval. Spec §3 Phase 1 / A3.

## Acceptance
- No `**Version**` line in references/doctrines/{domain,backend,frontend}-doctrine.md.
- Nothing else in those files changes. Repo gate green.

## State-transfer prompt
> Working in metalogica/substrate. Task: delete the `**Version**: 1.0.0` header line
> from the three files under references/doctrines/. One-line-per-file change.
> Verification: grep -rn '\*\*Version\*\*' references/doctrines/ returns nothing.
