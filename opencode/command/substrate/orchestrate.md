---
description: "The PRIMARY execution door: run a graphed bead DAG as a parallel git-worktree fleet, operationalizing agents-parallel-execution-doctrine.md. Invoke with an epic (epic:<slug>) or a spec path whose epic has been graphed by /substrate/graph-spec. Reads the context-budget partition (group:<window-N> labels), cuts a feat/<epic-slug> integration branch, walks the DAG wave-by-wave, dispatches one group-runner per file-disjoint ready WINDOW in its own worktree (off the current integration tip, one seed+install per window), gates each bead in sequence, merges on green, re-gates the integrated tip, pauses between waves (--auto to skip), writes .substrate/execution-state.json, and lands one signed squash commit on trunk. Single-writer tracker (only the orchestrator runs tbd/git push). On OpenCode the dispatch seam is the Task tool; it degrades to sequential dispatch when Task parallelism is unavailable — DAG correctness preserved, concurrency optional. Consumes the DAG — it does not re-derive it. /substrate/execute is the attended single-window alternative."
---

# /substrate/orchestrate

Execute a graphed epic's bead DAG as a **parallel worktree fleet**. This is substrate's **primary
execution door** — the default way to run a spec once it's graphed. `/substrate/graph-spec` produces
the DAG; this command runs it. It is the "orchestrator" role that
`agents-parallel-execution-doctrine.md` describes — that doctrine holds the **why**; this command
holds the **operational loop**. Read the doctrine once; do not restate its rationale here.

> **Orchestrated (this command) is the primary strategy; attended (`/substrate/execute`) is the
> single-window alternative.** Orchestrated = K context-budget windows, agent-coordinated,
> unattended. Attended = one window, one implementing agent, a human co-pilots with phase-gate
> pauses. Both are the *same* partition (§Grouping & windows) at different K; pick attended when you
> want to watch/adapt one window or the spec fits one window and you prefer HIL.

**Why orchestration runs here, and why the group-runner can't fan out.** This command body runs at
the **primary-agent level** and dispatches `bead-implementer` (the group-runner) subagents via the
Task tool. That agent is declared with `permission.task: deny`, so it implements one window's beads
and returns a report but **cannot spawn further subagents** — a one-level depth model. The fan-out
must originate here. The executing agent needs `permission.task: allow`.

## Arguments

- `$ARGUMENTS` — an epic label `epic:<slug>`, a bare `<slug>`, or a spec path
  `docs/tasks/ongoing/<slug>/<slug>-spec.md` (its epic label is derived from the directory).
- `--auto` — run all waves unattended (skip the between-wave approval pause). Default: **pause
  between waves**, mirroring `/substrate/execute`'s pause-between-phases ethos.
- `--pr` — **cloud-output mode.** Push `feat/<epic-slug>` after every green wave re-gate (so an open
  PR accumulates the per-bead commits live, wave by wave) and **suppress the Step 6.3 trunk-squash** —
  the PR is the deliverable and GitHub's *Squash and merge* is the single squasher (it re-authors one
  clean commit, absorbing the unsigned bead commits). For headless runners (`/substrate/dispatch`).
  Orthogonal to `--auto`; mutually exclusive with the Step 6.3 trunk landing.

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
per ready window in a wave, all issued in a single message (**parallel where the runtime supports it**).
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

**Read the partition.** Each bead carries a `group:<window-N>` label (written by
`/substrate/graph-spec` per `agents-parallel-execution-doctrine.md §Grouping & windows`) — the
context-budget window it belongs to. Beads in one window are file-adjacent and run **sequentially in
one worktree**; distinct windows within a wave are file-disjoint and run **in parallel**. The
dispatch unit is the **window**, not the bead. The partition is a **deviatable prior**: you MAY
re-batch it when runtime judgment warrants — but if you do, **log the deviation**: mint a `run-id`
(`<epic>-<YYYYMMDD-HHMM>`) and append the reason + planned-vs-actual windows to
`.substrate/runs/<epic>/<run-id>/deviation-log` (gitignored). Absent `group:` labels → fall back to
one bead per window (classic per-bead behavior).

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

