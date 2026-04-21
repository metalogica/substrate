---
name: deploy
description: "Stage 3 deploy pipeline for substrate projects. Walks the user through Clerk setup (no Google Cloud Console required — Clerk's dev instance uses shared OAuth credentials), wires Clerk keys into .env.local and Convex env vars, ensures the repo is on GitHub, links Vercel for auto-deploy-on-push, pushes production env vars, and triggers the first deploy. Invoke after /substrate:migrate once the migrated app runs locally."
---

# /substrate:deploy

Get a migrated substrate project from localhost to a live Vercel URL. Clerk + Vercel setup, production env, first deploy.

**Heads up:** this is an interactive, multi-terminal operation. Several steps require the user to open Clerk/Vercel/GitHub in their browser or run servers in separate terminals. Narrate each pause clearly.

## When to run

- Migration has completed (`/substrate:migrate`) — `src/` contains real product content, not the substrate welcome screen.
- Convex schema + functions exist, `_generated/` is present (codegen has run).
- The user wants live Clerk auth + a shared URL to demo the app.

## When to REFUSE

| Signal | Redirect |
|--------|----------|
| `src/App.tsx` still shows the substrate welcome screen | Migration hasn't run. Use `/substrate:migrate` first. |
| `convex/_generated/` missing | Run `npx convex dev` once to generate types before deploying. |
| `.env.local` already has valid Clerk keys AND `.vercel/project.json` exists | Deploy has already run. Use `/substrate:quick-spec` for further iteration, or explicitly confirm the user wants to re-run. |

## Workflow

### Step 1. Stage sanity check

```bash
test -f package.json \
  && test -d convex/_generated \
  && ! grep -q "Substrate project initialized" src/App.tsx \
  || echo "STAGE_MISMATCH"
```

If output is `STAGE_MISMATCH`, stop and redirect.

Resolve `SUBSTRATE_ROOT` (same search pattern as `/substrate:init`):

```bash
for candidate in \
  "$HOME/.claude/plugins/substrate" \
  "$PWD/.claude/plugins/substrate" \
  "${SUBSTRATE_ROOT:-}"; do
  if [ -n "$candidate" ] && [ -f "$candidate/scripts/setup-clerk.sh" ]; then
    echo "FOUND: $candidate"
    break
  fi
done
```

### Step 2. Clerk setup

Invoke the interactive Clerk setup script:

```bash
bash "$SUBSTRATE_ROOT/scripts/setup-clerk.sh"
```

The script walks the user through:

- Creating a Clerk application at `https://dashboard.clerk.com/`.
- Enabling Email + Google sign-in (Google works in development with Clerk's shared OAuth credentials — **no Google Cloud Console required**).
- Creating a "Convex" JWT template in Clerk's JWT Templates section.
- Collecting the Publishable Key, Secret Key, and JWT Issuer Domain.
- Writing them to `.env.local`.
- Running `npx convex env set CLERK_JWT_ISSUER_DOMAIN <...>`.

If the script exits non-zero, stop and surface the error.

### Step 3. Verify Convex is current

Ensure the Convex deployment is in sync with the new auth config:

```bash
npx convex deploy
```

If this is the first deploy, it will prompt the user to create a deployment. If it errors because `npx convex dev` hasn't run yet, tell the user to run `npx convex dev` in another terminal and wait for "Convex functions ready!" before re-running.

Capture the Convex deployment URL from `.env.local` (the line `VITE_CONVEX_URL=...`):

```bash
grep -E "^VITE_CONVEX_URL=" .env.local | cut -d'=' -f2-
```

If the value is empty, stop and ask the user to run `npx convex dev` first.

### Step 4. Local smoke test

Before touching Vercel, confirm auth works on localhost.

Tell the user:

```
Local smoke test — please run these in two separate terminals:

  Terminal 1:  pnpm convex:dev
  Terminal 2:  pnpm app:dev

Then open http://localhost:5173 and:
  1. Click "Sign in" (or equivalent).
  2. Complete Clerk's Google sign-in flow.
  3. Verify you land on an authenticated page with no console errors.

Did sign-in work end-to-end? (y / n)
```

Wait for explicit confirmation. If `n`, ask what went wrong — common issues:

- `auth.config.ts` references wrong `CLERK_JWT_ISSUER_DOMAIN` → re-run setup-clerk.sh.
- `main.tsx` not wrapped in `ConvexProviderWithClerk` → migrate should have done this; double-check.
- No users table row after sign-in → may need a `convex/users.ts` mutation to sync Clerk users on first sign-in. Flag to the user; this might be a /substrate:quick-spec feature to add before deploying.

### Step 5. Ensure the repo is on GitHub

Check for a remote:

```bash
git remote get-url origin 2>/dev/null || echo "NO_REMOTE"
```

If `NO_REMOTE`, ask the user for a repo name and visibility (end each question with `[type 'default' to let me decide sensible defaults]` — default repo name is the project slug from `package.json#name`; default visibility is `private`), then run:

```bash
bash "$SUBSTRATE_ROOT/scripts/init-github.sh" "<repo-name>" "<public|private>"
```

If the remote exists, make sure local `main` is ahead or in sync:

```bash
git status --porcelain
git rev-list --left-right --count origin/main...HEAD
```

Commit any pending work before proceeding to Vercel.

### Step 6. Connect Vercel

Invoke the link script:

```bash
bash "$SUBSTRATE_ROOT/scripts/connect-vercel.sh" "<project-slug>"
```

This:
- `vercel link` creates/links the Vercel project.
- `vercel git connect` wires auto-deploy on push.

If the user isn't logged in to Vercel, the script will prompt them. If `vercel` isn't installed, it prints the install command (`pnpm add -g vercel`).

### Step 7. Push production env vars

Read values from `.env.local` and push them to Vercel's production environment. Run these one at a time (the user is prompted per value — Vercel CLI's design):

