# Substrate

![Logo](./assets/logo-large.png)

**A Claude Code plugin that scaffolds full-stack Vite + Convex + Clerk apps from concept to production in 15 minutes.**

```
# step 1
/plugin marketplace add metalogica/substrate
# step 2
/plugin install substrate@metalogica
# step 3
/reload-plugins

# Cook 🧑‍🍳🔥
```

## Principles

- **Spec-Driven Development** — briefs become specs, specs become gated executions.
- **Domain-Driven Design** — business rules live in pure TypeScript, not scattered through components.
- **Railway-oriented programming** — fallible operations return `Result<T, E>`, not exceptions.
- **Minimal unit-tested kernel** — domain is the base of the testing pyramid; tests are green from commit #1.
- **Convention over configuration** — opinionated structure, no JS Tailwind config, no `index.ts` barrels.

## Stack

| Layer | Choice |
|-------|--------|
| Frontend | Vite + React 18 + TanStack Router + Tailwind v4 |
| Backend | Convex (realtime database + server functions) |
| Auth | Clerk (dev instance ships with shared Google OAuth — no Google Cloud setup) |
| Deploy | Vercel (auto-deploy on `git push`) |
| Package manager | pnpm |

## Install

See the commands at the top of this README. After install, all eight skills appear under `/substrate:*`.

### Development

To iterate on the plugin itself without pushing a release for every change, use the local-path marketplace + cache-symlink workflow.

**One-time setup.** Clone this repo, then in Claude Code:

```
/plugin marketplace add /absolute/path/to/your/substrate
/plugin install substrate@metalogica
/reload-plugins
```

This registers your local clone as a marketplace and installs substrate from it. Claude Code copies the plugin into `~/.claude/plugins/cache/metalogica/substrate/<version>/`.

**Enable hot reload.** Swap the cached copy for a symlink back to your source repo:

```bash
./scripts/dev-link.sh
```

Now any edit in the source repo is live. In any Claude Code session — including ones open in unrelated projects — run `/reload-plugins` to pick up changes. Switching branches (`git checkout feature/foo`) is instantly reflected too.

**Before cutting a release.** Restore a normal copied install so the release is tested against a clean tree:

```bash
./scripts/dev-unlink.sh
```

This removes the symlink, reinstalls from the marketplace, and leaves you pointing at the version you're about to release.

**Two-track model:**

| Track | Marketplace source | Purpose |
|---|---|---|
| Dev (this machine) | local path → your substrate clone | hot reload, no push-to-test |
| Release (everyone else) | `metalogica/substrate` on GitHub | users install stable tagged versions |

**Rules for this loop to stay healthy:**

- Don't bump `.claude-plugin/plugin.json#version` on feature branches. The cache path is keyed by that version; bumping mid-dev orphans the symlink.
- If the dev symlink ever gets overwritten by an auto-update, just re-run `./scripts/dev-link.sh`.
- A broken feature branch = a broken plugin in your test session. That's the intended behavior (you're testing WIP); check out `main` if you need a known-good state.

## Using substrate in OpenCode

