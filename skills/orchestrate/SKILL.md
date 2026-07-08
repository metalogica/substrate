---
name: orchestrate
description: "The PRIMARY execution door: run a graphed bead DAG as a parallel git-worktree fleet, operationalizing agents-parallel-execution-doctrine.md. Invoke with an epic (epic:<slug>) or a spec path whose epic has been graphed by /substrate:graph-spec. Reads the context-budget partition (group:<window-N> labels), cuts a feat/<epic-slug> integration branch, walks the DAG wave-by-wave, dispatches one group-runner per file-disjoint ready WINDOW in its own worktree (off the current integration tip, one seed+install per window), gates each bead in sequence, merges on green, re-gates the integrated tip, pauses between waves (--auto to skip), writes .substrate/execution-state.json, and lands one signed squash commit on trunk. Single-writer tracker (only the orchestrator runs tbd/git push). Tool-agnostic: Agent tool on Claude Code, Task tool on OpenCode; a CC-only Workflow fast-path is layered over the same loop. Consumes the DAG — it does not re-derive it. /substrate:execute is the attended single-window alternative. Fail-safe: aborts with an explanation rather than probing a toolchain."
---

# /substrate:orchestrate

Execute a graphed epic's bead DAG as a **parallel worktree fleet**. This is substrate's **primary
execution door** — the default way to run a spec once it's graphed. `/substrate:graph-spec` produces
the DAG; this skill runs it. It is the "orchestrator" role that
`references/docs-core/docs/doctrine/agents-parallel-execution-doctrine.md` describes — that doctrine
holds the **why**; this skill holds the **operational loop**. Read the doctrine once; do not restate
its rationale here.

> **Orchestrated (this skill) is the primary strategy; attended (`/substrate:execute`) is the
> single-window alternative.** Orchestrated = K context-budget windows, agent-coordinated,
> unattended. Attended = one window, one implementing agent, a human co-pilots with phase-gate
> pauses. Both are the *same* partition (§Grouping & windows) at different K; pick attended when you
> want to watch/adapt one window or the spec fits one window and you prefer HIL.

## Arguments

- `<epic-or-spec>` — either an epic label `epic:<slug>`, a bare `<slug>`, or a spec path
  `docs/tasks/ongoing/<slug>/<slug>-spec.md` (its epic label is derived from the directory).
- `--auto` — run all waves unattended (skip the between-wave approval pause). Default is
  **pause between waves**, mirroring `/substrate:execute`'s pause-between-phases ethos.

## When to run

- The epic has been graphed: `epic:<slug>` beads exist and `bash docs/scripts/bead-graph.sh --epic <slug>` renders waves.
- `substrate.yaml` declares a `gate` block (the objective done-signal every bead runs).
- At least one wave is worth fanning out (multiple file-disjoint beads). A single-file or
  strictly-serial DAG is fine too, but the win is smaller — `/substrate:execute`'s sequential path
  is equally valid there.

## When to REFUSE

| Signal | Redirect |
|--------|----------|
| No `epic:<slug>` beads / `bead-graph.sh` errors | Graph the spec first: `/substrate:graph-spec <spec>`. No worktrees created. |
| `substrate.yaml` missing or its `gate` block absent | Abort with an explanation — do **not** probe a toolchain (root CLAUDE.md gate policy). Fix `substrate.yaml`, then re-run. |
| No tracker (`tbd`) configured | Single-writer orchestration needs a tracker. Use `/substrate:execute` sequential instead. |
| Arg empty | Ask for the epic slug or spec path. |

## The dispatch seam (tool-agnostic)

The **only** tool-coupled seam is subagent dispatch. Everything else (git, tbd, the gate) is portable shell.

| | Claude Code | OpenCode |
|---|---|---|
| Portable floor | **Agent tool** — one `bead-implementer` (group-runner) call per ready window in a wave (parallel calls in one message) | **Task tool** — one task per ready window (parallel where the runtime supports it; **sequential fallback**, logged) |
| Fast-path (CC only, v1) | **Workflow tool** — deterministic per-wave pipeline, journaled resume, budget control over the same loop contract | *(n/a — NL floor only)* |

The two CC paths are **behaviorally equivalent on the DAG**; the Workflow fast-path adds
resume/determinism, not different semantics. On OpenCode, DAG *correctness* is preserved even when
Task calls serialize; only *concurrency* is optional.

## Workflow — the operational loop

### Step 1. Resolve `<slug>`

