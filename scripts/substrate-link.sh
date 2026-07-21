#!/usr/bin/env bash
# substrate-link.sh — put the `substrate` CLI on your PATH by symlinking the
# in-repo binary into a bin dir. Idempotent; reverse with substrate-unlink.sh.
# The binary is self-locating, so the symlink keeps working from anywhere.
#
#   scripts/substrate-link.sh [BIN_DIR]      # default BIN_DIR: ~/.local/bin
#                                            # (or set SUBSTRATE_BIN_DIR)
set -euo pipefail

here="$(cd -P "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
root="$(dirname "$here")"
BIN="$root/scripts/substrate"
BIN_DIR="${1:-${SUBSTRATE_BIN_DIR:-$HOME/.local/bin}}"
LINK="$BIN_DIR/substrate"

[ -x "$BIN" ] || { echo "substrate-link: $BIN not found or not executable" >&2; exit 1; }

mkdir -p "$BIN_DIR"
ln -sfn "$BIN" "$LINK"
echo "linked: $LINK → $BIN"

# warn-only — is the bin dir on PATH?
case ":$PATH:" in
  *":$BIN_DIR:"*) : ;;
  *) echo "note: $BIN_DIR is not on your PATH. Add it, e.g.:" >&2
     echo "      echo 'export PATH=\"$BIN_DIR:\$PATH\"' >> ~/.zshrc && source ~/.zshrc" >&2 ;;
esac

# warn-only — a shell function/alias named `substrate` shadows a PATH binary.
echo "note: if you added a substrate() function or alias to your shell rc, remove it — it takes precedence over this binary." >&2

echo "done. try: substrate tasks   (from inside a substrate/adopted project)"
