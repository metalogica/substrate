---
type: is
id: is-01kzhfk5aqxng7jfjgeq7ddtjz
title: "bead-tui: bound refreshMembership fan-out — ~55 concurrent tbd spawns, 22s cold start"
kind: bug
status: open
priority: 2
version: 1
labels: []
dependencies: []
created_at: 2026-08-08T20:03:55.328Z
updated_at: 2026-08-08T20:03:55.328Z
---
## Symptom

`substrate tasks` takes ~22s to first paint on a large tracker (measured:
clawcraft, 733 beads / 31 epic containers / 24 epic slugs, 163 MB peak RSS).
It looks hung — there is a "discovering beads…" line but no progress signal.

## Root cause

`refreshMembership()` (scripts/bead-tui/watch.mjs:109) fans out UNBOUNDED:

  - one `tbd show` per epic container, all concurrent  (31 processes)
  - then one `tbd list --label epic:<slug> --all` per slug, all concurrent (24)

That is ~55 concurrent git-native tbd processes, each 2-3s. It re-runs on every
id-signature change (watch.mjs:903), so creating a bead re-pays the whole cost.

## Fix sketch

Bound the concurrency (a small p-limit style pool, ~4-6) so the fan-out is
throttled rather than eliminated, and/or defer the COMPLETED epics' member
`tlist` until that section is expanded — the file already flags this as the
future lever at watch.mjs:111-113.

## Not in scope

This is distinct from the freeze fixed in 178c6a2 (unreachable board rows +
unserialized writes). This one is startup latency only; it makes the TUI look
hung but is not what keypresses were hitting.

## Related

Store-lock contention is a separate suspect worth ruling out while here: if
`substrate serve`, a second TUI, or a background `tbd sync` holds tbd's lock,
every call blocks to TBD_TIMEOUT (30s). The TUI can no longer compound that
(178c6a2) but does not own it.
