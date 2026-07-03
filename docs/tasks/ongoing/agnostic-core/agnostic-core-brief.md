# Framework-Agnostic Execution Core Brief

**Author**: rei nova
**Date**: 2026-07-01
**Status**: Draft

---

## User Story

As a developer running autonomous coding agents (Claude Code and other agent tools),
I want substrate to be a **framework-agnostic spec-driven execution engine** — doctrine + docs + beads + parallel execution + *declared* verification gates — with the Vite/Convex/Clerk kernel demoted to one optional bootstrap,
so that any code repository (greenfield or existing, any language/stack) can adopt substrate's SDD discipline and be driven by autonomous agents, instead of substrate only working for one opinionated web stack.

**Context / origin.** The `soulbound-labs/keylark` repo is a substrate project (see its `.substrate/synthesis-state.json`) whose `docs/` system has evolved well past what substrate ships in `references/` today. Keylark proves the target shape in production: an enforced doctrine manifest, a zero-dep mechanical lint gate, a meta-doctrine with a semantic drift-evaluation agent, a parallel-bead execution doctrine, and native `tbd`/beads woven into the root agent-context. This brief promotes that evolved system back into substrate's core and **inverts the layering**: the SDD/doctrine/beads/gate engine becomes the product; the opinionated web kernel becomes one interchangeable bootstrap.

---

## Constraints

- **MUST**: Promote keylark's evolved docs system into substrate's `references/` core, **stripped of all keylark-specific content** (leasing hexagon, clawmote/android, getkeylark SEO, Twilio). Specifically bring over: the enforced `docs/doctrine/manifest.yaml`, `docs/scripts/doctrine-lint.sh` (zero-dep mechanical **Gate 1**), the `agents-doctrine.md` meta-doctrine + its drift-evaluation **Gate 2** protocol (§6 text ships regardless), `agents-parallel-execution-doctrine.md`, and the `tbd`/beads weave in the root agent-context file.
- **MUST**: Make verification gates **declared per project, never hardcoded**, via a **`substrate.yaml` gate block** at repo root (`gate: {compile, test, lint}`). `/substrate:execute` reads `gate.*` and runs them; a spec/bead may override inline; **abort (fail-fast) with a clear explanation if the file/key is absent** — no probing, no silent fallback. *This is the load-bearing change that makes the engine framework-agnostic.* (Q1)
- **MUST**: Demote the current Convex/Vite/Clerk kernel to **one `/substrate:bootstrap` skill** (scaffolds convex-vite-clerk today; future stacks grow inside it or as siblings). **Clean break, no aliases:** `/substrate:init` folds into `/substrate:bootstrap`; `/substrate:migrate` and `/substrate:deploy` become steps *inside* that bootstrap's lifecycle. The six core skills (`architect-spec`, `execute`, `quick-spec`, `diagnose`, `synthesize-session`, `add-doctrine`) stay top-level and go fully stack-agnostic. `CHANGELOG.md` maps old→new. No capability regression. (Q3)
- **MUST**: Define a **bootstrap-blind artifact contract.** A bootstrap's sole job is to leave a repo that satisfies: (1) a scaffolded stack that builds/runs; (2) `substrate.yaml` gate block; (3) `substrate.yaml` worktree-seed + toolchain-pin recipe; (4) the docs-core (`AGENTS.md` + `docs/doctrine/` with manifest/lint/meta/parallel-exec + `docs/tasks/` + `docs/protocol/sdd/` + pre-commit hook + CI). `execute`/`architect-spec`/`audit-doctrine` read **only** artifacts (2)–(4) and never the bootstrap identity — which makes the future `/migrate` symmetric ("make an existing repo satisfy (2)–(4)"). (Q6)
- **MUST**: Adopt **`AGENTS.md` as canonical** root agent-context with `CLAUDE.md` as a symlink to it, in **both** `references/templates/` and substrate's own repo root, so Claude and other agent tools read one source. (Q2)
- **MUST**: Ship the **semantic Gate 2 as a runnable `/substrate:audit-doctrine` skill** that fans out one drift-eval subagent per doctrine (mirroring `architect-spec`→`doctrine-architect`) and emits a merged drift report, **plus a CI workflow template** in `references/templates/` for the unbypassable gate. (Q4)
- **MUST**: Split the parallel-execution doctrine — the **generic orchestration policy** (single-writer tracker, integration branch, merge-on-green, file-disjoint waves, gate-before-close, two-stage gate, worktree hygiene) + the **seed/toolchain *principles*** live in the agnostic core with **no stack literals**; the **concrete worktree-seed/toolchain recipe** is item (3) of the bootstrap contract, supplied per stack. (Q5)
- **MUST**: Ship the mechanical Gate 1 wiring (pre-commit hook + a CI example invoking `doctrine-lint`) as part of the core templates, so a scaffolded/adopted project is enforced from day one.
- **MUST**: Keep the docs/doctrine/beads/gate machinery domain-agnostic in principle — nothing code-specific baked into the core — even though this release validates **code execution only**.
- **MUST**: Treat this as a **breaking major release**; document the skill-surface migration in `CHANGELOG.md` + `README.md` and bump `plugin.json#version` per the release workflow (not on a feature branch).
- **MUST NOT**: Build any knowledge-work vertical (legal/finance/ops) in this release. Core stays domain-agnostic; only code execution is proven.
- **MUST NOT**: Build a multi-stack bootstrap registry or a second bootstrap in this release.
- **MUST NOT**: Leave any keylark project-specific content in the promoted core.
- **MUST NOT**: Couple any core execution skill to a language, framework, or toolchain; keep no gate/stack literals (`pnpm`, `convex`, `vite`, `app:test`) in the core skills or the core parallel-exec doctrine.
- **SHOULD**: Ship `tbd-graph.py`-style bead-DAG visualization and preserve substrate's existing `sub-` bead prefix + `.tbd/` integration.
- **SHOULD**: Keep Gate 1 (mechanical, deterministic, zero-dep) and Gate 2 (semantic) as distinct tiers — no judgment in the linter, no grep-work pushed onto the agent.

