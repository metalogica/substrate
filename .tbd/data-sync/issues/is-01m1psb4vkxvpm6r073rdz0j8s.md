---
type: is
id: is-01m1psb4vkxvpm6r073rdz0j8s
title: "[C1] Digest convention: §2 Binding Rules + doctrine-digest.sh extractor"
kind: task
status: closed
priority: 2
version: 6
spec_path: docs/tasks/ongoing/doctrine-crud/doctrine-crud-spec.md
labels:
  - epic:doctrine-crud
  - group:window-4
dependencies:
  - type: blocks
    target: is-01m1psb571st0ez8jf7w9080kv
  - type: blocks
    target: is-01m1pscb225qs354mgq7vvs2jw
  - type: blocks
    target: is-01m1psctqf6wvm23qk4g53be9w
parent_id: is-01m1ps9c5z7rzs68pv70hac2ww
created_at: 2026-09-04T18:01:54.290Z
updated_at: 2026-09-04T19:09:34.706Z
closed_at: 2026-09-04T19:09:34.706Z
close_reason: gate green — merged and verified on the integrated tip (epic:doctrine-crud, run doctrine-crud-20260904-1422)
---
## Why now
Inlining a 2,000-line doctrine per dispatch is the changelog problem inverted; the
digest tier (skills' description/body split applied to doctrine) makes push-at-dispatch
affordable. Blocked by A1 (§2 Binding Rules canonical in the stub), B1 (same-file
serialization). Spec §3 Phase 2 / C1.

## Acceptance
- agents-doctrine documents: §2 Binding Rules is every doctrine's extractable digest.
- New zero-dep docs/scripts/doctrine-digest.sh <id>: resolves the id via the manifest,
  prints the doctrine's §2 block (from its `## 2.`-or-`Binding Rules` heading to the
  next `## `), non-zero + actionable message when id/section missing.
- Repo gate green (script exercised against the two kernel doctrines).

## State-transfer prompt
> Working in metalogica/substrate. Task: canonize the digest convention + write the
> extractor.
> Relevant files:
> - references/docs-core/docs/scripts/doctrine-skills-sync.sh — parser idiom to reuse
>   (manifest id→path resolution in pure bash)
> - references/docs-core/docs/doctrine/agents-doctrine.md — document the convention
> - NEW references/docs-core/docs/scripts/doctrine-digest.sh
> Note: the two kernel doctrines do not use numbered `## 2.` headings — the extractor
> must handle both `## 2. Binding Rules`-style and named-heading fallback, or the
> convention section must state the required heading and the kernel doctrines gain it.
> Verification: repo gate; doctrine-digest.sh agents prints a non-empty rules block;
> unknown id exits non-zero.
