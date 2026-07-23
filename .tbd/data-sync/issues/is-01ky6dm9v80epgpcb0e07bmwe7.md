---
type: is
id: is-01ky6dm9v80epgpcb0e07bmwe7
title: Wire serve/status/tidy/triage into scripts/substrate + preflight + SIGINT
kind: task
status: closed
priority: 2
version: 6
labels:
  - epic:serve-v1
  - group:window-2
  - gate-scope:partial
dependencies:
  - type: blocks
    target: is-01ky6dmd2d1pwkmfgx1e4bbz7k
  - type: blocks
    target: is-01ky6dmqswy04vzjczygzv8awy
  - type: blocks
    target: is-01ky6dmwp06b4qw21mkfh8befa
parent_id: is-01ky6dm7cmm0kzaza6379jer1p
created_at: 2026-07-23T02:42:15.009Z
updated_at: 2026-07-23T04:16:49.928Z
closed_at: 2026-07-23T04:16:49.928Z
close_reason: "gate green: scripts/substrate verbs + serve.ts preflight/SIGINT (union tip b2eb552)"
---
Goal: four cases in scripts/substrate exec-ing tsx entries with --repo $PWD (spec 2.2); serve.ts preflight (tbd, gh auth, claude, git — one actionable line each, non-zero exit outside a tbd repo); SIGINT handler (release un-dispatched claims, flush state, exit 0); help text extended.
Files (creates/modifies): scripts/substrate daemon/src/serve.ts
Consumes: daemon entries from b1.
Gate: bash -n scripts/substrate; bash scripts/substrate serve --help behavior; cd daemon && pnpm gate
gate-scope: partial (scripts/* not covered by daemon vitest; union re-gate authorizes)
Acceptance: verbs dispatch end-to-end to stubs; preflight fails actionably from a non-tbd dir.
spec: docs/tasks/ongoing/serve-v1/serve-v1-spec.md#phase-1-step-1.2
