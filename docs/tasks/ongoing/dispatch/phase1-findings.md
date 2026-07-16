# Dispatch — Phase 1 proof findings

Status: **PARTIAL GREEN** (live run performed 2026-07-16 in `soulbound-labs/clawcraft`).
Auth + substrate-plugin load are **proven in the cloud**; the end-to-end PR (SC1) is **blocked** on a
now-diagnosed bead-visibility gap in the template (fix below). SC1 closes once the fixed template
lands a `feat/<slug>` PR with per-wave commits.

## What the live run proved (verified from runner logs)

The run used the **official `anthropics/claude-code-action@v1`** agent, not raw `claude -p`. This
was a deliberate deviation from the template's raw-CLI default — and it resolved the Phase-1 "unknown
plugin-install method" (FMEA #1) cleanly:

- **Auth** — subscription OAuth via `CLAUDE_CODE_OAUTH_TOKEN` works headless (no `ANTHROPIC_API_KEY`,
  no pay-per-token). OIDC token → app token exchange succeeded.
- **Plugin install** — the action's `plugin_marketplaces` + `plugins` inputs install the substrate
  plugin with no hand-rolled `claude plugin marketplace add`:
  `✓ Successfully added marketplace: metalogica` → `✓ Successfully installed: substrate@metalogica`.
- **Command availability** — `/substrate:orchestrate <epic> --auto --pr` resolved and ran
  (`subtype: success`, `is_error: false`, 3 turns, ~$0.19).
- **Gate environment** — clawcraft's Postgres service + `pnpm install` + build + treasury DB bootstrap
  all passed in-container (D1/ci.yml-parity holds). ✓

## Answers to the pending table

| Question | Finding |
|---|---|
| Exact headless plugin-install method that worked | `claude-code-action@v1` **`plugin_marketplaces` + `plugins`** inputs. `plugin_marketplaces` MUST be an `https://…​.git` URL — the action validates against `/^https:\/\/.+\.git$/`; `owner/repo` shorthand and non-`.git` URLs are rejected ("Invalid marketplace URL format"). Raw-`claude -p` plugin install was **not** exercised — still unproven. |
| Permission mode required | `--permission-mode bypassPermissions` (via `claude_args`) was sufficient; `permission_denials_count: 0`. |
| Were worktree-seed secrets (`.env.*`) needed? | No — the gate passed on `DATABASE_URL` + the service alone. No seed secrets required for this epic. |
| Observed PR commit cadence | **Not observed** — no PR was produced (see gap below). |
| Did `orchestrate --pr` suppress trunk-squash + open the PR? | **Not reached** — orchestrate aborted before producing a branch. |
| Total wall-clock vs 6h cap | Gate env ~8.5 min; full run well under the cap. Agent step itself ~40s once reached. |

## Three workflow bugs the live run caught (all fixed in clawcraft's copy)

These are the concrete gotchas any adopter of the **official-action** path will hit; the template +
adopt now encode them:

1. **`id-token: write` is required.** The action mints its GitHub token via OIDC
   (`setupGitHubToken → getOidcToken`). Without the permission: *"Could not fetch an OIDC token /
   Unable to get ACTIONS_ID_TOKEN_REQUEST_URL"*. Add it to `permissions:`.
2. **Marketplace URL needs the `.git` suffix** (regex above): `https://github.com/<org>/<repo>.git`.
3. **Package-manager prefix on gate commands.** Bare `turbo run build` → `turbo: command not found`
   (exit 127) — the workspace bin isn't on `PATH`. Use `pnpm turbo` / `pnpm exec`. This lives in the
   consumer's `substrate.yaml` `toolchain-pin.install` / `ci.bootstrap`, but adopt warns about it.

## THE GAP that blocked SC1 (root cause confirmed by static analysis)

Orchestrate ran ~13s / 3 turns and produced **no `feat/<slug>` branch** — it found no DAG for the
epic and fail-safe-aborted (clean exit, no work). Cause is the template's bead-visibility step, and
it affects **both** agent strategies:

- `docs/scripts/bead-graph.sh` (which orchestrate MUST read the DAG from) requires the **`tbd` CLI**
  (`command -v tbd` or `npx --no-install get-tbd`). The template installs only
  `@anthropic-ai/claude-code` — **`tbd` is never installed** → `bead-graph.sh` errors "no tbd CLI
  found" → orchestrate aborts.
- Bead data is **not** git-tracked (only `.tbd/config.yml` is; `state.yml`/`workspaces/` are
  gitignored). Beads live in a local store synced to the `tbd-sync` branch (`auto_sync: false`).
  The template's `git fetch origin tbd-sync:tbd-sync` makes a **branch ref only** — it does **not**
  hydrate the local `.tbd` store, and `bead-graph.sh` reads the local store (`tbd list --no-sync`).

**Fix (encoded in the template):** install `get-tbd`, then hydrate the store with **`tbd sync
--pull`** (pull-only — avoids the empty-runner-store *push* wiping `tbd-sync`; the rnk-858h footgun
class). This replaces the bare `git fetch` bead-state step.

## Status of the design rows

- **D1 (fetch-tbd-sync)** — corrected: a `git fetch` is insufficient; the runner needs `tbd` +
  `tbd sync --pull` to hydrate. Spec/template updated.
- **D4 (copied template + tokens)** — holds; the template now offers a **dual agent path**
  (raw-CLI default + proven Claude official-action variant) via a single `{{AGENT_STEP}}` token.
- **D6 (default AGENT_COMMAND)** — the raw-CLI default is retained for framework-agnosticism, but its
  plugin-install is still unproven; the official-action variant is the **recommended, proven** Claude path.

## Reproduction breadcrumbs (clawcraft, 2026-07-16)

- Proven run: `gh run 29519162288` (success; plugin loaded; no PR — the gap above).
- Marketplace repo `metalogica/substrate` is **public** and cloneable.
- The action runs with `show_full_output: false`, so the agent transcript isn't in the runner log —
  set it true if you need to see orchestrate's own reasoning for the no-DAG abort.
