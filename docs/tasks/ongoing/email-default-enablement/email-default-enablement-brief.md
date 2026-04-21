# Clerk Email Sign-in Default Enablement Brief

**Author**: rei nova
**Date**: 2026-04-21
**Status**: Draft (blocked on Clerk API/CLI gap)

---

## User Story

As a substrate user deploying to a new Clerk instance,
I want Email sign-in (code or magic link) enabled automatically without touching the Clerk dashboard,
so that non-technical users can reach a working prod sign-up without Google Cloud Console or any manual toggle.

---

## Constraints

- MUST enable Email (code OR magic link) on every substrate-provisioned Clerk instance.
- MUST NOT require the user to manually toggle sign-in methods in the Clerk dashboard.
- MUST work for both DEV (`pk_test_`) and PROD (`pk_live_`) Clerk instances.
- SHOULD leave other sign-in methods untouched (don't disable Google if the user wants it).

---

## References

- Stage-3 deploy feedback from commit `69c8931`
- Current intervention: written instruction in `scripts/setup-clerk.sh` step 1 and `skills/deploy/SKILL.md` step 2
- Clerk Backend API: https://clerk.com/docs/reference/backend-api
- **Primary blocker:** Clerk does not currently expose an API or CLI for instance-level sign-in method configuration — this is dashboard-only as of 2026-04.

---

## Acceptance Criteria

- [ ] Email sign-in enabled on a new Clerk instance with zero user dashboard interaction
- [ ] No regression in existing Google / other sign-in methods
- [ ] Works via automation invokable from `scripts/setup-clerk.sh`

---

## Out of Scope

- Email template copy customization
- MFA or magic-link expiration configuration
- Bulk enablement across multiple Clerk instances
- Enabling sign-in methods beyond Email

---

## Open Questions

1. Does Clerk have a private or undocumented API endpoint for this? (Dashboard actions sometimes hit internal APIs that can be called from a script.)
2. Is this blocked indefinitely, or does Clerk have a public config API on the roadmap? (Check Clerk changelog + community quarterly.)
3. Alternative path — does Clerk support "application templates" with pre-configured sign-in methods? If so, the automation becomes "fork from template" rather than "configure after creation."
4. Is it worth building this if Clerk ships the API in 3–6 months anyway? Compare the value of automation NOW vs. waiting.
