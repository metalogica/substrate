---
name: add-doctrine
description: "Scaffold a new doctrine in a substrate project. Asks where the doctrine should live, what it governs, which trigger keywords activate it, and what layer-hint it carries. Writes a doctrine stub with Scope / Binding Rules / Recommended Practices / Anti-patterns / Examples sections, and either appends an entry to the existing doctrine-manifest.yaml or offers to bootstrap a manifest from scratch (registering every existing *-doctrine.md plus the new one) so the manifest stays the single source of truth. Does not commit — the user reviews the stub first."
---

# /substrate:add-doctrine

Scaffold a new doctrine category. Use this when a project has matured past the three baseline doctrines and needs a new horizontal axis (infra, claw, treasury, security, monorepo, etc.).

The skill ships a doctrine stub + a manifest entry — both written, neither committed. After running, the user fills in the stub's `<fill in>` placeholders with real rules, then commits.

> **Reused by `/substrate:synthesize-session`.** Steps 3 (write to the convention path) + 4 (manifest append / bootstrap) are the canonical *doctrine writer*. Synthesis's Step 4b invokes that writer **non-interactively** — it has already derived the Q1–Q5 answers from its coverage map and passes **session-filled** sections in place of the `<fill in>` placeholders, so the "keep the stub placeholder-heavy" rule below applies only to the interactive (human-invoked) path. When editing Steps 3–4, keep the content a *parameter* of the writer, not a hardcoded stub, so both callers stay in sync.

## Arguments

`<name>` — the doctrine's `id` (kebab-case, e.g. `infra`, `claw-runtime`, `treasury`). The skill appends `-doctrine.md` to form the filename. If `<name>` is missing or invalid, the skill asks for one.

## When to run

- Project has been scaffolded (`docs/doctrine/` exists).
- A new architectural concern emerges that the three baseline doctrines (domain / backend / frontend) don't cover. Typical signals:
  - You're adding deployment / platform / CI-CD logic and there's no `infra-doctrine.md` yet.
  - You're building a runtime-specific subsystem (game engine, simulation, embedded protocol) and you need its rules captured.
  - You realize the same cross-cutting rule (testing, error-handling, observability) is being restated in every layer doctrine.

## When to REFUSE

| Signal | Redirect |
|--------|----------|
| No `docs/doctrine/` directory | Not a scaffolded substrate project. Run `/substrate:init` first. |
| `<name>` is not kebab-case, or ends in `-doctrine` already | Ask the user for a clean id (e.g. `infra` not `Infra` or `infra-doctrine`). End the question with `[type 'default' to let me decide sensible defaults]`. |
| `<name>-doctrine.md` already exists somewhere under `docs/doctrine/` AND is in the manifest | Print path + manifest entry. Ask: edit existing instead, or pick a different `<name>`? (`y / n / different-name`) |
| `<name>-doctrine.md` exists but is NOT in the manifest | Don't rewrite the doctrine. Offer: "add a manifest entry for this existing doctrine only? (`y / n`)" — if `y`, jump straight to Step 4 with the existing file's path. |

## Workflow

### Step 1 — Discover current state

Run in parallel:

```bash
test -f docs/doctrine/doctrine-manifest.yaml && echo "manifest:yes" || echo "manifest:no"
find docs/doctrine -type f -name '*-doctrine.md'
```

From the find output, detect the project's nesting convention:

- **flat** — most existing doctrines are at `docs/doctrine/<name>-doctrine.md`
- **nested** — most existing doctrines are at `docs/doctrine/architecture/<layer>/<name>-doctrine.md` (clawcraft pattern)
- **mixed** — both shapes present; ask the user later

This determines the default in Step 2's path question. Don't force flat onto a project that uses nested, or vice versa.

### Step 2 — Socratic Q&A

Five questions, one or two at a time. Every question ends with `[type 'default' to let me decide sensible defaults]`.

**Q1 — Path.** Where should the doctrine live?

