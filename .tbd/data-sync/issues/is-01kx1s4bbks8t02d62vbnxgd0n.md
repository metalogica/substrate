---
type: is
id: is-01kx1s4bbks8t02d62vbnxgd0n
title: "[followup] orchestrate: archive ongoing->completed on epic close (amendment A1)"
kind: task
status: open
priority: 2
version: 3
labels:
  - epic:orchestrated-execution
  - followup
dependencies: []
parent_id: is-01kx1kacgks16j4ddk86vt5ps1
created_at: 2026-07-08T21:11:21.199Z
updated_at: 2026-09-04T19:34:22.700Z
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

## Notes

Update from session 2026-07-23 (epic:serve-v1 synthesis): CONFIRMED live — after orchestrate --pr merged serve-v1, the spec remains at docs/tasks/ongoing/serve-v1/ (never archived to completed/). The --pr close path in particular has no archive step. This directly cost the synthesize-session run: it had to adapt because docs/tasks/completed/serve-v1/ was absent.


The parent of this bead is:
---
type: is
id: is-01kx1kacgks16j4ddk86vt5ps1
title: "Epic: Orchestrated Execution"
kind: epic
status: open
priority: P2
version: 20
labels:
  - epic:orchestrated-execution
dependencies: []
child_order_hints:
  - is-01kx1kcmkhz00c9yn99jqewy84
  - is-01kx1kcnjqvjc2p5rvjh4t7pmk
  - is-01kx1kcpf6k0wanrjjzjws63z9
  - is-01kx1kcqfcmrp0z69k1by3t5w7
  - is-01kx1kcrkfjtwtz492naj107dr
  - is-01kx1kcsqgnpxn6erxf3dvvz3p
  - is-01kx1kctkafg5yb25axygv1vss
  - is-01kx1kcvfypdwvgyv9qbfgb8ea
  - is-01kx1kcwbmw06bdf82jf4wq3n0
  - is-01kx1kcx8gn2hj5234ymxggn23
  - is-01kx1kcy4da3pjs7k17x623765
  - is-01kx1kcz1kxx8jvc2n86m3emat
  - is-01kx1kczx2vn5fktpnp36zzp7v
  - is-01kx1kd0sx8a8jzdctce4x7ag9
  - is-01kx1s4bbks8t02d62vbnxgd0n
  - is-01kx1s4c74hbryrtgfy4yh3d3b
  - is-01kx1s4dmmta5x30x031cf3xjp
created_at: 2026-07-08T19:29:47.538Z
updated_at: 2026-07-08T21:11:23.540Z
closed_at: 2026-07-08T20:30:05.157Z
close_reason: All 14 child beads landed (13 phases via attended execute + sub-ty5d). Spec archived to docs/tasks/completed/orchestrated-execution/.
---
Spec: docs/tasks/ongoing/orchestrated-execution/orchestrated-execution-spec.md

Context-budget partition of the bead DAG into agent-sized windows; orchestration becomes the primary execution door, execute demotes to attended mode.


## Update from session 2026-09-04 (epic:doctrine-crud)

Fired again, and this time it nearly blocked the next skill in the lifecycle.

`/substrate:orchestrate` ran epic:doctrine-crud to completion — 14 beads, 5 waves, landed as
`753ec9c`, epic bead closed, `tbd sync` run — and left `docs/tasks/ongoing/doctrine-crud/` in place,
exactly as amendment A1 predicted. `/substrate:synthesize-session` invoked immediately afterwards hit
its own REFUSE row ("No feature exists at `docs/tasks/completed/<feature>/` -> Nothing to synthesize.
Did /substrate:orchestrate complete?"). It had; the archive step simply does not exist.

That is now twice (serve-v1, doctrine-crud). The serve-v1 synthesis worked around it the same way
this one did — proceed anyway, note the spec is still under `ongoing/` — so the workaround is
becoming the convention and the REFUSE row is becoming a lie.

Sharpens the fix: the archive belongs in `/substrate:orchestrate` Step 6 (epic close), next to the
terminal batch close and the `tbd sync`, since that is the point where the epic is provably done.
`/substrate:execute` Step 5 already archives; the two doors disagree, and orchestrate is the primary
one.

## Notes

Update from session 2026-07-23 (epic:serve-v1 synthesis): CONFIRMED live — after orchestrate --pr merged serve-v1, the spec remains at docs/tasks/ongoing/serve-v1/ (never archived to completed/). The --pr close path in particular has no archive step. This directly cost the synthesize-session run: it had to adapt because docs/tasks/completed/serve-v1/ was absent.
