---
description: "Run a graphed epic in the cloud. Publishes the epic's beads to the tbd-sync branch, fires the repo's substrate-orchestrate GitHub workflow (headless `/substrate/orchestrate <epic> --auto --pr`), and surfaces the run + PR URLs — the PR then accumulates the per-bead commits live, wave by wave, for you to review and squash-merge. The local trigger door for cloud execution: dispatch TRIGGERS, it never orchestrates locally (single-writer stays with the in-runner orchestrator). Requires the repo to be cloud-dispatch-enabled (a `ci:` block in substrate.yaml + the substrate-orchestrate.yml workflow, both installed by /substrate/adopt) and the epic to be graphed by /substrate/graph-spec. Use this to offload a parallel epic build to a runner instead of running the fleet locally; use /substrate/orchestrate to run it locally, or /substrate/execute for attended single-window."
---

# /substrate/dispatch

Offload a **graphed epic** to a GitHub runner. The runner executes the bead DAG headless and opens a PR whose commits land wave-by-wave; you review and squash-merge. This command is the thin **local trigger** — it publishes, fires the workflow, and reports URLs. It does **not** orchestrate locally (that stays the runner's single-writer job).

**When to use this vs other commands:**

- `/substrate/dispatch <epic>` — run a graphed epic **in the cloud** (offload the fleet; watch commits land on a PR).
- `/substrate/orchestrate <epic>` — run the same DAG **locally** as a worktree fleet.
- `/substrate/execute <spec>` — attended, single-window, human-in-the-loop.

## Arguments

`$ARGUMENTS` — an epic label `epic:<slug>` or a bare `<slug>`. Empty → list dispatchable graphed epics and ask which.

## When to REFUSE

| Signal | Redirect |
|--------|----------|
| Not a git repo, or no `origin` remote | dispatch needs a remote to push `feat/<slug>` + open a PR. |
| No `ci:` block in `substrate.yaml` | Run `/substrate/adopt` and opt into cloud dispatch. |
| No `.github/workflows/substrate-orchestrate.yml` | Re-adopt with cloud dispatch, or the workflow was deleted. |
| Epic not graphed (`bead-graph.sh --epic <slug>` empty) | Graph it first: `/substrate/graph-spec <spec>`. |
| `ANTHROPIC_API_KEY` (or a `ci.secrets-needed` name) not a repo secret | `gh secret set ANTHROPIC_API_KEY`. |

Abort with the specific reason (fail-fast) — never silently fall back to a local `orchestrate`.

## Workflow

### Step 1 — Resolve + verify the epic

Normalize (`epic:<slug>` → `<slug>`). `bash docs/scripts/bead-graph.sh --epic <slug>` must render ≥1 wave; empty → REFUSE. Show the wave shape.

### Step 2 — Preflight the cloud contract

```bash
git remote get-url origin
grep -q '^ci:' substrate.yaml
test -f .github/workflows/substrate-orchestrate.yml
gh secret list 2>/dev/null | grep -q ANTHROPIC_API_KEY   # best-effort; warn (don't block) if gh can't list
```

Abort on the first failure with the matching REFUSE row.

### Step 3 — Publish the epic (single-writer, one sync)

The runner reads beads from `tbd-sync`. Publish with **exactly one** `tbd sync`:

```bash
tbd sync
git ls-remote origin tbd-sync | grep -q . || { echo "publish failed"; exit 1; }
```

### Step 4 — Fire the workflow

```bash
gh workflow run substrate-orchestrate.yml -f epic=<slug>
gh run list --workflow substrate-orchestrate.yml -L 1
```

### Step 5 — Report (do not block)

```
Dispatched epic:<slug> → GitHub runner.
  Run:  <gh run URL>
  PR:   feat/<slug>  (opens once wave 1 lands; commits accumulate wave-by-wave)
Watch:  gh run watch <run-id>  ·  gh pr view feat/<slug> --web
Land:   review the PR → "Squash and merge".
```

dispatch's job ends at "fired + reported". The runner is the single writer from here.

## Constraints

- MUST refuse (fail-fast, specific reason) rather than fall back to a local `/substrate/orchestrate`.
- MUST verify the epic is **graphed** before firing — dispatch consumes a DAG, never derives one.
- MUST require the repo cloud-dispatch-enabled (`ci:` + `substrate-orchestrate.yml`); else point to `/substrate/adopt`.
- MUST perform **exactly one** `tbd sync` and no other tracker write — the in-runner orchestrator is the single writer.
- MUST NOT run the fleet, gate beads, push `feat/<slug>`, or open the PR itself — those are the runner's job.
- MUST NOT read, write, or prompt for secret **values** — check presence by name; instruct `gh secret set` when missing.
- MUST end by reporting the run + PR URLs and stop — never poll to completion.
