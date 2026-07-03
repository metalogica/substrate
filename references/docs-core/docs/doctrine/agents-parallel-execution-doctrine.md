# Parallel bead execution — orchestration policy (DOCTRINE)

> **The single source for how we run a bead DAG with parallel subagents on git worktrees.**
> Iterate here; don't re-explain it per session. Applies to any epic + its child beads
> (first use: `<epic-slug>`). Stack-agnostic: every build/test/lint command below resolves
> to the repo's **declared gate** in `substrate.yaml`, never a hardcoded toolchain.

## Roles

- **Orchestrator** (the main session): owns the tracker *and* git integration. The only
  actor that writes to tbd or pushes git.
- **Subagent** (one per bead, in its own worktree): implements exactly one bead, runs that
  bead's verification gate, and reports `pass/fail` + a short diff summary. **Touches
  neither tbd nor the remote.**

## Policies

### 1. Single-writer tracker
Only the orchestrator runs `tbd update` / `tbd close` / `tbd sync`. Subagents receive the
bead's **Goal / Files / Gate inlined into their prompt** and return a result; they are
never handed the `tbd` CLI or `git push`. One writer → no race on the shared `tbd-sync`
data branch.

### 2. Integration branch + merge-on-green
One integration branch per epic — `feat/<epic-slug>` — cut from the trunk. Each bead runs
in its **own worktree branched off the *current tip* of that integration branch**, so it
already contains its merged blockers. On a green gate: merge the bead's branch into the
integration branch, *then* spawn its dependents. Never branch all beads off stale trunk.
Sequence by dependency wave; the critical-path spine is serial by design, not by accident.

### 3. Batch sync
`auto_sync` stays **off**. Exactly one `tbd sync`, orchestrator-only, at epic close (or an
explicitly agreed checkpoint). Never sync mid-flight from a worktree.

### 4. Two-stage gate when the real proof is out-of-band (hardware / paid service / manual)
Some beads can't be proven headless — the gate needs a physical device, a paid external
service, or a human judgment the orchestrator can't drive. Split the gate:
- **Headless gate → MERGE.** What a subagent *can* prove offline: the declared gate
  (`gate.compile` + unit `gate.test` + `gate.lint`) and that the artifact assembles. Green
  here merges the bead into the integration branch and **unblocks its dependents — merge,
  not close, is the unblock signal**, so the chain never stalls on the single shared resource.
- **Out-of-band gate → CLOSE.** The remaining proof (the on-device run, the manual checklist,
  the paid-service call). The bead stays **open, merged, and noted** "awaiting `<gate>`" until
  a human runs it; only then does the orchestrator `tbd close`. "Gate before close" still holds
  — *close* just waits for the **full** gate. Each such bead ships its out-of-band checklist in
  its report. Declare the out-of-band step in `substrate.yaml` under `gate.out-of-band` so it is
  machine-visible, not just prose.

The one assumption a headless gate can't cover (e.g. an unproven external API's real behavior)
must be **isolated behind one swappable seam** and called out in the report, so the out-of-band
stage changes that seam and nothing else.

## Supporting rules

- **Gate before close.** A bead closes *only* when its embedded gate is green — the repo's
  **declared gate** (`gate.compile` then `gate.test` from `substrate.yaml`; a bead may override
  inline). Red → stays open, notes attached, re-dispatch or escalate. "Looks done" is not done.
- **File-disjoint waves.** Never run two beads that edit the same file in one wave. Shared files
  (the dependency manifest, the app entrypoint, shared barrels / re-export hubs) are serialized
  across waves, not within.
- **Per-worktree dependency install is cheap.** A worktree's dependency tree isn't shared across
  worktrees, but most toolchains dedupe via a content-addressable store — just run the repo's
  `toolchain-pin.install` step in each fresh worktree.
- **Seed a worktree's gitignored build inputs before dispatch.** A fresh worktree contains only
  *tracked* files. Anything gitignored that the gate needs — local SDK/config, generated clients,
  environment files — must be copied from the primary checkout (or regenerated) into each worktree
  *first*, or the gate fails spuriously and the subagent burns time diagnosing a phantom. The
  concrete list lives in `substrate.yaml`'s `worktree-seed[]`. Prefer a manual `git worktree add`
  + an explicit seed step over an auto-created worktree precisely so you can inject these before
  the agent starts.
- **Pin the toolchain in the dispatch prompt.** A worktree has no shell-activated version manager
  (mise/asdf/nvm/pyenv/…). Hand subagents the exact gate command with fully-resolved env from
  `substrate.yaml`'s `toolchain-pin.env` + `gate.*`, not a bare command that finds no toolchain.
- **Unattended signing.** Interactive commit signing (1Password/GPG/SSH) blocks or fails on a
  subagent's commits. Set `commit.gpgsign false` for the run (bead + integration branches), then
  land the result on trunk as **one signed commit** (`git merge --squash` + a signed commit) and
  **restore `commit.gpgsign true`**. Squash also keeps the unsigned bead commits out of trunk
  history. Never leave signing disabled past the run.
- **Re-run the gate on the integrated branch, not just per-branch.** After a wave's merges, run
  the gate once on the integration tip — two independently-green branches can still fail composed.
- **Worktree hygiene.** Remove a worktree after its merge; an unchanged worktree auto-cleans.
- **External blockers are edges, not prose.** If a bead waits on work outside the epic,
  model it as a dependency on a real bead (e.g. a downstream endpoint → its upstream migration)
  so the tracker keeps it out of `ready`.

## Seed & toolchain: the concrete recipe lives in `substrate.yaml`

This doctrine mandates the *principles* (seed gitignored inputs; hand over a fully-resolved gate
command) but carries **no stack literals**. The concrete recipe — the `worktree-seed[]` list, the
per-worktree `toolchain-pin.install` step, and the resolved `toolchain-pin.env` — is supplied per
repo by `substrate.yaml`. The orchestrator reads those keys before dispatch; this doctrine only
requires that they be honored.

## Per-bead dispatch checklist (orchestrator)

1. Confirm all blockers are closed (`tbd ready` / `tbd show <id>`).
2. `tbd update <id> --status in_progress`.
3. Spawn the subagent (worktree-isolated) with: the bead's **Goal / Files / Gate**, the
   plan/spec link, the relevant `CLAUDE.md`, and the standing rule *"no tbd, no git push —
   implement, run the gate, report pass/fail + a diff summary."*
4. On **green**: merge the worktree branch → integration branch; launch newly-unblocked
   dependents (off the updated tip). Then close — *but* if the bead has a Policy-4 out-of-band
   gate, **don't close**: `tbd update <id> --notes "merged; awaiting <out-of-band> gate"`
   and leave it open until that gate passes. Otherwise `tbd close <id> --reason "gate green: <summary>"`.
5. On **red**: keep open, `tbd update <id> --notes "<failure>"`, fix or escalate.
6. After the final bead's headless merge: a single `tbd sync`. Land the integration branch on
   trunk as one signed squash commit (Policy-4 beads close later, as their out-of-band gates pass).

## Why these (the reasoning, so future edits stay faithful)

Single-writer + batch-sync exist because N worktrees writing the same git-backed tracker
race and corrupt it. The integration branch exists because a dependent can't import code
its blocker hasn't merged. Everything else is conflict-avoidance and an objective
done-signal (the declared gate). Keep that spirit when you change this file.
