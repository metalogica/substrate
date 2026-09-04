---
type: is
id: is-01kzpmrs0c9daj547sex8bbha1
title: "Resolve sub-yum8: substrate is half-adopted, so which of its own skills work in-repo is arbitrary"
kind: task
status: open
priority: 2
version: 1
labels: []
dependencies: []
created_at: 2026-08-10T20:10:34.380Z
updated_at: 2026-08-10T20:10:34.380Z
---
This repo is partially adopted, and nothing documents the boundary:

  substrate.yaml   EXISTS  -> /substrate:orchestrate works here
                              (gate: cd daemon && pnpm exec tsc --noEmit / vitest run)
  docs/doctrine/   MISSING -> /substrate:quick-spec and /substrate:diagnose REFUSE
                              (quick-spec SKILL.md:31 "Project not scaffolded (no docs/doctrine/)")

So substrate cannot use its own everyday tooling on itself, and which skills work is
discovered only by trying them. This is the concrete cost of sub-yum8 being left open as
an open-question rather than decided.

Two coherent end states — pick one and write it down:

  A. Self-adopt. Run /substrate:adopt in-repo: adds docs/doctrine/ (the repo's OWN doctrine,
     not the template payload under references/), AGENTS.md, a pre-commit hook. Every skill
     then works in-repo and the plugin dogfoods its own kernel. Risk: two doctrine trees
     (references/docs-core/... as payload vs docs/doctrine/ as this repo's own) that readers
     and doctrine-lint must not confuse.
  B. Declare it deliberately unadopted. Document in CLAUDE.md exactly which skills apply to
     the plugin repo and which are for target projects, and have the refusing skills say so
     rather than telling the user to run /substrate:init on the repo that ships init.

Blocked-by in spirit on the gate-hardcoding bug (sub-gh0b): option A only pays off once the
refusing skills read substrate.yaml, otherwise self-adopting still leaves them running
pnpm app:* against a repo whose gate is `cd daemon && ...`.

Supersedes the open-question framing of sub-yum8; close that one when this lands.
