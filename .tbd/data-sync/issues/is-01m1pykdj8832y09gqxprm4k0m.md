---
type: is
id: is-01m1pykdj8832y09gqxprm4k0m
title: "[open-question] Should skill-authoring be a registered doctrine, or is CLAUDE.md the right home?"
kind: task
status: open
priority: 4
version: 1
spec_path: docs/tasks/ongoing/doctrine-crud/doctrine-crud-spec.md
labels:
  - src:synth-doctrine-crud
  - open-question
dependencies: []
created_at: 2026-09-04T19:33:48.231Z
updated_at: 2026-09-04T19:33:48.231Z
---
---
originating-spec: docs/tasks/ongoing/doctrine-crud/doctrine-crud-spec.md
originating-session: 2026-09-04
status: parked
---

## The question
substrate has a doctrine *on doctrines* (`agents-doctrine.md`) and one on parallel execution. It has
none on **authoring skills** — yet the rules governing `skills/**` are real, binding, and were load-
bearing in every window of epic:doctrine-crud:

- the parity rule (every `opencode/command/substrate/<name>.md` is a translation of
  `skills/<name>/SKILL.md`, re-translated in the same change)
- the ~500-line SKILL-body cap + progressive disclosure (bulk goes to `references/`)
- the description/body split (descriptions are always in context; bodies load on invoke) — which is
  precisely the split bead C1 borrowed to justify the doctrine *digest* tier
- decimal step inserts rather than renumbering, because `.substrate/synthesis-state.json`
  `completed-steps` pins step identity (adopt used 7.5; graph-spec 4.55; synthesize-session 6.5)

All of it lives as prose in `CLAUDE.md`. Nothing is registered in the manifest, so nothing carries
`paths:`, so a bead editing `skills/**` receives no `doctrine:<id>` stamp and dispatch pushes it no
digest — the exact gap the epic's whole binding half was built to close, left open on the repo's
largest authored surface.

**Should skill-authoring become a registered doctrine, or is CLAUDE.md the right home?**

## Why parked
Not drift, and not a gap Step 4b may fill: no axis was *introduced* this session — `skills/` predates
it — so authoring one here would be inventing scope rather than capturing session learning.

The genuine tension is duplication. CLAUDE.md is loaded every session for free; a doctrine is loaded
on binding. Promoting these rules means either moving them (CLAUDE.md gets thinner but loses
always-on coverage of its most-edited tree) or mirroring them (two homes for one fact — the precise
failure mode `agents-doctrine.md` §2 now forbids, as of this same epic).

## When to revisit
The next epic whose write-scope is mostly `skills/**`, or the first time a group-runner violates the
parity rule or the line cap in a way the gate does not catch. Also worth reopening if the
gate-coverage bead lands a mechanical parity/line-count check — enforcement without a doctrine may
be enough, which would settle this as "CLAUDE.md is the right home".
