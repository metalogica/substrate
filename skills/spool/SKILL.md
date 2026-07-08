---
name: spool
description: "Close a big-context session and reopen it in a fresh one through a lightweight, verified pointer — cheaper and safer than /compact or /clear. `spool` is a store-and-forward context carrier at the campaign tier (a meta-brief governing N sequential specs): it re-derives live state from the repo (git head, branch, working-tree deltas, completed vs ongoing specs, open beads, gate commands, any project-specific head/version anchor), diffs that against what the chat believed, and at a SINGLE human-in-the-loop checkpoint surfaces every unverifiable claim and every conflict (repo contradicts a chat-held belief) for you to adjudicate — it never asserts past a conflict. It then writes a self-contained launcher to an out-of-repo, ID-keyed, TTL-swept store (`~/.substrate/spool/`), so producing a spool commits nothing. `/substrate:spool --resume <id>` unspools into a fresh session: it re-verifies the volatile anchors (which may have advanced since capture), confirms the reconstructed understanding, then deletes the spool (`--keep` to retain). `/substrate:spool --list` shows what's on the spool. Sits one tier ABOVE /substrate:synthesize-session: synthesize captures per-spec LEARNING into doctrine + beads; spool carries campaign POSITION across specs. Degrades gracefully to a single-session snapshot when there's no campaign above it."
---

# /substrate:spool

Store-and-forward context carrier. Close a session that's accumulated a large, expensive context and reopen the *position* in a fresh session through a small, hand-verified pointer — not a lossy in-memory copy.

The thesis: durable state already lives on disk (specs in `docs/tasks/`, work in the bead tracker, decisions in `docs/doctrine/`, gates in `substrate.yaml`). `/compact` tries to keep a summary of that state *in the context window*; `spool` keeps state *out* of the window and ships a launcher *into* the record. That's the whole performance win — and the grounding step (re-derive facts from the repo, never from chat memory) is what makes it strictly safer than compact, which faithfully carries forward whatever the chat got wrong.

## Position in the lifecycle

```
Tier 0   meta-architect over an N-phase brief (N sequential specs)   ← /substrate:spool   (campaign POSITION)
Tier 1   architect-spec scopes each phase → one spec
Tier 2   execute runs that spec  →  /substrate:synthesize-session    (per-spec LEARNING)
```

`spool` and `synthesize-session` never compete — they operate at different tiers. `synthesize` writes learning permanently *into* the repo (doctrine fixes, beads) at the leaf. `spool` carries campaign position across specs at the top, and its output is a throwaway launcher, not landed work. In a mature campaign, spool is nearly trivial: verify the live heads, list the open beads, point at the source of truth. It only gets heavy when state is still trapped in the chat.

## Modes

| Invocation | Mode |
|---|---|
| `/substrate:spool` | **produce** — capture verified position → print an ID |
| `/substrate:spool --resume <id>` | **resume** — unspool into a fresh session → re-verify → confirm → delete |
| `/substrate:spool --resume` (no id) | list available spools, then ask which to resume |
| `/substrate:spool --list` | show what's on the spool |
| `--keep` (with `--resume`) | resume without deleting |

## The store

Out of every repo — so producing a spool commits nothing and no stale handoff can rot in git history.

```bash
SPOOL_DIR="${SUBSTRATE_SPOOL_DIR:-$HOME/.substrate/spool}"   # override for tests
```

- One file per spool: `$SPOOL_DIR/<slug>-<4hex>.md`, where `<slug>` is the campaign/epic slug (kebab-case) and `<4hex>` is a random suffix (collision-safe, typeable).
- Each file carries `repo:` + `captured:` frontmatter so a global store safely holds spools from many projects, and `--resume` can warn on a repo mismatch.
- **TTL sweep**: on every `produce` and `list`, delete spools older than 14 days. Abandoned spools GC themselves.

