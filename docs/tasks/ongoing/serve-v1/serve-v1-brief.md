# Substrate Serve v1 — Brief

**Author**: rei nova
**Date**: 2026-07-22
**Status**: Ready for spec
**Supersedes**: the daemon/pump portion of the clawcraft `substrate-pump` campaign brief for the
**local-first v1**. The pump brief remains the campaign document for the VPS phase (webhooks, claim
ref-namespace CAS, remote hosting); this brief is v1 of its daemon deliverable, amended by the
2026-07-22 design session (sync SDD, no webhooks, claim protocol deferred).

---

## User Story

As a solo operator, I want `substrate serve` to run an always-on daemon in a local terminal that
polls my tbd board, claims **groomed** beads, routes each by intent, drives the right substrate
skill in an isolated worktree with **no human in the loop until PR review**, actualizes my PR
comments, and reaps everything on merge — so that my role collapses to *groom → review PRs*, and
spec work stays a synchronous human-plus-strong-model conversation **outside** the factory.

## Vision Deltas (locked 2026-07-22 — these amend the pump brief)

1. **SDD is fully synchronous and out of the factory.** The serve daemon never runs
   `/architect-spec`. A bead that needs a spec is **bounced back to the board** (`needs-spec`
   label, claim released). The human writes/iterates the spec live, graphs it, and either
   orchestrates it attended or (v2) re-queues the graphed epic.
2. **No webhooks.** Poll only. Queue state = the **local tbd store** read on each tick (daemon and
   board TUI share one machine in v1). PR conversation state = `gh api` polling with ETag
   conditional requests (304s are rate-limit-free), scoped to daemon-owned PRs. Merge detection =
   git ancestry or the same poll.
3. **Claim protocol deferred.** On one machine, `groomed → claimed` is a plain label transition
   through the tbd CLI plus `assignee=serve`. The git-ref CAS claim namespace from the pump brief
   §5 is the documented **VPS-phase upgrade**, not v1 work.
4. **Sessions are cattle.** All resume state lives in {bead, branch, PR, worktree}. Any tick may
   spawn a fresh Claude Code session against that state. A dead session's uncommitted work is
   discarded; the redo unit is the bead. `/substrate:orchestrate` already provides finer-grained
   recovery for epics (green-prefix merge + incremental `execution-state.json`) — serve reuses it,
   never reimplements it.

## Spec-State Contract (LOCKED 2026-07-22 — ecosystem-wide, consumed beyond this spec)

Mirrors the `inbox ⇄ groomed` pattern. A spec-in-progress is represented by a **bead carrying the
spec path**; its lifecycle is two labels, **`spec:draft` → `spec:approved`**, and the flip is
**always a human operation** (TUI hotkey, exactly like grooming). The committed **file stays
truth** — its `**Status**:` frontmatter line flips with the label; the bead is the queue pointer
tbd needs. On approval: v1 = the human graphs it; serve **v2** adds a `spec:approved` route that
fires graph-spec + orchestrate.

System invariant this creates: exactly **two human-gated edges** in the whole factory —
`groomed` (work may start) and `spec:approved` (a fleet may spend). Serve v1 consumes neither
side of this contract (its spec lane bounces); it is recorded here so the TUI spec view and the
serve v2 lane converge on one shape with no refactor.

## The CLI verb surface (v1)

