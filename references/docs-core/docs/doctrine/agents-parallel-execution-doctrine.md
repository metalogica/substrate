# Parallel bead execution — orchestration policy (DOCTRINE)

> **The single source for how we run a bead DAG with parallel subagents on git worktrees.**
> Iterate here; don't re-explain it per session. Applies to any epic + its child beads
> (first use: `<epic-slug>`). Stack-agnostic: every build/test/lint command below resolves
> to the repo's **declared gate** in `substrate.yaml`, never a hardcoded toolchain.

## Where the DAG comes from — epic identity is a label

A spec becomes a bead DAG via `/substrate:graph-spec` (run automatically at the end of
`/substrate:architect-spec`, or standalone on any existing spec). Every bead it creates — the
epic container and its children — is tagged with the **canonical epic label `epic:<slug>`**,
where `<slug>` is the spec's `docs/tasks/ongoing/<slug>/` directory. That label, not the
parent link, is the join key: `/substrate:synthesize-session` stamps the *same* label on
session-discovered follow-up beads, so planned and discovered work render as one epic card.

**See the shape before you dispatch.** `bash docs/scripts/bead-graph.sh --epic <slug>` prints
the topological waves (every id in a wave is safe to run in parallel; waves run in order);
`--format mermaid` emits a paste-able `graph TD`. This is the parallel-execution plan — read
it first, then apply the policies below.

## Roles

- **Orchestrator** (the main session, depth-0 skill loop): owns the tracker *and* git
  integration. The sole actor that writes to tbd or pushes git; reads the partition,
  dispatches K group-runners, merges-on-green, re-gates the integrated tip, writes run-state.
  **Never implements code.**
- **Group-runner** (one per *window*, in its own worktree — formerly the one-bead subagent):
  implements the **N beads of a single `group:<window-N>`** in one warm worktree, **gating each
  bead in sequence**, and reports a **per-bead `pass/fail` ledger** + a short diff summary per
  bead. **Touches neither tbd nor the remote.** The redefinition from "one bead per subagent"
  to "one window per group-runner" is the context-budget partition (see *Grouping & windows*).

> These are abstract roles. In substrate the Orchestrator role is operationalized by the
> `/substrate:orchestrate` skill and the Group-runner role by the `bead-implementer` agent —
> this doctrine holds the *why*; that skill holds the *operational loop*.

## Grouping & windows — context-budget partitioning

One operation underlies both execution doors: **partition the DAG into agent-sized windows.**
A *window* is a set of beads sharing a `group:<window-N>` label, chosen so its accumulated
context cost stays under a budget — small enough that the runner's context never rots or
auto-compacts mid-window. **Attended** execution (`/substrate:execute`) is the degenerate case:
K collapses to one window with a human in the loop. **Orchestrated** execution
(`/substrate:orchestrate`, the primary door) is K windows, agent-coordinated.

**Grouping signal = file-adjacency.** Co-edited beads (they touch overlapping `Files`) belong in
the *same* window — one warm worktree keeps their shared files in context across all of them.
File-disjoint chains go in *separate* windows — isolation, and parallel where edges allow. This
is the same disjointness signal the file-disjoint-waves rule uses to *parallelize*, now also used
to *group*: co-edited ⇒ same window (sequential in one worktree); disjoint ⇒ separate windows
(parallel across worktrees).

**The `group:<window-N>` label.** `/substrate:graph-spec` computes the partition after its Kahn
cycle-check and stamps every bead with a `group:<window-N>` label (alongside `epic:<slug>`), plus
a `spec:<path>#<section>` back-link for a cold runner. `bead-graph.sh` renders windows; the
orchestrator reads the labels and MAY re-batch (a logged **deviation**), because the partition is
a *deviatable prior*, not a contract.

**Within a group vs. across groups (tip re-sync).**
- **Within a window:** the group-runner works sequentially in **one worktree** off the current
  integration tip. Beads in a window co-edit the same files by construction, so bead 1 → gate →
  bead 2 (which sees bead 1's edits) → gate → … No mid-window integration re-fetch; the shared
  worktree *is* the shared context.
- **Across windows:** the orchestrator merges a window's branch on green, advances the integration
  tip, and only then dispatches windows whose blockers are now merged. Tip re-sync happens at
  **window boundaries**, preserving the branch-off-current-tip spine.
- **Mid-window failure:** a bead failing mid-window blocks the *rest of that window* (left open,
  beads after it unstarted) but not windows outside it. The orchestrator reads the per-bead ledger
  to decide; siblings continue.

**Preserved invariants (unchanged by grouping).** Grouping changes only the *dispatch unit* (bead
→ window). Everything below still holds verbatim: **single-writer tracker**, **file-disjoint
waves**, **merge-on-green**, **gate-before-close**, the two-stage out-of-band gate, one signed
squash on trunk, and branch-off-current-tip. A window is just the granularity at which those
policies apply.

**State & policy homes.**

| Artifact | Home | Lifecycle |
|---|---|---|
| Partition policy (`context-budget`, `default-rung`) | `substrate.yaml` → `execution:` block | committed config |
| Chosen partition + per-bead outcome ledger + run-log pointer | `.substrate/execution-state.json` | committed state (mirrors `synthesis-state.json`) |
| Per-window heavy debug trace + deviation log | `.substrate/runs/<epic>/<run-id>/` | gitignored, TTL-swept |
| Per-bead partition membership | `group:<window-N>` label in tbd | with the DAG |
| Spec back-link for a cold runner | `spec:<path>#<section>` per bead | with the bead |

`substrate.yaml` `execution:` block (policy — a deviatable prior):

```yaml
execution:
  context-budget: 0.4      # max fraction of a window a group may fill before graph-spec splits it
  default-rung: auto       # auto | monolith | phase | group | per-bead
```

`.substrate/execution-state.json` (durable run-state — written by orchestrate before the trunk squash):

```json
{
  "<epic>": {
    "run-id": "<epic>-<YYYYMMDD-HHMM>",
    "partition": { "window-1": ["<bead-id>", "..."], "window-2": ["..."] },
    "deviations": [{ "from": "graph-spec", "reason": "<why re-batched>", "windows": {} }],
    "outcomes": { "<bead-id>": { "status": "pass|fail|open", "commit": "<sha|null>" } },
    "run-log": ".substrate/runs/<epic>/<run-id>/"
  }
}
```

Run-state is **durable and re-verified** — never a `spool`-style delete-on-read. `execution-state.json`
stays tracked; `.substrate/runs/` is gitignored.

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
