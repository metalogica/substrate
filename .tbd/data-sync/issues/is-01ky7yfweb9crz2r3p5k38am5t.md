---
type: is
id: is-01ky7yfweb9crz2r3p5k38am5t
title: "serve daemon: re-dispatch a held/retried bead on a subsequent tick"
kind: feature
status: open
priority: 2
version: 1
spec_path: docs/tasks/ongoing/serve-v1/serve-v1-spec.md
labels:
  - epic:serve-v1
  - src:synth-serve-v1
dependencies: []
created_at: 2026-07-23T16:56:10.442Z
updated_at: 2026-07-23T16:56:10.442Z
---
## Why now (session signal)
§5.2 failure policy = retry-once-next-tick then bounce. sub-35nn's applyDispatchPolicy correctly HOLDS the claim + marks serve:retried on the first no-PR failure and bounces on the second — but the mechanism that RE-DISPATCHES a held (off-board, in_progress, serve:retried) bead on a subsequent tick was owned by no bead (it straddles tick discover + boot-reap). Flagged by sub-35nn as a cross-bead follow-up.

## Acceptance criterion
On a subsequent tick, a bead in state {assignee=serve, in_progress, label serve:retried, no open PR, worktree present-or-reapable} is re-dispatched exactly once more; a second no-PR result bounces it with the failure note. Unit-proven against fakes; no double-dispatch, no infinite retry.

## State-transfer prompt
> Working in git@github.com:metalogica/substrate.git; daemon at daemon/.
> Task: wire re-dispatch of a held/retried bead into the serve tick (discover step must surface held serve:retried beads, or serve-loop/tidy must re-enqueue them), honoring §5.2 retry-once-then-bounce.
> Relevant files:
> - daemon/src/tick.ts (applyDispatchPolicy, discover) ; daemon/src/serve.ts (serveLoop, bootReap) ; daemon/src/tidy.ts
> Constraints: single-writer via queue.ts; observed-truth recovery; no double-dispatch.
> Verification: fixture test — held serve:retried bead re-dispatched once, then bounced on second failure.
