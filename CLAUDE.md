# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repo is

A Claude Code **plugin** that scaffolds full-stack Vite + Convex + Clerk applications following Domain-Driven Design, railway-oriented programming (`Result<T,E>`), and a testing pyramid.

The plugin exposes:

- **6 user-facing skills** under `skills/`:
  - `/substrate:init` — scaffold a new project in an empty directory (stage 1)
  - `/substrate:migrate` — migrate a Gemini AI Studio prototype into the kernel (stage 2)
  - `/substrate:deploy` — Clerk + Vercel + first live deploy (stage 3)
  - `/substrate:architect-spec <brief>` — SDD orchestrator that produces gated multi-phase specs
  - `/substrate:execute <spec>` — executes a spec phase-by-phase with verification gates
  - `/substrate:quick-spec` — lightweight single-feature iteration loop

- **4 architect subagents** under `agents/`:
  - `domain-architect`, `backend-architect`, `frontend-architect` — per-layer specialists spawned in parallel by the orchestrator skills
  - `architect-spec` — SDD orchestrator that spawns the layer specialists and composes their outputs into a spec

- **Shared references** under `references/`:
  - `doctrines/` — binding architectural doctrines (domain, backend, frontend) copied into every new substrate project as `docs/doctrine/`
  - `sdd-protocol/` — Spec-Driven Development protocol (brief format, execution format, spec template) copied into every new project as `docs/protocol/sdd/`
  - `templates/` — the ready-to-copy project kernel (root files, `src/`, `convex/`, `domain/`, `test/`, `docs/product/`)
  - `example/` — golden reference of a finished substrate project (Clawcraft) for quality comparison (not copied into target projects)

- **Bash scripts** under `scripts/`: `scaffold.sh`, `init-github.sh`, `connect-vercel.sh`, `setup-clerk.sh`

- **Plugin manifest** at `.claude-plugin/plugin.json`

## Installation

### Production (plugin install)

End users install from the public marketplace:

```
/plugin marketplace add metalogica/substrate
/plugin install substrate@metalogica
/reload-plugins
```

Claude Code v2.1.114+ uses a marketplace-only model — it no longer auto-discovers directories dropped into `~/.claude/plugins/<name>/`. The old `ln -s /path/to/repo ~/.claude/plugins/substrate` workflow does not work.

### Development (fast iteration via cache-symlink)

To edit substrate and see changes hot-reload in every Claude Code session without pushing a release:

1. Register your local clone as a marketplace and install:
   ```
   /plugin marketplace add /absolute/path/to/your/clone/of/substrate
   /plugin install substrate@metalogica
   /reload-plugins
   ```
2. Swap the cached copy for a symlink back to the source repo:
   ```bash
   ./scripts/dev-link.sh
   ```

Every edit, branch switch, or uncommitted change in the source repo is now visible after `/reload-plugins` in any session — including sessions opened in unrelated projects.

Before cutting a release, restore a normal copied install so the release is validated against a clean tree:

```bash
./scripts/dev-unlink.sh
```

See the README's "Development" section for the full flow and the guardrails (don't bump `plugin.json#version` on feature branches; use the GitHub marketplace `metalogica/substrate` for release, local-path marketplace for dev).

To test scaffolding in isolation, `cd` into a fresh sandbox directory and invoke `/substrate:init`. The skills discover `SUBSTRATE_ROOT` via a path-search helper (see `skills/init/SKILL.md` step 2).

## Repo layout

```
substrate/
├── .claude-plugin/plugin.json     # plugin manifest
├── agents/                         # 4 subagents (markdown with YAML frontmatter)
├── skills/                         # 6 user-facing skills
│   ├── init/SKILL.md
│   ├── migrate/SKILL.md
│   ├── architect-spec/SKILL.md
│   ├── execute/SKILL.md
│   ├── quick-spec/SKILL.md
│   └── deploy/SKILL.md
├── references/
│   ├── doctrines/                  # copied to target project's docs/doctrine/
│   ├── sdd-protocol/               # copied to target project's docs/protocol/sdd/
│   ├── templates/                  # copied to target project root
│   └── example/                    # golden reference (not copied)
├── scripts/                        # bash helpers invoked by skills
└── CLAUDE.md                       # this file
```

## Architectural principles

### Progressive disclosure

- **Skill descriptions** are always in context (cheap — always loaded).
- **Skill bodies** load only when a user invokes the skill.
- **Doctrines + references** load only when a skill follows a link to them.

Keep SKILL.md bodies under ~500 lines. Bulk content goes in `references/`.

### Stage detection via filesystem

Skills detect which stage the user is in by inspecting the current directory, not via a state file. Each skill's "When to run" / "When to REFUSE" sections encode the stage gate. No `.substrate/state.yml` — filesystem is self-healing.

### Agents are spawned by skills, never directly by the user

Users invoke skills (`/substrate:init`, `/substrate:architect-spec`, etc.). Skills spawn agents via the Agent tool. The three layer architects are spawned in parallel by `architect-spec` and `substrate:migrate` in a single message with three tool calls.

### Scaffold by copy, not by template engine

The template tree in `references/templates/` is copied verbatim into new projects via `cp -R`. Only two tokens (`{{PROJECT_NAME}}`, `{{PROJECT_DESCRIPTION}}`) get substituted via `sed` at scaffold time. Product-specific content (Gemini AI Studio prompt, runtime system prompt) is filled in a second pass by the skill using `Edit` calls after `scaffold.sh` returns.

## Doctrine

The three doctrines in `references/doctrines/` are the quality bar. Every substrate project is bound to them:

- **domain-doctrine.md** — pure TypeScript, no framework imports, `Result<T,E>`, Brand types, immutable value objects.
- **backend-doctrine.md** — Convex schema + queries/mutations/actions, `requireAuth` via Clerk JWT, `v.*` validators, index per filter.
- **frontend-doctrine.md** — Vite + TanStack Router + Tailwind v4 + Clerk, hook-layer bridge, pure presentational components, no inline validation.

Changes to these doctrines ripple into every substrate project scaffolded after the change. Treat them as stable infrastructure.

## Testing the plugin

There's no automated test suite for the plugin itself (skills are natural-language contracts, not code). To validate changes manually:

1. Symlink the repo into `~/.claude/plugins/substrate/`.
2. `cd` into a fresh sandbox directory.
3. Invoke `/substrate:init`, walk the Socratic Q&A, verify the scaffold is green (`pnpm app:compile && pnpm app:test`).
4. Drop a sample Gemini Build export into `prototype/`, invoke `/substrate:migrate`, verify the migration plan is sensible and the executed migration stays green.
5. Write a minimal brief at `docs/tasks/ongoing/<feature>/<feature>-brief.md`, invoke `/substrate:architect-spec`, verify a well-formed spec is produced.
6. In a **fresh Claude session**, invoke `/substrate:execute` on that spec. Verify it walks phases correctly and pauses at each gate.
7. Run `/substrate:deploy` end-to-end through Clerk + Vercel; confirm a live URL works with Google sign-in.

Regressions to watch for:

- Scaffold's `app:compile` or `app:test` failing on a fresh `pnpm install`.
- Architect outputs drifting from their declared output-format templates.
- Skills referencing paths that don't exist after doctrine or template changes.
- Template files accumulating Clawcraft-specific content (kubernetes, three.js, etc.) — the kernel must stay minimal.
