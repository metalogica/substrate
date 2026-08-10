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
| Chosen partition + per-wave union-regate ledger + per-bead outcome ledger + run-log pointer | `.substrate/execution-state.json` | committed state, written **incrementally per wave** (mirrors `synthesis-state.json`) |
| Per-window heavy debug trace + deviation log | `.substrate/runs/<epic>/<run-id>/` | gitignored, TTL-swept |
| Per-bead partition membership | `group:<window-N>` label in tbd | with the DAG |
| Spec back-link for a cold runner | `spec:<path>#<section>` per bead | with the bead |

`substrate.yaml` `execution:` block (policy — a deviatable prior):

```yaml
execution:
  context-budget: 0.4      # max fraction of a window a group may fill before graph-spec splits it
  default-rung: auto       # auto | monolith | phase | group | per-bead
```

`.substrate/execution-state.json` (durable run-state — written by orchestrate **incrementally per
wave**, finalized before the trunk squash):

```json
{
  "<epic>": {
    "run-id": "<epic>-<YYYYMMDD-HHMM>",
    "partition": { "window-1": ["<bead-id>", "..."], "window-2": ["..."] },
    "deviations": [{ "from": "graph-spec", "reason": "<why re-batched>", "windows": {} }],
    "re-gates": [
      { "wave": 1, "commands": ["<gate.compile>", "<gate.test>", "<per-bead gate unioned in>"],
        "result": "pass|fail", "tip-sha": "<sha>" }
    ],
    "outcomes": { "<bead-id>": { "status": "dispatched|merged|verified|oob-pending|fail|closed", "commit": "<sha|null>" } },
    "run-log": ".substrate/runs/<epic>/<run-id>/"
  }
}
```

