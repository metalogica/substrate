# Orchestrate — Brief

**Author**: rei nova
**Date**: 2026-07-07
**Status**: Ready for spec

---

## User Story

As a developer who has **graphed a spec into a bead DAG** (via `/substrate:graph-spec`), I want a
command that **executes that DAG as a parallel worktree fleet** per the parallel-execution
doctrine — so that wide, file-disjoint work (e.g. a 33-call-site rewrite gated on a green
integration-test oracle) runs with **fresh context per bead**, an **always-green integration
branch**, and mechanical **dependency + file-disjoint safety**, instead of grinding sequentially
in one accreting context in a single mutable working tree.

And I want `/substrate:execute` to **route to it automatically when the DAG warrants it** — the
coding agent decides — otherwise fall back to the existing sequential prose execution. One mental
entry point (`execute`); two machines underneath.

The material win is **not primarily speed** — it's context hygiene (each bead a fresh, minimal
subagent), blast-radius containment (a broken bead breaks only its worktree), per-unit objective
gating (merge-on-green), and durable resumable state (tracker, not a context window). Wall-clock
parallelism is a bonus that lands only when the runtime actually fans out.

## Constraints

- MUST be a **separate skill** `/substrate:orchestrate <epic-or-spec>` that consumes a graphed
  epic's bead DAG (canonical label `epic:<slug>`) and executes it per
  `agents-parallel-execution-doctrine.md`. It is the named-but-unbuilt "orchestrator" that
  `graph-spec` already hands its DAG to ("this skill does not execute").
- MUST **operationalize the parallel-execution doctrine faithfully**, not reinvent it:
  single-writer tracker, integration branch `feat/<epic-slug>`, one worktree per bead off the
  *current integration tip*, merge-on-green, **file-disjoint waves**, gate-before-close, the
  **two-stage gate** (headless gate → merge → unblock dependents; out-of-band gate → close),
  re-run the gate on the integrated tip after each wave, unattended-signing handling, worktree
  hygiene. The doctrine holds the *why*; this skill holds the *operational loop*.
- MUST **link from `execute`**: `execute` gains a Step-0 routing decision — detect a graphed epic,
  assess wave width + file-disjointness + tracker presence, and **delegate to `orchestrate` when
  the DAG warrants**, else run the existing sequential prose path. **Fail-safe default =
  sequential**; MUST confirm before spawning worktrees (heavy + mutating). Never silently fan out.
