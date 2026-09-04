---
type: is
id: is-01m1psb4g82k24mbnehym6x33d
title: "[B1] Manifest gains paths: — governed-file globs (schema + writer + lint)"
kind: feature
status: closed
priority: 2
version: 6
spec_path: docs/tasks/ongoing/doctrine-crud/doctrine-crud-spec.md
labels:
  - epic:doctrine-crud
  - group:window-4
dependencies:
  - type: blocks
    target: is-01m1psb4vkxvpm6r073rdz0j8s
  - type: blocks
    target: is-01m1pscamnyx5tb969mtvqebx5
  - type: blocks
    target: is-01m1psctqf6wvm23qk4g53be9w
parent_id: is-01m1ps9c5z7rzs68pv70hac2ww
created_at: 2026-09-04T18:01:53.927Z
updated_at: 2026-09-04T19:09:34.700Z
closed_at: 2026-09-04T19:09:34.700Z
close_reason: gate green — merged and verified on the integrated tip (epic:doctrine-crud, run doctrine-crud-20260904-1422)
---
## Why now
Trigger keywords match briefs (prose); nothing in the manifest can match a bead's
write-scope (files). `paths:` is the key graph-time binding needs. Verified absent from
the schema today (architect-spec SKILL:72-80, add-doctrine writer :151-161).
Blocked by A1/A2 (same-file serialization on add-doctrine + agents-doctrine/lint).
Spec §3 Phase 2 / B1.

## Acceptance
- Manifest schema documents optional `paths:` (list of governed-file globs) in
  agents-doctrine.md §3 + the docs-core manifest header comment.
- add-doctrine Q&A gains a paths question (default-escape: omit) and the writer entry
  line emits `paths: [glob, ...]` when given.
- doctrine-lint validates each declared glob matches ≥1 existing file (rename-rot guard).
- opencode add-doctrine mirror re-translated. Repo gate green.

## State-transfer prompt
> Working in metalogica/substrate. Task: add the optional `paths:` manifest key
> end-to-end (docs, writer, lint).
> Relevant files:
> - references/docs-core/docs/doctrine/agents-doctrine.md §3 — schema doc
> - references/docs-core/docs/doctrine/doctrine-manifest.yaml — header comment
> - skills/add-doctrine/SKILL.md Step 2 Q&A + Step 4 entry shape (:151-161) + mirror
> - references/docs-core/docs/scripts/doctrine-lint.sh — glob-resolves check
> Constraints — do NOT modify: existing entry fields; triggers semantics.
> Verification: repo gate; fixture manifest with a non-matching glob turns lint red.
