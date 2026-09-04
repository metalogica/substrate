---
description: "Scaffold a new doctrine in a substrate project. Asks where the doctrine should live, what it governs, which trigger keywords activate it, which file globs it governs (`paths`, optional — the key graph-time doctrine binding reads), and what layer-hint it carries. Writes a doctrine stub with Scope / Binding Rules / Recommended Practices / Anti-patterns / Examples sections, and either appends an entry to the existing doctrine-manifest.yaml or offers to bootstrap a manifest from scratch (registering every existing *-doctrine.md plus the new one) so the manifest stays the single source of truth. Also retires a doctrine — `--retire <name>` confirms the blast radius, folds still-true rules into surviving doctrines, removes the manifest entry, git-mv's the file to docs/doctrine/archive/, and sweeps its now-orphaned ambient pointer stub, so a dead doctrine stops being binding. Does not commit — the user reviews first."
---

# /substrate/add-doctrine

Scaffold a new doctrine category. Use this when a project has matured past the three baseline doctrines and needs a new horizontal axis (infra, claw, treasury, security, monorepo, etc.).

The command ships a doctrine stub + a manifest entry — both written, neither committed. After running, the user fills in the stub's `<fill in>` placeholders with real rules, then commits.

> **Reused by `/substrate/synthesize-session`.** Steps 3 (write to the convention path) + 4 (manifest append / bootstrap) are the canonical *doctrine writer*. Synthesis's Step 4b invokes that writer **non-interactively** — it has already derived the Q1–Q6 answers from its coverage map (Q6 `paths` included — it may legitimately derive none, in which case the writer omits the key) and passes **session-filled** sections in place of the `<fill in>` placeholders, so the "keep the stub placeholder-heavy" rule below applies only to the interactive (human-invoked) path. When editing Steps 3–4, keep the content a *parameter* of the writer, not a hardcoded stub, so both callers stay in sync.

## Arguments

`$ARGUMENTS` — the doctrine's `id` (kebab-case, e.g. `infra`, `claw-runtime`, `treasury`). The command appends `-doctrine.md` to form the filename. If the argument is missing or invalid, ask for one.

`$ARGUMENTS` starting with `--retire` — **the other arm.** `--retire <name>` does not scaffold a doctrine; it retires an existing one: strips its authority, archives its file, sweeps its ambient stub. See **Retire mode** below. The two arms share nothing but the manifest text-editor.

## When to run

- Project has been scaffolded (`docs/doctrine/` exists).
- A new architectural concern emerges that the three baseline doctrines (domain / backend / frontend) don't cover. Typical signals:
  - You're adding deployment / platform / CI-CD logic and there's no `infra-doctrine.md` yet.
  - You're building a runtime-specific subsystem (game engine, simulation, embedded protocol) and you need its rules captured.
  - You realize the same cross-cutting rule (testing, error-handling, observability) is being restated in every layer doctrine.

**When to run `--retire`:** the doctrine governs a subsystem the project deleted; two doctrines converged and one should absorb the other; or an axis turned out to be a phase, not a permanent concern. Signal: nobody has cited it in months and its rules now describe code that no longer exists.

## When to REFUSE

| Signal | Redirect |
|--------|----------|
| No `docs/doctrine/` directory | Not a scaffolded substrate project. Run `/substrate/init` first. |
| `$ARGUMENTS` is not kebab-case, or ends in `-doctrine` already | Ask the user for a clean id (e.g. `infra` not `Infra` or `infra-doctrine`). End the question with `[type 'default' to let me decide sensible defaults]`. |
| `<name>-doctrine.md` already exists somewhere under `docs/doctrine/` AND is in the manifest | Print path + manifest entry. Ask: edit existing instead, or pick a different name? (`y / n / different-name`) |
| `<name>-doctrine.md` exists but is NOT in the manifest | Don't rewrite the doctrine. Offer: "add a manifest entry for this existing doctrine only? (`y / n`)" — if `y`, jump straight to Step 4 with the existing file's path. |
| `--retire <name>` and no manifest entry with `id: <name>` | List the ids that do exist. Don't guess at a near-match — retire is destructive to authority; make the user name the right one. |
| `--retire <name>` and the entry's `path` doesn't exist on disk | The registry is already stale. Offer the *entry-only* retire (`y / n`): remove the manifest entry + sweep the stub, skip the `git mv`. |
| `--retire <name>` and the doctrine file is untracked by git | Abort. It was never in history, so there's nothing to archive — the user should just delete it and run `doctrine-skills-sync.sh`. |
| `--retire` with a dirty working tree under `docs/doctrine/` | Abort. Retire moves files and rewrites the manifest; the user needs a clean baseline to review the diff against. |

