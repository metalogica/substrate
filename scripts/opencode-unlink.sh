#!/usr/bin/env bash
# opencode-unlink.sh — remove ONLY the substrate-owned symlinks from the global
# OpenCode config dir. Never touches real user files. Mirror of scripts/dev-unlink.sh.
#
# Idempotent: re-running after everything is unlinked is a clean no-op.
#
# Usage: bash scripts/opencode-unlink.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SUBSTRATE_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
SRC_CMD="$SUBSTRATE_ROOT/opencode/command/substrate"
SRC_AGENT_DIR="$SUBSTRATE_ROOT/opencode/agent"

CONFIG_DIR="${OPENCODE_CONFIG_DIR:-$HOME/.config/opencode}"

echo "substrate → OpenCode unlink"
echo "  config : $CONFIG_DIR"

removed=0

# unlink_one <expected_src> <dst> — remove dst only if it is a symlink pointing at expected_src.
unlink_one() {
  local expected="$1" dst="$2"
  if [[ -L "$dst" ]]; then
    if [[ "$(readlink "$dst")" == "$expected" ]]; then
      rm "$dst"
      echo "  - $dst"
      removed=$((removed + 1))
    else
      echo "  · $dst (symlink, but not substrate-owned — left alone)"
    fi
  elif [[ -e "$dst" ]]; then
    echo "  · $dst (real file — left alone)"
  fi
}

# Command namespace dir
unlink_one "$SRC_CMD" "$CONFIG_DIR/command/substrate"

# Each agent file substrate owns
shopt -s nullglob
for agent in "$SRC_AGENT_DIR"/*.md; do
  unlink_one "$agent" "$CONFIG_DIR/agent/$(basename "$agent")"
done
shopt -u nullglob

# Tidy now-empty command/agent dirs we may have created (only if empty)
rmdir "$CONFIG_DIR/command" "$CONFIG_DIR/agent" 2>/dev/null || true

if [[ "$removed" -eq 0 ]]; then
  echo "✓ Nothing to remove — already unlinked."
else
  echo "✓ Removed $removed substrate symlink(s). OpenCode no longer sees /substrate/*."
fi
