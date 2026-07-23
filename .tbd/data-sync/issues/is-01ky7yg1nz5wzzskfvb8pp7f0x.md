---
type: is
id: is-01ky7yg1nz5wzzskfvb8pp7f0x
title: "serve daemon: speed up the ~70s real-tbd fixture suite (queue/worktree)"
kind: chore
status: open
priority: 3
version: 1
spec_path: docs/tasks/ongoing/serve-v1/serve-v1-spec.md
labels:
  - epic:serve-v1
  - src:synth-serve-v1
dependencies: []
created_at: 2026-07-23T16:56:15.805Z
updated_at: 2026-07-23T16:56:15.805Z
---
## Why now (session signal)
The daemon gate (cd daemon && pnpm gate) is dominated by real-tbd/real-git fixture suites: queue.test.ts (~57-70s) and worktree.test.ts (~20-30s) each do per-test `git init` + `tbd init` + several subprocess round-trips. Every orchestrator union re-gate inherits this cost.

## Acceptance criterion
The daemon vitest suite runs in well under 20s (target: a few seconds) while preserving equivalent coverage — e.g. inject fakes for the transition-logic assertions and keep ONE shared real-tbd/real-git smoke fixture (or a describe.skipIf slow-tier gated behind an env flag). Verify: `time (cd daemon && pnpm exec vitest run)` shows the reduction; assertions unchanged in intent.

## State-transfer prompt
> Working in git@github.com:metalogica/substrate.git; daemon at daemon/.
> Task: cut the daemon test suite wall-clock by replacing per-test real-tbd/real-git fixtures with injected fakes, keeping at most one shared real smoke fixture.
> Relevant files:
> - daemon/test/queue.test.ts, daemon/test/worktree.test.ts ; daemon/src/queue.ts (injectable Runner), worktree.ts (injectable GitExec)
> Constraints: keep coverage of claim/release/FIFO + worktree create/reap/idempotency.
> Verification: time the suite; confirm green.
