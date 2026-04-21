---
name: execute
description: "Execute a multi-phase SDD spec (produced by /substrate:architect-spec) with verification gates between each step and phase. Invoke with a spec path (docs/tasks/ongoing/<feature>/<feature>-spec.md). Walks Phase N → Step N.M → Verify → Gate per docs/protocol/sdd/execution-format.md, pausing at each phase gate for user approval. Best run in a fresh Claude session for a clean context window."
---

# /substrate:execute

Run a spec phase-by-phase with gated verification. This is the execution half of the SDD pipeline — `/substrate:architect-spec` produces the spec; this skill executes it.

## Arguments

`<spec-path>` — path to a spec at `docs/tasks/ongoing/<feature>/<feature>-spec.md`.

## When to run

- A spec exists and follows the grammar in `docs/protocol/sdd/execution-format.md`.
- You're in a FRESH Claude session (not the same session that drafted the spec). Clean context is the entire point.

## When to REFUSE

| Signal | Redirect |
|--------|----------|
| Spec path missing or empty | Ask for the path. |
| Spec does not contain a `## N. Prompt Execution Strategy` section | Not executable — it's a design doc. Run `/substrate:architect-spec` to produce an executable version. |
| Same session already contains the brief + Q&A + architect outputs | Open a new terminal and re-invoke. A cluttered context window degrades step quality on long specs. |

## Workflow

### Step 1. Load the spec

Read the full spec at the provided path. Verify it contains:

- `## N. Prompt Execution Strategy` section (required per `execution-format.md`).
- At least one `### Phase N:` subsection.
- Every step has a `##### Verify` block.
- The final phase is "Doctrine Review" (mandatory per `spec-template.md` §N).

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
  Phase 5: Doctrine Review        (2 steps, gate: —)

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

### Step 4. Final phase: Doctrine Review

The last phase is always `Phase N: Doctrine Review` per `spec-template.md`. It's not code — it's a compliance check. Walk its steps like any other phase: run the doctrine-review prompt, write `docs/tasks/ongoing/<feature>/doctrine-amendments.md` if amendments are needed, run the gate.

### Step 5. Archive the task

Once the Doctrine Review phase passes, archive the feature directory:

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
Doctrine amendments: <none | path>
"
```

Do NOT push. The user decides when to push.

### Step 7. Handoff

```
✔ Spec execution complete.

Feature: <feature>
Phases completed: <N>
Archive: docs/tasks/completed/<feature>/
Doctrine amendments: <path or "none">

Next:
  - git push when you're ready
  - Or continue iterating with /substrate:quick-spec, /substrate:architect-spec, or /substrate:deploy
```

## Constraints

- MUST parse the spec before executing anything. A malformed spec must fail fast, not halfway through.
- MUST stop execution at any failed verify/gate — do NOT skip over failures.
- MUST pause for user approval between phases (after each gate). Non-negotiable — gated execution is the whole point of this skill.
- MUST run the Doctrine Review phase — never skip the final phase.
- MUST commit after successful execution (step 6). One commit per spec = one revertable unit.
- MUST NOT push to GitHub or deploy — that's for the user or `/substrate:deploy`.
- MUST NOT invent steps beyond what the spec contains. The spec is binding during execution (per `_SPEC-STANDARD.md` §3).
- SHOULD narrate each phase + step + verify result so the user sees liveness on long executions.
- SHOULD attempt one obvious fix when a verify fails (missing import, trivial type error); escalate to the user if the first fix doesn't resolve.
