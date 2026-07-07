---
description: "Graph the Spec — decompose a written SDD spec into a directed acyclic graph of tbd beads so it can be executed in parallel. Invoke with a spec path (docs/tasks/ongoing/<slug>/<slug>-spec.md), or run with no args to discover the ongoing spec. Parses the spec's Prompt Execution Strategy (phases → steps), turns each unit into a bead, infers blocked-by edges from which files/symbols a step consumes vs. creates, cycle-checks via Kahn, and persists an epic + child beads under the canonical label epic:<slug>. Prints the wave shape via docs/scripts/bead-graph.sh. Called automatically as architect-spec's final step, or standalone to (re)graph any existing spec. Produces the DAG only — the parallel-execution doctrine's orchestrator consumes it; this command does not execute."
---

# /substrate/graph-spec

Turn a finished spec into a **bead DAG**: one epic + child beads wired by `blocked-by:` edges, all tagged with the canonical epic label `epic:<slug>`. The DAG is the input to substrate's parallel-execution doctrine — beads in the same topological wave touch no shared blocker and can be dispatched to worktree-isolated subagents at once.

This command **produces the graph; it does not run it.** Execution is the parallel-execution orchestrator's job (`docs/doctrine/agents-parallel-execution-doctrine.md`), or a plain phase-by-phase `/substrate/execute` pass.

## Arguments

`$ARGUMENTS` — path to a spec at `docs/tasks/ongoing/<slug>/<slug>-spec.md`. If omitted, discover it (see Step 1).

## When to run

- A spec exists and its Prompt Execution Strategy section is filled (phases → steps → verify → gate).
- You want the work decomposed into independently-dispatchable beads before execution — especially when phases contain file-disjoint steps that could run in parallel.
- Invoked automatically as the last step of `/substrate/architect-spec`, or by hand on any existing spec.

## When to REFUSE

Fail fast — abort with a one-line explanation, never fall back to a guess.

| Signal | Action |
|--------|--------|
| No spec path given AND none discoverable under `docs/tasks/ongoing/**/*-spec.md` | Ask the user for the spec path. |
| Spec has no "Prompt Execution Strategy" section (per `execution-format.md`) | Abort: "This spec has no execution strategy to decompose. Run `/substrate/architect-spec` to produce one." |
| Bead-tracker unresolvable (see Step 2) | Abort: state whether `tbd` or a markdown fallback is expected, and why neither resolved. |
| An epic already exists for this slug (`tbd list --type epic --label epic:<slug>` non-empty) | Do NOT double-create. Skip to Step 6 and render the existing DAG; offer to add only the missing beads. |

## Protocol you operate under

- **Execution grammar**: `docs/protocol/sdd/execution-format.md` (phases → steps → verify → gate) — the structure you decompose.
- **DAG algorithm**: mirrors `/substrate/synthesize-session` Step 8 (pairwise blocked-by inference + Kahn cycle detection). Same "bead DAG" dialect on purpose — one graph vocabulary across the plugin.
- **Consumer**: `docs/doctrine/agents-parallel-execution-doctrine.md` (single-writer tracker, integration branch, file-disjoint waves).

## Workflow

### Step 1 — Resolve the spec

If a path was passed, use it. Else glob `docs/tasks/ongoing/**/*-spec.md`:
- exactly one match → use it;
- several → list them and ask which;
- none → REFUSE per the table.

Derive `<slug>` from the containing directory name (`docs/tasks/ongoing/<slug>/...`). That slug is the whole coordination key: the epic label is `epic:<slug>`, deterministically, so `/substrate/synthesize-session` later files follow-up beads under the *same* label without any handshake.

Read the spec. Confirm it has a Prompt Execution Strategy section; if not, REFUSE.

### Step 2 — Resolve the bead-tracker

Same resolution as `/substrate/synthesize-session` (keep them identical):

1. If `.substrate/config.json` sets `"bead-tracker"`, honor it (`tbd | none | other`).
2. Else auto-detect `tbd`: `.tbd/config.yml` exists AND a `tbd` binary is callable — `command -v tbd` succeeds, OR `npx --no-install get-tbd --version` succeeds. Else `none`.

- `tbd` → beads are canonical; this command creates them via `tbd create`. Substitute `npx --no-install get-tbd` for `tbd` throughout if no global binary is on `PATH`.
- `none` → markdown is canonical; beads live at `docs/tasks/ongoing/<slug>/beads/<bead-slug>.md`. `blocked-by:` in frontmatter is the only edge record (no `tbd dep`).

### Step 3 — Decompose the spec into bead candidates

