# Framework-Agnostic Execution Core: Technical Specification

**Version**: 1.0.0
**Status**: Draft
**Author**: Architect (skill-level orchestration, 6 doctrine specialists)
**Date**: 2026-07-03
**Brief**: `docs/tasks/ongoing/agnostic-core/agnostic-core-brief.md`

> **Meta-note.** This spec refactors the **substrate plugin repo itself**, not a scaffolded
> substrate project. The standard `architect-spec` fan-out over web doctrines does not apply;
> instead six specialists were bound one-per-**keylark-promotion-concern** (source system:
> `/Users/reinova/code/soulbound-labs/keylark`). Because the plugin repo is markdown + bash,
> every Verify/Gate in §8 is explicit stack-agnostic bash (grep / test / shellcheck /
> `doctrine-lint.sh` / `python3 -c 'ast.parse'`), **not** `${gate.*}` tokens — the token
> mechanism is a *feature this spec builds* for scaffolded projects (see Decision R6).

---

## 1. Overview

### 1.1 Objective

Invert substrate's layering. Promote keylark's evolved docs system (enforced doctrine manifest,
zero-dep mechanical lint, meta-doctrine + semantic drift protocol, parallel-execution doctrine,
native `tbd`/beads weave, bead-DAG viz) into substrate's **agnostic core**, stripped of all
keylark specifics. Make verification gates **declared, never hardcoded**, via a repo-root
`substrate.yaml` gate block that the engine skills read and fail-fast on when absent. Demote the
Convex/Vite/Clerk kernel to **one `/substrate:bootstrap`** skill (absorbing `init`/`migrate`/`deploy`).
The six core skills stay top-level and go fully stack-agnostic; a seventh (`/substrate:audit-doctrine`)
ships the runnable semantic Gate 2. Prove agnosticism by executing a real spec end-to-end on a
Python/`uv` repo driven only by its declared gate. Treat as a **breaking major (1.0.0)** release.

### 1.2 Constraints (inherited from brief)

- **MUST**: Promote keylark's `manifest.yaml`, `doctrine-lint.sh` (Gate 1), `agents-doctrine.md`
  meta-doctrine (+ §6 drift protocol = Gate 2), `agents-parallel-execution-doctrine.md`, and the
  `tbd`/beads weave — **stripped** of keylark specifics (`clawmote`, `keylark`, `leasing`,
  `getkeylark`, `twilio`, `android`).
- **MUST**: Gates declared per project via `substrate.yaml` `gate:` block; `/substrate:execute`
  reads `gate.*`; spec/bead may override inline; **abort (fail-fast) if the file/key is absent** —
  no probing, no silent fallback.
- **MUST**: Demote kernel to one `/substrate:bootstrap`; `init` folds in; `migrate`/`deploy` become
  its lifecycle steps; **clean break, no aliases**. Six core skills stay top-level, fully agnostic.
- **MUST**: Bootstrap-blind **4-part artifact contract**; engine reads only artifacts (2)–(4).
- **MUST**: `AGENTS.md` canonical + `CLAUDE.md` symlink, in `references/templates/` **and** substrate's own root.
- **MUST**: Ship Gate 2 as runnable `/substrate:audit-doctrine` (drift-eval subagent per doctrine) + CI template.
- **MUST**: Split parallel-exec doctrine — generic policy + seed/toolchain *principles* in core (no stack literals); concrete recipe = bootstrap contract item (3).
- **MUST**: Ship Gate 1 wiring (pre-commit hook + CI example) in core templates.
- **MUST**: Keep core domain-agnostic in principle; this release validates code execution only.
- **MUST**: Breaking major; document in `CHANGELOG.md` + `README.md`; bump `plugin.json#version` **per release workflow, not on a feature branch**.
- **MUST NOT**: Build any knowledge-work vertical; a multi-stack bootstrap registry or a second bootstrap; leave any keylark specifics in the core; couple any core skill to a language/framework/toolchain (no `pnpm`, `convex`, `vite`, `app:test` in core skills or core parallel-exec doctrine).
- **SHOULD**: Ship `tbd-graph.py`-style bead-DAG viz; preserve `sub-` prefix + `.tbd/`; keep Gate 1 (mechanical, zero-dep) and Gate 2 (semantic) as distinct tiers.

### 1.3 Orchestrator-Resolved Decisions (recorded for review — see §11)

| # | Decision |
|---|---|
| R1 | Manifest filename standardized to **`doctrine-manifest.yaml`**; patch the one `MANIFEST=` line in `doctrine-lint.sh`. |
| R2 | Canonical `substrate.yaml` schema = gate specialist's: `gate.{compile,test,lint}`, `gate.out-of-band[]`, `worktree-seed[]`, `toolchain-pin.{install,env}`. |
| R3 | Agnostic docs artifacts live in a coherent **`references/docs-core/`** bundle (the contract-part-4 source tree). |
| R4 | Generic + substrate-own `AGENTS.md` carry the **2 agnostic** doctrine basenames; the convex bootstrap appends the 3 web-doctrine links/manifest entries at scaffold time. |
| R5 | `CLAUDE.md → AGENTS.md` symlink lands **before** the skill-surface phase; all root-context edits target `AGENTS.md`; every later phase re-asserts `test -L CLAUDE.md`. |
| R6 | This spec verifies itself with explicit stack-agnostic bash; `${gate.*}` tokens are the built feature, not this spec's own gate. |
| R7 | Python/`uv` agnosticism-proof fixture created at **`test/agnostic-proof/py-uv/`**. |

### 1.4 Success Criteria (binary)

1. `grep -RiE 'clawmote|keylark|leasing|getkeylark|twilio|android' references/docs-core` → **no matches**.
2. `grep -RnE 'pnpm|convex|vite|app:test' skills/execute skills/quick-spec skills/diagnose references/docs-core/docs/doctrine/agents-parallel-execution-doctrine.md` → **no matches**.
3. `bash docs/scripts/doctrine-lint.sh` exits **0** on substrate's own core doctrine set.
4. With no `substrate.yaml`, the shared reader aborts with exit 3 + "gate declaration missing".
5. `/substrate:audit-doctrine` fans out one drift-eval subagent per doctrine and emits a merged report; `references/templates/**/doctrine-audit.yml` (or docs-core CI) exists.
6. `skills/{init,migrate,deploy}` do **not** exist; `skills/bootstrap` exists; final top-level skill set = 8.
7. The Python/`uv` proof at `test/agnostic-proof/py-uv/` runs its declared gate (`uv run pytest`/`ruff`/`mypy`) green, driven only by its `substrate.yaml`.
8. `shellcheck` clean on all shipped `.sh`; `plugin.json#version` bump deferred to a `main`-only release commit.

---

## 2. Scope

