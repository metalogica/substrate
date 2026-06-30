---
type: is
id: is-01kprc7th8f55eyqarvk94ndjh
title: Rewrite /substrate:deploy as prod-only workflow with phase markers
kind: task
status: closed
priority: 2
version: 5
labels:
  - restructure
  - env-prod-convention
dependencies: []
parent_id: is-01kprc73nhebnhznnr6824pk26
created_at: 2026-04-21T15:58:42.728Z
updated_at: 2026-04-21T16:54:42.417Z
closed_at: 2026-04-21T16:54:42.416Z
close_reason: null
---
Rescope deploy to cover production only. Remove dev Clerk/Convex/smoke-test steps (now in migrate via sub-2cxb). Structure around phase markers: Phase A public deploy (GitHub + Vercel + *.vercel.app on dev backends, optional demo), Phase B custom domain (buy + team inventory + project attach + 5 Clerk CNAMEs), Phase C prod Clerk instance (with domain-typo confirmation + DNS/SSL wait + Verify Configuration click), Phase D prod Convex deployment + JWT template + webhook endpoint + env push to Convex prod AND Vercel prod, Phase E redeploy + verify on custom domain. Existing Step 2b (GCP OAuth walkthrough) moves up into Phase C as prod-only. Each phase prints a rich terminal checklist with status indicators + copy-paste commands (this supersedes the cut /setup-prod route idea from sub-v5ec — browser UI can't detect prod state anyway). Scope: ~300-line rewrite, +200/-100 net. Depends on sub-74em for prod-env-file convention decision.
