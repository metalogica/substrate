---
description: "Install substrate's stack-agnostic docs/doctrine/gate kernel onto an existing repo of ANY language or framework — without scaffolding an opinionated stack. Drops in AGENTS.md (canonical, with a CLAUDE.md symlink), docs/doctrine/ (the enforced manifest + zero-dep doctrine-lint + the agents & parallel-execution meta-doctrines), docs/protocol/sdd/, docs/tasks/, a substrate.yaml gate block wired to YOUR compile/test/lint commands, a pre-commit hook, a CI workflow, an initialized tbd bead tracker, and generated ambient doctrine skills (.claude/skills/doctrine-*/, one pointer stub per manifest entry so every Claude Code session self-loads relevant doctrine) — then leaves doctrine-lint green. This is the symmetric opposite of /substrate/migrate (which brings a Gemini prototype INTO the Convex kernel): adopt makes an already-bootstrapped repo satisfy substrate's artifact contract so /substrate/architect-spec, /substrate/execute, /substrate/quick-spec, /substrate/diagnose, and /substrate/add-doctrine work against it. Invoke in the target repo's root."
---

# /substrate/adopt

Retrofit substrate's **docs-core kernel** onto an existing repo. The repo keeps its own stack,
build system, and toolchain; it *gains* the doctrine system, the SDD protocol, the beads/task
lifecycle, and a **declared** verification gate (`substrate.yaml`). Nothing opinionated about
language or framework is installed.

After this runs, the repo satisfies the substrate **artifact contract** parts (2) `substrate.yaml`
gate + (4) docs-core, so every stack-agnostic core command works against it.

## Arguments

None required. The command runs interactively (gate commands, project name). Any argument
(`$ARGUMENTS`) is treated as a free-text project description.

## When to run

- You have an **existing** repository (any stack, already builds/runs its own way).
- You want substrate's docs/doctrine/gate machinery **without** the Convex/Vite/Clerk kernel.
- The repo is a git repository (`git rev-parse --is-inside-work-tree` succeeds).

## When to REFUSE

Detect state by filesystem. If any of these hold, STOP and redirect instead of clobbering:

| Signal | Redirect |
|--------|----------|
| Not a git repo (`git rev-parse` fails) | Run `git init` first — the pre-commit hook + task lifecycle assume git. |
| `docs/doctrine/doctrine-manifest.yaml` already exists | Repo is already substrate-governed. Use `/substrate/add-doctrine` to grow the doctrine set, or edit the manifest directly. |
| `substrate.yaml` already exists | Gate already declared. Inspect/edit it; don't re-adopt. |
| Empty directory (no code, no `.git` content) | This is a *new* project — use `/substrate/init` (opinionated kernel) instead, or scaffold your stack first, then adopt. |
| `AGENTS.md` **or** `CLAUDE.md` already exists as a regular file | Ask the user: fold existing content into the new canonical `AGENTS.md`, or abort? Do NOT silently overwrite. (See Step 4.) |

## Workflow

### Step 1 — Locate the docs-core bundle

The payload lives in the substrate source tree at `references/docs-core/`. Resolve `SUBSTRATE_ROOT`.
OpenCode has **no plugin cache** to path-search, so `SUBSTRATE_ROOT` must be set explicitly — via
your shell env, or in `~/.config/opencode/opencode.jsonc` under `env`. Fail fast if it is unset or
does not point at a substrate clone:

```bash
: "${SUBSTRATE_ROOT:?Set SUBSTRATE_ROOT to your substrate clone; OpenCode has no plugin cache to discover it.}"
test -f "$SUBSTRATE_ROOT/references/docs-core/docs/scripts/doctrine-lint.sh" || { echo "SUBSTRATE_ROOT=$SUBSTRATE_ROOT has no references/docs-core — point it at a substrate clone."; exit 1; }
```

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
6. **Beads prefix (tbd)** — a 2–8 char **alphabetic** id prefix for this repo's beads (e.g. `sub`,
   `poi`, `claw`). tbd requires it and it must not be guessed silently: propose one derived from the
   project name (letters only, lowercased, ≤8 chars) and **confirm** it. Used only on first-time tbd
   setup (Step 7) — skipped when `.tbd/` already exists.
