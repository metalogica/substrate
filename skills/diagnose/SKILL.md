---
name: diagnose
description: "Diagnose a specific error and ship the fix. Takes an explicit error message + optional file:line / timestamp / repro steps. Matches the failure to the relevant doctrine via a path-layer + manifest-trigger + symbol-search composite, generates ranked hypotheses with evidence, implements the chosen fix, verifies both the green gate AND that the original error no longer reproduces, then commits. Loops on failure with accumulated context. Use this when you have a known error and need root cause + fix; use /substrate:quick-spec when you already know what to change."
---

# /substrate:diagnose

Targeted bug-fix loop. Takes a known error, routes it to the relevant doctrine, hypothesizes, fixes, verifies, commits.

**When to use this vs other skills:**

- `/substrate:diagnose` — you have a specific error (compile failure, runtime exception, failing test, observed misbehavior) and need root cause + fix.
- `/substrate:quick-spec` — you already know what change to make; this is small feature work, not bug-finding.
- `/substrate:architect-spec` — the fix crosses multiple layers AND requires schema changes or new abstractions.

If diagnosis reveals the fix is too big for a single-pass loop, escalate to `/substrate:architect-spec` at Step 3d.

## Arguments

`<error-context>` — at minimum the error message. Optionally any of:

- `file:line` from the stack trace
- timestamp or commit SHA when the error first appeared
- reproduction steps (terminal commands, browser actions)
- relevant log / console output

If only an error message is given, the skill auto-collects supporting signals (git status, recent commits, compile output if reproducible). If no arguments are passed, ask the user for at least the error message and end the question with `[type 'default' to let me decide sensible defaults]` — `default` means "scan recent compile/test output and treat the most recent failure as the target."

## When to REFUSE

| Signal | Redirect |
|--------|----------|
| Project not scaffolded (no `docs/doctrine/`) | Run `/substrate:init` first. |
| No error message provided AND no reproducible error in recent compile/test output | Ask for the actual error — diagnose can't fix vibes. |
| Error spans 3+ doctrine layers AND requires schema changes / new abstraction | Escalate to `/substrate:architect-spec`. |

## Workflow

This is a **loop**, mirroring `/substrate:quick-spec`. Step 7 either commits (pass) or returns to Step 3 with accumulated failure context (fail).

### Step 1 — Capture context

Parse what the user provided. Then auto-collect:

```bash
git status --short
git log -5 --format='%h %s'
git rev-parse --abbrev-ref HEAD
```

If `file:line` was given, read the file around that line (±20 lines). If a stack trace was given, parse the top 5 frames and read each frame's file around its line.

If the error is reproducible via the build/test pipeline:

```bash
pnpm app:compile
pnpm app:lint
pnpm app:test
```

Capture the output of the first failing command as the canonical error to fix.

If the error message is still ambiguous or missing key information after auto-collection, ask the user **one** clarifying question with the default-escape suffix. Do not run a multi-question Q&A loop — that's architect-spec territory.

### Step 2 — Match to doctrine (composite signal)

Three independent signals, scored 0–3 each, summed to a confidence score 0–9.

**A. Path-layer routing** (CODEOWNERS / monorepo convention):

| Failing file path | Layer | Doctrine signal |
|---|---|---|
| `convex/` | backend | match backend doctrine |
| `src/hooks/` | frontend | match frontend doctrine (hook layer) |
| `src/**/*.tsx` (components, routes) | frontend | match frontend doctrine |
| `domain/` | domain | match domain doctrine |
| `test/unit/<layer>/` | inherit `<layer>` | match the doctrine of that layer |
| anything else | unresolved | fall through to B / C |

Path-layer scores **3** if the failing file is unambiguously in one of the rows above, **1** if it's adjacent (e.g., a config file next to a `src/` tree), **0** otherwise.

**B. Manifest-trigger match** (substrate-native, same mechanic as `/substrate:architect-spec`):

If `docs/doctrine/doctrine-manifest.yaml` exists, parse it. For each entry's `triggers:` keyword list, count matches against the error message text + the failing symbol names + the failing file's nearby code. Score = `min(hits, 3)`. If no manifest, score 0 and fall through to C.

**C. Symbol-search fallback**:

Glob the doctrine corpus (`docs/doctrine/**/*-doctrine.md`). For each doctrine, grep its body for the failing symbol or API name extracted from the error (e.g., `requireAuth is not a function` → grep for `requireAuth`). Score = `min(hits, 3)` for the highest-hit doctrine.

**Aggregate.** Sum A+B+C per doctrine. Pick the highest. If two doctrines tie within 1 point, treat as cross-cutting and read both.

**Surface the choice and reasoning** before proceeding:

```
Matched doctrine: docs/doctrine/<chosen-doctrine>.md  (confidence: <N>/9)
  Path-layer:        <score>  — <which file path or "no match">
  Manifest-trigger:  <score>  — <which keywords matched, or "no manifest">
  Symbol search:     <score>  — <which symbol grepped, hits>

Override? (y / n)
  y → tell me which doctrine to use instead
  n → proceed with the matched doctrine
```

