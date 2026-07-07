# OpenCode Port: Technical Specification

**Version**: 1.0.0
**Status**: Draft
**Author**: rei nova (hand-authored via substrate SDD protocol)
**Date**: 2026-07-06
**Brief**: `docs/tasks/ongoing/opencode-port/opencode-port-brief.md`

---

## 1. Overview

### 1.1 Objective

Make the substrate plugin usable inside **OpenCode** (`1.17.14`) sessions by porting all 11
skills to OpenCode custom **commands** and the `doctrine-architect` subagent to an OpenCode
**agent**, distributed from a new version-controlled `opencode/` tree in the substrate repo and
installed globally via a symlink (hot-reload dev loop). This closes the gap between what an
adopted repo already gives OpenCode passively (`AGENTS.md` + `docs/` + `docs/scripts/*.sh`) and
the active `/substrate:*` command surface that today only exists in Claude Code.

### 1.2 Constraints

- MUST port every skill in `skills/*/SKILL.md` to an OpenCode command, plus
  `agents/doctrine-architect.md` to an OpenCode subagent.
- MUST keep the port under `opencode/` in this repo and install via symlink into
  `~/.config/opencode/` (mirror `scripts/dev-link.sh` / `dev-unlink.sh`).
- MUST empirically verify OpenCode's directory + namespacing + subagent-dispatch conventions
  (Phase 1) before bulk porting — no hardcoding from memory.
- MUST adapt the parallel `doctrine-architect` fan-out to OpenCode's Task-tool/subagent model,
  degrading to sequential dispatch if parallel is unavailable.
- MUST fail fast with an explanation when `SUBSTRATE_ROOT` (needed by `init`/`adopt`/`migrate`)
  is unresolvable in an OpenCode session.
- MUST NOT alter the existing Claude Code plugin surface (`skills/`, `agents/`, manifests) —
  the port is additive.

### 1.3 Success Criteria

- Every one of the 11 substrate skills has a loadable OpenCode command under the `substrate`
  namespace, listed by OpenCode after install.
- `doctrine-architect` loads as an OpenCode subagent (`mode: subagent`) and appears in
  `opencode agent list`.
- `scripts/opencode-link.sh` makes all commands + the agent visible in a fresh OpenCode session;
  `scripts/opencode-unlink.sh` removes them; both are idempotent.
- In a real OpenCode session, the `architect-spec` command dispatches ≥2 `doctrine-architect`
  subagents (parallel where supported) and composes a spec.
- E2E: in adopted repo `keylark`, `/substrate/graph-spec` and `/substrate/quick-spec` each
  complete a real task under OpenCode.

---

## 2. Scope

| In Scope | Out of Scope |
|----------|--------------|
| Port all 11 skills → OpenCode commands under `substrate/` namespace | Rewriting skill *logic* — bodies are translated, not redesigned |
| Port `doctrine-architect` → OpenCode subagent | New/extra agents beyond the one that exists |
| Version-controlled `opencode/` source tree + `opencode/README.md` translation guide | Packaging as an OpenCode JS/TS `opencode plugin` npm module |
| Global symlink install (`opencode-link.sh` / `opencode-unlink.sh`) | Auto-emitting per-repo `.opencode/` from `/substrate:adopt` (future phase) |
| Adapt parallel fan-out to OpenCode Task tool | Publishing to any OpenCode registry/marketplace |
| README + CLAUDE.md "Using substrate in OpenCode" docs | Changing Claude Code skill behavior |

---

## 3. Architecture / Layout

New source tree in the substrate repo (mirrors `skills/` + `agents/`):

```
opencode/
├── README.md                       # translation guide: SKILL.md → command; CC→OpenCode tool map
├── CONVENTIONS.md                  # Phase-1 empirically-verified OpenCode facts (dir names, etc.)
├── command/
│   └── substrate/                  # namespace → /substrate/<name>
│       ├── init.md
│       ├── adopt.md
│       ├── migrate.md
│       ├── architect-spec.md
│       ├── graph-spec.md
│       ├── execute.md
│       ├── quick-spec.md
│       ├── diagnose.md
│       ├── synthesize-session.md
│       ├── add-doctrine.md
│       └── deploy.md
└── agent/
    └── doctrine-architect.md       # mode: subagent
scripts/
├── opencode-link.sh                # symlink opencode/{command,agent} into ~/.config/opencode/
└── opencode-unlink.sh              # remove the symlinks
```