- If detected convention is **flat**: default `docs/doctrine/<name>-doctrine.md`.
- If **nested**: ask for `<layer>` (e.g. `web-app`, `infra`, `treasury-app`), then `docs/doctrine/architecture/<layer>/<name>-doctrine.md`.
- If **mixed**: present both options.
- Default-escape: pick the detected convention's default.

**Q2 — Human-readable name.** What's the display name for this doctrine? Default = title-case(name) (e.g. `infra` → "Infra"; `claw-runtime` → "Claw Runtime").

**Q3 — One-sentence summary.** What does this doctrine govern, in one sentence? This becomes both the manifest's `summary` field and the stub's Scope intro.

**Q4 — Layer hint.** Which of these does the doctrine belong to?
`domain | backend | frontend | infra | cross-cutting`

Default-escape: omit (the orchestrator will infer from content). Validate the answer against the canonical set; if the user types something else, ask them to map onto one of the five or accept omission.

**Q5 — Triggers.** Comma-separated keywords (3-8 recommended) that, when matched in a brief, activate this doctrine. Default-escape: empty list, mark "always relevant". Normalize: trim whitespace, dedupe, lowercase.

### Step 3 — Write the doctrine stub

Write to the path chosen in Q1. Body:

```markdown
# <Display Name> Doctrine

**Authority**: Binding
**Version**: 0.1.0
**Date**: <today YYYY-MM-DD>
**Status**: Draft

---

## 1. Scope

### In scope
- <summary from Q3 — the one-sentence answer, rewritten as a bullet>
- <fill in: additional concerns this doctrine governs>

### Out of scope
- <fill in: what other doctrines own>

---

## 2. Binding Rules (MUSTs)

- MUST: <fill in hard rule>
- MUST: <fill in hard rule>
- MUST NOT: <fill in hard prohibition>

---

## 3. Recommended Practices (SHOULDs)

- SHOULD: <fill in preferred approach>
- SHOULD: <fill in preferred approach>

---

## 4. Anti-patterns

- <fill in pattern to avoid> — <why it's harmful>

---

## 5. Examples

<fill in concrete examples grounding the rules above. Code snippets, file shapes, configuration samples — whatever makes the rules unambiguous to a future agent reading this doctrine cold.>

---

## 6. Change Log

| Version | Date | Changes |
|---------|------|---------|
| 0.1.0 | <today> | Initial draft (scaffolded by /substrate:add-doctrine) |
```

Don't pre-fill the `<fill in>` placeholders — leaving them visible forces the user to think about the rules rather than accept a generic template.

### Step 4 — Update the manifest

Branch on whether the manifest exists:

**Branch A — Manifest exists.** Append a new entry under the `doctrines:` key by text-edit (not YAML serialization — that would normalize comments and whitespace).

Procedure:
1. Read `docs/doctrine/doctrine-manifest.yaml` as text.
2. Find the end of the last existing entry under `doctrines:`. The last entry ends at the line before either (a) the next top-level key, (b) end-of-file, or (c) a line containing only whitespace followed by non-list content.
3. Insert the new entry below, matching the existing indentation (typically `  -` for the entry marker and `    ` for fields).
4. Write back.

New entry shape:

```yaml
  - id: <name>
    name: <display name from Q2>
    path: <path from Q1, relative to repo root>
    summary: >
      <summary from Q3>
    triggers:
      - <trigger 1>
      - <trigger 2>
    layer-hint: <hint from Q4>   # omit this line entirely if Q4 was default-escape
```

If triggers is empty (Q5 default-escape), write `triggers: []` on one line — the orchestrator reads this as "always relevant."

**Branch B — Manifest absent.** Ask the user (binary approval gate, no default-escape suffix):

> No manifest detected. Bootstrap one now? It will register the new doctrine + every existing `*-doctrine.md` already in the tree, so the manifest becomes the single source of truth instead of relying on the glob fallback. (`y / n`)

