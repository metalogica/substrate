# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repo is

A Claude Code **plugin** that scaffolds full-stack Vite + Convex + Clerk applications following Domain-Driven Design, railway-oriented programming (`Result<T,E>`), and a testing pyramid.

The plugin exposes:

- **13 user-facing skills** under `skills/`:
  - `/substrate:init` — scaffold a new project in an empty directory (stage 1)
  - `/substrate:adopt` — install the stack-agnostic docs/doctrine/gate kernel onto an *existing* repo of any language (symmetric opposite of `migrate`); no opinionated stack, wires `substrate.yaml` to the repo's own compile/test/lint
  - `/substrate:migrate` — migrate a Gemini AI Studio prototype into the kernel (stage 2)
  - `/substrate:deploy` — Clerk + Vercel + first live deploy (stage 3)
  - `/substrate:architect-spec <brief>` — SDD orchestrator that produces gated multi-phase specs, then graphs them into a bead DAG
  - `/substrate:graph-spec <spec>` — "Graph the Spec": decompose a written spec into a DAG of tbd beads (epic + children under label `epic:<slug>`, `blocked-by:` edges, Kahn cycle-check), rendered via `docs/scripts/bead-graph.sh`. Called automatically by `architect-spec`; runnable standalone. Produces the DAG only — the parallel-execution doctrine's orchestrator consumes it.
  - `/substrate:orchestrate <epic-or-spec>` — **the primary execution door.** Executes a graphed bead DAG as a parallel worktree fleet per `agents-parallel-execution-doctrine.md`: reads the context-budget partition (`group:<window-N>` labels), cuts a `feat/<epic-slug>` integration branch, dispatches one **group-runner** per file-disjoint ready **window** in its own worktree (one seed+install per window), gates each bead in sequence, merge-on-green, re-gate the integrated tip, pause between waves (`--auto` to skip), writes `.substrate/execution-state.json`, one signed squash commit on trunk. Consumes the DAG; single-writer tracker. Tool-agnostic (Agent↔Task) with a CC-only Workflow fast-path
  - `/substrate:execute <spec>` — **the attended single-window mode** (K=1, human-in-the-loop) — the alternative to the orchestrated default. Executes a spec phase-by-phase with one implementing agent and verification-gate pauses; Step-0 offers to switch to `orchestrate` when the DAG would clearly win as a parallel fleet (≥3 file-disjoint windows + tracker + user confirm), else stays attended
  - `/substrate:quick-spec` — lightweight single-feature iteration loop
  - `/substrate:diagnose <error-context>` — targeted bug-fix loop: matches the error to a doctrine (path-layer + manifest-trigger + symbol-search composite), generates ranked hypotheses, fixes, verifies both green gate AND repro-no-longer-fires, commits
  - `/substrate:synthesize-session` — terminal phase after the executor (`/substrate:orchestrate` or the attended `/substrate:execute`): capture session learning into atomic doctrine fixes, queued amendments, and dependency-ordered beads with state-transfer prompts
  - `/substrate:add-doctrine <name>` — scaffold a new doctrine + manifest entry for horizontal expansion (infra, claw, treasury, etc.)
  - `/substrate:spool` — close a big-context session and reopen its *position* in a fresh session through a lightweight, verified pointer (cheaper + safer than `/compact` or `/clear`). Grounds every anchor against the repo, batches a single HIL checkpoint over unverifiable claims + repo/chat conflicts, writes a launcher to an out-of-repo ID-keyed store (`~/.substrate/spool/`, TTL-swept — commits nothing). `--resume <id>` re-verifies volatile anchors, confirms, deletes (`--keep` to retain); `--list` shows the store. Sits one tier *above* `synthesize-session`: synthesize captures per-spec learning, spool carries campaign position across specs.

