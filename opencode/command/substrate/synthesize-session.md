---
description: "Terminal phase of the SDD lifecycle — runs once per feature after /substrate/execute archives a spec, before the human moves on. Captures non-obvious session learning that the spec/commit format can't carry, and converts it into atomic doctrine fixes (capped at 5, leverage-ranked), session-filled draft doctrines for architectural axes the session introduced that no existing doctrine governs (coverage-map detection, capped at 3, per-candidate gated, own commit, written via /substrate/add-doctrine's writer), beads with state-transfer prompts so a fresh agent can pick the work up cold, and parked open-design-questions filed as beads with `status: parked`. Does NOT queue doctrine amendments — ratify-only doctrine changes are applied in-epic by the executor's terminal Doctrine Reconciliation phase; non-ratify-only doctrine follow-ups land here as ordinary actionable beads, never a passive queue. Idempotency + resumability live in `.substrate/synthesis-state.json`. The §1 session narrative + §7 Pareto cut live in the final synthesis-complete commit body — no per-feature .md report is written. Detects context compaction and warns. Per-feature idempotent. Skipping it is allowed; what gets lost is the ephemeral chat-only learning."
---

# /substrate/synthesize-session

Capture the session's learning before it evaporates. Convert it into doctrine fixes, dependency-ordered beads, and parked open-design-questions — each shaped so a fresh agent can act on it without re-reading the originating session. Doctrine changes the epic *earned* were already applied in-epic by the executor's terminal Doctrine Reconciliation phase (ratify-only); this command does **not** queue amendments.

## Position in the lifecycle

```
/substrate/architect-spec  →  /substrate/orchestrate   →  /substrate/synthesize-session
       (plan)                  (build + commit +             (capture learning →
                             in-epic doctrine reconcile)    beads + parked questions)
                            [primary: parallel fleet]
                            or /substrate/execute (attended single-window)
```

Not a phase of the executor. The build step is `/substrate/orchestrate` (the primary door — a
parallel worktree fleet over the graphed DAG) or its **attended** single-window alternative
`/substrate/execute`; synthesize runs after either one lands the feature. Per-feature idempotent — if
you built three specs this session you can synthesize each one independently. A re-run on the same
feature either no-ops (`status: complete` in state file) or resumes (`status: in-progress`).

## What this command reads

This command operates on **the model's own context window**. There is no transcript file to consult. If the context has been auto-compacted, older session learning is gone — the synthesis will be degraded. Step 0 detects this and warns.

In addition to context, the command reads:

1. `git log <pre-session-base>..HEAD` — what shipped.
2. `docs/doctrine/**/*.md` — the drift target.
3. Existing beads (via the configured bead-tracker; see "Bead-tracker config" below).
4. `.substrate/synthesis-state.json` (if present) — per-feature idempotency + resumability state.
5. `docs/synthesis-index.md` (if present) — past syntheses' bead inventories, for cross-session dedup.

## Arguments

`$ARGUMENTS` (optional) — feature slug whose spec was just executed. If omitted, the command auto-detects the most recently archived feature (definition in Step 1). If multiple are tied, the command asks the user to pick one — ending the question with `[type 'default' to let me decide sensible defaults]`.

## When to run

- A spec was just built in this session and archived to `docs/tasks/completed/<feature>/` by the executor — `/substrate/orchestrate` (the primary parallel door) or the attended `/substrate/execute`.
- You are still in the same session as the execution — the model's working context is the primary input.

## When to REFUSE

| Signal | Redirect |
|--------|----------|
| No `docs/doctrine/` directory | Not a scaffolded substrate project. Run `/substrate/init` first. |
| No feature exists at `docs/tasks/completed/<feature>/` | Nothing to synthesize. Did `/substrate/orchestrate` (or the attended `/substrate/execute`) complete? |
| `.substrate/synthesis-state.json[<feature>].status === "complete"` | Already synthesized — print the `narrative-commit` SHA and exit (idempotent). |
| `.substrate/synthesis-state.json[<feature>].status === "in-progress"` | Resume rather than refuse: jump to the step after the last entry in `completed-steps:`. |
| Legacy `docs/tasks/completed/<feature>/synthesis-*.md` exists with `status: complete` (pre-Option-A) | Treat as already-synthesized — print the legacy path and exit (no migration). |
| Working tree has >2 modified or staged files outside `docs/`, `scripts/dev*/`, or paths the originating spec touched | Stop. Mixing synthesis commits with unrelated WIP corrupts bisectability. Ask the user to stash or commit first. |

## Bead-tracker config

The command resolves the bead-tracker as follows:

1. If `.substrate/config.json` exists and contains `"bead-tracker": "tbd" | "none" | "other"`, honor it.
2. Otherwise auto-detect: `tbd` if `.tbd/config.yml` exists AND a `tbd` binary is callable — either `command -v tbd` succeeds (global install, e.g. `pnpm add -g tbd`) OR `npx --no-install get-tbd --version` succeeds (local install). Else `none`.

