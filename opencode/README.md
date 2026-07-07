# substrate for OpenCode

This tree ports the substrate Claude Code plugin to **OpenCode** (`1.17.14`). It mirrors the
plugin's `skills/` + `agents/` as OpenCode **commands** + an **agent**, so the active
`/substrate:*` command surface — which previously only existed in Claude Code — also works inside
OpenCode sessions.

An *adopted* repo already gives OpenCode passive context automatically (`AGENTS.md` + `docs/` +
`docs/scripts/*.sh`). This tree adds the **active** command surface on top.

## Layout

```
opencode/
├── README.md          # this file — translation guide + parity rule
├── CONVENTIONS.md     # Phase-1 empirically-verified OpenCode facts (READ FIRST)
├── command/
│   └── substrate/     # namespace → /substrate/<name>
│       ├── init.md  adopt.md  migrate.md  architect-spec.md  graph-spec.md
│       ├── execute.md  quick-spec.md  diagnose.md  synthesize-session.md
│       ├── add-doctrine.md  deploy.md
└── agent/
    └── doctrine-architect.md   # mode: subagent
```

Install with `scripts/opencode-link.sh` (symlinks this tree into `~/.config/opencode/`);
remove with `scripts/opencode-unlink.sh`. See the repo README's "Using substrate in OpenCode".

## Translation model: `skills/<name>/SKILL.md` → `command/substrate/<name>.md`

Bodies are **translated, not redesigned** — same workflow steps, same REFUSE tables, same
constraints. Only the Claude-Code-specific mechanics are remapped:

| Claude Code SKILL element | OpenCode command equivalent |
|---|---|
| frontmatter `name` + `description` | frontmatter `description` only — the command **name comes from the filename** |
| skill `<arg>` | `$ARGUMENTS` (whole string) or `$1`, `$2` (positional) |
| "dispatch N `doctrine-architect` via the **Agent tool** in one message" | "invoke the `doctrine-architect` subagent via the **Task tool**, one task per doctrine, in a single message (parallel where the runtime supports it); **sequential fallback** otherwise — correctness over wall-clock" — requires `permission.task: allow` on the executing agent |
| `SUBSTRATE_ROOT` path-search (CC plugin cache) | `${SUBSTRATE_ROOT:?<message>}` env guard — OpenCode has **no plugin cache** to discover the source tree. Only `init`/`adopt`/`migrate` need it; fail fast if unset |
| Skill→Skill call (`architect-spec` → `graph-spec`) | `@`-include the sibling command: `@opencode/command/substrate/graph-spec.md` (CONVENTIONS.md Q5) |
| CC-only tools (ExitPlanMode, plan mode, Skill tool, Agent tool) | **stripped** — replaced with OpenCode-native equivalents or plain prose |
| doctrine/scripts refs (`docs/doctrine/…`, `docs/scripts/bead-graph.sh`) | **unchanged** — they live in the target repo, agent-agnostic |

## CC → OpenCode tool map

| Claude Code | OpenCode |
|---|---|
| Agent tool (spawn subagent) | **Task** tool (`permission.task`) |
| Skill tool (invoke another skill) | `@`-include the command file, or instruct the agent to run `/substrate/<name>` |
| ExitPlanMode / plan mode | *(none)* — removed; describe the plan in prose and proceed |
| Write / Edit / Read / Bash / Grep / Glob | same names (OpenCode: `edit`, `read`, `bash`, `grep`, `glob`) |
| WebFetch / WebSearch | `webfetch` / `websearch` |
| TodoWrite | `todowrite` |

Grantable OpenCode permissions (from `opencode agent create --permissions`):
`bash, read, edit, glob, grep, webfetch, task, todowrite, websearch, lsp, skill`.

## Command frontmatter

```markdown
---
description: <one-line, from the SKILL's frontmatter description>
---
<body — the translated SKILL workflow>
```

Args in the body: `$ARGUMENTS`, `$1..$N`. File include: `@relative/path.md`. Shell inject:
`` !`cmd` `` (use sparingly).

## Agent frontmatter (`doctrine-architect`)

```markdown
---
description: <verbatim intent from agents/doctrine-architect.md>
mode: subagent
permission:
  edit: deny
  task: deny      # a doctrine-architect analyzes; it does not spawn further subagents (CC depth model)
  bash: allow
  read: allow
---
```

## Parity rule (FMEA #8 — REQUIRED)

**The `opencode/command/substrate/<name>.md` files are translations of `skills/<name>/SKILL.md`
and MUST be kept in parity.** When a skill body changes, its OpenCode command counterpart must be
re-translated in the same change. There is one command per skill and one agent per subagent — no
extras (Scope §2).

Audit parity (expect empty diff):

```bash
comm -23 <(ls skills | sort) <(ls opencode/command/substrate | sed 's/\.md$//' | sort)
```

A future automated lint that diffs the two trees is noted as out-of-scope follow-up (FMEA #8).

## SUBSTRATE_ROOT

`init`, `adopt`, `migrate` need the substrate source tree. In OpenCode there is no plugin cache to
search, so they require `SUBSTRATE_ROOT` to point at your substrate clone. Set it in your shell,
or in `~/.config/opencode/opencode.jsonc` under `env`. If unset, these three commands abort with a
clear message (fail-fast) — the other 8 commands don't need it.