**Note the gate-coverage floor.** `gate.{compile,test,lint}` is the *minimum* re-gate, not
necessarily the *whole* suite the epic exercises. As you read the DAG (Step 2), collect the distinct
per-bead `Gate_i` commands: any `Gate_i` not subsumed by `gate.*` means `gate.*` under-covers this
epic — e.g. a frontend `vitest` a bead runs while `gate.test` runs only the backend suite, or a
`tsc`-only bead narrower than `gate.*`. Do **not** treat `gate.*` alone as the composition net: the
per-wave re-gate (5e) runs the **union** of `gate.*` and the per-bead gates exercised that wave.
Surface this once up front. (Beads whose gate is a strict subset of `gate.*` were tagged
`gate-scope: partial` by `/substrate/graph-spec` — their green is partial and only the union re-gate
authorizes the merge.)

### Step 4. Setup — integration branch + unattended signing

```bash
git switch -c feat/<epic-slug>   # or: git switch feat/<epic-slug>   (reuse if it exists)
git config commit.gpgsign false  # repo-local: subagent worktree commits can't sign interactively
```

Disabling signing is why epic-close **must** restore it unconditionally.

### Step 5. Per wave, in order

**5a. Filter to ready windows.** Keep beads whose blockers are all closed *or merged* (`tbd ready` / `tbd show <id>`) — **merge, not close, is the unblock signal** — then **group them by their `group:<window-N>` label**. A window is dispatchable once *all* its beads are ready. The dispatch unit is the **window**.

