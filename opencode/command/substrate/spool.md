---
description: "Close a big-context session and reopen it in a fresh one through a lightweight, verified pointer — cheaper and safer than compacting or clearing. `spool` is a store-and-forward context carrier at the campaign tier (a meta-brief governing N sequential specs): it re-derives live state from the repo (git head, branch, working-tree deltas, completed vs ongoing specs, open beads, gate commands, any project-specific head/version anchor), diffs that against what the chat believed, and at a SINGLE human-in-the-loop checkpoint surfaces every unverifiable claim and every conflict (repo contradicts a chat-held belief) for you to adjudicate — it never asserts past a conflict. It then writes a self-contained launcher to an out-of-repo, ID-keyed, TTL-swept store (`~/.substrate/spool/`), so producing a spool commits nothing. `/substrate/spool --resume <id>` unspools into a fresh session: it re-verifies the volatile anchors (which may have advanced since capture), confirms the reconstructed understanding, then deletes the spool (`--keep` to retain). `/substrate/spool --list` shows what's on the spool. Sits one tier ABOVE /substrate/synthesize-session: synthesize captures per-spec LEARNING into doctrine + beads; spool carries campaign POSITION across specs. Degrades gracefully to a single-session snapshot when there's no campaign above it."
---

# /substrate/spool

Store-and-forward context carrier. Close a session that's accumulated a large, expensive context and reopen the *position* in a fresh session through a small, hand-verified pointer — not a lossy in-memory copy.

Arguments: `$ARGUMENTS` — one of (empty = produce), `--resume <id>`, `--resume` (list then pick), `--list`; `--keep` composes with `--resume`.

The thesis: durable state already lives on disk (specs in `docs/tasks/`, work in the bead tracker, decisions in `docs/doctrine/`, gates in `substrate.yaml`). Compacting keeps a summary of that state *in the context window*; `spool` keeps state *out* of the window and ships a launcher *into* the record. That's the performance win — and the grounding step (re-derive facts from the repo, never from chat memory) is what makes it strictly safer than compacting, which faithfully carries forward whatever the chat got wrong.

## Position in the lifecycle

```
Tier 0   meta-architect over an N-phase brief (N sequential specs)   ← /substrate/spool   (campaign POSITION)
Tier 1   architect-spec scopes each phase → one spec
Tier 2   execute runs that spec  →  /substrate/synthesize-session    (per-spec LEARNING)
```

`spool` and `synthesize-session` never compete — different tiers. `synthesize` writes learning permanently *into* the repo at the leaf. `spool` carries campaign position across specs at the top, and its output is a throwaway launcher, not landed work. In a mature campaign, spool is nearly trivial: verify the live heads, list the open beads, point at the source of truth.

## Modes

| Invocation | Mode |
|---|---|
| `/substrate/spool` | **produce** — capture verified position → print an ID |
| `/substrate/spool --resume <id>` | **resume** — unspool → re-verify → confirm → delete |
| `/substrate/spool --resume` (no id) | list available spools, then ask which to resume |
| `/substrate/spool --list` | show what's on the spool |
| `--keep` (with `--resume`) | resume without deleting |

## The store

Out of every repo — producing a spool commits nothing and no stale handoff rots in git history.

```bash
SPOOL_DIR="${SUBSTRATE_SPOOL_DIR:-$HOME/.substrate/spool}"   # override for tests
```

- One file per spool: `$SPOOL_DIR/<slug>-<4hex>.md` (`<slug>` = campaign/epic slug, `<4hex>` = random, typeable, collision-safe).
- Each file carries `repo:` + `captured:` frontmatter so a global store safely holds spools from many projects, and `--resume` can warn on a repo mismatch.
- **TTL sweep**: on every produce + list, delete spools older than 14 days.

