# OpenCode Port — Verification Log

Records every verification in the execution. **Structural** checks (dir/namespace/load/lint) were
run and passed autonomously. **Behavioral** checks that require the model to *respond* are BLOCKED
in this session by the Bedrock MFA policy (see `opencode/CONVENTIONS.md` → "Model-run blocker")
and are listed here with the exact manual command to run once an MFA-elevated (or alternate-provider)
OpenCode session is available.

## Environment

- OpenCode `1.17.14`, config `~/.config/opencode`, provider `amazon-bedrock/us.anthropic.claude-fable-5`.
- `bedrock:InvokeModelWithResponseStream` denied by IAM policy `EnforceMFA-rei-nova` for this
  non-MFA CLI session → model cannot respond headlessly. Identity (`aws sts get-caller-identity`) is valid.

## To unblock the behavioral checks

Run in a shell with an MFA-elevated AWS session (e.g. `aws sts get-session-token` with your MFA
device, exported into the env), or configure an alternate OpenCode provider credential, then run
the commands below. TUI is fine too — `opencode` then type the `/substrate/...` command.

---

## Phase 1 — structural (DONE ✓)

- Dir names, namespacing, headless invocation, args, chaining, permission vocab — all verified.
  See `opencode/CONVENTIONS.md` for evidence (incl. the `command=substrate/ping-singular` load log).

## Phase 3, Step 3.2 — graph-spec dry run in keylark

**Structural (DONE ✓):** `/substrate/graph-spec` resolves/loads in OpenCode (log:
`message=command command=substrate/graph-spec`). All 7 linear commands load.

**Behavioral (BLOCKED — model):** produce a wave view (bead DAG) in an OpenCode session.

Manual command:
```bash
cd /Users/reinova/code/soulbound-labs/keylark
opencode run --command substrate/graph-spec "mvp-slice-1-workspace"
# TUI equivalent: open `opencode` in keylark, then: /substrate/graph-spec mvp-slice-1-workspace
```
Expected: reads the spec, (re)builds the bead DAG, prints the wave view via
`docs/scripts/bead-graph.sh`. keylark readiness confirmed: `docs/scripts/bead-graph.sh` present,
spec at `docs/tasks/completed/mvp-slice-1-workspace/mvp-slice-1-workspace-spec.md`, `AGENTS.md`
present (passive context loads automatically).

## Phase 4, Step 4.1 — SUBSTRATE_ROOT fail-fast (adopt/init/migrate/deploy)

**DONE ✓ (mechanism tested directly).** The guard
`: "${SUBSTRATE_ROOT:?Set SUBSTRATE_ROOT to your substrate clone; OpenCode has no plugin cache to
discover it.}"` was executed with `SUBSTRATE_ROOT` unset for all four commands; each aborts with
the documented message and a non-zero exit — **not** a stack trace. This IS the fail-fast behavior
the verify asks for; it fires independently of the model.

Full in-session manual confirmation (optional):
```bash
cd /tmp && env -u SUBSTRATE_ROOT opencode run --command substrate/adopt
# expect: abort with the SUBSTRATE_ROOT message, no stack trace
```

## Phase 4, Step 4.2 — architect-spec fan-out

**Structural (DONE ✓):** `architect-spec` + `migrate` load in OpenCode; both bodies dispatch
`doctrine-architect` via the **Task tool** (one task per doctrine, single message, parallel where
supported, sequential fallback logged) and document the `permission.task` requirement. Zero
CC-only tool leakage.

**Behavioral (BLOCKED — model):** confirm ≥2 `doctrine-architect` tasks actually dispatch and a
`*-spec.md` is written. Manual command (needs a sandbox repo with ≥2 doctrines + an executing
agent that has `permission.task: allow`):
```bash
export SUBSTRATE_ROOT=/Users/reinova/code/metalogica/substrate
cd <sandbox-repo-with-2+-doctrines>
opencode run --command substrate/architect-spec "docs/tasks/ongoing/<feature>/<feature>-brief.md"
# expect: ≥2 doctrine-architect subagents dispatched; docs/tasks/ongoing/<feature>/<feature>-spec.md written
```
Note: if OpenCode serializes Task calls, the command degrades to sequential dispatch and logs it —
correctness unaffected (FMEA #3). keylark itself has multiple doctrines under `docs/doctrine/` and
can serve as the sandbox.

## Phase 6 — E2E: graph-spec + quick-spec in keylark

**Structural (DONE ✓):** both `/substrate/graph-spec` and `/substrate/quick-spec` resolve/load when
run with `--dir /Users/reinova/code/soulbound-labs/keylark`. keylark `AGENTS.md` present → passive
context auto-loads. Zero CC-only tool leakage in either command body.

**Behavioral (BLOCKED — model):** run both end-to-end and confirm each completes (graph-spec renders
a DAG; quick-spec plans → verify → stops at its gate). Manual commands:
```bash
export SUBSTRATE_ROOT=/Users/reinova/code/metalogica/substrate
cd /Users/reinova/code/soulbound-labs/keylark

# graph-spec: render the wave view for an existing spec
opencode run --command substrate/graph-spec "mvp-slice-1-workspace"

# quick-spec: drive a small real task through plan → verify → gate
opencode run --command substrate/quick-spec "<small well-scoped change>"
```
Capture the transcripts (`opencode export <sessionID>` or copy the TUI output) into this directory
as `transcript-graph-spec.md` / `transcript-quick-spec.md`. Success = both complete without
CC-only-tool errors (there are none in the bodies — verified statically).

### Summary of behavioral blockers

Every **structural** verification in the spec passed autonomously. The three behavioral verifies
(3.2 wave view, 4.2 live fan-out, 6 E2E) require the model to respond, which the Bedrock MFA policy
denies in this headless session. They are NOT port defects — the artifacts are complete and
statically verified. Run the boxed commands above in an MFA-elevated OpenCode session to close them.

