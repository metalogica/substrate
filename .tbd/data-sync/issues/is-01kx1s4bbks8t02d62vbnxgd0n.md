---
type: is
id: is-01kx1s4bbks8t02d62vbnxgd0n
title: "[followup] orchestrate: archive ongoing->completed on epic close (amendment A1)"
kind: task
status: open
priority: 2
version: 1
labels:
  - epic:orchestrated-execution
  - followup
dependencies: []
parent_id: is-01kx1kacgks16j4ddk86vt5ps1
created_at: 2026-07-08T21:11:21.199Z
updated_at: 2026-07-08T21:11:21.199Z
---
[followup] From the orchestrate performance/reliability review (keylark slice-5 audit). Recorded as amendment A1 in docs/tasks/ongoing/doctrine-updates/orchestrated-execution-amendments.md.

## Goal
/substrate:orchestrate Step 6 lands a signed squash but does NOT archive the task dir
(docs/tasks/ongoing/<slug>/ -> docs/tasks/completed/<slug>/). The attended door
(/substrate:execute Step 5) already archives; the PRIMARY door does not, so every orchestrated
epic needs a manual git mv, and synthesize-session's precondition ("spec archived to
docs/tasks/completed/") is unmet on the orchestrate path.

## Files
- skills/orchestrate/SKILL.md (Step 6 epic-close)
- opencode/command/substrate/orchestrate.md (parity)
- references/docs-core/docs/doctrine/agents-parallel-execution-doctrine.md (Per-window dispatch checklist step 6)

## Gate (structural)
- grep: orchestrate Step 6 names `git mv docs/tasks/ongoing/<slug> docs/tasks/completed/<slug>`
- parity comm empty
- amendment A1 moved out of the doctrine-updates queue once applied

## State-transfer
Add an archive step to orchestrate Step 6, folded into the integration commit (not a separate
commit), mirroring execute Step 5. Decide whether to also offer the optional synthesize-session
hand-off (A1 proposes it). Resolve A1 in the same change.