Store operations (inline bash — spool does NOT depend on a `scripts/` file, because scripts are not vendored into target repos; mirrors `synthesize-session`'s inline-tempfile precedent):

```bash
SPOOL_DIR="${SUBSTRATE_SPOOL_DIR:-$HOME/.substrate/spool}"
sp_gc()   { find "$SPOOL_DIR" -name '*.md' -type f -mtime +14 -delete 2>/dev/null || true; }
sp_new()  { mkdir -p "$SPOOL_DIR"; id="$1-$(od -An -N2 -tx1 /dev/urandom | tr -d ' \n')"; printf '%s' "$id"; }  # then write "$SPOOL_DIR/$id.md"
sp_list() { for f in "$SPOOL_DIR"/*.md; do [ -e "$f" ] || continue
              id=$(basename "$f" .md)
              printf '%s\t%s\t%s\t%s\n' "$id" \
                "$(sed -n 's/^captured: //p' "$f" | head -1)" \
                "$(sed -n 's/^repo: //p' "$f" | head -1)" \
                "$(sed -n 's/^title: //p' "$f" | head -1)"; done; }
sp_get()  { f="$SPOOL_DIR/$1.md"; [ -e "$f" ] || { echo "no spool: $1" >&2; return 1; }; cat "$f"; }
sp_del()  { rm -f "$SPOOL_DIR/$1.md"; }
```

## When to REFUSE

| Signal | Redirect |
|---|---|
| Not a git repo (`git rev-parse` fails) | spool grounds every fact against the repo — nothing to verify against. Abort with that explanation. |
| `--resume <id>` and the spool file doesn't exist | Print the id + `--list` output. Abort — do NOT fabricate a resume from memory. |

## Workflow — PRODUCE (`/substrate/spool`)

### Step 0 — Compaction self-check

spool's input is the model's own context window. If auto-compacted, the campaign narrative is degraded and the spool inherits it. Self-assess over `git log --oneline <session-base>..HEAD`: do you recall **why** each commit was made? If recall is sparse on >50%, warn and ask `Proceed anyway? (y / n)`. If the user proceeds, record `context: compacted` in the spool frontmatter.

### Step 1 — Establish scope

- **Campaign (default):** a Tier-0 meta-brief governing multiple sequential specs. `<slug>` = campaign/epic slug.
- **Single session (degraded):** no campaign above this session — spool whatever position exists, noted as a session snapshot.

If ambiguous, ask — end with `[type 'default' to let me decide sensible defaults]`.

### Step 2 — Ground every fact (the anti-compact core)

Re-derive anchors **from the repo, never from chat memory**. Run in parallel:

```bash
git rev-parse --abbrev-ref HEAD                          # branch
git rev-parse --short HEAD                               # tip
git status --porcelain                                   # uncommitted deltas
git log --oneline -15                                    # recent history
ls docs/tasks/completed/ 2>/dev/null                     # shipped specs
ls docs/tasks/ongoing/ 2>/dev/null                       # in-flight specs
test -f substrate.yaml && cat substrate.yaml             # gate commands
```

**Beads (tracker-aware, same detection as `synthesize-session`):** if `.tbd/config.yml` exists and `tbd` is callable (`command -v tbd` or `npx --no-install get-tbd --version`), run `tbd list` (or `bash docs/scripts/bead-graph.sh --epic <slug>` when present). Else scan `docs/tasks/ongoing/<*>/bead.md`.

**Project-specific anchors** (migration/schema head, deploy tag, version pin): detect or ask; never hardcode, never assert from chat memory. A chat-held value goes into Step 3's diff, not straight into the launcher.

### Step 3 — Diff chat-belief vs repo

- **Unverifiable** — a fact the chat asserts the repo can't confirm.
- **Conflict** — the repo contradicts a chat belief. This is the dangerous case compacting silently propagates: the chat *has* an answer and it's wrong. Surface both the chat value and the repo value.

Empty lists are the happy path — say so.

### Step 4 — Single batched HIL checkpoint

Do not interrupt per-fact. Gather everything into one checkpoint listing CONFLICTS (keep repo / chat / other) and UNVERIFIABLE (verify / drop / mark ‹unverified›), ending with `[type 'default' to let me decide sensible defaults]`. Apply resolutions; nothing enters the launcher unresolved — never assert past a conflict.

### Step 5 — Compose the launcher (pointers-first)

The spool points *into* the source of truth, not copies it. Only verified live anchors inline. Template:

```markdown
---
id: <slug>-<4hex>
title: <one-line campaign position>
repo: <git remote origin url, or pwd>
captured: <ISO8601 UTC>
context: full | compacted
---

# <Campaign> — session context handoff (as of <date>)

You're in <repo path>. Read <SoT files> FIRST — they are the single source of truth;
everything below is a verified pointer, not a copy.

## What this is
<2–3 sentences pointing at the SoT.>

## Position (VERIFIED against the repo this session)
- Branch / tip / Shipped / Next / Gates / <project anchor> / Working tree

## Carried-forward loose ends
- <open beads, parked questions, ‹unverified› kept items>

## How work gets built here
<pipeline: architect-spec → graph-spec → execute|orchestrate → synthesize-session.>

## Non-negotiable gotchas
<point at CLAUDE.md / doctrines; inline only the few that bite silently.>

## Likely next action
<single most probable next step + "confirm intent with the user before starting".>
```

### Step 6 — Persist + hand off

```bash
SPOOL_DIR="${SUBSTRATE_SPOOL_DIR:-$HOME/.substrate/spool}"; mkdir -p "$SPOOL_DIR"
id="<slug>-$(od -An -N2 -tx1 /dev/urandom | tr -d ' \n')"
# write the composed launcher (id filled into its frontmatter) to "$SPOOL_DIR/$id.md"
find "$SPOOL_DIR" -name '*.md' -type f -mtime +14 -delete 2>/dev/null || true    # TTL gc
```

Print the id, note nothing was committed, and the resume command `/substrate/spool --resume <id>` (`--keep` to retain; `/substrate/spool --list` to see all). Then clear and reopen fresh.

## Workflow — RESUME (`/substrate/spool --resume <id>`)

1. **Fetch** via `sp_get <id>`; if missing → REFUSE (print `--list`).
2. **Repo-match**: if the spool's `repo:` ≠ current `git remote get-url origin` (or pwd) → warn and ask before proceeding.
3. **Re-verify volatile anchors**: the repo may have advanced since `captured:`. Re-run the Step-2 probes for fast-moving anchors (branch/tip, completed|ongoing, open beads, project head), diff against the spool, and report drift. Trust the repo, not the file, on every drifted anchor.
4. **Confirm understanding**: print a short reconstruction (what the campaign is, verified position *as of now*, likely next action) so the user catches a bad spool before acting.
5. **Delete** via `sp_del <id>` — default; `--keep` retains it.

## Workflow — LIST (`/substrate/spool --list`)

Run `sp_gc`, then `sp_list`, and render a table: id · captured · repo · title. If empty, say so.

## Constraints

- **MUST** ground every anchor against the repo in Step 2. Unverifiable facts are resolved at the HIL checkpoint or written `‹unverified›` — never asserted with false confidence. This is what makes spool safer than compacting.
- **MUST** treat a **conflict** as higher-priority than a missing fact and surface both values at the HIL checkpoint. Never silently prefer the chat's stale belief.
- **MUST** batch the HIL into a single checkpoint (Step 4), not per-fact interrupts.
- **MUST** write to an out-of-repo store (`~/.substrate/spool/`, or `$SUBSTRATE_SPOOL_DIR`). **MUST NOT** commit anything to the target repo — produce and resume leave the working tree untouched (inverse of `synthesize-session`).
- **MUST** stamp `repo:` + `captured:` frontmatter and warn on a repo mismatch at resume.
- **MUST** re-verify volatile anchors at resume and report drift. A spool goes stale as the repo advances; re-grounding at resume is the mitigation, not trusting the file.
- **MUST** delete after a successful resume unless `--keep`. TTL-sweep (14d) on produce + list.
- **MUST** compose the launcher pointers-first: point at SoT files; inline only verified live anchors and silently-biting gotchas.
- **MUST** record `context: compacted` if Step 0 detected compaction and the user proceeded.
- **MUST** offer `[type 'default' to let me decide sensible defaults]` on Socratic questions; binary confirmations are exempt.
- **SHOULD** stay light in a mature campaign — verify + point, don't re-narrate.

> **Parity note.** This command is a translation of `skills/spool/SKILL.md`. When that skill changes, re-translate here in the same change (see `opencode/README.md`).
