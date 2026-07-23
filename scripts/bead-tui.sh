#!/usr/bin/env bash
# bead-tui — live terminal view of the project's bead DAGs (see bead-tui/README.md).
# Thin wrapper: resolves its own real path THROUGH symlinks, then forwards all args to
# watch.mjs. Resolving symlinks is what makes it aliasable — you can symlink this onto
# PATH (or wrap it in a `substrate tasks` shell function) and it still finds watch.mjs.
# The view reads tbd + .substrate from your CURRENT directory, so one shortcut serves
# every substrate/adopted project — just run it from inside the repo you want to see.
set -euo pipefail

# Resolve BASH_SOURCE through symlinks without GNU `readlink -f` (macOS bash 3.2 safe).
src="${BASH_SOURCE[0]}"
while [ -h "$src" ]; do
  dir="$(cd -P "$(dirname "$src")" && pwd)"
  src="$(readlink "$src")"
  [ "${src#/}" = "$src" ] && src="$dir/$src"   # relative link → re-anchor to its dir
done
here="$(cd -P "$(dirname "$src")" && pwd)"

exec node "$here/bead-tui/watch.mjs" "$@"