7. **Worktree seed** — "Would a fresh `git worktree` of this repo *fail the gate* because it
   lacks a **gitignored** input? (a virtualenv `.venv`, dep dirs `node_modules`, generated
   clients / codegen output, `.env*` files). If so, list those paths, the per-worktree install
   command (e.g. `uv sync`, `pnpm install --frozen-lockfile`), and any env the gate needs
   (e.g. a DB URL for a migration gate)." Default: **inspect `.gitignore` + the gate commands**
   and propose a `worktree-seed[]` + `toolchain-pin` set, then confirm. This is what
   `/substrate/orchestrate` copies into each worktree before dispatch — declaring it now saves
   hand-seeding on every future fleet run (see `agents-parallel-execution-doctrine.md §Supporting`).

If the user picks `default` on the gate commands, inspect the repo's manifest files, propose
concrete commands, and **confirm them** before writing — a wrong gate makes `/substrate/execute`
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

Then substitute tokens with the Step-3 answers (use edit, or `sed`), in `AGENTS.md` and `substrate.yaml`:
- `{{PROJECT_NAME}}`, `{{PROJECT_DESCRIPTION}}` → `AGENTS.md`
- `{{GATE_COMPILE}}`, `{{GATE_TEST}}`, `{{GATE_LINT}}` → `substrate.yaml`

If the Step-3 **worktree seed** answer named any inputs, write a **populated, uncommented**
`worktree-seed:` list + `toolchain-pin.{install,env}` block into `substrate.yaml` (replace the
commented guidance stub the template ships). If the answer was "none needed", leave the commented
guidance in place — but do **not** silently skip the question: an empty seed on a repo whose gate
needs gitignored inputs is exactly the failure `/substrate/orchestrate` later hits.

The template also ships an uncommented `execution:` block (a sibling of `gate` / `worktree-seed` /
`toolchain-pin`) with the partition defaults `context-budget: 0.4` and `default-rung: auto`. Leave
the defaults unless the user asks to tune them — `/substrate/graph-spec` reads `context-budget` to
cut the DAG into `group:<window-N>` windows, and `/substrate/orchestrate` reads `default-rung`. The
block is documented in `agents-parallel-execution-doctrine.md §Grouping & windows` (which also
carries the `.substrate/execution-state.json` run-state schema).

Do **not** substitute anything inside `docs/doctrine/` or `docs/protocol/sdd/` — those ship verbatim.

Guard the symlink: if `cp -R` left `CLAUDE.md` as a regular copy (some `cp` variants), fix it:
```bash
[ -L CLAUDE.md ] || { rm -f CLAUDE.md && ln -s AGENTS.md CLAUDE.md; }
```

**Append** the orchestration run-state ignore to the target's existing `.gitignore` (append, never
overwrite — the repo owns its own file):
```bash
grep -qxF ".substrate/runs/" .gitignore 2>/dev/null || printf '\n# Orchestration run-state (TTL-swept); execution-state.json stays tracked\n.substrate/runs/\n' >> .gitignore
```

**Stamp the kernel version** into the target's `substrate.yaml`, so "which substrate adopted
this repo?" is answerable later (`substrate --version` reads it as its `kernel:` line and
warns on drift against the acting clone). Grammar is load-bearing — the reader greps
`^# substrate-kernel:` and compares field 3 as the sha, so dirtiness is recorded in the
parens, never appended to the sha:

