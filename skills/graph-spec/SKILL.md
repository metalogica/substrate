---
name: graph-spec
description: "Graph the Spec — decompose a written SDD spec into a directed acyclic graph of tbd beads so it can be executed in parallel. Invoke with a spec path (docs/tasks/ongoing/<slug>/<slug>-spec.md), or run with no args to discover the ongoing spec. Parses the spec's Prompt Execution Strategy (phases → steps), turns each unit into a bead, infers blocked-by edges from which files/symbols a step consumes vs. creates (folding behavior-invalidated tests into the changing bead's write-scope), cycle-checks via Kahn, partitions the DAG into context-budget windows by file-adjacency (group:<window-N> labels — the unit the orchestrator dispatches), and persists an epic + child beads under the canonical label epic:<slug>. Prints the wave shape via docs/scripts/bead-graph.sh. Called automatically as architect-spec's final step, or standalone to (re)graph any existing spec. Produces the DAG only — the parallel-execution doctrine's orchestrator consumes it; this skill does not execute."
---

# /substrate:graph-spec

Turn a finished spec into a **bead DAG**: one epic + child beads wired by `blocked-by:` edges, all tagged with the canonical epic label `epic:<slug>`. The DAG is the input to substrate's parallel-execution doctrine — beads in the same topological wave touch no shared blocker and can be dispatched to worktree-isolated subagents at once.

This skill **produces the graph; it does not run it.** Execution is the parallel-execution orchestrator's job (`docs/doctrine/agents-parallel-execution-doctrine.md`), or a plain phase-by-phase `/substrate:execute` pass.

## Arguments

`<spec-path>` — path to a spec at `docs/tasks/ongoing/<slug>/<slug>-spec.md`. If omitted, discover it (see Step 1).

## When to run

- A spec exists and its Prompt Execution Strategy section is filled (phases → steps → verify → gate).
- You want the work decomposed into independently-dispatchable beads before execution — especially when phases contain file-disjoint steps that could run in parallel.
- Invoked automatically as the last step of `/substrate:architect-spec`, or by hand on any existing spec.

## When to REFUSE

Fail fast — abort with a one-line explanation, never fall back to a guess.

| Signal | Action |
|--------|--------|
| No spec path given AND none discoverable under `docs/tasks/ongoing/**/*-spec.md` | Ask the user for the spec path. |
| Spec has no "Prompt Execution Strategy" section (per `execution-format.md`) | Abort: "This spec has no execution strategy to decompose. Run `/substrate:architect-spec` to produce one." |
| Bead-tracker unresolvable (see Step 2) | Abort: state whether `tbd` or a markdown fallback is expected, and why neither resolved. |
| An epic already exists for this slug (`tbd list --type epic --label epic:<slug>` non-empty) | Do NOT double-create. Skip to Step 6 and render the existing DAG; offer to add only the missing beads. |

## Protocol you operate under

- **Execution grammar**: `docs/protocol/sdd/execution-format.md` (phases → steps → verify → gate) — the structure you decompose.
- **DAG algorithm**: mirrors `/substrate:synthesize-session` Step 8 (pairwise blocked-by inference + Kahn cycle detection). Same "bead DAG" dialect on purpose — one graph vocabulary across the plugin.
- **Consumer**: `docs/doctrine/agents-parallel-execution-doctrine.md` (single-writer tracker, integration branch, file-disjoint waves).

## Workflow

### Step 1 — Resolve the spec

If a path was passed, use it. Else glob `docs/tasks/ongoing/**/*-spec.md`:
- exactly one match → use it;
- several → list them and ask which;
- none → REFUSE per the table.

Derive `<slug>` from the containing directory name (`docs/tasks/ongoing/<slug>/...`). That slug is the whole coordination key: the epic label is `epic:<slug>`, deterministically, so `/substrate:synthesize-session` later files follow-up beads under the *same* label without any handshake.

Read the spec. Confirm it has a Prompt Execution Strategy section; if not, REFUSE.

### Step 2 — Resolve the bead-tracker

Same resolution as `/substrate:synthesize-session` (keep them identical):

