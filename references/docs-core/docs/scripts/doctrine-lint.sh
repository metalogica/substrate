#!/usr/bin/env bash
# doctrine-lint — assert docs/doctrine/doctrine-manifest.yaml is the single source of truth
# and that doctrine cross-links don't rot. Pure bash + coreutils, ZERO runtime deps.
#
#   Run:  bash docs/scripts/doctrine-lint.sh    (also fired by .hooks/pre-commit and CI)
#
# Rules:
#   1. Coverage  — every docs/doctrine/*-doctrine.md is registered in the manifest.
#   2. Existence — every entry's path exists and matches docs/doctrine/<id>-doctrine.md.
#   3. Pointers  — every pointers[] file exists AND links to the doctrine (rename-rot guard).
#   4. Skills    — IF managed ambient stubs exist under .claude/skills/doctrine-*/
#                  (written by doctrine-skills-sync.sh), they mirror the manifest 1:1.
#                  Zero managed stubs → silent pass (feature not adopted).
#   5. History   — no history metadata (`## … Change Log` heading / `**Version**` header)
#                  in a REGISTERED doctrine. A living doc is current-state-only; git owns
#                  the history, freshness is attested by `**Last verified**`.
#                  Scope is deliberately the manifest's entries — NOT a tree glob: prose
#                  that merely *names* the banned strings (skills, specs, archived
#                  doctrines under docs/doctrine/archive/) is correct work, not a finding.
#   6. Paths     — every glob in an entry's optional `paths: [...]` (the governed-file
#                  globs that bind a doctrine to a bead's write-scope) matches at least
#                  one existing file. Rename-rot guard: a glob that matches nothing is a
#                  doctrine that silently governs nothing. No `paths` key → rule silent.
#   7. Freshness — WARNS (never fails) when a registered doctrine's `**Last verified**`
#                  date is absent, unparseable, or older than 6 months. Advisory on
#                  purpose: staleness is a judgement call for the Gate-2 drift agent
#                  (which bumps the date on a green pass), not something a commit hook
#                  gets to block. Warnings print to stderr; the exit code stays 0.

set -u

ROOT=$(cd "$(dirname "$0")/../.." && pwd)
MANIFEST="$ROOT/docs/doctrine/doctrine-manifest.yaml"
DOCTRINE_DIR="$ROOT/docs/doctrine"

[ -f "$MANIFEST" ] || { echo "doctrine-lint: manifest not found at $MANIFEST" >&2; exit 1; }

errors=0
errmsgs=""
fail() { errmsgs="${errmsgs}  ✗ $1"$'\n'; errors=$((errors + 1)); }

warnings=0
warnmsgs=""
warn() { warnmsgs="${warnmsgs}  ⚠ $1"$'\n'; warnings=$((warnings + 1)); }

registered=" "   # space-delimited set of registered basenames
registered_ids=" "   # space-delimited set of registered ids (rule 4)
registered_paths=" "   # space-delimited set of registered paths that exist (rule 5)
count=0
glob_count=0     # governed-file globs seen across all entries (rule 6)

# Does at least one existing file match this glob? (rule 6)
# Two-stage on purpose, and bash-3.2 safe — `globstar` is NOT assumed (macOS ships bash 3.2):
#   1. ordinary pathname expansion, which is exact for globs without `**`;
#   2. only for a `**` glob that expansion missed, a pruned tree walk matched with `case`,
#      where `*` is allowed to cross `/`. Deliberately permissive: this is a "does anything
#      still match?" rot guard, not a file selector.
glob_matches() {
  local g="$1" f
  (cd "$ROOT" 2>/dev/null && compgen -G "$g" >/dev/null 2>&1) && return 0
  case "$g" in *'**'*) ;; *) return 1 ;; esac
  while IFS= read -r f; do
    f="${f#./}"
    case "$f" in $g) return 0 ;; esac
  done <<EOF
$(cd "$ROOT" 2>/dev/null && find . \( -name node_modules -o -name .git -o -name .venv \
     -o -name dist -o -name build -o -name target \) -prune -o -print 2>/dev/null)
EOF
  return 1
}