- **`y`**: scan `docs/doctrine/**/*-doctrine.md`. Build entries for each existing doctrine with `name = title-case(id)`, `path = <relative path>`, `summary = "(not yet filled in)"`, `triggers: []`, no `layer-hint`. Add the new doctrine's entry too. Write to `docs/doctrine/doctrine-manifest.yaml` with this header:
  ```yaml
  # Doctrine Manifest
  # Version: 0.1.0
  #
  # Enables orchestrators (architect-spec, quick-spec, migrate) to select
  # relevant doctrines based on brief content without preloading all
  # documentation.
  #
  # Usage:
  #   1. Orchestrator scans brief for trigger keywords
  #   2. Matches triggers → identifies relevant doctrines
  #   3. Dispatches one doctrine-architect per relevant doctrine in parallel
  #
  # Maintenance invariant:
  #   Every *-doctrine.md under docs/doctrine/ SHOULD have an entry in
  #   this manifest. When adding a new doctrine: use /substrate:add-doctrine
  #   to write both the file and the manifest entry atomically.

  doctrines:
  ```
- **`n`**: skip. The new doctrine is still discoverable via the glob fallback in orchestrators.

### Step 5 — Handoff

Print:

```
✔ Doctrine scaffolded.

  File:           <path written in Step 3>
  Manifest:       <"updated" | "bootstrapped (N entries including this one)" | "skipped (glob fallback handles discovery)">
  Layer hint:     <value or "(omitted — orchestrator will infer)">
  Triggers:       <comma-separated list or "(always relevant)">

  Next:
    1. Open <path> and replace the <fill in> placeholders with real rules.
       Be concrete — MUSTs should be checkable, examples should be real code.
    2. Once filled, /substrate:architect-spec and /substrate:quick-spec will
       auto-discover this doctrine. The next brief that matches a trigger
       (or any brief, if triggers is empty) dispatches a doctrine-architect
       bound to it.
    3. Commit when ready:
         git add docs/doctrine/
         git commit -m "doctrine(<name>): initial draft"

  Note: this skill does NOT commit. The stub is intentionally placeholder-
  heavy — review it first.
```

If the project has a manifest-coverage test (heuristic: `find . -name 'doctrine-manifest.test.*' -not -path '*/node_modules/*'` returns anything), append:

```
  Heads up: this project has a manifest-coverage test. The skill wrote
  both the doctrine file AND the manifest entry, so the test stays green.
  If you delete one without the other, the test will fail.
```

## Constraints

- **MUST** validate `<name>` is kebab-case and doesn't already end in `-doctrine`. The skill adds that suffix; the id is the bare name.
- **MUST NOT** clobber an existing `<name>-doctrine.md`. Check before writing; if a file exists, route through the REFUSE table.
- **MUST** preserve existing manifest comments and entries when appending. Use text-edit, not YAML round-trip serialization — comment-preserving YAML libraries are not available in this context.
- **MUST NOT** commit. The user reviews the stub first; commits are their gesture, not the skill's.
- **MUST** offer the default-escape suffix `[type 'default' to let me decide sensible defaults]` on Q&A questions (Q1-Q5). Binary approval gates (`y / n`) are exempt.
- **MUST** detect the project's nesting convention (flat / nested / mixed) and default the path question accordingly. Forcing flat onto a nested project is a real bug.
- **MUST** validate `layer-hint` against the canonical set `{domain | backend | frontend | infra | cross-cutting}`. If the user proposes a different value, ask them to map onto one of the five or accept omission.
- **SHOULD** keep the doctrine stub placeholder-heavy **on the interactive (human-invoked) path**. Pre-filled examples train the user to accept the template rather than think about the rules. The point of the stub is to *force* engagement, not avoid it. This does **not** apply when `/substrate:synthesize-session`'s Step 4b reuses the Step 3+4 writer — there the sections are intentionally session-filled, because the context that fills them is about to evaporate.
- **SHOULD** surface manifest-coverage tests if present (heuristic grep), so the user knows the dual-write is enforcement-aware.
