---
type: is
id: is-01ky6dms50fe9q5waepv2r7p21
title: Full-lifecycle E2E drill on scratch repo (operator-attended)
kind: task
status: open
priority: 2
version: 3
labels:
  - epic:serve-v1
  - group:window-7
dependencies:
  - type: blocks
    target: is-01ky6dmwp06b4qw21mkfh8befa
parent_id: is-01ky6dm7cmm0kzaza6379jer1p
created_at: 2026-07-23T02:42:30.688Z
updated_at: 2026-07-23T05:02:51.881Z
---
Goal: groomed -> claim -> route -> build -> PR -> comment -> actualize -> merge -> tidy -> closed bead; plus bounce path; plus Ctrl-C mid-tick. Record checklist in this bead's notes (spec 7.1).
Files: none (drill).
Gate: OUT-OF-BAND entirely (operator + scratch GitHub repo). Policy-4: leave open until checklist complete.
Consumes: b13 assembled loop.
spec: docs/tasks/ongoing/serve-v1/serve-v1-spec.md#phase-7-step-7.1

## Notes

OUT-OF-BAND (no code): full-lifecycle operator drill on a scratch GitHub repo — groomed->claim->route->build->PR->comment->actualize->merge->tidy->closed, plus bounce path, plus Ctrl-C mid-tick. Assembled loop merged (tip 0ab30c9). Awaiting operator; record checklist in this bead per spec 7.1.
