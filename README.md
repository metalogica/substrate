# Substrate

**A Claude Code plugin that scaffolds full-stack Vite + Convex + Clerk apps from concept to production in 15 minutes.**

Substrate is a pipeline, not a framework. Six skills walk you from an empty folder to a live deployed app, with architectural doctrines that keep the kernel minimal, the tests honest, and the code reviewable.

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

Clone or symlink the repo into your Claude Code plugins directory:

```bash
git clone https://github.com/<you>/substrate ~/.claude/plugins/substrate
```

Or for development:

```bash
ln -s /path/to/local/substrate ~/.claude/plugins/substrate
```

Skills and agents are auto-discovered.

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
/substrate:quick-spec  OR  /substrate:architect-spec + /substrate:execute   ← iterate features
    │
    ▼
/substrate:deploy          ← stage 3: Clerk + Vercel + live URL
```

## Skills

| Skill | Purpose |
|-------|---------|
| `/substrate:init` | Scaffold a new project in an empty directory. Runs product-focused Socratic Q&A, writes the kernel (domain + tests + docs + doctrines), generates the Gemini AI Studio Build prompt + optional runtime AI system prompt. |
| `/substrate:migrate` | Migrate a Gemini AI Studio prototype (dropped in `prototype/`) into the substrate kernel. Three architect subagents (domain / backend / frontend) analyze it in parallel; you approve a migration plan; files move into `src/` with doctrine alignment and a drafted Convex backend. |
| `/substrate:architect-spec <brief>` | Turn a brief into a multi-phase spec with verification gates. Runs Socratic Q&A, dispatches all three architects in parallel, composes an executable spec following the SDD protocol. |
| `/substrate:execute <spec>` | Execute a spec phase-by-phase in a fresh Claude session, with verify commands and user-approval gates between phases. |
| `/substrate:quick-spec` | Lightweight single-feature iteration: skeleton-of-thought planning grounded in the relevant doctrine → implement → verify → manual test → commit. Escalates to `/substrate:architect-spec` for anything big. |
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
