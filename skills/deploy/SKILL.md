---
name: deploy
description: "Stage 3 production deploy for substrate projects. Covers public *.vercel.app deploy, custom domain + 5 Clerk DNS CNAMEs + SSL, Clerk prod instance with domain-typo confirmation, prod Convex deployment, env sync via .env.prod, and optional GCP OAuth. Five phase markers (A–E) so you can stop or resume without redoing completed work. Invoke after /substrate:migrate once local sign-in is verified."
---

# /substrate:deploy

Take a migrated substrate project from localhost to a fully functional production deployment: public URL → custom domain → prod Clerk → prod Convex → prod env sync.

**Heads up:** this is a long interactive operation with five phases. Each phase has its own idempotency check, checklist, and approval gate — you can stop after any phase and resume later. The user will switch between terminal, Clerk dashboard, Google Cloud Console, Vercel dashboard, and possibly their DNS provider. Narrate context clearly.

## When to run

- `/substrate:migrate` has completed — `src/App.tsx` no longer shows the substrate welcome screen, and dev Clerk sign-in works on localhost.
- `convex/_generated/` is present (Convex codegen has run).
- The user wants a production URL (`*.vercel.app` at minimum; custom domain is the goal).

## When to REFUSE

| Signal | Redirect |
|--------|----------|
| Migration hasn't run (`src/App.tsx` still shows welcome screen) | Run `/substrate:migrate` first |
| Dev Clerk not configured (`.env.local` missing `VITE_CLERK_PUBLISHABLE_KEY`) | Run `/substrate:migrate` step 9 to complete dev Clerk setup |
| `convex/_generated/` missing | Run `npx convex dev` once in another terminal |

## Stage gate

```bash
test -f package.json \
  && test -d convex/_generated \
  && test -f .env.local \
  && grep -q "^VITE_CLERK_PUBLISHABLE_KEY=." .env.local \
  && ! grep -q "Substrate project initialized" src/App.tsx \
  || echo "STAGE_MISMATCH"
```

If `STAGE_MISMATCH`, stop and redirect per the table above.

Resolve `SUBSTRATE_ROOT` (same pattern as `/substrate:init`):

```bash
for candidate in \
  "$HOME/.claude/plugins/substrate" \
  "$PWD/.claude/plugins/substrate" \
  "${SUBSTRATE_ROOT:-}"; do
  if [ -n "$candidate" ] && [ -f "$candidate/scripts/connect-vercel.sh" ]; then
    echo "FOUND: $candidate"
    break
  fi
done
```

---

## Phase A — Public deploy (`*.vercel.app` on dev backends)

