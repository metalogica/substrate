#!/usr/bin/env bash
# Remove the dev-mode symlink and trigger a fresh reinstall from the marketplace.
#
# Run this before cutting a release so the release is tested against a clean
# copied install, not a live-linked source tree. Also run it whenever you want
# to temporarily run against the released version on this machine.
#
# After this script, run `/reload-plugins` in any active Claude Code session
# (or restart the session) to pick up the reinstalled copy.

set -euo pipefail

MARKETPLACE="metalogica"
PLUGIN="substrate"
CACHE_BASE="${HOME}/.claude/plugins/cache/${MARKETPLACE}/${PLUGIN}"

if [ ! -d "${CACHE_BASE}" ]; then
  echo "ERROR: no cache directory found at ${CACHE_BASE}." >&2
  echo "Substrate is not installed. Nothing to unlink." >&2
  exit 1
fi

VERSION_COUNT="$(find "${CACHE_BASE}" -mindepth 1 -maxdepth 1 | wc -l | tr -d ' ')"
if [ "${VERSION_COUNT}" != "1" ]; then
  echo "ERROR: expected exactly one version directory under ${CACHE_BASE}, found ${VERSION_COUNT}." >&2
  ls -la "${CACHE_BASE}" >&2
  exit 1
fi

VERSION_DIR="$(find "${CACHE_BASE}" -mindepth 1 -maxdepth 1)"

if [ ! -L "${VERSION_DIR}" ]; then
  echo "Already unlinked: ${VERSION_DIR} is a normal directory, not a symlink."
  echo "Nothing to do."
  exit 0
fi

echo "Removing dev symlink: ${VERSION_DIR} -> $(readlink "${VERSION_DIR}")"
rm "${VERSION_DIR}"

echo
echo "Triggering fresh install from marketplace..."
if ! command -v claude >/dev/null 2>&1; then
  echo "ERROR: 'claude' CLI not found in PATH." >&2
  echo "Re-install manually inside Claude Code:" >&2
  echo "    /plugin marketplace update ${MARKETPLACE}" >&2
  echo "    /plugin install ${PLUGIN}@${MARKETPLACE}" >&2
  echo "    /reload-plugins" >&2
  exit 1
fi

claude plugin marketplace update "${MARKETPLACE}"
claude plugin install "${PLUGIN}@${MARKETPLACE}"

echo
echo "Done. Substrate is reinstalled as a copied cache directory."
echo "Run /reload-plugins in any Claude Code session to pick up the clean install."
