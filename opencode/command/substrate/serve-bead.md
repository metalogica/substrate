---
description: "The serve daemon's headless lane skill — what a headless session runs inside a freshly-cut worktree to execute ONE bead end to end. Assess the bead against the repo; if it is too under-specified to act on, say exactly what is missing and exit WITHOUT committing (the machine's equivalent of asking). Otherwise declare a write scope, implement inside it, run the repo's own substrate.yaml gate until green, and leave exactly one local commit. Never runs tbd. Never pushes in local mode. Invoked by `substrate serve` / `substrate triage`, not by a human at a keyboard — there is no one to approve a plan or answer a question, so this command has no approval pauses."
---

# /substrate/serve-bead

You are running **headless**, inside a git worktree the serve daemon cut for one bead, with permissions pre-granted. Nobody is watching. Nobody can answer a question. You get one shot (the daemon retries once, then bounces the bead back to the board).

Your output is not a message — it is **the state of this worktree when you exit**. The daemon judges it from outside, by two observations you cannot fake:

1. does the branch carry at least one commit, and
2. is the repo's own `substrate.yaml` gate green here?

Everything below follows from that.

## When to REFUSE

| Signal | What to do |
|--------|-----------|
| The bead is too vague to implement (no observable outcome, e.g. "make it better", "fix the UI") | **Step 1's refuse-path.** State what is missing, exit, commit nothing. |
| The work needs a decision only a human can make (product trade-off, destructive migration, credentials) | Same. Name the decision; do not pick one. |
| The bead needs files outside this repo, or network/service access you do not have | Same. Name what is unreachable. |
| The gate is still red after 2 targeted fixes | **Step 4's stop-path.** Leave the worktree uncommitted; report the failing command + output. |

Refusing is a **first-class success** of this command. An under-specified bead that comes back to the board with a precise note is a good outcome; the same bead "implemented" from a guess is a bad one that costs a review cycle to discover.

## Standing rules (binding)

**No tbd. No push in local mode. One local commit, and only on green.**

- **MUST NOT** run any `tbd` command (`create` / `update` / `close` / `sync` / …). The daemon is the single writer to the tracker. If you think a tracker change is warranted, say so in your report; do not make it.
- **MUST NOT** merge, rebase onto, or otherwise touch trunk. You work only on this worktree's branch.
- **MUST NOT** `git push` when the dispatch prompt says `Mode: local` — the work stays local and the human lands it. When it says `Mode: github`, push the branch when you are done (the daemon opens the PR; you do not).
- **MUST NOT** commit while the gate is red. A red commit is worse than no commit: the daemon marks the bead failed either way, but a red commit leaves debris on the branch.
- **MUST NOT** ask a question, print an approval prompt, or wait for input. There is no one there.

## Workflow

### Step 1 — Assess

Read, in this order:

1. **The bead** — its title, body, and `Kind:` from the dispatch prompt.
2. **`AGENTS.md` / `CLAUDE.md`** at the repo root, if present.
3. **`substrate.yaml`** — specifically the `gate:` block. These are the exact commands you must end green on, so read them before you plan, not after.
4. **`docs/doctrine/`**, if it exists — the 1–3 doctrines whose names or `triggers` match the bead. If a `doctrine-manifest.yaml` is present, use it; else glob `**/*-doctrine.md`.

Then make one judgement: **is this bead actionable as written?**

Actionable means you can name an observable outcome and the files that produce it. It does not mean the bead is detailed — a one-line bead like "Add hello.txt containing hello" is perfectly actionable.

**If it is NOT actionable**, stop here. Print:

```
REFUSED: <bead-id>

Missing: <the specific thing you cannot determine>
Would need: <what a human would have to add to the bead to unblock it>
```

Then exit. Do not create files. Do not commit. The daemon observes "no commits", returns the bead to the board with your reason attached, and a human sees exactly what to add.

Use the `Kind:` hint to shape your approach, not to re-decide routing:

- `bug` — reproduce first. Find the root cause before changing anything, and make the repro stop firing as part of your verification.
- `task` / `feature` / `chore` — implement directly.

### Step 2 — Declare scope

Before editing, write down the files you intend to create or modify:

```
SCOPE: <bead-id>
  - path/to/file.ts        (modify)
  - path/to/new-file.ts    (create)
```

This is your write scope for the rest of the run. The daemon does not hand you one (unlike `/substrate/orchestrate`, which derives `Files` from a graphed DAG), so you declare it yourself — and it is what keeps the resulting diff reviewable.

If the work turns out to need a file outside this list, that is fine — **update the list and say so in your report**. What you must not do is silently sprawl.

### Step 3 — Implement

Do the work, following whatever doctrine you read in Step 1. Match the surrounding code's conventions, comment density, and idiom.

Prefer the smallest change that fully accomplishes the bead. You are not being reviewed on ambition; you are being reviewed on a diff a human reads in one sitting.

### Step 4 — Gate

Run **every** command in `substrate.yaml`'s `gate:` block, verbatim, in this worktree, in order (compile → test → lint).

- **All green →** go to Step 5.
- **Any red →** make at most **two** targeted fixes, re-running the gate after each.
- **Still red after two →** STOP. Commit nothing. Print the failing command and its output:

```
GATE RED: <bead-id>

Command: <the failing gate command>
<the last ~20 lines of its output>

Attempted: <what your two fixes changed, in one line each>
```

Two is a deliberate ceiling. A third attempt on a gate that has failed twice is usually thrashing, and the daemon's retry gives the work a fresh worktree and a clean context — which beats a fourth guess in a poisoned one.

Do not weaken the gate to pass it. Deleting a failing test, adding a skip, loosening a type, or editing `substrate.yaml` itself are all failures dressed as successes — if the gate is wrong, say so in your report and let it stay red.

### Step 5 — Commit

Exactly one local commit, on this worktree's branch:

```bash
git add -A
git commit -m "<type>: <short action>

<one-line rationale tying the change to the bead>

bead: <bead-id>"
```

`<type>` is the conventional-commit type matching the bead's kind (`feat` / `fix` / `chore`). Keep it unsigned — the human squashes and signs when they land it.

Then, **only if** the dispatch prompt said `Mode: github`, `git push -u origin HEAD`. In `Mode: local`, stop here; the commit in the worktree is the deliverable.

## Report

Your final message is read by the daemon's log, not by a person in real time. Make it scannable:

```
<bead-id> — <LANDED | REFUSED | GATE RED>

Scope:   <files touched, one per line>
Change:  <2–3 lines: what you did and why>
Gate:    <each command → pass/fail>
Commit:  <sha + subject, or "none">
Notes:   <anything a reviewer should know — assumptions made, scope widened,
          a tracker change you think is warranted but did not make>
```

State assumptions explicitly in `Notes`. A bead you completed under an assumption that turns out wrong is recoverable if the assumption is written down, and a mystery if it is not.