- MUST add a **`bead-implementer` subagent** (companion to `doctrine-architect`): implements
  exactly ONE bead in its worktree, runs *that bead's* gate, reports `pass/fail` + a diff summary;
  **touches neither the tracker nor the remote**; `permission.task: deny` (cannot fan out further —
  one-level depth, matching the doctrine's subagent role).
- MUST be **tool-agnostic**: written as a doctrine-driven natural-language skill whose *only*
  tool-coupled seam is **subagent dispatch** (Agent tool in Claude Code, Task tool in OpenCode).
  MUST NOT hardwire the Claude Code **Workflow tool** as the execution mechanism — that would break
  OpenCode portability. A CC-only Workflow **fast-path** MAY be offered as an optional acceleration
  (better determinism / journaled resume) layered over the portable NL floor.
- MUST ship **OpenCode parity** (the parity rule from v0.5.0):
  `opencode/command/substrate/orchestrate.md` + `opencode/agent/bead-implementer.md`. On OpenCode,
  **degrade to sequential dispatch** if Task-parallelism is unavailable — DAG *correctness*
  preserved, *concurrency* optional (OpenCode parallel Task dispatch is behaviorally unverified;
  see References).
- MUST honor the **single-writer invariant**: only the orchestrator (main session) runs
  `tbd update/close/sync` or `git push`. Subagents get Goal/Files/Gate inlined and return a result.
- MUST read the target repo's **`substrate.yaml`** for the declared gate + `worktree-seed[]` +
  `toolchain-pin.*` — no hardcoded toolchain (the doctrine already mandates this).
- MUST update the user-facing **skill count 11 → 12** (`plugin.json`, `marketplace.json`,
  `CLAUDE.md`, `README.md`) and keep the skills↔commands **parity audit green**.
- SHOULD keep the SKILL body under **~500 lines** (progressive disclosure) — depth stays in the
  doctrine, not the skill.
- SHOULD reuse `graph-spec`'s DAG + `docs/scripts/bead-graph.sh --epic <slug>` wave view as input;
  do not re-derive the graph.

## References

- **The doctrine this operationalizes**: `references/docs-core/docs/doctrine/agents-parallel-execution-doctrine.md`
  (roles, single-writer tracker, integration branch + merge-on-green, file-disjoint waves,
  two-stage gate, per-bead dispatch checklist, worktree hygiene, `substrate.yaml` seed/toolchain).
- **DAG producer**: `skills/graph-spec/SKILL.md` (+ `docs/scripts/bead-graph.sh`, `--epic <slug>`,
  flow/waves/mermaid views, critical-path spine ◆★). Epic identity = the `epic:<slug>` label.
- **Delegation host + sequential path**: `skills/execute/SKILL.md` (phase-by-phase gated executor).
- **Subagent pattern to mirror**: `agents/doctrine-architect.md` (generic, parameterized, depth-1,
  `permission.task: deny`). Dispatch-seam precedent: `opencode/CONVENTIONS.md` Q4 — OpenCode Task
  tool launches subagents, "parallel where the runtime supports it; sequential fallback"; the
  parallel behavior is **unverified** (Bedrock MFA blocked the behavioral test in the v0.5.0 port).
- **Tracker**: `tbd` (single-writer `update/close/sync`; beads carry Goal/Files/Gate).
- **First real customer**: keylark slice-2 (`/Users/reinova/code/soulbound-labs/keylark`) — the
  schema/migration + Listing-aggregate + integration-test oracle (cognitive, by hand), then a
  ~33-call-site **file-disjoint grunt wave** each `blocked-by:` the oracle bead. Canonical test of
  "oracle-before-fleet" as a single dependency edge.

## Open Questions

1. **Routing signal** — what exact condition makes `execute` delegate to `orchestrate` vs run
   sequential? Candidate: a graphed `epic:<slug>` exists AND ≥1 wave has width > 1 AND those beads
   are file-disjoint AND a tracker is configured AND the user confirms. Is width>1 the threshold,
   or a higher bar (e.g. ≥3) to justify worktree overhead on small DAGs?
2. **Wave cadence** — does `orchestrate` run the whole epic unattended, or **pause between waves**
   for approval (mirroring `execute`'s pause-between-phases ethos)? Default: pause between waves;
   `--auto` for unattended. Confirm.
3. **`bead-implementer` permissions** — `edit: allow, bash: allow, read: allow, task: deny`; the
   "no tbd / no push" rule enforced by *prompt* (there's no git-push permission toggle). Acceptable,
   or also sandbox the worktree?
4. **CC Workflow fast-path** — in scope for v1 (a CC-only accelerated dispatch/journaling path over
   the portable NL floor), or deferred to a follow-up so v1 ships the tool-agnostic loop only?
5. **Failure handling mid-wave** — on a red bead: keep it open with notes, continue the rest of the
   wave, and re-dispatch/escalate after — vs halt the wave. Default: continue siblings, the red
   bead blocks only *its* dependents (partial-progress is a core DAG win). Confirm.
6. **substrate-repo doctrine discovery** — substrate itself keeps its meta-doctrines under
   `references/docs-core/docs/doctrine/`, not a root `docs/doctrine/`. `architect-spec` must be
   pointed at that path (or a temporary manifest) so the parallel-execution doctrine is actually
   dispatched during spec composition.
