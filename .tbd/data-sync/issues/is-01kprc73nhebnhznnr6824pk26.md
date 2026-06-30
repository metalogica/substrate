---
type: is
id: is-01kprc73nhebnhznnr6824pk26
title: Restructure stages 2/3 — migrate owns dev-complete, deploy owns prod
kind: epic
status: closed
priority: 2
version: 7
labels:
  - restructure
dependencies: []
child_order_hints:
  - is-01kprc7tc2kbhxdhj9jjj6ytj9
  - is-01kprc7th8f55eyqarvk94ndjh
  - is-01kprc7tp948hjjmtn0jc9yc0x
  - is-01kprbjkg1z8jnj1gcn9hwvvnk
  - is-01kprbjawk1p61v2z6qnmf72wt
created_at: 2026-04-21T15:58:19.312Z
updated_at: 2026-04-21T17:01:15.512Z
closed_at: 2026-04-21T17:01:15.511Z
close_reason: null
---
Current labelling is dishonest: /substrate:deploy finishing on *.vercel.app with dev Clerk + dev Convex isn't actually deployed. Restructure so stage 2 (migrate) leaves the user with a fully working local app (including Clerk dev sign-in), and stage 3 (deploy) covers ONLY production: custom domain, prod Clerk instance, prod Convex deployment, prod env split. Deploy skill uses phase markers (A: public deploy, B: custom domain, C: prod Clerk, D: prod Convex + env, E: verify). Companion routes /setup-dev and /setup-prod replace the single SetupRequired inline fallback; shared SetupChecklist component powers both plus the env-missing inline.
