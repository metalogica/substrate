---
type: is
id: is-01m1pykdd2h8hs2hwp2p308jjg
title: "[open-question] May an orchestrator extend the union re-gate with checks it computes itself?"
kind: task
status: open
priority: 4
version: 1
spec_path: docs/tasks/ongoing/doctrine-crud/doctrine-crud-spec.md
labels:
  - src:synth-doctrine-crud
  - open-question
dependencies: []
created_at: 2026-09-04T19:33:48.065Z
updated_at: 2026-09-04T19:33:48.065Z
---
---
originating-spec: docs/tasks/ongoing/doctrine-crud/doctrine-crud-spec.md
originating-session: 2026-09-04
status: parked
---

## The question
`agents-parallel-execution-doctrine.md` and `/substrate:orchestrate` Step 5e define the per-wave
union re-gate as exactly `gate.{compile,test,lint}` union every per-bead `Gate_i` exercised that
wave. That union is called "the sole merge-authorizing signal".

During epic:doctrine-crud the orchestrator ran three additional checks after every wave that no
`substrate.yaml` declares and no bead's `Gate_i` names:

- skills<->opencode parity audit (`comm -23 <(ls skills|sort) <(ls opencode/…|sed …|sort)`)
- stray `**Version**` sweep across the doctrine trees
- `doctrine-digest.sh` id-chain resolution (does every stampable manifest id still resolve?)

They were run because the declared gate covers `daemon/` only and 13 of 14 beads edited docs and
skills — so without them, cross-window contradictions had no net at all. They found nothing this
run. But they were invented at runtime by one orchestrator, are recorded only in
`.substrate/execution-state.json` notes, and would not be run by the next orchestrator or by the
OpenCode path.

So: **may an orchestrator extend the union re-gate with checks it computes itself, or must every
merge-authorizing check be a declared command?**

## Why parked
Both answers are defensible and the trade-off is real, so this needs a decision rather than a fix.

- *Declared-only* keeps the gate reproducible, tool-agnostic, and auditable — the doctrine's current
  position, and the reason `substrate.yaml` exists at all. But it means an under-declared gate
  silently authorizes merges it never checked, which is exactly what happened here.
- *Orchestrator-computed allowed* gets a real net immediately and adapts to what a wave actually
  touched. But "the gate" stops being a fixed contract, per-run behaviour becomes non-reproducible,
  and OpenCode and Claude Code can legitimately diverge.

A third option — make the checks declarable, so they migrate from orchestrator improvisation into
`substrate.yaml` — may dissolve the question, and is what the sibling gate-coverage bead starts on.
Resolving it before that bead lands would be premature.

## When to revisit
When the gate-coverage bead (extend substrate.yaml past `daemon/`) is picked up, or the first time
an orchestrator run reports a composition failure that only an undeclared check caught — whichever
comes first.