1. If `.substrate/config.json` sets `"bead-tracker"`, honor it (`tbd | none | other`).
2. Else auto-detect `tbd`: `.tbd/config.yml` exists AND a `tbd` binary is callable — `command -v tbd` succeeds, OR `npx --no-install get-tbd --version` succeeds. Else `none`.

- `tbd` → beads are canonical; this skill creates them via `tbd create`. Substitute `npx --no-install get-tbd` for `tbd` throughout if no global binary is on `PATH`.
- `none` → markdown is canonical; beads live at `docs/tasks/ongoing/<slug>/beads/<bead-slug>.md`. `blocked-by:` in frontmatter is the only edge record (no `tbd dep`).

### Step 3 — Decompose the spec into bead candidates

Walk the Prompt Execution Strategy. Each **step** (`#### Step N.M`) is one bead candidate; collapse trivially-coupled sibling steps only when they edit the same file and share a single Verify block. For each candidate capture, in memory (no writes yet):

- **title** — imperative, scoped (e.g. "Add `requireStoreOwner` guard to `convex/stores.ts`").
- **phase / layer** — the owning phase and its `layer-hint` (domain / backend / frontend / infra / cross-cutting).
- **creates** — files, symbols, exports, tables the step introduces or modifies (read the step body + its Verify block).
- **consumes** — files/symbols/commands the step depends on existing.
- **invalidated tests (reconcile)** — existing tests that assert behavior this bead *changes* (distinct from any new tests the step adds). A behavior change to an existing symbol / contract / exported member / required-dependency almost always breaks a test that pinned the old behavior, yet the step body rarely names that test. **Reverse-scan the test tree** for tests referencing the changed symbol/file/contract and fold each matching test file into this bead's **creates** (its write-scope) with a one-line `reconcile:` note ("asserts prior behavior of X"). Skipping this is the single most common cause of a mid-run stall: the test lives outside the bead's declared Files, so the group-runner can't touch it and the break surfaces only at the integrated re-gate. Purely-additive beads (new files, no change to an existing symbol) have no invalidated tests — leave this empty.
- **gate** — the step's Verify commands, inlined (a subagent runs these; per the parallel-execution doctrine it never touches tbd or git). Compare it to `substrate.yaml`'s `gate.{compile,test,lint}`: if the bead's gate is a **strict subset** of `gate.*`, or omits a suite the bead's layer is actually covered by (e.g. a frontend bead that runs only `tsc`, not the `vitest` suite), tag the bead **`gate-scope: partial`** in its body. That tells the orchestrator its per-bead green is a *fast pre-check only*, and that the wave's **union re-gate** — not this narrow gate — authorizes the merge (`agents-parallel-execution-doctrine.md §Supporting → Re-run the gate on the integrated branch`). A gate that equals or supersets `gate.*` needs no tag.
- **acceptance criterion** — binary pass/fail lifted from the step + its gate.

### Step 4 — Build the DAG

Mirror `/substrate:synthesize-session` Step 8:

1. **Pairwise scan.** For each ordered pair `(A, B)`, mark `B blocked-by A` iff B's **consumes** references a file/symbol/export/table in A's **creates**. This is richer than the linear phase order: two steps in the same phase that touch disjoint files land with no edge between them → same wave → parallel. Record a one-line reason per edge.
2. **Layer backstop.** If two beads share a file in their **creates** set, serialize them with an edge (later phase blocked-by earlier) even absent a symbol dependency — the parallel-execution doctrine forbids two beads editing one file in a wave.
3. **Cycle detection (Kahn).** Compute in-degrees; peel zero-in-degree nodes. If any remain → a cycle exists. **REFUSE**: print the cycle (`A → B → C → A`) and ask the user to split or drop a bead. Never emit a cyclic DAG.
4. Encode `blocked-by:` on each bead.

### Step 4.5 — Partition into context-budget windows

The DAG is now cycle-free; cut it into agent-sized **windows** so no group-runner's context
rots or auto-compacts. Read `execution.context-budget` from `substrate.yaml` (default `0.4` if
absent — a deviatable prior, not a hard gate). Then:

