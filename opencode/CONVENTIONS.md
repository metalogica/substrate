# OpenCode Conventions — Empirically Verified (Phase 1 spike)

> This file is the **hard gate** for the OpenCode port. Every downstream step reads it.
> All facts below were verified by probe against a live install, not recalled from memory.

## Pinned environment

| Fact | Value | Evidence |
|---|---|---|
| OpenCode version | **1.17.14** | `opencode --version` → `1.17.14` |
| Install | Homebrew, `/opt/homebrew/Cellar/opencode/1.17.14/bin/opencode` (compiled Mach-O arm64) | `readlink -f $(which opencode)` |
| Global config dir | `~/.config/opencode` | exists; contains `opencode.jsonc`, `node_modules/` |
| Model/provider | `amazon-bedrock/us.anthropic.claude-fable-5` (Fable 5 via Bedrock), region `us-east-1`, profile `soulboundlabs` | `~/.config/opencode/opencode.jsonc` |
| Auth store | `~/.local/share/opencode/auth.json` — 0 stored credentials; Bedrock uses the AWS SDK chain | `opencode providers list` |

## Q1 — Directory names: singular vs plural

**Verdict: use singular `command/` and `agent/`.** Both singular and plural are accepted by
OpenCode; singular is the canonical form (listed first in OpenCode's own help table).

Evidence — the `opencode` binary's embedded help documents **both**:

```
| Project agents   | .opencode/agent/<name>.md   OR   .opencode/agents/<name>.md   |
| Project commands | .opencode/command/<name>.md OR   .opencode/commands/<name>.md |
```

Empirical A/B (planted probes in all four layouts, then queried):

| Probe | Location | Result |
|---|---|---|
| `pong-singular` | `agent/pong-singular.md` | ✅ listed by `opencode agent list` → `pong-singular (subagent)` |
| `pong-plural` | `agents/pong-plural.md` | ✅ listed by `opencode agent list` → `pong-plural (subagent)` |
| `ping-singular` | `command/substrate/ping-singular.md` | ✅ resolved (see Q3 log proof) |
| `ping-plural` | `commands/substrate/ping-plural.md` | ✅ resolved (reached model invocation) |

→ Port uses **`opencode/command/substrate/`** and **`opencode/agent/`** (singular).

## Q2 — Namespacing: does a subdir namespace the command or flatten it?

**Verdict: a subdir namespaces the command; namespacing is ENFORCED (not flattened).**

`command/substrate/ping-singular.md` is invoked as **`substrate/ping-singular`** (→ TUI
`/substrate/ping-singular`), and is **NOT** reachable by the bare name `ping-singular`.

Evidence — contrast of headless invocations:

| Invocation | Outcome |
|---|---|
| `opencode run --command substrate/ping-singular` | ✅ **resolved** → reached model invocation |
| `opencode run --command ping-singular` (bare, no namespace) | ❌ `UnknownError` (never resolved) |
| `opencode run --command substrate/does-not-exist` (unknown) | ❌ `UnknownError` (never resolved) |

The bare name and the unknown name fail identically at resolution, while the namespaced name
proceeds — proving the `substrate/` subdir is a required part of the command's identity.

→ All 12 substrate commands live under `command/substrate/` → `/substrate/<name>`. This also
satisfies FMEA #6 / Error-Handling row "namespace collision": no bare `/init` etc.

## Q3 — Headless invocation / verification mechanism

**Verdict: `opencode run --command <namespace>/<name> "<args>"`.** Use `--print-logs
--log-level DEBUG` to observe command resolution.

Definitive load proof (DEBUG log line from a real run):

```
timestamp=2026-07-07T02:31:35Z level=INFO message=command
  session.id=ses_… command=substrate/ping-singular agent=undefined
```

OpenCode created a session and registered `command=substrate/ping-singular` — the probe command
**demonstrably loaded**. (Satisfies Step 1.1 Verify item 3.)

## Q4 — Subagent dispatch + parallelism (Task tool)

**Verdict: commands dispatch subagents via the Task tool; parallel fan-out = multiple Task calls
in one assistant message (same shape as Claude Code's Agent tool). Sequential fallback is the
safe default and is specified by the spec regardless.**

Evidence (OpenCode's embedded system-prompt docs):
- `"I'm going to use the Task tool to launch the greeting-responder agent…"` — the Task tool
  launches a named subagent.
- `"If the commands are independent and can run in parallel, make multiple … calls in a single
  message"` — OpenCode's parallelism model is *multiple tool calls in one message*, mirroring CC.
- `opencode agent create --permissions` lists **`task`** among grantable permissions — so an
  executing agent needs `permission.task: allow` to dispatch subagents (Error-Handling row
  "Subagent never runs"), and a subagent with `permission.task: deny` cannot spawn further
  subagents (matches the CC depth model — see §4.1 of the spec).

⚠️ **Live behavioral confirmation of parallel Task execution is BLOCKED in this environment** —
see "Model-run blocker" below. Orchestrator commands are written to issue one Task per doctrine in
a single message (parallel where the runtime supports it) and **explicitly document the sequential
fallback**; correctness is unaffected either way (FMEA #3).

## Q5 — Command → command chaining

**Verdict: the robust default is to instruct the agent to run the sibling command
(`/substrate/graph-spec <spec>`); `@`-include is available as an inline alternative when the file
is reachable from the project.**

Evidence: the binary documents `@`-file include (`@-include`) and `$ARGUMENTS` / positional
`$1..$N` substitution in command bodies.

Nuance: `@path.md` resolves relative to the **project (target repo)** at run time. The installed
command lives at `~/.config/opencode/command/substrate/graph-spec.md` (a symlink into the substrate
clone), which a *target* repo generally cannot `@`-include by relative path. Therefore:

→ `architect-spec`'s final "Graph the Spec" step **instructs the agent to invoke
`/substrate/graph-spec` on the spec it just wrote** (the sibling command is installed alongside).
If the runtime doesn't support invoking a command mid-session, the command body directs the agent
to **perform the graph-spec procedure directly** (its steps are already installed as a sibling
command it can read). Either path is correctness-equivalent; see §4.3 of the spec. `@`-include of a
project-local file remains the mechanism where a target repo vendors the command locally.

## Q6 — Args / placeholders

- `$ARGUMENTS` — the full argument string (maps CC skill `<arg>`).
- `$1`, `$2`, … — positional arguments.
- `@path/to/file.md` — include a file's contents into the command prompt.
- `` !`shell cmd` `` — inject shell output into the command prompt (available; used sparingly).

## Q7 — Agent frontmatter (for `doctrine-architect`)

Verified keys: `description`, `mode` (`all` | `primary` | `subagent`), `model`. Permissions are
expressed under `permission:` with the grantable set:
`bash, read, edit, glob, grep, webfetch, task, todowrite, websearch, lsp, skill`.

→ `doctrine-architect` frontmatter: `mode: subagent`, `permission: { edit: deny, task: deny,
bash: allow, read: allow }` (per spec §4.1).

## SUBSTRATE_ROOT + command-chaining strategy (Step 1.2)

- **SUBSTRATE_ROOT** — OpenCode has **no plugin cache** to path-search (unlike the CC plugin).
  `init` / `adopt` / `migrate` require the substrate source tree, so they read
  **`${SUBSTRATE_ROOT:?Set SUBSTRATE_ROOT to your substrate clone; OpenCode has no plugin cache
  to discover it.}`** — a fail-fast bash guard. Set it via the shell env, or via opencode config
  `env` (documented in `opencode-link.sh` output). Only these three commands need it; the other 8
  operate purely on the target repo and require no source path.
- **architect-spec → graph-spec chain** — `@`-include of
  `opencode/command/substrate/graph-spec.md` (Q5). Sequential Task fan-out is the correctness
  fallback for the doctrine-architect dispatch (Q4).

## ⚠️ Model-run blocker (environment constraint, not a port defect)

The only configured provider is Amazon Bedrock via the `soulboundlabs` AWS profile, and
`bedrock:InvokeModelWithResponseStream` is **denied by an IAM MFA-enforcement policy**
(`EnforceMFA-rei-nova`) for this non-MFA CLI session:

```
Forbidden: User arn:aws:iam::…:user/rei-nova is not authorized to perform:
bedrock:InvokeModelWithResponseStream … with an explicit deny … policy EnforceMFA-rei-nova
```

`aws sts get-caller-identity` succeeds (identity is valid), but **model invocation is blocked
headlessly**. Consequently the verification steps that require the model to actually *respond* —
Phase 1 Q4/Q5 live behavior, and Phases 3.2, 4.2, 6 — **cannot be executed autonomously in this
session**. Each such step records the exact manual command for the user to run once an MFA-elevated
session (or an alternate provider credential) is available. All **structural** facts above are
fully verified; all port **artifacts** (command/agent markdown + bash install scripts) are
authorable and statically verifiable without a live model.

## Version-pin warning contract

`opencode-link.sh` warns if `opencode --version` differs in major/minor from the pinned
**1.17.14** (FMEA #2).
