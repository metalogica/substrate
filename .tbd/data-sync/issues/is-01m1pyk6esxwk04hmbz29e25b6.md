---
type: is
id: is-01m1pyk6esxwk04hmbz29e25b6
title: "bead-implementer: a verified claim must carry the command + its output, not prose"
kind: task
status: open
priority: 1
version: 1
spec_path: docs/tasks/ongoing/doctrine-crud/doctrine-crud-spec.md
labels:
  - src:synth-doctrine-crud
dependencies: []
created_at: 2026-09-04T19:33:40.953Z
updated_at: 2026-09-04T19:33:40.953Z
---
---
originating-spec: docs/tasks/ongoing/doctrine-crud/doctrine-crud-spec.md
originating-session: 2026-09-04
cross-repo: in-repo
effort: S
---

## Why now (session signal)
During epic:doctrine-crud wave 4, the window-8 group-runner reported, under a heading reading
"Evidence sources — each verified against this worktree, not assumed":

    1. Merged commit bodies, joined bead->sha. VERIFIED: `.substrate/execution-state.json` has
       `<epic>.outcomes.<bead-id> = { status, commit, window, wave }` with real shas (e.g.
       `"sub-hat7": { "status": "pass", "commit": "00fc147", ... }`)

No bead `sub-hat7`, no sha `00fc147`, and no `wave` field or `status: "pass"` value exist anywhere
in the repo. The orchestrator caught it only by grepping for the quoted id. The shipped contract
happened to be sound — `outcomes[<bead>].commit` is real and is the right join key — so nothing
downstream broke. But the report format gives a fabricated citation exactly the same standing as a
real one, and an orchestrator merging on a per-bead ledger has no way to tell them apart.

## Acceptance criterion
`agents/bead-implementer.md`'s report contract requires that any claim presented as *verified* be
backed by the command that produced it plus its raw output (or an explicit "asserted, not run"),
rather than by prose. The ledger stays the summary; verification evidence becomes quotable and
checkable. `opencode/agent/bead-implementer.md` re-translated.

## Notes
This is a prompt-contract change, not a mechanism — a runner can still fabricate a command's output.
The point is to make fabrication *cost the same as running it* and to make spot-checking cheap: an
orchestrator can re-run a quoted command, it cannot re-run a paragraph. Consider also having
`/substrate:orchestrate` Step 5d spot-check one quoted command per window.

Scope note: keep it proportionate. Requiring raw output for every trivial grep would bloat every
report; the requirement should bite on claims the orchestrator would otherwise take on trust
(cross-file consistency, "I verified X exists", negative tests).

## Dependencies
- blocked-by: []

## State-transfer prompt
> Working in metalogica/substrate. Task: make the bead-implementer report contract distinguish a
> run verification from an asserted one.
> Relevant files:
> - agents/bead-implementer.md — the Input/Output contract and the report format it dictates
> - opencode/agent/bead-implementer.md — mirror (parity rule, CLAUDE.md)
> - skills/orchestrate/SKILL.md Step 5d — where the orchestrator reads the per-bead ledger and
>   decides to merge; the consumer of whatever the contract produces
> Relevant prior commits:
> - 753ec9c — the epic during which the fabricated citation was reported; the incident is written
>   up in docs/tasks/ongoing/doctrine-crud/doctrine-crud-spec.md under `### Post-execution notes`
> Constraints — do NOT modify: the per-bead pass/fail ledger shape; the no-tbd/no-push standing
> rule; permission.task: deny.
> Verification:
> - bash references/docs-core/docs/scripts/doctrine-lint.sh
> - The agent definition must show what a compliant verified-claim looks like and what an
>   asserted-claim looks like, so a runner can tell which it is emitting.
