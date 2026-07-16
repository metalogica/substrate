# Dispatch — Phase 1 proof findings

Status: **PENDING LIVE RUN** — the artifacts are built; SC1 closes when a real run completes.

The live run needs two things only the repo owner can do (not HIL gates — hard external deps):
1. `gh secret set ANTHROPIC_API_KEY --repo soulbound-labs/clawcraft`
2. A substrate-**graphed** epic on `tbd-sync`. The 17 predefined clawcraft epics are *native tbd*
   epics (double `[epic] [epic]` titles), **not** substrate-graphed — `bead-graph.sh --epic <slug>`
   returns empty. Graph one first: `/substrate:graph-spec <spec>` → `tbd sync`.

Then: `gh workflow run substrate-orchestrate.yml -f epic=<slug>` and watch the PR.

## To record after the run (these ratify Phase 4's design, esp. D4)

| Question | Finding |
|---|---|
| Exact headless plugin-install method that worked (marketplace add+install? vendored copy? env?) | _tbd_ |
| Permission mode required (`bypassPermissions` sufficient? extra flags?) | _tbd_ |
| Were `worktree-seed` secrets (`.env.local`/`.env.prod`) needed, or did the gate pass on `DATABASE_URL` alone? | _tbd_ |
| Observed PR commit cadence (per-wave bursts as designed?) | _tbd_ |
| Did `orchestrate --pr` correctly suppress the trunk-squash + open the PR? | _tbd_ |
| Total wall-clock vs the 6h GitHub job cap | _tbd_ |

## Findings so far (static, pre-run)

- `tbd-sync` branch **exists** on `origin` (D1 fetch path is valid). ✓
- `ci.yml` already runs the full gate green in-container (Postgres + bootstrap + build + test) — the
  cloud gate environment is proven; the proof workflow copies it verbatim. ✓
- The predefined epics are not substrate-graphed → graphing is a prerequisite for any real run. ⚠