```bash
kv=$(sed -n 's/.*"version"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$SUBSTRATE_ROOT/.claude-plugin/plugin.json" | head -1)
ksha=$(git -C "$SUBSTRATE_ROOT" rev-parse --short HEAD 2>/dev/null || echo unknown)
kdirty=""; [ -n "$(git -C "$SUBSTRATE_ROOT" status --porcelain 2>/dev/null)" ] && kdirty=", dirty"
stamp="# substrate-kernel: ${kv:-unknown} @ $ksha ($(date +%F)$kdirty)"
if grep -q '^# substrate-kernel:' substrate.yaml; then
  awk -v s="$stamp" '/^# substrate-kernel:/ { print s; next } { print }' substrate.yaml > substrate.yaml.tmp \
    && mv substrate.yaml.tmp substrate.yaml
else
  printf '\n%s\n' "$stamp" >> substrate.yaml
fi
```

Idempotent by construction: a re-adopt replaces the existing line, never accumulates a second.
A `, dirty` stamp means the kernel came from an uncommitted clone state — worth flagging to the
user in the handoff, since that install isn't reproducible from any commit.

### Step 6 — Wire the pre-commit hook + generate the ambient doctrine skills

```bash
chmod +x docs/scripts/doctrine-lint.sh docs/scripts/doctrine-skills-sync.sh docs/scripts/bead-graph.sh .hooks/pre-commit
git config core.hooksPath .hooks
bash docs/scripts/doctrine-skills-sync.sh
```

The sync renders each manifest entry into a thin pointer skill at
`.claude/skills/doctrine-<id>/SKILL.md`, making doctrine **ambient** for Claude Code sessions in
this repo (a Claude Code surface — OpenCode sessions get their passive doctrine context via
`AGENTS.md` instead). The stubs are derived artifacts (marker-tagged, regenerated by the sync,
parity-checked by doctrine-lint rule 4) — never hand-edit them. If the sync reports a
**collision** (a hand-written skill already occupies a `doctrine-<id>` path), stop and ask the
user to move or delete it — do not work around it.

### Step 7 — Initialize the beads tracker (tbd) — always

Substrate's execution surface — `/substrate/graph-spec`, `/substrate/orchestrate` — is
**single-writer over a `tbd` bead tracker**; it is core machinery, not an
add-on (tbd previously appeared only as an optional handoff note — it is now an install step). adopt
therefore **always** initializes tbd in the repo.

**Resolve the binary** — prefer a global `tbd`, else run through `npx`:

```bash
if command -v tbd >/dev/null 2>&1; then TBD="tbd"; else TBD="npx --yes get-tbd@latest"; fi
```

If neither resolves (offline, no npm/network), **abort with an explanation** rather than hand-rolling
a `.tbd/` — tbd owns its store format (fail-fast; don't fabricate the tracker).

**Idempotent by filesystem state** — never clobber an existing tracker:

- **`.tbd/config.yml` already exists** → refresh only, never re-prefix: `$TBD setup --auto`.
- **No `.tbd/`** → first-time setup with the confirmed Step-3 prefix:
  `$TBD setup --auto --prefix=<prefix>`.

tbd manages its own `.tbd/.gitignore` and its `tbd-sync` data branch — do not edit `.tbd/**` by
hand. Confirm `.tbd/config.yml` exists (and, first-time, carries `id_prefix: <prefix>`) before continuing.

### Step 7.5 — Harvest, then delete, any pre-existing doctrine changelogs

Numbered 7.5 so Steps 6–9 keep their numbers. It runs after the bundle is in (so `docs/doctrine/`
and the lint script exist) and **before** the Step-8 green gate.

**Why this step exists.** `doctrine-lint` fails any registered doctrine that carries a
`## Change Log` table or a `**Version**` header — history belongs in git, not in a living document.
A repo whose own doctrines carry them would therefore be adopted straight into a **red** gate,
breaking adopt's "leaves doctrine-lint green" promise. But a bare delete would lose real content:
git keeps the *diff*, and nobody greps a diff for a rule's rationale. **Harvest is re-indexing, not
deletion** — the rationale moves to where an agent actually looks for it, next to the rule it explains.

**Detect.** Scan the target's own doctrines, excluding the two meta-doctrines just copied in (they
ship clean):

```bash
grep -rlE '^\*\*Version\*\*|^#{1,3} .*Change Log' docs/doctrine --include='*.md' \
  | grep -v -e 'agents-doctrine\.md' -e 'agents-parallel-execution-doctrine\.md' || true
```

