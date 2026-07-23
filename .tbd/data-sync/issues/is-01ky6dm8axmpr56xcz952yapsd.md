---
type: is
id: is-01ky6dm8axmpr56xcz952yapsd
title: Scaffold daemon/ package + root substrate.yaml gate block
kind: task
status: closed
priority: 2
version: 10
labels:
  - epic:serve-v1
  - group:window-1
dependencies:
  - type: blocks
    target: is-01ky6dm9v80epgpcb0e07bmwe7
  - type: blocks
    target: is-01ky6dmcgkq8s8p59ftp68ar7d
  - type: blocks
    target: is-01ky6dmg8n181n7j8zctckfa1x
  - type: blocks
    target: is-01ky6dmjhj6vka3a77e359eecw
  - type: blocks
    target: is-01ky6dmkvrrwjga6szg7z05kmd
  - type: blocks
    target: is-01ky6dmwp06b4qw21mkfh8befa
parent_id: is-01ky6dm7cmm0kzaza6379jer1p
created_at: 2026-07-23T02:42:13.468Z
updated_at: 2026-07-23T04:03:17.727Z
closed_at: 2026-07-23T04:03:17.726Z
close_reason: "gate green: daemon/ scaffolded, tsc+vitest+doctrine-lint clean (tip 85512d3)"
---
Goal: daemon/package.json (tsx, typescript, vitest, yaml; "gate": "tsc --noEmit && vitest run"), strict tsconfig.json, stub entries src/{serve,status,tidy,triage}.ts (print stub line), src/config.ts (defaults + .substrate/serve.yaml override), src/state.ts (atomic read/write, schemaVersion:1). PLUS root substrate.yaml with gate.{compile,test,lint} mapped to "cd daemon && pnpm ..." + worktree-seed [daemon/node_modules] + toolchain-pin.install "cd daemon && pnpm install" — orchestrate refuses without it.
Files (creates): daemon/package.json daemon/tsconfig.json daemon/src/serve.ts daemon/src/status.ts daemon/src/tidy.ts daemon/src/triage.ts daemon/src/config.ts daemon/src/state.ts substrate.yaml
Gate: cd daemon && pnpm install && pnpm gate
Acceptance: gate green; test -f daemon/package.json && grep -q '"gate"' daemon/package.json; test -f substrate.yaml
spec: docs/tasks/ongoing/serve-v1/serve-v1-spec.md#phase-1-step-1.1
State-transfer: greenfield; design in spec section 2.1/2.3. No existing tests invalidated.

## Notes

substrate.yaml pre-created at graph time (orchestrate refuses without it — chicken-and-egg). This bead: verify/extend it only; gate commands assume daemon/ exists after this bead lands. Wave-1 union re-gate runs AFTER this bead, so cd daemon succeeds.
