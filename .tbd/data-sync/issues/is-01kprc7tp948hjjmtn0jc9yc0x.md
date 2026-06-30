---
type: is
id: is-01kprc7tp948hjjmtn0jc9yc0x
title: Split SetupRequired into SetupChecklist shell + /setup-dev + /setup-prod routes
kind: task
status: closed
priority: 2
version: 3
labels:
  - restructure
  - frontend
dependencies: []
parent_id: is-01kprc73nhebnhznnr6824pk26
created_at: 2026-04-21T15:58:42.888Z
updated_at: 2026-04-21T16:45:41.385Z
closed_at: 2026-04-21T16:45:41.384Z
close_reason: null
---
Extract the current SetupRequired component into a reusable SetupChecklist shell (visual/UX identical: dark bg, mint accent, mono corners, numbered rows, status badges). Three consumers: (1) SetupRequired inline fallback (env missing, rendered by main.tsx) uses SetupChecklist with dev items + an env-missing warning banner, (2) new /setup-dev TanStack route uses SetupChecklist with dev items, (3) new /setup-prod TanStack route uses SetupChecklist with prod items. Prod items are all-manual status (custom domain, prod Clerk, 5 CNAMEs, SSL, prod Convex, prod JWT+webhook, GCP OAuth, prod env sync) — client-side JS can't detect these. Each row: name, blurb, dashboard link, status. Scope: 1 new shell component, 2 new route files, refactor of existing SetupRequired. ~150 lines net add.

## Notes

Closed as resolved — Alternative B chosen. No new component files, no new routes. SetupRequired stays as-is for env-missing inline fallback. Prod checklist lives in /substrate:deploy terminal output (sub-xz42 owns). Rationale: (1) /setup-dev is vestigial when env is present, (2) /setup-prod's status indicators are all fake since client-side JS can't detect prod state, (3) prod instructions belong where the user is running the deploy — terminal, not browser context-switch.
