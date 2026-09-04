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
- `--pr` — **review-first landing.** Instead of landing one squash commit on trunk (Step 6.3),
  **push `feat/<epic-slug>` after every wave** (so an open PR accumulates the per-bead commits
  live, wave by wave) and **suppress the trunk-squash entirely** — the PR is the deliverable and
  GitHub's *Squash and merge* becomes the single squasher (it re-authors one clean commit, absorbing
  the unsigned per-bead commits). Use it when you want the epic reviewed before it reaches trunk
  rather than after; implies no interactive trunk landing. Composes with `--auto` (the two are
  orthogonal: `--auto` skips the pause, `--pr` changes the landing). MUST NOT be combined with the
  Step 6.3 trunk-squash — they are mutually exclusive by construction.

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

Read `gate.{compile,test,lint}`, optional `gate.out-of-band`, `worktree-seed[]`,
`toolchain-pin.{install,env}`, and optional `execution.resource-envelope`. **Abort with an explanation if the `gate` block is missing** — do not
probe a toolchain (root CLAUDE.md policy; FMEA #2 phantom-gate mitigation depends on these keys).

**Warn on an undeclared seed (no-silent-fallback).** If `worktree-seed` is absent or empty **and**
the repo's `.gitignore` names build/dependency paths the gate plausibly needs (`node_modules`,
`.venv`/`venv`, `target`, `dist`/`build`, generated-client/codegen dirs, `.env*`), do **not** proceed
silently: warn that a fresh worktree contains only *tracked* files, so the gate may fail spuriously,
and that seeding will then fall to manual per-run copying. Point the user at `substrate.yaml`'s
`worktree-seed[]`/`toolchain-pin` block (populate it — `/substrate:adopt` can, or edit by hand) and
**pause for confirm-to-proceed-unseeded**. This is a warning, not an abort: a repo whose gate needs
no gitignored input is free to run with an empty seed.

**Note the resource envelope.** If `execution.resource-envelope` is present
(`{env, cores-budget, floor}`), each window's gate runs with `<env>=max(floor(cores-budget / K),
floor)` for the K windows dispatched in that wave (5c.4). Absent it, the gate runs unbounded — fine
at K=1, an oversubscription at K>1 (doctrine §Supporting → *A window's gate runs under a declared
resource envelope*).

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

### Step 4. Setup — integration branch, run-state anchor, unattended signing

```bash
git switch -c feat/<epic-slug>   # or: git switch feat/<epic-slug>   (reuse if it exists)
git config extensions.worktreeConfig true   # once, idempotent: lets each worktree carry its own config
```

**4.1 Cut/reuse `feat/<epic-slug>`** from trunk.

**4.2 Initialise the run-state entry — before any worktree exists.** Write
`.substrate/execution-state.json`'s `<epic>` key now:

```json
{ "<epic>": { "run-id": "<epic>-<YYYYMMDD-HHMM>", "partition": { "window-1": ["…"] },
              "re-gates": [], "outcomes": {}, "run-log": ".substrate/runs/<epic>/<run-id>/" } }
