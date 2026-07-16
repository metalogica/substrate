---
name: adopt
description: "Install substrate's stack-agnostic docs/doctrine/gate kernel onto an existing repo of ANY language or framework — without scaffolding an opinionated stack. Drops in AGENTS.md (canonical, with a CLAUDE.md symlink), docs/doctrine/ (the enforced manifest + zero-dep doctrine-lint + the agents & parallel-execution meta-doctrines), docs/protocol/sdd/, docs/tasks/, a substrate.yaml gate block wired to YOUR compile/test/lint commands, a pre-commit hook, and a CI workflow — then leaves doctrine-lint green. This is the symmetric opposite of /substrate:migrate (which brings a Gemini prototype INTO the Convex kernel): adopt makes an already-bootstrapped repo satisfy substrate's artifact contract so /substrate:architect-spec, /substrate:execute, /substrate:quick-spec, /substrate:diagnose, and /substrate:add-doctrine work against it. Invoke in the target repo's root."
---

# /substrate:adopt

Retrofit substrate's **docs-core kernel** onto an existing repo. The repo keeps its own stack,
build system, and toolchain; it *gains* the doctrine system, the SDD protocol, the beads/task
lifecycle, and a **declared** verification gate (`substrate.yaml`). Nothing opinionated about
language or framework is installed.

After this runs, the repo satisfies the substrate **artifact contract** parts (2) `substrate.yaml`
gate + (4) docs-core, so every stack-agnostic core skill works against it.

## Arguments

None required. The skill runs interactively (gate commands, project name). Any argument is treated
as a free-text project description.

## When to run

- You have an **existing** repository (any stack, already builds/runs its own way).
- You want substrate's docs/doctrine/gate machinery **without** the Convex/Vite/Clerk kernel.
- The repo is a git repository (`git rev-parse --is-inside-work-tree` succeeds).

## When to REFUSE

Detect state by filesystem. If any of these hold, STOP and redirect instead of clobbering:

| Signal | Redirect |
|--------|----------|
| Not a git repo (`git rev-parse` fails) | Run `git init` first — the pre-commit hook + task lifecycle assume git. |
| `docs/doctrine/doctrine-manifest.yaml` already exists | Repo is already substrate-governed. Use `/substrate:add-doctrine` to grow the doctrine set, or edit the manifest directly. |
| `substrate.yaml` already exists | Gate already declared. Inspect/edit it; don't re-adopt. |
| Empty directory (no code, no `.git` content) | This is a *new* project — use `/substrate:init` (opinionated kernel) instead, or scaffold your stack first, then adopt. |
| `AGENTS.md` **or** `CLAUDE.md` already exists as a regular file | Ask the user: fold existing content into the new canonical `AGENTS.md`, or abort? Do NOT silently overwrite. (See Step 4.) |

## Workflow

### Step 1 — Locate the docs-core bundle

The payload lives in the substrate plugin at `references/docs-core/`. Resolve `SUBSTRATE_ROOT`:

```bash
for candidate in \
  "$HOME/.claude/plugins/cache/metalogica/substrate/0.3.0" \
  "$HOME/.claude/plugins/substrate" \
  "${SUBSTRATE_ROOT:-}"; do
  if [ -n "$candidate" ] && [ -d "$candidate/references/docs-core" ]; then
    echo "FOUND: $candidate"; break
  fi
done
```

If none resolve, ask the user where the substrate plugin repo lives and use that as `SUBSTRATE_ROOT`.
Confirm `$SUBSTRATE_ROOT/references/docs-core/docs/scripts/doctrine-lint.sh` exists before continuing.

### Step 2 — Confirm the target is adopt-ready

Run the REFUSE checks above against the **current directory** (the target repo). Abort with the
matching redirect on any hit. Otherwise report: "Target `<pwd>` is adopt-ready."

### Step 3 — Gather the declared gate + project identity

Ask (end each with `[type 'default' to let me decide sensible defaults]`):

1. **Compile/typecheck command** — how does this repo build or typecheck? (e.g. `tsc --noEmit`,
   `cargo build`, `uv run mypy .`, `go build ./...`). Default: inspect the repo (package.json /
   Cargo.toml / pyproject.toml / go.mod) and propose one.
