# bead-tui

A **live** terminal view of a project's bead DAGs. It re-renders as tbd state evolves —
beads change status, blocked beads unblock, new ones appear — so you can watch an epic fill
in while a parallel fleet works it. Companion to `bead-graph.sh` (which prints a one-shot
graph); this one stays open and updates. Zero runtime deps — Node built-ins only.

## Run

```bash
# Auto-load the latest active epic; press Tab to cycle epics + unassigned:
docs/scripts/bead-tui.sh
#   (equivalently: node docs/scripts/bead-tui/watch.mjs)

# Pin one epic:
docs/scripts/bead-tui.sh --tbd <epic-slug>

# A specific fixture file (no tbd needed):
docs/scripts/bead-tui.sh --fixture docs/scripts/bead-tui/fixture.json

# Non-interactive:
docs/scripts/bead-tui.sh --once          # render the default view once, exit (CI)
docs/scripts/bead-tui.sh --list-views    # print discovered views, exit
```

Keys (interactive TTY): **Tab / →** next · **Shift-Tab / ←** prev · **?** help · **q / Ctrl-C** quit.
The header (tab bar + epic title) stays pinned to the top; when the list is taller than the
terminal, the body scrolls to keep the cursor visible: **j/k** (or **↑/↓**) move · **Ctrl-D/Ctrl-U**
half-page · **g/G** top/bottom · **Enter** bead details · **Esc** back.
Flags: `--tbd <slug>`, `--fixture <path>`, `--once`, `--list-views`, `--interval <ms>` (idle gap
between polls, default 800).

## Shell shortcut (`substrate tasks`)

`bead-tui.sh` resolves its own path through symlinks, and the TUI reads tbd + `.substrate`
from your **current directory** — so **one copy on disk serves the whole machine**. Point a
shell function at a single canonical copy and run it from inside whatever project you want to
see, instead of maintaining a per-repo shortcut:

```zsh
# ~/.zshrc — one definition, run from anywhere. SUBSTRATE_ROOT = your substrate clone.
export SUBSTRATE_ROOT="$HOME/code/metalogica/substrate"
substrate() {
  local sub="${1:-}"; (( $# )) && shift
  local tui="$SUBSTRATE_ROOT/references/docs-core/docs/scripts/bead-tui.sh"
  case "$sub" in
    tasks) [[ -x $tui ]] || { print -u2 "substrate: TUI not found at $tui"; return 1; }
           "$tui" "$@" ;;                                  # → the live bead TUI
    ""|-h|--help) print "usage: substrate tasks [--tbd <slug>] [--fixture <path>] [--once]" ;;
    *) print -u2 "substrate: unknown command '$sub'"; return 2 ;;
  esac
}
```

Then `substrate tasks` (or `substrate tasks --tbd <epic-slug>`) opens the TUI for the project
you're standing in — one script on disk, no per-repo copies to keep in sync. (The symlink
resolution is what lets you instead `ln -s "$tui" ~/.local/bin/substrate-tasks` onto PATH if
you prefer a bare command over a function — same single-definition idea.)

## Views (tabs)

- **`board`** — the manual capture / triage surface (see below). Pinned **first**, always present.
- **One tab per epic** (`epic:<slug>` label grouping), newest first — the latest is active on
  launch. Fully-closed (done) epics are hidden; pin one with `--tbd <slug>` to see it anyway.
- **`unassigned`** — open beads carrying no `epic:` label.
- **`completed`** — closed orphan beads (no `epic:` label), kept out of `unassigned`.

## Board — unfiled tasks (capture + triage)

A keyboard-driven "brain dump" inbox for todos you spot while working — separate from the epic
DAG views and **outside** orchestration. Flat two sections: **UNGROOMED** (raw dumps) then
**GROOMED** (fleshed out, ready to hand off). It's a *staging area* — the board never writes into
an `epic:` bead (the orchestrator owns those; exogenous edits are entropy).

Membership is two free-form tbd labels — **no schema change**:

- **`inbox`** — a bead is on the board iff it has `inbox` and is open/in_progress. Opt-in, so the
  board shows only what you deliberately dumped, not every non-epic bead.
- **`groomed`** — the GROOMED column toggle (named to avoid `tbd ready`, which means
  dependency-unblocked — a different axis).

Board keys: **↑/↓ (j/k)** move · **n** new task (type title, Enter commits + stays, Esc exits) ·
**Enter** open detail · **e** edit body in `$EDITOR` · **space** toggle groomed · **x** kill ·
**[ / ]** priority less/more · **t** cycle kind · **g/G** top/bottom · **?** full help.

Capture is **model-free** (no agent, no LLM); writes use `--no-sync` (repos run `auto_sync:
false`), so a burst of dumps is N local commits + a single `tbd sync` on capture-exit and quit.
Don't run capture during an active `orchestrate` — both push `tbd-sync`.

## Watch it evolve

In another pane, change tbd state — `tbd update <id> --status in_progress`, `tbd close <id>`,
or create/label a new bead — and the active tab re-renders within one poll interval. New ids
flash `← NEW`; a bead that just closed flashes `✓ done`; beads unblock as their blockers close.

**How liveness works:** tbd stores bead data under `.git` (a `tbd-sync` worktree), not in the
working tree, so there's no file mtime to watch. bead-tui therefore **content-polls** in tbd
mode — it runs two bulk queries (`tbd list --all` + `tbd blocked`), in parallel, and re-renders
on any change. Fixture mode watches the file's mtime instead. Because tbd's CLI is slow
(~2–3 s per call, git-native), every call is **async** and self-paced: the fetch runs in the
background so keypresses stay instant and the spinner keeps moving — the view just updates when
fresh data lands (typically every ~3–4 s).

## What you see

Top-to-bottom **waves** (topological layers — every bead in a wave is parallel-safe), each
bead shown with a status glyph, its title, and its blockers inline:

```
── wave 2 · 3 PARALLEL ────────────
 ├─ ▶ sub-b2  fetch layer   ← a1
 ├─ ○ sub-c3  status glyphs ← a1
 └─ ○ sub-f6  poll loop     ← a1
```

Glyphs: `✓ closed`, `▶ in_progress`, `○ open`, `⊘ blocked` (an open bead with an
unclosed blocker). Waves and the `blocked` derivation follow
`docs/doctrine/agents-parallel-execution-doctrine.md`.

## Notes & limits

- **Startup** enumerates epics with a few `tbd` calls (a `show` per epic for its slug); on a
  project with many epics the first paint can take a few seconds (a "discovering beads…" line
  shows meanwhile). Steady-state polling is just the two bulk calls.
- **Why waves, not drawn arrows:** an early prototype tried a left-to-right graph with routed
  ASCII arrows; in a terminal that runs out of width and forces long edges to cross node
  columns — unreadable at seven nodes. Top-to-bottom waves with inline `← blockers` is
  width-stable and DAG-safe. A drawn-rail renderer (git-log-graph style) is a possible future
  `--graph` mode.
