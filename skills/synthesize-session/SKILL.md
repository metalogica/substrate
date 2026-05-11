---
name: synthesize-session
description: "Terminal phase of the SDD lifecycle — runs once per session after /substrate:execute archives a spec, before the human moves on. Captures non-obvious session learning that the spec/commit format can't carry, and converts it into either immediate doctrine fixes (atomic commits, capped at 5), queued doctrine amendments (for human triage), or filed beads with state-transfer prompts so a fresh Claude Code agent can pick the work up cold. Idempotent — re-running on a session already synthesized is a no-op. Skipping it is allowed; what gets lost is the ephemeral chat-only learning."
---

# /substrate:synthesize-session

Capture the session's learning before it evaporates. Convert it into doctrine fixes, queued amendments, and dependency-ordered beads — each shaped so a fresh agent can act on it without re-reading the originating session.

## Position in the lifecycle

```
/substrate:architect-spec  →  /substrate:execute  →  /substrate:synthesize-session
       (plan)                    (build + commit)         (capture + queue)
```

Not a phase of `execute`. Runs once per session regardless of how many specs ran. Idempotent.

## Arguments

`[feature]` (optional) — the feature slug whose spec was just executed. If omitted, the skill detects the most recently archived feature at `docs/tasks/completed/<feature>/`. If multiple were archived in this session, the skill asks the user to pick one — ending the question with `[type 'default' to let me decide sensible defaults]`.

## When to run

- A spec was just executed in this session and archived to `docs/tasks/completed/<feature>/` by `/substrate:execute`.
- You are still in the same Claude session as the execution — the transcript is the primary input. Running this in a fresh session loses the session-specific learning.

## When to REFUSE

| Signal | Redirect |
|--------|----------|
| No `docs/doctrine/` directory | Not a scaffolded substrate project. Run `/substrate:init` first. |
| No feature exists at `docs/tasks/completed/<feature>/` | Nothing to synthesize. Did `/substrate:execute` complete? |
| `docs/tasks/completed/<feature>/synthesis-*.md` already exists for the target feature | Already synthesized — idempotent no-op. Print the existing path and exit. |
| Working tree dirty with non-trivial uncommitted changes | Stop. Synthesis writes commits; mixing with WIP corrupts bisectability. Ask the user to stash or commit first. |

## Inputs

The skill consumes five sources, in this order:

1. **Current session's transcript / context window** — the non-obvious learning lives only here: every drift discovered, every workaround applied, every "wait, that's actually wrong" moment.
2. **`git log <pre-session-base>..HEAD`** — ground truth of what actually shipped. Compute `pre-session-base` as the parent of the first commit touching `docs/tasks/completed/<feature>/` or `docs/tasks/ongoing/<feature>/` in the current session.
3. **`docs/doctrine/**/*.md`** — the drift target. Any session observation that contradicts a doctrine claim is a candidate fix or amendment.
4. **Existing beads** — `npx get-tbd list` if tbd is detected (presence of `.tbd/config.yml`), else `ls docs/tasks/ongoing/beads/`. Used to dedupe before drafting.
5. **`docs/tasks/ongoing/doctrine-updates/`** — existing queued amendments to merge against, not duplicate.

## Workflow

### Step 1 — Detect session base + feature

Run in parallel:

```bash
ls docs/tasks/completed/                                    # candidate features
git log --diff-filter=A --name-only --format='%H %s' -- 'docs/tasks/completed/**'
git status --porcelain                                      # working-tree cleanliness
```

If exactly one feature was archived in the recent history → use it. If multiple → ask the user with the default-escape suffix.

Compute `<base>` = parent of the earliest commit in the session that touched the chosen feature dir. Persist `<base>` and `<feature>` in skill state for downstream steps.

### Step 2 — Gather inputs

Run in parallel:

```bash
git log --format='%h %s' <base>..HEAD                       # session commits
git diff --stat <base>..HEAD                                # session blast radius
find docs/doctrine -type f -name '*.md'                     # doctrines to scan
ls docs/tasks/ongoing/doctrine-updates/ 2>/dev/null         # queued amendments
test -f .tbd/config.yml && echo "tbd"                       # bead system detection
ls docs/tasks/ongoing/beads/ 2>/dev/null                    # fallback bead dir
```

If tbd is present, `npx get-tbd list` for existing-bead dedup. Otherwise read each markdown file under `docs/tasks/ongoing/beads/`.

### Step 3 — Scan and categorize (draft, no writes yet)

