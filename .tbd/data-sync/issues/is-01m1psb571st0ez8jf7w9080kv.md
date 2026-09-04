---
type: is
id: is-01m1psb571st0ez8jf7w9080kv
title: "[F1] Gate-2 bumps Last verified on green pass; lint warns >6 months"
kind: task
status: closed
priority: 2
version: 4
spec_path: docs/tasks/ongoing/doctrine-crud/doctrine-crud-spec.md
labels:
  - epic:doctrine-crud
  - group:window-4
dependencies:
  - type: blocks
    target: is-01m1psctqf6wvm23qk4g53be9w
parent_id: is-01m1ps9c5z7rzs68pv70hac2ww
created_at: 2026-09-04T18:01:54.656Z
updated_at: 2026-09-04T19:09:34.711Z
closed_at: 2026-09-04T19:09:34.711Z
close_reason: gate green — merged and verified on the integrated tip (epic:doctrine-crud, run doctrine-crud-20260904-1422)
---
## Why now
Last verified is only better than a changelog if a machine maintains it — otherwise it
is one more self-reported date. Blocked by A1 (field exists), C1 (same-file
serialization on agents-doctrine). Spec §3 Phase 2 / F1.

## Acceptance
- agents-doctrine §6 (drift protocol): a green Gate-2 pass over a doctrine bumps its
  `**Last verified**` to the eval date; a red pass leaves it untouched.
- doctrine-lint WARNS (never fails) when a registered doctrine's Last verified is
  >6 months old or absent.
- Repo gate green.

## State-transfer prompt
> Working in metalogica/substrate. Task: close the freshness loop on Last verified.
> Relevant files:
> - references/docs-core/docs/doctrine/agents-doctrine.md §6 — the drift agent's
>   operating manual (add the bump step to its method + report format)
> - references/docs-core/docs/scripts/doctrine-lint.sh — warn-only staleness check
>   (date parse in pure bash/coreutils; darwin+linux compatible date handling)
> Constraints — do NOT make the staleness check a hard failure.
> Verification: repo gate; fixture doctrine dated 2025-01-01 produces a warning line
> and exit 0.
