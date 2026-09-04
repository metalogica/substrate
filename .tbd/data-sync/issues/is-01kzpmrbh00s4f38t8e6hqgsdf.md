---
type: is
id: is-01kzpmrbh00s4f38t8e6hqgsdf
title: Six skills hardcode pnpm app:* gates instead of reading substrate.yaml
kind: bug
status: open
priority: 1
version: 1
labels: []
dependencies: []
created_at: 2026-08-10T20:10:20.576Z
updated_at: 2026-08-10T20:10:20.576Z
---
`/substrate:adopt` exists to wire `substrate.yaml`'s gate block to ANY repo's own
compile/test/lint commands. Six skills ignore it and hardcode the Vite+Convex kernel's
package scripts (`pnpm app:compile`, `app:lint`, `app:test`), so an adopted Python/Go/Rust
repo gets skills that either refuse or run commands that do not exist.

Split, as of 3309cc6:

  reads substrate.yaml   adopt, orchestrate, dispatch, graph-spec, spool
  hardcodes app:*        quick-spec, diagnose, execute, architect-spec, migrate, init

The two everyday small-change doors — quick-spec and diagnose — are both in the broken
column, so the failure is hit constantly on adopted repos rather than at the margins.

quick-spec:130-132 makes this binding: "MUST run all three verification commands
(app:compile, app:lint, app:test). Never silently skip one."

Discovered while asking whether /substrate:quick-spec could carry the tmux-removal change
in this very repo. It could not — see the sibling bead on sub-yum8.

Fix: the four post-scaffold skills (quick-spec, diagnose, execute, architect-spec) should
read `substrate.yaml`'s gate block with the app:* commands as a fallback only when no
substrate.yaml exists. `init` and `migrate` are arguably correct as-is since they scaffold
the Convex kernel itself — confirm that before changing them.

Verify: grep for `app:compile` across skills/ returns only init + migrate; a substrate.yaml
with non-pnpm gate commands drives quick-spec end to end on a non-Node repo.