**The `<epic>` entry is created before the first dispatch, not at epic close.** "Written
incrementally per wave" is only true if something creates the entry to write into — otherwise every
incremental write is a no-op against a missing key and the whole ledger materialises (or doesn't) at
the end. Initialise `{run-id, partition, re-gates: [], outcomes: {}}` as a numbered pre-dispatch
action, before any worktree exists. The failure this prevents is not hypothetical: a 12-window run
(sky-journal, 2026-08-04) merged real work, wrote its deviation log, and recorded **no
`execution-state.json` entry at all**, because entry creation lived only in the epic-close step the
run never reached. Corollary for the appending steps: if the entry is missing when you go to append
a re-gate, you skipped the initialisation — stop and fix that, do not create it late.

**`outcomes[id].status` is a non-destructive lifecycle** — `dispatched → merged → verified → closed`
on the happy path, `oob-pending` for a merged bead awaiting an out-of-band gate, `fail` for one
stopped mid-window. The orchestrator advances it at each point it gains knowledge (dispatch, merge,
union re-gate), so a live watcher renders each bead's real-time categorical state **without any
`tbd close` firing mid-run** — the bead stays `open` in the tracker until epic close. This is what
lets the TUI show beads progressing one wave at a time on a non-destructive signal (the legacy
`pass` value is read as `verified`). Close is a **terminal archival batch** (§Policy-4, checklist
step 6), not the live progress signal — which also removes any exposure to a spurious mid-run
close flipping a bead out of the open view.

`re-gates[]` is the per-wave union-regate proof (§Supporting → *Re-run the gate on the integrated
branch*): one entry per wave, appended as it runs — so a crashed or aborted run still leaves the
history that makes a composition failure diagnosable, and a missing wave entry is a detectable
protocol violation. Run-state is **durable and re-verified** — never a `spool`-style delete-on-read.
`execution-state.json` stays tracked; `.substrate/runs/` is gitignored.

## Policies

### 1. Single-writer tracker
Only the orchestrator runs `tbd update` / `tbd close` / `tbd sync`. Subagents receive the
bead's **Goal / Files / Gate inlined into their prompt** and return a result; they are
never handed the `tbd` CLI or `git push`. One writer → no race on the shared `tbd-sync`
data branch.

### 2. Integration branch + merge-on-green
One integration branch per epic — `feat/<epic-slug>` — cut from the trunk. Each **window** runs
in its **own worktree branched off the *current tip* of that integration branch**, so it already
contains its merged blockers. The group-runner implements the window's beads in sequence in that
one warm worktree (gating each). On the window's green ledger: merge the window branch into the
integration branch, **re-gate the integrated tip with the union gate** (§Supporting), *then*
dispatch the windows it unblocked. Never branch all windows off stale trunk. Sequence by dependency
wave; the critical-path spine is serial by design, not by accident. (A pre-partition DAG with no
`group:` labels degenerates to one bead per window — the classic per-bead behavior.)

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
  Green gate marks the bead `verified` in the run-state (the live done-signal); the **`tbd close`
  itself is deferred to the terminal batch** (checklist step 6) — gate-before-close still holds,
  the *close* just rides one archival sync at epic close instead of firing per wave.
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

  **Seed immutable inputs only.** Never seed — or symlink — a handle to *shared mutable state*: a
  local dev-deployment directory, a running database's state dir, a session/credential cache. Every
  worktree wired to one is writing branch-side data into state the primary checkout reads, so a
  fleet quietly corrupts the developer's own environment. Regenerate such inputs offline inside the
  worktree instead, or route the beads that genuinely need the live backend to the primary
  checkout.
- **A window's gate runs under a declared resource envelope.** K windows gating in parallel are K
  copies of a test runner that, by default, sizes its worker pool to the whole machine — so the
  fleet oversubscribes by K×, and on a developer machine it competes with the dev stack too. The
  repo declares the knob and the budget (`substrate.yaml`'s `execution.resource-envelope`: the env
  var to set, a cores budget, and a floor); the orchestrator computes each window's share —
  `max(floor(cores-budget / K), floor)` — and injects it alongside `toolchain-pin.env`. **A gate
  that assumes it owns the machine is a defect at K > 1.** Caps must be proven *behaviourally* (an
  observed process count under a set cap), never by the presence of a config key: runners routinely
  ignore options they no longer recognise.
- **Pin the toolchain in the dispatch prompt.** A worktree has no shell-activated version manager
  (mise/asdf/nvm/pyenv/…). Hand subagents the exact gate command with fully-resolved env from
  `substrate.yaml`'s `toolchain-pin.env` + `gate.*`, not a bare command that finds no toolchain.
- **Unattended signing — scope it to the worktrees, never to the repo.** Interactive commit
  signing (1Password/GPG/SSH) blocks or fails on a subagent's commits, so the fleet's commits must
  be unsigned. Do **not** get there by flipping the repo-local `commit.gpgsign false`: that config
  is *shared with the primary checkout*, so for the whole run a human's own commits land silently
  unsigned, and a killed run never reaches the restore, leaving signing off until somebody notices.
  Instead: enable `extensions.worktreeConfig` once (a persistent repo-format change — provision it
  deliberately at worktree-creation time), and set `commit.gpgsign false` **per worktree**
  (`git -C <path> config --worktree commit.gpgsign false`). For commits the orchestrator itself
  authors in the primary checkout (merges), pass it per invocation instead:
  `git -c commit.gpgsign=false merge …`. Land the result on trunk as **one signed commit**
  (`git merge --squash` + a signed commit) — the single interactive-signing moment, and the reason
  squash also keeps the unsigned bead commits out of trunk history.

  This is **crash-safe by construction**: the primary checkout's configuration is never mutated, so
  there is nothing to restore and no window in which a crash can leave signing disabled. What used
  to be a mandatory restore step becomes a *verification* (assert the primary is still `true`), and
  a worktree's override disappears with the worktree.
- **Re-run the gate on the integrated branch — as the *union* of every suite the wave touched, not
  just `gate.*`.** After a wave's merges, run one re-gate on the integration tip. It must be the
  **union of the declared `gate.{compile,test,lint}` and every distinct per-bead gate the beads
  merged this wave exercised** (deduped) — because the per-bead gates can be *narrower* than `gate.*`
  (a `tsc`-only frontend bead) *and* `gate.*` itself can be *narrower* than the suites the wave ran
  (a `gate.test` that only runs the backend suite while a frontend `vitest` ran per-bead). Re-gate
  with `gate.*` alone and a suite the wave exercised never gets composed-checked, so a green-reported
  wave can rest on a red integrated tip until some later wave happens to run the missing suite. This
  union re-gate — not the per-bead pre-checks — is the **sole merge-authorizing signal** for the
  wave; two independently-green branches can still fail composed. It is **mandatory and recorded**:
  append `{wave, commands, result, tip-sha}` to `execution-state.json` as each wave re-gates (the
  file is written *incrementally*, so an aborted run still carries the proof). A wave with no recorded
  re-gate is a protocol violation.
- **Worktree hygiene — and branch hygiene.** Remove a worktree after its merge; an unchanged
  worktree auto-cleans. **Reap the branches too**: delete each `<window-branch>` as it merges, and
  delete `feat/<epic-slug>` once the squash has landed on trunk. Nothing downstream reads them —
  the squash carries the content and `execution-state.json` carries the history — so left alone
  they accumulate one dead ref per window per epic and make the branch list useless for finding
  live work.
- **External blockers are edges, not prose.** If a bead waits on work outside the epic,
  model it as a dependency on a real bead (e.g. a downstream endpoint → its upstream migration)
  so the tracker keeps it out of `ready`.

## Seed & toolchain: the concrete recipe lives in `substrate.yaml`

This doctrine mandates the *principles* (seed gitignored inputs; hand over a fully-resolved gate
command) but carries **no stack literals**. The concrete recipe — the `worktree-seed[]` list, the
per-worktree `toolchain-pin.install` step, and the resolved `toolchain-pin.env` — is supplied per
repo by `substrate.yaml`. The orchestrator reads those keys before dispatch; this doctrine only
requires that they be honored.

## Per-window dispatch checklist (orchestrator)

The dispatch unit is the **window** (a `group:<window-N>`), not the bead. (Absent `group:` labels
the DAG degenerates to one bead per window — the steps below are unchanged, N just equals 1.)

0. **Before any worktree exists**, initialise the run-state entry for this epic in
   `.substrate/execution-state.json`: `{run-id, partition, re-gates: [], outcomes: {}}`. Everything
   below appends to it.
1. Confirm every bead in the window is ready — all blockers **closed *or merged*** (`tbd ready` /
   `tbd show <id>`; merge, not close, is the unblock signal). A window dispatches only when *all*
   its beads are ready.
2. `tbd update <id> --status in_progress` for **each bead in the window**, and stamp each bead's
   run-state `outcome: dispatched`.
3. `git worktree add` off the **current integration tip**; copy `worktree-seed[]` in and run
   `toolchain-pin.install` **once for the window**. Spawn **one group-runner** (worktree-isolated)
   with: the window's **N sequenced bead tuples** (each **Goal / Files / Gate**, env-resolved), the
   `spec:<path>#<section>` back-links, the relevant `CLAUDE.md`, and the standing rule *"no tbd, no
   git push — implement each bead in sequence, run each bead's gate, report a per-bead pass/fail
   ledger + a diff summary."*
4. Read the returned **per-bead ledger**. Merge the green `pass` prefix → integration branch and
   stamp each merged bead `outcome: merged`; **re-gate the integrated tip with the union gate**
   (§Supporting) and, on green, advance each to `outcome: verified` — *or* `oob-pending` for a
   Policy-4 out-of-band bead (`tbd update <id> --notes "merged; awaiting <out-of-band> gate"`).
   Launch newly-unblocked windows (off the updated tip). **Do not `tbd close` here** — the bead
   stays `open` in the tracker; `verified` is the live done-signal a watcher renders, and the close
   is deferred to the terminal batch (step 6). Merge, not close, is the unblock signal, so deferring
   the close changes no scheduling.
5. On a **red** bead: it stops its window (remaining beads `unstarted`); keep the red + unstarted
   beads open, `tbd update <id> --notes "<failure>"`, fix or escalate. **Sibling windows continue.**
6. After the final window's headless merge: finalize `.substrate/execution-state.json`, **reap the
   debris** (window branches on merge, `feat/<epic-slug>` once the squash lands), then **close
   every `verified` bead in one batch** — `tbd close <id1> <id2> … --reason "gate green"`, one call,
   stamping each `outcome: closed` — run the single `tbd sync`, and land the integration branch on
   trunk as one signed squash commit. Beads left `oob-pending` stay open and close later, as their
   out-of-band gates pass.

## Remote / cloud orchestration (dispatch)

The same loop runs **in a GitHub runner** via `/substrate:dispatch <epic>` (the cloud door) with
`/substrate:orchestrate <epic> --auto --pr`. Nothing above changes — single-writer, file-disjoint
waves, integration branch + merge-on-green, union re-gate — only the *landing* and the *trigger*
differ. Codified from what the dispatch feature landed:

- **The tracker is the event bus, and it is a branch.** tbd is git-native; beads sync to a dedicated
  `tbd-sync` branch (`sync.branch`), not to `.tbd/**` on the default branch. So the cloud runner
  makes beads visible with `git fetch origin tbd-sync` — and the natural event-driven trigger (v2)
  is a push to `tbd-sync`, never a push to the default branch (which carries no bead data).
- **Single-writer is preserved across the boundary.** `/substrate:dispatch` performs exactly one
  `tbd sync` to publish, then only *triggers* (`gh workflow run`); the **in-runner orchestrator is
  the sole writer** for the epic from there. dispatch never orchestrates locally — the local machine
  and the runner are never both writing the epic's beads.
- **`--pr` landing.** In cloud mode the orchestrator does **not** squash to trunk. It pushes
  `feat/<epic-slug>` after each green wave re-gate (the PR accumulates the per-bead commits live,
  wave by wave) and leaves the PR open; **GitHub's squash-merge is the single squasher**, re-authoring
  the unsigned per-bead commits into one commit — so the unsigned-commits-out-of-trunk invariant holds
  by a different mechanism than the local `git merge --squash`.
- **Manual before event-driven.** The v1 trigger is manual (`workflow_dispatch`), which structurally
  eliminates self-retriggering (the runner's own close-time `tbd sync` cannot fire a workflow nothing
  watches). The event-driven trigger (`on: push: [tbd-sync]`) is a strict superset that additionally
  requires a **new-epic guard + a persisted `run:<id>` claim-lock** to stay idempotent — the claim,
  written as the runner's first action, doubles as the single-writer lock.

The declared cloud environment lives in `substrate.yaml`'s `ci:` block (services / bootstrap /
secrets-needed / runner); `/substrate:adopt` installs it + the `substrate-orchestrate.yml` seam.
Because GitHub `services:`/`runs-on:` are static job keys, that seam is token-substituted at adopt
time, not computed at runtime.