# Validate one accumulated entry (id / path / space-separated pointers / space-separated globs).
validate() {
  local id="$1" path="$2" pointers="$3" globs="${4:-}" base p g
  [ -n "$id" ] || return 0
  count=$((count + 1))
  if [ -z "$path" ]; then fail "entry '$id': missing path"; return; fi
  base=$(basename "$path")
  registered="${registered}${base} "
  registered_ids="${registered_ids}${id} "
  [ "$base" = "$id-doctrine.md" ] || \
    fail "entry '$id': path $path should be docs/doctrine/$id-doctrine.md"
  if [ ! -f "$ROOT/$path" ]; then fail "entry '$id': path does not exist: $path"; return; fi
  registered_paths="${registered_paths}${path} "
  for p in $pointers; do
    if [ ! -f "$ROOT/$p" ]; then fail "entry '$id': pointer file missing: $p"; continue; fi
    grep -qF -- "$base" "$ROOT/$p" || \
      fail "entry '$id': $p should link to $base but doesn't (rename-rot?)"
  done
  # Rule 6 — governed-file globs must still govern something.
  for g in $globs; do
    glob_count=$((glob_count + 1))
    glob_matches "$g" || \
      fail "entry '$id': paths glob '$g' matches no existing file (rename-rot?) — fix the glob or drop it; a doctrine that governs nothing binds nothing."
  done
}

cur_id="" cur_path="" cur_pointers="" cur_globs=""
while IFS= read -r raw || [ -n "$raw" ]; do
  line="${raw%%#*}"                                   # strip comments
  line="${line%"${line##*[![:space:]]}"}"             # strip trailing whitespace
  [ -n "$line" ] || continue
  if [[ "$line" =~ ^[[:space:]]*-[[:space:]]+id:[[:space:]]*(.+)$ ]]; then
    validate "$cur_id" "$cur_path" "$cur_pointers" "$cur_globs"   # flush previous entry
    cur_id="${BASH_REMATCH[1]}"; cur_path=""; cur_pointers=""; cur_globs=""
  elif [[ "$line" =~ ^[[:space:]]+path:[[:space:]]*(.+)$ ]]; then
    cur_path="${BASH_REMATCH[1]}"
  elif [[ "$line" =~ ^[[:space:]]+pointers:[[:space:]]*\[(.*)\][[:space:]]*$ ]]; then
    cur_pointers="${BASH_REMATCH[1]//,/ }"
  elif [[ "$line" =~ ^[[:space:]]+paths:[[:space:]]*\[(.*)\][[:space:]]*$ ]]; then
    cur_globs="${BASH_REMATCH[1]//,/ }"
  fi
done < "$MANIFEST"
validate "$cur_id" "$cur_path" "$cur_pointers" "$cur_globs"       # flush last entry

# Rule 1 — coverage
for f in "$DOCTRINE_DIR"/*-doctrine.md; do
  [ -e "$f" ] || continue
  b=$(basename "$f")
  case "$registered" in
    *" $b "*) ;;
    *) fail "coverage: $b exists but is not registered in docs/doctrine/doctrine-manifest.yaml" ;;
  esac
done

# Rule 4 — ambient skill stubs (doctrine-skills-sync.sh) mirror the manifest.
# Only enforced once the feature is in use: zero MANAGED stubs → silent pass, so
# repos adopted before the feature stay green until they opt in.
SKILLS_DIR="$ROOT/.claude/skills"
SYNC_MARKER="auto-generated by docs/scripts/doctrine-skills-sync.sh"
managed_ids=" "
managed_count=0
for d in "$SKILLS_DIR"/doctrine-*/; do
  [ -d "$d" ] || continue
  s="${d}SKILL.md"
  [ -f "$s" ] && grep -qF -- "$SYNC_MARKER" "$s" || continue   # unmanaged files are none of our business
  managed_count=$((managed_count + 1))
  sid="$(basename "$d")"; sid="${sid#doctrine-}"
  managed_ids="${managed_ids}${sid} "
  case "$registered_ids" in
    *" $sid "*)
      # Stub must point at the id's doctrine file (rename-rot guard, same as rule 3).
      grep -qF -- "$sid-doctrine.md" "$s" || \
        fail "skills: .claude/skills/doctrine-$sid/SKILL.md does not reference $sid-doctrine.md — re-run docs/scripts/doctrine-skills-sync.sh"
      ;;
    *) fail "skills: managed stub doctrine-$sid has no manifest entry — re-run docs/scripts/doctrine-skills-sync.sh" ;;
  esac
