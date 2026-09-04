---
type: is
id: is-01m1pyk6ypv91ycg1hvc0h4pwa
title: Harvest and delete the legacy docs/tasks/ongoing/doctrine-updates/ amendment queue
kind: chore
status: open
priority: 3
version: 1
spec_path: docs/tasks/ongoing/doctrine-crud/doctrine-crud-spec.md
labels:
  - src:synth-doctrine-crud
dependencies: []
created_at: 2026-09-04T19:33:41.461Z
updated_at: 2026-09-04T19:33:41.461Z
---
---
originating-spec: docs/tasks/ongoing/doctrine-crud/doctrine-crud-spec.md
originating-session: 2026-09-04
cross-repo: in-repo
effort: XS
---

## Why now (session signal)
`docs/tasks/ongoing/doctrine-updates/orchestrated-execution-amendments.md` is a surviving artifact of
the retired detect-and-queue doctrine model. `/substrate:synthesize-session` now forbids it **by
name**, twice:

    skills/synthesize-session/SKILL.md:256  — "no file under `docs/tasks/ongoing/doctrine-updates/`"
    skills/synthesize-session/SKILL.md:555  — MUST NOT ... "no `docs/tasks/ongoing/doctrine-updates/`
                                              file. Do not reintroduce the queue under any tracker."

So the repo ships a skill whose binding constraint its own working tree violates. The file's only
live content — observation A1, "orchestrate has no task-archival step but synthesize-session
presumes one" — is already tracked as bead sub-vk7c, which fired again during this session.

## Acceptance criterion
`docs/tasks/ongoing/doctrine-updates/` no longer exists. Any observation in it not already tracked is
filed as an ordinary bead first; the removal commit body carries the file verbatim (same
harvest-then-delete discipline epic:doctrine-crud just established for doctrine changelogs).

## Notes
Check A2 and A3 in that file before deleting — only A1 was confirmed as already-tracked
(sub-vk7c). Near-miss with sub-c04c ("Update two ongoing specs still describing old Doctrine Review
detect-and-queue phase"): same retired model, different artifacts. Sequence them together if
convenient; they are not the same bead.

## Dependencies
- blocked-by: []

## State-transfer prompt
> Working in metalogica/substrate. Task: harvest and delete the legacy doctrine-amendment queue file.
> Relevant files:
> - docs/tasks/ongoing/doctrine-updates/orchestrated-execution-amendments.md — the file; read all
>   three observations (A1/A2/A3) before removing
> - skills/synthesize-session/SKILL.md:256 and :555 — the constraint it violates
> Relevant prior commits:
> - 753ec9c — epic:doctrine-crud, which established harvest-then-delete as the pattern for removing
>   an append-only record from a living tree (see skills/adopt/SKILL.md Step 7.5)
> Constraints — do NOT delete an observation that is not tracked elsewhere; file it as a bead first.
> Verification:
> - test ! -d docs/tasks/ongoing/doctrine-updates
> - grep -rn 'doctrine-updates' skills/ opencode/   # only the two prohibition lines remain