Walk the Prompt Execution Strategy. Each **step** (`#### Step N.M`) is one bead candidate; collapse trivially-coupled sibling steps only when they edit the same file and share a single Verify block. For each candidate capture, in memory (no writes yet):

- **title** — imperative, scoped (e.g. "Add `requireStoreOwner` guard to `convex/stores.ts`").
- **phase / layer** — the owning phase and its `layer-hint` (domain / backend / frontend / infra / cross-cutting).
- **creates** — files, symbols, exports, tables the step introduces or modifies (read the step body + its Verify block).
- **consumes** — files/symbols/commands the step depends on existing.
- **gate** — the step's Verify commands, inlined (a subagent runs these; per the parallel-execution doctrine it never touches tbd or git).
- **acceptance criterion** — binary pass/fail lifted from the step + its gate.

### Step 4 — Build the DAG

Mirror `/substrate/synthesize-session` Step 8:

1. **Pairwise scan.** For each ordered pair `(A, B)`, mark `B blocked-by A` iff B's **consumes** references a file/symbol/export/table in A's **creates**. This is richer than the linear phase order: two steps in the same phase that touch disjoint files land with no edge between them → same wave → parallel. Record a one-line reason per edge.
2. **Layer backstop.** If two beads share a file in their **creates** set, serialize them with an edge (later phase blocked-by earlier) even absent a symbol dependency — the parallel-execution doctrine forbids two beads editing one file in a wave.
3. **Cycle detection (Kahn).** Compute in-degrees; peel zero-in-degree nodes. If any remain → a cycle exists. **REFUSE**: print the cycle (`A → B → C → A`) and ask the user to split or drop a bead. Never emit a cyclic DAG.
4. Encode `blocked-by:` on each bead.

### Step 5 — Persist the epic + beads

Preview the full bead list in DAG order inline, then ask: `Create 1 epic + N beads under epic:<slug> now? (Y / n / select)` — default `Y` (binary gate, no default-escape suffix). `select` enters a per-bead `y / n / skip` loop.

**Branch A — `tbd`** (single-writer; you are the only writer):

1. **Epic bead:** `tbd create "Epic: <spec title>" --type epic -l "epic:<slug>" --file <spec-ref>` (a tempfile holding the spec path + one-line summary; `mktemp`, unlink after). Capture its id as `<epic-id>`.
2. **Child beads,** in DAG order so `blocked-by:` resolves to already-assigned ids:
   - render the bead body (acceptance criterion + inlined gate + state-transfer prompt) to a tempfile,
   - `tbd create "<title>" --type task --parent <epic-id> -l "epic:<slug>" --file <tmp>`, capture the id, `unlink` the tempfile (unconditional cleanup, even on failure),
   - for each blocker: `tbd dep add <bead-id> <blocker-id>`.
3. `--label epic:<slug>` is the canonical grouping — the label, not the parent link, is the join key `/substrate/synthesize-session` and `bead-graph.sh` rely on. `--parent` is the nicety on top.
4. Do **not** `tbd sync` here — batch sync stays the orchestrator's call at epic close (parallel-execution doctrine, Policy 3).

**Branch B — `none`:** write each bead to `docs/tasks/ongoing/<slug>/beads/<bead-slug>.md` with `blocked-by:` + `epic: <slug>` in frontmatter. The markdown file is the bead.

### Step 6 — Show the shape

Render the DAG so the user (and any future agent) can see parallel vs. sequential structure:

```bash
bash docs/scripts/bead-graph.sh --epic <slug>                 # flow view (default): rail + waves + critical-path spine
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

  /substrate/execute docs/tasks/ongoing/<slug>/<slug>-spec.md
```

## Constraints

- MUST derive `<slug>` from the spec directory and tag every bead (epic + children) with `epic:<slug>`. The label is the canonical epic identity — it is the contract with `/substrate/synthesize-session` and `bead-graph.sh`. Do not skip it.
- MUST cycle-check via Kahn before persisting and REFUSE on a cycle. A cyclic "DAG" is a bug, not a plan.
- MUST be the single writer to tbd (parallel-execution doctrine Policy 1). Never hand the tbd CLI or `git push` to a subagent.
- MUST NOT `tbd sync` — batch sync is the orchestrator's, at epic close.
- MUST NOT execute the beads, write feature code, or open worktrees. This command only produces the graph.
- MUST NOT double-create: if an epic for `<slug>` already exists, render the existing DAG and offer to add only missing beads.
- MUST clean up every tempfile it renders (`unlink` even on partial failure).
- SHOULD keep bead granularity at one-step-one-bead unless steps are file-coupled and share a Verify block — over-splitting inflates the DAG, under-splitting kills parallelism.