done
if [ "$managed_count" -gt 0 ]; then
  for rid in $registered_ids; do
    case "$managed_ids" in
      *" $rid "*) ;;
      *) fail "skills: manifest entry '$rid' has no ambient stub at .claude/skills/doctrine-$rid/ — re-run docs/scripts/doctrine-skills-sync.sh" ;;
    esac
  done
fi

# Rule 5 — no history metadata in a living doctrine.
# Append-only history belongs on IMMUTABLE artifacts (specs). A doctrine is living: it
# carries current state only, git carries the history, `**Last verified**` carries freshness.
# Scoped to manifest-registered paths on purpose — see the header note.
for path in $registered_paths; do
  f="$ROOT/$path"
  [ -f "$f" ] || continue
  hits=""
  grep -qE '^##[[:space:]].*Change Log' "$f" && hits="a '## … Change Log' section"
  if grep -qE '^\*\*Version\*\*' "$f"; then
    [ -n "$hits" ] && hits="$hits and "
    hits="${hits}a '**Version**' header"
  fi
  [ -n "$hits" ] || continue
  fail "history: $path contains $hits — a living doctrine is current-state-only.
    Fix: HARVEST, then delete. Fold each row's still-true rationale inline as a why-note at
    the section it cites, delete the table/header, and paste the harvested table verbatim
    into the removal commit body (git is the history). Attest freshness with a
    '**Last verified**: YYYY-MM-DD' header instead of a version number. See
    docs/doctrine/agents-doctrine.md §2 (immutable vs living) and §8."
done

# Rule 7 (advisory) — freshness. WARNS, never fails: see the header note.
# Date parsing is portable by PROBE, not by assumption — BSD/darwin `date -j -f` and
# GNU/linux `date -d` are mutually unintelligible, and this runs in a pre-commit hook on
# whatever the developer has. Try BSD first (GNU rejects -j outright; BSD's -d means
# something else entirely, so the reverse order would silently misparse).
SIX_MONTHS=15724800          # 182 days
now_epoch=$(date +%s)
date_to_epoch() {
  local d="$1" e=""
  e=$(date -j -f "%Y-%m-%d" "$d" +%s 2>/dev/null) || e=""
  [ -n "$e" ] || e=$(date -d "$d" +%s 2>/dev/null) || e=""
  printf '%s' "$e"
}
for path in $registered_paths; do
  f="$ROOT/$path"
  [ -f "$f" ] || continue
  lv=$(grep -m1 -E '^\*\*Last verified\*\*:' "$f" 2>/dev/null)
  if [ -z "$lv" ]; then
    warn "freshness: $path has no '**Last verified**: YYYY-MM-DD' header — nothing attests it still matches the code. Add one when you next check it against reality (a green Gate-2 pass bumps it; see agents-doctrine.md §6)."
    continue
  fi
  if [[ ! "$lv" =~ ([0-9]{4}-[0-9]{2}-[0-9]{2}) ]]; then
    warn "freshness: $path has a '**Last verified**' header that is not an ISO date: ${lv}"
    continue
  fi
  lv_date="${BASH_REMATCH[1]}"
  lv_epoch=$(date_to_epoch "$lv_date")
  if [ -z "$lv_epoch" ]; then
    warn "freshness: $path — could not parse '$lv_date' with either BSD or GNU date; skipping the age check."
    continue
  fi
  age=$((now_epoch - lv_epoch))
  if [ "$age" -gt "$SIX_MONTHS" ]; then
    warn "freshness: $path was last verified $lv_date ($((age / 86400)) days ago) — over 6 months. Re-check its claims against the code (Gate 2, agents-doctrine.md §6) and bump the date on a green pass."
  fi
done

if [ "$warnings" -gt 0 ]; then
  echo "doctrine-lint: $warnings warning(s) (advisory — not a failure):" >&2
  printf '%s' "$warnmsgs" >&2
fi

if [ "$errors" -gt 0 ]; then
  echo "doctrine-lint: $errors problem(s):" >&2
  printf '%s' "$errmsgs" >&2
  exit 1
fi
extra=""
[ "$glob_count" -gt 0 ] && extra=", $glob_count governed-path glob(s) match"
[ "$managed_count" -gt 0 ] && extra="${extra}, $managed_count ambient stub(s) in sync"
echo "doctrine-lint: ok — $count doctrines registered, all paths + pointers resolve${extra}."
