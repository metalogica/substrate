#!/usr/bin/env bash
# Initializes a git repo, creates a GitHub repo, pushes initial commit.
#
# Arguments:
#   $1 — repo name (e.g. my-project)
#   $2 — visibility: "public" or "private" (default: private)
#
# Requires: gh CLI installed and authenticated (`gh auth login`).

set -euo pipefail

REPO_NAME="${1:?repo name required}"
VISIBILITY="${2:-private}"

if ! command -v gh >/dev/null 2>&1; then
  echo "ERROR: gh CLI is required. Install from https://cli.github.com/" >&2
  exit 1
fi

if ! gh auth status >/dev/null 2>&1; then
  echo "ERROR: gh is not authenticated. Run 'gh auth login' first." >&2
  exit 1
fi

case "$VISIBILITY" in
  public|private)
    ;;
  *)
    echo "ERROR: visibility must be 'public' or 'private' (got: $VISIBILITY)" >&2
    exit 1
    ;;
esac

# Initialize git if not already a repo
if [ ! -d .git ]; then
  git init -q
  git branch -M main
fi

# Stage + commit if there are changes
git add -A
if ! git diff --cached --quiet; then
  git commit -q -m "chore: initial substrate scaffold"
fi

# Create remote + push
gh repo create "$REPO_NAME" --source=. --"$VISIBILITY" --push

REPO_URL=$(gh repo view --json url -q .url)
echo ""
echo "✔ GitHub repo created: $REPO_URL"