From the arg: `epic:<slug>` → `<slug>`; a bare `<slug>` → itself; a spec path
`docs/tasks/ongoing/<slug>/…` → the directory name. This is the canonical epic label; it is the join
key, not the parent link.

### Step 2. Read the DAG (never re-derive it)

```bash
bash docs/scripts/bead-graph.sh --epic <slug>            # topological waves — the authoritative schedule
```

Every id in one wave is safe to run in parallel; waves run in order. **Fail-fast** if there are no
`epic:<slug>` beads or the script errors — prefer the machine `waves` output over eyeballing wave
art; a parse error aborts before any worktree is created (FMEA #7). `--format mermaid` is available
for a visual sanity check.

**Read the partition.** Each bead carries a `group:<window-N>` label (written by
`/substrate:graph-spec` per `agents-parallel-execution-doctrine.md §Grouping & windows`) — the
context-budget window it belongs to. Beads in one window are file-adjacent and run **sequentially in
one worktree**; distinct windows within a wave are file-disjoint and run **in parallel**. The
dispatch unit is the **window**, not the bead. The partition is a **deviatable prior**: you MAY
re-batch it (merge two tiny windows, split an over-full one) when runtime judgment warrants — but if
you do, **log the deviation**: mint a `run-id` (`<epic>-<YYYYMMDD-HHMM>`) and append the reason +
the planned-vs-actual windows to `.substrate/runs/<epic>/<run-id>/deviation-log` (gitignored). No
deviation → no log entry needed. Absent `group:` labels (an ungraphed or pre-partition DAG) → fall
back to one bead per window (the classic per-bead behavior).

### Step 3. Read `substrate.yaml`

Read `gate.{compile,test,lint}`, optional `gate.out-of-band`, `worktree-seed[]`, and
`toolchain-pin.{install,env}`. **Abort with an explanation if the `gate` block is missing** — do not
probe a toolchain (root CLAUDE.md policy; FMEA #2 phantom-gate mitigation depends on these keys).

**Warn on an undeclared seed (no-silent-fallback).** If `worktree-seed` is absent or empty **and**
the repo's `.gitignore` names build/dependency paths the gate plausibly needs (`node_modules`,
`.venv`/`venv`, `target`, `dist`/`build`, generated-client/codegen dirs, `.env*`), do **not** proceed
silently: warn that a fresh worktree contains only *tracked* files, so the gate may fail spuriously,
and that seeding will then fall to manual per-run copying. Point the user at `substrate.yaml`'s
`worktree-seed[]`/`toolchain-pin` block (populate it — `/substrate:adopt` can, or edit by hand) and
**pause for confirm-to-proceed-unseeded**. This is a warning, not an abort: a repo whose gate needs
no gitignored input is free to run with an empty seed.

**Note the gate-coverage floor.** `gate.{compile,test,lint}` is the *minimum* re-gate, not
necessarily the *whole* suite the epic exercises. As you read the DAG (Step 2), collect the distinct
per-bead `Gate_i` commands: any `Gate_i` that is **not** subsumed by `gate.*` means `gate.*`
under-covers this epic — e.g. a frontend `vitest` a bead runs while `gate.test` only runs the backend
suite, or a `tsc`-only bead narrower than `gate.*`. Do **not** treat `gate.*` alone as the
composition net: the per-wave re-gate (5e) runs the **union** of `gate.*` and the per-bead gates
exercised that wave. Surface this once up front so it's visible that the integrated re-gate is
broader than `substrate.yaml`'s literal `gate` block. (If a bead's gate is a strict subset of
`gate.*`, `/substrate:graph-spec` will have tagged it `gate-scope: partial` — a reminder that its
green is partial and only the union re-gate authorizes the merge.)

### Step 4. Setup — integration branch + unattended signing

```bash
git switch -c feat/<epic-slug>   # or: git switch feat/<epic-slug>   (reuse if it exists)
git config commit.gpgsign false  # repo-local: subagent worktree commits can't sign interactively
```

Cut/reuse `feat/<epic-slug>` from trunk. Disabling signing is why the epic-close step **must**
restore it unconditionally (doctrine §Supporting → *Unattended signing*).

### Step 5. Per wave, in order

For each wave the DAG emits, in order:

**5a. Filter to ready windows.** Keep beads whose blockers are all closed *or merged* —
`tbd ready` / `tbd show <id>`. **Merge, not close, is the unblock signal** (doctrine §Policy-4), so a
merged-but-open Policy-4 bead still unblocks its dependents. Then **group the ready beads by their
`group:<window-N>` label** — a window is dispatchable once *all* its beads are ready. The dispatch
unit is the **window**.

