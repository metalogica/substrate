#!/usr/bin/env bash
# opencode-link.sh — symlink substrate's OpenCode command + agent tree into the
# global OpenCode config dir, giving every OpenCode session the /substrate/* commands
# and the doctrine-architect agent. Mirror of scripts/dev-link.sh (Claude Code).
#
# Idempotent + non-destructive: re-running is a no-op; it refuses to clobber a
# non-symlink (a real user file) and asks you to resolve the collision by hand.
#
# Usage:  bash scripts/opencode-link.sh
# Undo:   bash scripts/opencode-unlink.sh
set -euo pipefail

PINNED_VERSION="1.17.14"

# --- Resolve the substrate source tree (this repo) ---
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SUBSTRATE_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
SRC_CMD="$SUBSTRATE_ROOT/opencode/command/substrate"
SRC_AGENT_DIR="$SUBSTRATE_ROOT/opencode/agent"

if [[ ! -d "$SRC_CMD" ]]; then
  echo "✗ Not found: $SRC_CMD" >&2
  echo "  Run this from a substrate clone that contains opencode/command/substrate." >&2
  exit 1
fi

# --- Resolve the OpenCode config dir (CONVENTIONS.md: ~/.config/opencode) ---
CONFIG_DIR="${OPENCODE_CONFIG_DIR:-$HOME/.config/opencode}"
mkdir -p "$CONFIG_DIR/command" "$CONFIG_DIR/agent"

echo "substrate → OpenCode link"
echo "  source : $SUBSTRATE_ROOT/opencode"
echo "  config : $CONFIG_DIR"

# --- Version pin warning (FMEA #2) ---
if command -v opencode >/dev/null 2>&1; then
  CUR="$(opencode --version 2>/dev/null | tr -d '[:space:]')"
  PIN_MM="${PINNED_VERSION%.*}"; CUR_MM="${CUR%.*}"
  if [[ -n "$CUR" && "$CUR_MM" != "$PIN_MM" ]]; then
    echo "  ⚠ OpenCode $CUR differs from pinned $PINNED_VERSION (opencode/CONVENTIONS.md)." >&2
    echo "    Conventions were verified against $PINNED_VERSION; re-verify if commands misbehave." >&2
  else
    echo "  version: $CUR (pinned $PINNED_VERSION)"
  fi
fi

# link_one <src> <dst> — symlink src→dst; skip if already correct; refuse to clobber a real file.
link_one() {
  local src="$1" dst="$2"
  if [[ -L "$dst" ]]; then
    if [[ "$(readlink "$dst")" == "$src" ]]; then
      echo "  = $dst (already linked)"
      return 0
    fi
    rm "$dst"                       # our own stale symlink — safe to replace
  elif [[ -e "$dst" ]]; then
    echo "  ✗ Refusing to overwrite non-symlink: $dst" >&2
    echo "    Move/remove it, then re-run. (substrate never deletes user files.)" >&2
    return 1
  fi
  ln -s "$src" "$dst"
  echo "  + $dst → $src"
}

# Commands: link the whole substrate/ namespace dir → <config>/command/substrate
link_one "$SRC_CMD" "$CONFIG_DIR/command/substrate"

# Agents: link each *.md individually → <config>/agent/<name>.md
shopt -s nullglob
for agent in "$SRC_AGENT_DIR"/*.md; do
  link_one "$agent" "$CONFIG_DIR/agent/$(basename "$agent")"
done
shopt -u nullglob

echo ""
echo "✓ Linked. OpenCode now sees /substrate/* commands and the doctrine-architect agent."
echo "  Verify: opencode agent list | grep doctrine-architect"
echo ""
echo "  Note: init/adopt/migrate need SUBSTRATE_ROOT set to this clone:"
echo "        export SUBSTRATE_ROOT=$SUBSTRATE_ROOT"
echo "  Orchestrator commands (architect-spec, migrate) need the executing agent to"
echo "  have permission.task: allow to dispatch the doctrine-architect subagent."