Read the chosen doctrine in full before Step 3. Reading a partial doctrine breaks the grounding.

### Step 3 — Hypothesis (Skeleton of Thought)

Mirrors `/substrate:quick-spec`'s 1a–1e but oriented around the error, not a feature objective.

**3a. Read the failing context.** The failing file at the relevant lines, the stack trace if any, and the doctrine you just matched.

**3b. Cross-check against doctrine.** Does the failing code violate a binding rule the doctrine prescribes? Is there a documented pattern this code should be following? Cite specific doctrine rules / sections.

**3c. Propose 1–3 ranked hypotheses.** Each one:

- One sentence stating the root cause.
- Evidence: which doctrine rule is violated (with citation), which stack frame supports it, similar working code elsewhere in the repo.
- Proposed fix: concrete files + lines + change.

**3d. Escalation check.** If any hypothesis requires touching 3+ layers OR introducing a new schema/abstraction, STOP and tell the user this is `/substrate:architect-spec` scope. Do not try to fix it in this loop.

**3e. Present** the hypotheses to the user. They pick (`1` / `2` / `3` / `modify` / `escalate`). Do not implement until they pick.

### Step 4 — Implement fix

With hypothesis approved, implement via Edit / Write / Bash. Same discipline as `/substrate:quick-spec` Step 2.

### Step 5 — Verify (two gates)

**Green gate** — all three must pass:

```bash
pnpm app:compile
pnpm app:lint
pnpm app:test
```

**Repro gate** — the original error must NOT recur. Re-run whatever reproduced it: the Step 1 repro steps, the originally-failing test, or the originally-failing command.

Failure modes:

- Green gate fails → attempt ONE targeted fix, re-run. Still failing? Stop and describe to the user. Don't spiral.
- Green gate passes, repro gate still fires → the hypothesis was wrong. Return to **Step 3** with this as failure context.

### Step 6 — Manual test gate

Same shape as quick-spec.

```
Manual test:
  1. [reproduce the original error scenario — exact steps]
  2. Expected: [the error no longer occurs / correct behavior happens]
  3. Verify: [specific signal that confirms the fix]

Does this pass? (y / n)
```

Wait for the verdict. Do not auto-advance.

### Step 7 — Verdict

**Pass →** proceed to Step 8 (commit).

**Fail →** capture symptom / expected vs actual / any console or browser errors. Return to **Step 3** with failure context added. The next hypothesis MUST explain why the previous attempt didn't resolve the symptom.

```
Iteration 2 — failure context:
  - Hypothesis 1 (doctrine rule X violated) → fix applied → original error still reproduces
  - Next hypothesis must explain why the X-fix didn't resolve the symptom
```

### Step 8 — Commit

Lead with the doctrine layer in the prefix so future readers can route by `git log --grep='fix(backend):'`.

```bash
git add -A
git commit -m "fix(<doctrine-layer>): <short action>

Root cause: <one line>
Doctrine: <doctrine path + rule citation, if applicable>
"
```

Do NOT push.

## Constraints

- MUST capture an explicit error message before proceeding. "It's broken" is not actionable — ask for the error.
- MUST match to a doctrine using the path-layer + manifest-trigger + symbol-search composite. Do not skip Step 2 even when the answer feels obvious — surfacing the reasoning gives the user a chance to override before grounding the fix in the wrong rules.
- MUST read the matched doctrine in full before forming hypotheses. Partial reads break the grounding step.
- MUST present 1–3 ranked hypotheses with evidence. No silent picking.
- MUST verify BOTH gates — green build AND the original error not reproducing. Green code that still has the bug is failure, not success.
- MUST get user approval on the hypothesis before implementing.
- MUST pause for manual testing — do NOT close out on the repro gate alone. Manual testing catches UX regressions the repro gate can't see.
- MUST carry failure context across retry iterations. Each new hypothesis references what the previous attempt missed.
- MUST NOT push or deploy — `/substrate:deploy` handles that.
- MUST NOT exceed 3 hypothesis iterations without checking in. After three failed attempts, stop and ask whether to escalate to `/substrate:architect-spec` or abandon.
- MUST escalate to `/substrate:architect-spec` when Step 3d's heuristic fires (3+ layers OR new schema/abstraction).
- MUST offer the default-escape suffix `[type 'default' to let me decide sensible defaults]` on any clarifying question posed in Step 1. Binary approval gates (`y/n`, `y/n/modify`, hypothesis selection) are exempt.
- SHOULD attempt exactly one targeted fix on a failing green gate before handing back to the user. Spiraling wastes budget.
- SHOULD prefer hypotheses grounded in cited doctrine rules over uncited guesses. A hypothesis with a doctrine citation is stronger than one without.
- SHOULD include the failing symbol or stack frame in the commit message body when relevant — it makes `git log` searchable for similar future failures.
