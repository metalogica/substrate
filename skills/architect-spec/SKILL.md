---
name: architect-spec
description: "Turn a manually written brief into an executable multi-phase spec with verification gates. Invoke with a brief path (docs/tasks/ongoing/<feature>/<feature>-brief.md). Runs Socratic Q&A to resolve ambiguity, discovers the project's doctrines via manifest or glob, dispatches one doctrine-architect subagent per relevant doctrine in parallel, composes their structured recommendations into a spec following the SDD protocol, and writes docs/tasks/ongoing/<feature>/<feature>-spec.md. Hands off to /substrate:execute for gated execution in a fresh session."
---

# /substrate:architect-spec

Entry point for the SDD spec-drafting flow. Delegates to the `architect-spec` agent, which runs the Q&A, discovers project doctrines, dispatches a `doctrine-architect` subagent per relevant doctrine in parallel, and composes the spec.

## Arguments

`<brief-path>` — path to a brief at `docs/tasks/ongoing/<feature>/<feature>-brief.md`.

## When to run

- Project has been scaffolded (`/substrate:init` completed).
- A brief exists at the expected path, filled per `docs/protocol/sdd/brief-format.md`.
- The feature is large enough to justify a multi-phase spec with gates. (For small features, `/substrate:quick-spec` is simpler.)

## When to REFUSE

| Signal | Redirect |
|--------|----------|
| `docs/doctrine/` missing | Project not initialized. Run `/substrate:init` first. |
| Brief path doesn't exist | Ask the user for the correct path, or create the brief from `docs/protocol/sdd/templates/brief-template.md`. |
| Brief's required sections empty (User Story, Constraints, Acceptance Criteria per `brief-format.md` §4) | Ask the user to fill them in first — do not run Q&A over an empty brief. |

## Workflow

### Step 1. Validate the brief

Confirm the brief path was passed as an argument. If not, ask for it.

Read the brief. Verify it contains the required sections per `docs/protocol/sdd/brief-format.md` §4:

- Header (Author, Date, Status)
- User Story
- Constraints
- References

If any required section is missing or empty, surface the gaps and ask the user to fill them before continuing.

### Step 2. Verify project state

```bash
# Initialization check: protocol dir present AND at least one doctrine discoverable
# (manifest preferred, glob fallback).
test -d docs/protocol/sdd && test -d docs/doctrine && \
  ( test -f docs/doctrine/doctrine-manifest.yaml || \
    find docs/doctrine -type f -name '*-doctrine.md' -print -quit | grep -q . ) \
  || echo "NOT_INITIALIZED"
```

If output is `NOT_INITIALIZED`, stop and tell the user to run `/substrate:init` first.

### Step 3. Spawn the architect-spec agent

Dispatch the `architect-spec` subagent via the Agent tool. Pass it:

- The brief path.
- A note that doctrines are at `docs/doctrine/*.md` and the SDD protocol is at `docs/protocol/sdd/`.

The agent will:

1. Read the brief and discover the project's doctrines (`docs/doctrine/doctrine-manifest.yaml` if present, else glob `docs/doctrine/**/*-doctrine.md`).
2. Run Socratic Q&A with the user to resolve ambiguity.
3. Filter to doctrines whose manifest triggers match the brief (or all doctrines if no triggers declared), and dispatch one `doctrine-architect` subagent per relevant doctrine in parallel — a single Agent-tool message with N tool calls.
4. Mediate any cross-doctrine dependencies the architects flag.
5. Compose the spec per `docs/protocol/sdd/templates/spec-template.md`, with one Architecture subsection and one Prompt-Execution-Strategy phase per `layer-hint` group present in the architect outputs.
6. Write the finished spec to `docs/tasks/ongoing/<feature>/<feature>-spec.md`.

### Step 4. Report the handoff

When the agent returns, print the spec path and the exact follow-up command. Use this format verbatim:

```
✔ Spec written.

Path: docs/tasks/ongoing/<feature>/<feature>-spec.md

Open a NEW terminal in this directory and run:

  claude /substrate:execute docs/tasks/ongoing/<feature>/<feature>-spec.md

The fresh session picks up the spec and executes it phase-by-phase with
verification gates. Opening a new terminal (not /clear) gives the executor
a clean context window — critical for long specs.
```

Do NOT execute the spec yourself in this session. The handoff is the whole point.

## Constraints

- MUST validate the brief before dispatching the agent. Architects cannot work from an empty brief.
- MUST NOT execute the spec. This skill only produces it.
- MUST NOT invite the user to run `/substrate:execute` in the SAME session — the fresh-context benefit is the core design.
- MUST use a single Agent tool call to dispatch `architect-spec`. The agent handles parallel `doctrine-architect` dispatch internally.
- MUST surface any Q&A the agent raises back to the user in real time — don't buffer.