2. **Test command** — (e.g. `vitest run`, `cargo test`, `uv run pytest -q`, `go test ./...`).
3. **Lint command** — (e.g. `eslint .`, `cargo clippy`, `uv run ruff check .`, `golangci-lint run`).
4. **Project name** — for `AGENTS.md`'s H1. Default: the repo directory basename.
5. **One-line description** — for `AGENTS.md`. Default: `A substrate-governed repository.`
6. **Worktree seed** — "Would a fresh `git worktree` of this repo *fail the gate* because it
   lacks a **gitignored** input? (a virtualenv `.venv`, dep dirs `node_modules`, generated
   clients / codegen output, `.env*` files). If so, list those paths, the per-worktree install
   command (e.g. `uv sync`, `pnpm install --frozen-lockfile`), and any env the gate needs
   (e.g. a DB URL for a migration gate)." Default: **inspect `.gitignore` + the gate commands**
   and propose a `worktree-seed[]` + `toolchain-pin` set, then confirm. This is what
   `/substrate:orchestrate` copies into each worktree before dispatch — declaring it now saves
   hand-seeding on every future fleet run (see `agents-parallel-execution-doctrine.md §Supporting`).
7. **Cloud dispatch (optional)** — "Do you want `/substrate:dispatch <epic>` to run epics on a
   GitHub runner (headless `orchestrate --auto --pr` → live PR)? If so, what **services** and
   **bootstrap** steps does a fresh container need for your gate to pass, and which **secrets**?"
   Default: **inspect `.github/workflows/*.yml`** — if the repo already runs its gate in CI (a
   `services:` map + bootstrap steps), lift those into a `ci:` block verbatim and confirm; else ask.
   Also ask the **agent path** (`ci.agent`, default `claude-action`):
   - **`claude-action`** (RECOMMENDED, proven — dispatch Phase-1 findings): the official
     `anthropics/claude-code-action@v1` auto-installs the CLI + substrate plugin and authenticates
     via subscription OAuth. `secrets-needed` ← **`CLAUDE_CODE_OAUTH_TOKEN`**. Requires the
     `plugin_marketplaces` **`https://…/substrate.git`** URL + marketplace name (default
     `https://github.com/metalogica/substrate.git` / `metalogica`).
   - **`raw-cli`** (framework-agnostic; substrate plugin-install is UNPROVEN headless): a bare
     `claude -p` or any non-Claude runner via `{{AGENT_COMMAND}}`. `secrets-needed` ←
     **`ANTHROPIC_API_KEY`** (or the runner's own key name).
   If the user declines cloud dispatch, leave the commented `ci:` stub in place (dispatch simply
   refuses until it's filled) — don't fabricate a `ci:` block.

If the user picks `default` on the gate commands, inspect the repo's manifest files, propose
concrete commands, and **confirm them** before writing — a wrong gate makes `/substrate:execute`
abort or run the wrong thing.

### Step 4 — Handle any existing root-context file

If `AGENTS.md` or `CLAUDE.md` exists as a regular file:
- Offer to **fold** its content into the new `AGENTS.md` (append under a `## (existing context)`
  heading) before installing the symlink, or **abort**.
- Never overwrite it blind. The canonical end state is: real `AGENTS.md`, `CLAUDE.md` → symlink.

### Step 5 — Install the bundle

Copy the payload in (preserves the `CLAUDE.md → AGENTS.md` symlink; merges into existing `docs/`,
`.github/`, `.hooks/` rather than replacing them):

```bash
cp -R "$SUBSTRATE_ROOT/references/docs-core/." ./
```

Then substitute tokens with the Step-3 answers (use Edit, or `sed`), in `AGENTS.md` and `substrate.yaml`:
- `{{PROJECT_NAME}}`, `{{PROJECT_DESCRIPTION}}` → `AGENTS.md`
- `{{GATE_COMPILE}}`, `{{GATE_TEST}}`, `{{GATE_LINT}}` → `substrate.yaml`

If the Step-3 **worktree seed** answer named any inputs, write a **populated, uncommented**
`worktree-seed:` list + `toolchain-pin.{install,env}` block into `substrate.yaml` (replace the
commented guidance stub the template ships). If the answer was "none needed", leave the commented
guidance in place — but do **not** silently skip the question: an empty seed on a repo whose gate
needs gitignored inputs is exactly the failure `/substrate:orchestrate` later hits.

The template also ships an uncommented `execution:` block (a sibling of `gate` /
`worktree-seed` / `toolchain-pin`) with the partition defaults `context-budget: 0.4` and
`default-rung: auto`. Leave the defaults in place unless the user asks to tune them —
`/substrate:graph-spec` reads `context-budget` to cut the bead DAG into agent-sized
`group:<window-N>` windows, and `/substrate:orchestrate` reads `default-rung`. The block is a
deviatable prior, documented in `agents-parallel-execution-doctrine.md §Grouping & windows`
(which also carries the `.substrate/execution-state.json` run-state schema).

If the Step-3 **cloud-dispatch** answer opted in, write a **populated, uncommented** `ci:` block
into `substrate.yaml` (replace the commented stub) from the detected/asked `services` + `bootstrap` +
`secrets-needed`, and **token-substitute the copied `.github/workflows/substrate-orchestrate.yml`**:
- `{{CI_RUNNER}}` → `ci.runner` (default `ubuntu-latest`)
- `{{CI_SERVICES}}` → the `ci.services` YAML block (or delete the `services:` line if none)
- `{{CI_ENV}}` → the gate env map (or `{}`)
- `{{CI_BOOTSTRAP}}` → the `ci.bootstrap` steps joined as shell lines (or `true`)
- `{{TOOLCHAIN_INSTALL}}` → `substrate.yaml` `toolchain-pin.install` (or `pnpm install --frozen-lockfile`).
  **Prefix workspace-bin tools with the package manager** (`pnpm turbo`, not bare `turbo`) — the bin
  isn't on the runner `PATH` (exit-127 Phase-1 finding). Warn if the lifted CI recipe uses a bare bin.
- `{{AGENT_STEP}}` → the whole agent step(s), composed from the Step-7 `ci.agent` answer:
  - **`claude-action`**: the `uses: anthropics/claude-code-action@v1` block (Variant A in the
    template header), substituting `{{PLUGIN_MARKETPLACE_URL}}` (the `https://…/substrate.git` URL)
    and `{{MARKETPLACE_NAME}}` (e.g. `metalogica`). Keep `id-token: write` in `permissions:`.
  - **`raw-cli`**: the `npm i -g @anthropic-ai/claude-code` install step + a `run: {{AGENT_COMMAND}}`
    step (Variant B), where `{{AGENT_COMMAND}}` defaults to
    `claude -p "/substrate:orchestrate ${{ github.event.inputs.epic }} --auto --pr" --permission-mode bypassPermissions`
    unless the user named another runner. `id-token: write` is then unused but harmless.
- The **bead-hydration** step (`npm i -g get-tbd` + `tbd sync --pull`) and `id-token: write` are
  **static** in the template — no substitution; do not remove them (both agent paths need the
  hydration; only `claude-action` needs `id-token`).

Because GitHub `services:`/`runs-on:` are static job keys, this substitution happens **now, at adopt
time** — the workflow is not generic-at-runtime (see the `ci:` NOTE in `substrate.yaml`). If the user
**declined** cloud dispatch, delete the copied `substrate-orchestrate.yml` (leave no token-valued
workflow behind) — the repo can re-adopt or run `/substrate:dispatch` later to install it.

Do **not** substitute anything inside `docs/doctrine/` or `docs/protocol/sdd/` — those ship verbatim.

Guard the symlink: if `cp -R` left `CLAUDE.md` as a regular copy (some `cp` variants), fix it:
```bash
[ -L CLAUDE.md ] || { rm -f CLAUDE.md && ln -s AGENTS.md CLAUDE.md; }
```

**Append** the orchestration run-state ignore to the target's existing `.gitignore` (append,
never overwrite — the repo owns its own file):
```bash
grep -qxF ".substrate/runs/" .gitignore 2>/dev/null || printf '\n# Orchestration run-state (TTL-swept); execution-state.json stays tracked\n.substrate/runs/\n' >> .gitignore
```

### Step 6 — Wire the pre-commit hook

```bash
chmod +x docs/scripts/doctrine-lint.sh docs/scripts/bead-graph.sh docs/scripts/bead-tui.sh .hooks/pre-commit
git config core.hooksPath .hooks
```

### Step 7 — Verify green (the gate for this skill)

```bash
bash docs/scripts/doctrine-lint.sh          # must print: doctrine-lint: ok — 2 doctrines registered …
test -L CLAUDE.md && [ "$(readlink CLAUDE.md)" = AGENTS.md ] && echo "symlink ok"
grep -qF agents-doctrine.md AGENTS.md && grep -qF agents-parallel-execution-doctrine.md AGENTS.md && echo "pointers ok"
```

All three must pass. If `doctrine-lint` is red, surface its output and fix (usually a pointer the
user's folded content displaced) before handoff — do not leave the repo red.

### Step 8 — Print handoff

```
✔ Substrate docs-core adopted.

Installed (stack untouched):
  AGENTS.md (+ CLAUDE.md symlink) · substrate.yaml gate · docs/doctrine/ (manifest + lint +
  agents & parallel-exec doctrines) · docs/protocol/sdd/ · docs/tasks/ongoing/ ·
  .hooks/pre-commit · .github/workflows/doctrine-lint.yml
  [if cloud dispatch opted in] · .github/workflows/substrate-orchestrate.yml · substrate.yaml ci: block

Gate 1 (mechanical): green.

Next:
  1. Review AGENTS.md + substrate.yaml — confirm the gate commands are exactly right.
  2. Add stack/domain doctrines:   /substrate:add-doctrine <name>
  3. Write a brief, then:          /substrate:architect-spec docs/tasks/ongoing/<feature>/<feature>-brief.md
     or a quick change:            /substrate:quick-spec "<objective>"
  4. Commit — the pre-commit hook re-runs doctrine-lint.

  [if cloud dispatch opted in]
  ⚠ Add the repo secret(s) named in substrate.yaml ci.secrets-needed before the first dispatch
    (adopt never writes secret values):
       # claude-action path:  gh secret set CLAUDE_CODE_OAUTH_TOKEN   (run `claude setup-token` first)
       # raw-cli path:        gh secret set ANTHROPIC_API_KEY
  Then run an epic in the cloud:   /substrate:dispatch <epic>

  (Optional) Set up tbd/beads:     npx get-tbd  → tbd setup --auto --prefix=<name>
```

## Constraints

- MUST NOT install any language/framework/toolchain — adopt is stack-blind. Only the docs-core +
  `substrate.yaml` gate go in.
- MUST NOT overwrite an existing `docs/doctrine/`, `substrate.yaml`, `AGENTS.md`, or `CLAUDE.md`
  without the user's explicit choice (Step 4 / REFUSE table).
- MUST fill `substrate.yaml`'s three gate commands from the user — never leave the `{{GATE_*}}`
  tokens in place (a token-valued gate makes `/substrate:execute` run a literal placeholder).
- MUST ask the Step-3 **worktree-seed** question rather than silently shipping the empty commented
  stub — declare a populated `worktree-seed[]`/`toolchain-pin` block when the repo's gate needs
  gitignored inputs, so `/substrate:orchestrate` auto-seeds instead of the orchestrator hand-seeding.
- MUST leave `doctrine-lint.sh` **green** before printing the handoff. A red adopt is a failed adopt.
- MUST, for cloud dispatch, either fully token-substitute `substrate-orchestrate.yml` + write a
  populated `ci:` block, **or** delete the copied workflow — never leave a `{{TOKEN}}`-valued workflow
  behind (a token-valued `runs-on:`/`services:` is an invalid, silently-failing workflow). `ci:` is
  optional; a token-valued workflow is not.
- MUST print `secrets-needed` **by name only** as a manual `gh secret set` instruction — adopt never
  writes or prompts for secret values.
- MUST keep `AGENTS.md` canonical with `CLAUDE.md` a symlink to it (macOS/Linux; Windows users work
  under WSL's Linux path).
- MUST copy the bundle via `cp -R` from `references/docs-core/`, not by promoting from any external
  source — the payload is self-contained in the plugin.
- SHOULD inspect the repo's manifest files (package.json / Cargo.toml / pyproject.toml / go.mod /
  Makefile) to propose sensible gate defaults when the user picks `default`.
- SHOULD NOT commit — leave the staged kernel for the user to review, unless they ask you to commit.
