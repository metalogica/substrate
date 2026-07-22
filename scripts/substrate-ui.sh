#!/usr/bin/env bash
# substrate-ui — one fullscreen window for everything. Composes a tmux session on
# substrate's OWN server socket (`tmux -L substrate`) for the repo in your CURRENT
# directory:
#   window 0  board   substrate tasks (bead board TUI)
#   window 1  specs   shell in docs/tasks/ongoing (the spec estate)
#   window 2  agent   interactive `claude` at the repo root (the sync SDD seat)
# Jumps: M-1 / M-2 / M-3 direct, M-n = new agent window. Detach = prefix d; the
# session persists. Bindings live in scripts/substrate-tmux.conf, read only at
# server birth — `tmux -L substrate kill-server` to reload after conf edits.
set -euo pipefail

SOCKET=substrate

# Resolve own path through symlinks (macOS bash 3.2 safe) → conf + sibling CLI.
src="${BASH_SOURCE[0]}"
while [ -h "$src" ]; do
  dir="$(cd -P "$(dirname "$src")" && pwd)"
  src="$(readlink "$src")"
  [ "${src#/}" = "$src" ] && src="$dir/$src"   # relative link → re-anchor
done
here="$(cd -P "$(dirname "$src")" && pwd)"      # .../substrate/scripts
conf="$here/substrate-tmux.conf"
substrate_cli="$here/substrate"

# --- preflight ----------------------------------------------------------------
if ! command -v tmux >/dev/null 2>&1; then
  echo "substrate ui: tmux not found — install it first (macOS: brew install tmux)" >&2
  exit 1
fi
[ -f "$conf" ] || { echo "substrate ui: missing conf at $conf" >&2; exit 1; }

have_claude=1
command -v claude >/dev/null 2>&1 || have_claude=0

# Foreign-tmux guard: attaching from inside a DIFFERENT tmux server nests badly.
# Inside our own server, we switch-client instead of attaching.
if [ -n "${TMUX:-}" ]; then
  sock_path="${TMUX%%,*}"
  case "$sock_path" in
    */"$SOCKET") : ;;   # our own server — fall through to switch-client
    *)
      echo "substrate ui: you're inside another tmux server." >&2
      echo "  detach first (prefix d), or run:  TMUX= substrate ui" >&2
      exit 1
      ;;
  esac
fi

repo_root="$PWD"
# tmux session names may not contain '.' or ':'
session="$(basename "$repo_root" | tr '.:' '--')"

t() { tmux -L "$SOCKET" "$@"; }

if ! t has-session -t "=$session" 2>/dev/null; then
  specs_dir="$repo_root/docs/tasks/ongoing"
  [ -d "$specs_dir" ] || specs_dir="$repo_root"

  # Server-birth path: -f applies the substrate conf iff this creates the server.
  # The board relaunches on exit (Esc/q are one-keystroke exits and a dead window
  # 0 reads as "no beads"); Ctrl-C during the pause drops to a shell instead.
  board_cmd="while :; do '$substrate_cli' tasks; printf '\\n[board exited — restarting in 2s · Ctrl-C for a shell]\\n'; sleep 2 || break; done; exec \"\${SHELL:-zsh}\""
  tmux -L "$SOCKET" -f "$conf" new-session -d -s "$session" -c "$repo_root" \
    -n board "$board_cmd"
  # The M-? help popup resolves its file through this (fallback-defaulted in conf).
  t set-environment -g SUBSTRATE_SCRIPTS "$here"
  t new-window -t "$session:1" -n specs -c "$specs_dir"
  if [ "$have_claude" -eq 1 ]; then
    t new-window -t "$session:2" -n agent -c "$repo_root" "claude; exec \${SHELL:-zsh}"
  else
    t new-window -t "$session:2" -n agent -c "$repo_root"
    t send-keys -t "$session:2" \
      "echo 'substrate ui: claude CLI not found — install it, then run: claude'" C-m
  fi
  t select-window -t "$session:0"
else
  echo "substrate ui: attaching to existing session '$session'" \
       "(conf reloads only via: tmux -L $SOCKET kill-server)"
fi

if [ -n "${TMUX:-}" ]; then
  exec tmux -L "$SOCKET" switch-client -t "$session"
else
  exec tmux -L "$SOCKET" attach -t "$session"
fi