Store operations (inline bash — spool does NOT depend on a `scripts/` file, because `scripts/` is not copied into target repos; this mirrors `synthesize-session`'s inline-tempfile precedent):

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
| Not a git repo (`git rev-parse` fails) | spool grounds every fact against the repo — there's nothing to verify against. Abort with that explanation. |
| `--resume <id>` and the spool file doesn't exist | Print the id + `--list` output so the user can pick a real one. Abort — do NOT fabricate a resume from memory. |

## Workflow — PRODUCE (`/substrate:spool`)

### Step 0 — Compaction self-check

`spool`'s input is the model's own context window. If it has been auto-compacted, the campaign narrative is already degraded and the spool will inherit that. Self-assess: over the session's commits (`git log --oneline <session-base>..HEAD`), do you recall **why** each was made? If recall is sparse on >50%, print:

```
⚠ Context appears compacted. This spool will be degraded.
  A spool is only as good as the context it distills.
  Recommended: reconstruct from the source-of-truth files instead of spooling a thin context.
  Proceed anyway? (y / n)
```

If the user proceeds, record `context: compacted` in the spool frontmatter so the resuming session knows.

### Step 1 — Establish scope

Identify what you're spooling:

- **Campaign (default target):** a Tier-0 meta-brief governing multiple sequential specs (e.g. an N-slice MVP). The `<slug>` is the campaign/epic slug.
- **Single session (degraded):** no campaign above this session — spool whatever position exists (current branch of work, open loose ends). Note it as a session snapshot, not a campaign.

If ambiguous, ask which — end the question with `[type 'default' to let me decide sensible defaults]`.

### Step 2 — Ground every fact (the anti-compact core)

Re-derive the durable anchors **from the repo, never from chat memory**. Run in parallel:

```bash
git rev-parse --abbrev-ref HEAD                          # branch
git rev-parse --short HEAD                               # tip
git status --porcelain                                   # uncommitted working-tree deltas
git log --oneline -15                                    # recent history
ls docs/tasks/completed/ 2>/dev/null                     # shipped specs
ls docs/tasks/ongoing/ 2>/dev/null                       # in-flight specs
test -f substrate.yaml && cat substrate.yaml             # gate commands (compile/test/lint)
```

**Beads (tracker-aware, same detection as `synthesize-session`):** if `.tbd/config.yml` exists and a `tbd` binary is callable (`command -v tbd` or `npx --no-install get-tbd --version`), run `tbd list` (or the epic view `bash docs/scripts/bead-graph.sh --epic <slug>` when present) to enumerate open + carried-forward beads. Else scan `docs/tasks/ongoing/<*>/bead.md`.

**Project-specific anchors:** a campaign often tracks a head the generic probes don't cover — a migration/schema revision, a deploy tag, a version pin. **Detect or ask; never hardcode and never assert from chat memory.** If the chat believed a specific value (e.g. "migration head is X"), that belief goes into Step 3's diff, it does not go straight into the launcher.

### Step 3 — Diff chat-belief vs repo

Build two lists:

- **Unverifiable** — a fact the chat asserts that the repo can't confirm.
- **Conflict** — the repo contradicts a belief the chat held. *This is the dangerous case `/compact` silently propagates:* the chat *has* an answer, and it's wrong (e.g. chat thought a slice was unbuilt; `docs/tasks/completed/` shows it shipped). Surface both the chat value and the repo value.

Empty lists are the happy path — say so.

### Step 4 — Single batched HIL checkpoint

Do **not** interrupt per-fact. Gather everything and present one checkpoint:

```
Before I write the spool, resolve these:

CONFLICTS (repo disagrees with the session):
  1. <fact> — chat believed «X», repo shows «Y».  Keep: repo / chat / other?
  ...
UNVERIFIABLE (session asserted, repo can't confirm):
  a. <claim> — verify, drop, or mark ‹unverified›?
  ...

[type 'default' to let me decide sensible defaults]
```

Apply the resolutions. A conflict resolved toward the repo overwrites the chat belief; toward the chat requires the user to say why (recorded inline). Nothing enters the launcher unresolved — never assert past a conflict.

### Step 5 — Compose the launcher

Pointers-first: the spool points *into* the source of truth, it does not copy it. Only verified live anchors go inline. Template:

```markdown
---
id: <slug>-<4hex>
title: <one-line campaign position, e.g. "KEYLARK MVP — 4/8 slices shipped, slice 5 next">
repo: <git remote origin url, or pwd>
captured: <ISO8601 UTC>
context: full | compacted
---

# <Campaign> — session context handoff (as of <date>)

You're in <repo path>. Read <SoT files — e.g. CLAUDE.md, the campaign brief> FIRST —
they are the single source of truth; everything below is a verified pointer, not a copy.

## What this is
<2–3 sentences: what the project/campaign is, pointing at the SoT rather than restating it.>

## Position (VERIFIED against the repo this session)
- Branch / tip:        <branch> @ <short-sha>
- Shipped:             <specs in docs/tasks/completed/ — the campaign steps done>
- Next:                <the next step, and where its brief/spec is or that it's unwritten>
- Gates:               <compile / test / lint from substrate.yaml>
- <project anchor>:    <migration head / deploy tag / version — verified, not recalled>
- Working tree:        <clean, or the specific uncommitted deltas>

## Carried-forward loose ends
- <open bead id — one line>  (inspect: <tracker command>)
- <parked question / follow-up>
- <‹unverified› items the user chose to keep, clearly flagged>

## How work gets built here
<point at the pipeline: architect-spec → graph-spec → execute|orchestrate → synthesize-session.
Name the rule-of-thumb the campaign has learned, if any.>

## Non-negotiable gotchas
<point at CLAUDE.md / doctrines for detail; inline ONLY the few that bite silently — commit/branch
policy, the gate commands, the append-only/verified anchors.>

## Likely next action
<the single most probable next step, and an explicit "confirm intent with the user before starting".>
```

### Step 6 — Persist + hand off

Write the launcher to the store, run gc, and report:

```bash
SPOOL_DIR="${SUBSTRATE_SPOOL_DIR:-$HOME/.substrate/spool}"; mkdir -p "$SPOOL_DIR"
id="<slug>-$(od -An -N2 -tx1 /dev/urandom | tr -d ' \n')"
# write the composed launcher (with the id filled into its frontmatter) to "$SPOOL_DIR/$id.md"
find "$SPOOL_DIR" -name '*.md' -type f -mtime +14 -delete 2>/dev/null || true    # TTL gc
```

Print:

```
✔ Spooled.  id: <id>

  Nothing was committed to the repo — the spool lives at ~/.substrate/spool/<id>.md (out of the tree).
  In a fresh session, resume with:

      /substrate:spool --resume <id>

  (--keep to retain it after resuming; /substrate:spool --list to see all spools.)
```

Then you're clear to `/clear` and reopen fresh.

## Workflow — RESUME (`/substrate:spool --resume <id>`)

1. **Fetch.** `sp_get <id>`. If the file doesn't exist → REFUSE (print `--list`).
2. **Repo-match.** If the spool's `repo:` ≠ the current `git remote get-url origin` (or pwd) → **warn**: you're resuming another project's spool. Ask before proceeding.
3. **Re-verify the volatile anchors.** A spool is a launcher, not gospel — the repo may have advanced since `captured:`. Re-run the Step-2 probes for the fast-moving anchors (branch/tip, `docs/tasks/completed|ongoing`, open beads, the project head) and **diff against the spool's claims**. Report any drift explicitly:
   ```
   ⚠ Drift since this spool was captured (<captured>):
     - tip:  spool said <a>, repo now at <b>
     - <bead x> is now closed
   ```
   Trust the repo, not the file, on every drifted anchor.
4. **Confirm understanding.** Print a short reconstruction back to the user: what this campaign is, verified position *as of now* (post-drift), the likely next action. This is the moment the user catches a bad spool before acting on it.
5. **Delete** the spool (`sp_del <id>`) — default. With `--keep`, retain it (e.g. to fan two fresh sessions off one capture).

## Workflow — LIST (`/substrate:spool --list`)

Run `sp_gc`, then `sp_list`, and render a table: **id · captured · repo · title**. If empty, say so.

## Constraints

- **MUST** ground every anchor against the repo in Step 2. A fact that can't be verified is either resolved at the HIL checkpoint or written `‹unverified›` — never asserted with false confidence. This is the one property that makes spool safer than `/compact`.
- **MUST** treat a **conflict** (repo contradicts a chat belief) as higher-priority than a missing fact, and MUST surface both values at the HIL checkpoint. Never silently prefer the chat's stale belief — that's the exact failure `/compact` propagates.
- **MUST** batch the HIL into a single checkpoint (Step 4), not per-fact interrupts.
- **MUST** write the spool to an out-of-repo store (`~/.substrate/spool/`, or `$SUBSTRATE_SPOOL_DIR`). **MUST NOT** commit anything to the target repo — producing or resuming a spool leaves the working tree untouched. (This is the inverse of `synthesize-session`, which commits.)
- **MUST** stamp `repo:` + `captured:` frontmatter so a global store is safe across projects, and MUST warn on a repo mismatch at resume.
- **MUST** re-verify volatile anchors at resume (Step 3 of RESUME) and report drift. A spool goes stale the moment the repo advances; the mitigation is re-grounding at resume, not trusting the file.
- **MUST** delete the spool after a successful resume unless `--keep` is passed. TTL-sweep (14d) on produce + list so abandoned spools self-GC.
- **MUST** compose the launcher pointers-first: point at the SoT files (`CLAUDE.md`, the brief, doctrines, the tracker); inline only verified live anchors and the few silently-biting gotchas. Restating durable content the repo already holds defeats the purpose.
- **MUST** record `context: compacted` if Step 0 detected compaction and the user proceeded.
- **MUST** offer the `[type 'default' to let me decide sensible defaults]` suffix on Socratic questions (scope choice, HIL adjudication). Binary confirmations (`y/n`, proceed-anyway) are exempt.
- **SHOULD** stay light in a mature campaign — verify + point, don't re-narrate. Heaviness is a smell that state wasn't externalized (and that `synthesize-session` should run first).
