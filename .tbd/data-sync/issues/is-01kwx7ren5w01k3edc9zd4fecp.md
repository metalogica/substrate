---
type: is
id: is-01kwx7ren5w01k3edc9zd4fecp
title: "Add opencode-parity-lint.sh: fail if skills/ and opencode/command/substrate/ diverge"
kind: task
status: open
priority: 2
version: 4
labels:
  - epic:opencode-port
dependencies:
  - type: blocks
    target: is-01m1pyk6kqpk9hvwyagj2sgzjr
created_at: 2026-07-07T02:50:47.841Z
updated_at: 2026-09-04T19:34:23.037Z
---
## Update from session 2026-09-04 (epic:doctrine-crud)

Concrete demand signal: across five waves the orchestrator ran

    comm -23 <(ls skills|sort) <(ls opencode/command/substrate|sed 's/\.md$//'|sort)

by hand after every merge, because nine of the epic's fourteen beads changed a skill and each was
separately instructed to re-translate its mirror. It stayed empty — but only because every runner was
told the parity rule explicitly in its dispatch prompt. Nothing mechanical would have caught a miss,
and the same audit will not be run by whoever orchestrates next.

Note this repo now has 14 skills including the daemon-invoked `serve-bead`, so the script must not
assume the count or that every skill is user-facing.

Downstream: sub-scta depends on this bead to wire the script into `substrate.yaml`'s gate (the gate
currently covers `daemon/` only, so no declared command touches `skills/` or `opencode/` at all).
