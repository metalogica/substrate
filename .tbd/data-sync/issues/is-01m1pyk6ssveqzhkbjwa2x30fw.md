---
type: is
id: is-01m1pyk6ssveqzhkbjwa2x30fw
title: synthesize-session SKILL body is 574 lines — move Step 7 record templates to references/
kind: chore
status: open
priority: 2
version: 1
spec_path: docs/tasks/ongoing/doctrine-crud/doctrine-crud-spec.md
labels:
  - src:synth-doctrine-crud
dependencies: []
created_at: 2026-09-04T19:33:41.305Z
updated_at: 2026-09-04T19:33:41.305Z
---
---
originating-spec: docs/tasks/ongoing/doctrine-crud/doctrine-crud-spec.md
originating-session: 2026-09-04
cross-repo: in-repo
effort: S
---

## Why now (session signal)
`skills/synthesize-session/SKILL.md` and its opencode mirror are both **574 lines**, ~74 over
CLAUDE.md's ~500-line SKILL-body guidance. It was 533 before epic:doctrine-crud; bead E1 added the
Step 6.5 telemetry step (+43, minus a 2-line paydown in Step 5). The E1 runner flagged it, declined
to refactor (out of its window's scope), and proposed the fix.

CLAUDE.md's own progressive-disclosure principle says bulk content goes in `references/` — this file
is the largest SKILL body in the repo and is the one violating it.

## Acceptance criterion
`skills/synthesize-session/SKILL.md` and `opencode/command/substrate/synthesize-session.md` are both
under 500 lines, with no contract changed. The proposed cut: move Step 7's two large in-line record
templates (the actionable-bead record and the parked-question record, ~75 lines combined) into
`skills/synthesize-session/references/`, leaving a pointer.

## Notes
Contract-preserving move only — the record shapes are load-bearing (Step 9 renders them to tempfiles
for `tbd create --file`), so the templates must remain reachable and verbatim, just not inline.

File-disjoint and single-window; a clean candidate for `/substrate:quick-spec`.

## Dependencies
- blocked-by: []

## State-transfer prompt
> Working in metalogica/substrate. Task: bring synthesize-session's SKILL body back under the
> ~500-line cap by moving Step 7's record templates into references/.
> Relevant files:
> - skills/synthesize-session/SKILL.md — Step 7, the two fenced record templates (actionable bead,
>   parked question)
> - opencode/command/substrate/synthesize-session.md — mirror; keep the two files equal-length
> - CLAUDE.md — the ~500-line cap and the progressive-disclosure principle being applied
> Relevant prior commits:
> - 753ec9c — the epic that pushed it from 533 to 574 (bead E1, Step 6.5)
> Constraints — do NOT modify: any step's contract; Step 9's tempfile render path, which consumes
> these record shapes; the step numbering that .substrate/synthesis-state.json completed-steps
> depends on.
> Verification:
> - wc -l skills/synthesize-session/SKILL.md opencode/command/substrate/synthesize-session.md
>   # both < 500
> - bash references/docs-core/docs/scripts/doctrine-lint.sh
