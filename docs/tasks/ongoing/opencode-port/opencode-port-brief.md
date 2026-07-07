# OpenCode Port — Brief

**Author**: rei nova
**Date**: 2026-07-06
**Status**: Ready for spec

---

## User Story

As a developer who uses **both** Claude Code and OpenCode, I want substrate's skills and
its `doctrine-architect` subagent available inside OpenCode sessions, so that the full
substrate SDD lifecycle (`init → adopt → migrate → architect-spec → graph-spec → execute →
quick-spec → diagnose → synthesize-session → add-doctrine → deploy`) works in OpenCode the
same way it works in Claude Code — not just the passive `AGENTS.md` context an adopted repo
already gives me.

## Constraints

- MUST port **every** substrate skill to an OpenCode custom command, plus `doctrine-architect`
  to an OpenCode subagent. (Chosen scope: "full port incl. architect-spec + agent".)
- MUST keep the port **version-controlled inside the substrate repo** (a new `opencode/` tree,
  mirroring `skills/` + `agents/`), with a symlink-based install into `~/.config/opencode/`
  for hot-reload dev — mirroring the existing `scripts/dev-link.sh` pattern.
- MUST adapt the **parallel doctrine-architect fan-out** (`architect-spec`, `migrate`) from
  Claude Code's Agent-tool semantics to OpenCode's subagent/Task-tool model, degrading to
  sequential if OpenCode can't fan out.
- MUST NOT hardcode OpenCode's file-layout conventions from memory — the `command/` vs
  `commands/` (and `agent/` vs `agents/`) directory names, subdir namespacing, and headless
  command invocation MUST be verified empirically against the installed OpenCode (`1.17.14`)
  before any bulk porting. This is the top FMEA risk.
- MUST fail fast with an explanation on unresolved prerequisites (e.g. `SUBSTRATE_ROOT` not
  resolvable for `init`/`adopt`/`migrate`, which copy from the substrate source tree).
- SHOULD leave a `opencode/README.md` translation guide so future skills port mechanically.

## References

- Grounded OpenCode formats (this session): command frontmatter `description | agent | model |
  subtask | template`; body templating `$ARGUMENTS | $1 | @file | !`cmd``. Agent frontmatter
  `description | mode(primary|subagent|all) | model | temperature | permission{task,bash,edit,…}
  | top_p | color`; body = system prompt; subagent invoked via `@mention`, Task tool (needs
  `permission.task: allow`), or auto-delegation. **Directory singular/plural is unverified.**
- OpenCode docs: https://opencode.ai/docs/commands/ , https://opencode.ai/docs/agents/
- Existing cross-tool seam: `/substrate:adopt` already writes `AGENTS.md` (canonical) +
  `CLAUDE.md → AGENTS.md` symlink, which OpenCode reads natively. keylark
  (`/Users/reinova/code/soulbound-labs/keylark`) is an adopted repo usable as the E2E target.
- Source skills: `skills/*/SKILL.md` (11). Source subagent: `agents/doctrine-architect.md`.

## Open Questions

1. Are OpenCode command/agent dirs `command`/`agent` (singular) or `commands`/`agents`
   (plural)? → resolve in Phase 1 spike.
2. Does subdir namespacing yield `/substrate/init` or a flattened name? → Phase 1.
3. Can an OpenCode command invoke a subagent in parallel (Task tool), and can a command chain
   to another command (architect-spec → graph-spec)? → Phase 1.
4. Global install (`~/.config/opencode/`, all sessions) vs per-repo `.opencode/`? → default
   global via symlink; a future `adopt` step can emit per-repo (out of scope here).
