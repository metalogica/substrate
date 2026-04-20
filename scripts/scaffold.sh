#!/usr/bin/env bash
# Scaffolds a new substrate project in the current directory.
# Copies the template tree, installs deps, runs first test.
#
# Called by the substrate-init SKILL after Socratic Q&A completes.
#
# Arguments:
#   $1 — project name (used in package.json, README.md, index.html)
#   $2 — one-line description (used in README.md)
#
# Environment:
#   SUBSTRATE_ROOT — absolute path to the substrate plugin directory

set -euo pipefail

PROJECT_NAME="${1:?project name required (e.g. my-app)}"
PROJECT_DESC="${2:-A Substrate project.}"
SUBSTRATE_ROOT="${SUBSTRATE_ROOT:?SUBSTRATE_ROOT env var must be set to the substrate plugin directory}"

if [ ! -d "$SUBSTRATE_ROOT/references/templates" ]; then
  echo "ERROR: templates not found at $SUBSTRATE_ROOT/references/templates" >&2
  exit 1
fi

# Copy the template tree, INCLUDING dotfiles (the trailing /. forces dotglob)
cp -R "$SUBSTRATE_ROOT/references/templates/." ./

# Copy doctrines into docs/doctrine/
mkdir -p docs/doctrine
cp "$SUBSTRATE_ROOT/references/doctrines/"*.md docs/doctrine/

# Copy SDD protocol into docs/protocol/sdd/
mkdir -p docs/protocol/sdd
cp -R "$SUBSTRATE_ROOT/references/sdd-protocol/." docs/protocol/sdd/

# Portable sed in-place (macOS vs GNU)
if [ "$(uname)" = "Darwin" ]; then
  SED_INPLACE=(sed -i "")
else
  SED_INPLACE=(sed -i)
fi

# Escape the substitution values for sed
ESC_NAME=$(printf '%s' "$PROJECT_NAME" | sed -e 's/[\/&]/\\&/g')
ESC_DESC=$(printf '%s' "$PROJECT_DESC" | sed -e 's/[\/&]/\\&/g')

# Substitute {{PROJECT_NAME}} and {{PROJECT_DESCRIPTION}} in root files
for f in package.json README.md index.html; do
  if [ -f "$f" ]; then
    "${SED_INPLACE[@]}" \
      -e "s/{{PROJECT_NAME}}/$ESC_NAME/g" \
      -e "s/{{PROJECT_DESCRIPTION}}/$ESC_DESC/g" \
      "$f"
  fi
done

# Install dependencies
echo ""
echo "Installing dependencies with pnpm..."
pnpm install

# Verify green
echo ""
echo "Typechecking..."
pnpm app:compile

echo ""
echo "Running tests..."
pnpm app:test

echo ""
echo "✔ Substrate scaffold complete."
echo "  Project: $PROJECT_NAME"
echo "  Kernel: domain/ + test/ + docs/doctrine/ + docs/protocol/sdd/"
echo ""
echo "Next steps:"
echo "  1. bash \$SUBSTRATE_ROOT/scripts/init-github.sh $PROJECT_NAME"
echo "  2. Open aistudio.google.com → Build, paste docs/product/ai-studio-prompt.md, download ZIP into /prototype"
echo "  3. Run /substrate-migrate"
