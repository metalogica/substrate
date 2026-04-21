# Tenant ID Drift Detection Brief

**Author**: rei nova
**Date**: 2026-04-21
**Status**: Draft

---

## User Story

As a substrate user recreating a Clerk production instance (which generates a new tenant ID),
I want `/substrate:deploy` to detect the drift and prompt me to re-sync DNS,
so that DKIM CNAMEs and webhook endpoints don't silently point at the old tenant's targets.

---

## Constraints

- MUST detect a tenant ID change between `/substrate:deploy` runs (diff current `CLERK_JWT_ISSUER_DOMAIN` against the last-known value).
- MUST emit a clear warning listing which DNS records need updating (DKIM CNAMEs, webhook endpoint URL).
- MUST NOT automatically modify DNS — user reviews and applies at their registrar.
- SHOULD NOT require the user to maintain a local staging file by hand.

---

## References

- `skills/deploy/SKILL.md` step 2 (Clerk setup) — where the drift check should land
- Stage-3 deploy feedback from commit `69c8931`
- Clerk DKIM CNAME pattern: `dkim1.<tenant-id>.clerk.services`

---

## Acceptance Criteria

- [ ] Deploy skill detects when current `CLERK_JWT_ISSUER_DOMAIN` differs from the previously-stored value
- [ ] On drift, skill halts and prints the old vs. new issuer URLs + the specific DNS records that need updating
- [ ] User can acknowledge and continue (records are updated out-of-band at their registrar)
- [ ] No false positives on first run (no prior state to compare)

---

## Out of Scope

- Automatic DNS record updates (registrar-dependent, risky, out of substrate's authority)
- Migration path for orphaned records at the old registrar (user cleanup)
- Multi-Clerk-instance setups (staging + prod in the same project)

---

## Open Questions

1. Where do we persist "last-known issuer URL" for comparison? Options: Convex env (round-trip, auth'd), `.env.prod` (couples to TBD #2), a new `.substrate/state.json` (introduces local state).
2. Should the drift check run on every deploy, or only when the user explicitly re-runs `setup-clerk.sh`?
3. Should the check also compare webhook signing secret (which also changes on instance recreation)?
