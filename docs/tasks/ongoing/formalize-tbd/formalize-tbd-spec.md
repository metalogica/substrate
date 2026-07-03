# Formalize tbd/beads as a first-class part of substrate: Technical Specification

**Version**: 1.0.0
**Status**: Draft
**Author**: Architect (skill-level orchestration, 3 specialists)
**Date**: 2026-07-03
**Brief**: `docs/tasks/ongoing/formalize-tbd/formalize-tbd-brief.md`

> **Meta-note.** This spec modifies the **substrate plugin repo itself**. Relevant doctrines are the
> ones in `references/docs-core/docs/doctrine/` (`agents` meta-doctrine, `agents-parallel-execution`
> — the hard tbd consumer). Every Verify/Gate below is explicit stack-agnostic bash
> (`test`/`grep`/`bash doctrine-lint.sh`/`python3 -c 'ast.parse'`/`shellcheck`) — not `${gate.*}` tokens.
> Live-tbd checks **degrade gracefully** when `tbd`/`get-tbd` is absent (they're present in the
> authoring env: tbd 0.1.26).

---

## 1. Overview

### 1.1 Objective

Close the asymmetry where `agents-parallel-execution-doctrine.md` hard-depends on tbd but nothing
provisions it. Make tbd a **formally provisioned and governed** part of substrate: a prerequisite
tier, a real provisioning step in `/substrate:adopt` and `/substrate:init` (via a shared
stack-agnostic helper), a dedicated `tbd-doctrine.md`, the promoted `tbd-graph.py` bead-DAG viz, a
hard-dependency declaration in the parallel-exec doctrine, and a contract note — under a
**default-provision-everywhere, hard-required-only-for-fan-out** stance.

### 1.2 Constraints (inherited from brief)

- MUST: tbd prerequisite tier (detect callable tbd; offer `npm i -g get-tbd`).
- MUST: provision in **both** `adopt` and `init` — ask prefix (never guess), `tbd init --prefix` + `tbd setup --auto`, stage `.tbd/`, never gitignore `.tbd/workspaces/`.
- MUST: ship `tbd-doctrine.md` (registered + AGENTS.md pointer, lint green) and `tbd-graph.py` in docs-core.
- MUST: parallel-exec doctrine declares tbd a hard dependency for fan-out (no markdown fallback) + cross-links `tbd-doctrine.md`.
- MUST: preserve substrate's own `sub` prefix + `.tbd/`; per-repo prefix asked.
- MUST: keep the tbd provisioning path stack-agnostic (no `pnpm`/`convex`/`vite`).
- MUST NOT: abstract tbd behind a generic tracker interface; make tbd a universal hard-fail.

### 1.3 Orchestrator-Resolved Decisions (see §11)