Walk the session and produce a draft table covering the six categories. Present it to the user for confirmation **before writing any files**.

| Category | Definition |
|---|---|
| DevX (humans) | Ergonomics for the developer — scripts, orchestrators, shortcuts |
| DevX (agents) | Token/cycle reduction — pre-flights, shared libraries, smaller prompts |
| Bugs not seen | Latent bugs the session implicitly revealed but didn't trigger |
| Implementation drift | Code that drifted from its doctrine prescription |
| Architectural drift | Doctrine that drifted from reality (the claim is wrong now) |
| Feature extensions | Net-new behaviour or optimisations surfaced by the session |

For each candidate, tag it as one of:

- **immediate-fix** — single-file, factual, trivial revert, would mislead the next session within hours
- **queued-amendment** — needs human judgement, has design surface
- **bead** — net work to be done, not a doctrine edit

Present the draft. Wait for the user to confirm scope (`y / modify / skip <id>`). The user can mark any item as `defer`, which drops it from this synthesis run.

### Step 4 — Apply immediate doctrine fixes

For each `immediate-fix` candidate (cap: 5):

1. Re-verify the inclusion criteria: single file, factual, no design surface.
2. Make the edit.
3. Commit as its own atomic commit: `docs(doctrine): <one-line what + why>`. No co-author tags. No batching.

If more than 5 immediate-fix candidates exist, demote the 6th onwards to `queued-amendment` and tell the user — the cap is a forcing function, not a budget.

### Step 5 — Queue doctrine amendments

For each `queued-amendment` candidate, write `docs/tasks/ongoing/doctrine-updates/<slug>-<YYYY-MM-DD>.md` with this body:

```markdown
---
type: doctrine-amendment
status: queued
originating-spec: docs/tasks/completed/<feature>/<feature>-spec.md
originating-session: <YYYY-MM-DD>
---

# <Amendment title>

## The current doctrine claim
<quote the doctrine text and file:line>

## What the session observed
<concrete observation + which commit(s) prove it>

## Options
- A: <option>
- B: <option>
- ...

## Recommended
<your read of the tradeoffs — but the human decides>

## Risks of deferring
<what gets miscoached the longer this sits>
```

Do **not** commit these — they're for human triage.

### Step 6 — Annotate the archived spec (mandatory if deviations exist)

For any deviation between what the spec said and what actually shipped, append a `### Post-execution notes` block to `docs/tasks/completed/<feature>/<feature>-spec.md`. Without this, the archived spec is a landmine for future agents. Commit this annotation as its own atomic commit before drafting beads: `docs(<feature>): annotate post-execution deviations`.

### Step 7 — Draft beads

For each `bead` candidate, write `docs/tasks/ongoing/beads/<id>-<slug>.md`. The `<id>` is `synth-<YYYY-MM-DD>-<NN>` (skill-local IDs; reconciled with tbd at step 9 if tbd is present).

Bead file format:

```markdown
---
id: synth-2026-05-10-01
title: <Imperative, scoped — e.g., "Extract symmetric-token helper from bootstrap-tunnel.sh + render-claw-config.ts">
type: devx-human | devx-agent | bug | drift | feature | optimisation
effort: XS | S | M | L
blocked-by: []
originating-spec: docs/tasks/completed/<feature>/<feature>-spec.md
originating-session: <YYYY-MM-DD>
cross-repo: false                # true if the change lives in a sibling repo
---

# <Title>

## Why now (session signal)
<One sentence: what surfaced this in the originating session.>

## Acceptance criterion
<Binary, verifiable. Include file paths and line numbers when known.>

## State-transfer prompt
> Paste the block below into a fresh Claude Code session along with the repo root.
>
> ---
> Working in <repo>. Your task: <restate the acceptance criterion>.
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

## Dependencies
- blocked-by: [<bead-id>, ...]

## Notes
<anything else useful — but resist sprawl>
```

**Dedup gate (mandatory):** before writing each bead, grep existing beads (tbd or `docs/tasks/ongoing/beads/`) for overlap. If a similar bead exists, append a `## Update from session <date>` block to the existing bead instead of creating a new one.

### Step 8 — Order the beads as a DAG

Lay them out as a dependency-ordered queue, not a flat list:

```
[Drift fixes — already committed in step 4]
       ↓
[Foundation beads — extracts, helpers]              (e.g., symmetric-token lib)
       ↓
[Consumer beads — refactors that depend on a foundation bead]
       ↓
[Feature beads — net-new behaviour]
       ↓
[Optimisation beads — only after features land]
```

