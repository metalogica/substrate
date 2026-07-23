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

### The `substrate` CLI (`substrate tasks`, `substrate ui`)

Alongside the `/substrate:*` skills, substrate ships a small shell CLI: `substrate tasks` — a live terminal view of your project's bead DAG (waves, blockers, status, updating as a fleet works) — and `substrate ui` — a one-window tmux workspace (board / specs / interactive-agent windows on substrate's **own** tmux server socket, so your personal tmux config is untouched; `M-1..M-3` jump between windows, `M-n` opens a new agent window, `prefix d` detaches and the session persists). It's a self-locating binary you link onto your PATH once.

The marketplace-installed plugin lives in a **version-keyed cache directory that changes on every update**, so link the CLI from a stable git clone instead:

```bash
git clone https://github.com/metalogica/substrate.git ~/substrate
~/substrate/scripts/substrate-link.sh      # symlinks the binary → ~/.local/bin/substrate
```

Then, from inside any substrate/adopted project:

```bash
substrate tasks                            # live bead TUI; reads tbd from your current dir
substrate tasks --tbd <epic-slug>          # pin one epic   ·   --once renders once and exits
substrate ui                               # one-window tmux workspace: board · specs · agent
```

Notes:
- The binary resolves its own path — no `SUBSTRATE_ROOT` to set, and one link serves every project (it reads tbd from wherever you run it).
- If `~/.local/bin` isn't on your PATH, the linker prints the line to add — it never edits your shell rc.
- A shell function or alias named `substrate` shadows the binary; remove it if you have one.
- Change the target dir with `scripts/substrate-link.sh <dir>` or `SUBSTRATE_BIN_DIR=<dir>`. Remove with `scripts/substrate-unlink.sh`.

### The serve daemon (`substrate serve`)

`substrate serve` is a **local-first pull daemon**: it polls your project's tbd board, claims groomed
beads, builds each one as a headless `claude` session in its own sibling git worktree, opens a PR, and
tidies up after merges — turning a groomed backlog into a stream of review-ready PRs without you
babysitting the loop. It is single-operator, runs on your own machine, and shares the same tbd store
as `substrate tasks`. The verbs:

| verb | what it does |
|---|---|
| `substrate serve` | Boot the daemon in the current repo. Runs preflight (`git`, `tbd` board initialized, `gh` authenticated, `claude`), then **boot-reap** (reconcile any stale worktrees/claims from a prior crash), then ticks on the poll interval — **PR-sweep first** each cycle (comments to actualize, merges to tidy), then claim → route → dispatch the next groomed bead if there's capacity. `Ctrl-C` flushes state and exits cleanly; un-dispatched claims are left for the next boot-reap to reconcile. |
| `substrate status` | Aerial pipeline view of the board — the stations work flows through (`board → claimed → building → in-review → merged`), a bounced row, and tick health (a staleness **warning** when the last tick is older than 2× the poll interval). Reads `.substrate/serve/state.json`; degrades to state-only facts when tbd/gh aren't consulted. |
| `substrate tidy` | Manual reap. Reconciles the world from **observed truth only** (`{tbd, git, gh}` — never from a possibly-torn `state.json`): merged/closed PR → reap the worktree + branch + prune; a stranded worktree (no live session, no open PR) → reap and release the bead's claim back to the board; an orphan `assignee=serve` claim with no worktree and no PR → release it. Then rewrites `state.json` from what it observed. |
| `substrate triage <bead-id>` | Claim + route + dispatch **one named bead now**, skipping the poll wait, capacity check, and FIFO. Routes by the bead's `kind:` label (`kind:bug` → diagnose lane, `kind:feature`/`kind:task` → quick lane; `needs-spec`/missing kind → bounce back to the board), cuts a worktree, runs the headless session, and opens a PR — flipping the bead to `in-review`. PR creation is idempotent (`gh pr view` before `gh pr create`), so killing and re-running mid-flow never duplicates a branch or PR. |

#### Configuration — `.substrate/serve.yaml`

The daemon reads an **optional** `.substrate/serve.yaml` in the repo root; every field is defaulted, so
an absent file runs with the defaults below. User values are merged over the defaults:

```yaml
# .substrate/serve.yaml — all fields optional; these are the defaults.
pollIntervalSec: 60          # seconds between poll cycles
concurrency: 1               # max in-flight beads (HARD-CAPPED at 2 in v1, regardless of this value)
lanes:
  quick:                     # kind:feature / kind:task route here
    skill: quick-spec        # runs /substrate:quick-spec
    model: null              # null → inherit the session default model
  bug:                       # kind:bug routes here
    skill: diagnose          # runs /substrate:diagnose
    model: null
branchPrefix: "serve/"       # prefix for daemon-cut worktree branches
worktreeRoot: null           # null → default sibling root ../<repo>-serve/<bead-id>/
```

#### Standing risk — headless permission bypass

Each lane session is spawned as:

```
claude -p "<lane prompt>" --output-format json --dangerously-skip-permissions [--model <lane.model>]
```

`--dangerously-skip-permissions` is a **permission bypass**: the headless session runs without the
interactive permission prompts, so it can read/write/run anything its prompt drives inside its worktree.
This is an **accepted v1 risk**: it is scoped by the worktree `cwd` and the lane prompt, and serve is a
**single-operator, own-machine** tool. Do not run `substrate serve` on a repo or a machine where an
unattended, permission-bypassed `claude` session is not acceptable. The v1 disposition is to revisit
this with sandboxing at the VPS phase; until then, the bypass is the daemon's standing operational risk.

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