No hits → report "no pre-existing doctrine history to harvest" and go straight to Step 8. Skip the
rest of this step entirely; it is a no-op on a repo with no prior doctrines.

**Triage each row** of each detected Change Log table. Read the table in full first, then classify
every row against the section it cites:

- **(a) Carries rationale, and that why-narrative is absent at the section it cites → fold it
  inline.** Write it at that section as a short why-note in the doctrine's own voice and present
  tense — the standing reason the rule is what it is, *not* a dated event. "Stale writes return 409;
  a missing prerequisite returns 422 — the caller retries the first and fixes the second," never
  "1.4.0 changed the error code." The archetype is clawcraft's `treasury-doctrine` §9 row `1.4.0`,
  whose stale-vs-gap 409/422 distinction appears nowhere in the rule text: a bare delete erases the
  only copy. Rows like that get **folded, not dropped**.
- **(b) Carries rationale the cited section already states → drop the row.** One fact, one home;
  duplication IS drift (`agents-doctrine.md` §2). Do not fold a second copy of something the
  doctrine already says.
- **(c) Carries no rationale worth keeping → drop the row.** Version bumps, typo and formatting
  fixes, "clarified wording", and rows whose entire content is rule text already present in the doc.
  These are exactly the dead apparatus this step exists to shed.
- **Cites no section, or cites one that no longer exists** → treat as (a) but **ask the user where it
  belongs**. Never guess a home for a rule's rationale.

**Delete the apparatus.** Once every row is dispositioned: remove the `## Change Log` heading and its
table, and the `**Version**` / `**Date**` header lines. Keep `**Status**`; add
`**Last verified**: <today YYYY-MM-DD>` if the file has none, so the doctrine still attests freshness
without carrying history.

**Confirm before deleting — required.** Present, per file: which rows fold and *where* they land,
which rows drop and *why*, the resulting header block, and the note that the full table is preserved
verbatim in the removal commit body. Then ask explicitly to proceed.

**On decline, abort with an explanation.** Revert the in-progress edits, leave the doctrines
byte-identical to how they were found, and tell the user that adopt stopped **before** Step 8 and
that the repo will fail doctrine-lint's changelog rule until its doctrine history is harvested (by
hand, or by re-running adopt). Do **not** fall back to a partial harvest, do **not** skip the file and
continue to Step 8, and do **not** retry with a different plan — a declined delete is a stop, not a
negotiation.

**Commit the removal with the table in its body** — this is where the deleted history survives:

```bash
git add <only the doctrine files this step rewrote>
git commit -F - <<'EOF'
docs(doctrine): harvest changelogs into the doctrines; git keeps the history

<each harvested table, verbatim, one block per file, under a `--- <path> ---` line>
EOF
```

This is the one place adopt commits on its own initiative (the Constraints' *SHOULD NOT commit*
yields here): the commit body **is** the archive, so deleting without it would be an unrecoverable
loss. Scope the commit to the doctrine files only — the rest of the kernel stays uncommitted for the
user's review.

### Step 8 — Verify green (the gate for this command)

```bash
bash docs/scripts/doctrine-lint.sh          # must print: doctrine-lint: ok — 2 doctrines registered …
test -L CLAUDE.md && [ "$(readlink CLAUDE.md)" = AGENTS.md ] && echo "symlink ok"
grep -qF agents-doctrine.md AGENTS.md && grep -qF agents-parallel-execution-doctrine.md AGENTS.md && echo "pointers ok"
test -f .tbd/config.yml && echo "tbd ok"
```

All must pass. If `doctrine-lint` is red, surface its output and fix (usually a pointer the user's
folded content displaced) before handoff — do not leave the repo red.

### Step 9 — Print handoff