1. **Estimate per-bead cost.** Walk beads in topological order. For each, estimate
   `cost = Σ(bytes of its Files/creates+consumes) + heavy-ref surcharge (schema / contract /
   migration reads the bead must load) + gate-log weight + effort(XS…L)`. This is a heuristic
   prior, not a measurement — round generously.
2. **Accumulate into windows.** Open `window-1`; add beads in topological order, summing cost.
   When the running total would cross `context-budget` (as a fraction of one agent's usable
   window), close the current window and open the next. **Snap boundaries to file-adjacency:**
   never split a chain of co-edited beads (overlapping `Files`) across two windows — co-edited
   beads share a warm worktree, so they belong to the *same* window; file-disjoint chains fall
   into *separate* windows (isolation, parallel where edges allow). Adjacency wins over the raw
   cost cut when they conflict.
3. **Flag under-decomposition.** If a *single* bead's cost alone exceeds `context-budget`, do
   **not** silently over-fill a window: **warn** and recommend splitting that bead (it is too
   heavy for one runner), then place it in its own window so the run can still proceed.

The partition is a **deviatable prior**: the orchestrator MAY re-batch at dispatch time (logging
the deviation). See `agents-parallel-execution-doctrine.md §Grouping & windows`.

### Step 4.6 — Force the terminal doctrine-reconciliation node

Every spec ends with `Phase N: Doctrine Reconciliation` (per `spec-template.md`). Its bead is **not** an ordinary node — it is the epic's mandatory **terminal** node that applies the ratify-only doctrine change the feature earned, in-epic. It never queues a `doctrine-amendment` and there is no downstream sink. Shape it explicitly, overriding the generic decomposition:

1. **Tag it** `kind: doctrine-reconciliation` (an additive tag alongside `epic:<slug>`), so the orchestrator can identify the terminal node.
2. **Edge it `blocked-by` every other bead in the epic.** It must see the *fully integrated* feature — no other bead may land after it. This is deliberately the one node that collapses parallelism at the end; that's correct.
3. **Write-scope = `docs/doctrine/**`.** Put `docs/doctrine/**` in its `creates`/Files. Editing doctrine files is ordinary working-tree change a group-runner may make in its worktree — it is **not** a tracker write, so the single-writer invariant is untouched.
4. **Solo terminal window.** Give it its own `group:<window-N>` as the last window (it is `blocked-by` everything, so it is structurally its own final wave regardless). Never fold it into a feature window.
5. **Ratify-only gate.** Its gate is the epic's full union gate re-run on the integrated tip — green proves the mutation only codified what the code already did. Do **not** tag it `gate-scope: partial`.

If the spec somehow lacks a Doctrine Reconciliation phase, **synthesize this node anyway** — it is mandatory per the contract; warn that the spec was missing it.

### Step 5 — Persist the epic + beads

Preview the full bead list in DAG order inline, then ask: `Create 1 epic + N beads under epic:<slug> now? (Y / n / select)` — default `Y` (binary gate, no default-escape suffix). `select` enters a per-bead `y / n / skip` loop.

**Branch A — `tbd`** (single-writer; you are the only writer):

1. **Epic bead:** `tbd create "Epic: <spec title>" --type epic -l "epic:<slug>" --file <spec-ref>` (a tempfile holding the spec path + one-line summary; `mktemp`, unlink after). Capture its id as `<epic-id>`.
2. **Child beads,** in DAG order so `blocked-by:` resolves to already-assigned ids:
   - render the bead body (acceptance criterion + inlined gate + state-transfer prompt) to a tempfile,
   - `tbd create "<title>" --type task --parent <epic-id> -l "epic:<slug>" -l "group:<window-N>" --file <tmp>`, where `<window-N>` is the bead's window from Step 4.5 (add `-l "kind:doctrine-reconciliation"` for the terminal node from Step 4.6); capture the id, `unlink` the tempfile (unconditional cleanup, even on failure),
   - stamp the spec back-link so a cold runner can re-open context: include `spec: <spec-path>#<owning-phase-or-step>` in the bead body (and, when the tracker supports it, `tbd update <bead-id> --spec <spec-path>`),
   - for each blocker: `tbd dep add <bead-id> <blocker-id>`.