**The `substrate` CLI.** Link it as in [The `substrate` CLI](#the-substrate-cli-substrate-tasks) above — but as a dev, link from your **working clone** (`./scripts/substrate-link.sh`) rather than a separate one, so the binary tracks your branch switches.

**New machine, from scratch.** The full sequence spans the shell *and* Claude Code (the plugin install isn't the shell's to run):

1. `git clone <substrate> && cd substrate`
2. In Claude Code: `/plugin marketplace add "$PWD"` → `/plugin install substrate@metalogica` → `/reload-plugins`
3. `./scripts/dev-link.sh` — hot-reload the plugin from source
4. `./scripts/prerequisites.sh` — check node/pnpm/tbd
5. `./scripts/substrate-link.sh` — put `substrate` on your PATH

## Using substrate in OpenCode

substrate also runs inside [OpenCode](https://opencode.ai) (`1.17.14`). The plugin's 14 skills are
ported to OpenCode **commands** and the `doctrine-architect` + `bead-implementer` subagents to OpenCode **agents**,
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
`opencode agent list` shows `doctrine-architect` and `bead-implementer`. The link is idempotent and non-destructive (it
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
/substrate:quick-spec  OR  /substrate:architect-spec (→ graph-spec bead DAG) + /substrate:orchestrate   ← iterate features
    │                                                        (orchestrate = primary door: parallel worktree
    │                                                         fleet; /substrate:execute = attended single-window)
    ▼
/substrate:synthesize-session   ← terminal phase: capture session learning into doctrine fixes + beads
    │                          (/substrate:spool ← close a big-context session, reopen its position fresh)
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
| `/substrate:orchestrate <epic-or-spec>` | **The primary execution door.** Run a graphed bead DAG as a **parallel git-worktree fleet**, operationalizing `agents-parallel-execution-doctrine.md`. Reads the context-budget partition (`group:<window-N>` labels), cuts a `feat/<epic-slug>` integration branch, walks the DAG wave-by-wave, dispatches one **group-runner** per file-disjoint ready **window** in its own worktree (off the current tip, one seed+install per window), gates each bead in sequence, merges on green, re-gates the integrated tip, pauses between waves (`--auto` to skip), writes `.substrate/execution-state.json`, and lands one signed squash commit on trunk. Single-writer tracker; consumes the DAG (never re-derives it). Tool-agnostic (Agent tool ↔ Task tool) with a Claude-Code-only Workflow fast-path. |
| `/substrate:execute <spec>` | **The attended single-window mode** (K=1, human-in-the-loop) — the alternative to the orchestrated default. Run a spec phase-by-phase in a fresh Claude session with one implementing agent, verify commands, and user-approval gates between phases. A Step-0 check offers to switch to `/substrate:orchestrate` when the DAG would clearly win as a parallel fleet (≥3 file-disjoint windows + tracker + user confirm); otherwise it stays attended. Choose it when you want to watch/adapt one window or the spec fits one window. |
| `/substrate:dispatch <epic>` | **The cloud execution door.** Run a graphed epic on a GitHub runner instead of your own machine: publishes the epic's beads to the `tbd-sync` branch, fires the `substrate-orchestrate.yml` workflow (headless `orchestrate --auto --pr`), and reports the run + PR URLs — the PR accumulates the per-bead commits **live, wave by wave**, for you to review and squash-merge. The thin *local trigger* only (single-writer stays with the in-runner orchestrator). Requires the repo to be cloud-dispatch-enabled via `/substrate:adopt` (a `ci:` block + the workflow) and the epic graphed. v1 trigger is manual (`workflow_dispatch`); an event-driven `tbd-sync` watcher is the documented v2 upgrade. |
| `/substrate:quick-spec` | Lightweight single-feature iteration: skeleton-of-thought planning grounded in the relevant doctrine → implement → verify → manual test → commit. Escalates to `/substrate:architect-spec` for anything big. |
| `/substrate:synthesize-session` | Terminal phase after the executor (`/substrate:orchestrate` or the attended `/substrate:execute`) lands a feature. Scans the session transcript + `git log` + doctrines for drift, applies up to 5 atomic doctrine-fix commits, queues larger amendments for human triage, drafts dependency-ordered beads with self-contained state-transfer prompts, and writes a synthesis report with a top-3-to-5 Pareto cut. Idempotent. |
| `/substrate:spool` | Close a big-context session and reopen its **position** in a fresh one through a lightweight, verified pointer — cheaper and safer than `/compact` or `/clear`. Re-derives the durable anchors *from the repo* (git head/branch/working-tree, completed vs. ongoing specs, open beads, gate commands, project head), diffs them against what the chat believed, and at a single batched HIL checkpoint surfaces every unverifiable claim + every repo/chat conflict to adjudicate — never asserting past a conflict. Writes a pointers-first launcher to an out-of-repo, ID-keyed, TTL-swept store (`~/.substrate/spool/`), so producing a spool commits nothing. `--resume <id>` re-verifies the volatile anchors (which may have advanced), reports drift, confirms, then deletes (`--keep` to retain); `--list` shows the store. Sits one tier *above* `synthesize-session` — synthesize captures per-spec learning, spool carries campaign position across specs. |
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
