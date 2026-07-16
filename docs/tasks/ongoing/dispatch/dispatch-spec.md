# Dispatch: Cloud-Triggered Epic Orchestration — Technical Specification

**Version**: 1.0.0
**Status**: Draft
**Author**: rei nova (hand-authored at architect-spec depth; this is a substrate *plugin* feature, not a generated-project feature — the SDD machinery targets product features in generated projects, so this spec is executed as staged plugin-contract edits, not via `/substrate:architect-spec`)
**Date**: 2026-07-15
**Brief**: none — distilled from the design conversation that produced it (see §1.4 Decision Log)

---

## 1. Overview

### 1.1 Objective

Let a substrate epic be **executed in the cloud** — a GitHub Actions runner runs `/substrate:orchestrate epic:<slug> --auto` headlessly against the repo's declared gate, pushes the integration branch per-wave, and opens a PR whose commits accumulate live wave-by-wave. Ship this as a **repository-independent port/adapter** installable by `/substrate:adopt` (the way adopt already drops `.github/workflows/doctrine-lint.yml`), fronted by a thin local door `/substrate:dispatch <epic>`.

The v1 trigger is **manual** (`workflow_dispatch`); the event-driven trigger (a `tbd-sync` watcher) is designed here but deferred to v2 — v1 is a strict prefix of it.

### 1.2 Constraints

- MUST keep the runner body **agent-framework-agnostic**: the agent invocation is a workflow input defaulting to Claude Code, overridable.
- MUST reuse the repo's **already-proven CI environment recipe** (clawcraft's `ci.yml`: Postgres service + bootstrap + install + build) rather than reinventing it.
- MUST preserve substrate's **single-writer** invariant: `/substrate:dispatch` *triggers*; only the in-runner orchestrator writes `tbd`/pushes git.
- MUST NOT let a cloud run self-retrigger (the feedback loop). v1 sidesteps this entirely by being manual; v2 must carry an explicit guard + claim-lock.
- MUST keep the OpenCode mirror in parity (binding rule) for every skill touched.
- MUST NOT bump `plugin.json#version` on this feature branch (release hygiene).

### 1.3 Success Criteria (binary)

- **SC1** — In clawcraft, clicking "Run workflow" with a small graphed epic slug produces a PR whose per-bead commits appear in wave-sized bursts, with the integrated tip green on the declared gate. *(Phase 1)*
- **SC2** — `/substrate:orchestrate <epic> --pr` produces a PR-shaped result (integration branch pushed, no trunk-squash) instead of a trunk squash-commit. *(Phase 2)*
- **SC3** — A fresh `/substrate:adopt` on a repo that answers the `ci:` questions leaves a working `substrate-orchestrate.yml` + a populated `ci:` block, doctrine-lint green. *(Phase 5)*
- **SC4** — `/substrate:dispatch <epic>` in an adopted repo publishes the epic (`tbd sync`), fires the workflow, and prints the run + PR URL; refuses on ungraphed epic or missing `ci:` block. *(Phase 6)*
- **SC5** — OpenCode parity audit is clean; CLAUDE.md + README reflect 14 skills. *(Phase 6)*

### 1.4 Decision Log (forks resolved — defaults; override any before Phase 2)

