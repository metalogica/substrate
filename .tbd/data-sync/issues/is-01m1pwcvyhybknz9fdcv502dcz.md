---
type: is
id: is-01m1pwcvyhybknz9fdcv502dcz
title: "substrate --version: tooling vs installed-kernel report (reader for sub-0uxw)"
kind: feature
status: open
priority: 2
version: 1
labels: []
dependencies: []
created_at: 2026-09-04T18:55:16.431Z
updated_at: 2026-09-04T18:55:16.431Z
---
## Why now
Companion/reader for sub-0uxw (adopt stamps kernel version+commit). Operator wants
`substrate --version` in a TARGET repo to answer "which substrate touched this, and
which will act on it now" — the kubectl client/server split.

## Acceptance
- `substrate --version` (and `substrate version`) prints:
  1. tooling: plugin.json#version @ short-sha (branch, dirty flag) + clone path —
     derived from the shim's own resolved root; works with no stamp.
  2. kernel: the sub-0uxw stamp parsed from ./substrate.yaml (cwd) — or an honest
     "no stamp (not adopted, or adopted pre-stamp)".
  3. drift warning line when kernel sha != tooling sha ("re-run /substrate:adopt").
- Zero-dep bash; exits 0 in all informational cases.
- README verb table gains the row.

## State-transfer prompt
> Working in metalogica/substrate. Task: add --version/version to the substrate shim.
> Relevant files:
> - scripts/substrate — dispatcher (resolves its own path; add flag handling BEFORE
>   subcommand case; note: memory says ONE machine-wide definition, keep it that way)
> - .claude-plugin/plugin.json — tooling version source
> - skills/adopt stamp format from sub-0uxw — the kernel line's parse target
> Constraints: no new deps; degrade gracefully outside git repos and unstamped repos.
> Verification: run in (a) the plugin repo, (b) an adopted+stamped repo, (c) a bare dir
> — three correct, non-crashing outputs.
