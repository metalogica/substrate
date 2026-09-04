---
type: is
id: is-01m1pyk6kqpk9hvwyagj2sgzjr
title: substrate.yaml gate covers daemon/ only — 13 of 14 doctrine-crud beads edited files no gate command runs
kind: task
status: open
priority: 2
version: 1
spec_path: docs/tasks/ongoing/doctrine-crud/doctrine-crud-spec.md
labels:
  - src:synth-doctrine-crud
dependencies: []
created_at: 2026-09-04T19:33:41.111Z
updated_at: 2026-09-04T19:33:41.111Z
---
---
originating-spec: docs/tasks/ongoing/doctrine-crud/doctrine-crud-spec.md
originating-session: 2026-09-04
cross-repo: in-repo
effort: S
---

## Why now (session signal)
`substrate.yaml` declares `gate.compile` and `gate.test` as `cd daemon && pnpm exec tsc --noEmit` /
`vitest run`. Thirteen of epic:doctrine-crud's fourteen beads edited `skills/`,
`references/docs-core/docs/`, and `opencode/` — surfaces neither command executes. Every per-bead
green and every per-wave union re-gate was therefore near-vacuous for the work actually being done:
the two commands proved only that the daemon still compiled, which no bead had touched.

The load-bearing signal was `gate.lint` (`doctrine-lint.sh` — which grew rules 5/6/7 mid-epic and so
partly self-tested) plus each bead's own acceptance grep. To cover the rest the orchestrator invented
three checks per wave that `substrate.yaml` does not declare: a skills<->opencode parity audit
(`comm -23 <(ls skills|sort) <(ls opencode/command/substrate|sed 's/\.md$//'|sort)`), a stray
`**Version**` sweep over the doctrine trees, and a `doctrine-digest.sh` id-chain resolution check.
Ad-hoc checks invented per run are not a gate.

## Acceptance criterion
`substrate.yaml`'s gate block covers the repo's doc/skill surface, not just `daemon/`. At minimum the
skills<->opencode parity audit runs as a declared command, so the CLAUDE.md parity rule stops being
enforced only by whoever remembers to run `comm` by hand.

## Notes
Depends on sub-fsji, which creates the parity-lint script this bead would wire into the gate. Do that
one first; this is the "and now make it a gate" half.

Worth considering while in there: a SKILL.md line-count assertion (CLAUDE.md's ~500-line cap is
currently prose — `skills/synthesize-session/SKILL.md` is at 574 and nothing complains; see the
sibling bead for that specific file).

Do NOT over-fit to this repo. `substrate.yaml` is the contract `/substrate:adopt` writes into target
repos of any language; whatever lands here should read as "declare what your repo's gate actually
covers", not "every repo must run comm".

## Dependencies
- blocked-by: [sub-fsji]

## State-transfer prompt
> Working in metalogica/substrate. Task: extend this repo's substrate.yaml gate to cover the
> skills/docs surface, starting with the opencode parity audit.
> Relevant files:
> - substrate.yaml — the gate block (compile/test/lint); currently daemon-only for compile+test
> - CLAUDE.md — the parity rule this would enforce ("each opencode/command/substrate/<name>.md is a
>   translation of skills/<name>/SKILL.md"), and the ~500-line SKILL body cap
> - references/docs-core/docs/scripts/doctrine-lint.sh — the existing zero-dep bash idiom to match
> Relevant prior commits:
> - 753ec9c — the epic that exposed the gap; see its spec's `### Post-execution notes`
> Constraints — do NOT modify: the gate contract's shape (compile/test/lint keys read by
> /substrate:orchestrate Step 3); the zero-runtime-dep rule for kernel scripts.
> Verification:
> - Each declared gate command exits 0 on a clean tree.
> - Deleting one opencode/command/substrate/*.md turns the gate red.
