---
type: is
id: is-01m1ps9c5z7rzs68pv70hac2ww
title: "Epic: Doctrine CRUD — history to git, binding to the DAG"
kind: epic
status: closed
priority: 2
version: 16
spec_path: docs/tasks/ongoing/doctrine-crud/doctrine-crud-spec.md
labels:
  - epic:doctrine-crud
dependencies: []
child_order_hints:
  - is-01m1ps9cmc7vyz33saz2qmjqaa
  - is-01m1ps9d4ewxyz1zb89vww165n
  - is-01m1psa24nvaqbvw5p4x7nwnr7
  - is-01m1psa2fvsznem9a1afs855je
  - is-01m1psa2v0416qmfb6qb0fqgh4
  - is-01m1psb44k0wgb53t54k8v8e20
  - is-01m1psb4g82k24mbnehym6x33d
  - is-01m1psb4vkxvpm6r073rdz0j8s
  - is-01m1psb571st0ez8jf7w9080kv
  - is-01m1pscamnyx5tb969mtvqebx5
  - is-01m1pscb225qs354mgq7vvs2jw
  - is-01m1pscbddvsgvnzxfnvdm4e06
  - is-01m1pscbrksgrqbb20d214c5r0
  - is-01m1psctqf6wvm23qk4g53be9w
created_at: 2026-09-04T18:00:56.255Z
updated_at: 2026-09-04T19:09:39.383Z
closed_at: 2026-09-04T19:09:39.382Z
close_reason: all 14 child beads merged, verified, and closed; epic landed as one squash on main
---
Redesign of substrate's doctrine CRUD, graphed from the 2026-09-03/04 assessment session.

Through-line: doctrine-change HISTORY moves to git (living docs get current-state-only +
a machine-maintainable `Last verified` attestation); doctrine LOADING moves from
late/pull (runtime trigger-match) to early/push (graph-spec stamps `doctrine:<id>`
labels from write-scope ∩ manifest `paths:`; dispatchers inline a Binding-Rules digest).
Plus: a --retire path completes the missing D, and synthesize-session gains
bound-vs-cited telemetry.

## Preconditions (before /substrate:orchestrate — NOT before bead work planning)
- Merge feat/doctrine-ambient-skills (be283dd) — D1 sweeps ambient stubs via
  doctrine-skills-sync.sh; A2's rule numbering follows its lint rule 4.
- Merge feat/serve-local-mode (2c653bf) — B4's target skills/serve-bead/SKILL.md
  exists only there.

Spec: docs/tasks/ongoing/doctrine-crud/doctrine-crud-spec.md
Wave shape: 5 waves / 9 windows / 13 children + this epic.
