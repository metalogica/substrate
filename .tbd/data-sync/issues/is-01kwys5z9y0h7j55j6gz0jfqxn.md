---
type: is
id: is-01kwys5z9y0h7j55j6gz0jfqxn
title: "[drift] Reconcile CC bead-implementer frontmatter — permission block inert in Claude Code"
kind: chore
status: open
priority: 3
version: 1
labels:
  - epic:orchestrate
  - synth
dependencies: []
parent_id: is-01kwyqmd14n7ey3kqmtfh6qvg1
created_at: 2026-07-07T17:14:31.101Z
updated_at: 2026-07-07T17:14:31.101Z
---
---
type: drift
status: open
effort: XS
epic: orchestrate
originating-spec: docs/tasks/completed/orchestrate/orchestrate-spec.md
originating-session: 2026-07-07
cross-repo: in-repo
---

# Reconcile CC bead-implementer frontmatter — `permission:` block is inert in Claude Code

## Why now (session signal)
Spec §4.1 + Phase-1 verify mandated a `permission: { edit: allow, bash: allow, read: allow, task: deny }`
block on the Claude Code `agents/bead-implementer.md`. That is an OpenCode convention — CC agent
frontmatter has no `permission` key (the existing `agents/doctrine-architect.md` has none; CC restricts
tools via `tools:` and subagent depth is structural). The block passes `grep task: deny` but is inert in CC.

## Acceptance criterion
`agents/bead-implementer.md` represents its leaf-subagent intent using a Claude-Code-idiomatic mechanism.
Either: (a) replace the `permission:` block with a CC `tools:` allow-list (Edit, Write, Read, Bash — no Agent),
OR (b) keep the block but add a one-line comment/doc noting it is retained for parity symmetry and is inert in CC.
The OpenCode `opencode/agent/bead-implementer.md` keeps its `permission:` block unchanged (valid there).
Decision + rationale recorded in the file.

## State-transfer prompt
> Working in https://github.com/metalogica/substrate. Task: reconcile the Claude Code
> `agents/bead-implementer.md` frontmatter so it uses a CC-idiomatic tool restriction rather than the
> inert OpenCode `permission:` block (see spec post-execution notes).
>
> Relevant files:
> - agents/bead-implementer.md — the CC agent with the inert `permission:` block
> - agents/doctrine-architect.md — reference CC agent (no permission block; `model: inherit` only)
> - opencode/agent/bead-implementer.md — OpenCode form where `permission:` IS valid (leave as-is)
>
> Constraints — do NOT modify: the OpenCode agent's `permission:` block; the "no tbd/no push" standing rule text.
> Verification: `grep -qi "task" agents/bead-implementer.md` still conveys leaf-depth intent; parity audit stays empty.
---

## Dependencies
- blocked-by: []

## Notes
Low priority — functionally harmless (CC ignores unknown frontmatter keys; depth is structural). Semantic-clarity fix only.
