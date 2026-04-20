#!/usr/bin/env bash
# Links the current directory to a Vercel project and connects git for auto-deploy.
#
# Arguments:
#   $1 — Vercel project slug (defaults to current directory name)
#
# Requires: vercel CLI installed and authenticated (`vercel login`).

set -euo pipefail

PROJECT_SLUG="${1:-$(basename "$PWD")}"

if ! command -v vercel >/dev/null 2>&1; then
  echo "ERROR: Vercel CLI is required. Install with: pnpm add -g vercel" >&2
  exit 1
fi

# Link (creates the Vercel project if it doesn't exist yet)
vercel link --yes --project "$PROJECT_SLUG"

# Connect git (so pushes auto-deploy)
if git remote get-url origin >/dev/null 2>&1; then
  GITHUB_URL=$(git remote get-url origin)
  vercel git connect "$GITHUB_URL" --yes || true
else
  echo "WARN: no 'origin' git remote found. Run scripts/init-github.sh first." >&2
fi

echo ""
echo "✔ Vercel linked to project: $PROJECT_SLUG"
echo ""
echo "Next: set environment variables in Vercel:"
echo "  vercel env add VITE_CONVEX_URL production"
echo "  vercel env add VITE_CLERK_PUBLISHABLE_KEY production"
echo "  vercel env add CLERK_SECRET_KEY production"
echo ""
echo "Or use the dashboard: https://vercel.com/dashboard"