> **Directory names are provisional** — `command/`↔`commands/` and `agent/`↔`agents/` are
> resolved in Phase 1 and the tree is created with the verified names. `CONVENTIONS.md` records
> the verdict; every downstream step reads it.

### Translation model (SKILL.md → OpenCode command)

| Claude Code SKILL element | OpenCode command equivalent |
|---|---|
| frontmatter `name` + `description` | frontmatter `description` (name comes from filename) |
| skill `<arg>` | `$ARGUMENTS` (or `$1`,`$2` positional) |
| "dispatch N `doctrine-architect` via Agent tool in one message" | "invoke the `doctrine-architect` subagent via the Task tool, one task per doctrine (parallel where supported)" — requires `permission.task: allow` on the executing agent |
| `SUBSTRATE_ROOT` path-search (CC plugin cache) | `${SUBSTRATE_ROOT:?}` env var, set by `opencode-link.sh` guidance / opencode config `env`; fail fast if unset (only `init`/`adopt`/`migrate` need it) |
| Skill→Skill call (`architect-spec` → `graph-spec`) | command body inlines the graph-spec procedure by `@`-including `opencode/command/substrate/graph-spec.md`, or instructs the agent to run that command (Phase-1 verified path) |
| CC-only tools (ExitPlanMode, plan mode, Skill tool) | stripped; replaced with OpenCode-native equivalents or plain prose |
| doctrine/scripts references (`docs/doctrine/…`, `docs/scripts/bead-graph.sh`) | unchanged — they live in the target repo, agent-agnostic |

---

## 4. Implementation Details

### 4.1 OpenCode agent: `doctrine-architect`

`opencode/agent/doctrine-architect.md`. Frontmatter: `description` (verbatim intent from
`agents/doctrine-architect.md`), `mode: subagent`, `permission: { edit: deny, bash: allow,
read: allow, task: deny }` (a doctrine-architect analyzes + returns recommendations; it does not
edit or spawn further subagents — matching the CC depth model). Body = the CC agent's system
prompt, with the output-format contract preserved so orchestrator commands can parse it.

### 4.2 OpenCode commands (linear skills)

`quick-spec, diagnose, add-doctrine, graph-spec, execute, synthesize-session, deploy, init,
adopt`. Each is a near-verbatim translation of the SKILL body: same workflow steps, same
REFUSE tables, same constraints, with the CC-specific mechanics remapped per §3. `graph-spec`
and `diagnose` reference `docs/scripts/bead-graph.sh` / doctrine files unchanged. `init` /
`adopt` gain the `${SUBSTRATE_ROOT:?}` guard.

### 4.3 OpenCode commands (orchestrators — parallel adaptation)

`architect-spec, migrate`. The doctrine-discovery + composition prose is preserved; the fan-out
step is rewritten to use the Task tool against the `doctrine-architect` subagent (one task per
relevant doctrine). If Phase 1 proves OpenCode serializes Task calls, the command notes the
degradation and dispatches sequentially — correctness over wall-clock. `architect-spec`'s final
"Graph the Spec" step chains to the graph-spec procedure via the Phase-1-verified mechanism.

### 4.4 Install mechanism

`scripts/opencode-link.sh`: resolve the OpenCode config dir (`~/.config/opencode`), create it if
absent, then symlink `opencode/command/substrate` → `<config>/command/substrate` and each
`opencode/agent/*.md` → `<config>/agent/`. Pure bash + coreutils. `opencode-unlink.sh` removes
only substrate-owned links (never touches user files). Both idempotent; both print the verified
config paths.

---

## 5. Error Handling

| Error | Cause | Handling |
|-------|-------|----------|
| Command doesn't load in OpenCode | Wrong dir name (`command` vs `commands`) | Phase 1 spike pins the correct name in `CONVENTIONS.md` before any port |
| `SUBSTRATE_ROOT` unset | `init`/`adopt`/`migrate` run in OpenCode with no source path | Command aborts with: "Set SUBSTRATE_ROOT to your substrate clone; OpenCode has no plugin cache to discover it." |
| Subagent never runs | Executing agent lacks `permission.task: allow` | `opencode-link.sh` prints a note; orchestrator commands document the required permission |
| Parallel fan-out serializes | OpenCode Task model differs from CC | Degrade to sequential dispatch; command logs it — no silent behavior change |
| Symlink clobbers user file | Name collision in `~/.config/opencode/` | `opencode-link.sh` refuses to overwrite a non-symlink; asks the user |
| Command namespace collision | Another tool owns `/init` etc. | All commands live under the `substrate/` subdir → `/substrate/init`, no bare names |

