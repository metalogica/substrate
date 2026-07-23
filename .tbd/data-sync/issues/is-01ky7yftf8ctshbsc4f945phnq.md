---
type: is
id: is-01ky7yftf8ctshbsc4f945phnq
title: "Operator: run the 3 serve-v1 live drills (dispatch, actualize/merge, full-lifecycle)"
kind: task
status: open
priority: 1
version: 1
spec_path: docs/tasks/ongoing/serve-v1/serve-v1-spec.md
labels:
  - epic:serve-v1
  - src:synth-serve-v1
dependencies: []
created_at: 2026-07-23T16:56:08.423Z
updated_at: 2026-07-23T16:56:08.423Z
---
## Why now (session signal)
The serve-v1 daemon shipped to main (aa2054a) but has NEVER been run live. Everything below the injectable seams (real gh api, real claude -p session, real git worktree) is proven only by mocks. The 3 out-of-band drill beads (sub-35nn, sub-x881, sub-b6au) were closed as "deferred — not run". This bead consolidates the operator verification.

## Acceptance criterion
On a scratch GitHub repo, all three drills pass and the checklist is recorded here:
1. DISPATCH (sub-35nn): groomed kind:task bead -> `substrate triage <id>` -> real worktree + real headless claude session -> real PR opened; kill mid-flow + rerun triage -> NO duplicate branch/PR.
2. ACTUALIZE/MERGE (sub-x881): comment on that PR -> fresh session addresses + pushes + replies via gh; merge PR -> daemon detects mergedAt within one tick -> tidy reaps worktree + closes bead with merge SHA.
3. FULL LIFECYCLE (sub-b6au): groomed->claim->route->build->PR->comment->actualize->merge->tidy->closed, PLUS bounce path (missing-kind bead returned to board), PLUS Ctrl-C mid-tick -> boot-reap yields a consistent board.

## State-transfer prompt
> Working in git@github.com:metalogica/substrate.git; the daemon is at daemon/ on main.
> Task: run the 3 serve-v1 live drills above on a throwaway GitHub repo and record pass/fail per step.
> Relevant files:
> - daemon/src/serve.ts, tick.ts, triage.ts, worktree.ts, session.ts, prs.ts, tidy.ts
> - README.md (serve daemon section) — verb usage
> Constraints: use a scratch repo; --dangerously-skip-permissions runs a real headless session (single-operator risk).
> Verification: the 3-part checklist above, all green.