Brief-locked: default-provision + hard-for-fan-out; per-repo prefix asked (`sub` reserved); standalone `tbd-doctrine.md` (id `tbd`); provision in both skills; ship `tbd-graph.py`.
Q&A-resolved: **prereq = warn + offer install** (degrade, don't block); **adopt tbd step skippable** via `--no-tbd` + loud note; **`.tbd/` = contract-optional, fan-out-required**.
Mediations **M1–M7** (see §11 Change Log).

### 1.4 Success Criteria (binary)

1. `bash scripts/prerequisites.sh` exits 0 with tbd absent and prints a tbd tier line; `grep 'npx --no-install get-tbd --version' scripts/prerequisites.sh` matches.
2. `scripts/provision-tbd.sh dry` in a throwaway git repo (tbd present) → `.tbd/config.yml` with `id_prefix: dry`, `.tbd/` staged, `git check-ignore .tbd/workspaces` reports **not** ignored; a second run reports "already provisioned" (idempotent).
3. `bash references/docs-core/docs/scripts/doctrine-lint.sh` → `3 doctrines registered, all paths + pointers resolve`.
4. `grep -F tbd-doctrine.md references/docs-core/AGENTS.md` and the parallel-exec doctrine both match; parallel-exec contains `no markdown fallback for DAG orchestration`.
5. `python3 -c 'import ast; ast.parse(...)'` clean on the promoted `tbd-graph.py`; keylark-leak grep clean; emits a ```` ```mermaid ```` fence when tbd present.
6. `skills/adopt/SKILL.md` documents `--no-tbd`, calls `provision-tbd.sh`, asks the prefix, and prints a loud "fan-out will NOT work" note on skip; `skills/init/SKILL.md` calls the helper.
7. The tbd artifact-contract clause is landed (in `artifact-contract.md` if present, else folded into the agnostic-core spec §3.5).
8. `shellcheck` clean on `scripts/prerequisites.sh` + `scripts/provision-tbd.sh`.

---

## 2. Scope

| In Scope | Out of Scope |
|----------|--------------|
| tbd prereq tier; `provision-tbd.sh`; adopt+init provisioning steps | Tracker-agnosticism / a generic tracker abstraction |
| `tbd-doctrine.md`; parallel-exec hard-dep edit; manifest+pointer | Replacing/forking tbd; a second tracker |
| Promote `tbd-graph.py`; artifact-contract clause | The ADR construct (separate) |
| Reconcile AGENTS.md weave command form (M2) | Executing the agnostic-core spec (only a conditional clause edit) |

---

## 3. Architecture

### 3.1 The graceful-degradation contract (the spine)

Whether a workflow may *assume* tbd is a fixed, per-workflow decision:

| Workflow | tbd stance | On absence |
|---|---|---|
| Parallel bead fan-out (`agents-parallel-execution-doctrine.md`) | **REQUIRED** | **Abort** — no markdown fallback for DAG orchestration |
| `/substrate:synthesize-session` | TOLERATED | Degrade to markdown beads |
| `/substrate:init`, `/substrate:adopt` (provisioning) | PROVISIONS | Warn + offer install; may defer to "documented, run later" |
| All other skills | TOLERATED | Proceed without tbd |

**Canonical detection probe (M1):** `command -v tbd >/dev/null 2>&1 || npx --no-install get-tbd --version >/dev/null 2>&1`. Owned by `tbd-doctrine.md` §6; every other site cross-links, never re-derives.

### 3.2 Provisioning topology (M2, M3)

One shared **`scripts/provision-tbd.sh`** (pure tbd + git, no stack literals) is the single tbd path, called as a SKILL step by both `adopt` (Step 7.5) and `init` (Step 5.5). Canonical command form is **split**: `tbd init --prefix=<asked>` then `tbd setup --auto` (matches tbd 0.1.26; the AGENTS.md weave's combined form is reconciled). The helper is idempotent (skips if `.tbd/config.yml` exists), asserts the workspaces guard, and stages `.tbd/`. Kept out of `scaffold.sh` so the tbd path stays stack-agnostic and survives the future `bootstraps/` split.

### 3.3 Doctrine + contract placement (M4, M5, M6)

`tbd-doctrine.md` (id `tbd`, cross-cutting) ships in the docs-core bundle, registered in the manifest, pointered from AGENTS.md, cross-linking the parallel-exec + meta doctrines and the graph tool. It **links, never duplicates** (meta §2.2/§8): AGENTS.md owns the command tables, parallel-exec owns single-writer/batch-sync mechanics. `tbd-graph.py` is promoted **before** the doctrine (so its §10 pointer resolves) and rides the docs-core `cp -R` into every adopted/init'd repo. The initialized `.tbd/` is a **contract-optional** provisioning note on artifact-contract part (4), not a 5th mandatory part — landed as a conditional amendment (M5).

---

## 4. Implementation Details

### 4.1 Prerequisite tier (`scripts/prerequisites.sh`)

Add `HINT_TBD="npm i -g get-tbd"` to both OS branches. After the `gh` block (before the summary), a warn-only tier mirroring `gh`: `pass "tbd" <version>` if `command -v tbd`; `pass "tbd" "via npx get-tbd"` if `npx --no-install get-tbd --version`; else `warn "tbd" "not installed — ${HINT_TBD} (needed for parallel bead fan-out)"`. `warn()` increments `WARN` not `FAIL`, so absence keeps exit 0. Update the header comment + `init/SKILL.md` step-2b prose (`…/npx/gh/tbd`).

### 4.2 Shared helper (`scripts/provision-tbd.sh`)

`set -euo pipefail`; arg `$1` = prefix (`${1:?...}` — aborts if empty, enforcing "asked, never guessed"). `git init` if not a repo (init flow). Idempotency: if `.tbd/config.yml` exists, print existing prefix + exit 0. Resolve `TBD` = `tbd` or `npx --no-install get-tbd`. Run `$TBD init --prefix="$PREFIX"` then `$TBD setup --auto`. Workspaces guard (M7): if `git check-ignore -q .tbd/workspaces`, append `!.tbd/workspaces/` to root `.gitignore` and re-assert (FATAL if still shadowed). `git add .tbd/`. No `pnpm`/`convex`/`vite`. `shellcheck`-clean.

### 4.3 adopt provisioning (`skills/adopt/SKILL.md`)

New **Step 7.5** (after verify-green, before handoff): skip if `--no-tbd` or `.tbd/config.yml` exists (report existing prefix); else confirm intent, run the detection probe (missing → warn + offer install; decline → **degrade**, loud handoff note, never block), **ask the prefix** (no default), call `bash "$SUBSTRATE_ROOT/scripts/provision-tbd.sh" "<prefix>"`, verify + `git add .tbd/`. Step 8 handoff gains a three-way status line (provisioned / skipped / degraded — the skip/degrade variants print the loud "parallel fan-out will NOT work until `tbd init --prefix=<name>`" note). REFUSE table gains the `.tbd/config.yml`-exists row; Arguments documents `--no-tbd`; Constraints gain the ask-prefix / never-auto-install / don't-block / workspaces-guard / no-double-init rules.

### 4.4 init provisioning (`skills/init/SKILL.md`)

New **Step 5.5** (after `scaffold.sh` green, before prompt-fill): same helper call; ask the prefix (do **not** silently reuse the init slug); missing binary → warn + offer + degrade. Fold the tbd status line into the Step 8 handoff. `scaffold.sh` stays untouched by tbd.

### 4.5 tbd-doctrine.md

Ship `references/docs-core/docs/doctrine/tbd-doctrine.md` per the specialist design: H1 `# tbd — the bead tracker substrate runs on (DOCTRINE)` + preload blockquote; §0 scope, §1 operator stance (cross-link AGENTS.md), §2 prefix convention (asked/never-guessed, `sub` reserved), §3 `.tbd/` layout (+ never-gitignore-workspaces), §4 sync model (`tbd-sync`/`origin`, `auto_sync: off`, batch — cross-link parallel-exec Policy 3), §5 single-writer (cross-link Policy 1), §6 the degradation contract table + canonical probe, §7 provisioning contract (what the skills must do), §8 invariants, §9 anti-patterns, §10 pointers (incl. a "Bead-DAG visualization" line: `python3 docs/scripts/tbd-graph.py`). No status/TODOs (meta §8). Manifest entry (id `tbd`, `pointers: [AGENTS.md]`, triggers, cross-cutting) appended; AGENTS.md `## Doctrine` list gains a bullet containing the literal `docs/doctrine/tbd-doctrine.md`.

### 4.6 parallel-exec doctrine edit

Blockquote gains a **Hard prerequisite: `tbd`** line (the probe + "no markdown fallback for DAG orchestration" + cross-link `tbd-doctrine.md`); Policy 1 gains a one-sentence cross-link that fan-out *requires* provisioned tbd. Add a "Visualizing the wave" pointer to `python3 docs/scripts/tbd-graph.py`.

### 4.7 tbd-graph.py promotion

Copy `keylark/scripts/tbd-graph.py` → `references/docs-core/docs/scripts/tbd-graph.py` (already agnostic — zero keylark literals; only rewrite the docstring usage path `scripts/` → `docs/scripts/`), `chmod +x`. Dogfood copy → substrate's own `docs/scripts/tbd-graph.py` (`mkdir -p`). Rides the docs-core `cp -R` into every target repo.

### 4.8 Artifact-contract clause (conditional)

If `references/engine/artifact-contract.md` exists, append the "Provisioned-by-default tracker (`.tbd/`)" clause to its §3.5; else fold the same clause into `docs/tasks/ongoing/agnostic-core/agnostic-core-spec.md` §3.5. Clause states: provisioned by default, `.tbd/workspaces/` never gitignored, **contract-optional** (engine MUST NOT fail on absence), fan-out-required, links `tbd-doctrine.md`. Also mark agnostic-core Step 4.3 (tbd-graph) as verify-only (M4).

---

## 5. Error Handling

| Error | Cause | Handling |
|-------|-------|----------|
| tbd binary missing at provision | not installed | warn + offer `npm i -g get-tbd`; decline → degrade (skip init, loud note), never block |
| empty prefix | caller didn't ask | helper `${1:?}` aborts; SKILL asks with no default |
| `.tbd/workspaces/` gitignored | root `.gitignore` shadows tbd's `!workspaces/` | append `!.tbd/workspaces/`, re-assert, FATAL if still shadowed |
| re-provision on existing `.tbd/` | re-run / adopting substrate itself | helper early-exits with existing prefix; no double-init |
| tbd needs git, none present | init before `git init` | helper runs `git init` |
| graph smoke in tbd-less CI | env lacks tbd | Verify guards with the probe → SKIP; AST+grep are the hard gates |

---

## 6. Testing Strategy

| Focus | Command (stack-agnostic) |
|-------|--------------------------|
| Prereq exits 0 without tbd | `bash scripts/prerequisites.sh; echo $?` |
| Helper syntax + stack-agnostic | `bash -n scripts/provision-tbd.sh` · `! grep -Eq 'pnpm\|convex\|vite' scripts/provision-tbd.sh` |
| Shell hygiene | `shellcheck scripts/prerequisites.sh scripts/provision-tbd.sh` |
| 3-doctrine lint green | `bash references/docs-core/docs/scripts/doctrine-lint.sh` |
| Pointer + hard-dep strings | `grep -F tbd-doctrine.md …AGENTS.md …parallel-execution-doctrine.md` |
| Graph valid + clean | `python3 -c 'import ast; ast.parse(...)'` · keylark grep · mermaid fence |
| Live provisioning (degrades) | throwaway repo dry-run, guarded by the detection probe |

---

## 7. Failure Modes (FMEA)

| # | Failure Mode | Severity | Mitigation |
|---|--------------|----------|------------|
| 1 | Missing tbd blocks adopt/init | High | warn + offer + **degrade**; never block; fail-fast only on explicit fan-out setup |
| 2 | Prefix-guessing regression | High | asked with no default; helper `${1:?}` hard-stops; Constraint + AGENTS.md rule cited |
| 3 | `.tbd/workspaces/` gitignored → silent bead loss | Critical | `git check-ignore` guard + `!.tbd/workspaces/` fix; templates ship no `.tbd` rule |
| 4 | Double-init on existing `.tbd/` | Medium | helper + REFUSE row early-exit; substrate's `sub` preserved |
| 5 | doctrine-lint red (pointer/coverage) | High | AGENTS.md bullet has literal basename; `id: tbd` ↔ `tbd-doctrine.md`; inline pointers |
| 6 | Duplication drift (doctrine copies AGENTS.md/parallel-exec) | Medium | doctrine cross-links, ships only net-new facts (the §6 table) |
| 7 | tbd-graph double-ship with agnostic-core | Medium | this spec authoritative; agnostic-core Step 4.3 → verify-only; idempotent overwrite |
| 8 | Contract clause misread as mandatory → engine hard-fails beadless repos | High | clause explicitly "MUST NOT fail on absence"; note on part (4), not part (5) |
| 9 | AGENTS.md weave vs helper command-form contradiction | Low | M2: reconcile weave to the split form; helper canonical |

---

## 8. Prompt Execution Strategy

<!-- PROTOCOL: docs/protocol/sdd/execution-format.md · run from substrate repo root. Explicit bash. -->

### Phase 1: Prerequisite tbd tier

#### Step 1.1: Add the warn-only tbd tier to `scripts/prerequisites.sh`

Add `HINT_TBD="npm i -g get-tbd"` to both OS branches; add the tbd tier after the `gh` block (§4.1); update the header comment and `init/SKILL.md` step-2b prose.

##### Verify

- `bash scripts/prerequisites.sh >/dev/null; test $? -eq 0`
- `bash scripts/prerequisites.sh | grep -Eiq 'tbd'`
- `grep -q 'npx --no-install get-tbd --version' scripts/prerequisites.sh`
- `grep -q 'HINT_TBD' scripts/prerequisites.sh`

#### Gate

- `shellcheck scripts/prerequisites.sh`

### Phase 2: Shared stack-agnostic helper

#### Step 2.1: Create `scripts/provision-tbd.sh`

Author per §4.2; `chmod +x`.

##### Verify

- `bash -n scripts/provision-tbd.sh`
- `grep -q 'tbd init --prefix=' scripts/provision-tbd.sh && grep -q 'setup --auto' scripts/provision-tbd.sh`
- `grep -q 'git check-ignore -q .tbd/workspaces' scripts/provision-tbd.sh`
- `grep -q 'config.yml' scripts/provision-tbd.sh`
- `! grep -Eq 'pnpm|convex|vite' scripts/provision-tbd.sh`

#### Gate

- `shellcheck scripts/provision-tbd.sh`

### Phase 3: Promote `tbd-graph.py` (before the doctrine — M6)

#### Step 3.1: Promote into docs-core + dogfood copy

Copy `keylark/scripts/tbd-graph.py` → `references/docs-core/docs/scripts/tbd-graph.py`; rewrite docstring usage path `scripts/`→`docs/scripts/`; `chmod +x`. `mkdir -p docs/scripts` and copy to substrate's own `docs/scripts/tbd-graph.py`.

##### Verify

- `python3 -c "import ast; ast.parse(open('references/docs-core/docs/scripts/tbd-graph.py').read())"`
- `! grep -niE 'clawmote|keylark|leasing|soulbound|clawcraft' references/docs-core/docs/scripts/tbd-graph.py`
- `grep -q '```mermaid' references/docs-core/docs/scripts/tbd-graph.py`
- `test -x references/docs-core/docs/scripts/tbd-graph.py && test -f docs/scripts/tbd-graph.py`

#### Gate

- `python3 -c "import ast; ast.parse(open('docs/scripts/tbd-graph.py').read())"`

### Phase 4: `tbd-doctrine.md` + register + parallel-exec hard-dep

#### Step 4.1: Author `tbd-doctrine.md`

Write `references/docs-core/docs/doctrine/tbd-doctrine.md` per §4.5 (incl. the §10 `tbd-graph.py` pointer, valid now that Phase 3 shipped it).

##### Verify

- `test -f references/docs-core/docs/doctrine/tbd-doctrine.md && head -1 references/docs-core/docs/doctrine/tbd-doctrine.md | grep -qF '(DOCTRINE)'`
- `! grep -niE 'keylark|TODO|FIXME|status:' references/docs-core/docs/doctrine/tbd-doctrine.md`

#### Step 4.2: Register in the manifest + AGENTS.md pointer

Append the `id: tbd` block to `references/docs-core/docs/doctrine/doctrine-manifest.yaml`; add the AGENTS.md `## Doctrine` bullet containing `docs/doctrine/tbd-doctrine.md`.

##### Verify

- `grep -qF 'id: tbd' references/docs-core/docs/doctrine/doctrine-manifest.yaml`
- `grep -qF 'docs/doctrine/tbd-doctrine.md' references/docs-core/AGENTS.md`

#### Step 4.3: Declare the hard dependency in parallel-exec + reconcile the AGENTS.md weave (M2)

Apply §4.6 edits to `agents-parallel-execution-doctrine.md`; reconcile the AGENTS.md tbd-weave install block so it does not contradict the split `tbd init --prefix` + `tbd setup --auto` form.

##### Verify

- `grep -qF 'no markdown fallback for DAG orchestration' references/docs-core/docs/doctrine/agents-parallel-execution-doctrine.md`
- `grep -qF 'tbd-doctrine.md' references/docs-core/docs/doctrine/agents-parallel-execution-doctrine.md`
- `grep -qF 'tbd init --prefix' references/docs-core/AGENTS.md`

#### Gate

- `bash references/docs-core/docs/scripts/doctrine-lint.sh`  <!-- expect: 3 doctrines registered, all paths + pointers resolve -->

### Phase 5: Weave provisioning into adopt + init

#### Step 5.1: adopt Step 7.5 + `--no-tbd` + REFUSE + Constraints + 3-way handoff

Apply §4.3.

##### Verify

- `grep -q -- '--no-tbd' skills/adopt/SKILL.md`
- `grep -q 'provision-tbd.sh' skills/adopt/SKILL.md`
- `grep -qiE 'ask.*prefix|never guess|do not guess' skills/adopt/SKILL.md`
- `grep -qiE 'fan-out will NOT work|fan-out won' skills/adopt/SKILL.md`
- `grep -qF '.tbd/config.yml already exists' skills/adopt/SKILL.md`

#### Step 5.2: init Step 5.5 + handoff line

Apply §4.4.

##### Verify

- `grep -q 'provision-tbd.sh' skills/init/SKILL.md`
- `grep -qiE 'prefix' skills/init/SKILL.md`

#### Gate

- `grep -q 'provision-tbd.sh' skills/adopt/SKILL.md skills/init/SKILL.md`

### Phase 6: Artifact-contract clause (conditional — M5)

#### Step 6.1: Land the tbd clause

If `references/engine/artifact-contract.md` exists, append the §4.8 clause to its §3.5; else fold it into `docs/tasks/ongoing/agnostic-core/agnostic-core-spec.md` §3.5. Add a one-line "tbd-graph.py promoted by formalize-tbd; verify-only here" note to agnostic-core Step 4.3.

##### Verify

- `T=$([ -f references/engine/artifact-contract.md ] && echo references/engine/artifact-contract.md || echo docs/tasks/ongoing/agnostic-core/agnostic-core-spec.md); grep -q 'contract-optional' "$T" && grep -qiE 'never.*gitignore' "$T" && grep -qF 'tbd-doctrine.md' "$T"`

### Phase 7: Integration dry-run + full green

#### Step 7.1: Throwaway-repo provisioning dry-run (degrades if tbd absent)

In a `mktemp` git repo: if the detection probe passes, run `provision-tbd.sh dry` and assert `.tbd/config.yml` (`id_prefix: dry`), `.tbd/` staged, `git check-ignore .tbd/workspaces` **not** ignored, and a second run reports "already provisioned"; else assert `bash -n` + SKILL wiring only.

##### Verify

- `T=$(mktemp -d); ( cd "$T" && git init -q && if command -v tbd >/dev/null 2>&1 || npx --no-install get-tbd --version >/dev/null 2>&1; then bash "$OLDPWD/scripts/provision-tbd.sh" dry && test -f .tbd/config.yml && grep -q 'id_prefix: dry' .tbd/config.yml && ! git check-ignore -q .tbd/workspaces && bash "$OLDPWD/scripts/provision-tbd.sh" dry | grep -qi 'already provisioned'; else bash -n "$OLDPWD/scripts/provision-tbd.sh"; fi ); rc=$?; rm -rf "$T"; test $rc -eq 0`
- `grep -q -- '--no-tbd' skills/adopt/SKILL.md`

#### Step 7.2: Full green

##### Verify

- `shellcheck scripts/prerequisites.sh scripts/provision-tbd.sh`
- `bash references/docs-core/docs/scripts/doctrine-lint.sh`
- `! grep -RiE 'clawmote|keylark|leasing|getkeylark|twilio|android' references/docs-core/docs/doctrine/tbd-doctrine.md references/docs-core/docs/scripts/tbd-graph.py`

#### Gate

- `bash references/docs-core/docs/scripts/doctrine-lint.sh`
- `shellcheck scripts/prerequisites.sh scripts/provision-tbd.sh`

### Phase 8: Doctrine Review (MANDATORY)

#### Step 8.1: Review against the meta + parallel-exec doctrines

Confirm `tbd-doctrine.md` obeys the meta-doctrine (durable facts, no status/TODOs, link-don't-duplicate, `<id>-doctrine.md` naming) and that the parallel-exec hard-dep edit is faithful. Run `bash references/docs-core/docs/scripts/doctrine-lint.sh`. Optionally run `/substrate:audit-doctrine` once it exists. If amendments are needed, write `docs/tasks/ongoing/formalize-tbd/doctrine-amendments.md`.

##### Verify

- `test -f docs/tasks/ongoing/formalize-tbd/doctrine-amendments.md && echo "amendments documented" || echo "no amendments needed"`

#### Gate

- `bash references/docs-core/docs/scripts/doctrine-lint.sh`

---

## 9. Operational Checks

```bash
# Provisioning invariants (expected: green)
bash scripts/prerequisites.sh; echo "exit=$?"                    # 0 even without tbd
bash references/docs-core/docs/scripts/doctrine-lint.sh          # 3 doctrines
shellcheck scripts/prerequisites.sh scripts/provision-tbd.sh
# Agnosticism (expected: no output)
grep -Eq 'pnpm|convex|vite' scripts/provision-tbd.sh && echo LEAK || echo clean
```

---

## 10. Spec Completeness Checklist

- [x] Data structures defined (`.tbd/config.yml` shape §3.2/§4.2; degradation table §3.1)
- [x] Terms defined/linked (probe M1; command form M2; contract placement M5)
- [x] Each phase has executable verification (§8)
- [x] Success criteria binary (§1.4)
- [x] FMEA present (§7); idempotent (helper double-init guard); rollback = feature branch
- [x] Brief linked; decisions captured (§1.3, §11); change log present
- [x] Scope table (§2); external deps listed (tbd/get-tbd, python3, shellcheck)
- [x] Mandatory Doctrine Review phase (Phase 8)

---

## 11. Change Log

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2026-07-03 | Initial spec. Q&A: prereq=warn+offer; adopt tbd-step skippable (`--no-tbd`); `.tbd/`=contract-optional/fan-out-required. Mediations: **M1** canonical detection probe (owned by tbd-doctrine §6); **M2** split `tbd init --prefix` + `tbd setup --auto` canonical, reconcile AGENTS.md weave; **M3** shared `scripts/provision-tbd.sh` (not in scaffold.sh); **M4** this spec authoritative for `tbd-graph.py`, agnostic-core Step 4.3 → verify-only, dogfood to `docs/scripts/`; **M5** contract clause conditional-amendment, tbd = note on part (4) not a mandatory part; **M6** graph before doctrine; **M7** workspaces guard via `git check-ignore`. Composed from 3 specialists (tbd-doctrine+parallel-exec, provisioning, artifact-contract+graph). |

---

## 12. Appendix — session-captured artifacts (for a cold executor)

> This spec is executed in a **fresh session** with none of this conversation's context. The state
> and verbatim artifacts below are the session-specific knowledge a cold executor needs. Prefer
> these verbatim over re-deriving — they are the exact designs the specialists produced.

### 12.0 Repo state + execution context (read first)

- **`/substrate:adopt` already shipped and is on `main`.** `references/docs-core/` exists with **2**
  registered doctrines (`agents-doctrine.md`, `agents-parallel-execution-doctrine.md`),
  `doctrine-lint.sh`, `AGENTS.md` (+`CLAUDE.md` symlink), `doctrine-manifest.yaml`, `substrate.yaml`,
  `docs/protocol/sdd/`, `.hooks/pre-commit`, CI. This spec **adds a 3rd doctrine** (`tbd`) to that bundle.
- **keylark source** (for `tbd-graph.py`) is at **`/Users/reinova/code/soulbound-labs/keylark`** —
  `keylark/scripts/tbd-graph.py`. It is already agnostic (zero keylark literals).
- **`tbd` 0.1.26 is installed** in this environment (global). `command -v tbd` succeeds — so the
  live provisioning + graph-smoke Verify blocks run rather than degrade.
- **Meta-repo:** this is the substrate **plugin** repo, not a scaffolded app. `doctrine-lint.sh`
  self-locates to `references/docs-core/` when run from there (`ROOT=dirname/../..`).
- **Execution order:** run **this spec before the agnostic-core spec** (`docs/tasks/ongoing/agnostic-core/`).
  This spec is authoritative for `tbd-graph.py` and the tbd contract clause (M4/M5); agnostic-core's
  Step 4.3 becomes verify-only afterward.
- **Branch:** consider `git checkout -b formalize-tbd` before executing (you're likely on `main`).

### 12.A `scripts/provision-tbd.sh` (verbatim — shellcheck-clean, array form)

```bash
#!/usr/bin/env bash
# Stack-agnostic tbd/beads provisioning. Called by /substrate:adopt and
# /substrate:init AFTER the prefix is ASKED (never guessed). No pnpm/convex/
# vite here — pure tbd + git.
#
# Arg $1 — bead ID prefix (2-8 alphabetic chars). REQUIRED; caller asks the user.
set -euo pipefail

PREFIX="${1:?bead prefix required — ask the user, never guess}"

# tbd is git-native; the init flow may not have run `git init` yet.
git rev-parse --is-inside-work-tree >/dev/null 2>&1 || git init >/dev/null

# Idempotency: never double-init.
if [ -f .tbd/config.yml ]; then
  echo "tbd already provisioned (prefix $(grep -m1 id_prefix .tbd/config.yml | awk '{print $NF}')); skipping init."
  exit 0
fi

# Resolve a callable tbd (global binary OR npx get-tbd). Array form keeps shellcheck clean.
if command -v tbd >/dev/null 2>&1; then TBD=(tbd)
elif npx --no-install get-tbd --version >/dev/null 2>&1; then TBD=(npx --no-install get-tbd)
else
  echo "ERROR: no callable tbd (install: npm i -g get-tbd)" >&2; exit 1
fi

"${TBD[@]}" init --prefix="$PREFIX"
"${TBD[@]}" setup --auto

# Guard: tbd ships .tbd/.gitignore with `!workspaces/`. Fail only if a root .gitignore
# shadows it — the outbox MUST be committable (docs-core/AGENTS.md note).
if git check-ignore -q .tbd/workspaces; then
  echo "!.tbd/workspaces/" >> .gitignore
  git check-ignore -q .tbd/workspaces && { echo "FATAL: .tbd/workspaces still gitignored" >&2; exit 1; }
fi

git add .tbd/
echo "✔ tbd provisioned — prefix '$PREFIX', .tbd/ staged, workspaces tracked."
```

### 12.B `references/docs-core/docs/doctrine/tbd-doctrine.md` (verbatim content to ship)

```markdown
# tbd — the bead tracker substrate runs on (DOCTRINE)

> **The single source for how this repo provisions, governs, and operates `tbd` (beads).**
> Load this before: provisioning a repo (`/substrate:init`, `/substrate:adopt`), running a
> parallel bead fan-out, or debugging a `.tbd/` / sync problem. tbd is **default-provisioned
> everywhere and HARD-required for parallel fan-out** (see
> `agents-parallel-execution-doctrine.md`); every other workflow tolerates its absence.
> Operational command tables live in the root `AGENTS.md` tbd weave — this doctrine is the
> durable *why* + the invariants, not a command reference.

## 0. Scope — what this binds
tbd is substrate's concrete bead tracker (git-native issue tracking). This doctrine governs
its provisioning, its on-disk contract, and the single rule that decides which workflows may
assume it. It does **not** re-teach the tbd CLI — that is the root `AGENTS.md` tbd weave.
tbd is the concrete tracker, not an abstract "tracker interface"; there is no fallback tracker.

## 1. Operator stance — you run tbd, the user doesn't
The agent is the tbd operator: translate a user's natural request into tbd actions; never
instruct the user to run `tbd`. Canonical statement + the User-Says→Agent-Runs table live in
`AGENTS.md` (the auto-injected root context) — this section only fixes the *principle* so the
doctrine is self-contained; see `AGENTS.md` for the command surface.

## 2. The prefix convention
Every repo's beads carry a short `id_prefix` (`display.id_prefix` in `.tbd/config.yml`).
- **Asked at provision, never guessed.** The provisioning step MUST prompt the user for the
  prefix (2–8 alphabetic chars); guessing is forbidden (mirrors the AGENTS.md `--prefix` rule).
- **Set once, stable forever.** The prefix is identity for every bead id; renaming it orphans
  history. Substrate's own repo is `sub` and stays `sub`.

## 3. `.tbd/` layout + the never-gitignore rule
`tbd init`/`tbd setup --auto` create `.tbd/`. Durable facts:
- `.tbd/config.yml` — prefix, sync branch/remote, settings. Committed on the working branch.
- `.tbd/workspaces/` — the per-agent **outbox**. **NEVER gitignore `.tbd/workspaces/`** — it
  must be committed to the working branch or sync silently loses beads. (See
  `tbd guidelines tbd-sync-troubleshooting`.)
- Bead data itself lives on the dedicated `sync.branch`, not on the working tree.

## 4. Sync model — batched, never automatic
- `sync.branch: tbd-sync`, `sync.remote: origin` — a dedicated git-backed data branch.
- **`settings.auto_sync: off`.** Sync is an explicit, orchestrator-only action, never a
  mid-flight side effect. The *why* and the fan-out timing (exactly one `tbd sync` at epic
  close) are owned by `agents-parallel-execution-doctrine.md` Policy 3 — cross-link, not copy.

## 5. Single-writer rule
Under any multi-agent run, exactly one actor (the orchestrator) writes tbd or pushes git;
subagents get their bead inlined and touch neither. N writers on one git-backed branch race
and corrupt it. Full mechanics: `agents-parallel-execution-doctrine.md` Policy 1 + Roles.

## 6. The graceful-degradation contract
Whether a workflow may *assume* tbd is a fixed, per-workflow decision — not ad hoc:

| Workflow | tbd stance | On absence | Why |
|---|---|---|---|
| Parallel bead fan-out (`agents-parallel-execution-doctrine.md`) | **REQUIRED** | **Abort with explanation** — no markdown fallback | The DAG orchestration (`tbd ready`/`show`, single-writer `update`/`close`/`sync`) *is* tbd; there is no degraded mode |
| `/substrate:synthesize-session` | **TOLERATED** | Degrade to markdown beads | Session capture predates provisioning; must still run on un-provisioned repos |
| `/substrate:init`, `/substrate:adopt` (provisioning) | **PROVISIONS** | Warn + offer `npm i -g get-tbd`; may defer to "documented, run later" | These *install* tbd; they can't require what they set up |
| All other skills | TOLERATED | Proceed without tbd | Default-provisioned, not hard-required |

**Detection probe (canonical).** A workflow tests for a callable tbd with:
`command -v tbd >/dev/null 2>&1 || npx --no-install get-tbd --version >/dev/null 2>&1`
— global install first, then a no-install npx probe. REQUIRED workflows abort on a false
result; TOLERATED workflows branch to their degraded path.

## 7. Provisioning (owned by the skills — the contract this doctrine assumes)
Provisioning skills MUST: prompt for the prefix (§2), run `tbd init --prefix=<p>` +
`tbd setup --auto`, stage `.tbd/`, and NOT gitignore `.tbd/workspaces/`. The prerequisite
tier detects a callable tbd via the §6 probe and offers `npm i -g get-tbd`. An initialized
`.tbd/` is **contract-optional but doctrine-required-for-fan-out**: a repo satisfies the
artifact contract without beads, but cannot fan out without them.

## 8. Invariants
1. Prefix is asked, never guessed; stable for the repo's life.
2. `.tbd/workspaces/` is never gitignored.
3. `auto_sync` stays off; sync is explicit and single-writer.
4. Fan-out requires tbd; no markdown fallback for DAG orchestration.

## 9. Anti-patterns
- Guessing a prefix instead of asking.
- Gitignoring `.tbd/workspaces/` (silent bead loss).
- Turning on `auto_sync` or syncing from a worktree mid-run.
- Telling the user to run `tbd` commands (breaks the operator stance).
- Making tbd a universal hard-fail — only fan-out is hard-required.

## 10. Pointers
- `AGENTS.md` — the tbd operator stance + full command tables.
- `agents-parallel-execution-doctrine.md` — the hard consumer (single-writer, batch-sync).
- `docs/scripts/tbd-graph.py` — bead-DAG → Mermaid renderer. Run `python3 docs/scripts/tbd-graph.py`
  (`--all` includes closed beads); paste the emitted ```` ```mermaid ```` block into any Mermaid renderer.
- `.tbd/config.yml` — this repo's prefix + sync configuration.
```

### 12.C Exact edit strings (Verify greps pin these)

**Manifest entry** (append to `references/docs-core/docs/doctrine/doctrine-manifest.yaml`, 2-space indent, inline pointers):
```yaml
  - id: tbd
    path: docs/doctrine/tbd-doctrine.md
    pointers: [AGENTS.md]
    summary: How substrate provisions and governs the tbd bead tracker — prefix convention, .tbd/ layout, sync model, single-writer rule, operator stance, and the graceful-degradation contract (which workflows require tbd vs tolerate its absence).
    triggers: [tbd, bead, beads, tracker, prefix, sync, fan-out]
    layer-hint: cross-cutting
```

**AGENTS.md doctrine bullet** (add to the `## Doctrine` list in `references/docs-core/AGENTS.md`, before the `<!-- BEGIN TBD INTEGRATION -->` weave — the literal path satisfies the lint pointer check):
```markdown
- `docs/doctrine/tbd-doctrine.md` — **the tbd bead tracker doctrine**: prefix convention,
  `.tbd/` layout (never gitignore `.tbd/workspaces/`), batched sync, the single-writer rule,
  the operator stance, and the graceful-degradation contract. Read before provisioning a repo
  or running a parallel bead fan-out.
```

**parallel-exec doctrine — blockquote hard-prereq** (append to the preload blockquote of `agents-parallel-execution-doctrine.md`):
```markdown
> **Hard prerequisite: `tbd`.** This orchestration *is* tbd (`tbd ready`/`show`/`update`/
> `close`/`sync`); there is **no markdown fallback for DAG orchestration**. If tbd is not
> callable (`command -v tbd || npx --no-install get-tbd --version`), abort — do not degrade.
> See `tbd-doctrine.md` for provisioning + the graceful-degradation contract.
```
**parallel-exec — Policy 1 cross-link sentence** (append to Policy 1):
```markdown
This whole policy presupposes a provisioned tbd (`tbd-doctrine.md`); fan-out is one of the
workflows that **requires** it, not one that tolerates its absence.
```
**parallel-exec — visualization pointer** (add near the dispatch checklist):
```markdown
Visualize the current wave/critical-path spine with `python3 docs/scripts/tbd-graph.py`. See `tbd-doctrine.md`.
```

**prerequisites.sh tbd tier** (after the `gh` block; add `HINT_TBD="npm i -g get-tbd"` to both OS branches):
```bash
# --- tbd (warn-only; REQUIRED for parallel bead fan-out) -----------
if command -v tbd >/dev/null 2>&1; then
  pass "tbd" "$(tbd --version 2>/dev/null | head -1 | awk '{print $NF}')"
elif npx --no-install get-tbd --version >/dev/null 2>&1; then
  pass "tbd" "via npx get-tbd"
else
  warn "tbd" "not installed — ${HINT_TBD}  (needed for parallel bead fan-out)"
fi
```

**Artifact-contract clause** (append to `references/engine/artifact-contract.md` §3.5 if it exists, else fold into `docs/tasks/ongoing/agnostic-core/agnostic-core-spec.md` §3.5):
```markdown
**Provisioned-by-default tracker (`.tbd/`).** A bootstrap of any stack also initializes `.tbd/`
(via `tbd init --prefix=<asked>` + `tbd setup --auto`, prefix asked never guessed) and stages it —
`.tbd/workspaces/` is **never** gitignored. This is **contract-optional, not a hard gate**: a repo
satisfies the artifact contract without an initialized `.tbd/`, and the engine's contract assertion
MUST NOT fail on its absence. It is, however, **required for parallel bead fan-out** —
`agents-parallel-execution-doctrine.md` hard-depends on tbd with no markdown fallback for DAG
orchestration. Skills that merely tolerate its absence (e.g. `synthesize-session`) continue to
degrade gracefully. See `docs/doctrine/tbd-doctrine.md`.
```

**AGENTS.md weave reconciliation (M2):** the install block in `references/docs-core/AGENTS.md`
currently shows `tbd setup --auto --prefix=<name>`. Reconcile so it does not contradict the split
canonical form — show `tbd init --prefix=<name>` then `tbd setup --auto` (the form real tbd 0.1.26 uses).
