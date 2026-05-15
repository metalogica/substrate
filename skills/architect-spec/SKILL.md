---
name: architect-spec
description: "Turn a manually written brief into an executable multi-phase spec with verification gates. Invoke with a brief path (docs/tasks/ongoing/<feature>/<feature>-brief.md). Runs Socratic Q&A inline, discovers the project's doctrines via manifest or glob, dispatches one `doctrine-architect` subagent per relevant doctrine in parallel, composes their structured recommendations into a spec following the SDD protocol, and writes docs/tasks/ongoing/<feature>/<feature>-spec.md. Hands off to /substrate:execute for gated execution in a fresh session."
---

# /substrate:architect-spec

Drives the SDD spec-drafting flow end-to-end at skill level. The skill itself runs Q&A with the user, discovers doctrines, dispatches `doctrine-architect` subagents in parallel, mediates cross-doctrine dependencies, composes the spec, and writes it.

**Why no orchestrator subagent.** The Claude Code harness caps subagent depth: a depth-1 subagent cannot itself spawn depth-2 subagents via the Agent tool. The previous design routed all work through an `architect-spec` *subagent* that was supposed to dispatch `doctrine-architect` children — that fan-out silently degraded to single-context self-loading every time. Running orchestration at skill level (depth 0) lets us spawn N `doctrine-architect` children directly. Mirrors how `/substrate:migrate` already works.

## Arguments

`<brief-path>` — path to a brief at `docs/tasks/ongoing/<feature>/<feature>-brief.md`.

## When to run

- Project has been scaffolded (`/substrate:init` completed).
- A brief exists at the expected path, filled per `docs/protocol/sdd/brief-format.md`.
- The feature is large enough to justify a multi-phase spec with gates. (For small features, `/substrate:quick-spec` is simpler.)

## When to REFUSE

| Signal | Redirect |
|--------|----------|
| `docs/doctrine/` missing | Project not initialized. Run `/substrate:init` first. |
| `docs/protocol/sdd/` missing | SDD protocol not initialized. Run `/substrate:init` first. |
| Brief path doesn't exist | Ask the user for the correct path, or create the brief from `docs/protocol/sdd/templates/brief-template.md`. |
| Brief's required sections empty (User Story, Constraints, References per `brief-format.md` §4) | Ask the user to fill them in first — do not run Q&A over an empty brief. |
| No doctrines discoverable (no manifest AND glob `docs/doctrine/**/*-doctrine.md` returns nothing) | Tell the user to run `/substrate:init` — the project's doctrine tree is missing. |

## Protocol You Operate Under

- **Brief format**: `docs/protocol/sdd/brief-format.md`
- **Spec content standard**: `docs/protocol/sdd/_SPEC-STANDARD.md`
- **Execution grammar**: `docs/protocol/sdd/execution-format.md` (phases → steps → verify → gate)
- **Spec template**: `docs/protocol/sdd/templates/spec-template.md`

If any of these files are missing, REFUSE per the table above.

## Workflow

### Step 1 — Validate the brief

Confirm the brief path was passed. If not, ask for it.

Read the brief. Verify it contains the required sections per `docs/protocol/sdd/brief-format.md` §4:

- Header (Author, Date, Status)
- User Story
- Constraints
- References

If any required section is missing or empty, surface the gaps and ask the user to fill them before continuing.

### Step 2 — Verify project state

```bash
# Protocol dir present AND at least one doctrine discoverable (manifest preferred, glob fallback).
test -d docs/protocol/sdd && test -d docs/doctrine && \
  ( test -f docs/doctrine/doctrine-manifest.yaml || \
    find docs/doctrine -type f -name '*-doctrine.md' -print -quit | grep -q . ) \
  || echo "NOT_INITIALIZED"
```

If output is `NOT_INITIALIZED`, REFUSE.

### Step 3 — Discover doctrines

Resolve the project's doctrines via this fallback order:

1. **Manifest.** If `docs/doctrine/doctrine-manifest.yaml` exists, parse it. Each entry has:
   - `id`: short unique identifier (e.g., `backend`, `infra`)
   - `name`: human-readable label
   - `path`: relative path to the doctrine `.md` file
   - `triggers`: list of brief-content keywords (optional; if absent, the doctrine is always considered relevant)
   - `summary`: short blurb to read before deciding to dispatch
   - `specialist`: agent name to dispatch (optional; defaults to `doctrine-architect`)
   - `layer-hint`: one of `domain | backend | frontend | infra | cross-cutting` (optional; if absent, infer from content)
2. **Glob.** Else, glob `docs/doctrine/**/*-doctrine.md`. Each match is a doctrine; the basename minus `-doctrine.md` is its `id`. No triggers — all matches are considered relevant.

The spec you produce MUST align with every discovered doctrine that's relevant to the brief.

### Step 4 — Socratic Q&A

Resolve ambiguity through interactive Q&A with the user. Focus on:

- **Open Questions** listed in the brief
- **Invariants** not yet explicit (e.g. "must this operation be idempotent?")
- **Boundaries** ("what happens when the user does X while Y is in flight?")
- **Trust boundaries** (authenticated vs. public, rate limits, admin-only)
- **Failure modes** (what can go wrong, how do we recover, what's the rollback)

Keep questions tight — one or two at a time, not a wall of text. End every question with `[type 'default' to let me decide sensible defaults]`. If the user picks `default`, choose a reasonable value grounded in the brief + doctrines and continue. Continue until you can draft a spec whose acceptance criteria are binary pass/fail.

Record all Q&A resolutions inline in the conversation — they're the input to Step 5.

### Step 5 — Filter doctrines + dispatch architects (parallel)

Walk every discovered doctrine. For each:

- If the manifest declares `triggers:` for this doctrine, scan the brief + Q&A resolutions for matches. If any trigger matches, the doctrine is **relevant**. If none match, skip it.
- If the manifest does not declare triggers (or no manifest is present), read the doctrine's `summary` (or first paragraph) and decide whether the brief touches its scope. When uncertain, treat as relevant — empty recommendations are cheap.

For each relevant doctrine, dispatch its declared `specialist` (default `doctrine-architect`) **in parallel** via the Agent tool — a single message with N tool calls. Pass each architect:

- `doctrine-path` (from the manifest's `path:` or the glob match)
- `doctrine-id`
- `doctrine-summary` (if available)
- `layer-hint` (if the manifest declares one)
- The full brief
- All Q&A resolutions from Step 4

Each architect returns structured recommendations per `agents/doctrine-architect.md`'s output format.

### Step 6 — Mediate cross-doctrine dependencies

If an architect flags a cross-doctrine dependency, mediate: dispatch the foreign doctrine's architect with the dependency as additional context. Repeat until no unresolved cross-doctrine dependencies remain.

Cap: 3 mediation rounds. If not converged, surface the conflict to the user and ask for a decision before proceeding.

### Step 7 — Compose the spec

Synthesize architect outputs into a spec following `docs/protocol/sdd/templates/spec-template.md`.

**Architecture section**: one subsection per doctrine that returned recommendations, ordered by `layer-hint` (`domain` → `backend` → `frontend` → `infra`, with `cross-cutting` woven into every subsection rather than getting its own).

**Prompt Execution Strategy section** MUST follow `execution-format.md` grammar: phases → steps → `##### Verify` blocks → `#### Gate` per phase. Derive phases from `layer-hint` groups present in architect outputs:

1. **Phase per `domain` doctrine** — value objects, pure functions, unit tests in `test/unit/domain/`
2. **Phase per `backend` doctrine** — schema, queries/mutations/actions, `convex-test` cases
3. **Phase per `frontend` doctrine** — hooks, routes, components, styling
4. **Phase per `infra` doctrine** — manifests, deployment, secrets, observability
5. **Phase: Integration + E2E** — wire everything, Playwright end-to-end verification
6. **Phase: Doctrine Review** — MANDATORY per spec-template. Reviews compliance against every relevant doctrine.

`cross-cutting` doctrines (e.g. testing, error-handling) get woven into the Verify blocks of every phase rather than receiving their own phase.

Every step MUST have a Verify block. Baseline verification commands for a substrate project:

- `pnpm app:compile`
- `pnpm app:test`
- `pnpm app:lint`

Feature-specific verification should target the new files only: `pnpm app:test test/unit/domain/<feature>`.

### Step 8 — Write the spec

Write the finished spec to `docs/tasks/ongoing/<feature>/<feature>-spec.md` (sibling of the brief).

### Step 9 — Hand off to execution

Print this message verbatim to the user:

```
✔ Spec written.

Path: docs/tasks/ongoing/<feature>/<feature>-spec.md

Open a NEW terminal in this directory and run:

  claude /substrate:execute docs/tasks/ongoing/<feature>/<feature>-spec.md

The fresh session picks up the spec and executes it phase-by-phase with
verification gates. Opening a new terminal (not /clear) gives the executor
a clean context window — critical for long specs.
```

Do NOT execute the spec yourself in this session. The handoff is the whole point.

## Constraints

- MUST validate the brief before doing anything else. Q&A and architect dispatch over an empty brief produces a worthless spec.
- MUST discover doctrines via the manifest-or-glob fallback at every invocation. The previous three-doctrine hardcoded list is removed; if a project still has only those three flat files, the glob fallback finds them.
- MUST dispatch every relevant doctrine's specialist **in parallel** via a single Agent-tool message with N tool calls. Sequential dispatch is wrong — it costs N× the wall-clock and yields no benefit.
- MUST run all orchestration at skill level (depth 0). Do NOT delegate to an intermediate `architect-spec` subagent — the harness depth-cap will block its child dispatches. This is the whole reason the architect-spec subagent was removed.
- MUST produce specs that pass every item in the Spec Completeness Checklist (per `_SPEC-STANDARD.md`).
- MUST include the mandatory Doctrine Review phase as the final phase.
- MUST NOT invent facts during composition — if architects didn't return a piece, ask the user or re-dispatch the relevant architect.
- MUST NOT execute the spec. This skill only produces it.
- MUST NOT invite the user to run `/substrate:execute` in the SAME session — the fresh-context benefit is the core design.
- MUST NOT write code or files beyond the spec document itself.
- MUST use the naming convention `<feature>-spec.md` per `brief-format.md` §3.
- MUST offer the default-escape suffix `[type 'default' to let me decide sensible defaults]` on every Q&A question. If the user picks `default`, choose a reasonable value and note the default in the composed spec's Change Log so it's reviewable.
- SHOULD stay concise during Q&A — this is the user's time, not a chatbot exercise.
- SHOULD treat unmatched manifest triggers as "doctrine not relevant" — over-dispatching N architects when the brief touches 3 layers wastes context budget and dilutes the spec with empty-recommendation sections.
- SHOULD surface architect-flagged conflicts to the user when cross-doctrine mediation can't converge within 3 rounds, rather than picking a side silently.
