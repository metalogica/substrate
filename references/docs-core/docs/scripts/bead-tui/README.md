# bead-tui

A **live** terminal view of a bead DAG. It re-renders as tbd state evolves — beads change
status, new beads appear, blocked beads unblock — so you can watch an epic fill in while a
parallel fleet works it. Companion to `bead-graph.sh` (which prints a one-shot graph);
this one stays open and updates.

Zero runtime deps — Node built-ins only, like `bead-graph.sh`.

## Run

```bash
# Live view of the bundled demo fixture (no tbd needed):
node references/docs-core/docs/scripts/bead-tui/watch.mjs

# Live view of a real epic from tbd:
node references/docs-core/docs/scripts/bead-tui/watch.mjs --tbd tui-viz

# One frame then exit (CI / quick check):
node references/docs-core/docs/scripts/bead-tui/watch.mjs --tbd tui-viz --once
```

Flags: `--tbd <epic-slug>` (source from `tbd list --label epic:<slug>`), `--fixture <path>`
(a specific fixture file), `--once` (render once, exit 0), `--interval <ms>` (poll cadence,
default 1000).

## Watch it evolve

- **Fixture mode:** edit `fixture.json` in another pane — flip a `status`, add a node/edge —
  and the view updates within one poll interval. New ids flash `← NEW`; a bead that just
  closed flashes `✓ done`.
- **tbd mode:** in another pane, `tbd update <id> --status in_progress` or `tbd close <id>`,
  and the graph re-renders. The tool polls `.tbd/` mtime and only re-fetches on change.

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

## Why waves, not drawn arrows

An earlier prototype tried a left-to-right graph with routed ASCII arrows. In a terminal
that runs out of width fast and forces long edges to cross node columns — it was unreadable
at seven nodes. Top-to-bottom waves with inline `← blockers` is width-stable, DAG-safe
(fan-in is just `← a, b, c`), and reuses the layering `bead-graph.sh` already computes.
A drawn-rail renderer (git-log-graph style) is a possible future `--graph` mode.
