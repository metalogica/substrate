---
type: is
id: is-01m1pscb225qs354mgq7vvs2jw
title: "[B3] orchestrate/bead-implementer: inline per-window doctrine digest at dispatch"
kind: feature
status: closed
priority: 2
version: 4
spec_path: docs/tasks/ongoing/doctrine-crud/doctrine-crud-spec.md
labels:
  - epic:doctrine-crud
  - group:window-6
dependencies:
  - type: blocks
    target: is-01m1psctqf6wvm23qk4g53be9w
parent_id: is-01m1ps9c5z7rzs68pv70hac2ww
created_at: 2026-09-04T18:02:33.409Z
updated_at: 2026-09-04T19:09:34.721Z
closed_at: 2026-09-04T19:09:34.721Z
close_reason: gate green — merged and verified on the integrated tip (epic:doctrine-crud, run doctrine-crud-20260904-1422)
---
## Why now
Doctrine reaches group-runners today only as a CLAUDE.md pointer they must chase
(bead-implementer.md:42) — unverifiable pull. With doctrine:<id> on the beads (B2) and
a digest extractor (C1), the orchestrator can PUSH guaranteed-in-context rules.
Spec §3 Phase 4 / B3.

## Acceptance
- skills/orchestrate/SKILL.md Step 5c.5: new bullet between the bead tuples (:183) and
  the CLAUDE.md pointer (:184) — inline the union of the window's doctrine:<id> digests
  (docs/scripts/doctrine-digest.sh output); when one bead's write-scope majority falls
  inside a single doctrine's paths:, inline that doctrine's FULL body for that bead's
  tuple instead; demote/qualify the CLAUDE.md bullet accordingly.
- agents/bead-implementer.md Input contract (:32-43): matching new item ("Doctrine
  digest(s) — binding rules for this window; follow them; do not re-fetch").
- opencode mirrors (orchestrate command + bead-implementer agent) re-translated.
- Unlabeled beads / absent digest script: dispatch composes exactly as today (no-op).
- Repo gate green.

## State-transfer prompt
> Working in metalogica/substrate. Task: orchestrate inlines per-window doctrine
> digests into group-runner dispatch.
> Relevant files:
> - skills/orchestrate/SKILL.md:182-186 — Step 5c.5 dispatch composition
> - agents/bead-implementer.md:32-43 — Input contract (+ :52 "Follow the repo's
>   doctrine" line to align)
> - opencode/command/substrate/orchestrate.md + opencode/agent/bead-implementer.md
> Constraints — do NOT modify: single-writer tracker rules; tuple format fields;
> permission.task: deny on the runner.
> Verification: repo gate; the skill's dispatch example shows digest text inline for a
> labeled window and unchanged composition for an unlabeled one.
