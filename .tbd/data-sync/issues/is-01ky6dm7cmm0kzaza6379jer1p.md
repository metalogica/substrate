---
type: is
id: is-01ky6dm7cmm0kzaza6379jer1p
title: "Epic: Substrate Serve v1 — local-first pull daemon"
kind: epic
status: closed
priority: 2
version: 18
labels:
  - epic:serve-v1
dependencies: []
child_order_hints:
  - is-01ky6dm8axmpr56xcz952yapsd
  - is-01ky6dm9v80epgpcb0e07bmwe7
  - is-01ky6dmcgkq8s8p59ftp68ar7d
  - is-01ky6dmd2d1pwkmfgx1e4bbz7k
  - is-01ky6dmegwbdx2kpcjmmez4m6j
  - is-01ky6dmfq81a7ckwagjzbvv7na
  - is-01ky6dmg8n181n7j8zctckfa1x
  - is-01ky6dmjhj6vka3a77e359eecw
  - is-01ky6dmk48fm2wgb8p7nr53f08
  - is-01ky6dmkvrrwjga6szg7z05kmd
  - is-01ky6dmntxm3wq4qsa4nc5v0k9
  - is-01ky6dmpcsn2srvp9nr4281w6g
  - is-01ky6dmqswy04vzjczygzv8awy
  - is-01ky6dms50fe9q5waepv2r7p21
  - is-01ky6dmsxcepw4jkz0ybdkszd9
  - is-01ky6dmwp06b4qw21mkfh8befa
created_at: 2026-07-23T02:42:12.495Z
updated_at: 2026-07-23T05:28:47.225Z
closed_at: 2026-07-23T05:28:47.224Z
close_reason: "epic:serve-v1 orchestrated + merged to main (aa2054a, PR #1). 14 code beads green; 3 live drills deferred (see per-bead notes)."
---
Spec: docs/tasks/ongoing/serve-v1/serve-v1-spec.md
Local-first pull daemon: substrate serve/status/tidy/triage. Poll tbd -> claim -> route -> headless lane in sibling worktree -> PR -> actualize comments -> merge-detect -> reap. Sessions are cattle; tbd is the queue; no webhooks; no auto-merge.
