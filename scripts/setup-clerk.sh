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
  → Enable 'Email' and 'Google' as sign-in methods (Google uses Clerk's
    shared OAuth credentials in development — zero Google Cloud setup).

Step 2. Create a Convex JWT template:
  → In Clerk dashboard: 'Configure → JWT Templates'
  → Click 'New template' and choose 'Convex' from the presets.

Step 3. Collect these values from the Clerk dashboard:
  - Publishable Key         (API Keys → pk_test_... or pk_live_...)
  - Secret Key              (API Keys → sk_test_... or sk_live_...)
  - JWT Issuer Domain       (Configure → JWT Templates → Convex → Issuer URL)

EOF

read -rp "Press [Enter] once you have all three values ready: "
echo ""

read -rp "Publishable Key (pk_...): " CLERK_PK
read -rp "Secret Key (sk_...): " CLERK_SK
read -rp "JWT Issuer Domain (https://...clerk.accounts.dev): " CLERK_ISSUER

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
EOF

echo ""
echo "✔ Wrote .env.local"

# Set Convex env var (requires at least one successful `convex dev` run)
if command -v npx >/dev/null 2>&1; then
  echo ""
  echo "Setting Convex env var CLERK_JWT_ISSUER_DOMAIN..."
  if npx convex env set CLERK_JWT_ISSUER_DOMAIN "$CLERK_ISSUER" 2>/dev/null; then
    echo "✔ Convex env var set"
  else
    echo "  (skipped — run 'npx convex dev' first to initialize Convex, then re-run this script)"
  fi
fi

echo ""
echo "✔ Clerk setup complete."
echo ""
echo "Next: run 'pnpm app:dev' and 'pnpm convex:dev' in two separate terminals."