## Workflow

The default arm is **scaffold** (Steps 1–5). `--retire` skips all of it and jumps to **Retire mode** (below).

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

Six questions, one or two at a time. Every question ends with `[type 'default' to let me decide sensible defaults]`.

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

**Q6 — Governed paths (optional).** Which files does this doctrine *govern*? Comma-separated globs relative to the repo root (e.g. `convex/**, src/hooks/**`). Ask it as: "Q5 matched briefs; this matches **files** — `/substrate/graph-spec` stamps `doctrine:<id>` on every bead whose write-scope hits one of these globs, so the orchestrator can push the doctrine at the worker instead of hoping it goes looking."

- **Default-escape: omit the key.** An absent `paths` is honest; an aspirational one is a lie the binding step will act on. Never invent globs to fill the field.
- Prefer 1-3 broad globs that survive a refactor (`convex/**`), not a file list.
- Each glob must match at least one existing file — check before writing (`ls` / glob it). A glob matching nothing fails doctrine-lint rule 6. If the user names a path that doesn't exist yet, say so and either fix the glob with them or omit the key.

### Step 3 — Write the doctrine stub

Write to the path chosen in Q1. Body:

```markdown
# <Display Name> Doctrine

**Authority**: Binding
**Status**: Draft
**Last verified**: <today YYYY-MM-DD>

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
```

Don't pre-fill the `<fill in>` placeholders — leaving them visible forces the user to think about the rules rather than accept a generic template. Resolve the angle-bracket *header* values though: `<today YYYY-MM-DD>` is a substitution, not a placeholder — stamp the real date at write time, exactly like `<Display Name>`.

**No history metadata.** The stub carries **no** `## Change Log` section, no `**Version**`, no `**Date**`. A doctrine is a *living* document: it states current truth, and git owns its history — a hand-maintained changelog is the same fact in a second home, indexed by date when agents query by topic, so it rots first and silently. `**Last verified**` replaces all of it: one machine-maintainable freshness attestation, bumped when the doctrine is checked against the code. (Append-only changelogs stay correct on *immutable* artifacts — specs, per `docs/protocol/sdd/_SPEC-STANDARD.md` — which is why they live there and not here.)

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
    paths: [<glob 1>, <glob 2>]   # omit this line entirely if Q6 was default-escape
    layer-hint: <hint from Q4>   # omit this line entirely if Q4 was default-escape
```

If triggers is empty (Q5 default-escape), write `triggers: []` on one line — the orchestrator reads this as "always relevant."

`paths` is the one key with **no empty form**: write the inline `[a, b]` list when Q6 gave globs, and omit the line entirely otherwise. (`paths: []` would read as "governs nothing" — same meaning as absent, but it invites someone to fill it in later with a guess.) The parser is the same zero-dep reader that handles `pointers`, so the inline `[...]` form is required — not a block list.

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
  #   this manifest. When adding a new doctrine: use /substrate/add-doctrine
  #   to write both the file and the manifest entry atomically.

  doctrines:
  ```
- **`n`**: skip. The new doctrine is still discoverable via the glob fallback in orchestrators.

### Step 4.5 — Regenerate the ambient doctrine skills (adopt-lineage projects)

If **both** `docs/doctrine/doctrine-manifest.yaml` and `docs/scripts/doctrine-skills-sync.sh`
exist (an adopted project), run:

```bash
bash docs/scripts/doctrine-skills-sync.sh
```

This re-derives the `.claude/skills/doctrine-*/` pointer stubs from the manifest (a Claude Code
ambient surface; OpenCode sessions get passive doctrine context via `AGENTS.md`) — and keeps
doctrine-lint rule 4 (stub↔manifest parity) green. If either file is absent (init-lineage
project, or Branch B declined), skip silently — nothing to sync, and lint's rule 4 stays silent
without stubs.

### Step 5 — Handoff

Print:

```
✔ Doctrine scaffolded.

  File:           <path written in Step 3>
  Manifest:       <"updated" | "bootstrapped (N entries including this one)" | "skipped (glob fallback handles discovery)">
  Ambient skill:  <".claude/skills/doctrine-<name>/ regenerated" | "skipped (no sync script / no manifest)">
  Layer hint:     <value or "(omitted — orchestrator will infer)">
  Triggers:       <comma-separated list or "(always relevant)">

  Next:
    1. Open <path> and replace the <fill in> placeholders with real rules.
       Be concrete — MUSTs should be checkable, examples should be real code.
    2. Once filled, /substrate/architect-spec and /substrate/quick-spec will
       auto-discover this doctrine. The next brief that matches a trigger
       (or any brief, if triggers is empty) dispatches a doctrine-architect
       bound to it.
    3. Commit when ready:
         git add docs/doctrine/
         git commit -m "doctrine(<name>): initial draft"

  Note: this command does NOT commit. The stub is intentionally placeholder-
  heavy — review it first.
```

If the project has a manifest-coverage test (heuristic: `find . -name 'doctrine-manifest.test.*' -not -path '*/node_modules/*'` returns anything), append:

```
  Heads up: this project has a manifest-coverage test. The command wrote
  both the doctrine file AND the manifest entry, so the test stays green.
  If you delete one without the other, the test will fail.
```

## Retire mode (`--retire <name>`)

The **D** in doctrine CRUD. Without it a doctrine that has stopped being true keeps its binding authority, its manifest entry, and its ambient pointer stub forever — every session working in its declared scope still loads it and treats its MUSTs as law. Create/read/update were all reachable; delete was not.

**Retire is not delete.** The file survives under `docs/doctrine/archive/` for archaeology. What it loses is *authority* (the manifest entry) and *reach* (the ambient stub). Four moves, in this order: **confirm → fold → de-register + archive → sweep**.

Why the order matters: folding happens **first**, while the doctrine is still at the path every reader (and every open editor tab) expects. De-register and archive happen **together** — a manifest entry pointing into `archive/` would keep the doctrine binding from a new address, and an archived file still registered fails nothing but means nothing.

### Step R1 — Resolve + confirm

Parse the manifest for the entry with `id: <name>`; route the misses through the REFUSE table. Then print the full blast radius and take a binary gate (`y / n`, no default-escape suffix — this is an approval, not a preference):

```
Retire doctrine 'claw-runtime'?

  Manifest entry   docs/doctrine/doctrine-manifest.yaml
                   → entry removed (layer-hint: backend, 5 triggers)
  Doctrine file    docs/doctrine/claw-runtime-doctrine.md
                   → docs/doctrine/archive/claw-runtime-doctrine.md   (git mv)
  Ambient stub     .claude/skills/doctrine-claw-runtime/
                   → swept by docs/scripts/doctrine-skills-sync.sh
  Inbound links    3 files still reference claw-runtime-doctrine.md
                     AGENTS.md:41 · docs/doctrine/backend-doctrine.md:88 · README.md:12
  Surviving rules  7 MUSTs + 2 anti-patterns — I'll disposition each with you first.

  This removes the doctrine's binding authority. The file is archived, not
  deleted, and nothing is committed. (y / n)
```

Gather "inbound links" with `grep -rn '<name>-doctrine.md' --exclude-dir=.git .` — doctrine-lint's rule 3 only checks that an entry's own `pointers[]` resolve, so a cross-link *into* the retired doctrine from anywhere else is invisible to lint. Surfacing it here is the only guard. In OpenCode this matters more than in Claude Code: `AGENTS.md` is the passive doctrine surface, so a stale pointer there is read by every session.

### Step R2 — Fold the still-true rules into surviving doctrines

The reason a doctrine is being retired is almost never "all of it was wrong". Walk its `## Binding Rules (MUSTs)` and `## Anti-patterns`, and disposition each line with the user:

- `fold <target-id>` — the rule is still true and belongs to a surviving doctrine. Append it to that doctrine's matching section, rewritten in the target's voice and vocabulary. Never paste a rule that names a deleted subsystem verbatim.
- `drop` — the rule died with the code it governed.
- `keep-archived` — still interesting, not binding. It stays in the archived file; nothing to do.

Batch the dispositions in one pass (numbered list, user answers per line) rather than N round-trips. Edits to surviving doctrines are ordinary content edits — they land in the working tree alongside the rest of the retire, uncommitted.

