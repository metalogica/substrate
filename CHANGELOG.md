# Changelog

All notable changes to this plugin are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **`/substrate:orchestrate <epic-or-spec>`** (skill #12) — executes a graphed bead DAG as a **parallel git-worktree fleet**, operationalizing `agents-parallel-execution-doctrine.md`. Cuts a `feat/<epic-slug>` integration branch, walks the DAG wave-by-wave, dispatches one `bead-implementer` per file-disjoint ready bead in its own worktree (off the current integration tip), merges on green, re-gates the integrated tip, pauses between waves (`--auto` to skip), and lands one signed squash commit on trunk with `commit.gpgsign` restored unconditionally. Single-writer tracker (only the orchestrator runs `tbd`/`git push`); consumes the DAG from `bead-graph.sh --epic <slug>` (never re-derives it). Tool-agnostic — Agent tool on Claude Code, Task tool on OpenCode — with a Claude-Code-only Workflow fast-path layered over the portable NL floor.
- **`bead-implementer` subagent** — companion to `doctrine-architect`; the per-bead worker. Implements exactly one bead against an inlined Goal/Files/Gate, runs that bead's gate, reports pass/fail + a diff summary. Touches neither the tracker nor the remote (`permission.task: deny`; "no tbd, no git push" prompt-enforced) — one-level depth, single-writer stays with the orchestrator.
- **`/substrate:execute` Step-0 routing** — detects a graphed epic and delegates to `orchestrate` only when a wave has **≥3 file-disjoint beads** AND a tracker is configured AND the user confirms. Fail-safe default = sequential; never silently fans out worktrees.
- **OpenCode parity** — `opencode/command/substrate/orchestrate.md` (Task-tool dispatch, sequential fallback documented) + `opencode/agent/bead-implementer.md` (`mode: subagent`, `permission.task: deny`). Skill count 11 → 12 across `plugin.json`, `marketplace.json`, `CLAUDE.md`, `README.md`; skills↔commands parity audit remains empty; `doctrine-lint` green. Optional one-line pointer added to the parallel-execution doctrine's Roles section (abstract-role framing preserved).

## [0.5.0] — 2026-07-07

### Added

- **OpenCode port** — substrate now runs inside [OpenCode](https://opencode.ai) (`1.17.14`), additive to and independent of the Claude Code plugin surface. A new version-controlled `opencode/` tree mirrors `skills/` + `agents/`: all 11 skills are translated to OpenCode **commands** under the `substrate/` namespace (`/substrate/init`, `/substrate/architect-spec`, …) and `doctrine-architect` to an OpenCode **agent** (`mode: subagent`, `permission.edit`/`task: deny`). Ships `opencode/CONVENTIONS.md` (Phase-1 empirically-verified OpenCode facts — singular `command/`+`agent/` dirs, `substrate/`-subdir namespacing, headless `opencode run --command`, Task-tool subagent dispatch, `@`-include chaining) and `opencode/README.md` (the SKILL→command translation guide + binding skills↔commands parity rule).
- `scripts/opencode-link.sh` / `scripts/opencode-unlink.sh` — idempotent, non-destructive symlink install of the `opencode/` tree into `~/.config/opencode/` (the OpenCode mirror of the Claude Code `dev-link.sh` hot-reload loop); warns on an OpenCode major/minor version mismatch and refuses to clobber a real user file.
- Orchestrator commands (`architect-spec`, `migrate`) fan out to `doctrine-architect` via the OpenCode **Task tool** (parallel where the runtime supports it; logged sequential fallback). `init`/`adopt`/`migrate`/`deploy` guard `${SUBSTRATE_ROOT:?}` with fail-fast (OpenCode has no plugin cache to discover the source tree).
- README + CLAUDE.md gain a "Using substrate in OpenCode" section documenting the two-tier model (passive `AGENTS.md` context is automatic; the active command surface needs the symlink) and the parity rule.

## [0.4.0] — 2026-07-03

### Added

- `/substrate:adopt` — install substrate's stack-agnostic docs/doctrine/gate kernel onto an existing repo of any language/stack, **without** scaffolding an opinionated framework. Ships `references/docs-core/` (canonical `AGENTS.md` + `CLAUDE.md` symlink, the enforced doctrine manifest + zero-dep `doctrine-lint.sh`, the `agents` meta-doctrine + `agents-parallel-execution` doctrine, the SDD protocol, a pre-commit hook + CI workflow) and wires `substrate.yaml` to the repo's own compile/test/lint gate. The symmetric opposite of `/substrate:migrate`; leaves `doctrine-lint` green. Bumps the user-facing skill surface to ten.
- `/substrate:diagnose <error-context>` — targeted bug-fix loop. Takes a known error (message + optional file:line / timestamp / repro steps), matches it to the relevant doctrine via a path-layer + manifest-trigger + symbol-search composite scored 0–9, presents ranked hypotheses with cited doctrine rules, implements the chosen fix, then verifies BOTH the green gate (`compile`/`lint`/`test`) AND that the original error no longer reproduces. Loops on failure with accumulated context; escalates to `/substrate:architect-spec` when the fix crosses 3+ layers or needs new abstractions.

### Changed

- `/substrate:synthesize-session` — Option A: the per-feature synthesis report (`docs/tasks/completed/<feature>/synthesis-<date>.md`) is no longer written. The §1 session narrative and §7 Pareto cut now live in the body of the final `chore(<feature>): synthesis complete` commit — git is the audit log. Resumability + idempotency move to `.substrate/synthesis-state.json` (per-feature `status`, `completed-steps:`, `context:`, `narrative-commit:`). §5 parked open-design-questions are now filed as tracker beads with `type: open-question`, `status: parked` (so they show up in the queue without being pulled into the DAG as actionable work). The two append-only aggregate ledgers — `docs/synthesis-index.md` and `docs/cross-repo-followups.md` — remain as the cross-session dedup history and cross-repo decision-maker queue respectively. Legacy `synthesis-*.md` reports from prior runs are recognised as already-synthesized markers without migration.

### Fixed

- `/substrate:architect-spec` — orchestration now runs at skill level (depth 0). The previous design routed work through an `architect-spec` *subagent* (depth 1) that was supposed to dispatch `doctrine-architect` children (depth 2), but the Claude Code harness depth-cap forbids depth-2 spawn — so the fan-out silently degraded to single-context self-loading on every invocation, losing the parallel-architect cross-check. The skill now absorbs the full workflow (Q&A → parallel dispatch → mediation → composition → write), mirroring how `/substrate:migrate` already operates.
- `/substrate:synthesize-session` — global `tbd` binaries (e.g. `pnpm add -g tbd`) are now detected via `command -v tbd`, not just `npx --no-install`. When tracker is `tbd`, beads (Step 9) and doctrine amendments (Step 5) write to the tracker via ephemeral `mktemp` tempfiles + unlink; zero markdown queue artifacts land under `docs/tasks/ongoing/**`. The synthesis report at `docs/tasks/completed/<feature>/synthesis-<date>.md` is the only sanctioned `.md` write under `tbd`.

### Removed

- `agents/architect-spec.md` — orchestrator subagent deleted; its workflow lives in `skills/architect-spec/SKILL.md`.

## [0.2.1] — 2026-04-21

Schema conformance fixes for first install. `v0.2.0` failed to install from the marketplace due to two manifest schema violations; this release fixes both. No functional changes to skills, agents, or templates.

### Fixed

- `marketplace.json` — `plugins[0].source` changed from `"."` to `"./"`. Relative paths must start with `./` per the Claude Code marketplace schema.
- `plugin.json` — `repository` changed from an npm-style `{type, url}` object to a plain URL string. The Claude Code plugin schema expects a string, not an object.
- `plugin.json` — removed `bugs` field (not in the documented plugin schema).

### Added

- `marketplace.json` — `metadata.description` and `metadata.version` to satisfy the marketplace validator's warning.

## [0.2.0] — 2026-04-21

First public release. Distributed via the `metalogica` plugin marketplace:

```
/plugin marketplace add metalogica/substrate
/plugin install substrate@metalogica
```

### Skills

- `/substrate:init` — scaffold a new project in an empty directory (stage 1).
- `/substrate:migrate` — migrate a Gemini AI Studio prototype into the kernel (stage 2).
- `/substrate:deploy` — Clerk + Vercel + first live deploy (stage 3).
- `/substrate:architect-spec <brief>` — SDD orchestrator that produces gated multi-phase specs.
- `/substrate:execute <spec>` — executes a spec phase-by-phase with verification gates.
- `/substrate:quick-spec` — lightweight single-feature iteration loop.

### Agents

- `domain-architect`, `backend-architect`, `frontend-architect` — per-layer specialists spawned in parallel by orchestrator skills.
- `architect-spec` — SDD orchestrator that composes layer-specialist outputs into a spec.

### References (bundled)

- `doctrines/` — domain / backend / frontend architectural doctrines, copied into every scaffolded project as `docs/doctrine/`.
- `sdd-protocol/` — brief format, execution format, spec template, copied into every scaffolded project as `docs/protocol/sdd/`.
- `templates/` — the ready-to-copy project kernel.
- `example/` — golden-reference finished project for quality comparison.

### Metadata

- Added `LICENSE` (MIT).
- Added `homepage` and `repository` fields to `plugin.json`.
- Added `.claude-plugin/marketplace.json` for marketplace-style install.