- **2 subagents** under `agents/`:
  - `doctrine-architect` — generic, parameterized doctrine specialist. Spawned by orchestrator skills (`/substrate:architect-spec`, `/substrate:migrate`) once per relevant doctrine; binds to whichever doctrine file it's given. Orchestration runs at skill level (depth 0) so the fan-out can spawn N children — subagents cannot themselves spawn subagents.
  - `bead-implementer` — **group-runner** spawned by `/substrate:orchestrate`, one per file-disjoint ready **window** (a `group:<window-N>` of file-adjacent beads) in its own git worktree. Implements the N beads of that group in sequence against inlined per-bead Goal/Files/Gate tuples, gating each bead as it lands and stopping the window on the first red gate, then reports a per-bead pass/fail ledger + a diff summary. Touches neither the tracker nor the remote (`permission.task: deny`; "no tbd, no git push" prompt-enforced) — single-writer stays with the orchestrator.

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
├── agents/                         # 2 subagents (markdown with YAML frontmatter)
├── skills/                         # 13 user-facing skills
│   ├── init/SKILL.md
│   ├── adopt/SKILL.md
│   ├── migrate/SKILL.md
│   ├── architect-spec/SKILL.md
│   ├── graph-spec/SKILL.md         # decompose a spec into a bead DAG
│   ├── execute/SKILL.md            # attended single-window mode (K=1, HIL); Step-0 offers orchestrate
│   ├── orchestrate/SKILL.md        # PRIMARY door: bead DAG as a parallel worktree fleet (group-runners)
│   ├── quick-spec/SKILL.md
│   ├── diagnose/SKILL.md
│   ├── synthesize-session/SKILL.md
│   ├── spool/SKILL.md              # close a session → verified pointer → reopen fresh
│   ├── add-doctrine/SKILL.md
│   └── deploy/SKILL.md
├── opencode/                       # OpenCode port (additive; mirrors skills/ + agents/)
│   ├── README.md                   # SKILL→command translation guide + parity rule
│   ├── CONVENTIONS.md              # empirically-verified OpenCode facts (dir names, namespacing)
│   ├── command/substrate/          # 12 commands → /substrate/<name>
│   ├── agent/doctrine-architect.md # mode: subagent
│   └── agent/bead-implementer.md   # mode: subagent (task: deny)
├── references/
│   ├── doctrines/                  # copied to target project's docs/doctrine/
│   ├── sdd-protocol/               # copied to target project's docs/protocol/sdd/
│   ├── templates/                  # copied to target project root
│   └── example/                    # golden reference (not copied)
├── scripts/                        # bash helpers invoked by skills (incl. opencode-link.sh / opencode-unlink.sh)
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

Users invoke skills (`/substrate:init`, `/substrate:architect-spec`, etc.). Skills spawn agents via the Agent tool. Both `architect-spec` (for brief → spec) and `/substrate:migrate` (for prototype → kernel) discover doctrines and spawn one `doctrine-architect` per relevant doctrine in parallel — a single Agent-tool message with N tool calls. `/substrate:quick-spec` reads doctrines directly (no subagent dispatch) but uses the same manifest-or-glob discovery.

### OpenCode port (additive, kept in parity)

substrate also runs inside **OpenCode** (`1.17.14`). The `opencode/` tree ports the 13 skills to
OpenCode **commands** (`opencode/command/substrate/<name>.md` → `/substrate/<name>`) and both
`doctrine-architect` and `bead-implementer` to OpenCode **agents** (`mode: subagent`). Install by symlink with
`scripts/opencode-link.sh` (undo: `opencode-unlink.sh`) — the OpenCode mirror of the Claude Code
`dev-link.sh` hot-reload loop.

Key differences from the Claude Code surface, all recorded in `opencode/CONVENTIONS.md`
(empirically verified, not recalled):

- **Additive, never subtractive.** The port does not alter `skills/`, `agents/`, or manifests.
- **Parity rule (binding).** Each `opencode/command/substrate/<name>.md` is a *translation* of
  `skills/<name>/SKILL.md`. When a skill changes, re-translate its command in the same change.
  Audit: `comm -23 <(ls skills|sort) <(ls opencode/command/substrate|sed 's/\.md$//'|sort)`.
- **Fan-out via the Task tool.** `architect-spec`/`migrate` dispatch `doctrine-architect` via
  OpenCode's Task tool (parallel where supported; sequential fallback logged). Executing agent needs
  `permission.task: allow`; `doctrine-architect` runs `permission.task: deny` (one-level depth).
- **SUBSTRATE_ROOT is explicit.** OpenCode has no plugin cache, so `init`/`adopt`/`migrate`/`deploy`
  read `${SUBSTRATE_ROOT:?}` and fail fast if unset.

### Doctrine manifest (optional contract)

When a project's doctrine tree grows past three flat files, it can declare a `docs/doctrine/doctrine-manifest.yaml` to drive discovery. Schema:

| Field | Required | Purpose |
|---|---|---|
| `id` | yes | Short unique identifier (e.g. `backend`, `infra`, `praxis`) |
| `name` | yes | Human-readable label |
| `path` | yes | Relative path to the doctrine `.md` file |
| `triggers` | no | List of brief-content keywords; doctrine is dispatched only when one matches. Omit to mark the doctrine as always-relevant. |
| `summary` | yes | Short blurb the orchestrator reads before deciding to dispatch |
| `specialist` | no | Agent to dispatch (default `doctrine-architect`); reserved for future per-doctrine custom specialists |
| `layer-hint` | no | One of `domain \| backend \| frontend \| infra \| cross-cutting`; controls phase ordering in the composed spec |

If no manifest is present, orchestrators fall back to globbing `docs/doctrine/**/*-doctrine.md` and dispatching every match. The flat-three-file layout substrate ships in `references/templates/` is handled by this fallback without any manifest required.

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