3. `--label epic:<slug>` is the canonical grouping — the label, not the parent link, is the join key `/substrate:synthesize-session` and `bead-graph.sh` rely on. `--parent` is the nicety on top. `group:<window-N>` is the partition membership the orchestrator reads (and MAY re-batch) per `agents-parallel-execution-doctrine.md §Grouping & windows`.
4. Do **not** `tbd sync` here — batch sync stays the orchestrator's call at epic close (parallel-execution doctrine, Policy 3).

**Branch B — `none`:** write each bead to `docs/tasks/ongoing/<slug>/beads/<bead-slug>.md` with `blocked-by:`, `epic: <slug>`, `group: <window-N>` (its Step-4.5 window), and `spec: <spec-path>#<owning-phase-or-step>` in frontmatter. The markdown file is the bead.

### Step 6 — Show the shape

Render the DAG so the user (and any future agent) can see parallel vs. sequential structure:

```bash
bash docs/scripts/bead-graph.sh --epic <slug>                 # topological waves (default)
bash docs/scripts/bead-graph.sh --epic <slug> --format mermaid  # paste-able graph TD
```

Print the waves view inline. Under `tbd`, the script reads the beads you just created; under `none`, tell the user the waves view requires `tbd` and print the DAG from your in-memory layering instead.

### Step 7 — Hand off

Print verbatim:

```
✔ Spec graphed into a bead DAG.

Epic label: epic:<slug>   ·   1 epic + N beads   ·   W waves (see above)

Inspect any time:
  bash docs/scripts/bead-graph.sh --epic <slug>
  bash docs/scripts/bead-graph.sh --epic <slug> --format mermaid

To execute in parallel, hand this DAG to the orchestrator per
docs/doctrine/agents-parallel-execution-doctrine.md (single-writer tracker,
integration branch, file-disjoint waves). For a simple sequential pass:

  claude /substrate:execute docs/tasks/ongoing/<slug>/<slug>-spec.md
```

## Constraints

- MUST derive `<slug>` from the spec directory and tag every bead (epic + children) with `epic:<slug>`. The label is the canonical epic identity — it is the contract with `/substrate:synthesize-session` and `bead-graph.sh`. Do not skip it.
- MUST emit exactly one **terminal doctrine-reconciliation node** per epic (Step 4.6): tagged `kind: doctrine-reconciliation`, `blocked-by` every other bead, `docs/doctrine/**` in its write-scope, in its own solo terminal `group:<window-N>`. This is the in-epic sink for doctrine change — the graph MUST NOT rely on a downstream `doctrine-amendment` queue.
- MUST cycle-check via Kahn before persisting and REFUSE on a cycle. A cyclic "DAG" is a bug, not a plan.
- MUST be the single writer to tbd (parallel-execution doctrine Policy 1). Never hand the tbd CLI or `git push` to a subagent.
- MUST NOT `tbd sync` — batch sync is the orchestrator's, at epic close.
- MUST NOT execute the beads, write feature code, or open worktrees. This skill only produces the graph.
- MUST NOT double-create: if an epic for `<slug>` already exists, render the existing DAG and offer to add only missing beads.
- MUST clean up every tempfile it renders (`unlink` even on partial failure).
- MUST run the **invalidated-tests reverse-scan** for every behavior-changing bead and fold the affected existing test files into that bead's Files/write-scope with a `reconcile:` note. A behavior change whose broken test sits outside the bead's Files is a guaranteed mid-run stall — the group-runner can't touch what isn't in scope.
- MUST tag a bead **`gate-scope: partial`** when its inlined gate is a strict subset of `substrate.yaml`'s `gate.*` (or omits a suite its layer is covered by), so the orchestrator treats the per-bead green as a pre-check and relies on the wave's union re-gate to authorize the merge.
- SHOULD keep bead granularity at one-step-one-bead unless steps are file-coupled and share a Verify block — over-splitting inflates the DAG, under-splitting kills parallelism.
