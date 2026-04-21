# Prod Google OAuth Automation Brief

**Author**: rei nova
**Date**: 2026-04-21
**Status**: Draft (blocked on Clerk API gap)

---

## User Story

As a substrate user deploying to a Clerk prod instance with Google sign-in enabled,
I want the Google Cloud Console OAuth 2.0 Client ID creation and Clerk social-connection wiring to run as a script,
so that I don't manually click through GCP Console and Clerk Dashboard — typos in the redirect URI or domain will force a full re-do.

---

## Constraints

- MUST create a Google OAuth 2.0 Web Client with the exact redirect URI `https://clerk.<domain>/v1/oauth_callback`.
- MUST paste Client ID + Secret into Clerk's Social Connections → Google → Custom Credentials.
- MUST work from the terminal, not the browser.
- SHOULD NOT require the user to pre-install `gcloud` if an alternative exists.

---

## References

- Stage-3 deploy feedback from commit `69c8931`
- Current intervention: manual walkthrough in `skills/deploy/SKILL.md` step 2b
- `gcloud` CLI — CAN create OAuth clients but requires scope + consent screen preconditions
- Clerk Backend API — **does NOT expose social-connection credential management** as of 2026-04 (dashboard-only)

---

## Acceptance Criteria

- [ ] Script creates the Google OAuth client programmatically (no browser navigation)
- [ ] Script retrieves Client ID + Secret without user copy-paste from GCP Console
- [ ] Script pastes creds into Clerk via API (or halts with a clean, specific instruction if Clerk's API is still gapped)
- [ ] Redirect URI is correct on first try — no typos in the domain string

---

## Out of Scope

- OAuth consent screen configuration (one-time per GCP project, keep manual)
- Scopes beyond email + profile (keep defaults)
- Multi-provider automation (Apple, GitHub, Microsoft, etc.) — Google-only for v1
- Managing the GCP project itself (user brings their own)

---

## Open Questions

1. Does Clerk expose social-connection credentials via a private / undocumented API? (Worth investigating — dashboards often hit internal endpoints.)
2. Is a Clerk CLI on the public roadmap? If so, target its release and defer until then.
3. Would a hybrid path (automate GCP half, manual Clerk half) be worthwhile standalone? Saves ~50% of the work and removes the domain-typo risk (the GCP half can read the domain from `.env.local` or `.env.prod`).
4. Depends on TBD #3 (email-default-enablement)? If users can reach prod via email sign-in alone, Google becomes a nice-to-have rather than a deploy-blocker — lowers the urgency of this TBD.