**Goal:** app reachable at a Vercel-generated URL, using DEV Clerk + DEV Convex. Quick preview deploy for sharing; NOT real production (dev Clerk has shared Google OAuth, dev Convex isn't isolated).

**Idempotency check:**

```bash
test -f .vercel/project.json && git remote get-url origin >/dev/null 2>&1 && vercel whoami >/dev/null 2>&1 && echo "PHASE_A_LIKELY_DONE"
```

If likely done, ask: `*.vercel.app appears already deployed. Skip Phase A? [type 'default' to let me decide sensible defaults]`. Default: skip.

### Steps

1. **GitHub remote.** If no `origin`, run:

   ```bash
   bash "$SUBSTRATE_ROOT/scripts/init-github.sh" "<repo-slug>" "<public|private>"
   ```

   Ask user for slug + visibility with default-escape. Defaults: slug from `package.json#name`, visibility `private`.

2. **Vercel link.** If no `.vercel/project.json`:

   ```bash
   bash "$SUBSTRATE_ROOT/scripts/connect-vercel.sh" "<project-slug>"
   ```

3. **Push DEV env to Vercel prod (temporary).** Phase A uses dev backends so the public URL works immediately. Phase D will overwrite these.

   Use `printf %s "$VALUE" | vercel env add NAME production` (stdin form — piped heredoc is unreliable on some shells):

   ```bash
   VCU=$(grep -E "^VITE_CONVEX_URL=" .env.local | cut -d= -f2-)
   VCK=$(grep -E "^VITE_CLERK_PUBLISHABLE_KEY=" .env.local | cut -d= -f2-)
   CSK=$(grep -E "^CLERK_SECRET_KEY=" .env.local | cut -d= -f2-)
   printf '%s' "$VCU" | vercel env add VITE_CONVEX_URL production
   printf '%s' "$VCK" | vercel env add VITE_CLERK_PUBLISHABLE_KEY production
   printf '%s' "$CSK" | vercel env add CLERK_SECRET_KEY production
   ```

4. **Trigger deploy:**

   ```bash
   git push origin main
   ```

   Vercel auto-builds. Print the expected Vercel dashboard URL.

5. **Verify.** Ask user to visit the Vercel-generated URL and sign in via dev Clerk. Wait for y/n/default.

### Phase A checklist (print to terminal before gate)

```
Phase A — Public Deploy
  ✓ GitHub remote:       <repo-url>
  ✓ Vercel project:      <vercel-url>
  ✓ Env pushed (dev):    VITE_CONVEX_URL, VITE_CLERK_PUBLISHABLE_KEY, CLERK_SECRET_KEY
  ✓ Deploy triggered:    git push origin main
  ✓ Live URL reachable:  https://<project>.vercel.app
  ✓ Dev sign-in works:   confirmed

⚠  App is running on DEV backends. Phase B+ add custom domain and prod.
```

### Gate

"Continue to Phase B (custom domain)? (y/n/default)". Default: yes.

---

## Phase B — Custom domain + DNS

**Goal:** custom domain points at the Vercel deployment, and 5 Clerk DNS CNAMEs are in place ready for Phase C.

**Idempotency check:**

```bash
vercel domains ls 2>/dev/null | grep -q "<domain>" && echo "PHASE_B_DOMAIN_OWNED"
```

### Steps

1. **Custom domain decision.** Ask: `Register a custom domain? (y/n/default — default: skip, stay on *.vercel.app)`.

   If skip, jump to Phase C (user can still have a prod Clerk instance attached to the `*.vercel.app` URL, but it's uncommon).

2. **Get or buy the domain.** Ask: `Already own the domain? (y/n/default — default: buy)`.

   Buy:

   ```bash
   vercel domains buy <domain>
   ```

   Known bug: CLI has a polling timeout that can falsely report failure after a successful purchase. Verify with `vercel domains ls` before retrying.

   Add existing:

   ```bash
   vercel domains add <domain>
   ```

3. **Domain in team inventory vs. attached to project.** These are two separate states. `vercel domains buy` puts the domain in inventory automatically. If you bought elsewhere, run `vercel domains add <domain>` to put it in inventory. Only THEN can you:

   ```bash
   vercel alias set <latest-deployment> <domain>
   ```

   to attach to the project.

4. **Add 5 Clerk DNS CNAMEs.** Open Clerk dashboard → Domains → add `<domain>`. Clerk shows 5 tenant-specific CNAME targets. Add each via Vercel DNS:

   ```bash
   vercel dns add <domain> clerk           CNAME <tenant>.clerk.services
   vercel dns add <domain> accounts        CNAME <tenant>.accounts.clerk.services
   vercel dns add <domain> clkmail         CNAME mail.<tenant>.clerk.services
   vercel dns add <domain> clk._domainkey  CNAME dkim1.<tenant>.clerk.services
   vercel dns add <domain> clk2._domainkey CNAME dkim2.<tenant>.clerk.services
   ```

   **CLI quirks:**
   - `--scope <team>` MUST come AFTER the subcommand (`vercel dns add ... --scope` works; `vercel --scope ... dns add ...` errors).
   - `vercel dns rm <id> --yes` is NOT supported. Pipe `yes y | vercel dns rm <id>` if unattended.

5. **Wait for Clerk verification.** In Clerk dashboard, click "Verify configuration". Clerk checks DNS and provisions SSL certs automatically. Can take 2–10 minutes.

6. **Confirm DNS resolves:**

   ```bash
   dig <domain> +short
   ```

   Expect Vercel IPs. If empty, wait another 2 minutes and retry.

### Phase B checklist

```
Phase B — Custom Domain
  ✓ Domain purchased/added:       <domain>
  ✓ Domain in team inventory:     yes
  ✓ Domain attached to project:   yes
  ✓ 5 Clerk CNAMEs added:         clerk, accounts, clkmail, clk._domainkey, clk2._domainkey
  ✓ Clerk "Verify configuration": clicked
  ✓ DNS resolves:                 <Vercel IPs>
  ⚠  SSL provisioning may still be in progress (Clerk handles automatically)
```

### Gate

"Continue to Phase C (prod Clerk instance)?". Default: yes.

---

## Phase C — Prod Clerk instance

**Goal:** create a production Clerk instance bound to the custom domain, write prod keys to `.env.prod`.

**Prerequisite:** Phase B complete — Clerk has verified DNS.

**Idempotency + tenant-drift check:**

Phase C has THREE possible states when re-entered. Detect which one before deciding whether to skip:

```bash
# State 1: .env.prod lacks pk_live_ → Phase C has never run. Proceed normally.
grep -q "^VITE_CLERK_PUBLISHABLE_KEY=pk_live_" .env.prod 2>/dev/null || echo "PHASE_C_FIRST_RUN"

# State 2: .env.prod has pk_live_ but Convex prod doesn't have matching
# CLERK_JWT_ISSUER_DOMAIN / CLERK_WEBHOOK_SECRET → TENANT DRIFT. User likely
# recreated Clerk prod (different tenant ID) or rotated keys.

LOCAL_ISSUER=$(grep "^CLERK_JWT_ISSUER_DOMAIN=" .env.prod 2>/dev/null | cut -d= -f2-)
LOCAL_WEBHOOK=$(grep "^CLERK_WEBHOOK_SECRET=" .env.prod 2>/dev/null | cut -d= -f2-)
DEPLOYED_ISSUER=$(npx convex env get CLERK_JWT_ISSUER_DOMAIN --prod 2>/dev/null || true)
DEPLOYED_WEBHOOK=$(npx convex env get CLERK_WEBHOOK_SECRET --prod 2>/dev/null || true)

if [ -z "$DEPLOYED_ISSUER" ]; then
  echo "PHASE_C_LOCAL_DONE_PHASE_D_PENDING"
elif [ "$LOCAL_ISSUER" != "$DEPLOYED_ISSUER" ] || [ "$LOCAL_WEBHOOK" != "$DEPLOYED_WEBHOOK" ]; then
  echo "DRIFT_DETECTED"
else
  echo "PHASE_C_FULLY_IN_SYNC"
fi
```

**Handling each state:**

- **`PHASE_C_FIRST_RUN`** → proceed to step 1 below.

- **`PHASE_C_LOCAL_DONE_PHASE_D_PENDING`** → user ran Phase C earlier but Convex prod doesn't have env set yet (Phase D hasn't completed). Ask: "Phase C appears done locally but prod env isn't synced. Skip to Phase D?" Default: yes.

- **`PHASE_C_FULLY_IN_SYNC`** → `.env.prod` matches Convex prod exactly. Phase C is done. Ask: "Clerk prod already configured. Skip Phase C? [type 'default' to let me decide sensible defaults]". Default: skip.

- **`DRIFT_DETECTED`** → Clerk credentials in `.env.prod` don't match what's deployed. STOP and print this warning verbatim (do NOT prompt to skip Phase C — drift means re-sync is required):

  ```
  ⚠  TENANT DRIFT DETECTED

  Clerk credentials in .env.prod don't match Convex prod env:

    .env.prod CLERK_JWT_ISSUER_DOMAIN: <LOCAL_ISSUER>
    Convex prod CLERK_JWT_ISSUER_DOMAIN: <DEPLOYED_ISSUER>

    .env.prod CLERK_WEBHOOK_SECRET:    <whsec_...XXXX>  (last 4 chars)
    Convex prod CLERK_WEBHOOK_SECRET:  <whsec_...YYYY>  (last 4 chars)

  Probable cause: you regenerated your Clerk prod instance or rotated keys.
  Tenant ID likely changed, which means FIVE things may need updating:

    1. DKIM CNAMEs (dkim1, dkim2, clkmail, clerk, accounts) — tenant-specific
       targets change. Re-run Phase B step 4 with Clerk dashboard's new targets.
    2. Publishable + Secret keys → push to Vercel prod (Phase D step 5).
    3. JWT Issuer Domain → push to Convex prod (Phase D step 4).
    4. Webhook Signing Secret → push to Convex prod (Phase D step 4).
    5. Webhook Endpoint URL in Clerk dashboard — verify it still points to
       https://<prod-convex>.convex.site/clerk-webhook; re-subscribe to user.*
       events if the old endpoint was deleted.

  Continue and re-sync Convex prod + Vercel prod? (y / n / default)
  ```

  On `y` or `default`: skip the "has .env.prod got pk_live_?" re-check and jump to Phase D (which will push the new `.env.prod` values to both backends). The user is responsible for re-running Phase B step 4 (DNS CNAMEs) if the tenant ID changed — the skill prints the recommendation but can't auto-detect what the NEW tenant's CNAME targets should be (those come from Clerk dashboard).

  On `n`: halt. User fixes `.env.prod` manually (typically by pasting back the old values from Clerk dashboard) and re-runs the skill.

### Steps

### Steps

1. **Domain-typo confirmation.** BEFORE the user creates the Clerk prod instance, echo the domain back and require exact re-entry:

   ```
   About to create a Clerk production instance for:

     <domain>

   Typos BAKE INTO the publishable key and force a full recreation
   (losing tenant ID, all DKIM CNAMEs, webhooks). Type your domain
   back EXACTLY to confirm:
   ```

   Reject if mismatch. This prevents the 30-minute re-do cycle the first-run reporter hit.

2. **Create Clerk prod instance.** User opens Clerk dashboard → toggle to "Production instance" → enter confirmed domain → Create.

3. **Wait for Clerk SSL provisioning** (may already be complete from Phase B step 5).

4. **Configure sign-in methods.** Email (code / magic link) + optional Google. Same as dev.

5. **Create Convex JWT template on prod Clerk.** Configure → JWT Templates → New → Convex preset. Note the new Issuer URL — it's DIFFERENT from the dev issuer.

6. **Create prod webhook endpoint.** Webhooks → Add Endpoint → `https://<prod-convex-deployment>.convex.site/clerk-webhook` (you'll have the prod Convex URL after Phase D step 1 — come back to this). Subscribe to `user.created`, `user.updated`, `user.deleted`. Copy the signing secret (`whsec_...`).

7. **GCP OAuth (optional, prod-only).** If Google sign-in is desired on prod, the user needs their own Google OAuth client (Clerk's shared creds don't apply to prod):

   - Google Cloud Console → APIs & Services → Credentials → Create OAuth 2.0 Client ID → type: **Web application**
   - Authorized redirect URI (paste exactly): `https://clerk.<domain>/v1/oauth_callback`
   - Authorized JS origin: `https://clerk.<domain>`
   - Copy Client ID + Client Secret
   - Clerk dashboard → Social Connections → Google → Custom credentials → paste values

   Skip if user is OK with Email-only prod sign-in (which is fine).

8. **Collect prod Clerk values** (all four — ask one at a time with default-escape NOT offered since these are typed-confirmation secrets):

   - Publishable Key (`pk_live_...`)
   - Secret Key (`sk_live_...`)
   - JWT Issuer Domain (prod issuer URL from step 5)
   - Webhook Signing Secret (`whsec_...` from step 6)

9. **Validate the webhook secret format** before writing anything:

   ```bash
   if [[ ! "$CLERK_WEBHOOK_PROD" =~ ^whsec_ ]]; then
     echo "ERROR: webhook secret must start with whsec_. You probably pasted the URL."
     exit 1
   fi
   ```

10. **Write `.env.prod`** (gitignored via `.env*` rule). `VITE_CONVEX_URL` is filled in Phase D step 3:

    ```bash
    cat > .env.prod <<EOF
    # Substrate production env (gitignored).
    # Source of truth for Convex prod + Vercel prod. Updated via /substrate:deploy.

    # Client-safe
    VITE_CONVEX_URL=
    VITE_CLERK_PUBLISHABLE_KEY=$CLERK_PK_LIVE

    # Server-only
    CLERK_SECRET_KEY=$CLERK_SK_LIVE
    CLERK_JWT_ISSUER_DOMAIN=$CLERK_ISSUER_PROD
    CLERK_WEBHOOK_SECRET=$CLERK_WEBHOOK_PROD
    EOF
    ```

### Phase C checklist

```
Phase C — Prod Clerk Instance
  ✓ Domain confirmed (no typo):   <domain>
  ✓ Prod instance created:        Clerk prod for <domain>
  ✓ SSL cert provisioned:         https://clerk.<domain>
  ✓ Sign-in methods enabled:      Email [+ Google]
  ✓ JWT template created:         Convex preset on prod
  ✓ Webhook endpoint (URL pending prod Convex in Phase D)
  ✓ GCP OAuth configured:         yes/no (optional)
  ✓ Keys in .env.prod:            pk_live_, sk_live_, issuer, whsec_
```

### Gate

"Continue to Phase D (prod Convex + env sync)?". Default: yes.

---

## Phase D — Prod Convex + env sync

**Goal:** create prod Convex deployment, sync `.env.prod` values to Convex prod + Vercel prod (overwriting Phase A's dev-env temps).

**Idempotency check:**

```bash
npx convex env get CLERK_JWT_ISSUER_DOMAIN --prod 2>/dev/null | grep -q . && echo "PHASE_D_LIKELY_DONE"
```

### Steps

1. **Create prod Convex deployment:**

   ```bash
   npx convex deploy
   ```

   Note: `--prod` flag was removed in recent Convex versions — `convex deploy` targets production by default. CI uses `CONVEX_DEPLOY_KEY`; interactive prod pushes refuse piped stdin.

   First run: prompts to create a prod deployment (name usually `project-name-prod`). Convex prints the prod deployment URL.

2. **Finish the Clerk prod webhook endpoint** (deferred from Phase C step 6). Update the endpoint URL in Clerk dashboard to:

   ```
   https://<prod-convex-deployment>.convex.site/clerk-webhook
   ```

   If already set to the dev URL, EDIT it rather than creating a new endpoint.

3. **Update `.env.prod` with prod Convex URL:**

   ```bash
   PROD_CONVEX_URL="<prod-convex-url-from-step-1>"
   # macOS sed
   sed -i '' "s|^VITE_CONVEX_URL=.*|VITE_CONVEX_URL=$PROD_CONVEX_URL|" .env.prod
   # Linux sed
   # sed -i "s|^VITE_CONVEX_URL=.*|VITE_CONVEX_URL=$PROD_CONVEX_URL|" .env.prod
   ```

4. **Push `.env.prod` to Convex prod** (Convex-only env vars — these are NOT pushed to Vercel):

   ```bash
   CLERK_ISSUER=$(grep "^CLERK_JWT_ISSUER_DOMAIN=" .env.prod | cut -d= -f2-)
   CLERK_WEBHOOK=$(grep "^CLERK_WEBHOOK_SECRET=" .env.prod | cut -d= -f2-)
   npx convex env set CLERK_JWT_ISSUER_DOMAIN "$CLERK_ISSUER" --prod
   npx convex env set CLERK_WEBHOOK_SECRET "$CLERK_WEBHOOK" --prod
   ```

5. **Push `.env.prod` to Vercel prod** (overwrites Phase A's dev-env temps). Vercel doesn't have an update-in-place for env vars — remove + re-add:

   ```bash
   for KEY in VITE_CONVEX_URL VITE_CLERK_PUBLISHABLE_KEY CLERK_SECRET_KEY; do
     VAL=$(grep "^${KEY}=" .env.prod | cut -d= -f2-)
     vercel env rm "$KEY" production --yes >/dev/null 2>&1 || true
     printf '%s' "$VAL" | vercel env add "$KEY" production
   done
   ```

   **Do NOT push `CLERK_JWT_ISSUER_DOMAIN` or `CLERK_WEBHOOK_SECRET` to Vercel** — these are Convex-server-only and are already set via step 4.

### Phase D checklist

```
Phase D — Prod Convex + Env Sync
  ✓ Prod Convex deployment:       <prod-convex-url>
  ✓ Webhook endpoint fixed up:    https://<prod-convex>.convex.site/clerk-webhook
  ✓ .env.prod VITE_CONVEX_URL:    updated to prod
  ✓ Convex prod env:              CLERK_JWT_ISSUER_DOMAIN, CLERK_WEBHOOK_SECRET set
  ✓ Vercel prod env (overwrote):  VITE_CONVEX_URL, VITE_CLERK_PUBLISHABLE_KEY, CLERK_SECRET_KEY
```

### Gate

"Continue to Phase E (redeploy + verify)?". Default: yes.

---

## Phase E — Redeploy + verify

**Goal:** redeploy with prod credentials; user confirms end-to-end prod sign-in on the custom domain.

### Steps

1. **Trigger redeploy.** Either:

   ```bash
   vercel --prod --yes
   ```

   OR push an empty commit to trigger Vercel's git integration:

   ```bash
   git commit --allow-empty -m "chore: redeploy with prod env"
   git push origin main
   ```

2. **Wait for build** (~1–3 min).

3. **Verify on custom domain.** Tell the user:

   ```
   Open https://<domain>. Sign in via prod Clerk (Email or Google).
   Confirm you land on an authenticated page with no console errors.

   Did prod sign-in work end-to-end? (y/n)
   ```

4. **If `n`**, diagnose in this order:

   - **Clerk allowlist missing custom domain** → Clerk dashboard → Domains → add `https://<domain>`
   - **Prod Clerk webhook URL mismatches `.env.prod`** → Clerk dashboard → Webhooks → verify endpoint URL matches `https://<prod-convex>.convex.site/clerk-webhook`
   - **Vercel prod env not refreshed** → `vercel env ls production` and re-run Phase D step 5 if values look dev-ish
   - **Convex prod env not set** → `npx convex env get CLERK_JWT_ISSUER_DOMAIN --prod` should return the prod issuer; if empty, re-run Phase D step 4
   - **SPA route 404** → confirm `vercel.json` with SPA rewrite is committed (shipped in the scaffold; if missing, add before redeploying)
   - **Clerk sign-in redirects to `/sign-up/verify-email-address` and 404s** → ensure `<SignIn/>` / `<SignUp/>` use `routing="virtual"` (frontend-doctrine §4.2a)

### Final handoff

```
✔ Substrate production deploy complete.

  Clerk prod:     https://clerk.<domain>
  Convex prod:    <prod-convex-url>
  GitHub:         <repo-url>
  Vercel:         <vercel-url>
  Live URL:       https://<domain>

  Auto-deploy:    enabled — every push to main → rebuild
  Env staging:    .env.prod (gitignored, sync via /substrate:deploy re-run)

Next:
  - git push to redeploy any time
  - /substrate:quick-spec or /substrate:architect-spec to ship features
  - Rotating keys / Clerk tenant changes? Update .env.prod and re-run
    Phase D to sync.
```

---

## Constraints

- MUST verify migration is complete at the stage gate. Deploying the welcome screen is worthless.
- MUST run idempotency check at the start of each phase. If done, offer to skip; don't force re-work.
- MUST print each phase's checklist before the gate. Gates are user-review checkpoints.
- MUST pause at each phase gate for explicit y/n/default approval. Non-negotiable.
- MUST perform domain-typo confirmation before Clerk prod create (Phase C step 1). This is the single biggest footgun in the flow.
- MUST perform tenant-drift detection at Phase C start (diff `.env.prod` against `npx convex env get --prod`). If `DRIFT_DETECTED`, print the full re-sync guidance and do NOT offer to skip Phase C — drift means Convex prod is stale.
- MUST write `.env.prod` in Phase C, read from it in Phase D. `.env.prod` is the source of truth for production env staging.
- MUST NOT commit `.env.prod` — gitignored via `.env*` rule.
- MUST NOT push secret keys (Clerk Secret Key, webhook secret, Convex deploy key) to the client bundle.
- MUST NOT push `CLERK_JWT_ISSUER_DOMAIN` or `CLERK_WEBHOOK_SECRET` as Vite env vars — these are Convex-server-only, set via `npx convex env set ... --prod`.
- MUST NOT force-push to remote main.
- MUST validate the webhook secret format (`^whsec_`) in Phase C step 9 before any write.
- MUST NOT run dev Clerk setup — that belongs to `/substrate:migrate`. If `.env.local` lacks Clerk values, halt and redirect to migrate.
- SHOULD tolerate partial progress: if the user has done some steps manually (e.g. bought the domain via dashboard), skip those steps rather than re-running and overwriting.
- SHOULD narrate context clearly when the user switches between terminal, Clerk dashboard, GCP Console, Vercel dashboard, and DNS provider.
- SHOULD offer the default-escape suffix `[type 'default' to let me decide sensible defaults]` on Socratic questions (repo slug, visibility, domain decisions). Typed confirmations (Clerk keys, domain-name retype) are NOT defaultable — deliberate manual inputs.