**5b. File-disjoint guard (across windows).** Pairwise-intersect each ready *window's* **Files** (the union of its beads' Files). Any collision splits the colliding windows into **consecutive sub-waves** — merge one, re-gate, then the next branches off the new tip. Never run two windows that touch the same file in one wave. (Within a window, beads co-edit shared files by construction — that's why they share one worktree and run sequentially.)

**5c. Dispatch — per ready window:**

1. `tbd update <id> --status in_progress` for **each bead in the window** (orchestrator-only write), and stamp each bead's run-state `outcome: dispatched` in `.substrate/execution-state.json`.
2. `git worktree add <path> -b <window-branch> feat/<epic-slug>` — **one worktree per window**, off the **current integration tip**.
3. Copy every `worktree-seed[]` path from the primary checkout into the worktree, then run `toolchain-pin.install` **once for the window** (seeding cost O(K windows), not O(N beads)). Seed **before** dispatch or the gate fails on a phantom. `toolchain-pin.install` must stay idempotent.
4. Dispatch **one group-runner (`bead-implementer`) via the Task tool** (one per window, in a single message; sequential fallback if serialized) with, inlined:
   - the window id and its **N sequenced bead tuples** — each `{Goal_i, Files_i, Gate_i, spec-ref_i}`, the gate fully **env-resolved** (`toolchain-pin.env` prefix + `gate.*` literals + any override);
   - the relevant `CLAUDE.md`;
   - the standing rule verbatim — *"no tbd, no git push — implement each bead in sequence, run each bead's gate, report a per-bead pass/fail ledger + a diff summary."*
   - for any out-of-band bead, ask for that bead's out-of-band checklist + the single swappable seam.

**5d. Collect results (read the per-bead ledger).** The group-runner returns a per-bead ledger (`pass | fail | unstarted`) covering every bead in the window:

- **All-pass** → merge `<window-branch>` → `feat/<epic-slug>`; `git worktree remove <path>`. Dependents dispatch off the updated tip.
- **Stopped mid-window at bead *i*** → merge the green `pass` prefix (beads 1..i-1, if the ledger shows them gated green); keep bead *i* and the `unstarted` remainder **open**, `tbd update <id> --notes "<failure>"`. Block only the transitive dependents of the open beads — **sibling windows continue**.

**5e. Re-gate the integrated tip — the union gate.** After the wave's merges, the *orchestrator* runs, once on `feat/<epic-slug>`, the **union of `gate.{compile,test,lint}` and every distinct per-bead `Gate_i` exercised by the beads merged this wave** (deduped). This union — never `gate.*` alone — is the **sole merge-authorizing signal**; the per-bead gates a group-runner ran are *fast pre-checks*, not the composition net. The union is what makes it sound: a per-bead gate can be narrower than `gate.*` (a `tsc`-only bead), *and* `gate.*` can be narrower than the suites the wave touched (a `gate.test` that runs only the backend suite while a frontend `vitest` ran per-bead) — re-gate with `gate.*` alone and a suite the wave exercised never gets composed-checked, so a green wave can sit on a red integrated tip. **Record the wave's re-gate into `.substrate/execution-state.json` as it runs** — `{wave, commands, result, tip-sha}` (Step 6; written **incrementally per wave**, not only at close). **Red = composition failure: halt the wave transition, attach notes, fix before any dependent dispatches.** A wave with no recorded re-gate entry is a protocol violation.

**5f. Record outcome — defer close (two-stage gate, non-destructive).** Advance the run-state `outcome`; **do not `tbd close` here.**

- Normal green → `outcome: merged` on merge, then `outcome: verified` after the wave's green union re-gate. The bead **stays `open` in the tracker** — `verified` is the live done-signal a watcher renders; the `tbd close` is deferred to the terminal batch (Step 6.2). Merge (not close) already unblocked dependents, so deferring changes no scheduling and no bead flips `closed` mid-run.
- **Out-of-band gate applies** → `outcome: oob-pending` + `tbd update <id> --notes "merged; awaiting <out-of-band> gate"`; leave open until a human runs the full gate.

**5f-pr. Push the integration tip (only under `--pr`).** After the wave's union re-gate is green (5e),
`git push origin feat/<epic-slug>` — this makes the PR update live in wave-sized bursts. On wave 1,
ensure the PR exists (`gh pr view feat/<epic-slug> || gh pr create -f -H feat/<epic-slug>`). A red
re-gate pushes nothing.

**5g. Pause for approval** with a wave summary — **unless `--auto`**. Under `--pr --auto` there is no
pause; the PR is the inspection surface.

**5h. The terminal doctrine-reconciliation node (final wave).** The epic's last wave is always the solo `kind: doctrine-reconciliation` node graph-spec emitted (`blocked-by` every other bead, so it runs alone against the fully integrated tip). Dispatch it like any window, with two things to know:

- Its group-runner **edits `docs/doctrine/**` in its worktree** to codify the ratify-only doctrine change the epic earned. That is an **ordinary working-tree change**, not a tracker write — the single-writer invariant is untouched (the runner still runs **no `tbd`, no `git push`**; you merge and record as always). Doctrine files land inside this epic's diff, co-revertable with the feature.
- **Ratify-only is enforced by the re-gate, not a bespoke lint.** Its gate is the full union gate on the integrated tip (5e); since the mutation may only codify what the code already did, a green re-gate *is* the proof it was ratify-only. **A red re-gate means the doctrine edit introduced a rule the shipped code violates** — out of scope for this node: have the runner revert the doctrine edit (or do it yourself before merge) and note it as follow-up for `/substrate/synthesize-session`. There is **no** amendment queue to fall back on.

### Step 6. Epic close

1. **Finalize `.substrate/execution-state.json`** — the durable run-state, written **incrementally** (run-id + partition at start, a `re-gates[]` entry appended after every wave's union re-gate, each bead's `outcome` as it merges) and finalized before the squash. Under the `<epic>` key record: the `run-id`, the chosen `partition` (window → bead-ids), any `deviations` from graph-spec's suggestion (with reasons), the per-wave `re-gates` (`[{wave, commands, result, tip-sha}]` — the union-gate proof), the per-bead `outcomes` (`status: dispatched|merged|verified|oob-pending|fail|closed` + merged `commit` sha or null — the non-destructive lifecycle a watcher renders), and the `run-log` pointer (`.substrate/runs/<epic>/<run-id>/`). Incremental writes mean a crash or abort still leaves a truthful partial ledger. Schema in `agents-parallel-execution-doctrine.md §Grouping & windows`. This file stays **tracked** (only `.substrate/runs/` is gitignored) and is committed with the squash.
2. **Terminal batch close, then one `tbd sync`** — orchestrator-only, at epic close. Close every `verified` bead in a **single bulk call** (`tbd close <id1> <id2> … --reason "gate green"`, stamping each `outcome: closed`) — the *only* `tbd close` in the run — then run the one `tbd sync`. `auto_sync` stays off; never sync mid-flight from a worktree. Beads left `oob-pending` stay open and close later, as their out-of-band gates pass.
3. **Land the epic — two modes:**
   - **Default:** land `feat/<epic-slug>` on trunk as **one signed commit** (including `.substrate/execution-state.json`): `git merge --squash feat/<epic-slug>` + a signed commit. Squash keeps unsigned bead commits out of trunk history.
   - **`--pr` mode:** do NOT touch trunk. Commit `.substrate/execution-state.json` onto `feat/<epic-slug>`, push it a final time, ensure the PR is open. GitHub's *Squash and merge* is the single squasher; the unsigned bead commits are legitimate on the PR branch and re-authored at merge.
4. **Restore `commit.gpgsign true` unconditionally** — including on the abort / rollback path. Idempotent; never leave signing disabled past the run.

## Constraints

- MUST read the DAG from `bead-graph.sh --epic <slug>`; MUST NOT re-derive it. Fail-fast on a parse error before any worktree exists.
- MUST abort with an explanation if `substrate.yaml`'s `gate` block is missing — never probe a toolchain.
- MUST warn (not abort) before dispatch when `worktree-seed` is undeclared but `.gitignore` names build/dep paths the gate plausibly needs, and pause for confirm — never silently dispatch into worktrees that will fail the gate on an unseeded input (no-silent-fallback).
- MUST honor the **single-writer** invariant: only the orchestrator runs `tbd update`/`close`/`sync` or `git push`. Subagents receive Goal/Files/Gate inlined and return a report.
- MUST read the `group:<window-N>` partition and dispatch by **window** (one worktree + one seed/install per window); MAY re-batch as a **logged deviation**. Branch each window worktree off the **current integration tip**, merge-on-green, and **re-gate the integrated tip each wave with the union of `gate.*` and every per-bead gate exercised that wave** — the union re-gate (never `gate.*` alone) is the sole merge-authorizing signal, recorded per wave (`{wave, commands, result, tip-sha}`) in `.substrate/execution-state.json`; a wave with no recorded re-gate is a protocol violation.
- MUST enforce **file-disjoint** waves across windows (pairwise-Files guard) beyond graph-spec's partition + edges.
- MUST read the group-runner's **per-bead ledger** and apply the **two-stage gate non-destructively**: headless-green → merge + unblock + advance run-state `outcome` (`merged` → `verified`); **defer every `tbd close` to the single terminal batch** (Step 6.2) so no bead flips `closed` mid-run; out-of-band proof → `oob-pending`, left open + noted.
- MUST write tracked `.substrate/execution-state.json` **incrementally per wave** (partition + per-wave `re-gates[]` + per-bead outcomes + run-log pointer), finalized before the squash.
- MUST disable signing for the run and **restore `commit.gpgsign true` unconditionally** (incl. abort). Land trunk as one signed **squash** commit.
- MUST pause between waves unless `--auto`. Never silently fan out beyond the DAG.
- MUST, under `--pr`, push `feat/<epic-slug>` after each green wave re-gate and **suppress the Step 6.3 trunk-squash** (mutually exclusive) — the PR squash-merged on GitHub is the sole landing; never create a trunk commit in `--pr` mode. Signing is restored unconditionally at close as in the default mode.
- MUST dispatch the **group-runner** (`bead-implementer`) via the **Task tool**, one per window; if the runtime serializes, **fall back to sequential dispatch and log it** — correctness over wall-clock. Requires `permission.task: allow` on the executing agent.
- SHOULD narrate each wave (dispatched beads, gate results, merges) so the user sees liveness on long epics.
