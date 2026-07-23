---
type: is
id: is-01ky7yg48kj0ffza18g3q5104d
title: "serve daemon: guard + document preflight coupling to tbd status --json .initialized"
kind: chore
status: open
priority: 3
version: 1
spec_path: docs/tasks/ongoing/serve-v1/serve-v1-spec.md
labels:
  - epic:serve-v1
  - src:synth-serve-v1
dependencies: []
created_at: 2026-07-23T16:56:18.451Z
updated_at: 2026-07-23T16:56:18.451Z
---
## Why now (session signal)
serve.ts preflight was implemented to parse `tbd status --json` and assert `.initialized === true`, because tbd (0.3.0) exits 0 even OUTSIDE a board (an exit-code probe would pass spuriously). This couples preflight to a specific tbd JSON field. Also FIFO ordering in queue.ts sorts on internalId's ULID (the public id suffix is random, not time-ordered) — correct today but another tbd-internal coupling worth documenting.

## Acceptance criterion
Preflight degrades safely if `tbd status --json` lacks `.initialized` (e.g. tbd version drift): either a version check with an actionable message, or a fallback probe — never a spurious pass outside a tbd repo. Document both couplings (preflight .initialized; FIFO internalId ULID) in a code comment or the serve daemon README so a tbd upgrade doesn't silently break them. Verify: preflight still fails non-zero outside a board on the current tbd, and the coupling is documented.

## State-transfer prompt
> Working in git@github.com:metalogica/substrate.git; daemon at daemon/.
> Task: harden + document the daemon's two tbd-internal couplings (preflight .initialized field; FIFO internalId ULID sort).
> Relevant files:
> - daemon/src/serve.ts (preflight) ; daemon/src/queue.ts (list FIFO sort)
> Constraints: preflight MUST stay non-zero outside a tbd board.
> Verification: run preflight from a non-tbd dir (expect non-zero); confirm doc/comment present.