| In Scope | Out of Scope |
|----------|--------------|
| Promote keylark docs-core into `references/docs-core/`, stripped | Knowledge-work verticals (legal/finance/ops) |
| `substrate.yaml` gate schema + shared reader + de-literalize `execute`/`quick-spec`/`diagnose` | A second bootstrap or a bootstrap registry |
| `/substrate:bootstrap` absorbing `init`/`migrate`/`deploy`; move web doctrines under it | `/migrate` retrofit onto arbitrary existing repos (→ `sub-` bead) |
| `AGENTS.md` canonical + symlink (template + substrate own) | Obligation-calendar / time-triggered work primitive |
| `/substrate:audit-doctrine` + `agents/drift-eval.md` + CI template (Gate 2) | Any agent-runtime change (standing per-arm agent / Hermes) |
| Split parallel-exec doctrine; 4-part artifact contract; `tbd-graph.py` viz | Full *tracker*-agnosticism (abstracting `tbd` itself) — `tbd` stays core infra |
| Python/`uv` agnosticism proof; docs (CHANGELOG/README/CLAUDE→AGENTS); deferred version bump | Windows support (macOS/Linux only; WSL users use the Linux path) |

---

## 3. Architecture

### 3.1 Target repo layout (after this spec)

```
substrate/
├── AGENTS.md                          # NEW canonical (promoted from CLAUDE.md); plugin-dev context
├── CLAUDE.md                          # NOW a symlink → AGENTS.md
├── substrate.yaml                     # NEW dogfood gate: doctrine-lint · shellcheck · literal-check
├── .hooks/pre-commit                  # NEW → bash docs/scripts/doctrine-lint.sh
├── .github/workflows/doctrine-lint.yml (Gate 1) + doctrine-audit.yml (Gate 2)
├── docs/
│   ├── doctrine/
│   │   ├── doctrine-manifest.yaml     # substrate's own: agents + agents-parallel-execution
│   │   ├── agents-doctrine.md
│   │   └── agents-parallel-execution-doctrine.md
│   └── scripts/{doctrine-lint.sh, tbd-graph.py}
├── scripts/
│   ├── substrate-config.sh            # NEW shared substrate.yaml reader (gate/worktree/toolchain)
│   ├── skill-literal-check.sh         # NEW acceptance grep, used as substrate's own gate.test
│   ├── dev-link.sh, dev-unlink.sh     # STAY (plugin-dev helpers)
│   └── (scaffold.sh & stack scripts MOVED → bootstraps/convex-vite-clerk/scripts/)
├── skills/
│   ├── bootstrap/       (NEW — absorbs init+migrate+deploy phases)
│   ├── audit-doctrine/  (NEW — Gate 2 runnable)
│   ├── architect-spec/ execute/ quick-spec/ diagnose/ synthesize-session/ add-doctrine/  (STAY, de-stacked)
│   └── (init/ migrate/ deploy/ DELETED)
├── agents/
│   ├── doctrine-architect.md          # STAY
│   └── drift-eval.md                  # NEW
├── references/
│   ├── docs-core/                     # NEW — contract-part-4 source tree (cp -R'd by bootstraps)
│   │   ├── AGENTS.md                  # generic root-context skeleton + CLAUDE.md symlink
│   │   ├── substrate.yaml             # seed gate/worktree/toolchain
│   │   ├── docs/doctrine/{doctrine-manifest.yaml, agents-doctrine.md, agents-parallel-execution-doctrine.md}
│   │   ├── docs/scripts/{doctrine-lint.sh, tbd-graph.py}
│   │   ├── docs/tasks/{CLAUDE.md, ongoing/.gitkeep}
│   │   ├── .hooks/pre-commit
│   │   └── .github/workflows/{doctrine-lint.yml, doctrine-audit.yml}
│   ├── engine/artifact-contract.md    # NEW — the 4-part contract (canonical)
│   └── sdd-protocol/                  # STAY (de-literalized examples)
├── bootstraps/
│   └── convex-vite-clerk/             # NEW — the demoted kernel
│       ├── bootstrap.yaml
│       ├── scripts/{scaffold,prerequisites,init-github,connect-vercel,setup-clerk,patch-convex-tsconfig}.sh
│       ├── doctrines/{domain,backend,frontend}-doctrine.md   # MOVED from references/doctrines/
│       ├── templates/                 # MOVED from references/templates/
│       └── example/                   # MOVED from references/example/
└── test/agnostic-proof/py-uv/         # NEW — the agnosticism proof fixture
```

### 3.2 `substrate.yaml` schema (Decision R2 — canonical)

```yaml
version: 1                       # optional, default 1
gate:                            # REQUIRED
  compile: "<command>"           # REQUIRED — type/build check
  test:    "<command>"           # REQUIRED — test suite
  lint:    "<command>"           # REQUIRED — static lint
  out-of-band:                   # OPTIONAL — gates not run every step (e2e/load/visual)
    - name: e2e
      command: "<command>"
      when: phase-tagged | manual
worktree-seed:                   # OPTIONAL list<glob> — gitignored inputs copied into fresh worktrees
  - ".env.local"
toolchain-pin:                   # OPTIONAL
  install: "<command>"           # per-worktree install step
  env: { KEY: "value" }          # resolved env injected into gate commands
```

- **convex-vite-clerk** example: `gate.compile: "pnpm app:compile"`, `gate.test: "pnpm app:test"`, `gate.lint: "pnpm app:lint"`, `toolchain-pin.install: "pnpm install --frozen-lockfile"`.
- **python/uv** example: `gate.compile: "uv run mypy ."`, `gate.test: "uv run pytest -q"`, `gate.lint: "uv run ruff check ."`, `toolchain-pin.install: "uv sync --frozen"`.
- **substrate's own** dogfood: `gate.compile: "bash docs/scripts/doctrine-lint.sh"`, `gate.lint: "shellcheck scripts/*.sh docs/scripts/*.sh"`, `gate.test: "bash scripts/skill-literal-check.sh"`.

**Fail-fast contract.** Required: `gate`, `gate.compile`, `gate.test`, `gate.lint`. ABORT (exit 3, no probing) when `substrate.yaml` is absent, `gate:` is absent, or any required key is missing/empty. Canonical abort message:

```
✖ substrate:execute aborted — gate declaration missing.
  Required: substrate.yaml at repo root declaring gate.compile, gate.test, gate.lint.
  Found:    {no substrate.yaml at repo root | substrate.yaml present but gate.<key> missing/empty}
  This engine never guesses your toolchain. Declare gates explicitly. No command was probed.
```

### 3.3 Shared reader `scripts/substrate-config.sh` (Decision R7)

