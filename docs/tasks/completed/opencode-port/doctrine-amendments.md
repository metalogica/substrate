# Doctrine Amendments — OpenCode Port (Phase 7 review)

Reviewed the port against `references/docs-core/docs/doctrine/agents-doctrine.md`,
`agents-parallel-execution-doctrine.md`, and the plugin principles in `CLAUDE.md`
(progressive disclosure, fail-fast, scaffold-by-copy, "agents spawned by skills never users").

**Verdict: compliant.** No binding rule is violated. Two amendments proposed (both Minor/Major,
neither blocking), one new pattern worth capturing, and one drift risk to guard. Follow-ups filed
as beads under `epic:opencode-port` (Step 7.2).

---

## Compliance summary

| Doctrine / principle | Finding |
|---|---|
| **agents-doctrine** manifest/coverage/pointer rules | Not triggered — the port adds **no** file under `docs/doctrine/`. `opencode/CONVENTIONS.md` + `opencode/README.md` are distribution docs, not doctrines; correctly outside the manifest + Gate 1. ✓ |
| **agents-doctrine §2 altitude** | `CONVENTIONS.md` captures durable, empirically-verified facts (version-pinned) — doctrine-grade altitude, appropriate for a spike record. ✓ |
| **parallel-execution: roles** | `doctrine-architect` runs `permission.edit: deny` + `permission.task: deny` → "subagent touches neither tracker nor remote, and cannot fan out further." Maps cleanly to the one-writer / one-level-depth model. ✓ |
| **parallel-execution: fan-out** | Orchestrator commands dispatch via Task tool, parallel-where-supported + logged sequential fallback — correctness over wall-clock, exactly as the doctrine's spirit ("objective done-signal; conflict-avoidance"). ✓ |
| **CLAUDE.md: progressive disclosure** | OpenCode commands are prompt templates injected on invocation; `CONVENTIONS`/`README` load only when followed. Same tiering as skills. ✓ |
| **CLAUDE.md: fail-fast** | `${SUBSTRATE_ROOT:?}` aborts with a clear message, no fallback probing. Matches the user's fail-fast preference. ✓ |
| **CLAUDE.md: agents spawned by skills, never users** | Preserved — commands spawn `doctrine-architect`; users invoke commands. ✓ |

---

## New pattern (worth capturing in doctrine)

**Cross-tool distribution.** substrate now projects ONE source of truth (`skills/` + `agents/`)
onto TWO runtime surfaces — the Claude Code plugin and the OpenCode command/agent tree — via
*translation + symlink install* (`opencode-link.sh` mirrors `dev-link.sh`). This is a reusable
architecture: author once as tool-agnostic natural-language contracts, translate the tool-coupled
mechanics (tool names, dispatch primitive, source-tree discovery), pin the target tool's verified
conventions in a spike record before bulk work. Candidate for a short `cross-tool-port` note in the
plugin's meta-docs if a third surface ever appears.

## Amendment 1 (Major) — parity needs a machine-checkable invariant

`agents-doctrine §3` is explicit: the value of the manifest is turning *"is everything in sync?"*
from "a question nobody answers" into "a machine-checkable invariant." The **skills ↔ commands
parity rule** (FMEA #8) is currently prose-only in `opencode/README.md` + `CLAUDE.md`. That is
exactly the drift-bait the doctrine warns against (two homes for one contract, no gate).

**Proposed:** a zero-dep `scripts/opencode-parity-lint.sh` that fails if
`comm -23 <(ls skills) <(ls opencode/command/substrate | sed 's/\.md$//')` is non-empty (both
directions), plus an optional check that each command's `description:` is non-empty. Wire into the
same pre-commit/CI path the doctrine-lint uses. → filed as a bead.

## Amendment 2 (Minor) — parallel-execution doctrine names CC-only command forms

`agents-parallel-execution-doctrine.md` lines 11–14 reference `/substrate:graph-spec` and
`/substrate:architect-spec` (colon form). This doctrine is **copied into adopted repos**, where an
OpenCode user invokes the **slash** form `/substrate/graph-spec`. A pure-OpenCode reader who copies
the colon form gets an unknown command — minor cross-tool **command drift** (§6.2).

**Proposed:** add a one-line note in that doctrine (and/or the SDD protocol) that command
*invocation form is tool-specific* — `/substrate:<name>` in Claude Code, `/substrate/<name>` in
OpenCode — the procedure is identical. Non-blocking; low churn. → filed as a bead.

## Drift guard (already mitigated, noted for completeness)

`opencode/CONVENTIONS.md` pins OpenCode `1.17.14` and singular dir names — version-coupled claims.
Mitigation already in place: `opencode-link.sh` warns on a major/minor version mismatch (FMEA #2),
and the file records the probe evidence so a re-verify is cheap. No action; the warning IS the guard.