**Canonical store depends on tracker:**

- If tracker is `tbd`: **tbd is canonical.** Bead bodies are composed in memory in Step 7, previewed inline to the user, and persisted in Step 9 via ephemeral tempfiles (`mktemp` under `/tmp` or `$TMPDIR`) passed to `tbd create --file`. The tempfile is unlinked immediately after each create succeeds. The working tree never gets a markdown file. Provenance lives in (a) the synthesis-complete commit body which lists the assigned tbd IDs, (b) the `originating-spec` / `originating-session` frontmatter inside each tbd record.
- If tracker is `none`: **markdown is canonical.** Beads live permanently at `docs/tasks/ongoing/<bead-slug>/bead.md` (mirrors the spec convention — directories not bare files). The markdown file IS the bead.

## State file

Resumability + idempotency live in `.substrate/synthesis-state.json`. Create the file with `{}` if missing. Schema:

```json
{
  "<feature>": {
    "status": "in-progress" | "complete",
    "started": "<ISO8601>",
    "completed": "<ISO8601 — only when status: complete>",
    "completed-steps": [4, "4b", 5, 6, 7, 8, 9],
    "context": "full" | "compacted",
    "narrative-commit": "<sha — backfilled after final commit>"
  }
}
```

`.substrate/synthesis-state.json` SHOULD be committed (it's the per-feature synthesis ledger; without it a fresh clone loses synthesis history).

## Workflow

### Step 0 — Compaction self-check

For each commit hash in `git log --oneline <base>..HEAD`, the model self-assesses: "do I recall **why** this commit was made, beyond its message?" If recall is sparse on more than 50% of session commits, print:

```
⚠ Context appears compacted. Synthesis quality will be degraded.
  Recall sparse on N / M session commits.
  Recommended: re-run in a fresh session with the spec attached.
  Proceed anyway? (y / n)
```

If the user proceeds anyway, the state file's `context` field MUST record `compacted` so downstream readers know this synthesis was degraded.

### Step 1 — Detect session base + feature

Run in parallel:

```bash
ls docs/tasks/completed/                                              # candidate features
git log --diff-filter=ACDMR -M --name-only --format='%h %ct %s' \
  -- 'docs/tasks/completed/**' 'docs/tasks/ongoing/**'                # archive activity (handles renames)
git status --porcelain                                                # working-tree cleanliness
git log -1 --since='24 hours ago' --format='%H' 2>/dev/null || true   # session window
```

**Most recently archived feature** = the feature directory under `docs/tasks/completed/` whose latest commit-timestamp (`git log -1 --format=%ct -- <dir>`) is the maximum among directories touched within the last 24 hours OR since the last `git push`, whichever window is longer.

If exactly one candidate → use it. If multiple → present them with timestamps and ask the user (with default-escape suffix). If zero → REFUSE.

`<base>` := parent of the earliest commit in this session window that touched either `docs/tasks/completed/<feature>/` or `docs/tasks/ongoing/<feature>/`.

### Step 2 — Gather inputs + compute already-actioned set

Run in parallel:

```bash
git log --format='%h %s' <base>..HEAD                                 # session commits
git diff --stat <base>..HEAD                                          # session blast radius
git log --name-only --format= <base>..HEAD -- docs/doctrine/          # already-actioned doctrine files
find docs/doctrine -type f -name '*.md'                               # doctrines to scan
test -f .substrate/synthesis-state.json && cat .substrate/synthesis-state.json   # resumability state
test -f .substrate/config.json && cat .substrate/config.json          # explicit tracker config
test -f .tbd/config.yml && (command -v tbd >/dev/null || npx --no-install get-tbd --version)   # tbd auto-detect (global or local)
test -f docs/synthesis-index.md && cat docs/synthesis-index.md        # cross-session inventory
```

**Already-actioned filter (G1):** the list of doctrine files touched between `<base>` and `HEAD` defines the already-shipped set. Step 3 MUST exclude any candidate whose target file (or specific section within file, when grep-resolvable) is in that set. Re-suggesting a fix that already landed this session is a critical failure.

**Bead inventory:** if tracker is `tbd`, run `tbd list` if a global binary is on `PATH`, else `npx --no-install get-tbd list`; otherwise enumerate `docs/tasks/ongoing/<*>/bead.md`. Also load every bead row from `docs/synthesis-index.md` if it exists (G10 cross-session dedup).

**Initialize state file.** Before Step 4 begins, write `.substrate/synthesis-state.json` with:

```json
"<feature>": {
  "status": "in-progress",
  "started": "<ISO8601 now>",
  "completed-steps": [],
  "context": "full" | "compacted"
}
```

(Create `.substrate/` directory if missing.)

### Step 3 — Scan and categorize (draft, no writes yet)

Walk the model's context and produce a draft candidate list spanning the seven categories:

| Category | Definition |
|---|---|
| DevX (humans) | Ergonomics for the developer — scripts, orchestrators, shortcuts |
| DevX (agents) | Token / cycle reduction — pre-flights, shared libraries, smaller prompts |
| Bugs not seen | Latent bugs the session implicitly revealed but didn't trigger |
| Implementation drift | Code that drifted from its doctrine prescription |
| Architectural drift | Doctrine that drifted from reality (the claim is now wrong) |
| Doctrine gap (missing axis) | An architectural axis the session *introduced* that **no** existing doctrine governs — absence, not drift (e.g. the epic added `infra/` but there is no `infra-doctrine.md`) |
| Feature extensions | Net-new behaviour or optimisations surfaced by the session |

Empty categories are signal too — explicitly note them.

Tag each candidate as one of five buckets:

- **immediate-fix** — single file, factual, trivial revert, would mislead the next session within hours. Caps at 5; surplus demotes to deferred-fix.
- **deferred-fix** — same shape as immediate-fix, but past the cap. Filed as a `type: drift` bead, **not** as an amendment (preserves the trivial revert shape).
- **missing-doctrine** — an architectural axis the session introduced with no governing doctrine file. Authored as a session-filled draft doctrine in Step 4b (cap 3; surplus demotes to a `type: feature` bead recommending the axis).
- **bead** — net new work to be done. This bucket now **absorbs non-ratify-only doctrine follow-ups**: a doctrine change that would require *changing already-shipped code* (a new MUST/MUST-NOT the epic's landed code violates) is out of scope for the epic's terminal reconciliation node (which is ratify-only), so it lands here as an **actionable `type: task` bead** describing the stricter rule + the code it obliges — never as a passive `doctrine-amendment` queue entry. Ratify-only doctrine changes are *not* candidates here at all: they were already applied in-epic by the Doctrine Reconciliation phase.
- **parked-question** — open design question with no doctrine claim yet, no committed acceptance criterion. Filed as a `type: open-question`, `status: parked` bead so it shows up in the tracker but isn't pulled into the DAG as actionable work.

Apply the already-actioned filter. Apply the cross-session dedup against past beads.

Also draft, in memory, two synthesis-level artifacts:

- **§1 session narrative** — two paragraphs max: what was specced + what shipped + the most consequential design call. Will land in the final synthesis-complete commit body.
- **§7 Pareto cut** — the top 3–5 leverage items across the DAG (ignoring dependency order). Same constraint as Step 4's leverage ranking. Will print to chat in Step 10 and also land in the synthesis-complete commit body.

Present the draft. Wait for the user: `y / modify / defer <id-or-csv>`. `defer` drops items from this run.

### Step 4 — Apply immediate doctrine fixes (cap = 5)

**Leverage ranking (F8):** for each immediate-fix candidate, score 1–5 on `miscoaching_cost × inverse_revert_cost`:

- `miscoaching_cost` (1–5): if the next agent reads the doctrine as-is, how badly does it lead them astray? 5 = produces broken code; 1 = cosmetic.
- `inverse_revert_cost` (1–5): how easy is it to revert this fix if wrong? 5 = single line, single file; 1 = touches multiple files / cascades.

Sort descending. Top 5 land as immediate fixes; rest demote to deferred-fix (Step 7, as `type: drift` beads).

For each of the top 5:

1. Re-verify inclusion criteria: single file, factual, trivial revert.
2. Make the edit.
3. Commit as its own atomic commit. **Honor the project's commit-message convention** — check recent commits (`git log -10 --format=%B`) for trailers like `Co-Authored-By:` or `Signed-off-by:` and replicate the pattern. Do not impose a substrate-specific convention.

After each commit, update `.substrate/synthesis-state.json[<feature>].completed-steps:` to include `4` (idempotent — once `4` is present, leave it). This is what makes a mid-step crash resumable.

### Step 4b — Author missing doctrines (filled drafts, cap = 3)

Step 4 repairs doctrines that *exist*. Step 4b handles the opposite failure: an architectural axis the session **introduced** that no doctrine governs at all. A 5-wave, 18-bead epic that stands up new infra or a new runtime subsystem should leave behind N new doctrine files — and *this* session, the one that knows the real rules, is the only cheap moment to write them. Deferring to a human running `/substrate/add-doctrine` cold next week just yields a placeholder stub, because the context that would fill it has evaporated.

**Detection — coverage map (not drift).** A missing axis is an *absence*, distinct from Step 4/5's *wrong claim*. Compute it:

1. **Touched areas** — from `git diff --stat <base>..HEAD`, take the first path segment of each changed file (e.g. `convex/`, `src/`, `infra/`, a new subsystem dir). Collapse to distinct areas.
2. **Governed areas** — for each existing doctrine, read its `## 1. Scope` (or the manifest `summary` + `layer-hint`) and map it to the area(s) it claims. The baseline three cover `domain` (pure TS), `backend` (`convex/`), `frontend` (`src/`).
3. `missing = touched-areas \ governed-areas`. Each remaining area with **non-trivial blast radius** (≥1 shipped commit's worth of code, not a lone config tweak) is a **missing-doctrine candidate**.

Because a governed area never enters `missing`, this subsumes the already-actioned filter for this step — no separate pass needed.

**Derive the writer inputs** (no Socratic Q&A — synthesis already knows every answer add-doctrine's Q1–Q5 would ask):

- `id` — kebab-case name for the axis (new `infra/` → `infra`; a runtime subsystem → its name).
- `path` — from the project's detected nesting convention (reuse add-doctrine Step 1's flat/nested/mixed detection).
- `name` — title-case(`id`).
- `summary` — one sentence describing what the axis governs, mined from the session.
- `layer-hint` — the coverage-map layer the gap sits in.
- `triggers` — 3–8 keywords mined from the epic's beads + the area's filenames.

**Fill the sections from session context** — this is the whole reason to author here rather than defer:

- `## 1. Scope` — in/out of scope, grounded in what the session actually built.
- `## 2. Binding Rules (MUSTs)` — the hard rules the session's code established or revealed.
- `## 3. Recommended Practices (SHOULDs)` — patterns that demonstrably worked.
- `## 4. Anti-patterns` — anything the session tried and backed out of, or a footgun it hit.
- `## 5. Examples` — real file shapes / snippets from the shipped code.
- Header stays `**Status**: Draft`, `**Version**: 0.1.0` — a session-filled starting point, not authority.

**Cap = 3.** Rank candidates by blast radius (lines + commits touching the area). Top 3 are authored; any surplus **demotes to a `type: feature` bead** (Step 7) titled `Author <id>-doctrine.md for the <area> axis`, carrying the coverage-map evidence in its state-transfer prompt. Never dump >3 half-known doctrines in one run.

**Gate — per candidate (`y / modify / defer`).** Preview each filled draft inline, then ask per candidate:

- `y` — write it.
- `modify` — apply the user's edits, re-preview.
- `defer` — drop from this run (does **not** auto-demote to a bead; the user chose to skip).

This is deliberately **not** the default-`Y` gate the bead-persistence step uses. A filled draft doctrine is the highest design surface synthesis touches, so each one earns an explicit yes.

**Write + commit.** For each approved candidate, apply `/substrate/add-doctrine`'s **Step 3 (write to the convention path) + Step 4 (manifest append / bootstrap)** as the canonical writer — passing the *filled* sections + derived Q1–Q5 answers in place of the placeholder stub. The manifest dual-write keeps any manifest-coverage test green. Commit each as its own atomic commit:

```
doctrine(<id>): initial draft from <feature> session
```

Honor the project's commit-message convention (same `git log -10` trailer inspection as Step 4).

After each commit, append `"4b"` to `.substrate/synthesis-state.json[<feature>].completed-steps:` (idempotent — once present, leave it).

### Step 5 — Doctrine changes are reconciled in-epic (no amendment queue)

**There is no amendment queue.** This step does not exist as a persistence action any more — it is retained only as a numbered checkpoint so state-file `completed-steps` stays continuous.

Doctrine change is handled at two tiers, neither of which is a passive `type: doctrine-amendment` `status: queued` dead-letter:

1. **Ratify-only changes — already applied.** Any doctrine change the epic *earned* (a pattern the shipped code demonstrates, an outdated rule the code superseded, coverage the code exemplifies) was applied **in-epic** by the executor's terminal **Doctrine Reconciliation** phase (`spec-template.md` §Phase N), inside the same diff as the feature, and re-gated green. Nothing to queue here.
2. **Non-ratify-only follow-ups — filed as actionable beads, not amendments.** A doctrine change that would require *changing already-shipped code* (a stricter MUST/MUST-NOT the landed code violates) was correctly refused by the ratify-only terminal node. It does **not** become a queued amendment — it becomes an ordinary **actionable `type: task` bead** in Steps 7+9 (the `bead` bucket from Step 3), describing the stricter rule + the code it obliges to change, so a future session can *do* it rather than let it rot in a triage backlog.

Do **not** create any `type: doctrine-amendment` bead or any file under `docs/tasks/ongoing/doctrine-updates/`. After this step, append `5` to `.substrate/synthesis-state.json[<feature>].completed-steps:`.

### Step 6 — Annotate the archived spec (mandatory if deviations exist)

For any deviation between what the spec prescribed and what shipped, write a `### Post-execution notes` block into `docs/tasks/completed/<feature>/<feature>-spec.md`.

**Replace-not-append (F10):** if a `### Post-execution notes` heading already exists, rewrite its body in place (between that heading and the next heading or EOF). Never duplicate the block.

Commit as its own atomic commit: `docs(<feature>): annotate post-execution deviations`. After commit, append `6` to `completed-steps`.

Per SDD doctrine — see `docs/protocol/sdd/_SPEC-STANDARD.md` §11 Archive Protocol — this is the only sanctioned write to an archived spec. Step 6 is the canonical writer.

### Step 7 — Draft beads (includes deferred-fixes AND parked-questions)

For each `bead`, `deferred-fix`, and `parked-question` candidate, compose the bead body **in memory** (a record with frontmatter fields + body sections — no file writes yet). Persistence happens in Step 9 and is tracker-aware:

- `bead-tracker: tbd` → ephemeral tempfile → `tbd create --file` → unlink. Working tree untouched.
- `bead-tracker: none` → markdown file at `docs/tasks/ongoing/<bead-slug>/bead.md`.

Step 7 produces only in-memory records, the dedup decisions, and (next) the DAG over them.

**Bead ID (interim):** `synth-<feature>-<YYYY-MM-DD>-<HHMM>-<NN>` where `<HHMM>` is the command-invocation time. The time suffix dedupes parallel-session runs on the same feature. If tracker is `tbd`, this ID is replaced by the tbd-assigned ID in Step 9; if tracker is `none`, this ID is final.

**Cross-repo enum (F12):** `in-repo | cross-repo | mixed`. `mixed` beads MUST include a `## Cross-repo dependency` section in the body naming the sibling repo + the contract the in-repo work depends on.

**Auto-fill `<repo>` placeholder (G11):** use `git remote get-url origin` if a remote exists; otherwise `pwd`.

In-memory bead record (actionable beads — same shape regardless of tracker, only the destination differs):

```markdown
---
id: synth-<feature>-2026-05-10-1742-01
title: <Imperative, scoped — e.g., "Extract symmetric-token helper from bootstrap-tunnel.sh + render-claw-config.ts">
type: devx-human | devx-agent | bug | drift | feature | optimisation
status: open
effort: XS | S | M | L
blocked-by: []
epic: <feature>
originating-spec: docs/tasks/completed/<feature>/<feature>-spec.md
originating-session: <YYYY-MM-DD>
cross-repo: in-repo | cross-repo | mixed
---

# <Title>

## Why now (session signal)
<One sentence: what surfaced this in the originating session.>

## Acceptance criterion
<Binary, verifiable. Include file paths and line numbers when known.>

## State-transfer prompt
> Paste the block below into a fresh agent/session along with the repo root.
>
> ---
> Working in <auto-filled repo URL or pwd>. Your task: <restate the acceptance criterion>.
>
> Relevant files:
> - <path:line> — <what it does, why it matters>
> - <path:line> — ...
>
> Relevant prior commits:
> - <SHA> — <one-line description>
>
> Constraints — do NOT modify:
> - <public surface / contract you must preserve>
>
> Verification commands:
> - <exact command>
> - <exact command>
> ---

## Cross-repo dependency       <!-- only for cross-repo: mixed -->
<sibling repo + contract this bead depends on>

## Dependencies
- blocked-by: [<bead-id>, ...]

## Notes
<anything else useful — but resist sprawl>
```

**Parked-question record** (filed alongside beads, but with no acceptance criterion):

```markdown
---
id: synth-<feature>-2026-05-10-1742-NN
title: <Question phrased as a question, scoped>
type: open-question
status: parked
originating-spec: docs/tasks/completed/<feature>/<feature>-spec.md
originating-session: <YYYY-MM-DD>
---

# <Title>

## The question
<Restated in full — what's ambiguous, what decision is owed, by whom.>

## Why parked
<Why this isn't actionable yet — no doctrine claim is at stake, no caller is currently confused, the answer depends on a future signal, etc.>

## When to revisit
<Concrete trigger — "next feature that touches X", "if Y starts happening", or "every quarterly review". Do not write "later".>
```

Parked-questions do not get a `State-transfer prompt` — they aren't work yet. They do not participate in the DAG (Step 8 skips them).

**Dedup gate (mandatory, multi-source):** before adding a record to the new-beads list, check:
1. Existing tracker beads (tbd list, or `docs/tasks/ongoing/<*>/bead.md` if tracker is `none`)
2. Past synthesis inventories (`docs/synthesis-index.md` if present)

If a similar bead exists, mark this candidate as an **update-existing** (target ID + a `## Update from session <YYYY-MM-DD>` block to append) rather than a new-bead. Step 9 applies updates via the tracker's edit path (tbd) or by editing the markdown file in place (none). Near-misses (different wording, same intent) are flagged to the user for confirmation, not silently merged.

At the end of Step 7, the in-memory state is:
- `new-beads: [<record>, ...]` — actionable bead candidates (including deferred-fixes) that will be created in Step 9
- `parked-questions: [<record>, ...]` — parked-question candidates that will be created in Step 9 (alongside beads, but skip the DAG)
- `update-existing: [{target-id, append-block}, ...]` — candidates that will append to an existing record in Step 9

Append `7` to `completed-steps`.

### Step 8 — Build the DAG

**Algorithm (G5):**

1. **Pairwise scan** (skip parked-questions — they have no acceptance criterion and can't block other work). For each ordered pair `(A, B)` of actionable beads, B is `blocked-by: [A]` iff B's acceptance criterion references files, symbols, exports, or commands that A's acceptance criterion creates, exports, or modifies. Record a one-line reasoning trace per edge.

2. **Cycle detection (F11) via Kahn's algorithm.** Compute in-degree for each actionable bead; repeatedly remove zero-in-degree beads. If any bead remains after the pass, a cycle exists.

3. On cycle: REFUSE the bead set. Print the cycle (e.g. `A → B → C → A`) and ask the user to break it (drop or split one bead). Do not silently emit a cyclic DAG.

4. On success: encode `blocked-by:` in each actionable bead's frontmatter. Append `8` to `completed-steps`.

Because every bead carries the `epic:<feature>` label (Step 7), the persisted graph — planned beads from `/substrate/graph-spec` plus these session-discovered ones — is inspectable as one card via `bash docs/scripts/bead-graph.sh --epic <feature>` (flow view: rail + waves + critical-path spine) or `--format mermaid`.

Topological layers, conceptually:

```
[Drift fixes — already committed in step 4]
       ↓
[Foundation beads — extracts, helpers]              (e.g., symmetric-token lib)
       ↓
[Consumer beads — refactors depending on foundation]
       ↓
[Feature beads — net-new behaviour]
       ↓
[Optimisation beads — only after features land]

[Parked-questions — outside the DAG, no blockers, no work, status: parked]
```

### Step 9 — Persist beads + parked-questions to tracker

This is the only step that performs bead I/O. Step 7 produced in-memory records; Step 8 wired `blocked-by:` across actionable beads. Persistence shape depends on the tracker.

**Branch A — `bead-tracker: none`** (markdown is canonical):

1. For each record in `new-beads` ∪ `parked-questions`: write `docs/tasks/ongoing/<bead-slug>/bead.md`. The interim `synth-...` ID from Step 7 is final.
2. For each record in `update-existing`: `edit` the target file in place to append the `## Update from session <YYYY-MM-DD>` block at end-of-file (or before any pre-existing `## Notes` section).
3. No tracker calls. No ID propagation pass (interim IDs were final).

**Branch B — `bead-tracker: tbd`** (tbd is canonical, this step is mandatory):

1. **Preview inline.** Print each `new-beads` record to the chat as a fenced block — full body, in DAG order. Then print each `parked-questions` record (no DAG ordering needed). Then print each `update-existing` record as `<target-id>: + <append-block-preview>`.
2. **Ask:** `Create N beads + K parked-questions + apply M updates via tbd now? (Y / n / select)` — default is `Y` (binary approval gate; no default-escape suffix).
   - **`y`** (default): create / update all.
   - **`select`** (P1): enters a per-record `y / n / skip` loop — actionable beads in DAG order, then parked-questions, then updates. Skipped records are dropped (not persisted as scratch — there is no scratch path under `tbd`).
   - **`n`**: skip persistence entirely. Warn the user: *"Bead bodies were composed but not persisted. Because this repo is configured with `bead-tracker: tbd`, nothing is on disk. Re-run this command or copy the previewed bodies above to recover."*
3. **Create new beads.** For each approved `new-beads` record, in DAG order (so `blocked-by:` references resolve to already-assigned IDs), then each `parked-questions` record:
   1. Render the record body to a tempfile: `tmp=$(mktemp -t synth-bead-XXXXXX)` then write the markdown body into `$tmp`.
   2. Invoke `tbd create --type <type> -l "epic:<feature>" --file "$tmp" "<title>"` — substitute `npx --no-install get-tbd` for `tbd` if no global binary is on `PATH`. The `epic:<feature>` label is the **canonical epic identity** (same one `/substrate/architect-spec` → `/substrate/graph-spec` stamped on the planned beads), so session-discovered follow-up work groups under the *same* epic card. If an epic bead for this feature already exists — `tbd list --type epic --label "epic:<feature>"` returns one — also pass `--parent <epic-id>` so the bead nests as a subtask. For parked-questions, the type is `open-question` and the create command should set `status: parked` (via `--status` flag if supported, else via frontmatter the tbd implementation reads).
   3. Capture the assigned tbd ID from stdout. Record it in `{interim-id → tbd-id}`.
   4. `unlink "$tmp"` — unconditional cleanup. The command must not leave tempfiles behind even on partial failure (use `trap` or equivalent).
4. **Apply updates.** For each approved `update-existing` record: invoke the tbd update path (`tbd edit <id>` or `tbd append <id> --file <tmp>` depending on tbd version) with the append-block. Same tempfile + unlink discipline. If tbd has no native append, fall back to `tbd show <id> > $tmp && cat append-block >> $tmp && tbd update <id> --file $tmp` and unlink after.
5. **Single-pass ID propagation (C7):** with the full `{interim-id → tbd-id}` map built, rewrite every `blocked-by:` reference inside still-in-memory records before composing the synthesis-complete commit body in Step 10. Do this in one pass before exiting Step 9.

On failure of any tracker invocation: stop the batch, print the failing record's interim ID + the previewed body so the user can recover it manually, leave the tempfile in place (don't unlink on error), and exit with `status: in-progress` in the state file so a re-run can resume.

**Aggregate appends (G10, P5):**

- Append a one-line summary of each created bead (id, title, type, effort, blocked-by, cross-repo) to `docs/synthesis-index.md`. This is the cross-session dedup ledger — append-only, not a per-feature artifact.
- Append any cross-repo follow-ups identified during Step 3 to `docs/cross-repo-followups.md`. Same append-only ledger pattern for the cross-repo decision-maker.

Both files are created with a header on first write.

Append `9` to `completed-steps`.

### Step 10 — Handoff + synthesis-complete commit

Print this summary to the user:

```
✔ Session synthesis complete.

  Feature:                <feature>
  Context:                full | compacted
  Doctrine fixes:         <N> commits          (cap hit: <yes/no>, demoted: <M>)
  Doctrines authored:     <N> {docs/doctrine/<id>-doctrine.md + manifest entry, each its own commit}  (cap hit: <yes/no>, demoted: <M>)
  Doctrine reconciled:    in-epic by the executor's Doctrine Reconciliation phase (ratify-only) — not queued here
  Beads drafted:          <N> {in tbd | as files at docs/tasks/ongoing/<bead-slug>/bead.md}  (tracker-dependent; incl. any non-ratify-only doctrine follow-ups as type=task)
  Parked questions:       <N> {in tbd as type=open-question status=parked | as files at docs/tasks/ongoing/<slug>/bead.md status=parked}
  Pareto cut (top by leverage):
    - <bead-id-or-title>
    - <bead-id-or-title>
    - <bead-id-or-title>

  Session narrative:
    <§1 narrative — two paragraphs max>

  Audit trail: git log <base>..HEAD — every artifact is queryable from git + the tracker. No per-feature .md report file is written.

Next:
  - Review the <N> authored draft doctrines (Status: Draft) — they're filled from session context; vet the rules, then promote to Binding.
  - Pick up any non-ratify-only doctrine follow-ups — they're in the DAG as actionable beads.
  - Pick a bead off the top of the DAG when you're ready to keep building.
  - git push when you're ready — this will push: the spec-execute commit, the <N> doctrine-fix commits, the <N> authored-doctrine commits, the post-execution-notes commit, and this synthesis-complete commit, together as one batch.
```

Then commit the state file with the narrative + Pareto cut as the body:

```bash
# Update state file: set status: complete, fill `completed` timestamp.
# narrative-commit will be backfilled by amend after this commit lands its SHA.
# Use the project's commit convention (inspect `git log -10` for trailers).

git add .substrate/synthesis-state.json docs/synthesis-index.md docs/cross-repo-followups.md
git commit -m "chore(<feature>): synthesis complete <YYYY-MM-DD>

§1 Session narrative
<two-paragraph narrative inline>

§7 Pareto cut — top items by leverage
- <bead-id-or-title> — <why high-leverage>
- <bead-id-or-title> — <why high-leverage>
- <bead-id-or-title> — <why high-leverage>

Doctrine fixes this session: <SHA-list>
Doctrines authored this session: <id + path + SHA, one per line>
Beads created: <tbd-id-list or markdown-path-list>
Parked questions: <tbd-id-list or markdown-path-list>
"
```

After the commit lands, backfill `.substrate/synthesis-state.json[<feature>].narrative-commit` with the new SHA via `git commit --amend --no-edit` (or, to avoid amending, append a second commit `chore: backfill narrative-commit pointer` — pick whichever matches the project's amend posture; if recent `git log` shows the project doesn't amend published commits, use the second-commit path).

Set `.substrate/synthesis-state.json[<feature>].status` to `complete` and `.substrate/synthesis-state.json[<feature>].completed` to the current ISO8601 timestamp. Append `10` to `completed-steps`. Exit.

## Constraints

- **MUST NOT** mix synthesis commits with the spec-execute commit. Each immediate fix is its own commit. The spec-execute commit must remain one revertable unit.
- **MUST NOT** create beads that duplicate existing beads. Run the dedup gate against both the tracker AND `docs/synthesis-index.md` unconditionally.
- **MUST NOT** re-apply doctrine fixes that already shipped earlier in this session — apply the already-actioned filter (Step 2) before categorizing.
- **MUST** treat the bead-tracker as canonical when configured. If `bead-tracker: tbd`, persistence for beads (Step 9) and parked-questions (Step 9) uses ephemeral tempfiles under `/tmp` (or `$TMPDIR`); Step 9 is mandatory with default `Y`. Under `tbd`, the working tree MUST NOT receive any markdown file under `docs/tasks/ongoing/**` — neither bead bodies nor parked-question bodies. If `bead-tracker: none`, markdown under `docs/tasks/ongoing/**` is canonical. Never present tbd-persistence as an optional mirror in a tbd-configured repo — that inverts the source-of-truth and pushes the user toward dropping work on the floor.
- **MUST NOT** queue doctrine amendments. There is no `type: doctrine-amendment` bead, no `status: queued` dead-letter, no `docs/tasks/ongoing/doctrine-updates/` file. Ratify-only doctrine change lands **in-epic** via the executor's terminal Doctrine Reconciliation phase; non-ratify-only doctrine follow-ups become ordinary actionable `type: task` beads (Step 9). Do not reintroduce the queue under any tracker.
- **MUST NOT** write a per-feature synthesis report (no `docs/tasks/completed/<feature>/synthesis-*.md`). The §1 narrative + §7 Pareto cut live in the synthesis-complete commit body. The two append-only aggregate ledgers — `docs/synthesis-index.md` and `docs/cross-repo-followups.md` — are the only `.md` writes outside `docs/tasks/ongoing/<bead-slug>/bead.md` under tracker=`none`, and they remain markdown regardless of tracker.
- **MUST** persist resumability state in `.substrate/synthesis-state.json`. Create the file with `{}` if missing. Append step numbers to `completed-steps:` after each step lands. On re-run with `status: in-progress`, RESUME — don't restart.
- **MUST** carry the §1 narrative + §7 Pareto cut in the final synthesis-complete commit body — git is the audit log. Backfill `.substrate/synthesis-state.json[<feature>].narrative-commit` with that commit's SHA after it lands.
- **MUST** unlink tempfiles after each successful `tbd create` / `tbd update` (use `trap` or equivalent). Leaving stray markdown bodies in `/tmp` is fine; leaving them in the working tree is the bug this design exists to prevent. On tracker-invocation failure, leave the tempfile in place and print its path so the user can recover.
- **MUST** cap immediate fixes at 5, ranked by `miscoaching_cost × inverse_revert_cost`. Demoted candidates become `type: drift` beads, not amendments.
- **MUST** author a session-filled draft doctrine (Step 4b) for any architectural axis the session *introduced* that no existing doctrine governs, detected via the coverage map (touched areas ∖ governed areas), not via drift. Cap at 3 per run, ranked by blast radius; surplus demotes to a `type: feature` bead recommending the axis. Each authored doctrine is `Status: Draft`, gated per-candidate (`y / modify / defer`, **not** default-`Y`), written via `/substrate/add-doctrine`'s writer (its Step 3 + Step 4) with filled sections in place of the placeholder stub, and lands as its own `doctrine(<id>): initial draft from <feature> session` commit. Never emit a bare placeholder stub from this step — the session context is the point.
- **MUST** produce a top-3-to-5 Pareto cut. It lives in the synthesis-complete commit body and the Step 10 handoff print — not in any standalone file.
- **MUST** annotate the archived spec with a `### Post-execution notes` block whenever deviations occurred. Replace, don't append.
- **MUST** tag every bead and parked-question with `originating-spec` + `originating-session` for provenance.
- **MUST** record `context: compacted` in `.substrate/synthesis-state.json[<feature>]` if Step 0 detected compaction and the user proceeded anyway.
- **MUST** detect cycles in the bead DAG (Step 8). On cycle, REFUSE and ask the user to break it.
- **MUST NOT** execute cross-repo work (e.g., edits to the substrate plugin repo from within a scaffolded project). Flag in `docs/cross-repo-followups.md`, then stop.
- **MUST** honor the project's commit-message convention (inspect `git log -10` for trailer patterns). Do not impose a substrate-specific convention.
- **MUST** offer the default-escape suffix `[type 'default' to let me decide sensible defaults]` on Socratic clarifying questions (open-ended, multi-option). **Do not** apply it to binary approval gates (`y/n`, `y/n/modify`, `y/n/select`).
- **SHOULD** prefer state-transfer prompts that name files + commit SHAs + verification commands explicitly. Generic prompts force the next agent to re-do the work this command exists to prevent.
- **SHOULD** scan all seven categories even if some return empty. Empty categories are signal — an empty "Doctrine gap" row means every touched area is already governed.
- **SHOULD** flag near-miss duplicates (different wording, same intent) to the user for confirmation rather than silently merging.
- **SHOULD** treat legacy `docs/tasks/completed/<feature>/synthesis-*.md` files (pre-Option-A) as already-synthesized markers — print the legacy path and exit, no migration. The new state-file approach takes over for any feature not in the legacy set.
