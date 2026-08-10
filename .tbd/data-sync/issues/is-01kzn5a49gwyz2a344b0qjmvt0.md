---
type: is
id: is-01kzn5a49gwyz2a344b0qjmvt0
title: orchestrate Step 4 occupies the primary checkout's HEAD for the whole run
kind: bug
status: open
priority: 1
version: 1
labels: []
dependencies: []
created_at: 2026-08-10T06:21:11.343Z
updated_at: 2026-08-10T06:21:11.343Z
---
/substrate:orchestrate Step 4 runs `git switch -c feat/<epic-slug>` in the PRIMARY checkout, so
the developer's own working copy sits on the integration branch for the entire run — every wave,
every merge, every re-gate. Consequences:

- the human cannot use their checkout for anything else while an epic runs (the whole point of an
  unattended fleet is that they can);
- any uncommitted work in the primary checkout rides along on the integration branch;
- a killed run leaves the checkout parked on feat/<epic-slug> with no signal that it should go back.

Fix direction: give the integration branch its own worktree too — cut feat/<epic-slug> into
`<repo>-integration/` (or similar), run merges and the union re-gate there, and leave the primary
checkout on trunk untouched. The trunk squash (Step 6.3) is then the only operation that touches
the primary checkout, which is also the only moment that needs the interactive signer.

Surfaced by clawcraft Spec 0 (execution-substrate), 2026-08-10, while applying U1-U5. Deliberately
NOT fixed in that pass: it changes the orchestrator's control flow rather than a documented rule,
so it wants its own change with its own drill.

Evidence: skills/orchestrate/SKILL.md Step 4; clawcraft
docs/tasks/ongoing/execution-substrate/execution-substrate-spec.md §3.5 (filed-as-bead item).
