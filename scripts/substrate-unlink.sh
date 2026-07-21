#!/usr/bin/env bash
# substrate-unlink.sh — remove the `substrate` CLI symlink created by
# substrate-link.sh. Only removes a link that points at THIS repo's binary.
#
#   scripts/substrate-unlink.sh [BIN_DIR]    # default BIN_DIR: ~/.local/bin
#                                            # (or set SUBSTRATE_BIN_DIR)
set -euo pipefail

here="$(cd -P "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
root="$(dirname "$here")"
BIN="$root/scripts/substrate"
BIN_DIR="${1:-${SUBSTRATE_BIN_DIR:-$HOME/.local/bin}}"
LINK="$BIN_DIR/substrate"

if [ -L "$LINK" ]; then
  target="$(readlink "$LINK")"
  if [ "$target" = "$BIN" ]; then
    rm "$LINK"; echo "unlinked: $LINK"
  else
    echo "substrate-unlink: $LINK points to $target, not this repo's binary — leaving it." >&2
    exit 1
  fi
elif [ -e "$LINK" ]; then
  echo "substrate-unlink: $LINK exists but is not a symlink — leaving it." >&2
  exit 1
else
  echo "substrate-unlink: nothing to remove at $LINK"
fi
