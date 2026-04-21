---
name: init
description: "Scaffold a new Substrate project in an empty directory. Drops a Vite + Convex + Clerk + TanStack Router + Tailwind v4 kernel that follows DDD, railway-oriented programming, and the testing pyramid. Runs product-focused Socratic Q&A, copies doctrines and SDD protocol into docs/, and generates the twin Gemini AI Studio scaffolding prompt plus runtime AI system prompt. Invoke in a blank folder before /substrate:migrate."
---

# /substrate:init

Scaffold a new substrate project from an empty directory through the start of stage 1.

## When to run

- The current directory is empty (or contains only `.git/`, `CLAUDE.md`, `.DS_Store`, `README.md`).
- The user wants to start a new full-stack product with substrate.

## When to REFUSE

Detect stage by filesystem. If ANY of these exist, STOP and redirect the user instead of scaffolding over their work:

| Signal | Redirect |
|--------|----------|
| `package.json` exists | Already scaffolded. Run `/substrate:quick-spec` or `/substrate:architect-spec`. |
| `prototype/` directory exists | Stage 2 — run `/substrate:migrate`. |
| `src/` directory with code exists | Stage 3 — run `/substrate:deploy` or `/substrate:quick-spec`. |
| `convex/` or `domain/` exists | Project is already initialized. Pick a specific skill for the work you want to do. |

## Workflow

### Step 1. Confirm the directory is scaffold-ready

Run `ls -la` and inspect. Ignore `.git`, `CLAUDE.md`, `.DS_Store`, `README.md` (these are fine to preserve). If anything else is present, stop and ask the user whether to proceed anyway or move to a fresh directory.

### Step 2. Locate the substrate plugin

`scaffold.sh` lives in the substrate plugin's `scripts/` directory. Resolve `SUBSTRATE_ROOT` by searching known install paths. Run:

```bash
for candidate in \
  "$HOME/.claude/plugins/substrate" \
  "$PWD/.claude/plugins/substrate" \
  "${SUBSTRATE_ROOT:-}"; do
  if [ -n "$candidate" ] && [ -f "$candidate/scripts/scaffold.sh" ]; then
    echo "FOUND: $candidate"
    break
  fi
done
```

If no path is found, ask the user where the substrate plugin repo lives on their machine (e.g. `~/code/substrate`) and use that as `SUBSTRATE_ROOT`.

### Step 3. Socratic Q&A — project basics

Ask the user these two (in one turn):

1. **Project slug** (used for folder name, `package.json` name, GitHub repo, Vercel slug). Kebab-case, e.g. `gravy-app`.
2. **One-line description** (for the README and Vercel project description).

### Step 4. Socratic Q&A — product details

Focus on the **product**, not the technology. The user is non-technical — skip jargon. Walk through these, 1–2 per turn, probing when answers are vague:

1. **Product name** — the user-facing name (may differ from the slug: e.g. "Gravy" vs `gravy-app`).
2. **One-line pitch** — what does it do in plain language? (e.g. "A marketplace to discover, list, and review poutine stores across Canada.")
3. **Primary users (personas)** — 1–3 roles. Who uses it and why?
4. **Primary user flows** — 3–5 numbered flows end-to-end. ("1. Land on feed. 2. Browse map. 3. Submit review.")
5. **Core entities** — 3–6 nouns with a few key fields each. ("User {id, handle}, PoutineStore {id, name, address, gallery}, Review {id, rating, body}.")
6. **Key pages** — 4–8 top-level pages.
7. **Look & feel** — 2–3 adjectives plus a reference if any. ("Warm, food-forward, brutalist cards, Canadian-neutral voice.")
8. **AI features** — yes/no. If yes:
   - List 2–5 AI capabilities (e.g. "moderate reviews, draft store descriptions, power semantic search").
   - Note the desired tone for AI-generated output (e.g. "grounded, never overclaim, Grade 8 reading level").

Keep each turn tight. Don't dump all eight questions at once.

### Step 5. Run scaffold.sh

With `SUBSTRATE_ROOT` resolved and project basics in hand, invoke the scaffold script:

```bash
SUBSTRATE_ROOT="<resolved path>" bash "$SUBSTRATE_ROOT/scripts/scaffold.sh" "<project-slug>" "<one-line-description>"
```