Single literal-free bridge every skill + the parallel-exec engine call, so skill bodies stay free of `pnpm|convex|vite|app:test`. Sub-commands: `gate <compile|test|lint>` (print resolved command, exit 0; else abort exit 3), `gate out-of-band <name>`, `worktree-seed` (newline paths), `toolchain install`, `toolchain env` (`KEY=VALUE` lines). Parser prefers `yq -r`, falls back to a documented grep/sed reader for the flat schema, `shellcheck`-clean. Lives in the plugin (`$SUBSTRATE_ROOT/scripts/`); reads the target repo's `./substrate.yaml`.

### 3.4 The two-tier gate model (kept distinct — brief SHOULD)

- **Gate 1 — mechanical / zero-dep** (`docs/scripts/doctrine-lint.sh`): coverage (every on-disk `*-doctrine.md` is registered), path/existence (`basename == <id>-doctrine.md`, file exists), pointer (`grep -qF <basename> <pointer-file>` — rename-rot guard). Pre-commit (bypassable) + CI (unbypassable). No judgment.
- **Gate 2 — semantic** (`/substrate:audit-doctrine` + `agents/drift-eval.md`, protocol §6 of `agents-doctrine.md`): depth-0 fan-out, one drift-eval subagent per manifest doctrine, each emits §6.4 findings (`doctrine|section|claim|drift_type|severity|evidence|fix`); merged report; CI template gates on Critical. No grep-work pushed onto the agent.

### 3.5 The 4-part bootstrap-blind artifact contract (`references/engine/artifact-contract.md`)

A bootstrap of any stack MUST leave a repo satisfying: **(1)** scaffolded stack whose `substrate.yaml#gate.*` all exit 0; **(2)** `substrate.yaml` gate block; **(3)** `substrate.yaml` `worktree-seed` + `toolchain-pin` recipe; **(4)** docs-core (`AGENTS.md`+`CLAUDE.md` symlink, `docs/doctrine/` with manifest+lint+`agents-doctrine.md`+`agents-parallel-execution-doctrine.md`, `docs/tasks/`, `docs/protocol/sdd/`, `.hooks/pre-commit`, CI). The engine (`execute`/`architect-spec`/`audit-doctrine`) reads **only** (2)–(4), never the bootstrap identity — making a future `/migrate` symmetric.

---

## 4. Implementation Details

### 4.1 Gate 1 — manifest + lint (docs-core foundation)

Promote `keylark/docs/scripts/doctrine-lint.sh` **verbatim modulo one line** — change `MANIFEST="$ROOT/docs/doctrine/manifest.yaml"` → `.../doctrine-manifest.yaml` (R1). Script stays keylark-free, zero-dep, `set -u`, self-locating via `ROOT=$(cd "$(dirname "$0")/../.." && pwd)` — **must live at `docs/scripts/`** or `../..` escapes the repo. Unified manifest schema is a **superset**: the lint reads only `id`/`path`/`pointers`; the extra dispatch fields (`name`/`summary`/`triggers`/`layer-hint`/`specialist`) are silently ignored — so one manifest serves both enforcement and dispatch. `pointers` is **new** to substrate (inline `[a, b]` form only). CLAUDE.md's "manifest is optional / recursive glob" wording becomes "**mandatory, flat**".

### 4.2 Agnostic doctrines (stripped + de-literalized)

- **`agents-doctrine.md`** (meta): strip the keylark family table, `apps/*` layout, `mise`/Cloud Run wiring, SEO/android rows. Swap canonical name to `AGENTS.md`. **§6 drift protocol ships verbatim** (it is already tool-agnostic; `mise/make/npm` appear only as *illustrative* command-shaped-claim examples). Grep-clean gate over the file.
- **`agents-parallel-execution-doctrine.md`**: split per the specialist map — generic orchestration invariants (single-writer tracker, integration branch + merge-on-green, batch sync, file-disjoint waves, gate-before-close, two-stage gate, worktree hygiene, external-blockers-as-edges) stay in core with **zero stack literals**; the concrete worktree-seed/toolchain recipe becomes bootstrap contract item (3), supplied via `substrate.yaml`. De-literalize every command (`pnpm build && pnpm test` / `uv run pytest` → "the declared gate `gate.compile`→`gate.test`"; `package.json`/`main.tsx`/`index.ts` → "dependency manifest / app entrypoint / shared barrels"; `local.properties`/`.env` → `worktree-seed[]`; `JAVA_HOME=…/gradlew` → `toolchain-pin.env` + `gate.*`; "unit/JVM tests" → "unit tests"; hardware/deeplink → "out-of-band proof"). **Retain** `tbd`/`git`/`commit.gpgsign`/`feat/<epic-slug>` — substrate-native infra, not stack literals. Add an optional `gate.out-of-band` slot so Policy-4's two-stage gate is declarable.

### 4.3 substrate.yaml gate + de-literalized core skills

Per the literal inventory (file:line → replacement): `skills/execute/SKILL.md:53-56`, `skills/quick-spec/SKILL.md:56,70-72,132`, `skills/diagnose/SKILL.md:56-58,73-77,134-136`, `skills/synthesize-session/SKILL.md:56`. Each skill calls `bash "$SUBSTRATE_ROOT/scripts/substrate-config.sh" gate <compile|test|lint>` at its verify point; inline spec/bead backtick commands remain literal overrides; missing `substrate.yaml`/key aborts before any phase. `diagnose` path-layer routing stops hardcoding the stack table and reads an optional manifest `source-globs` field (degrades to trigger+symbol signals when absent). `execution-format.md` gains **§4.6 Gate token substitution** (`${gate.compile}` etc., substituted before run; grammar §6 regex unchanged since tokens contain no backtick); `spec-template.md` neutralizes §4.2/§4.3 layer names + the testing table to token/prose form.

### 4.4 AGENTS.md + tbd weave + DAG viz

