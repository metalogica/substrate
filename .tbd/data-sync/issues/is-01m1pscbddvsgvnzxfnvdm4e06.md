---
type: is
id: is-01m1pscbddvsgvnzxfnvdm4e06
title: "[B4] serve-bead: bind doctrine by label first, trigger-match fallback"
kind: task
status: closed
priority: 2
version: 4
spec_path: docs/tasks/ongoing/doctrine-crud/doctrine-crud-spec.md
labels:
  - epic:doctrine-crud
  - group:window-7
dependencies:
  - type: blocks
    target: is-01m1psctqf6wvm23qk4g53be9w
parent_id: is-01m1ps9c5z7rzs68pv70hac2ww
created_at: 2026-09-04T18:02:33.772Z
updated_at: 2026-09-04T19:09:34.726Z
closed_at: 2026-09-04T19:09:34.726Z
close_reason: gate green — merged and verified on the integrated tip (epic:doctrine-crud, run doctrine-crud-20260904-1422)
---
## Why now
serve-bead Step 1 item 4 has the worker glob docs/doctrine/ and GUESS relevance from
trigger keywords vs the bead title — weak matching, discovery cost per headless session.
The bead's doctrine:<id> labels (B2) already reach the session via the dispatch
prompt's Labels line (daemon lanePrompt) — zero daemon code change needed.
PRECONDITION: feat/serve-local-mode (2c653bf) merged — the target file exists only
there. Spec §3 Phase 4 / B4.

## Acceptance
- skills/serve-bead/SKILL.md Step 1 item 4: read the doctrines named by the bead's
  doctrine:<id> labels FIRST (resolve id via manifest, else docs/doctrine/<id>-doctrine.md);
  trigger-match/glob remains the fallback for unlabeled beads.
- opencode/command/substrate/serve-bead.md re-translated. Repo gate green.

## State-transfer prompt
> Working in metalogica/substrate, AFTER feat/serve-local-mode is merged. Task:
> serve-bead binds doctrine by label first.
> Relevant files:
> - skills/serve-bead/SKILL.md Step 1 (read-order list, item 4) — currently: "the 1–3
>   doctrines whose names or triggers match the bead"
> - opencode/command/substrate/serve-bead.md — mirror
> - daemon/src/triage.ts lanePrompt — context only (Labels already flow; do not edit)
> Constraints — do NOT modify: the daemon; the refuse/gate arms of the skill.
> Verification: repo gate; Step 1 text names the label-first order + fallback.