This performs:
- Template tree copy into the current directory
- `docs/doctrine/` populated from substrate's `references/doctrines/`
- `docs/protocol/sdd/` populated from substrate's `references/sdd-protocol/`
- `{{PROJECT_NAME}}` / `{{PROJECT_DESCRIPTION}}` substituted in `package.json`, `README.md`, `index.html`
- `pnpm install` + `pnpm app:compile` + `pnpm app:test`

If the script exits non-zero, STOP and report the error. Do not proceed to step 6. Common failure modes:
- `pnpm` not installed → tell the user to install pnpm first.
- Network timeout during `pnpm install` → retry is safe.
- Test failure → surface the test output; this is a bug in the substrate templates, not user error.

### Step 6. Fill the product prompt templates

The scaffold leaves two files with `{{...}}` tokens for product-specific content. Fill them using the Q&A answers via the Edit tool:

**`docs/product/ai-studio-prompt.md`** (the Gemini Build prompt):
- `{{PRODUCT_NAME}}` — user-facing name
- `{{ONE_LINE_DESCRIPTION}}` — the pitch
- `{{PERSONA_DESCRIPTION}}` — 1–2 sentences per persona
- `{{USER_FLOWS}}` — numbered list (markdown)
- `{{ENTITIES_AND_FIELDS}}` — entity list with key fields
- `{{KEY_PAGES}}` — bulleted list
- `{{UI_STYLE_NOTES}}` — short paragraph

**`docs/product/system-prompt.md`** (runtime AI persona):
- `{{PRODUCT_NAME}}`, `{{ONE_LINE_DESCRIPTION}}` — same values as above
- `{{AI_CAPABILITIES}}` — short one-line summary
- `{{PERSONA_BULLET_LIST}}` — bulleted, indent two spaces (nested inside `<primary_users>` XML)
- `{{ENTITY_BULLET_LIST}}` — bulleted, same indent
- `{{CAPABILITIES_LIST}}` — bulleted
- `{{TONE_NOTES}}` — bulleted

If the user said **no AI features**, add a note at the top of `system-prompt.md`:

```markdown
> This file is a placeholder. The project does not currently include AI
> assistant features. Delete this file or fill in the tokens if you add
> AI features later.
```

Leave the `{{...}}` tokens in place (unfilled) for the no-AI case.

### Step 7. Offer GitHub push

Ask: "Want to push to GitHub now? (y/n, default y)"

If yes, ask for visibility (public or private, default private). Run:

```bash
bash "$SUBSTRATE_ROOT/scripts/init-github.sh" "<project-slug>" "<visibility>"
```

Report the returned repo URL. If no, skip — the user can run the script themselves later.

### Step 8. Print handoff instructions

End with a message the user can act on immediately. Format it exactly like this:

```
✔ Substrate project initialized.

Kernel: green (domain/ + test/ + docs/doctrine/ + docs/protocol/sdd/)
Repo:   <GitHub URL if pushed, else "not pushed yet">

Your AI Studio scaffolding prompt is at:
  docs/product/ai-studio-prompt.md

Next steps:
  1. Open https://aistudio.google.com/ and click the "Build" tab.
  2. Copy the contents of docs/product/ai-studio-prompt.md (everything below the --- line).
  3. Paste into the Build description box.
  4. Iterate in the AI Studio UI until the look is right.
  5. Download the project as a ZIP.
  6. Extract the ZIP contents into /prototype at this repo's root.
  7. Return here and run /substrate:migrate.
```

Then show the contents of `docs/product/ai-studio-prompt.md` in-line so the user can copy without opening a second file.

## Constraints

- MUST NOT proceed if the directory is not scaffold-ready (see §"When to REFUSE").
- MUST invoke `scaffold.sh` via Bash rather than copying files individually. Copying via many Write calls wastes tool budget and risks drift from the canonical template tree.
- MUST NOT invent product details. If the user skips a question, either ask it again once, or write a placeholder and flag it in the final summary so they know to revisit.
- MUST NOT commit or push to GitHub unless the user explicitly agrees in step 7.
- MUST NOT alter files outside the current project directory.
- MUST print the full handoff instructions (step 8) even if the scaffold succeeded silently — the user needs the Gemini AI Studio next-step.
- SHOULD keep Q&A tight — 1–2 questions per turn, conversational, probing when answers are vague.
- SHOULD skip jargon (no "Convex mutation", no "TanStack Router route") unless the user signals comfort with it.
