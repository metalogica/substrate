#!/usr/bin/env bash
# Swap the installed plugin cache directory for a symlink to the source repo,
# enabling hot-reload of substrate during development.
#
# Prerequisite: substrate must already be installed via the marketplace:
#   /plugin marketplace add <source>    (local path for dev, or metalogica/substrate)
#   /plugin install substrate@metalogica
#
# After running this script, edits to any file in the source repo become
# visible to every Claude Code session after `/reload-plugins` — no reinstall
# required.
#
# To return to a clean install (e.g. before cutting a release), run
# scripts/dev-unlink.sh.

set -euo pipefail

MARKETPLACE="metalogica"
PLUGIN="substrate"
CACHE_BASE="${HOME}/.claude/plugins/cache/${MARKETPLACE}/${PLUGIN}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

if [ ! -f "${REPO_ROOT}/.claude-plugin/plugin.json" ]; then
  echo "ERROR: ${REPO_ROOT} does not look like the substrate repo (no .claude-plugin/plugin.json)." >&2
  exit 1
fi

if [ ! -d "${CACHE_BASE}" ]; then
  echo "ERROR: substrate is not installed in Claude Code." >&2
  echo "Install it first:" >&2
  echo "    /plugin marketplace add ${REPO_ROOT}" >&2
  echo "    /plugin install ${PLUGIN}@${MARKETPLACE}" >&2
  echo "    /reload-plugins" >&2
  echo "Then re-run this script." >&2
  exit 1
fi

VERSION_COUNT="$(find "${CACHE_BASE}" -mindepth 1 -maxdepth 1 | wc -l | tr -d ' ')"
if [ "${VERSION_COUNT}" != "1" ]; then
  echo "ERROR: expected exactly one version directory under ${CACHE_BASE}, found ${VERSION_COUNT}." >&2
  echo "Contents:" >&2
  ls -la "${CACHE_BASE}" >&2
  exit 1
fi

VERSION_DIR="$(find "${CACHE_BASE}" -mindepth 1 -maxdepth 1)"
VERSION_NAME="$(basename "${VERSION_DIR}")"

if [ -L "${VERSION_DIR}" ]; then
  CURRENT_TARGET="$(readlink "${VERSION_DIR}")"
  if [ "${CURRENT_TARGET}" = "${REPO_ROOT}" ]; then
    echo "Already linked:"
    echo "    ${VERSION_DIR} -> ${REPO_ROOT}"
    echo "Run /reload-plugins in any Claude Code session to pick up edits."
    exit 0
  fi
  echo "ERROR: ${VERSION_DIR} is a symlink pointing elsewhere: ${CURRENT_TARGET}" >&2
  echo "Refusing to overwrite. Inspect and run scripts/dev-unlink.sh first if desired." >&2
  exit 1
fi

echo "Replacing copied plugin cache with symlink to source:"
echo "    ${VERSION_DIR}"
echo "  → ${REPO_ROOT}"

rm -rf "${VERSION_DIR}"
ln -s "${REPO_ROOT}" "${VERSION_DIR}"

echo
echo "Done. Plugin version ${VERSION_NAME} is now linked to ${REPO_ROOT}."
echo "In any Claude Code session, run /reload-plugins to pick up edits."
echo
echo "Notes:"
echo "  - Edits, branch switches, and uncommitted WIP in ${REPO_ROOT} are all visible."
echo "  - Do NOT bump .claude-plugin/plugin.json#version during dev — the cache path is keyed by ${VERSION_NAME}."
echo "  - Before cutting a release, run scripts/dev-unlink.sh to restore a normal install and test cleanly."
