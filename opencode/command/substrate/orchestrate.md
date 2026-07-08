---
description: "Execute a graphed bead DAG as a parallel git-worktree fleet, operationalizing agents-parallel-execution-doctrine.md. Invoke with an epic (epic:<slug>) or a spec path whose epic has been graphed by /substrate/graph-spec. Cuts a feat/<epic-slug> integration branch, walks the DAG wave-by-wave, dispatches one bead-implementer per file-disjoint ready bead in its own worktree (off the current integration tip), merges on green, re-gates the integrated tip, pauses between waves (--auto to skip), and lands one signed squash commit on trunk. Single-writer tracker (only the orchestrator runs tbd/git push). On OpenCode the dispatch seam is the Task tool; it degrades to sequential dispatch when Task parallelism is unavailable — DAG correctness preserved, concurrency optional. Consumes the DAG — it does not re-derive it."
---

# /substrate/orchestrate

Execute a graphed epic's bead DAG as a **parallel worktree fleet**. `/substrate/graph-spec` produces
the DAG; this command runs it. It is the "orchestrator" role that
`agents-parallel-execution-doctrine.md` describes — that doctrine holds the **why**; this command
holds the **operational loop**. Read the doctrine once; do not restate its rationale here.

**Why orchestration runs here, and why `bead-implementer` can't fan out.** This command body runs at
the **primary-agent level** and dispatches `bead-implementer` subagents via the Task tool. The
`bead-implementer` agent is declared with `permission.task: deny`, so it implements one bead and
returns a report but **cannot spawn further subagents** — a one-level depth model. The fan-out must
originate here. The executing agent needs `permission.task: allow`.

## Arguments

- `$ARGUMENTS` — an epic label `epic:<slug>`, a bare `<slug>`, or a spec path
  `docs/tasks/ongoing/<slug>/<slug>-spec.md` (its epic label is derived from the directory).
- `--auto` — run all waves unattended (skip the between-wave approval pause). Default: **pause
  between waves**, mirroring `/substrate/execute`'s pause-between-phases ethos.

## When to run

- The epic has been graphed: `epic:<slug>` beads exist and `bash docs/scripts/bead-graph.sh --epic <slug>` renders waves.
- `substrate.yaml` declares a `gate` block (the objective done-signal every bead runs).
- At least one wave is worth fanning out (multiple file-disjoint beads).

## When to REFUSE

| Signal | Redirect |
|--------|----------|
| No `epic:<slug>` beads / `bead-graph.sh` errors | Graph the spec first: `/substrate/graph-spec <spec>`. No worktrees created. |
| `substrate.yaml` missing or its `gate` block absent | Abort with an explanation — do **not** probe a toolchain. Fix `substrate.yaml`, then re-run. |
| No tracker (`tbd`) configured | Single-writer orchestration needs a tracker. Use `/substrate/execute` sequential instead. |
| Arg empty | Ask for the epic slug or spec path. |

## The dispatch seam (Task tool; sequential fallback)

The **only** tool-coupled seam is subagent dispatch. On OpenCode that is the **Task tool** — one task
per ready bead in a wave, all issued in a single message (**parallel where the runtime supports it**).
If the runtime serializes Task calls, **degrade to sequential dispatch and log that you're doing so**
— DAG *correctness* is preserved; only *concurrency* is optional (OpenCode parallel Task execution is
behaviorally unverified — see `opencode/CONVENTIONS.md` Q4). Everything else (git, tbd, the gate) is
portable shell.

There is no CC-only Workflow fast-path here; the natural-language Task-tool floor is the only path on
OpenCode.

## Workflow — the operational loop

### Step 1. Resolve `<slug>`

`epic:<slug>` → `<slug>`; a bare `<slug>` → itself; a spec path `docs/tasks/ongoing/<slug>/…` → the
directory name. This is the canonical epic label; it is the join key, not the parent link.

### Step 2. Read the DAG (never re-derive it)

```bash
bash docs/scripts/bead-graph.sh --epic <slug>            # topological waves — the authoritative schedule
```

Every id in one wave is safe to run in parallel; waves run in order. **Fail-fast** if there are no
`epic:<slug>` beads or the script errors — prefer the machine `waves` output over eyeballing wave
art; a parse error aborts before any worktree is created.

### Step 3. Read `substrate.yaml`

Read `gate.{compile,test,lint}`, optional `gate.out-of-band`, `worktree-seed[]`, and
`toolchain-pin.{install,env}`. **Abort with an explanation if the `gate` block is missing** — do not
probe a toolchain.

**Warn on an undeclared seed (no-silent-fallback).** If `worktree-seed` is absent or empty **and**
the repo's `.gitignore` names build/dependency paths the gate plausibly needs (`node_modules`,
`.venv`/`venv`, `target`, `dist`/`build`, generated-client/codegen dirs, `.env*`), do **not** proceed
silently: warn that a fresh worktree contains only *tracked* files, so the gate may fail spuriously,
and that seeding will then fall to manual per-run copying. Point the user at `substrate.yaml`'s
`worktree-seed[]`/`toolchain-pin` block (`/substrate/adopt` can populate it, or edit by hand) and
**pause for confirm-to-proceed-unseeded**. This is a warning, not an abort: a repo whose gate needs
no gitignored input is free to run with an empty seed.

