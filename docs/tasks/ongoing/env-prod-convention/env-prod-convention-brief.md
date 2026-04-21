# Prod Env-File Convention Brief

**Author**: rei nova
**Date**: 2026-04-21
**Status**: Draft

---

## User Story

As a substrate user managing production environment variables,
I want a single canonical way to stage prod values for syncing to Vercel + Convex,
so that I don't accidentally ship dev values to prod or lose track of which file is the source of truth.

---

## Constraints

- MUST pick ONE of the following, not both:
  - (a) `.env.prod` as a local staging file (gitignored), manually maintained as the source of truth for prod values
  - (b) `vercel env pull .env.production.local` as the retrieval mechanism from Vercel's dashboard
- MUST document the chosen convention in `skills/deploy/SKILL.md` and the `.gitignore` template.
- MUST NOT conflict with `.env.local` which is always dev-only.
- SHOULD be frictionless for non-technical users.

---

## References

- Stage-3 deploy feedback from commit `69c8931`
- Vercel env documentation: https://vercel.com/docs/projects/environment-variables
- `references/templates/.env.example`
- `references/templates/.gitignore`

---

## Acceptance Criteria

- [ ] One convention chosen and documented
- [ ] `.gitignore` template reflects the choice (gitignores `.env.prod` or `.env.production.local`)
- [ ] `skills/deploy/SKILL.md` step 7 (Push production env vars) updated to use the chosen path
- [ ] Migration guidance for users currently using the unchosen pattern

---

## Out of Scope

- Supporting BOTH patterns simultaneously (rejected — pick one)
- Third-party secrets-management integration (Doppler, 1Password, AWS Secrets Manager)
- Multi-environment support (dev / staging / prod triad) — substrate is two-environment by design

---

## Open Questions

1. Does `vercel env pull` cover Convex env vars, or only Vercel-managed ones? (Likely only Vercel's — which means Convex-only values like `CLERK_JWT_ISSUER_DOMAIN` still need a separate file anyway. This may force option (a).)
2. Risk of committing `.env.prod` accidentally (secrets leak) vs. recoverability if the local file is lost (re-fetch from Vercel). Weigh the tradeoff.
3. Does the TBD #1 (tenant-ID drift detection) depend on this choice? If we pick (a), drift detection reads `.env.prod`; if (b), drift detection must query Convex / Vercel directly.