| # | Fork | Decision (v1) | Rationale |
|---|---|---|---|
| D1 | How does the runner see the epic's beads? | **fetch-tbd-sync**: local `tbd sync` publishes to the `tbd-sync` branch; runner `git fetch origin tbd-sync`. | Reuses existing graphed epics; matches the "graph locally, execute in cloud" model. `.tbd/**` on main carries no bead data (verified: 3 config files only). Alt (graph-in-cloud) deferred. |
| D2 | Who squashes to trunk? | **GitHub "Squash and merge"** button; `orchestrate --pr` **suppresses** its own trunk-squash. | One squasher. GitHub re-authors a single clean commit, absorbing the unsigned per-bead commits — no unsigned commits reach a protected branch. |
| D3 | v1 trigger | **`workflow_dispatch`** (manual). Event-driven (`on: push: [tbd-sync]` + new-epic guard + `run:<id>` claim-lock) **deferred to Phase 7 (v2)**. | Deletes the entire double-execution / feedback-loop / claim-lock problem class. Strict prefix — v2 changes only the `on:` block. |
| D4 | Seam packaging | v1 = **copied workflow template** dropped by adopt with token substitution (matches adopt's `cp -R` + `sed`). v2 = extract to a versioned substrate-owned **composite action**. | MVP simplicity; don't build a versioned action before one green run. Phase 1 output informs the extraction. |
| D5 | `ci:` contract | New **optional** `ci:` block in `substrate.yaml` (`services`, `bootstrap`, `secrets-needed`, `runner`). **Not** doctrine-lint-enforced in v1 (absence = no cloud dispatch, not an error). | Additive to the gate contract; enforcement can follow once the shape is stable. |
| D6 | Agent lock-in | Workflow input `agent-command`, default `claude -p "/substrate:orchestrate epic:<slug> --auto" --permission-mode bypassPermissions`. | Preserves the framework-agnostic property; swap one input to use another runner. |
| D7 | `dispatch` behavior | verify graphed → `tbd sync` → `gh workflow run substrate-orchestrate -f epic=<slug>` → surface run + PR URL. | Thin local door; single-writer preserved (triggers, doesn't execute). |

---

## 2. Scope

| In Scope | Out of Scope |
|----------|--------------|
| Manual (`workflow_dispatch`) cloud orchestration of a **graphed** epic | Event-driven `tbd-sync` trigger (designed in Phase 7, not built) |
| `orchestrate --pr` cloud-output mode | Any change to orchestrate's local worktree-fleet mechanics |
| `ci:` block in `substrate.yaml` + adopt installer | Auto-provisioning of secrets (adopt prints instructions; human adds them) |
| `/substrate:dispatch` local door | A live/interactive dev env or e2e in-container (out-of-band gate tier — deferred) |
| OpenCode parity mirrors, CLAUDE.md/README | Self-hosted / non-GitHub runners (design note only; `runs-on` stays the single swap point) |
| Framework-agnostic agent-command input | Migrating the runner off GitHub Actions (revisit only past the 6h cap / VPC-locality) |

---

## 3. Architecture

### 3.1 The three pieces (port / adapter)

```
PORT (substrate-owned, repo-independent)          ADAPTER (repo-specific, adopt-filled)
────────────────────────────────────────          ──────────────────────────────────────
orchestrate --pr  (cloud-output mode)              substrate.yaml  ci:  { services,
substrate-orchestrate.yml  (the seam) ◄───reads─── bootstrap, secrets-needed, runner }
  · fetch tbd-sync                                 gate.* / worktree-seed / toolchain-pin
  · install agent (agent-command input)            (already declared)
  · orchestrate --auto --pr
  · push feat/<slug> per wave + open PR
/substrate:dispatch  (local trigger door)          ANTHROPIC_API_KEY  (repo secret, manual)
```

### 3.2 State machine (v1, manual)

```
local:   graph-spec (epic + group:/blocked-by children, local tbd)
   │     tbd sync                     ── publishes beads to `tbd-sync` branch
   ▼
you:     /substrate:dispatch <epic>   ── verify graphed → gh workflow run
   ▼
runner:  checkout → fetch tbd-sync → env-setup (ci.bootstrap + services)
   │     → install agent → orchestrate --auto --pr
   │     → per wave: merge-on-green → union re-gate → push feat/<slug>
   ▼
PR:      commits burst in wave-by-wave (trunk-squash suppressed)
   ▼
you:     "Squash and merge" → one signed commit on main
```

### 3.3 `ci:` block schema (new — added to `references/docs-core/substrate.yaml`)

```yaml
# --- Cloud dispatch environment (consumed by substrate-orchestrate.yml) ---
# Optional. Absent → the repo is not cloud-dispatch-enabled (dispatch refuses).
ci:
  runner: "ubuntu-latest"          # runs-on; the single swap point for self-hosted later
  services:                        # verbatim GitHub Actions `services:` map (static — see FMEA #5)
    postgres:
      image: "postgres:16-alpine"
      env: { POSTGRES_USER: "...", POSTGRES_PASSWORD: "...", POSTGRES_DB: "..." }
      ports: ["5433:5432"]
      options: "--health-cmd ... --health-interval 2s ..."
  bootstrap:                       # ordered shell steps run after install, before orchestrate
    - "pnpm --filter @clawcraft/treasury db:init"
    - "pnpm --filter @clawcraft/treasury db:migrate"
    - "pnpm --filter @clawcraft/treasury db:seed"
  secrets-needed:                  # NAMES only (never values) — adopt prints these to add manually
    - "ANTHROPIC_API_KEY"
```

Note the honest GitHub constraint (FMEA #5): `services:` and `runs-on:` are **static job-level keys**, so a single generic workflow cannot compute them from `ci:` at runtime. v1 resolves this by **token-substituting the `services:`/`runner:` at adopt time** (D4). This is why the seam is a copied+substituted template in v1, not a runtime-generic action.

---

## 4. Implementation Details

### 4.1 `orchestrate --pr` mode (`skills/orchestrate/SKILL.md` + opencode mirror)

A new flag orthogonal to `--auto`. When set:
- **Skip** the trunk-landing step (§Step 6: `git switch trunk && merge --squash && commit -S`).
- After each wave's merge-on-green + union re-gate (Step 5e), **`git push origin feat/<epic-slug>`** so the PR updates live.
- On epic close: ensure the PR exists (`gh pr create` if absent), leave the branch pushed; **do not** squash to trunk (GitHub owns the squash, D2).
- Signing stays disabled during the run and is restored unconditionally (unchanged) — but the unsigned per-bead commits now legitimately live on the PR branch and are absorbed by GitHub's squash-merge (D2), not by an in-repo squash.

### 4.2 The seam — `substrate-orchestrate.yml` (Phase 1 hand-written in clawcraft → Phase 4 template)

Structure (env-setup blocks are token slots in the template form):

```yaml
name: substrate-orchestrate
on: { workflow_dispatch: { inputs: { epic: { required: true } } } }
concurrency: { group: orchestrate-${{ inputs.epic }}, cancel-in-progress: false }  # double-click guard
permissions: { contents: write, pull-requests: write }
jobs:
  run:
    runs-on: {{CI_RUNNER}}
    services: {{CI_SERVICES}}
    env: {{CI_ENV}}
    steps:
      - uses: actions/checkout@v4
        with: { fetch-depth: 0 }
      - run: git fetch origin tbd-sync                 # D1 — beads visible
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with: { node-version: "20", cache: pnpm }
      - run: {{TOOLCHAIN_INSTALL}}                     # substrate.yaml toolchain-pin.install
      - run: |                                          # {{CI_BOOTSTRAP}} — ci.bootstrap steps
          {{CI_BOOTSTRAP}}
      - run: npm i -g @anthropic-ai/claude-code        # + substrate plugin install (Phase 1 unknown)
      - run: {{AGENT_COMMAND}}                          # D6 default: claude -p "/substrate:orchestrate epic:${{ inputs.epic }} --auto --pr" --permission-mode bypassPermissions
        env: { ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }} }
      # push + PR handled by orchestrate --pr; fallback gh pr create if the skill didn't open one
      - run: gh pr view feat/${{ inputs.epic }} || gh pr create -f -H feat/${{ inputs.epic }}
        env: { GH_TOKEN: ${{ secrets.GITHUB_TOKEN }} }
```

### 4.3 `/substrate:dispatch` skill (`skills/dispatch/SKILL.md` + opencode mirror)

- **Args**: `<epic>` (an `epic:<slug>` label or slug). No-arg → list dispatchable graphed epics.
- **Refuse**: not a git repo w/ remote · no `ci:` block in `substrate.yaml` · epic not graphed (no `group:`/`blocked-by` children) · `ANTHROPIC_API_KEY` secret absent (best-effort check via `gh secret list`).
- **Do**: confirm graphed (`bead-graph.sh --epic <slug>`) → `tbd sync` (publish) → `gh workflow run substrate-orchestrate.yml -f epic=<slug>` → poll `gh run list`/`gh pr list` → print run URL + PR URL.
- **Single-writer**: dispatch performs exactly one `tbd sync` to publish, then triggers; it never orchestrates locally.

---

## 5. Error Handling

| Error | Cause | Handling |
|-------|-------|----------|
| Epic invisible in runner | `tbd sync` not run before dispatch, or `tbd-sync` not fetched | dispatch runs `tbd sync` itself; workflow `git fetch origin tbd-sync` explicit; abort with "publish first" if branch absent |
| Headless agent can't install plugin | plugin cache/marketplace not available in container | Phase 1 spike resolves the install method; fail the run with the install log, don't half-run |
| Permission prompt blocks the agent | worktree/git ops need interactive approval | `--permission-mode bypassPermissions` in the default `agent-command` (D6) |
| Gate red on unseeded input | `worktree-seed` secrets (`.env.local`/`.env.prod`) absent in container | provide as secrets OR confirm gate green without them (ci.yml passes on `DATABASE_URL` alone); orchestrate already warns |
| PR pointless (empty/‑squashed) | `--pr` not honored / trunk-squash not suppressed | SC2 gate; verify integration branch pushed and no trunk commit created |
| Runaway re-runs | (v2 only) event trigger self-fires on close-sync | Phase 7 guard + `run:<id>` claim-lock; v1 is manual so N/A |

---

## 6. Testing Strategy

This is the substrate **plugin** repo — skills are natural-language contracts, there is no `pnpm app:test`. The gate is therefore two-pronged:

| Layer | Test Focus | Command / Check |
|-------|------------|-----------------|
| Live proof | The whole loop actually runs in the cloud | Phase 1 SC1: a green PR in clawcraft with per-wave commits |
| Structural | Skill/template coherence, no broken paths | targeted `grep`/`comm` audits per phase (as used for the diagnose extension) |
| Parity | OpenCode mirror matches every touched skill | `comm -23 <(ls skills|sort) <(ls opencode/command/substrate|sed 's/\.md$//'|sort)` empty |
| Contract | `substrate.yaml` template still valid; `ci:` optional | `doctrine-lint.sh` green in a scratch adopt (SC3) |

---

## 7. Failure Modes (FMEA)

| # | Failure Mode | Severity | Mitigation |
|---|--------------|----------|------------|
| 1 | Headless CC + substrate plugin won't install/run in the container | **Critical** | Phase 1 is a dedicated spike that answers exactly this before any generalization is built |
| 2 | Beads not visible → orchestrate refuses (ungraphed) | High | D1 fetch-tbd-sync + dispatch's own `tbd sync` publish; dispatch refuses ungraphed epics up front |
| 3 | Feedback loop / double execution (v2) | High | v1 is manual (no trigger to loop); v2 Phase 7 ships guard + claim-lock + `concurrency` |
| 4 | Unsigned per-bead commits reach protected branch | Medium | D2: GitHub squash-merge re-authors one commit; branch protection requires squash-merge |
| 5 | `services:` can't be made runtime-generic | Medium | Known GitHub constraint; v1 token-substitutes at adopt time (D4) rather than pretending it's dynamic |
| 6 | Gate red on missing seed secrets | Medium | §5 row; confirm gate-without-seed in Phase 1, else wire secrets |
| 7 | Epic exceeds GitHub's 6h job cap | Low | Documented ceiling; graduation to self-hosted is the `runs-on` swap point (out of scope) |
| 8 | OpenCode drift | Low | Parity audit is a gate on every phase that touches a skill |

---

## 8. Prompt Execution Strategy

<!-- PROTOCOL: docs/protocol/sdd/execution-format.md. Phases are dependency-ordered; Phase 1 is a
prerequisite SPIKE whose findings ratify Phases 2–6's provisional design (esp. D4). -->

### Phase 1: Proof spike — validate the loop in clawcraft *(repo: clawcraft, not the plugin)*

#### Step 1.1: Pick and confirm a small graphed epic

Run `bash docs/scripts/bead-graph.sh --epic <slug>` in clawcraft for a small candidate (`rnk-d2e2` or `rnk-38x4`). Confirm it has `group:`/`blocked-by` children and ≥1 wave. If ungraphed, `/substrate:graph-spec` it first. Publish: `tbd sync`.

Tools: Bash.

##### Verify
- `bead-graph.sh --epic <slug>` prints waves (non-empty DAG).
- `git ls-remote origin tbd-sync` is non-empty (beads published).

#### Step 1.2: Hand-write `substrate-orchestrate.yml` in clawcraft

Mirror `ci.yml`'s `services`/bootstrap/install verbatim; add fetch-tbd-sync, agent install, `orchestrate --auto` (no `--pr` yet — push branch + `gh pr create` inline in the workflow for this spike), push + PR. Add `ANTHROPIC_API_KEY` repo secret (manual, out-of-band — print the instruction).

Tools: Write, Bash (`gh secret set` guidance only — do not embed secrets).

##### Verify
- `gh workflow run substrate-orchestrate.yml -f epic=<slug>` starts a run.

#### Step 1.3: Capture findings

Record, in this spec's Change Log + a `docs/tasks/ongoing/dispatch/phase1-findings.md`: the exact plugin-install method that worked, the permission-mode needed, whether seed secrets were required, and the observed PR commit cadence.

##### Verify
- SC1 met: PR exists with per-wave commits, integrated tip green.

#### Gate
- SC1 green. **Findings doc written** — Phases 2–6 read it before generalizing (ratifies D4).

### Phase 2: `orchestrate --pr` cloud-output mode *(repo: plugin)*

#### Step 2.1: Add `--pr` to orchestrate

Edit `skills/orchestrate/SKILL.md`: document `--pr` (per-wave `git push origin feat/<epic-slug>`, ensure-PR, **suppress trunk-squash**), orthogonal to `--auto`. Add a Constraint that `--pr` and the trunk-squash step are mutually exclusive. Re-translate `opencode/command/substrate/orchestrate.md`.

Tools: Edit.

##### Verify
- `grep -c 'suppress.*trunk-squash\|--pr' skills/orchestrate/SKILL.md` ≥ 2; same in opencode mirror.

#### Gate
- Parity audit clean; `--pr` semantics unambiguous (no path where both trunk-squash and PR-push fire).

### Phase 3: `ci:` contract block *(repo: plugin)*

#### Step 3.1: Extend the substrate.yaml template

Add the commented `ci:` block (§3.3) to `references/docs-core/substrate.yaml` with the "optional; absent → no cloud dispatch" note and the FMEA-#5 static-`services` caveat.

Tools: Edit.

##### Verify
- `grep -c 'ci:' references/docs-core/substrate.yaml` ≥ 1; block documents `services/bootstrap/secrets-needed/runner`.

#### Gate
- A scratch `/substrate:adopt` still leaves `doctrine-lint.sh` green (ci: is optional, non-breaking).

### Phase 4: Portable seam template *(repo: plugin)*

#### Step 4.1: Generalize the Phase-1 file into a template

Write `references/templates/.github/workflows/substrate-orchestrate.yml` (or `references/ci/…`) from the **validated** Phase-1 file, replacing env-setup with `{{CI_RUNNER}}`/`{{CI_SERVICES}}`/`{{CI_ENV}}`/`{{CI_BOOTSTRAP}}`/`{{TOOLCHAIN_INSTALL}}`/`{{AGENT_COMMAND}}` tokens. Default `AGENT_COMMAND` per D6, now including `--pr`.

Tools: Write.

##### Verify
- Every `{{TOKEN}}` has a documented source (ci: block, toolchain-pin, or D6 default).

#### Gate
- Template is a pure function of `substrate.yaml` + D6 default — no clawcraft-specific literals leak in (grep for `clawcraft`, `@clawcraft`, `5433` → empty).

### Phase 5: `adopt` installer *(repo: plugin)*

#### Step 5.1: Teach adopt to drop the seam + fill `ci:`

Edit `skills/adopt/SKILL.md`: new step that (a) **auto-detects** `services`/bootstrap from an existing `.github/workflows/*.yml` and proposes them (confirm), else asks; (b) substitutes tokens into the copied `substrate-orchestrate.yml`; (c) writes the `ci:` block; (d) **prints** the `secrets-needed` names as a manual "add these" instruction (fail-fast, never auto-provision). Re-translate the opencode mirror.

Tools: Edit.

##### Verify
- adopt's handoff lists `substrate-orchestrate.yml` + the secrets instruction.

#### Gate
- SC3: scratch adopt on a repo with an existing `ci.yml` yields a populated `ci:` + a token-free workflow; doctrine-lint green; parity clean.

### Phase 6: `/substrate:dispatch` skill + docs *(repo: plugin)*

#### Step 6.1: Author the skill

Write `skills/dispatch/SKILL.md` per §4.3 (args, refuse table, do-steps, single-writer note, fail-fast per user preference). Write `opencode/command/substrate/dispatch.md` (parity).

#### Step 6.2: Update repo docs

CLAUDE.md (13→14 skills, add the dispatch bullet + repo-layout line), README skill list, plugin manifest skill registration if required. Do **not** bump `plugin.json#version`.

Tools: Write, Edit.

##### Verify
- SC4 refuse/do paths present; SC5 parity audit empty; CLAUDE.md says 14 skills.

#### Gate
- Parity clean; CLAUDE.md/README/manifest consistent; `dispatch` refuses ungraphed + missing-`ci:` cases.

### Phase 7 (v2 — DEFERRED, designed not built): event-driven trigger

Documented for continuity; **not implemented in this spec**. Swap the seam's `on: workflow_dispatch` → `on: push: branches: [tbd-sync]`, prepend a guard step: exit unless the pushed change introduces an epic that is **graphed** AND has **no** existing run (checked via `.substrate/execution-state.json` or a `run:<id>` label). First runner action becomes the **claim**: write `run:<id>` and sync — so orchestrate's own close-sync re-fires the workflow, which then no-ops on the claim (self-terminating). `concurrency` already guards double-dispatch. This phase is a strict superset of v1's `on:` block; nothing in Phases 1–6 changes.

### Phase N: Doctrine Reconciliation (terminal, ratify-only)

Against the fully-integrated feature, reconcile `references/doctrines/**` — specifically whether `agents-parallel-execution-doctrine.md` earns a **"Remote / cloud orchestration"** subsection codifying: the PR-output mode, the tbd-sync-as-event-bus fact, the single-writer-preserved-under-dispatch invariant, and the manual-before-event-driven sequencing. **ratify-only**: only codify what this feature landed; introduce no rule the shipped seam violates. If a stricter rule is tempting, defer it to `/substrate:synthesize-session`.

##### Verify
- `git diff --name-only <base>..HEAD -- references/doctrines/ | grep -q . && echo "reconciled" || echo "no change earned"`
- Parity audit still clean after any doctrine edit.

---

## 9. Operational Queries

**Is an epic dispatchable?**
```bash
bash docs/scripts/bead-graph.sh --epic <slug>            # non-empty DAG ⟹ graphed
grep -q '^ci:' substrate.yaml && echo "cloud-enabled"    # ci: block present
git ls-remote origin tbd-sync | grep -q . && echo "published"
```

**Did a dispatch double-fire? (v2 audit)**
```bash
gh run list --workflow substrate-orchestrate.yml --json displayTitle,status \
  | jq 'group_by(.displayTitle) | map(select(length>1))'   # expected: [] (no epic run twice)
```

---

## 10. Spec Completeness Checklist

### Semantic
- [x] `ci:` schema fully defined (§3.3) — no `...` in the contract
- [x] State machine exhaustive (§3.2) incl. v2 deferral path (Phase 7)
- [x] All forks resolved with rationale (§1.4)

### Verification
- [x] Each phase has an executable verify + gate
- [x] Success criteria binary (§1.3, SC1–SC5)
- [x] Operational audit queries present (§9)

### Recovery
- [x] FMEA present (§7)
- [x] Idempotency: v1 manual + `concurrency`; v2 claim-lock (Phase 7)
- [x] Rollback: PR-based — nothing lands on trunk until squash-merge

### Context
- [x] Decision log captured (§1.4)
- [x] Change log present (§11)
- [ ] Brief linked — none (distilled from conversation; noted)

### Boundary
- [x] Scope table (§2)
- [x] Secrets requirement explicit (`ANTHROPIC_API_KEY`, manual)
- [x] External deps listed (GitHub Actions, `gh`, headless Claude Code, tbd)

---

## 11. Change Log

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2026-07-15 | Initial spec. v1 = manual `workflow_dispatch` cloud orchestration via port/adapter (adopt-installed seam + `ci:` block + `orchestrate --pr` + `/substrate:dispatch`); event-driven trigger deferred to Phase 7. Phase 1 is a proof spike whose findings ratify D4. |
