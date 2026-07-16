---
name: execute
description: "The ATTENDED single-window execution mode: run a multi-phase SDD spec (produced by /substrate:architect-spec) with one implementing agent while a human co-pilots, pausing at each step/phase gate for approval. Invoke with a spec path (docs/tasks/ongoing/<feature>/<feature>-spec.md). Walks Phase N → Step N.M → Verify → Gate per docs/protocol/sdd/execution-format.md. This is the single-window (K=1, human-in-the-loop) alternative to the primary door /substrate:orchestrate, which runs K context-budget windows as an unattended parallel worktree fleet. Choose execute when you want to watch/adapt one window, or the spec fits one window and you prefer HIL. Best run in a fresh Claude session for a clean context window."
---

# /substrate:execute

Run a spec phase-by-phase with gated verification, **one window, with a human co-piloting**. This is
the **attended** execution mode — the single-window (K=1) case of substrate's context-budget
partition (`agents-parallel-execution-doctrine.md §Grouping & windows`), where one implementing agent
walks the whole spec and pauses at each gate for you.

> **Orchestrated is the default; attended is the deliberate choice.** The primary execution door is
> `/substrate:orchestrate`, which partitions the graphed DAG into K windows and runs them as an
> unattended parallel worktree fleet. Reach for **attended** `execute` when you want to *watch and
> adapt* one window as it runs, or the spec is small enough to be one window and you prefer
> human-in-the-loop over a fleet. Same partition, K collapsed to 1, human in the loop.

`/substrate:architect-spec` produces the spec; this skill executes it as the attended half of the SDD pipeline.

## Arguments

`<spec-path>` — path to a spec at `docs/tasks/ongoing/<feature>/<feature>-spec.md`.

## When to run

- A spec exists and follows the grammar in `docs/protocol/sdd/execution-format.md`.
- You want **attended, human-in-the-loop** execution of a single window — to watch/adapt as it runs,
  or because the spec fits one window and a parallel fleet isn't worth the worktree overhead. For the
  unattended parallel default, use `/substrate:orchestrate` instead.
- You're in a FRESH Claude session (not the same session that drafted the spec). Clean context is the entire point.

## When to REFUSE

| Signal | Redirect |
|--------|----------|
| Spec path missing or empty | Ask for the path. |
| Spec does not contain a `## N. Prompt Execution Strategy` section | Not executable — it's a design doc. Run `/substrate:architect-spec` to produce an executable version. |
| Same session already contains the brief + Q&A + architect outputs | Open a new terminal and re-invoke. A cluttered context window degrades step quality on long specs. |

## Workflow

### Step 0. Confirm attended is the right mode (orchestrated is the default)

You were invoked as the **attended** door, but orchestrated is substrate's primary strategy — so
before walking phases, confirm this spec actually wants a single attended window rather than the
parallel fleet. This is a routing check only; it never changes the attended steps below.

1. **Detect a graphed epic.** Derive `<slug>` from the spec directory (`docs/tasks/ongoing/<slug>/`).
   If a tracker (`tbd`) is configured, read the DAG: `bash docs/scripts/bead-graph.sh --epic <slug>`.
   No tracker, or no `epic:<slug>` beads → the spec has no partition to fan out; **stay attended**
   (Step 1 onward).
2. **Assess whether orchestrated would clearly win.** The parallel fleet earns its worktree overhead
   **only when all hold**:
   - a graphed `epic:<slug>` exists, AND
   - some wave has **≥3 file-disjoint windows/beads**, AND
   - a tracker is configured.
3. **Offer the default, then honor the choice.** If orchestrated would clearly win, surface it —
   "this spec partitions into a parallel fleet; `/substrate:orchestrate <slug>` is the primary door —
   run that instead, or stay attended here?" On **explicit confirm** to switch, hand off to
   `/substrate:orchestrate <slug>` (optionally `--auto`). Otherwise — no epic, fewer than 3
   file-disjoint windows, no tracker, or the user prefers to stay attended — run the attended
   phase-by-phase path (Step 1 onward). Choosing attended is always valid: it's the deliberate
   single-window mode, not a fallback.

**Never silently fan out.** Spawning a parallel fleet is heavy and mutating (it cuts branches and
worktrees), so switching to orchestrated is always an explicit opt-in. Staying attended never spawns
a worktree. See `/substrate:orchestrate` and `agents-parallel-execution-doctrine.md §Grouping &
windows` for the fleet semantics.

### Step 1. Load the spec

Read the full spec at the provided path. Verify it contains:

- `## N. Prompt Execution Strategy` section (required per `execution-format.md`).
- At least one `### Phase N:` subsection.
- Every step has a `##### Verify` block.
- The final phase is "Doctrine Reconciliation" (mandatory, terminal per `spec-template.md` §N).

If any structural check fails, stop and report which section is broken so the user can fix the spec before re-running.

### Step 2. Parse the execution plan

Walk the spec's Prompt Execution Strategy section. For each phase, capture:

- Phase number + name
- Steps, each with: title, prompt content, verify commands, optional timeout
- Optional phase gate commands

Print a one-line summary per phase, then wait for approval before starting:

```
Execution Plan — <feature>

  Phase 1: Domain Layer           (3 steps, gate: pnpm app:compile && pnpm app:test)
  Phase 2: Schema + Backend       (4 steps, gate: pnpm app:compile && pnpm app:test)
  Phase 3: Frontend               (5 steps, gate: pnpm app:compile && pnpm app:test)
  Phase 4: Integration + E2E      (2 steps, gate: pnpm app:test:e2e)
  Phase 5: Doctrine Reconciliation (1 step, gate: re-run epic gate on integrated tip)

Start Phase 1? (y / n)
```

### Step 3. Walk each phase

For each phase, in order:

For each step within the phase:

**3a. Announce.**

```
--- Phase <N>, Step <N.M>: <Title> ---
```

**3b. Execute.** Carry out the step's prompt content using the appropriate tools (Write, Edit, Bash). Respect any "Tools to use" / "Tools to NOT use" hints in the step body.

**3c. Run verify commands.** Each `##### Verify` list item is a shell command in backticks. Run them sequentially via Bash, in order. Apply the step's `##### Timeout` if specified (default 180000ms).

**3d. Interpret results.**

- All commands exit 0 → step passes, continue to next step.
- Any command exits non-zero → step FAILS:
  1. Show the failing command and its output.
  2. Attempt **one** fix based on the error if it's obvious (missing import, type mismatch, missing dir).
  3. Re-run verify.
  4. If still failing, STOP and ask the user what to do.

After the last step of the phase:

**3e. Run phase gate.** If a `#### Gate` block exists, run its commands via Bash. Same semantics as verify.

**3f. Pause for user approval.** Print:

```
✔ Phase <N> complete.
  Steps: <N> passed
  Gate: <gate commands> → green

Summary: <one-paragraph of what changed in this phase>

Continue to Phase <N+1>? (y / n / pause)
```

Wait for explicit approval. `n` or `pause` stops execution cleanly so the user can inspect before resuming.

### Step 4. Final phase: Doctrine Reconciliation

The last phase is always `Phase N: Doctrine Reconciliation` per `spec-template.md`. It runs against the **fully integrated feature** and **applies** the doctrine change the code earned — it does not detect-and-queue. `/substrate:execute` is depth-0 and attended, so apply the mutation directly:

1. Read the full integrated diff (this feature's changes vs. the pre-execution base) and the doctrines the spec loaded.
2. **Edit `docs/doctrine/**` directly** to codify what the landed code demonstrates — under the **ratify-only** rule: you may only relax an outdated rule, promote a pattern the code demonstrates, or add coverage the code exemplifies. You may **never** introduce a MUST / MUST-NOT the just-landed code violates. If reconciliation would require a stricter rule that invalidates shipped code, do **not** apply it here — leave it for `/substrate:synthesize-session`.
3. **Re-run the gate on the integrated tip** (`pnpm app:compile && pnpm app:lint && pnpm app:test`). Green ⟹ the mutation was ratify-only and lands with the feature in the same commit. Red ⟹ not ratify-only; revert the doctrine edit and defer.

There is **no** `doctrine-amendments.md`, no `type: doctrine-amendment` bead, no handoff queue — behavior is identical regardless of `bead-tracker`. If no doctrine change is earned, this phase is a no-op.

### Step 5. Archive the task

Once the Doctrine Reconciliation phase passes, archive the feature directory:

```bash
mkdir -p docs/tasks/completed
mv "docs/tasks/ongoing/<feature>" "docs/tasks/completed/<feature>"
```

### Step 6. Commit the execution

```bash
git add -A
git commit -m "feat(<feature>): execute spec

Spec: docs/tasks/completed/<feature>/<feature>-spec.md
Phases: <N>
Doctrine reconciled in-epic: <yes (docs/doctrine/… touched) | no change earned>
"
```

Do NOT push. The user decides when to push.

### Step 7. Handoff

```
✔ Spec execution complete.

Feature: <feature>
Phases completed: <N>
Archive: docs/tasks/completed/<feature>/
Doctrine reconciled in-epic: <docs/doctrine/… touched | no change earned>

Next:
  - git push when you're ready
  - Or continue iterating with /substrate:quick-spec, /substrate:architect-spec, or /substrate:deploy
```

## Constraints

- MUST parse the spec before executing anything. A malformed spec must fail fast, not halfway through.
- MUST stop execution at any failed verify/gate — do NOT skip over failures.
- MUST pause for user approval between phases (after each gate). Non-negotiable — gated execution is the whole point of this skill.
- MUST run the Doctrine Reconciliation phase — never skip the final phase — and **apply** any earned ratify-only doctrine change to `docs/doctrine/**` in-epic, then re-gate. Never queue it as a `doctrine-amendment` or write a `doctrine-amendments.md`.
- MUST commit after successful execution (step 6). One commit per spec = one revertable unit.
- MUST NOT push to GitHub or deploy — that's for the user or `/substrate:deploy`.
- MUST NOT invent steps beyond what the spec contains. The spec is binding during execution (per `_SPEC-STANDARD.md` §3).
- SHOULD narrate each phase + step + verify result so the user sees liveness on long executions.
- SHOULD attempt one obvious fix when a verify fails (missing import, trivial type error); escalate to the user if the first fix doesn't resolve.