| Verb | Purpose | v1? |
|---|---|---|
| `substrate serve` | the daemon: foreground terminal process, poll → claim → route → dispatch → PR loop → reap | ★ v1 |
| `substrate status` | glanceable snapshot: last tick, in-flight beads, owned PRs + review state, bounced beads | ★ v1 |
| `substrate tidy` | manual reaper: merged-PR worktrees, stale branches, orphaned claims (also runs on serve boot + on merge detection) | ★ v1 |
| `substrate triage <bead-id>` | manually fire claim+route+dispatch on one bead NOW, skipping the poll wait (fast manual iteration) | ★ v1 |
| `substrate tasks` | board TUI (exists) | ✅ |
| `substrate doctor` / `logs` / `drain` / `queue` | env preflight as a standalone verb; log tailing; stop-claiming-finish-in-flight; queue listing | v2 (serve boot runs preflight inline; Ctrl-C is v1's stop) |
| `substrate report` | analytics over the v1 event ledger: merged beads/week, tokens+cost per bead, lane mix, time-to-merge (`--since 7d`) — the instrument for the factory-ROI test | v2 (ledger written from v1 day one) |
| `substrate config` | get/set/edit the config incl. the role→model matrix (`models.spec/triage/orchestrator/implementer`, lane models); per-bead override = `model:<x>` label stamped at graph time, read by orchestrate at dispatch | v2 |

`substrate status` v1 renders the **aerial pipeline view** — the factory state machine as ASCII
stations (board → claimed → building → in-review → merged 24h, plus bounced + tick health) with
live bead ids at each station. The renderer is a shared module so a later board-TUI Factory tab
can reuse it live.

## Constraints

- MUST be **local-first**: a foreground process started from a repo root, reading that repo's tbd
  store directly. No VPS, no webhooks, no public endpoint, no systemd. Ctrl-C = graceful stop
  (release claims; worktrees left for boot-reap).
- MUST keep **capture model-free** (board) and **spec work out of the factory** (delta 1).
- MUST end every unit of work in a **PR the human reviews**. No auto-merge, ever.
- MUST treat **tbd as the queue** — no bespoke queue datastore. The daemon's own bookkeeping
  (`.substrate/serve/state.json`, logs) is observability, never the source of truth; every fact in
  it must be re-derivable from {tbd, git, gh}.
- MUST respect the **human `kind` prior** at routing: `/triage` routes within the groomed bead's
  `kind` (+ optional `needs-spec` tag) and logs any override visibly on the bead.
- MUST make every external side effect **idempotent by observation** (`gh pr view || gh pr create`;
  branch-exists checks) — a crashed-and-restarted tick must never duplicate a PR, branch, or
  comment reply.
- MUST **reap on boot**: stale worktrees, orphaned `claimed` beads (claimed but no live work),
  merged-PR leftovers — before the first tick.
- MUST cap concurrency (default **1**, max configurable ~2 in v1): the daemon shares the operator's
  laptop, tokens, and attention. "Serve made my spec session laggy" is a real failure mode.
- MUST shell out to `tbd` / `git` / `gh` / `claude` CLIs rather than reimplement their stores or
  APIs. The daemon is an **operator**, not a platform.
- MUST flag the unattended-permissions reality: headless lane sessions run with permission bypass
  inside their worktree. v1 accepts this for a single-operator local machine; scope it (worktree
  cwd, no repo-external writes) and record it as a standing risk in the skill/docs.
- SHOULD keep the daemon a **thin, replaceable transport**: all intelligence lives in substrate
  skills (`/triage` NL routing, lane skills); the daemon only schedules, spawns, and observes. The
  VPS phase must be a deployment change, not a rewrite.
- SHOULD expose lane→model as config (e.g. quick lane on a cheaper model) but default to inherit.

## Out of Scope (v1)

- VPS deployment, webhooks + HMAC, the §5 git-ref claim CAS (all = the pump brief's VPS phase).
- Running `/architect-spec` autonomously (dead by delta 1); the `architect-spec ⟂ graph-spec`
  auto-chain split (companion task, orthogonal — serve v1 never invokes either).
- Auto-requeue of graphed epics through serve (`/orchestrate` dispatch from the daemon) — v2; v1
  lanes are quick-spec and diagnose only.
- Adversarial-review phase before HIL and markform verdict forms (v1.5, separate task).
- `/synthesize-session` auto-fire on merge (v2; v1 notes the merged bead and leaves synthesis to
  the operator).
- Multi-repo / machine-wide daemon (explicit repo allowlist when it comes; v1 = cwd repo only).

## References

- Pump campaign brief (VPS phase + full state machine): clawcraft
  `docs/tasks/ongoing/substrate-pump/substrate-pump-brief.md`
- Crash-recovery precedent to reuse, not rebuild: `skills/orchestrate/SKILL.md` §5d/5e/6.1
  (green-prefix merge, incremental `execution-state.json`, `gh pr view || gh pr create`)
- CLI entrypoint to extend: `scripts/substrate` (bash case-dispatcher; `tasks` verb precedent)
- Lane skills consumed: `skills/quick-spec/SKILL.md`, `skills/diagnose/SKILL.md`
- Board + labels: `scripts/bead-tui.sh` (global substrate tool, not per-repo payload; `inbox`/`groomed` labels)
- Manual-firing ethos: operator explicitly values CLI-triggered single-task runs for iteration
  speed (`substrate triage <id>`)

## Open Questions

1. **`/triage` seam**: NL skill invoked via `claude -p "/substrate:triage <id>"` writing a
   `route:` label back to the bead (consistent with the kernel, model-assisted), vs. deterministic
   daemon code over `kind`/size with a model escalation only for ambiguity. Leaning: deterministic
   first, NL skill when the prior is missing/ambiguous — cheapest tick wins.
2. **Worktree placement**: `.substrate/serve/worktrees/<bead-id>` inside the repo (gitignored) vs.
   a sibling directory outside the repo. git worktrees inside the repo tree need careful ignore
   rules; sibling dir is cleaner but harder to discover. Leaning: sibling
   (`../<repo>-serve/<bead-id>`).
3. **PR-comment actualization trigger**: any new human comment on an owned PR spawns an actualize
   session — but should a threshold (e.g. review submitted, not per-comment) batch them to avoid
   one session per drive-by comment?
4. **Daemon runtime**: plain Node + `tsx` (no build step) vs. compiled `tsc` output. Leaning tsx
   for v1 iteration speed; gate still runs `tsc --noEmit`.
5. **Status transport**: `substrate status` reads `state.json` written by serve — does serve also
   need a tiny local socket for live queries, or is file-freshness (mtime + tick timestamp) enough
   for v1? Leaning: file is enough.