Encode the DAG via `blocked-by` in each bead's frontmatter. A new agent pulling the top of the queue must never hit a "you can't do this until X is done" wall.

### Step 9 — Reconcile with the bead tracker (optional upgrade)

If tbd was detected (`.tbd/config.yml` present):

1. Print the proposed `npx get-tbd create ...` invocations, one per bead, each using `--file <path>` to point at the bead markdown.
2. Ask the user: `Create these N beads via tbd now? (y / n / select)` with the default-escape suffix.
3. On `y` or `select`, run each `tbd create` and rewrite the bead's `id` frontmatter to the tbd-assigned ID. Leave the file in `docs/tasks/ongoing/beads/` as the canonical body.

If tbd was not detected, skip this step — the markdown files under `docs/tasks/ongoing/beads/` are the beads.

### Step 10 — Write the synthesis report

Write `docs/tasks/completed/<feature>/synthesis-<YYYY-MM-DD>.md`:

```markdown
---
type: session-synthesis
feature: <feature>
date: <YYYY-MM-DD>
originating-spec: docs/tasks/completed/<feature>/<feature>-spec.md
---

# Session synthesis — <feature> — <YYYY-MM-DD>

## §1 Session summary
<What was specced + what shipped. Two paragraphs max.>

## §2 Doctrine fixes applied this session
- <SHA> — <one-line summary>
- ...

## §3 Doctrine amendments queued for human triage
- docs/tasks/ongoing/doctrine-updates/<slug>.md — <one-line summary>
- ...

## §4 Beads created
| id | title | type | effort | blocked-by |
|----|-------|------|--------|------------|
| synth-... | ... | ... | ... | ... |

## §5 Open questions explicitly NOT actioned
<So they don't get re-discovered next session. One bullet per question, with the reason it was parked.>

## §6 Cross-repo follow-ups (flagged, not executed)
<e.g., changes needed in metalogica/substrate skills. One bullet per item.>

## §7 Pareto cut — top 3-5 by leverage
<Out of all beads, the 3-5 you'd recommend the human pick up first. Order matters.>
```

Commit this report as its own atomic commit: `docs(<feature>): session synthesis <date>`.

### Step 11 — Handoff

```
✔ Session synthesis complete.

  Feature:                <feature>
  Doctrine fixes:         <N> commits
  Queued amendments:      <N> files at docs/tasks/ongoing/doctrine-updates/
  Beads drafted:          <N> files at docs/tasks/ongoing/beads/  (tbd: <yes/no>)
  Synthesis report:       docs/tasks/completed/<feature>/synthesis-<date>.md
  Pareto cut:             <bead-id>, <bead-id>, <bead-id>

Next:
  - Triage queued amendments when you have a quiet moment
  - Pick a bead off the top of the dependency-ordered queue when you're ready to keep building
  - git push when you're ready
```

## Constraints

- **MUST NOT** mix synthesis commits with the spec-execute commit. Each immediate fix is its own commit. The spec-execute commit must remain one revertable unit.
- **MUST NOT** create beads that duplicate existing open beads. Run the dedup gate in step 7 unconditionally.
- **MUST** cap immediate fixes at 5 commits. Demote the rest to queued-amendments. The cap is a forcing function against "while I'm here" sprawl.
- **MUST** annotate the archived spec with a `### Post-execution notes` block whenever deviations occurred (step 6). The archived spec is read by future agents — leaving it out of sync is a landmine.
- **MUST** tag every bead and amendment with `originating-spec` + `originating-session` for provenance.
- **MUST** be idempotent — refuse if `synthesis-*.md` already exists for the target feature.
- **MUST NOT** execute cross-repo work (e.g., edits to the substrate plugin repo from within a scaffolded project). Flag in §6 of the report and stop there.
- **MUST** offer the default-escape suffix `[type 'default' to let me decide sensible defaults]` on any clarifying question. Approval gates (y/n/modify, y/n/select) are exempt.
- **SHOULD** propose a Pareto cut (top 3-5 by leverage) rather than dumping 10+ beads on the human.
- **SHOULD** prefer state-transfer prompts that name files + commit SHAs + verification commands explicitly — generic prompts ("look at the auth code") force the next agent to re-do the work this skill exists to prevent.
- **SHOULD** scan all six categories (DevX-humans, DevX-agents, bugs-not-seen, impl-drift, arch-drift, feature-extensions) even if some return empty. Empty categories are signal too.
