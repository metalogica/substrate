# bead-tui

A **live** terminal view of a project's bead DAGs. It re-renders as tbd state evolves —
beads change status, blocked beads unblock, new ones appear — so you can watch an epic fill
in while a parallel fleet works it. Companion to `bead-graph.sh` (which prints a one-shot
graph); this one stays open and updates. Zero runtime deps — Node built-ins only.

## Run

This is a **global** substrate tool — **one** copy lives in the substrate repo (`scripts/bead-tui/`)
and reads tbd + `.substrate` from your **current directory**, so it serves every project from a
single script. It is deliberately **not** part of the docs-core payload, so `substrate adopt`
does **not** clone it into adopted repos — they use this one via the CLI.

```bash
# From inside any project — the substrate CLI is the normal entry point:
substrate tasks                     # open Planning; 1/2 or Tab switch to Epics
substrate tasks --tbd <epic-slug>   # pin one epic
substrate tasks --fixture <path>    # a fixture file (no tbd needed)
substrate tasks --once              # render the default view once, exit (CI)
substrate tasks --list-views        # print discovered views, exit

# Or the script directly (equivalently: node scripts/bead-tui/watch.mjs):
scripts/bead-tui.sh [flags]
```

Put `substrate` on PATH with `scripts/substrate-link.sh` (it self-locates through symlinks, so
there is no `SUBSTRATE_ROOT` to set). Flags: `--tbd <slug>`, `--fixture <path>`, `--once`,
`--list-views`, `--interval <ms>` (idle gap between polls, default 800).

## Views & keys

Two **fixed** views — **Planning** and **Epics** — switched with **1 / 2** or **Tab / Shift-Tab**.
Arrows are **hierarchical** (drill in / out), never lateral. **Esc** backs out one level and, from
the top level, exits (flushing pending sync); **Ctrl-C** quits immediately. **?** opens full help.

- **Planning** — the capture / triage board (see below). **↑/↓ (j/k)** move · **n** new · **r**
  rename title inline · **e** edit body in `$EDITOR` · **space** groom · **x** kill · **[ / ]**
  priority · **t** cycle kind · **Enter** detail.
- **Epics** — a scrollable index of active epics (progress strip + done/total, newest first).
  **↑/↓ (j/k)** move · **/** filter by name · **→ / Enter / l** drill into an epic's beads ·
  **← / Esc / h** back. Orphan and closed beads aren't surfaced — use the tbd CLI for those.
- **Epic beads** (drilled in) — the wave view: **↑/↓ (j/k)** move · **Ctrl-D/Ctrl-U** half-page ·
  **g/G** top/bottom · **Enter** bead details · **← / Esc / h** back to the index.

The `n` / `r` prompts are full inline editors (arrow keys, Home/End, word jumps, mid-string edit).

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
**r** rename title inline · **Enter** open detail · **e** edit body in `$EDITOR` · **space** toggle
groomed · **x** kill · **[ / ]** priority less/more · **t** cycle kind · **g/G** top/bottom · **?** full help.

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