```
✔ Substrate docs-core adopted.

Installed (stack untouched):
  AGENTS.md (+ CLAUDE.md symlink) · substrate.yaml gate · docs/doctrine/ (manifest + lint +
  agents & parallel-exec doctrines) · docs/protocol/sdd/ · docs/tasks/ongoing/ ·
  .claude/skills/doctrine-*/ (ambient doctrine pointers, generated) ·
  .tbd/ (beads tracker, prefix <prefix>) · .hooks/pre-commit · .github/workflows/doctrine-lint.yml

Kernel stamp: <the substrate-kernel line written in Step 5 — flag if it says ", dirty">

Gate 1 (mechanical): green.

Next:
  1. Review AGENTS.md + substrate.yaml — confirm the gate commands are exactly right.
  2. Add stack/domain doctrines:   /substrate/add-doctrine <name>
  3. Write a brief, then:          /substrate/architect-spec docs/tasks/ongoing/<feature>/<feature>-brief.md
     or a quick change:            /substrate/quick-spec "<objective>"
  4. Commit — the pre-commit hook re-runs doctrine-lint.

  Beads tracker (tbd) is initialized (prefix <prefix>) — graph a spec with
  /substrate/graph-spec, then run it with /substrate/orchestrate.
```

## Constraints

- MUST NOT install any language/framework/toolchain — adopt is stack-blind. Only the docs-core +
  `substrate.yaml` gate go in.
- MUST NOT overwrite an existing `docs/doctrine/`, `substrate.yaml`, `AGENTS.md`, or `CLAUDE.md`
  without the user's explicit choice (Step 4 / REFUSE table).
- MUST fill `substrate.yaml`'s three gate commands from the user — never leave the `{{GATE_*}}`
  tokens in place (a token-valued gate makes `/substrate/execute` run a literal placeholder).
- MUST write the `# substrate-kernel:` stamp in the reader's exact grammar (`<version> @ <sha>
  (<date>[, dirty])` after the literal prefix) and keep it idempotent — replace, never
  accumulate. It is a comment: no tool may treat it as schema; only readers (`substrate
  --version`) parse it.
- MUST ask the Step-3 **worktree-seed** question rather than silently shipping the empty commented
  stub — declare a populated `worktree-seed[]`/`toolchain-pin` block when the repo's gate needs
  gitignored inputs, so `/substrate/orchestrate` auto-seeds instead of the orchestrator hand-seeding.
- MUST **always** initialize the `tbd` bead tracker (Step 7) — core execution machinery for
  `/substrate/graph-spec` · `/substrate/orchestrate`, not optional.
  Idempotent: first-time `tbd setup --auto --prefix=<prefix>` (prefix from the user, **never** guessed
  silently), else a `tbd setup --auto` refresh when `.tbd/` already exists — never clobber an existing
  tracker. If no `tbd`/`npx` is available, abort with an explanation rather than hand-creating `.tbd/`.
- MUST **harvest before deleting** any pre-existing doctrine changelog (Step 7.5): rationale-bearing
  rows fold inline as why-notes at the section they cite, and the full table goes verbatim into the
  removal commit body. Never delete a `## Change Log` with a bare `sed`/rewrite — that drops
  rationale git can no longer surface by topic.
- MUST get explicit user confirmation before that deletion, and **abort with an explanation** on
  decline (leaving the doctrines byte-identical) — never a partial harvest, silent skip, or retry.
- MUST leave `doctrine-lint.sh` **green** before printing the handoff. A red adopt is a failed adopt.
- MUST keep `AGENTS.md` canonical with `CLAUDE.md` a symlink to it (macOS/Linux; Windows users work
  under WSL's Linux path).
- MUST copy the bundle via `cp -R` from `references/docs-core/`, not by promoting from any external
  source — the payload is self-contained in the source tree.
- SHOULD inspect the repo's manifest files (package.json / Cargo.toml / pyproject.toml / go.mod /
  Makefile) to propose sensible gate defaults when the user picks `default`.
- SHOULD NOT commit — leave the staged kernel for the user to review, unless they ask you to commit.
  The single exception is Step 7.5's changelog-removal commit, whose body carries the harvested
  table; scope it to the rewritten doctrine files only.