This is the step that makes retire safe. Skipping it is how a project loses a hard-won rule in a directory move.

### Step R3 — Remove the manifest entry

Text-edit, comment-preserving — the same rule as Step 4's append, for the same reason (no comment-preserving YAML round-trip is available here).

Procedure:
1. Read `docs/doctrine/doctrine-manifest.yaml` as text.
2. Locate the `- id: <name>` line. The entry runs from there to the line before the next `- id:` at the same indentation, or to the next top-level key, or to EOF.
3. Delete exactly that line range. Leave every surrounding comment, blank line, and entry byte-identical.
4. Write back.

Watch the edges: a comment sitting *above* `- id: <name>` usually annotates that entry and should go with it; a comment on the last line before the next entry usually annotates the *next* one and must stay. When ambiguous, show the user the two-line neighbourhood and ask.

### Step R4 — Archive the doctrine file

```bash
mkdir -p docs/doctrine/archive
git mv <path-from-the-manifest-entry> docs/doctrine/archive/<name>-doctrine.md
```

Use the path from the manifest entry, not a reconstructed one — nested-convention projects keep doctrines at `docs/doctrine/architecture/<layer>/<name>-doctrine.md`, and the archive is flat regardless.

**Why `archive/` clears the registry check:** doctrine-lint's rule 1 (coverage) globs `docs/doctrine/*-doctrine.md` — one level, non-recursive. A file one directory down is invisible to it, so it needs no manifest entry. That is precisely the property retire wants: present on disk, absent from the registry. Do not flatten `archive/` back up, and do not add an `archive:` key to the manifest — presence in the manifest *is* authority.

Then prepend a banner to the archived file so nobody reads it as live doctrine:

```markdown
> **RETIRED.** This doctrine is no longer binding and is not registered in
> `docs/doctrine/doctrine-manifest.yaml`. It is kept for archaeology only.
> Still-true rules were folded into: <target doctrines from R2, or "none">.
> Retired by `/substrate/add-doctrine --retire <name>`.
```

Leave the rest of the file untouched — including its `**Authority**: Binding` header if it has one. The banner above it is the current fact; rewriting the body would destroy the archaeology the archive exists for. (`git log --follow docs/doctrine/archive/<name>-doctrine.md` carries the history — which is exactly why the stub carries no changelog of its own.)

### Step R5 — Sweep the ambient stub

```bash
bash docs/scripts/doctrine-skills-sync.sh
```

The sync script's sweep deletes any **managed** stub under `.claude/skills/doctrine-*/` whose id is no longer in the manifest — so removing the entry in R3 is what makes the stub disappear here. Never `rm` the stub directory by hand: an unmanaged file at that path is a deliberate hand-written skill the script refuses to touch, and deleting it manually destroys someone's work. If the script is absent (init-lineage project), skip silently.

The stubs are a Claude Code ambient surface; OpenCode sessions get passive doctrine context via `AGENTS.md`. Run the sweep anyway — the repo is shared between both tools, and leaving an orphaned stub fails doctrine-lint rule 4 for whoever opens it in Claude Code next.

### Step R6 — Verify

```bash
bash docs/scripts/doctrine-lint.sh
```

Must be green before handoff. The three ways it can be red here: the entry deletion clipped a neighbouring entry (rule 2), the file didn't actually move so it's now unregistered-but-present (rule 1), or the sync script wasn't run so a managed stub outlives its entry (rule 4).

### Step R7 — Handoff

```
✔ Doctrine retired: claw-runtime

  Manifest        entry removed (docs/doctrine/doctrine-manifest.yaml, 8 → 7 entries)
  Archived        docs/doctrine/claw-runtime-doctrine.md
                  → docs/doctrine/archive/claw-runtime-doctrine.md
  Rules folded    3 → backend-doctrine.md §2 · 1 → infra-doctrine.md §4
                  4 dropped · 1 kept archived
  Ambient stub    .claude/skills/doctrine-claw-runtime/ removed
                  doctrine-skills-sync.sh: ok — 0 written, 7 unchanged, 1 removed
  Lint            doctrine-lint: ok — 7 doctrines registered, all paths +
                  pointers resolve, 7 ambient stub(s) in sync
  Inbound links   3 still point at claw-runtime-doctrine.md — update by hand:
                    AGENTS.md:41 · docs/doctrine/backend-doctrine.md:88 · README.md:12

  Next:
    1. Fix the 3 inbound links above (lint can't see them).
    2. Review the folded rules in the surviving doctrines — they were
       rewritten in the target's voice, not pasted.
    3. Commit when ready (the git mv is already staged; nothing is committed):
         git add docs/doctrine/ .claude/skills/
         git commit -m "doctrine(claw-runtime): retire — folded into backend + infra"
```