```bash
# Client-safe
vercel env add VITE_CONVEX_URL production < <(grep -E "^VITE_CONVEX_URL=" .env.local | cut -d'=' -f2-)
vercel env add VITE_CLERK_PUBLISHABLE_KEY production < <(grep -E "^VITE_CLERK_PUBLISHABLE_KEY=" .env.local | cut -d'=' -f2-)

# Server-only (used by Vercel edge / SSR in future; safe to push for now)
vercel env add CLERK_SECRET_KEY production < <(grep -E "^CLERK_SECRET_KEY=" .env.local | cut -d'=' -f2-)
```

If the stdin redirection form doesn't work on the user's shell, fall back to printing a list of `vercel env add ...` commands for them to run manually.

**Do NOT push `CLERK_JWT_ISSUER_DOMAIN` to Vercel** — that's a Convex env var, not a Vite env var, and is already set via `npx convex env set` in step 2.

### Step 8. Trigger the first deploy

Make sure the working tree is clean, then push `main`:

```bash
git status --porcelain
git push origin main
```

Vercel's git integration will detect the push and start a build. The skill prints the expected build URL:

```
Deploy triggered. Watch build progress at:
  https://vercel.com/<team>/<project>

Or tail the log:
  vercel logs --follow
```

### Step 9. Verify the live URL

Ask the user:

```
Once the Vercel build finishes (~1–3 min), the live URL should be:

  https://<project>.vercel.app

Open it, sign in, and confirm the app works end-to-end.

Did the deploy succeed? (y / n)
```

If `n`, ask for the failure signal (build error / runtime error / auth error) and debug. Common issues:

- `VITE_CLERK_PUBLISHABLE_KEY` missing in production → re-run step 7.
- Clerk redirect URL not allowlisted → add the Vercel URL in Clerk dashboard → "Domains".
- Convex deploy lag → confirm `npx convex deploy --prod` has run.

### Step 10. Commit + handoff

Stage any changes from deploy (mostly none — scripts don't write to tracked files), then print the final status:

```
✔ Substrate deploy complete.

  Clerk app:       <dashboard URL>
  GitHub repo:     <repo URL>
  Vercel project:  <vercel URL>
  Live URL:        https://<project>.vercel.app

  Auto-deploy:     enabled (every push to main → rebuild)

Next steps:
  - Add the Vercel URL to Clerk's allowlisted domains if not done
  - Use /substrate:quick-spec or /substrate:architect-spec to ship more features
  - Consider upgrading to a dedicated production Convex deployment
    later via `npx convex deploy --prod`
```

## Constraints

- MUST stage-check before running any deploy steps — deploying the welcome screen is worthless.
- MUST run the local smoke test (step 4) before pushing to Vercel. Deploying broken local auth wastes a build cycle and confuses the user.
- MUST pause at every interactive step and wait for user confirmation — Clerk dashboard, local sign-in, Vercel build, live URL check.
- MUST source env values from `.env.local` rather than asking the user to re-type them during Vercel env push.
- MUST NOT push secret keys (Clerk Secret Key, Convex deploy key) to the client bundle or commit them to the repo.
- MUST NOT push `CLERK_JWT_ISSUER_DOMAIN` as a Vite env var — it's Convex-server-only.
- MUST NOT force-push or overwrite the user's remote main.
- SHOULD narrate clearly between interactive pauses — the user is switching between browser, terminal, and Claude, and needs to know which context they're in.
- SHOULD tolerate partial progress — if the user has already done steps 2 or 5 manually, skip them rather than re-running and overwriting.
- MUST offer the default-escape suffix `[type 'default' to let me decide sensible defaults]` on any Socratic question (repo name, visibility, domain choice). Typed confirmations (Clerk key entry, domain-name retype for `vercel domains buy`) are NOT defaultable — those are deliberate manual inputs by design.