## Local-first pull consumer (serve)

The orchestrator is not the only automaton that drives the tbd board. `substrate serve` (the
`daemon/` package) is a **second consumer**: a local-first pull daemon that polls the board, claims
a groomed bead, routes it, dispatches a headless session in a sibling worktree, opens a PR, and
reaps on merge. It is a *different* shape from the orchestrated fleet — single-bead lanes, no
integration branch, human squash-merge — but it **honors the same core invariants and adds three of
its own**. Codified from what serve-v1 landed (grounded in `daemon/src/`), so the two consumers
don't drift apart:

- **Single-writer generalizes past the orchestrator.** The single-writer-tracker invariant
  (Policy-1) is not orchestrator-specific — it binds *any* automaton that writes tbd. The serve
  daemon is the sole author of its own bead lifecycle transitions at runtime: claim / release /
  stamp / route / in-review / close all funnel through one adapter (`daemon/src/queue.ts`, a typed
  shell over `tbd … --json`), and that adapter never parses tbd's on-disk store — the CLI is the
  only contract. One writer per board region → no race on the shared tracker, same reason as the
  fleet's single writer.
- **Sessions are cattle — success is observed, never self-reported.** A headless lane session's own
  output is **never** trusted as the done-signal. `daemon/src/session.ts` returns only the *raw*
  outcome (exit code, usage, log path) and carries no `success` field by design; the caller decides
  success by **observation** — branch pushed ∧ PR open. This is the pull-daemon's form of
  "gate-before-close / looks-done is not done": the objective signal is external artifact state, not
  the agent's self-report. `claude -p` behavior drift is therefore a tolerated risk, absorbed by
  observing the world instead of reading the session's claims.
