---
type: is
id: is-01m1pse921rw1z10ngydq1b12r
title: "bead-graph.sh: --no-sync removed in tbd 0.4.2 — every graph render fails as 'no beads found'"
kind: bug
status: open
priority: 1
version: 1
labels: []
dependencies: []
created_at: 2026-09-04T18:03:36.896Z
updated_at: 2026-09-04T18:03:36.896Z
---
bead-graph.sh calls `tbd list ... --no-sync`; tbd 0.4.2 removed the flag, so every
invocation dies with "unknown option '--no-sync'" (swallowed by 2>/dev/null, surfaces
as "no beads found for epic:<slug>" — a misleading empty-graph result, worse than a
crash). Found while graphing epic:doctrine-crud.

Fix: drop the flag, or feature-detect it (`tbd list --help | grep -q no-sync`).
Same family as sub-ay61 (npx shadow) and sub-2nu6 (preflight coupling to tbd output).
Verify: `bash docs/scripts/bead-graph.sh --epic doctrine-crud` renders 5 waves.
