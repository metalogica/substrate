#!/usr/bin/env bash
# substrate prerequisites — CLI tools for Phase 0 → Phase 2.
#
# Scope: macOS + Linux only. External accounts (Convex, Clerk, Vercel,
# GitHub org, disk on deploy target) are tracked separately — see the
# accounts-check feature.
#
# Exit codes:
#   0 — no critical failures (warnings OK)
#   1 — one or more required tools missing or too old

set -u  # fail on unset vars; DO NOT set -e — we surface all failures

# --- Version gates (bump as substrate evolves) ----------------------
NODE_MIN=20
PNPM_MIN=10

# --- Colors (tty-aware) --------------------------------------------
if [ -t 1 ]; then
  GREEN='\033[0;32m'
  RED='\033[0;31m'
  YELLOW='\033[0;33m'
  NC='\033[0m'
else
  GREEN=''; RED=''; YELLOW=''; NC=''
fi

# --- OS-aware install hints ----------------------------------------
if [ "$(uname)" = "Darwin" ]; then
  HINT_GH="brew install gh"
  HINT_PNPM="brew install pnpm  (or: npm i -g pnpm@${PNPM_MIN})"
  HINT_GIT="xcode-select --install"
  HINT_NODE="install via nvm / asdf / fnm / brew"
else
  HINT_GH="use your package manager (apt / dnf / pacman)"
  HINT_PNPM="npm i -g pnpm@${PNPM_MIN}"
  HINT_GIT="use your package manager"
  HINT_NODE="install via nvm / asdf / fnm / your pkg manager"
fi

FAIL=0
WARN=0

pass() { printf "  ${GREEN}✓${NC} %-12s %s\n" "$1" "$2"; }
fail() { printf "  ${RED}✗${NC} %-12s → %s\n" "$1" "$2"; FAIL=$((FAIL + 1)); }
warn() { printf "  ${YELLOW}⚠${NC} %-12s → %s\n" "$1" "$2"; WARN=$((WARN + 1)); }

echo ""
echo "Substrate prerequisites — CLI tools for Phase 0 → 2"
echo ""

# --- git -----------------------------------------------------------
if command -v git >/dev/null 2>&1; then
  pass "git" "$(git --version | awk '{print $3}')"
else
  fail "git" "$HINT_GIT"
fi

# --- node (version gated) ------------------------------------------
if command -v node >/dev/null 2>&1; then
  NODE_VERSION=$(node --version | sed 's/^v//')
  NODE_MAJOR=$(echo "$NODE_VERSION" | cut -d. -f1)
  if [ "$NODE_MAJOR" -ge "$NODE_MIN" ] 2>/dev/null; then
    pass "node" "v${NODE_VERSION} (≥ v${NODE_MIN})"
  else
    fail "node" "v${NODE_VERSION} — need ≥ v${NODE_MIN}; ${HINT_NODE}"
  fi
else
  fail "node" "not found; ${HINT_NODE}"
fi

# --- pnpm (corepack-shim safe via actual --version call) -----------
PNPM_VERSION=$(pnpm --version 2>/dev/null || true)
if [ -n "$PNPM_VERSION" ]; then
  PNPM_MAJOR=$(echo "$PNPM_VERSION" | cut -d. -f1)
  if [ "$PNPM_MAJOR" -ge "$PNPM_MIN" ] 2>/dev/null; then
    pass "pnpm" "v${PNPM_VERSION} (≥ v${PNPM_MIN})"
  else
    fail "pnpm" "v${PNPM_VERSION} — need ≥ v${PNPM_MIN}; ${HINT_PNPM}"
  fi
else
  fail "pnpm" "not found; ${HINT_PNPM}"
fi

# --- npx (ships with node; sanity check) ---------------------------
if command -v npx >/dev/null 2>&1; then
  pass "npx" "available"
else
  fail "npx" "missing — your node install is broken; reinstall node"
fi

# --- gh (warn-only; needed by init step 8 for github push) ---------
if command -v gh >/dev/null 2>&1; then
  pass "gh" "$(gh --version 2>/dev/null | head -1 | awk '{print $3}')"
  if gh auth status >/dev/null 2>&1; then
    pass "gh auth" "authenticated"
  else
    warn "gh auth" "not authenticated — run: gh auth login"
  fi
else
  warn "gh" "not installed — ${HINT_GH}"
fi

echo ""
if [ "$FAIL" -eq 0 ] && [ "$WARN" -eq 0 ]; then
  printf "${GREEN}✔ All prerequisites met.${NC}\n"
elif [ "$FAIL" -eq 0 ]; then
  printf "${YELLOW}⚠ ${WARN} warning(s). Safe to proceed; fix later if you hit them.${NC}\n"
else
  printf "${RED}✗ ${FAIL} critical missing. Fix the items above before /substrate:init.${NC}\n"
fi

echo ""
echo "Note: CLI tools only. Accounts (Convex, Clerk, Vercel, GitHub org,"
echo "disk on deploy target) are tracked separately."
echo ""

[ "$FAIL" -eq 0 ]