Two distinct files (do not collapse): **(i)** generic `references/docs-core/AGENTS.md` (from keylark's, stripped; `{{PROJECT_NAME}}`/`{{PROJECT_DESCRIPTION}}` tokens; gate note → `substrate.yaml`; task lifecycle; tbd block; 2 agnostic doctrine links) with a same-dir relative `CLAUDE.md → AGENTS.md` symlink; **(ii)** substrate's own root `AGENTS.md` (promoted from current `CLAUDE.md` via `git mv`, plugin-dev content kept, **not** genericized) + `CLAUDE.md → AGENTS.md` symlink + a Doctrine section naming the 2 agnostic basenames (R4). The tbd/beads block (`BEGIN/END TBD INTEGRATION`) is lifted genericized (prefix-neutral in template; `sub` preserved for substrate's own via `.tbd/config.yml`); the auto-generated shortcut-directory table is excluded (regenerated by `tbd setup`). `docs/tasks/CLAUDE.md` ships as a **regular** subdir file (not a symlink). `tbd-graph.py` (already agnostic, zero keylark literals) promoted to `references/docs-core/docs/scripts/` + substrate's own `scripts/`. **Symlink mechanics**: real file = `AGENTS.md`; symlink = `CLAUDE.md`; `cp -R` preserves symlinks; `sed -i` token loop includes `AGENTS.md` but **never** `CLAUDE.md` (would clobber the symlink). Live-load through the symlink is `[executor must verify]` against the installed Claude Code version.

### 4.5 Gate 2 — audit-doctrine skill + drift-eval agent

New `agents/drift-eval.md` (NOT a reuse of `doctrine-architect` — inverse contract: doctrine-claims → verified-against-code → §6.4 findings, edits nothing). New `skills/audit-doctrine/SKILL.md` mirrors `architect-spec`'s **depth-0** fan-out (one drift-eval subagent per manifest doctrine; REFUSE table; `--changed-files`/`--severity-gate`/`--write` args; merged, deduped, severity-sorted report). CI template `references/docs-core/.github/workflows/doctrine-audit.yml` runs the same eval headless, gates on Critical, uploads the report artifact — the unbypassable Gate 2. Gate 2 is **CI-only**, not wired into the per-step `gate.*` block (too slow/nondeterministic).

### 4.6 Skill-surface migration + bootstrap

Carve `bootstraps/convex-vite-clerk/` (move `references/{doctrines,templates,example}` + the 6 stack scripts via `git mv`). New `skills/bootstrap/SKILL.md` with a filesystem **phase router** (empty→SCAFFOLD, `prototype/`+welcome→MIGRATE, migrated+`_generated`→DEPLOY) whose phase bodies are the near-verbatim `init`/`migrate`/`deploy` bodies (preserving Socratic Q&A, the parallel `doctrine-architect` dispatch, five-phase deploy idempotency). `scaffold.sh` gains `ENGINE_ROOT` (copies `references/docs-core` + `references/sdd-protocol`), appends the 3 web doctrines to the manifest + their links to the scaffolded `AGENTS.md` (R4), and `ln -s AGENTS.md CLAUDE.md`. Delete `skills/{init,migrate,deploy}` (clean break). Update `plugin.json` (desc, keywords; **version bump deferred**), `marketplace.json`, `CLAUDE.md`→`AGENTS.md` counts (8 skills / 2 agents / layout), `README.md`, `CHANGELOG.md` (`[1.0.0]` old→new map). All root-context edits target `AGENTS.md` (R5).

### 4.7 Agnosticism proof (Python/uv)

`test/agnostic-proof/py-uv/`: a minimal `uv` project (`pyproject.toml` with ruff+mypy config, a domain module + a real unit test, `substrate.yaml` with `gate: {compile: "uv run mypy .", test: "uv run pytest -q", lint: "uv run ruff check ."}`), a one-feature mini-spec, and no bootstrap/stack literal. The engine drives it; the gate runs green from `substrate.yaml` alone.

---

## 5. Error Handling

| Error | Cause | Handling |
|-------|-------|----------|
| `substrate.yaml` / `gate.*` absent | project not gate-declared | reader exits 3, canonical abort message; no phase runs; no probing |
| `${gate.X}` token with no matching key | spec references undeclared gate | same exit-3 abort; token never handed to shell |
| `doctrine-lint.sh` red | unregistered/renamed doctrine, dangling pointer | pre-commit/CI blocks; fix manifest+`AGENTS.md` as one edit |
| keylark leak in core | incomplete strip | acceptance grep gate fails the phase |
| stack literal in core skill/doctrine | incomplete de-literalization | `skill-literal-check.sh` (= substrate's `gate.test`) fails |
| symlink checks out as text file | `core.symlinks=false` / Windows | macOS/Linux only (fail-fast); document WSL Linux path |
| `sed -i` clobbers `CLAUDE.md` symlink | `CLAUDE.md` added to scaffold sed loop | only `AGENTS.md` in the loop; sandbox asserts `test -L CLAUDE.md` |
| `uv` absent for proof | toolchain missing | abort with explanation (fail-fast); do not skip the proof silently |

---

## 6. Testing Strategy

| Layer | Focus | Command (stack-agnostic) |
|-------|-------|--------------------------|
| Strip integrity | no keylark specifics in core | `! grep -RiE 'clawmote\|keylark\|leasing\|getkeylark\|twilio\|android' references/docs-core` |
| Agnosticism | no stack literals in engine | `! grep -RnE 'pnpm\|convex\|vite\|app:test' skills/execute skills/quick-spec skills/diagnose references/docs-core/docs/doctrine/agents-parallel-execution-doctrine.md` |
| Gate 1 | lint green on own core | `bash docs/scripts/doctrine-lint.sh` |
| Fail-fast | abort on missing gate | reader exit-3 test in a temp dir |
| Shell hygiene | all scripts clean | `shellcheck scripts/*.sh docs/scripts/*.sh` |
| Scaffold | template lint-green in isolation | `cp -R` template to tmp → run lint |
| Proof | Python/uv gate green via substrate.yaml | `cd test/agnostic-proof/py-uv && uv run mypy . && uv run ruff check . && uv run pytest -q` |
| Gate 2 | drift-eval fan-out emits merged report | run `/substrate:audit-doctrine` on substrate's own core |

---

## 7. Failure Modes (FMEA)

| # | Failure Mode | Severity | Mitigation |
|---|--------------|----------|------------|
| 1 | Skill silently falls back to `pnpm` when `substrate.yaml` missing → not actually agnostic | Critical | Reader exits 3; no probing path exists; abort test enforces it |
| 2 | Capability regression when folding init/migrate/deploy into bootstrap | High | Migrate bodies **verbatim**; checklist asserts each old step present; sandbox run through all three phases |
| 3 | Version bump on feature branch orphans dev cache symlink | High | Defer bump to a `main`-only final commit after `dev-unlink.sh`; branch guard |
| 4 | Doctrine relocation breaks `scaffold.sh` / stale path literals | High | `git mv` + repo-wide grep sweep for `references/{doctrines,templates}` + repoint `scaffold.sh` |
| 5 | `CLAUDE.md` symlink clobbered by a later `Write`/`sed`/skill-surface edit | High | R5 sequencing; every later phase re-asserts `test -L CLAUDE.md`; edits target `AGENTS.md` |
| 6 | Drift-eval nondeterminism → flaky CI | Medium | Gate on Critical only; "cite `file:line` or drop"; Major/Minor advisory; artifact for triage |
| 7 | Subagent depth-cap silently degrades audit fan-out | Medium | Orchestrate at skill level (depth 0); drift-eval subagents are leaves |
| 8 | Manifest filename split-brain (`manifest.yaml` vs `doctrine-manifest.yaml`) | Medium | R1 single name; one-line lint edit; sweep skill references |
| 9 | Pointer/coverage lint false-green (substring match, non-recursive glob) | Low | Keep core doctrines flat; Gate 2 semantic audit covers real linkage; documented |
| 10 | `${gate.*}` token left unexpanded reaches shell | Medium | Executor substitutes before run; unresolved = exit-3 abort, never shelled |
| 11 | `yq` absent → reader can't parse | High | Reader falls back to grep/sed for the flat schema; `shellcheck`-clean; aborts clearly if neither resolves |
| 12 | Proof fixture depends on `uv` not installed | Medium | Fail-fast with install hint; assert `uv --version` in the phase gate |

---

## 8. Prompt Execution Strategy

<!-- PROTOCOL: docs/protocol/sdd/execution-format.md · COMPLETENESS: _SPEC-STANDARD.md §5 -->
<!-- All Verify/Gate commands run from the substrate repo root unless noted. Explicit bash by Decision R6. -->

### Phase 1: Gate 1 — enforced manifest + zero-dep lint (docs-core foundation)

#### Step 1.1: Scaffold `references/docs-core/` + promote the lint script

Create `references/docs-core/docs/scripts/doctrine-lint.sh` by copying `/Users/reinova/code/soulbound-labs/keylark/docs/scripts/doctrine-lint.sh` verbatim, then change the single line `MANIFEST="$ROOT/docs/doctrine/manifest.yaml"` to `MANIFEST="$ROOT/docs/doctrine/doctrine-manifest.yaml"`. Also copy it to substrate's own `docs/scripts/doctrine-lint.sh`. `chmod +x` both. Make no other edits.

Tools to use: Bash (cp, sed, chmod), Read

##### Verify

- `test -x docs/scripts/doctrine-lint.sh`
- `test -x references/docs-core/docs/scripts/doctrine-lint.sh`
- `diff <(sed 's/doctrine-manifest.yaml/manifest.yaml/' docs/scripts/doctrine-lint.sh) /Users/reinova/code/soulbound-labs/keylark/docs/scripts/doctrine-lint.sh && echo VERBATIM_OK`
- `! grep -RiE 'clawmote|keylark|leasing|getkeylark|twilio|android' docs/scripts/doctrine-lint.sh references/docs-core/docs/scripts/doctrine-lint.sh`

##### Timeout

120000

#### Step 1.2: Author the stripped superset manifest (both locations)

Write `references/docs-core/docs/doctrine/doctrine-manifest.yaml` and substrate's own `docs/doctrine/doctrine-manifest.yaml`. Register only the agnostic entries `agents` and `agents-parallel-execution` (exact `id`/`path` finalized in Phase 2). Use the superset schema: `id`, `path`, `pointers: [AGENTS.md]` (inline), plus `name`/`summary`/`triggers`/`layer-hint`. Keep entries flat, 2-space indent.

##### Verify

- `grep -c 'id:' docs/doctrine/doctrine-manifest.yaml`
- `! grep -RiE 'clawmote|keylark|leasing|getkeylark|twilio|android|apps/' docs/doctrine/doctrine-manifest.yaml references/docs-core/docs/doctrine/doctrine-manifest.yaml`

#### Step 1.3: Pre-commit hook + CI (Gate 1) in both locations

Create `.hooks/pre-commit` (substrate root) and `references/docs-core/.hooks/pre-commit` as `#!/bin/sh` / `exec bash docs/scripts/doctrine-lint.sh`; `chmod +x`. Activate on substrate: `git config core.hooksPath .hooks`. Create `.github/workflows/doctrine-lint.yml` (substrate root) and `references/docs-core/.github/workflows/doctrine-lint.yml`: checkout + a single `run: bash docs/scripts/doctrine-lint.sh` step (no `mise`/`uv`/contract steps).

##### Verify

- `test -x .hooks/pre-commit && test -x references/docs-core/.hooks/pre-commit`
- `test "$(git config core.hooksPath)" = .hooks`
- `grep -q 'doctrine-lint.sh' .github/workflows/doctrine-lint.yml`
- `! grep -RiE 'mise|uv|convex|pnpm' .github/workflows/doctrine-lint.yml`

#### Gate

- `bash docs/scripts/doctrine-lint.sh`  <!-- expect: red until Phase 2 lands the doctrines+pointers; see Step 2.4 for the green gate -->
- `shellcheck docs/scripts/doctrine-lint.sh .hooks/pre-commit`

### Phase 2: Promote agnostic doctrines (meta + parallel-exec)

#### Step 2.1: Promote + strip the meta-doctrine (`agents-doctrine.md`)

Copy `keylark/docs/doctrine/agents-doctrine.md` to `references/docs-core/docs/doctrine/agents-doctrine.md` and substrate's own `docs/doctrine/agents-doctrine.md`. Strip the keylark family table (§1), `apps/*` layout (§1.1), the §4 mermaid product nodes, and §5/§10 `mise`/Cloud Run/SEO wiring. Swap canonical root name `CLAUDE.md` → `AGENTS.md` (note the symlink). **Leave §6 (drift-eval protocol) verbatim.**

##### Verify

- `test -f references/docs-core/docs/doctrine/agents-doctrine.md`
- `grep -q '## 6' references/docs-core/docs/doctrine/agents-doctrine.md && grep -q '6.4' references/docs-core/docs/doctrine/agents-doctrine.md`
- `! grep -RiE 'clawmote|keylark|leasing|getkeylark|twilio|android|cloud run|hexagon' references/docs-core/docs/doctrine/agents-doctrine.md`

#### Step 2.2: Promote + split the parallel-execution doctrine

Copy `keylark/docs/doctrine/agents-parallel-execution-doctrine.md` to `references/docs-core/docs/doctrine/agents-parallel-execution-doctrine.md` and substrate's own `docs/doctrine/`. Strip keylark bead IDs + the clawmote plan path. Apply the de-literalization table (§4.2). Add a subsection stating the concrete worktree-seed/toolchain recipe lives in `substrate.yaml` (`worktree-seed[]`, `toolchain-pin.*`) supplied per stack, not here.

##### Verify

- `! grep -nEi 'clawmote|keylark|stew-|orja|\b04c6\b' references/docs-core/docs/doctrine/agents-parallel-execution-doctrine.md`
- `! grep -nE '\b(pnpm|npm|yarn|vite|convex|clerk|gradlew|gradle|pytest|ruff|mypy|uv run|app:test|node_modules|package\.json|main\.tsx|local\.properties|JAVA_HOME|ANDROID_HOME|JVM)\b' references/docs-core/docs/doctrine/agents-parallel-execution-doctrine.md`
- `grep -nE 'worktree-seed|toolchain-pin' references/docs-core/docs/doctrine/agents-parallel-execution-doctrine.md`

#### Step 2.3: Mirror the promoted doctrines to substrate's own `docs/doctrine/`

Ensure both stripped doctrines exist under substrate's own `docs/doctrine/` (dogfood) and are registered in substrate's own `doctrine-manifest.yaml` with matching `id`/`path`/`pointers: [AGENTS.md]`.

##### Verify

- `test -f docs/doctrine/agents-doctrine.md && test -f docs/doctrine/agents-parallel-execution-doctrine.md`
- `grep -q 'agents-parallel-execution' docs/doctrine/doctrine-manifest.yaml`

#### Step 2.4: (deferred green) note — lint goes green only after Phase 4 lands `AGENTS.md`

The pointer check needs `AGENTS.md` to contain each doctrine basename; that file is authored in Phase 4. Phase 2's gate therefore checks structure, not full green.

##### Verify

- `grep -c 'id:' docs/doctrine/doctrine-manifest.yaml`

#### Gate

- `shellcheck docs/scripts/doctrine-lint.sh`
- `! grep -RnE 'pnpm|convex|vite|app:test' references/docs-core/docs/doctrine/agents-parallel-execution-doctrine.md`

### Phase 3: `substrate.yaml` gate + shared reader + de-literalize core skills

#### Step 3.1: Author schema doc + `scripts/substrate-config.sh`

Create `references/sdd-protocol/substrate-config.md` documenting §3.2. Create `scripts/substrate-config.sh` implementing the §3.3 sub-commands with the exact §3.2 fail-fast (exit 3 + canonical message). Prefer `yq`, fall back to grep/sed. Create `scripts/skill-literal-check.sh` (the acceptance grep, exit non-zero on any hit).

##### Verify

- `bash -n scripts/substrate-config.sh && bash -n scripts/skill-literal-check.sh`
- `shellcheck scripts/substrate-config.sh scripts/skill-literal-check.sh`
- `t=$(mktemp -d); ( cd "$t" && bash "$OLDPWD/scripts/substrate-config.sh" gate compile >/dev/null 2>e; test $? -eq 3 && grep -q 'gate declaration missing' e ); rc=$?; rm -rf "$t"; test $rc -eq 0`

#### Step 3.2: Dogfood `substrate.yaml` at substrate root

Create `/Users/reinova/code/metalogica/substrate/substrate.yaml` with `gate.compile: "bash docs/scripts/doctrine-lint.sh"`, `gate.lint: "shellcheck scripts/*.sh docs/scripts/*.sh"`, `gate.test: "bash scripts/skill-literal-check.sh"`. Add `references/docs-core/substrate.yaml` as the seed default (documented placeholder gate). 

##### Verify

- `test -f substrate.yaml && test -f references/docs-core/substrate.yaml`
- `bash scripts/substrate-config.sh gate compile`

#### Step 3.3: De-literalize `execute`, `quick-spec`, `diagnose`, `synthesize-session`

Apply the file:line replacements in §4.3 — each verify point calls `bash "$SUBSTRATE_ROOT/scripts/substrate-config.sh" gate <compile|test|lint>`; inline overrides preserved; `diagnose` path-layer table → manifest `source-globs`. Remove the `pnpm add -g tbd` literal in `synthesize-session`.

##### Verify

- `! grep -rnE 'pnpm|convex|vite|app:test|app:compile|app:lint' skills/execute/SKILL.md skills/quick-spec/SKILL.md skills/diagnose/SKILL.md`
- `! grep -rnE 'pnpm|convex|vite|app:test' skills/synthesize-session/SKILL.md`
- `! grep -nE '`src/|`domain/|`test/unit|\.tsx' skills/diagnose/SKILL.md`

#### Step 3.4: De-literalize the SDD protocol grammar + template

Add §4.6 (gate token substitution) to `references/sdd-protocol/execution-format.md`; neutralize its examples to `${gate.*}`. Neutralize `spec-template.md` §4.2/§4.3 layer names + testing table to token/prose form (keep the `${gate.compile}` example + the mandatory Doctrine Review phase).

##### Verify

- `grep -q '4.6' references/sdd-protocol/execution-format.md`
- `! grep -nE 'pnpm|convex|supabase|vite' references/sdd-protocol/execution-format.md references/sdd-protocol/templates/spec-template.md`
- `grep -q '\${gate.compile}' references/sdd-protocol/templates/spec-template.md`

#### Gate

- `bash scripts/skill-literal-check.sh`
- `shellcheck scripts/substrate-config.sh scripts/skill-literal-check.sh`

### Phase 4: Canonical AGENTS.md + tbd weave + bead-DAG viz

#### Step 4.1: Generic `references/docs-core/AGENTS.md` + template symlink

Author `references/docs-core/AGENTS.md` from keylark's (stripped per §4.4): tokens, gate→`substrate.yaml` note, task lifecycle, tbd block (prefix-neutral, no shortcut-directory), and links naming `agents-doctrine.md` + `agents-parallel-execution-doctrine.md`. Create `references/docs-core/CLAUDE.md` → `AGENTS.md` (relative symlink). Ship `references/docs-core/docs/tasks/CLAUDE.md` (regular file, genericized).

##### Verify

- `test -f references/docs-core/AGENTS.md && test -L references/docs-core/CLAUDE.md && [ "$(readlink references/docs-core/CLAUDE.md)" = AGENTS.md ]`
- `! grep -RniE 'clawmote|keylark|leasing|getkeylark|twilio|android' references/docs-core/AGENTS.md references/docs-core/docs/tasks/CLAUDE.md`
- `for b in agents-doctrine.md agents-parallel-execution-doctrine.md; do grep -qF "$b" references/docs-core/AGENTS.md || echo "MISSING $b"; done`
- `grep -q 'BEGIN TBD INTEGRATION' references/docs-core/AGENTS.md && grep -q 'tbd sync' references/docs-core/AGENTS.md`

#### Step 4.2: Promote substrate's own root context (`CLAUDE.md` → `AGENTS.md` + symlink)

`git mv CLAUDE.md AGENTS.md`; append a Doctrine section naming the 2 agnostic basenames; `ln -s AGENTS.md CLAUDE.md`. Keep the plugin-dev content (do not genericize).

##### Verify

- `test -L CLAUDE.md && [ "$(readlink CLAUDE.md)" = AGENTS.md ] && test -f AGENTS.md`
- `grep -q 'Claude Code' AGENTS.md`
- `for b in agents-doctrine.md agents-parallel-execution-doctrine.md; do grep -qF "$b" AGENTS.md || echo "MISSING $b"; done`

#### Step 4.3: Promote `tbd-graph.py`

Copy `keylark/scripts/tbd-graph.py` to `references/docs-core/docs/scripts/tbd-graph.py` and substrate's own `docs/scripts/tbd-graph.py`; `chmod +x`.

##### Verify

- `python3 -c "import ast; ast.parse(open('docs/scripts/tbd-graph.py').read())"`
- `! grep -niE 'clawmote|keylark|leasing' docs/scripts/tbd-graph.py references/docs-core/docs/scripts/tbd-graph.py`

#### Gate

- `bash docs/scripts/doctrine-lint.sh`  <!-- now GREEN: doctrines registered + AGENTS.md pointers resolve -->
- `test -L CLAUDE.md`

### Phase 5: Gate 2 — audit-doctrine skill + drift-eval agent + CI template

#### Step 5.1: Create `agents/drift-eval.md`

Author the drift-eval subagent (frontmatter `name: drift-eval`; body = §6.1–§6.5 operating manual + §6.4 output contract; MUST cite `file:line`, MUST NOT edit doctrines).

##### Verify

- `test -f agents/drift-eval.md && grep -q 'name: drift-eval' agents/drift-eval.md && grep -q 'drift_type' agents/drift-eval.md`

#### Step 5.2: Create `skills/audit-doctrine/SKILL.md`

Depth-0 fan-out (one drift-eval per manifest doctrine), REFUSE table, `--changed-files`/`--severity-gate`/`--write` args, merged/deduped/severity-sorted report + coverage roll-up.

##### Verify

- `test -f skills/audit-doctrine/SKILL.md && grep -q 'name: audit-doctrine' skills/audit-doctrine/SKILL.md && grep -qi 'depth 0' skills/audit-doctrine/SKILL.md`

#### Step 5.3: CI template `doctrine-audit.yml`

Create `references/docs-core/.github/workflows/doctrine-audit.yml` (separate job from `doctrine-lint.yml`): headless `/substrate:audit-doctrine --ci --severity-gate critical`, artifact upload, `ANTHROPIC_API_KEY` placeholder, graceful no-op if the secret is unset.

##### Verify

- `test -f references/docs-core/.github/workflows/doctrine-audit.yml && grep -q 'audit-doctrine' references/docs-core/.github/workflows/doctrine-audit.yml`

#### Gate

- `bash docs/scripts/doctrine-lint.sh`
- `test -L CLAUDE.md`

### Phase 6: Skill-surface migration + bootstrap consolidation

#### Step 6.1: Carve the convex-vite-clerk bootstrap tree

`git mv references/doctrines bootstraps/convex-vite-clerk/doctrines`; `git mv references/templates bootstraps/convex-vite-clerk/templates`; `git mv references/example bootstraps/convex-vite-clerk/example`; `mkdir -p bootstraps/convex-vite-clerk/scripts && git mv scripts/{scaffold,prerequisites,init-github,connect-vercel,setup-clerk,patch-convex-tsconfig}.sh bootstraps/convex-vite-clerk/scripts/`. Author `bootstraps/convex-vite-clerk/bootstrap.yaml`.

##### Verify

- `test -d bootstraps/convex-vite-clerk/doctrines && test -f bootstraps/convex-vite-clerk/scripts/scaffold.sh`
- `test ! -d references/doctrines && test ! -d references/templates`
- `ls scripts/ | grep -qx dev-link.sh && ! ls scripts/ | grep -qx scaffold.sh`
- `! grep -RnE 'references/doctrines|references/templates' skills bootstraps/convex-vite-clerk/scripts scripts`

#### Step 6.2: Repoint `scaffold.sh` (docs-core install + web-doctrine overlay + symlink)

Add `ENGINE_ROOT`; copy `references/docs-core` + `references/sdd-protocol` into the target; overlay `bootstraps/convex-vite-clerk/doctrines/*.md` into `docs/doctrine/` **and** append their 3 manifest entries + their 3 links into the scaffolded `AGENTS.md` (R4); `ln -s AGENTS.md CLAUDE.md`; write `substrate.yaml`. Add `AGENTS.md` to the `sed -i` token loop; never add `CLAUDE.md`.

##### Verify

- `grep -q 'ENGINE_ROOT' bootstraps/convex-vite-clerk/scripts/scaffold.sh && grep -q 'docs-core' bootstraps/convex-vite-clerk/scripts/scaffold.sh`
- `grep -qE 'for f in .*AGENTS.md' bootstraps/convex-vite-clerk/scripts/scaffold.sh && ! grep -qE 'for f in .*CLAUDE.md' bootstraps/convex-vite-clerk/scripts/scaffold.sh`

#### Step 6.3: Create `skills/bootstrap/SKILL.md`; delete init/migrate/deploy

Author the phase-router skill; migrate the three bodies in verbatim as SCAFFOLD/MIGRATE/DEPLOY phases (preserve Q&A, parallel `doctrine-architect` dispatch, five-phase deploy). Then `git rm -r skills/init skills/migrate skills/deploy`.

##### Verify

- `test -f skills/bootstrap/SKILL.md && grep -qi 'SCAFFOLD' skills/bootstrap/SKILL.md && grep -qi 'MIGRATE' skills/bootstrap/SKILL.md && grep -qi 'DEPLOY' skills/bootstrap/SKILL.md`
- `test ! -d skills/init && test ! -d skills/migrate && test ! -d skills/deploy`
- `test "$(ls skills/ | sort | tr '\n' ' ')" = "add-doctrine architect-spec audit-doctrine bootstrap diagnose execute quick-spec synthesize-session "`

#### Step 6.4: Write the artifact contract + update plugin/marketplace/AGENTS/README/CHANGELOG

Create `references/engine/artifact-contract.md` (§3.5 checklist). Edit `plugin.json` (description/keywords; **no version bump**), `marketplace.json`, `AGENTS.md` (skill count 8 / agents 2 / layout), `README.md`, `CHANGELOG.md` (`[1.0.0]` old→new map).

##### Verify

- `grep -qi 'gate' references/engine/artifact-contract.md && grep -qi 'worktree' references/engine/artifact-contract.md && grep -qi 'docs-core' references/engine/artifact-contract.md`
- `! grep -q 'substrate:init' README.md AGENTS.md && grep -q 'substrate:bootstrap' README.md AGENTS.md && grep -q 'substrate:audit-doctrine' README.md AGENTS.md`
- `grep -q '1.0.0' CHANGELOG.md`

#### Gate

- `bash docs/scripts/doctrine-lint.sh`
- `bash scripts/skill-literal-check.sh`
- `shellcheck bootstraps/convex-vite-clerk/scripts/*.sh scripts/*.sh docs/scripts/*.sh`
- `test -L CLAUDE.md`

### Phase 7: Agnosticism proof (Python/uv, end-to-end)

#### Step 7.1: Create the Python/uv fixture

Build `test/agnostic-proof/py-uv/`: `pyproject.toml` (ruff + mypy config), a domain module + a passing unit test, and `substrate.yaml` with `gate: {compile: "uv run mypy .", test: "uv run pytest -q", lint: "uv run ruff check ."}`. Add a one-feature mini-spec under `docs/tasks/ongoing/` inside the fixture. No stack literal, no bootstrap.

##### Verify

- `test -f test/agnostic-proof/py-uv/substrate.yaml && test -f test/agnostic-proof/py-uv/pyproject.toml`
- `uv --version`  <!-- fail-fast if uv absent -->

#### Step 7.2: Drive the gate from `substrate.yaml` alone

From the fixture dir, resolve + run each gate via the shared reader (proving the engine reads `substrate.yaml`, not a hardcoded toolchain).

##### Verify

- `cd test/agnostic-proof/py-uv && bash "$OLDPWD/scripts/substrate-config.sh" gate test`
- `cd test/agnostic-proof/py-uv && uv run mypy . && uv run ruff check . && uv run pytest -q`

#### Gate

- `cd test/agnostic-proof/py-uv && uv run pytest -q`
- `! grep -RnE 'pnpm|convex|vite|app:test' skills/execute skills/quick-spec skills/diagnose`

### Phase 8: Integration + release gating

#### Step 8.1: Full dogfood green + sandbox scaffold + contract assertion

Run substrate's own gate end-to-end. Then `cp -R` the template/docs-core into a tmp dir (simulating a scaffold) and assert the 4-part contract + lint green there.

##### Verify

- `bash docs/scripts/doctrine-lint.sh && shellcheck scripts/*.sh docs/scripts/*.sh && bash scripts/skill-literal-check.sh`
- `! grep -RiE 'clawmote|keylark|leasing|getkeylark|twilio|android' references/docs-core`
- `t=$(mktemp -d); cp -R references/docs-core/. "$t"/ && bash "$t/docs/scripts/doctrine-lint.sh"; rc=$?; rm -rf "$t"; test $rc -eq 0`

#### Step 8.2: Deferred version bump (MAIN ONLY — do not run on a feature branch)

Only when on `main` and after `./scripts/dev-unlink.sh`: set `plugin.json#version` and `marketplace.json#metadata.version` to `1.0.0`.

##### Verify

- `test "$(git branch --show-current)" = main || echo "SKIP: not on main — version bump deferred per release workflow"`

#### Gate

- `bash docs/scripts/doctrine-lint.sh`
- `bash scripts/skill-literal-check.sh`
- `test -L CLAUDE.md`

### Phase 9: Doctrine Review (MANDATORY)

#### Step 9.1: Review implementation against the promoted doctrines

Review all work against `agents-doctrine.md` (meta) and `agents-parallel-execution-doctrine.md`. Then run `/substrate:audit-doctrine` on substrate's own core to catch semantic drift the mechanical lint can't. For each doctrine answer: Compliance (MUST/MUST NOT followed?), New Patterns, Outdated Rules, Missing Coverage. If any amendments are needed, create `docs/tasks/ongoing/agnostic-core/doctrine-amendments.md` (per the spec-template format).

##### Verify

- `test -f docs/tasks/ongoing/agnostic-core/doctrine-amendments.md && echo "Amendments documented" || echo "No amendments needed"`

#### Step 9.2: Route amendments for human review

If `doctrine-amendments.md` exists, `mkdir -p docs/tasks/ongoing/doctrine-updates` and copy it to `docs/tasks/ongoing/doctrine-updates/agnostic-core-amendments.md`.

##### Verify

- `ls docs/tasks/ongoing/doctrine-updates/ 2>/dev/null || echo "No doctrine updates pending"`

#### Gate

- `bash docs/scripts/doctrine-lint.sh`
- `bash scripts/skill-literal-check.sh`

---

## 9. Operational Checks (replaces web-app SQL queries)

### Strip + agnosticism audit (expected: no output)

```bash
grep -RiE 'clawmote|keylark|leasing|getkeylark|twilio|android' references/docs-core
grep -RnE 'pnpm|convex|vite|app:test' skills/execute skills/quick-spec skills/diagnose \
  references/docs-core/docs/doctrine/agents-parallel-execution-doctrine.md
```

### Invariant audit (expected: green / symlink intact)

```bash
bash docs/scripts/doctrine-lint.sh          # coverage · path · pointer
test -L CLAUDE.md && readlink CLAUDE.md      # == AGENTS.md
shellcheck scripts/*.sh docs/scripts/*.sh bootstraps/convex-vite-clerk/scripts/*.sh
```

---

## 10. Spec Completeness Checklist

### Semantic Completeness
- [x] All data structures fully defined (substrate.yaml schema §3.2; manifest superset §4.1)
- [x] All terms defined or linked (Gate 1/2 §3.4; artifact contract §3.5)
- [x] All state machines exhaustive (bootstrap phase router §4.6)
- [x] Nullability explicit (required vs optional keys §3.2)

### Verification Completeness
- [x] Each phase has executable verification (§8)
- [x] All invariants have audit checks (§9)
- [x] Success criteria are binary (§1.4)

### Recovery Completeness
- [x] FMEA table present (§7)
- [x] Idempotency (git mv / cp -R re-runnable; reader deterministic)
- [x] Rollback (feature branch; version bump deferred to main)

### Context Completeness
- [x] Brief linked (header)
- [x] Decision rationale captured (§1.3 R1–R7, §11)
- [x] Change log present (§11)

### Boundary Completeness
- [x] Scope table present (§2)
- [x] Auth/trust boundaries: N/A for plugin refactor; CI secret handling noted (§4.5)
- [x] External dependencies listed (`yq` optional, `shellcheck`, `python3`, `uv` for proof)

---

## 11. Change Log

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2026-07-03 | Initial spec. Orchestrator-resolved cross-artifact conflicts: **R1** manifest = `doctrine-manifest.yaml`; **R2** canonical `substrate.yaml` schema (gate/worktree-seed/toolchain-pin); **R3** `references/docs-core/` bundle as contract-part-4 source; **R4** 2-basename AGENTS.md pointer set + bootstrap appends web-doctrine links; **R5** symlink-before-skill-surface sequencing, edits target AGENTS.md; **R6** explicit-bash self-verification (no `${gate.*}` chicken-and-egg); **R7** proof fixture at `test/agnostic-proof/py-uv/`. Six specialist analyses composed (Gate-1 manifest/lint, meta-doctrine+audit, parallel-exec split, substrate.yaml+de-literalization, skill-surface+bootstrap, AGENTS.md+tbd+DAG). |