**5b. File-disjoint guard (across windows).** Pairwise-intersect each ready *window's* **Files**
(the union of its beads' Files). Any collision splits the colliding windows into **consecutive
sub-waves** — merge one, re-gate, then the next branches off the new tip. This is a second net over
graph-spec's partition + edges (doctrine §Supporting → *File-disjoint waves*; FMEA #3). Never run two
windows that touch the same file in one wave. (Within a window, beads co-edit shared files *by
construction* — that's why they share one worktree and run sequentially, not in parallel.)

**5c. Dispatch — per ready window:**

1. `tbd update <id> --status in_progress` for **each bead in the window** (orchestrator-only write).
2. `git worktree add <path> -b <window-branch> feat/<epic-slug>` — **one worktree per window**, off the **current integration tip**, so it already contains merged blockers. Never branch off stale trunk.
3. Copy every `worktree-seed[]` path from the primary checkout into the worktree, then run `toolchain-pin.install` **once for the window** (seeding cost is O(K windows), not O(N beads)). Seed **before** dispatch or the gate fails on a phantom (doctrine §Supporting → *Seed …*; FMEA #2). `toolchain-pin.install` must stay idempotent.
4. Dispatch **one group-runner** (`bead-implementer`; Agent tool / Task tool / Workflow stage) with, inlined:
   - the window id and its **N sequenced bead tuples** — each `{Goal_i, Files_i, Gate_i, spec-ref_i}`, the gate fully **env-resolved** (`toolchain-pin.env` prefix + `gate.*` literals + any bead override), so it resolves in a worktree with no shell version-manager;
   - the relevant `CLAUDE.md`;
   - the standing rule verbatim — *"no tbd, no git push — implement each bead in sequence, run each bead's gate, report a per-bead pass/fail ledger + a diff summary."*
   - for any bead carrying an out-of-band gate, say so, and ask for that bead's out-of-band checklist + the single swappable seam.

**5d. Collect results (read the per-bead ledger).** The group-runner returns a per-bead ledger
(`pass | fail | unstarted`) covering every bead in the window:

- **All-pass** → merge `<window-branch>` → `feat/<epic-slug>`; `git worktree remove <path>` (hygiene — an unchanged worktree auto-cleans). Newly-unblocked dependents dispatch off the updated tip.
- **Stopped mid-window at bead *i*** → the runner leaves clean per-bead commits for the `pass` prefix (beads 1..i-1). Merge that green prefix if the ledger shows those beads gated green; keep bead *i* and the `unstarted` remainder **open**, `tbd update <id> --notes "<failure>"`. Block only the transitive dependents of the open beads — **sibling windows continue** (partial progress is a core DAG win; FMEA — mid-window failure). Fix or escalate the failed bead.

**5e. Re-gate the integrated tip — the union gate.** After the wave's merges, the *orchestrator*
runs, once on `feat/<epic-slug>`, the **union of `gate.{compile,test,lint}` and every distinct
per-bead `Gate_i` exercised by the beads merged this wave** (deduped). This union — never `gate.*`
alone — is the **sole merge-authorizing signal** for the wave; the per-bead gates a group-runner ran
are *fast pre-checks* that fail early inside a window, not the composition net. The union is what
makes the re-gate sound: a per-bead gate can be **narrower than `gate.*`** (a `tsc`-only frontend
bead), *and* `gate.*` can be **narrower than the suites the wave touched** (a `gate.test` that runs
only the backend suite while a frontend `vitest` ran per-bead). Re-gate with `gate.*` alone and a
whole suite the wave exercised never gets composed-checked — so a green-reported wave can sit on a
red integrated tip (doctrine §Supporting → *Re-run the gate on the integrated branch*; FMEA #4). Two
independently-green branches can still fail composed. **Record the wave's re-gate into
`.substrate/execution-state.json` as it runs** — `{wave, commands: [...], result, tip-sha}` (Step 6;
the file is written **incrementally per wave**, not only at close, so an aborted run still leaves the
evidence). **Red = composition failure: halt the wave transition, attach notes, fix before any
dependent dispatches.** A wave with no recorded re-gate entry is a protocol violation.

**5f. Close vs leave-open (two-stage gate).** For each green, merged bead:

- Normal → `tbd close <id> --reason "gate green: <summary>"`.
- **Out-of-band gate applies** (hardware / paid service / manual) → do **not** close:
  `tbd update <id> --notes "merged; awaiting <out-of-band> gate"` and leave it open. Merge already
  unblocked its dependents; close waits for the *full* gate a human runs later (doctrine §Policy-4).

**5g. Pause for approval** with a wave summary (beads merged / left-open / red, re-gate result,
next wave preview) — **unless `--auto`**. `n`/`pause` stops cleanly so the user can inspect.

### Step 6. Epic close

1. **Finalize `.substrate/execution-state.json`** — the durable run-state. This file is written **incrementally**, not once at the end: stamp the `run-id` + chosen `partition` at run start, append a `re-gates[]` entry after every wave's union re-gate (5e), and record each bead's `outcome` as it merges — so a crash or an aborted run still leaves a partial, truthful ledger (and the re-gate history that makes a composition failure diagnosable after the fact). At epic close, before the squash, finalize it: under the `<epic>` key record the `run-id`, the **chosen `partition`** (window → bead-ids), any `deviations` from graph-spec's suggestion (with reasons, mirroring the run-log), the per-wave `re-gates` (`[{wave, commands, result, tip-sha}]` — the union-gate proof), the per-bead `outcomes` (`status: pass|fail|open` + merged `commit` sha or null), and the `run-log` pointer (`.substrate/runs/<epic>/<run-id>/`). Schema in `agents-parallel-execution-doctrine.md §Grouping & windows`. This file stays **tracked** (only `.substrate/runs/` is gitignored) and is committed alongside the squash.
2. **One** `tbd sync` — orchestrator-only, at epic close (or an explicitly agreed checkpoint). `auto_sync` stays off; never sync mid-flight from a worktree (doctrine §Policy-3 → *Batch sync*).
3. Land `feat/<epic-slug>` on trunk as **one signed commit** (including `.substrate/execution-state.json`): `git switch <trunk>` → `git merge --squash feat/<epic-slug>` → `git commit -S -m "..."`. Squash keeps the unsigned bead commits out of trunk history.
4. **Restore `commit.gpgsign true` unconditionally** — including on the abort / rollback path. This restore is idempotent; never leave signing disabled past the run (doctrine §Supporting → *Unattended signing*; FMEA #1).

## CC Workflow fast-path (v1, optional at runtime)

On Claude Code, the per-wave dispatch MAY run as a **Workflow-tool pipeline**: each wave is a stage,
each ready window a `bead-implementer` (group-runner) within it, with journaled resume and budget control over
the *same* loop contract (steps 5a–5f). It is a performance/determinism layer, **not** different
semantics — the portable NL floor (Agent tool, one call per window) is the default and the **only** path
on OpenCode. Do not hardwire Workflow as the sole mechanism.

## Constraints

- MUST read the DAG from `bead-graph.sh --epic <slug>`; MUST NOT re-derive it. Fail-fast on a parse error before any worktree exists.
- MUST abort with an explanation if `substrate.yaml`'s `gate` block is missing — never probe a toolchain.
- MUST warn (not abort) before dispatch when `worktree-seed` is undeclared but `.gitignore` names build/dep paths the gate plausibly needs, and pause for confirm — never silently dispatch into worktrees that will fail the gate on an unseeded input (no-silent-fallback).
- MUST honor the **single-writer** invariant: only the orchestrator runs `tbd update`/`close`/`sync` or `git push`. Subagents receive Goal/Files/Gate inlined and return a result.
- MUST branch each bead worktree off the **current integration tip**, merge-on-green, and **re-gate the integrated tip each wave with the union of `gate.*` and every per-bead gate exercised that wave** — the union re-gate (never `gate.*` alone) is the sole merge-authorizing signal, and each wave's `{wave, commands, result, tip-sha}` MUST be recorded incrementally in `.substrate/execution-state.json`. A wave with no recorded re-gate entry is a protocol violation.
- MUST enforce **file-disjoint** waves (pairwise-Files guard) beyond graph-spec's edges.
- MUST apply the **two-stage gate**: headless-green → merge + unblock dependents; out-of-band proof → leave open + noted until a human runs it.
- MUST disable signing for the run and **restore `commit.gpgsign true` unconditionally** (incl. abort). Land trunk as one signed **squash** commit.
- MUST pause between waves unless `--auto`. Never silently fan out beyond the DAG.
- MUST stay **tool-agnostic** — Agent↔Task is the only seam. The CC Workflow fast-path is additive, not required.
- MUST keep this body under ~500 lines — link to the doctrine for rationale, don't restate it.
- SHOULD narrate each wave (dispatched beads, gate results, merges) so the user sees liveness on long epics.