```

Every later write (5c.1 `dispatched`, 5e `re-gates[]`, 5f `merged`/`verified`) **appends to this
entry**. Skip this and each of those is a write into a missing key, so an aborted run leaves no
ledger at all — which is exactly what happened on the 12-window sky-journal run (2026-08-04): real
merged work, a written deviation log, and no `execution-state.json` entry, because entry creation
lived only in Step 6.1 and the run never reached it.

**4.3 Signing is scoped to the worktrees, never to the repo.** `extensions.worktreeConfig` above is
the *only* signing-related change made to the primary checkout, and it changes no signing behaviour
by itself. Do **not** flip repo-local `commit.gpgsign false`: that config is shared with the primary
checkout, so a human's mid-run commit lands silently unsigned and a killed run never reaches the
restore. Per-worktree unsign happens at creation (5c.2); orchestrator-authored merges pass
`-c commit.gpgsign=false` per invocation (5d, 6.3). Nothing needs restoring at close — see
doctrine §Supporting → *Unattended signing*.

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

1. `tbd update <id> --status in_progress` for **each bead in the window** (orchestrator-only write), and stamp each bead's run-state `outcome: dispatched` in `.substrate/execution-state.json`.
2. `git worktree add <path> -b <window-branch> feat/<epic-slug>` — **one worktree per window**, off the **current integration tip**, so it already contains merged blockers. Never branch off stale trunk. Then immediately `git -C <path> config --worktree commit.gpgsign false`, so this window's commits never reach an interactive signer and the primary checkout's config stays untouched.
3. Copy every `worktree-seed[]` path from the primary checkout into the worktree, then run `toolchain-pin.install` **once for the window** (seeding cost is O(K windows), not O(N beads)). Seed **before** dispatch or the gate fails on a phantom (doctrine §Supporting → *Seed …*; FMEA #2). `toolchain-pin.install` must stay idempotent. Seed **immutable inputs only** — never a handle to shared mutable state (a local dev-deployment dir, a live state cache); regenerate those offline in the worktree, or route the bead to the primary checkout.
4. Compute this window's resource share from `execution.resource-envelope` — `max(floor(cores-budget / K), floor)` for the K windows in this wave — and inject it as `<env>=<share>` in front of the window's gate commands, alongside `toolchain-pin.env`.
5. Dispatch **one group-runner** (`bead-implementer`; Agent tool / Task tool / Workflow stage) with, inlined:
   - the window id and its **N sequenced bead tuples** — each `{Goal_i, Files_i, Gate_i, spec-ref_i}`, the gate fully **env-resolved** (`toolchain-pin.env` prefix + `gate.*` literals + any bead override), so it resolves in a worktree with no shell version-manager;
   - **the window's doctrine digests — push, don't point.** Union the `doctrine:<id>` labels across the window's beads (stamped by `/substrate:graph-spec` Step 4.55 from write-scope ∩ the manifest's `paths:`), **dedupe by `<id>`**, and inline the output of `bash docs/scripts/doctrine-digest.sh <id>` — that doctrine's Binding Rules block — **once for the window**, not once per tuple, each block labelled with its id and the beads it binds. This is the push tier: cheap, and it provably arrived, where a pointer verifies nothing (`docs/doctrine/agents-doctrine.md` §2.1 — the reasoning lives there; don't restate it). **Escalate to the full doctrine body** when a *single* bead's write-scope majority falls inside one doctrine's `paths:` — that bead sits squarely in the doctrine, so inline that whole file for its tuple in place of the digest. Bound it:
     - **At most one escalation per window**, the doctrine covering the most write-scope. A full body costs ~6–10× its digest (measure it: `wc -l <doctrine-path>` vs `bash docs/scripts/doctrine-digest.sh <id> | wc -l`), and a window whose beads' majorities land in *different* doctrines isn't squarely inside either — that's a mis-partition signal, not a licence for two full bodies.
     - **Never truncate a digest, and never drop one to fit.** Half-delivered binding rules are worse than a pointer: the runner acts on a subset of the MUSTs believing it has them all. If the deduped union is outsized (≳200 lines — roughly 4 digests at the 35–65 each this repo measures), drop the *escalation* to digest-only first; if digests alone are still outsized, the window is bound too widely — narrate it and consider re-batching per Step 2's deviatable prior. The prompt is the symptom; the partition is the fix.
     - **Degrade silently.** No `doctrine:` labels on the window's beads, or no `docs/scripts/doctrine-digest.sh` in the repo → inline nothing, say nothing, compose the dispatch exactly as it would be composed without this bullet. Not a warning, not an abort: most repos have never adopted `paths:`, and a warning would fire on every window of every one of them. A label whose id the script rejects (non-zero exit — a stale label surviving a manifest edit) is skipped, mentioned **once** in the wave narration, and never fatal.
   - the relevant `CLAUDE.md` — **repo context, no longer the doctrine channel.** It carries orientation and doctrine *pointers*; when digests are inlined above they are the binding doctrine for this window and already in the runner's context, so the pointers are the fallback for what they don't cover. In a repo that stamps no `doctrine:` labels, the pointer is all there is and the runner chases it as before;
   - the standing rule verbatim — *"no tbd, no git push — implement each bead in sequence, run each bead's gate, report a per-bead pass/fail ledger + a diff summary."*
   - for any bead carrying an out-of-band gate, say so, and ask for that bead's out-of-band checklist + the single swappable seam.

**5d. Collect results (read the per-bead ledger).** The group-runner returns a per-bead ledger
(`pass | fail | unstarted`) covering every bead in the window:

- **All-pass** → merge `<window-branch>` → `feat/<epic-slug>` with `git -c commit.gpgsign=false merge …` (per-invocation, never a config flip); `git worktree remove <path>` **and** `git branch -D <window-branch>` (hygiene — an unchanged worktree auto-cleans; the branch does not). Newly-unblocked dependents dispatch off the updated tip.
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
`.substrate/execution-state.json` as it runs** — and if the `<epic>` entry is *missing* when you go
to append, you skipped Step 4.2: stop and fix that rather than creating the entry late, because
everything the run has already recorded went nowhere — — `{wave, commands: [...], result, tip-sha}` (Step 6;
the file is written **incrementally per wave**, not only at close, so an aborted run still leaves the
evidence). **Red = composition failure: halt the wave transition, attach notes, fix before any
dependent dispatches.** A wave with no recorded re-gate entry is a protocol violation.

**5f. Record outcome — defer close (two-stage gate, non-destructive).** For each green, merged bead,
**advance its run-state `outcome`, do not `tbd close`**:

- On merge → `outcome: merged`; after the wave's green union re-gate (5e) → `outcome: verified`.
  The bead **stays `open` in the tracker** — `verified` is the live done-signal a watcher renders,
  and the `tbd close` is deferred to the terminal batch (Step 6.2). Merge (not close) already
  unblocked its dependents, so deferring the close changes no scheduling — and no bead flips
  `closed` mid-run, so a spurious close can't drop it out of the open view.
- **Out-of-band gate applies** (hardware / paid service / manual) → `outcome: oob-pending` +
  `tbd update <id> --notes "merged; awaiting <out-of-band> gate"`. It stays open; close waits for
  the *full* gate a human runs later (doctrine §Policy-4).

**5f-pr. Push the integration tip (only under `--pr`).** Immediately after the wave's union re-gate
is green (5e), `git push origin feat/<epic-slug>`. This is what makes the PR update **live, in
wave-sized bursts** — the per-bead commits merged this wave become visible on the PR the moment the
integrated tip is authorized. On the first wave, ensure the PR exists (`gh pr view feat/<epic-slug>
|| gh pr create -f -H feat/<epic-slug>`). A red re-gate pushes nothing (halt per 5e).

**5g. Pause for approval** with a wave summary (beads merged / left-open / red, re-gate result,
next wave preview) — **unless `--auto`**. `n`/`pause` stops cleanly so the user can inspect. Under
`--pr --auto` (fully unattended) there is no pause; the PR is the inspection surface.

**5h. The terminal doctrine-reconciliation node (final wave).** The epic's last wave is always the
solo `kind: doctrine-reconciliation` node graph-spec emitted (`blocked-by` every other bead, so it
runs alone against the fully integrated tip). Dispatch it like any window, with two things to know:

- Its group-runner **edits `docs/doctrine/**` in its worktree** to codify the ratify-only doctrine
  change the epic earned. That is an **ordinary working-tree change**, not a tracker write — the
  single-writer invariant is untouched (the runner still runs **no `tbd`, no `git push`**; you merge
  and record as always). Doctrine files land inside this epic's diff, co-revertable with the feature.
- **Ratify-only is enforced by the re-gate, not a bespoke lint.** Its gate is the full union gate on
  the integrated tip (5e); since the mutation may only codify what the code already did, a green
  re-gate *is* the proof it was ratify-only. **A red re-gate means the doctrine edit introduced a
  rule the shipped code violates** — that is out of scope for this node: have the runner revert the
  doctrine edit (or do it yourself before merge) and note it as follow-up for
  `/substrate:synthesize-session`. There is **no** amendment queue to fall back on — the node either
  applies a green ratify-only change or reverts to a no-op.

### Step 6. Epic close

1. **Finalize `.substrate/execution-state.json`** — the durable run-state. This file is written **incrementally**, not once at the end: stamp the `run-id` + chosen `partition` at run start, append a `re-gates[]` entry after every wave's union re-gate (5e), and record each bead's `outcome` as it merges — so a crash or an aborted run still leaves a partial, truthful ledger (and the re-gate history that makes a composition failure diagnosable after the fact). At epic close, before the squash, finalize it: under the `<epic>` key record the `run-id`, the **chosen `partition`** (window → bead-ids), any `deviations` from graph-spec's suggestion (with reasons, mirroring the run-log), the per-wave `re-gates` (`[{wave, commands, result, tip-sha}]` — the union-gate proof), the per-bead `outcomes` (`status: dispatched|merged|verified|oob-pending|fail|closed` + merged `commit` sha or null — the non-destructive lifecycle a watcher renders), and the `run-log` pointer (`.substrate/runs/<epic>/<run-id>/`). Schema in `agents-parallel-execution-doctrine.md §Grouping & windows`. This file stays **tracked** (only `.substrate/runs/` is gitignored) and is committed alongside the squash.
2. **Terminal batch close, then one `tbd sync`** — orchestrator-only, at epic close (or an explicitly agreed checkpoint). Close every `verified` bead in a **single bulk call** (`tbd close <id1> <id2> … --reason "gate green"`, stamping each `outcome: closed`) — this is the *only* `tbd close` in the run — then run the one `tbd sync`. `auto_sync` stays off; never sync mid-flight from a worktree (doctrine §Policy-3 → *Batch sync*). Beads left `oob-pending` stay open and close later, as their out-of-band gates pass.
3. **Land the epic — two modes:**
   - **Default (local landing):** land `feat/<epic-slug>` on trunk as **one signed commit** (including `.substrate/execution-state.json`): `git switch <trunk>` → `git -c commit.gpgsign=false merge --squash feat/<epic-slug>` → `git commit -S -m "..."`. Squash keeps the unsigned bead commits out of trunk history. This is the run's single interactive-signing moment. Then reap: `git branch -D feat/<epic-slug>` (its content is in the squash; its history is in `execution-state.json`).
   - **`--pr` mode (PR landing):** do **NOT** touch trunk. Commit `.substrate/execution-state.json` onto `feat/<epic-slug>`, `git push origin feat/<epic-slug>` a final time, and ensure the PR is open (`gh pr view … || gh pr create -f`). The squash-to-trunk is deferred to GitHub's *Squash and merge* on the PR (the single squasher). The unsigned bead commits are legitimate on the PR branch; GitHub re-authors them into one commit at merge.
4. **Verify signing posture** — `git config --local --get commit.gpgsign` must still be `true`. This is a *check*, not a restore: signing was never disabled repo-wide, only per worktree, and those overrides died with their worktrees. If the check ever fails, something flipped the shared config and that is the bug (doctrine §Supporting → *Unattended signing*; FMEA #1).

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
- MUST initialise the `<epic>` run-state entry before the first dispatch (Step 4.2). A run that appends re-gates into a missing key leaves no ledger at all.
- MUST honor the **single-writer** invariant: only the orchestrator runs `tbd update`/`close`/`sync` or `git push`. Subagents receive Goal/Files/Gate inlined and return a result.
- MUST **push** the window's deduped `doctrine:<id>` digests into the dispatch prompt when its beads carry those labels (5c.5) — once per window, escalating to **at most one** full doctrine body — and MUST NOT truncate a digest to fit. MUST degrade to today's composition **silently** when there are no labels or no `doctrine-digest.sh`: no digest block, no warning, no abort.
- MUST branch each bead worktree off the **current integration tip**, merge-on-green, and **re-gate the integrated tip each wave with the union of `gate.*` and every per-bead gate exercised that wave** — the union re-gate (never `gate.*` alone) is the sole merge-authorizing signal, and each wave's `{wave, commands, result, tip-sha}` MUST be recorded incrementally in `.substrate/execution-state.json`. A wave with no recorded re-gate entry is a protocol violation.
- MUST inject each window's `execution.resource-envelope` share into its gate when the repo declares one.
- MUST enforce **file-disjoint** waves (pairwise-Files guard) beyond graph-spec's edges.
- MUST apply the **two-stage gate non-destructively**: headless-green → merge + unblock dependents + advance run-state `outcome` (`merged` → `verified`); **defer every `tbd close` to the single terminal batch** (Step 6.2) so no bead flips `closed` mid-run; out-of-band proof → `oob-pending`, left open + noted until a human runs it. `verified` (not a mid-run close) is the live done-signal a watcher renders.
- MUST scope unattended signing to the worktrees (`extensions.worktreeConfig` + per-worktree `commit.gpgsign false`, `-c commit.gpgsign=false` for orchestrator-authored merges) and MUST NOT flip the shared repo-local config. Land trunk as one signed **squash** commit; at close, *verify* the primary is still signing rather than restoring it.
- MUST reap debris: window branches on merge, `feat/<epic-slug>` after the squash lands.
- MUST pause between waves unless `--auto`. Never silently fan out beyond the DAG.
- MUST, under `--pr`, push `feat/<epic-slug>` after each green wave re-gate and **suppress the Step 6.3 trunk-squash** — the two are mutually exclusive. The PR (squash-merged on GitHub) is the sole landing; the orchestrator MUST NOT create a trunk commit in `--pr` mode. Signing stays disabled during the run and is restored unconditionally at close exactly as in the default mode.
- MUST stay **tool-agnostic** — Agent↔Task is the only seam. The CC Workflow fast-path is additive, not required.
- MUST keep this body under ~500 lines — link to the doctrine for rationale, don't restate it.
- SHOULD narrate each wave (dispatched beads, gate results, merges) so the user sees liveness on long epics.
