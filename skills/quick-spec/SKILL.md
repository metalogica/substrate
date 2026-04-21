---
name: quick-spec
description: "Lightweight single-feature iteration loop for substrate projects. Plan (skeleton-of-thought grounded in relevant doctrine) → implement → verify (compile + lint + test) → manual test → commit. Use this for small, well-scoped changes. For larger features that warrant a multi-phase spec with architect analysis, use /substrate:architect-spec instead."
---

# /substrate:quick-spec

One-shot feature iteration. Plan against doctrine, implement, verify green, user manually tests, commit on pass — or iterate with accumulated failure context on fail.

**When to use this vs `/substrate:architect-spec`:**

- `/substrate:quick-spec` — a well-scoped change (one or two files, clear objective, no cross-layer schema surgery). Examples: "add a delete button to the post card", "validate email format on signup", "show a loading spinner while posts fetch".
- `/substrate:architect-spec` — a feature that crosses domain + backend + frontend, introduces new tables, or has non-trivial ambiguity. It produces a gated multi-phase spec.

If you're unsure which to use, start with `/substrate:quick-spec` — you can always escalate if the change grows legs.

## Arguments

`<objective>` — a natural-language description of the change. Examples:

- `add optimistic UI when creating a new post`
- `surface the pod status banner only while provisioning`
- `reject store names over 80 chars`

If no objective is passed, ask the user for one.

## When to REFUSE

| Signal | Redirect |
|--------|----------|
| Project not scaffolded (no `docs/doctrine/`) | Run `/substrate:init` first. |
| Objective touches 3+ layers AND introduces a new table | Escalate to `/substrate:architect-spec` — this is too big for a single-pass loop. |
| Objective is ambiguous ("make it better", "fix the UI") | Ask the user to be specific before starting. End the clarifying question with `[type 'default' to let me decide sensible defaults]` — if the user picks `default`, propose a concrete interpretation and confirm before planning. |

## Workflow

This is a **loop**. Step 5 either commits (pass) or returns to step 1 (fail, with failure context carried forward).

### Step 1 — Plan (Skeleton of Thought)

Work through planning in five substeps. Do them visibly so the user can interrupt.

**1a. Skeleton.** List 3–7 high-level steps as bullet points. No detail yet — just the shape.

**1b. Consult doctrine.** Identify which of the three doctrines the objective touches most directly:

- Pure logic, validation, decisions → `docs/doctrine/domain-doctrine.md`
- Schema, queries, mutations, auth, external APIs → `docs/doctrine/backend-doctrine.md`
- Routes, components, hooks, styling → `docs/doctrine/frontend-doctrine.md`

Read the relevant doctrine section(s). Note any rules that constrain the implementation (e.g. "components must be pure — hooks move to `src/hooks/`").

**1c. Expand.** For each skeleton bullet, add concrete detail: file paths, function names, import changes.

**1d. Critique.** Review the expanded plan for gaps, edge cases, simpler alternatives. Explicitly check:

- Any Convex query/filter without an index?
- Any inline validation that should hoist to `domain/`?
- Any new file path violating naming conventions?
- Any `Result<T, E>` return that would simplify error paths?

**1e. Finalize.** Produce the concrete implementation plan.

Present the plan to the user and wait for approval (`y / n / modify`). Do NOT implement before approval.

### Step 2 — Implement & Verify

With plan approved, implement using Edit / Write / Bash. Then run the green gate:

```bash
pnpm app:compile
pnpm app:lint
pnpm app:test
```

All three must pass. If any fails:

1. Show the failing command + its output.
2. Attempt **one** targeted fix.
3. Re-run. If still failing, stop and describe the failure to the user — don't spiral.

### Step 3 — Manual Test Gate

Pause and ask the user to manually verify the change. Provide a test script:

```
Manual test:
  1. [specific user flow / URL / interaction]
  2. Expected: [observable behavior]
  3. Verify: [what signal confirms success]

Does this pass? (y / n)
```

Wait for the user's verdict. Do not auto-advance.

### Step 4 — Verdict

**Pass →** proceed to Step 5 (commit).

**Fail →** ask the user what went wrong. Capture:

- Symptom ("the button doesn't appear")
- Expected vs actual
- Any console/browser errors

Then return to **Step 1** with failure context added. The next skeleton MUST explicitly address what failed. Keep a running log of attempts so context accumulates across retries:

```
Iteration 2 — failure context:
  - Attempt 1 used optimistic update; user reported flicker on failure rollback
  - Next plan must handle failed mutation without visible flicker
```

### Step 5 — Commit

Stage and commit with a descriptive message. No co-author tags, no boilerplate — lead with the "why":

```bash
git add -A
git commit -m "feat: <short action>

<one-line rationale tying the change to the objective>
"
```

Do NOT push.

## Constraints

- MUST read the relevant doctrine before planning — that's the "grounding" step, not optional.
- MUST get user approval on the plan before implementing.
- MUST run all three verification commands (`app:compile`, `app:lint`, `app:test`). Never silently skip one.
- MUST pause for manual testing — do NOT auto-close based on green gate alone. Green code can still be wrong UX.
- MUST carry failure context across retry iterations. Each new skeleton references what the previous attempt got wrong.
- MUST NOT push or deploy — `/substrate:deploy` handles that.
- MUST NOT make the loop more than 3 iterations without checking in. If the user has failed three attempts, stop and ask whether to escalate to `/substrate:architect-spec` or abandon.
- SHOULD attempt exactly one targeted fix on a failing verify before handing back to the user. Spiraling on failures wastes budget.
- MUST offer the default-escape suffix `[type 'default' to let me decide sensible defaults]` on any clarifying question posed to the user. Approval gates (y/n/modify) are not Socratic Q&A and are exempt.