substrate also runs inside [OpenCode](https://opencode.ai) (`1.17.14`). The plugin's 11 skills are
ported to OpenCode **commands** and the `doctrine-architect` subagent to an OpenCode **agent**,
living in the version-controlled `opencode/` tree. See `opencode/README.md` for the full
SKILL→command translation guide and `opencode/CONVENTIONS.md` for the empirically-verified OpenCode
facts (directory names, namespacing, Task-tool fan-out).

**Two-tier model.** An *adopted* repo already gives OpenCode passive context for free — `AGENTS.md`,
`docs/`, and `docs/scripts/*.sh` are read automatically. The **active** `/substrate/*` command
surface needs one install step: symlink the `opencode/` tree into your global OpenCode config.

```bash
# from your substrate clone
bash scripts/opencode-link.sh      # symlinks opencode/{command,agent} into ~/.config/opencode/
# undo with: bash scripts/opencode-unlink.sh
```

After linking, a fresh OpenCode session lists all commands under the `substrate/` namespace —
`/substrate/init`, `/substrate/quick-spec`, `/substrate/architect-spec`, … — and
`opencode agent list` shows `doctrine-architect`. The link is idempotent and non-destructive (it
refuses to overwrite a real file), and it hot-reloads: edits in the source repo are live in the
next OpenCode session.

**SUBSTRATE_ROOT.** OpenCode has no plugin cache to discover the substrate source tree, so the
three commands that need it (`init`, `adopt`, `migrate`, plus `deploy` which shells to
`scripts/*.sh`) read `${SUBSTRATE_ROOT:?}` and fail fast with a clear message if it's unset. Set it
in your shell or in `~/.config/opencode/opencode.jsonc` under `env`:

```bash
export SUBSTRATE_ROOT=/absolute/path/to/your/substrate/clone
```

**Orchestrators.** `/substrate/architect-spec` and `/substrate/migrate` dispatch the
`doctrine-architect` subagent via the OpenCode **Task tool** (one task per doctrine, parallel where
the runtime supports it; sequential fallback otherwise). The executing agent needs
`permission.task: allow`.

**Parity rule.** The `opencode/command/substrate/*.md` files are translations of
`skills/*/SKILL.md` and must be kept in sync — when a skill changes, re-translate its command in the
same change. Audit with `comm -23 <(ls skills | sort) <(ls opencode/command/substrate | sed 's/\.md$//' | sort)` (expect empty).

## The pipeline

```
empty folder
    │
    ▼
/substrate:init            ← stage 1: scaffold + Socratic Q&A + twin Gemini prompts
    │
    ▼
aistudio.google.com/build  ← paste prompt, iterate, download ZIP → /prototype
    │
    ▼
/substrate:migrate         ← stage 2: architects analyze prototype, move src/, draft Convex
    │
    ▼
/substrate:quick-spec  OR  /substrate:architect-spec (→ graph-spec bead DAG) + /substrate:execute   ← iterate features
    │
    ▼
/substrate:synthesize-session   ← terminal phase: capture session learning into doctrine fixes + beads
    │
    ▼
/substrate:deploy          ← stage 3: Clerk + Vercel + live URL
```

## Skills

| Skill | Purpose |
|-------|---------|
| `/substrate:init` | Scaffold a new project in an empty directory. Runs product-focused Socratic Q&A, writes the kernel (domain + tests + docs + doctrines), generates the Gemini AI Studio Build prompt + optional runtime AI system prompt. |
| `/substrate:migrate` | Migrate a Gemini AI Studio prototype (dropped in `prototype/`) into the substrate kernel. Discovers the project's doctrines (manifest or glob), dispatches one `doctrine-architect` subagent per relevant doctrine in parallel; you approve a migration plan; files move into `src/` with doctrine alignment and a drafted Convex backend. |
| `/substrate:architect-spec <brief>` | Turn a brief into a multi-phase spec with verification gates. Runs Socratic Q&A, discovers the project's doctrines (manifest or glob), dispatches one `doctrine-architect` per relevant doctrine in parallel, composes an executable spec following the SDD protocol, then graphs it into a bead DAG via `graph-spec`. |
| `/substrate:graph-spec <spec>` | **Graph the Spec.** Decompose a written spec into a directed acyclic graph of `tbd` beads — one epic + child beads under the canonical label `epic:<slug>`, wired by `blocked-by:` edges inferred from which files/symbols each step consumes vs. creates, cycle-checked via Kahn. Renders the wave shape with `docs/scripts/bead-graph.sh` (waves / mermaid / dot) so parallel vs. sequential structure is visible. Called automatically by `architect-spec`; runnable standalone on any spec. Produces the DAG only — the parallel-execution doctrine's orchestrator runs it. |
| `/substrate:execute <spec>` | Execute a spec phase-by-phase in a fresh Claude session, with verify commands and user-approval gates between phases. |
| `/substrate:quick-spec` | Lightweight single-feature iteration: skeleton-of-thought planning grounded in the relevant doctrine → implement → verify → manual test → commit. Escalates to `/substrate:architect-spec` for anything big. |
| `/substrate:synthesize-session` | Terminal phase after `/substrate:execute`. Scans the session transcript + `git log` + doctrines for drift, applies up to 5 atomic doctrine-fix commits, queues larger amendments for human triage, drafts dependency-ordered beads with self-contained state-transfer prompts, and writes a synthesis report with a top-3-to-5 Pareto cut. Idempotent. |
| `/substrate:add-doctrine <name>` | Scaffold a new doctrine category for horizontal expansion (infra, claw, treasury, security, etc.). Runs a short Socratic Q&A for path / human-readable name / summary / layer-hint / triggers, writes a doctrine stub with `<fill in>` placeholders, and either appends an entry to the existing `doctrine-manifest.yaml` or offers to bootstrap one (registering every existing doctrine plus the new one). Does not commit — the user reviews the stub first. |
| `/substrate:deploy` | Walk Clerk setup (no Google Cloud required — Clerk's dev instance ships with shared OAuth), wire the repo to GitHub + Vercel, push production env vars, trigger the first live deploy. |

## Doctrine

The three doctrines in `references/doctrines/` are copied into every scaffolded project as `docs/doctrine/`:

- **domain-doctrine.md** — pure TypeScript, `Result<T,E>`, Brand types, immutable value objects, no framework imports, no `new Date()`.
- **backend-doctrine.md** — Convex schema + queries/mutations/actions, `requireAuth` via Clerk JWT, `v.*` validators, index per filter, secrets via `convex env set`.
- **frontend-doctrine.md** — Vite + TanStack Router + Tailwind v4 + Clerk, hook-layer Convex bridge, pure presentational components, validation in `domain/` not UI.

Violations are architectural bugs.

## SDD protocol

`references/sdd-protocol/` defines the grammar for briefs and executable specs. Copied into every project as `docs/protocol/sdd/`. Key docs:

- `brief-format.md` — what goes in a brief (user story, constraints, references, acceptance criteria)
- `_SPEC-STANDARD.md` — content invariants for specs (semantic / verification / recovery / context / boundary completeness)
- `execution-format.md` — grammar for `### Phase N` / `#### Step N.M` / `##### Verify` / `#### Gate`

## Repo layout

```
substrate/
├── .claude-plugin/plugin.json     # plugin manifest
├── agents/                         # 4 subagents
├── skills/                         # 6 user-invocable skills
├── references/
│   ├── doctrines/                  # → docs/doctrine/ in scaffolded projects
│   ├── sdd-protocol/               # → docs/protocol/sdd/
│   ├── templates/                  # → project root
│   └── example/                    # golden reference (Clawcraft) — not copied
├── scripts/                        # bash helpers invoked by skills
├── CLAUDE.md                       # guidance for Claude Code when working on this plugin
└── README.md                       # this file
```

## License

MIT
