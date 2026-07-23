---
type: is
id: is-01kxm8e7yp30k8cp9rbc7bd1jg
title: Update two ongoing specs still describing old Doctrine Review detect-and-queue phase
kind: task
status: open
priority: 2
version: 1
labels:
  - followup
dependencies: []
created_at: 2026-07-16T01:25:13.812Z
updated_at: 2026-07-16T01:25:13.812Z
---
Two in-flight specs still describe the pre-reconciliation "Phase N: Doctrine Review" detect-and-queue model (write doctrine-amendments.md, copy to docs/tasks/ongoing/doctrine-updates/):

- docs/tasks/ongoing/agnostic-core/agnostic-core-spec.md (Phase 9, §4.6 refs)
- docs/tasks/ongoing/formalize-tbd/formalize-tbd-spec.md (Phase 8)

Not urgent: graph-spec Step 4.6 now force-synthesizes the terminal kind:doctrine-reconciliation node even when a spec lacks it, so the executor self-heals. But the spec prose is stale. Update these two specs' final phase to the apply-and-gate (ratify-only) reconciliation model per references/sdd-protocol/templates/spec-template.md §Phase N, or re-graph them.

Origin: doctrine-reconciliation change (docs/tasks/completed/doctrine-reconciliation/).
