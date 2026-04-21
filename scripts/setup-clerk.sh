#!/usr/bin/env bash
# Walks the user through Clerk setup: prompts for keys, writes .env.local,
# sets Convex env vars.
#
# Run from a substrate project root (typically during /substrate:deploy).

set -euo pipefail

cat <<'EOF'
==============================================
  Substrate — Clerk + Convex Auth Setup
==============================================

Step 1. Create a Clerk application (if you haven't):
  → https://dashboard.clerk.com/
  → 'Create application'
  → Enable these sign-in methods:
      • Email (code OR magic link) — recommended default for substrate.
        No Google Cloud setup. Works in dev AND prod.
      • Google (optional). DEV instances use Clerk's shared OAuth
        credentials — zero setup. PROD instances require your own
        Google Cloud OAuth 2.0 Client ID and redirect URI
        https://clerk.<your-domain>/v1/oauth_callback.

Step 2. Create a Convex JWT template:
  → In Clerk dashboard: 'Configure → JWT Templates'
  → Click 'New template' and choose 'Convex' from the presets.

Step 3. Create a webhook endpoint for Clerk → Convex user sync:
  → In Clerk dashboard: 'Webhooks → Add Endpoint'
  → Endpoint URL: https://<your-convex-deployment>.convex.site/clerk-webhook
    (replace <your-convex-deployment> with the subdomain from VITE_CONVEX_URL)
  → Subscribe to: user.created, user.updated, user.deleted
  → Copy the SIGNING SECRET (starts with `whsec_`) — NOT the URL.

Step 4. Collect these values from the Clerk dashboard:
  - Publishable Key         (API Keys → pk_test_... or pk_live_...)
  - Secret Key              (API Keys → sk_test_... or sk_live_...)
  - JWT Issuer Domain       (Configure → JWT Templates → Convex → Issuer URL)
  - Webhook Signing Secret  (Webhooks → your endpoint → Signing Secret,
                             MUST start with whsec_)

EOF

read -rp "Press [Enter] once you have all four values ready: "
echo ""

read -rp "Publishable Key (pk_...): " CLERK_PK
read -rp "Secret Key (sk_...): " CLERK_SK
read -rp "JWT Issuer Domain (https://...clerk.accounts.dev): " CLERK_ISSUER
read -rp "Webhook Signing Secret (whsec_...): " CLERK_WEBHOOK

# Validate webhook secret format before anything else — common paste
# error is the webhook URL, which surfaces only at runtime as an opaque
# Base64Coder error inside svix verification.
if [[ ! "$CLERK_WEBHOOK" =~ ^whsec_ ]]; then
  echo ""
  echo "ERROR: CLERK_WEBHOOK_SECRET must start with 'whsec_'." >&2
  echo "You likely pasted the webhook URL. The SECRET is a separate field" >&2
  echo "in the Clerk dashboard on the webhook endpoint page." >&2
  exit 1
fi

# Preserve existing VITE_CONVEX_URL if .env.local already has one
EXISTING_CONVEX_URL=""
if [ -f .env.local ]; then
  EXISTING_CONVEX_URL=$(grep -E "^VITE_CONVEX_URL=" .env.local | head -1 | cut -d'=' -f2- || true)
fi

cat > .env.local <<EOF
# Client-safe
VITE_CONVEX_URL=${EXISTING_CONVEX_URL}
VITE_CLERK_PUBLISHABLE_KEY=${CLERK_PK}

# Server-only (NEVER commit)
CLERK_SECRET_KEY=${CLERK_SK}
CLERK_JWT_ISSUER_DOMAIN=${CLERK_ISSUER}
CLERK_WEBHOOK_SECRET=${CLERK_WEBHOOK}
EOF

echo ""
echo "✔ Wrote .env.local"

# Set Convex env vars (requires at least one successful `convex dev` run)
if command -v npx >/dev/null 2>&1; then
  echo ""
  echo "Setting Convex env vars..."
  if npx convex env set CLERK_JWT_ISSUER_DOMAIN "$CLERK_ISSUER" 2>/dev/null; then
    echo "✔ CLERK_JWT_ISSUER_DOMAIN set"
  else
    echo "  (skipped CLERK_JWT_ISSUER_DOMAIN — run 'npx convex dev' first, then re-run this script)"
  fi
  if npx convex env set CLERK_WEBHOOK_SECRET "$CLERK_WEBHOOK" 2>/dev/null; then
    echo "✔ CLERK_WEBHOOK_SECRET set"
  else
    echo "  (skipped CLERK_WEBHOOK_SECRET — run 'npx convex dev' first, then re-run this script)"
  fi
fi

echo ""
echo "✔ Clerk setup complete."
echo ""
echo "Next: run 'pnpm app:dev' and 'pnpm convex:dev' in two separate terminals."
