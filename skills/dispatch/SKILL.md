---
name: dispatch
description: "Run a graphed epic in the cloud. Publishes the epic's beads to the tbd-sync branch, fires the repo's substrate-orchestrate GitHub workflow (headless `/substrate:orchestrate <epic> --auto --pr`), and surfaces the run + PR URLs — the PR then accumulates the per-bead commits live, wave by wave, for you to review and squash-merge. The local trigger door for cloud execution: dispatch TRIGGERS, it never orchestrates locally (single-writer stays with the in-runner orchestrator). Requires the repo to be cloud-dispatch-enabled (a `ci:` block in substrate.yaml + the substrate-orchestrate.yml workflow, both installed by /substrate:adopt) and the epic to be graphed by /substrate:graph-spec. Use this to offload a parallel epic build to a runner instead of running the fleet on your own machine; use /substrate:orchestrate to run it locally, or /substrate:execute for attended single-window."
---

# /substrate:dispatch

Offload a **graphed epic** to a GitHub runner. The runner executes the bead DAG headless and opens a PR whose commits land wave-by-wave; you review and squash-merge. This skill is the thin **local trigger** — it publishes, fires the workflow, and reports URLs. It does **not** orchestrate locally (that stays the runner's single-writer job).

**When to use this vs other skills:**

- `/substrate:dispatch <epic>` — run a graphed epic **in the cloud** (offload the fleet to a runner; watch commits land on a PR).
- `/substrate:orchestrate <epic>` — run the same DAG **locally** as a worktree fleet.
- `/substrate:execute <spec>` — attended, single-window, human-in-the-loop.

## Arguments

`<epic>` — an epic label `epic:<slug>` or a bare `<slug>`. No arg → list dispatchable graphed epics (open epics whose `bead-graph.sh --epic` renders waves) and ask which.

## When to REFUSE

| Signal | Redirect |
|--------|----------|
| Not a git repo, or no `origin` remote | dispatch needs a remote to push `feat/<slug>` + open a PR. |
| No `ci:` block in `substrate.yaml` (repo not cloud-dispatch-enabled) | Run `/substrate:adopt` and opt into cloud dispatch (installs `ci:` + `substrate-orchestrate.yml`). |
| No `.github/workflows/substrate-orchestrate.yml` | Same — re-adopt with cloud dispatch, or the workflow was deleted. |
| Epic is not graphed (`bead-graph.sh --epic <slug>` empty) | Graph it first: `/substrate:graph-spec <spec>`. dispatch runs a DAG; it does not create one. |
| A secret named in `ci.secrets-needed` not set as a repo secret (`CLAUDE_CODE_OAUTH_TOKEN` for the `claude-action` path, `ANTHROPIC_API_KEY` for `raw-cli`) | Add it: `gh secret set <NAME>`. The runner can't authenticate without it. |

Abort with the specific reason (fail-fast) — do not silently fall back to a local `orchestrate`.

## Workflow

### Step 1 — Resolve + verify the epic

Normalize the arg (`epic:<slug>` → `<slug>`; bare `<slug>` → itself). Confirm it is graphed:

```bash
bash docs/scripts/bead-graph.sh --epic <slug>   # must render ≥1 wave
```

Empty / error → REFUSE (ungraphed). Surface the wave shape so the user sees what will run.

### Step 2 — Preflight the cloud contract

Confirm, in order, and abort with the matching REFUSE row on the first failure:

```bash
git remote get-url origin                                   # remote exists
grep -q '^ci:' substrate.yaml                               # cloud-dispatch-enabled
test -f .github/workflows/substrate-orchestrate.yml         # workflow installed
# auth secret present (best-effort) — check every name in ci.secrets-needed:
for s in $(grep -A20 '^ci:' substrate.yaml | sed -n 's/.*- "\(.*\)".*/\1/p'); do \
  gh secret list 2>/dev/null | grep -q "$s" || echo "missing secret: $s"; done
```

The secret check is best-effort (private-repo permissions may hide it) — if `gh` can't list, warn rather than block, and remind the user the run will fail without it.

### Step 3 — Publish the epic (single-writer, one sync)

The runner reads beads from the `tbd-sync` branch. Publish the graphed epic there with **exactly one** `tbd sync` (dispatch is the only tbd write it performs):

```bash
tbd sync
git ls-remote origin tbd-sync | grep -q . || { echo "publish failed: no tbd-sync on origin"; exit 1; }
```

### Step 4 — Fire the workflow

```bash
gh workflow run substrate-orchestrate.yml -f epic=<slug>
```

Then resolve the run and surface it:

```bash
gh run list --workflow substrate-orchestrate.yml -L 1        # the run just queued
```

### Step 5 — Report (do not block)

Print the run URL and the (eventual) PR:

```
Dispatched epic:<slug> → GitHub runner.
  Run:  <gh run URL>
  PR:   feat/<slug>  (opens once wave 1 lands; commits accumulate wave-by-wave)

Watch:  gh run watch <run-id>       ·  gh pr view feat/<slug> --web
Land:   review the PR → "Squash and merge" (GitHub squashes; orchestrate --pr suppresses its own).
```

Do **not** poll to completion or orchestrate locally — dispatch's job ends at "fired + reported". The runner is the single writer from here.

## Constraints

- MUST refuse (fail-fast, with the specific reason) rather than fall back to a local `/substrate:orchestrate` — dispatch is the *cloud* door; a caller who wanted local would have used orchestrate.
- MUST verify the epic is **graphed** before firing — dispatch consumes a DAG, never derives one.
- MUST require the repo to be **cloud-dispatch-enabled** (`ci:` block + `substrate-orchestrate.yml`); point to `/substrate:adopt` otherwise.
- MUST perform **exactly one** `tbd sync` to publish, and **no other tracker write** — the in-runner orchestrator is the single writer for the epic. dispatch triggers; it does not execute.
- MUST NOT run the fleet, gate beads, push `feat/<slug>`, or open the PR itself — those are the runner's (via `orchestrate --auto --pr`). dispatch only fires `gh workflow run` and reports.
- MUST NOT read, write, or prompt for secret **values** — only check presence by name and instruct `gh secret set` when missing.
- MUST end by reporting the run + PR URLs and stop — never poll to completion (the PR is the inspection surface; the user lands it).