- **Recovery reconciles from observed truth only ({tbd, git, gh}).** The daemon's `state.json` is
  observability, never a source of truth. `daemon/src/tidy.ts` rebuilds the world purely from the
  three external sources and **never** reconstructs state from a prior `state.json` — so `kill -9`
  at any instant boots into a consistent world (boot-reap). This is the same "durable, re-verified,
  never delete-on-read" spirit as `execution-state.json`, taken to its limit: the daemon's own
  persisted state is discardable because everything is re-derivable from {tbd, git, gh}.
- **Board membership is derived, never opt-in — the views must partition open work.** Planning
  holds every open bead *no epic has claimed*; Epics holds the rest. An open bead is therefore on
  exactly one view and cannot fall between them, so a bead created by a bare `tbd create` — an
  agent's or a human's — is visible without anyone remembering a label. This is not a rendering
  preference: the board is a *triage* surface, so a bead missing from it reads as "no outstanding
  work" rather than "work you cannot see", and the failure is silent. Any opt-in membership filter
  reintroduces that class of bug (one did: an `inbox` label only the TUI's capture key applied hid
  every CLI-created bead). Corollary: a view that filters MUST state what it excluded — an empty
  list that cannot distinguish "nothing to triage" from "everything is hidden" is a lie by default.
- **Deterministic routing; the human prior is followed or bounced, never guessed past.**
  `daemon/src/router.ts` is a **pure** function of a bead's own `kind:` / labels — no model call in
  the routing decision. It only *follows* the human's prior (route to a lane) or *returns* it
  (bounce to the board with a reason); it never invents a `kind`. The override-log hook
  (`logOverride`) is a deliberate no-op **seam** in v1 — named and called on every route arm so the
  v2 model-assisted path is a one-file edit, isolating the one place a future model could diverge
  from the human prior.

No auto-merge and no webhooks: tbd is the queue, the loop polls, and a human squash-merges the PR —
the daemon detects the merge and reaps. The daemon is deliberately replaceable behind these seams
(session spawn, the router override hook, the observed-truth collectors) so the eventual VPS phase
is a deployment change, not a rewrite.

## Why these (the reasoning, so future edits stay faithful)

Single-writer + batch-sync exist because N worktrees writing the same git-backed tracker
race and corrupt it. The integration branch exists because a dependent can't import code
its blocker hasn't merged. Everything else is conflict-avoidance and an objective
done-signal (the declared gate). Keep that spirit when you change this file.
