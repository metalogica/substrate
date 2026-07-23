---
type: is
id: is-01ky7yfs8bsdy230eqvagsfhyn
title: "orchestrate: cut feat/<epic> from origin/<trunk>, or warn when local trunk is ahead"
kind: bug
status: open
priority: 1
version: 1
spec_path: docs/tasks/ongoing/serve-v1/serve-v1-spec.md
labels:
  - src:synth-serve-v1
dependencies: []
created_at: 2026-07-23T16:56:07.179Z
updated_at: 2026-07-23T16:56:07.179Z
---
## Why now (session signal)
In the epic:serve-v1 --pr run, feat/serve-v1 was cut from a LOCAL main that was 9 commits ahead of origin/main. Those 9 unpushed commits (bead-tui/ui work + the serve-v1 spec) rode along in the PR, so GitHub's squash-merge absorbed them into the serve-v1 commit (aa2054a) — a "history-fold". Content was lossless but 9 unrelated features lost their own commits.

## Acceptance criterion
/substrate:orchestrate Step 4 (Setup) cuts feat/<epic-slug> from origin/<trunk> (after a fetch), OR — if it stays on local trunk — detects when local <trunk> is ahead of origin/<trunk> and WARNS + pauses for confirm before cutting. Verify: with local main ahead of origin, orchestrate surfaces the divergence rather than silently basing the epic branch on unpushed work.

## State-transfer prompt
> Working in git@github.com:metalogica/substrate.git.
> Task: make /substrate:orchestrate's integration-branch base safe — cut feat/<epic> from origin/<trunk> after fetch, or warn+pause when local trunk is ahead of origin.
> Relevant files:
> - skills/orchestrate/SKILL.md — Step 4 "Setup — integration branch + unattended signing"
> Constraints: keep unattended-signing disable/restore; don't break the --pr landing.
> Verification: simulate local main ahead of origin; confirm orchestrate warns/pauses or bases off origin. Distinct from sub-kdp7 (verify spec on branch).