### Step 4. Setup — integration branch + unattended signing

```bash
git switch -c feat/<epic-slug>   # or: git switch feat/<epic-slug>   (reuse if it exists)
git config commit.gpgsign false  # repo-local: subagent worktree commits can't sign interactively
```

Disabling signing is why epic-close **must** restore it unconditionally.

### Step 5. Per wave, in order

**5a. Filter to ready beads** whose blockers are all closed *or merged* (`tbd ready` / `tbd show <id>`) — **merge, not close, is the unblock signal**.

**5b. File-disjoint guard.** Pairwise-intersect each ready bead's **Files**. Any collision splits the colliding beads into **consecutive sub-waves** — merge one, re-gate, then the next branches off the new tip. Never run two beads that touch the same file in one wave.

**5c. Dispatch — per ready bead:**

1. `tbd update <id> --status in_progress` (orchestrator-only write).
2. `git worktree add <path> -b <bead-branch> feat/<epic-slug>` — off the **current integration tip**.
3. Copy every `worktree-seed[]` path from the primary checkout into the worktree, then run `toolchain-pin.install` in it. Seed **before** dispatch or the gate fails on a phantom.
4. Dispatch **one `bead-implementer` via the Task tool** (one per bead, in a single message; sequential fallback if serialized) with, inlined:
   - the bead's **Goal / Files / Gate** — the gate fully **env-resolved** (`toolchain-pin.env` prefix + `gate.*` literals + any override);
   - the plan/spec link and the relevant `CLAUDE.md`;
   - the standing rule verbatim — *"no tbd, no git push — implement, run the gate, report pass/fail + a diff summary."*
   - if the bead is out-of-band, ask for the out-of-band checklist + the single swappable seam.

**5d. Collect results:**

- **Green** → merge `<bead-branch>` → `feat/<epic-slug>`; `git worktree remove <path>`. Dependents dispatch off the updated tip.
- **Red** → keep open, `tbd update <id> --notes "<failure>"`; do **not** merge. Block only *its* transitive dependents — **siblings continue**.

**5e. Re-gate the integrated tip.** After the wave's merges, the *orchestrator* runs the declared `gate.*` once on `feat/<epic-slug>`. **Red = composition failure: halt the wave transition, attach notes, fix before any dependent dispatches.**

**5f. Close vs leave-open (two-stage gate).**

- Normal green → `tbd close <id> --reason "gate green: <summary>"`.
- **Out-of-band gate applies** → do **not** close: `tbd update <id> --notes "merged; awaiting <out-of-band> gate"` and leave open until a human runs the full gate.

**5g. Pause for approval** with a wave summary — **unless `--auto`**.

### Step 6. Epic close

1. **One** `tbd sync` — orchestrator-only, at epic close. `auto_sync` stays off; never sync mid-flight from a worktree.
2. Land `feat/<epic-slug>` on trunk as **one signed commit**: `git merge --squash feat/<epic-slug>` + a signed commit. Squash keeps unsigned bead commits out of trunk history.
3. **Restore `commit.gpgsign true` unconditionally** — including on the abort / rollback path. Idempotent; never leave signing disabled past the run.

## Constraints

- MUST read the DAG from `bead-graph.sh --epic <slug>`; MUST NOT re-derive it. Fail-fast on a parse error before any worktree exists.
- MUST abort with an explanation if `substrate.yaml`'s `gate` block is missing — never probe a toolchain.
- MUST warn (not abort) before dispatch when `worktree-seed` is undeclared but `.gitignore` names build/dep paths the gate plausibly needs, and pause for confirm — never silently dispatch into worktrees that will fail the gate on an unseeded input (no-silent-fallback).
- MUST honor the **single-writer** invariant: only the orchestrator runs `tbd update`/`close`/`sync` or `git push`. Subagents receive Goal/Files/Gate inlined and return a report.
- MUST branch each bead worktree off the **current integration tip**, merge-on-green, and **re-gate the integrated tip** each wave.
- MUST enforce **file-disjoint** waves (pairwise-Files guard) beyond graph-spec's edges.
- MUST apply the **two-stage gate**: headless-green → merge + unblock; out-of-band proof → leave open + noted.
- MUST disable signing for the run and **restore `commit.gpgsign true` unconditionally** (incl. abort). Land trunk as one signed **squash** commit.
- MUST pause between waves unless `--auto`. Never silently fan out beyond the DAG.
- MUST dispatch `bead-implementer` via the **Task tool**; if the runtime serializes, **fall back to sequential dispatch and log it** — correctness over wall-clock. Requires `permission.task: allow` on the executing agent.
- SHOULD narrate each wave (dispatched beads, gate results, merges) so the user sees liveness on long epics.
