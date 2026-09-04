#!/usr/bin/env bash
# doctrine-digest — print one doctrine's Binding Rules block: its extractable DIGEST.
# Pure bash + coreutils, ZERO runtime deps (same contract as doctrine-lint.sh).
#
#   Run:  bash docs/scripts/doctrine-digest.sh <id>        # id as registered in the manifest
#
# Why: inlining a 2,000-line doctrine into every dispatch prompt is unaffordable, and
# telling a worker to "go read the doctrine" is unverifiable. The digest is the middle
# tier — the same description/body split that makes skills cheap, applied to doctrine:
# push the Binding Rules at dispatch, pull the full body only when a bead is squarely
# in-domain. See docs/doctrine/agents-doctrine.md §2.1 (the digest convention).
#
# Section resolution (in order — a doctrine only has to satisfy ONE):
#   1. a heading NAMING the binding tier: `## … Binding Rules …` or `## … Policies …`
#      (numbered or not) — the canonical form written by /substrate:add-doctrine;
#   2. else the numbered `## 2. …` slot, whatever it is titled — the convention is
#      positional as well as nominal, so a doctrine whose §2 carries a domain-specific
#      title still digests.
# Named-before-numbered on purpose: the name is the stronger signal, and a doctrine that
# has both is telling you which section it means.
#
# Exits non-zero (with an actionable message) on: no id, unknown id, missing file,
# or a doctrine with no resolvable binding-rules section.

set -u

ROOT=$(cd "$(dirname "$0")/../.." && pwd)
MANIFEST="$ROOT/docs/doctrine/doctrine-manifest.yaml"

die() { echo "doctrine-digest: $1" >&2; exit 1; }

ID="${1:-}"
[ -n "$ID" ] || {
  echo "doctrine-digest: usage: bash docs/scripts/doctrine-digest.sh <id>" >&2
  echo "  <id> is a doctrine id as registered in docs/doctrine/doctrine-manifest.yaml." >&2
  exit 2
}

[ -f "$MANIFEST" ] || die "manifest not found at $MANIFEST"

# ── Resolve id → path (same zero-dep manifest reader as doctrine-skills-sync.sh) ──
DOC_PATH=""
known_ids=""
cur_id=""
while IFS= read -r raw || [ -n "$raw" ]; do
  line="${raw%%#*}"                                   # strip comments
  line="${line%"${line##*[![:space:]]}"}"             # strip trailing whitespace
  [ -n "$line" ] || continue
  if [[ "$line" =~ ^[[:space:]]*-[[:space:]]+id:[[:space:]]*(.+)$ ]]; then
    cur_id="${BASH_REMATCH[1]}"
    known_ids="${known_ids:+$known_ids, }$cur_id"
  elif [[ "$line" =~ ^[[:space:]]+path:[[:space:]]*(.+)$ ]]; then
    [ "$cur_id" = "$ID" ] && DOC_PATH="${BASH_REMATCH[1]}"
  fi
done < "$MANIFEST"

[ -n "$DOC_PATH" ] || die "no doctrine with id '$ID' in docs/doctrine/doctrine-manifest.yaml.
  Registered ids: ${known_ids:-<none>}"
FILE="$ROOT/$DOC_PATH"
[ -f "$FILE" ] || die "entry '$ID' points at $DOC_PATH, which does not exist (run doctrine-lint.sh)"

# ── Pass 1 — resolve the section heading ─────────────────────────────────────
named="" numbered=""
while IFS= read -r line || [ -n "$line" ]; do
  case "$line" in "## "*) ;; *) continue ;; esac
  if [ -z "$named" ] && [[ "$line" =~ [Bb]inding[[:space:]][Rr]ules|[Pp]olicies ]]; then
    named="$line"
  elif [ -z "$numbered" ] && [[ "$line" =~ ^##[[:space:]]+2\.[[:space:]] ]]; then
    numbered="$line"
  fi
done < "$FILE"

HEADING="${named:-$numbered}"
[ -n "$HEADING" ] || die "$DOC_PATH has no binding-rules section to digest.
  Give it a '## 2. Binding Rules (MUSTs)' section (the /substrate:add-doctrine stub shape),
  or title its binding tier '… Binding Rules …' / '… Policies …'. A doctrine with no
  extractable digest cannot be pushed at dispatch — see agents-doctrine.md §2.1."

# ── Pass 2 — print the block, heading through the line before the next '## ' ──
out=""
in_block=0
while IFS= read -r line || [ -n "$line" ]; do
  if [ "$in_block" -eq 0 ]; then
    [ "$line" = "$HEADING" ] && { in_block=1; out="$line"$'\n'; }
    continue
  fi
  case "$line" in "## "*) break ;; esac
  out="${out}${line}"$'\n'
done < "$FILE"

# Trim trailing blank lines and the `---` rule that separates stub sections.
while :; do
  case "$out" in
    *$'\n'$'\n')   out="${out%$'\n'}" ;;
    *$'\n'"---"$'\n') out="${out%"---"$'\n'}" ;;
    *) break ;;
  esac
done

printf '%s' "$out"