---

## References

**Keylark — the source system to promote (verbatim, then strip specifics):**
- `soulbound-labs/keylark/docs/doctrine/manifest.yaml` — enforced single-source-of-truth registry
- `soulbound-labs/keylark/docs/scripts/doctrine-lint.sh` — zero-dep mechanical Gate 1 (coverage · path · pointer)
- `soulbound-labs/keylark/docs/doctrine/agents-doctrine.md` — meta-doctrine + §5–§6 drift-eval Gate 2 protocol
- `soulbound-labs/keylark/docs/doctrine/agents-parallel-execution-doctrine.md` — orchestrator/subagent, worktree waves, merge-on-green, two-stage gate
- `soulbound-labs/keylark/docs/tasks/CLAUDE.md` — the ongoing→completed spec lifecycle
- `soulbound-labs/keylark/AGENTS.md` — framework-agnostic root context + the native `tbd` integration block
- `soulbound-labs/keylark/scripts/tbd-graph.py` — bead-DAG → Mermaid

**Substrate — current state to refactor:**
- `references/doctrines/` (domain/backend/frontend), `references/sdd-protocol/`, `references/templates/`
- `skills/{architect-spec,execute,quick-spec,diagnose,synthesize-session,add-doctrine}` — the code-agnostic core skills
- `skills/{init,migrate,deploy}` — the kernel skills to relocate under a bootstrap
- `.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json`, `CLAUDE.md`, `agents/doctrine-architect.md`

---

## Acceptance Criteria

- [ ] Substrate's `references/` core ships the promoted manifest + `doctrine-lint.sh` + meta-doctrine (with §6 drift-eval protocol) + generic parallel-exec doctrine — and a grep for keylark specifics (`clawmote`, `keylark`, `leasing`, `getkeylark`, `twilio`, `android`) over the core returns nothing.
- [ ] `/substrate:execute` reads its gate from `substrate.yaml`'s `gate` block and runs it; grepping the core skills (`execute`, `quick-spec`, `diagnose`) and the core parallel-exec doctrine for `pnpm`, `convex`, `vite`, `app:test` finds no hardcoded gate/stack literal. Absent `substrate.yaml`/`gate` → execute aborts with a clear message.
- [ ] `AGENTS.md` is canonical with `CLAUDE.md` → `AGENTS.md` symlink in both `references/templates/` and the substrate repo root.
- [ ] `/substrate:audit-doctrine` runs the drift-eval (subagent-per-doctrine) and emits a merged report; a CI workflow template shipping the same eval exists under `references/templates/`.
- [ ] `doctrine-lint.sh` runs green on substrate's own core doctrine set and is wired to a pre-commit hook + a CI example.
- [ ] `/substrate:bootstrap` produces the Convex/Vite/Clerk scaffold that passes its own declared gate today; the repo it leaves satisfies the 4-part artifact contract; the contract is documented.
- [ ] The plugin still installs from the `metalogica` marketplace; the clean-break skill surface is documented in `CHANGELOG.md` + `README.md` with a major version bump; `/substrate:init`/`migrate`/`deploy` no longer exist as top-level skills.
- [ ] **Agnosticism proof:** one non-trivial code spec is executed end-to-end on a **Python/`uv`** repo (gate: `uv run pytest` / `ruff` / `mypy`), driven only by its declared `substrate.yaml` gate — no bootstrap, no stack literal in the engine.

---

## Out of Scope

- Knowledge-work / non-code verticals (legal, finance, ops) — deferred to a later brief. Core must *stay capable* but is not validated here.
- `/migrate` retrofit of the docs-core onto arbitrary existing repos — deferred to a follow-on brief (file as a `sub-` bead).
- A bootstrap registry or any second bootstrap beyond the existing kernel.
- The obligation-calendar / time-triggered work primitive.
- Any agent-runtime change (e.g. a standing per-arm agent / Hermes).

---

## Resolved Decisions (locked pre-architect)

All seven initial open questions were resolved with the author before architecting. Recorded here so `/substrate:architect-spec` treats them as settled, not open:

1. **Gate schema** → `substrate.yaml` `gate` block at repo root; fail-fast if absent; spec/bead may override inline. (folded into Constraints)
2. **Root context** → `AGENTS.md` canonical + `CLAUDE.md` symlink, in templates *and* substrate's own repo.
3. **Skill migration** → clean break, no aliases: one `/substrate:bootstrap`; `init` folds in; `migrate`/`deploy` become its lifecycle steps; six core skills stay top-level; CHANGELOG maps old→new.
4. **Gate 2** → runnable `/substrate:audit-doctrine` skill (drift-eval subagent per doctrine) + CI workflow template; §6 protocol text ships in the meta-doctrine regardless.
5. **Parallel-exec** → generic orchestration policy + seed/toolchain *principles* in the agnostic core (no stack literals); concrete recipe supplied per stack via the bootstrap contract.
6. **Bootstrap contract** → bootstrap-blind; the contract is the 4-part artifact set the bootstrap leaves behind; engine reads only those artifacts; makes future `/migrate` symmetric.
7. **Agnosticism proof** → Python/`uv` repo (different language, toolchain, and gate).

## Open Questions

*(None outstanding. Any new ambiguity surfaced during Socratic Q&A should be resolved against the Resolved Decisions above and the keylark reference system.)*

---

<!--
Next step:
  /substrate:architect-spec docs/tasks/ongoing/agnostic-core/agnostic-core-brief.md
-->