---

## 6. Testing Strategy

| Layer | Test Focus | Command |
|-------|------------|---------|
| Static | Command/agent frontmatter parses; bash scripts lint | `bash -n scripts/opencode-link.sh scripts/opencode-unlink.sh` |
| Load | Agent registers | `opencode agent list \| grep doctrine-architect` |
| Load | Commands register | Phase-1-verified check (headless `opencode run` or documented TUI check) for `/substrate/*` |
| Behavior | A linear command runs a real task | `graph-spec` against `keylark` produces waves |
| Behavior | Orchestrator dispatches subagents | `architect-spec` in a sandbox fans out ≥2 `doctrine-architect` tasks |
| Install | link/unlink idempotent + non-destructive | run each twice; diff `~/.config/opencode` |
| E2E | Full command in a real OpenCode session | `keylark`: `/substrate/quick-spec` + `/substrate/graph-spec` |

> No `pnpm app:*` gate — this repo is a plugin (markdown + bash), not a Convex app. Gates below
> use the OpenCode CLI, `bash -n`, and `doctrine-lint`.

---

## 7. Failure Modes (FMEA)

| # | Failure Mode | Severity | Mitigation |
|---|--------------|----------|------------|
| 1 | Hardcoded dir name wrong → nothing loads | Critical | Phase 1 spike is a hard gate; bulk port blocked until `CONVENTIONS.md` written |
| 2 | OpenCode changes conventions across versions | High | Pin `1.17.14` in `CONVENTIONS.md`; `opencode-link.sh` warns on a different major/minor |
| 3 | Parallel subagent dispatch unsupported | Medium | Sequential fallback specified; correctness unaffected |
| 4 | `init`/`adopt`/`migrate` can't find source tree | High | `${SUBSTRATE_ROOT:?}` fail-fast guard + doc |
| 5 | Skill body leaks CC-only tool references | Medium | Translation checklist in `opencode/README.md`; Phase-per-command Verify greps for `ExitPlanMode`/`Skill tool`/`Agent tool` |
| 6 | Global symlink overwrites user config | High | link script refuses non-symlink targets |
| 7 | Fable 5 (Bedrock) interprets prose differently than CC | Low | Skills are model-agnostic NL contracts; E2E phase catches regressions |
| 8 | Drift: skill edited in `skills/`, `opencode/` copy goes stale | Medium | `opencode/README.md` documents the parity rule; future work: a lint that diffs the two (noted, out of scope) |

---

## 8. Prompt Execution Strategy

<!--
PROTOCOL: docs/protocol/sdd/execution-format.md (phases → steps → Verify → Gate)
COMPLETENESS: _SPEC-STANDARD.md §5 invariants
Verification uses the OpenCode CLI, bash -n, and doctrine-lint — NOT pnpm app:*.
-->

### Phase 1: Spike — Ground OpenCode conventions (HARD GATE)

#### Step 1.1: Empirically resolve directory + naming conventions

Create a throwaway probe command and agent in BOTH candidate layouts and see which OpenCode
loads: `~/.config/opencode/command/substrate/ping.md` vs `.../commands/substrate/ping.md`, and
`~/.config/opencode/agent/pong.md` vs `.../agents/pong.md`. Determine: (a) singular vs plural
dir, (b) whether a subdir namespaces the command to `/substrate/ping` or flattens to `/ping`,
(c) how to invoke/verify a command headlessly (`opencode run "…"`), (d) whether a command can
invoke a subagent via the Task tool and whether two Task calls run in parallel, (e) whether a
command body can chain to another command.

Record every verdict in `opencode/CONVENTIONS.md` with the observed evidence and the pinned
OpenCode version (`opencode --version`).

Tools to use: Bash (probe + `opencode run`), Write (`opencode/CONVENTIONS.md`).
Tools to NOT use: bulk Write of real commands — nothing ports until this gate is green.

##### Verify

