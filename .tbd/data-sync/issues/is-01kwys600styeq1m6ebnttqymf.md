---
type: is
id: is-01kwys600styeq1m6ebnttqymf
title: "[devx] Generalize skill-count-drift check into a repo-wide assert script"
kind: chore
status: open
priority: 3
version: 1
labels:
  - epic:orchestrate
  - synth
dependencies: []
parent_id: is-01kwyqmd14n7ey3kqmtfh6qvg1
created_at: 2026-07-07T17:14:31.832Z
updated_at: 2026-07-07T17:14:31.832Z
---
---
type: devx-agent
status: open
effort: XS
epic: orchestrate
originating-spec: docs/tasks/completed/orchestrate/orchestrate-spec.md
originating-session: 2026-07-07
cross-repo: in-repo
---

# Generalize the skill-count-drift check into a repo-wide assert

## Why now (session signal)
The orchestrate spec's Phase-5 count verify only grepped `CLAUDE.md` for a stale "11". Stale counts also
lived in `opencode/README.md` and `opencode/CONVENTIONS.md`; they were only caught by an ad-hoc repo-wide
sweep added during execution. The next skill addition will hit the same too-narrow verify.

## Acceptance criterion
A small script (e.g. `scripts/assert-skill-count.sh`) asserts the user-facing skill count is consistent across
`plugin.json`, `marketplace.json`, `CLAUDE.md`, `README.md`, `opencode/README.md`, `opencode/CONVENTIONS.md`,
deriving the true count from `ls skills/`. Exits non-zero on any mismatch. Optionally wired into the parity audit.

## State-transfer prompt
> Working in https://github.com/metalogica/substrate. Task: write `scripts/assert-skill-count.sh` that derives
> the skill count from `ls skills/ | wc -l` and greps the doc/manifest surfaces for a stale count, failing on drift.
>
> Relevant files:
> - .claude-plugin/plugin.json, .claude-plugin/marketplace.json — "Twelve skills …" descriptions
> - CLAUDE.md, README.md, opencode/README.md, opencode/CONVENTIONS.md — count mentions
> - scripts/ — existing bash helpers for style
>
> Verification: script exits 0 on current tree (count=12 everywhere); flip one file to "11" and confirm it exits non-zero.
---

## Dependencies
- blocked-by: []

## Notes
Complements the existing skills<->commands parity audit. Keep zero-dep bash, matching doctrine-lint.sh style.