Note the one asymmetry with the scaffold arm's "does not commit" rule: `git mv` inherently **stages** the rename. Staging is not committing — the working tree is still the user's to review, amend, or `git reset`. Say so in the handoff rather than leaving them to discover a dirty index.

## Constraints

- **MUST** validate `$ARGUMENTS` is kebab-case and doesn't already end in `-doctrine`. The command adds that suffix; the id is the bare name.
- **MUST NOT** clobber an existing `<name>-doctrine.md`. Check before writing; if a file exists, route through the REFUSE table.
- **MUST NOT** emit changelog or version headers in a doctrine stub — no `## Change Log`, no `**Version**`, no `**Date**`. Doctrines are living documents; git is their history. Emit `**Last verified**: <today YYYY-MM-DD>` instead, resolved to the real date at write time. (Append-only history belongs on immutable artifacts — specs — not here.)
- **MUST** preserve existing manifest comments and entries when appending. Use text-edit, not YAML round-trip serialization — comment-preserving YAML libraries are not available in this context.
- **MUST** run `docs/scripts/doctrine-skills-sync.sh` after a manifest write when the script exists (Step 4.5) — a manifest that gains an entry without regenerated stubs fails doctrine-lint rule 4 in adopted repos. Never write a `.claude/skills/doctrine-*/` stub by hand.
- **MUST NOT** commit. The user reviews the stub first; commits are their gesture, not the command's.
- **MUST** offer the default-escape suffix `[type 'default' to let me decide sensible defaults]` on Q&A questions (Q1-Q6). Binary approval gates (`y / n`) are exempt.
- **MUST** treat `paths` (Q6) as optional and verifiable: omit the key entirely when the user default-escapes, and never write a glob that matches no existing file. Lint rule 6 fails an unmatched glob, and a glob that silently governs nothing is worse than an absent key — the binding step reports success either way.
- **MUST** detect the project's nesting convention (flat / nested / mixed) and default the path question accordingly. Forcing flat onto a nested project is a real bug.
- **MUST** validate `layer-hint` against the canonical set `{domain | backend | frontend | infra | cross-cutting}`. If the user proposes a different value, ask them to map onto one of the five or accept omission.
- **SHOULD** keep the doctrine stub placeholder-heavy **on the interactive (human-invoked) path**. Pre-filled examples train the user to accept the template rather than think about the rules. The point of the stub is to *force* engagement, not avoid it. This does **not** apply when `/substrate/synthesize-session`'s Step 4b reuses the Step 3+4 writer — there the sections are intentionally session-filled, because the context that fills them is about to evaporate.
- **SHOULD** surface manifest-coverage tests if present (heuristic grep), so the user knows the dual-write is enforcement-aware.
- **MUST NOT** delete a doctrine file on `--retire`. Archive it to `docs/doctrine/archive/` via `git mv`. Retire strips authority and reach, not the record.
- **MUST** take an explicit `y / n` confirmation before any retire mutation, showing the full blast radius first (manifest entry, file move, ambient stub, inbound links, rule count). Retire is the only destructive arm this command has.
- **MUST** fold the still-true rules into surviving doctrines **before** archiving (Step R2). A retire that silently drops a live rule is worse than no retire at all.
- **MUST** remove the manifest entry and archive the file in the same run — never one without the other. An archived-but-registered doctrine fails lint rule 2; a de-registered-but-in-place one fails rule 1.
- **MUST** sweep the ambient stub by re-running `docs/scripts/doctrine-skills-sync.sh` after the manifest deletion (Step R5), never by hand-`rm`ing `.claude/skills/doctrine-<name>/`. The script refuses to touch unmanaged files; a manual delete does not.
- **MUST** end a retire with `docs/scripts/doctrine-lint.sh` green before printing the handoff.
- **SHOULD** report inbound links to the retired doctrine as manual follow-up. Lint rule 3 only validates an entry's own `pointers[]`, so cross-links from `AGENTS.md`, READMEs, and sibling doctrines rot undetected.
