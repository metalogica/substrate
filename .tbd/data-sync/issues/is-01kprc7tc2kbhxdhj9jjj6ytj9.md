---
type: is
id: is-01kprc7tc2kbhxdhj9jjj6ytj9
title: Fold Clerk dev setup + local smoke test into /substrate:migrate
kind: task
status: closed
priority: 2
version: 3
labels:
  - restructure
dependencies: []
parent_id: is-01kprc73nhebnhznnr6824pk26
created_at: 2026-04-21T15:58:42.561Z
updated_at: 2026-04-21T16:42:42.055Z
closed_at: 2026-04-21T16:42:42.053Z
close_reason: null
---
Migrate currently ends at 'green compile + tests + commit'. After the restructure, migrate owns the dev-env-complete handoff. Add three steps at the end of migrate: (1) invoke scripts/setup-clerk.sh for dev Clerk instance + JWT template + webhook endpoint, (2) verify Convex dev deployment is current, (3) local smoke test — user signs in on localhost. End state: user has a working app at localhost:5173 with Clerk dev auth functional. Scope: +~60 lines in skills/migrate/SKILL.md. No script changes (setup-clerk.sh already does dev correctly).