- `test -f opencode/CONVENTIONS.md`
- `grep -q "opencode --version" opencode/CONVENTIONS.md` (version pinned)
- Probe command demonstrably loaded: `CONVENTIONS.md` records a successful `opencode run` (or TUI) invocation of the probe.

##### Timeout

300000

#### Step 1.2: Decide the SUBSTRATE_ROOT + command-chaining strategy

From 1.1's findings, document in `opencode/CONVENTIONS.md`: how `init`/`adopt`/`migrate` will
resolve the substrate source tree in OpenCode (env var vs opencode `env` config), and the exact
mechanism `architect-spec` uses to reach `graph-spec`.

##### Verify

- `grep -qi "SUBSTRATE_ROOT" opencode/CONVENTIONS.md`
- `grep -qi "chain\|graph-spec" opencode/CONVENTIONS.md`

#### Gate

- Remove all probe files from `~/.config/opencode`.
- `opencode/CONVENTIONS.md` exists, version-pinned, and answers Open Questions 1–3 from the brief.
- STOP for user approval before bulk porting.

### Phase 2: Source tree + doctrine-architect agent

#### Step 2.1: Scaffold `opencode/` and the translation guide

Create `opencode/` with the verified dir names and write `opencode/README.md` (the SKILL→command
translation table from §3, plus the CC→OpenCode tool map + the parity rule from FMEA #8).

##### Verify

- `test -d opencode/command/substrate` (names per CONVENTIONS.md)
- `test -f opencode/README.md`

#### Step 2.2: Port `doctrine-architect` → OpenCode subagent

Translate `agents/doctrine-architect.md` → `opencode/agent/doctrine-architect.md` per §4.1
(`mode: subagent`, `permission.task: deny`, `permission.edit: deny`, output contract preserved).

##### Verify

- `bash scripts/opencode-link.sh` then `opencode agent list | grep -q doctrine-architect`
- frontmatter has `mode: subagent`

#### Gate

- `opencode agent list` shows `doctrine-architect`.
- `opencode/README.md` parity rule present.

### Phase 3: Port the linear commands

#### Step 3.1: Port the clean skills

Translate `quick-spec, diagnose, add-doctrine, graph-spec, execute, synthesize-session, deploy`
each to `opencode/command/substrate/<name>.md` per the §3 model. Keep workflow/REFUSE/constraints
verbatim; remap args to `$ARGUMENTS`; strip CC-only tool references.

##### Verify

- For each file: `grep -Lq "ExitPlanMode\|Skill tool\|Agent tool" opencode/command/substrate/<name>.md` (no CC-only leakage)
- Each has a `description:` frontmatter key.

#### Step 3.2: Dry-run one command end-to-end

In `keylark` (via OpenCode), run `/substrate/graph-spec mvp-slice-1-workspace` (invocation per
CONVENTIONS.md). Confirm it reads the spec, (re)builds/shows the bead DAG using
`docs/scripts/bead-graph.sh`.

##### Verify

- The command produces a wave view (bead DAG) in the OpenCode session — recorded transcript or screenshot.

#### Gate

- All 7 linear commands load in OpenCode.
- `graph-spec` demonstrably ran in an OpenCode session.

### Phase 4: Port orchestrators + parallel adaptation

#### Step 4.1: Port `init`, `adopt` with the SUBSTRATE_ROOT guard

Translate both; add the `${SUBSTRATE_ROOT:?<message>}` fail-fast per §4.2 / Error Handling.

##### Verify

- Running `/substrate/adopt` with `SUBSTRATE_ROOT` unset aborts with the documented message (not a stack trace).

#### Step 4.2: Port `architect-spec` + `migrate` with Task-tool fan-out

Rewrite the fan-out step per §4.3 using the CONVENTIONS.md-verified Task-tool mechanism; wire the
`architect-spec` → `graph-spec` chain; specify the sequential fallback.

##### Verify

- In a sandbox repo with ≥2 doctrines, `/substrate/architect-spec <brief>` dispatches ≥2
  `doctrine-architect` subagents (parallel if supported) and writes a `*-spec.md`.

#### Gate

- `architect-spec` produces a well-formed spec in an OpenCode session.
- `init`/`adopt`/`migrate` guard `SUBSTRATE_ROOT`.

### Phase 5: Install scripts + docs

#### Step 5.1: Write `opencode-link.sh` / `opencode-unlink.sh`

Per §4.4 — idempotent, non-destructive, print verified paths.

##### Verify

- `bash -n scripts/opencode-link.sh scripts/opencode-unlink.sh`
- Run link twice → no error, no duplicate; run unlink twice → clean; `git status` on `~/.config/opencode` shows only substrate symlinks touched.

#### Step 5.2: Document in README.md + CLAUDE.md

Add a "Using substrate in OpenCode" section (install via `opencode-link.sh`, the two-tier model:
AGENTS.md context is automatic, commands need the link).

##### Verify

- `grep -qi "opencode" README.md && grep -qi "opencode" CLAUDE.md`

#### Gate

- Fresh shell → `bash scripts/opencode-link.sh` → OpenCode lists all `/substrate/*` commands + the agent.

### Phase 6: E2E in a real OpenCode session

#### Step 6.1: Run two commands end-to-end in `keylark`

Under OpenCode (Fable 5 / Bedrock), run `/substrate/graph-spec` and `/substrate/quick-spec` on a
real small task; confirm each completes (DAG rendered; quick-spec plans→(mock)verify→stops at its
gate).

##### Verify

- Both commands complete without CC-only-tool errors; transcripts captured under `docs/tasks/ongoing/opencode-port/`.

#### Gate

- Two real commands succeed in OpenCode. Success Criteria (§1.3) all met.

### Phase 7: Doctrine Review

<!-- MANDATORY per spec-template. -->

#### Step 7.1: Review against substrate's meta-doctrines

Review the port against `references/docs-core/docs/doctrine/agents-doctrine.md` and
`agents-parallel-execution-doctrine.md`, and the plugin principles in `CLAUDE.md` (progressive
disclosure, fail-fast, scaffold-by-copy). Answer: compliance? new patterns (a cross-tool
distribution pattern)? outdated rules? missing coverage (e.g. a skill-parity lint)?

If amendments: write `docs/tasks/ongoing/opencode-port/doctrine-amendments.md`.

##### Verify

- `test -f docs/tasks/ongoing/opencode-port/doctrine-amendments.md && echo documented || echo none`

#### Step 7.2: File follow-ups

Queue any amendments + the two noted out-of-scope items (adopt-emits-`.opencode/`; skill-parity
lint) as beads under `epic:opencode-port`.

##### Verify

- `bash docs/scripts/bead-graph.sh --epic opencode-port 2>/dev/null || echo "no tracker / no beads"`

#### Gate

- Review complete; follow-ups filed or explicitly none.

---

## 9. Operational Queries

### Status Check

```bash
# What substrate commands/agents does OpenCode currently see?
ls -l ~/.config/opencode/command/substrate/ 2>/dev/null
opencode agent list | grep -i doctrine-architect
```

### Parity Audit

```bash
# Every Claude Code skill has an OpenCode command counterpart (expected: empty diff).
comm -23 \
  <(ls skills | sort) \
  <(ls opencode/command/substrate | sed 's/\.md$//' | sort)
```

---

## 10. Spec Completeness Checklist

### Semantic Completeness
- [x] All artifacts (tree, frontmatter fields, translation table) defined — no `...`
- [x] All terms defined or linked (command, agent, subtask, Task tool)
- [x] State/flow explicit (phase gates)
- [x] Provisional facts flagged (dir names) with a resolution step

### Verification Completeness
- [x] Each phase has executable verification
- [x] Parity has an audit query (§9)
- [x] Success criteria are binary (§1.3)

### Recovery Completeness
- [x] FMEA table present (§7)
- [x] Idempotency guaranteed (link/unlink)
- [x] Fallback/rollback defined (sequential fan-out; unlink; refuse-on-clobber)

### Context Completeness
- [x] Brief linked
- [x] Decision rationale captured (§3 translation model, FMEA)
- [x] Change log present

### Boundary Completeness
- [x] Scope table present (§2)
- [x] Prereq/permission requirements explicit (`permission.task`, `SUBSTRATE_ROOT`)
- [x] External dependencies listed (OpenCode 1.17.14, config dir)

---

## 11. Change Log

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2026-07-06 | Initial specification — full OpenCode port (11 commands + doctrine-architect agent + install scripts), Phase-1 conventions spike as hard gate. |
