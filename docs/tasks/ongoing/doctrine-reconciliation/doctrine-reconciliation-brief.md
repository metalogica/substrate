# Doctrine Reconciliation Brief

**Author**: rei nova
**Date**: 2026-07-14
**Status**: Draft

---

## User Story

As a substrate author executing a spec,
I want the doctrine changes that the spec's implementation drove to be **applied inside the epic's own scope** — not detected-and-punted to an optional terminal skill,
so that doctrine reconciliation can never silently evaporate, and the feature plus the doctrine evolution it caused land as one co-revertable unit.

---

## Problem

Today the mandatory **Doctrine Review** phase (Phase N of every spec, per `references/sdd-protocol/templates/spec-template.md`) only *detects* amendments. Under `bead-tracker: tbd` it writes nothing and reports findings "for `/substrate:synthesize-session` to queue as `type: doctrine-amendment` beads." That handoff has two failure modes:

1. **Silent evaporation.** `/substrate:synthesize-session` is explicitly optional and skippable. If it's skipped, every amendment the review surfaced is lost.
2. **Dead-letter queue.** Even when synthesize runs, amendments land as passive `status: queued` `doctrine-amendment` beads that nobody triages — a backlog, not an applied change.

The doctrine mutation the spec *earned* is structurally deferrable, and deferrable things get dropped.

---

## Locked Decisions

These are settled — they are inputs, not open questions:

1. **Amendments are executed, not queued.** The reconciliation *applies* the doctrine change — it mutates `docs/doctrine/**` — rather than filing a bead for later human triage.
2. **The mutation lands inside the epic's scope.** The doctrine file edits are part of the epic's own diff / squash commit. Feature + doctrine evolution are one co-revertable unit.
3. **It is the epic's terminal graphed node.** Reconciliation becomes a first-class bead in the DAG (`blocked-by` every other bead, so it sees the fully integrated feature), not a phase that punts. It can't be skipped because the orchestrator must land every node.
4. **Same principle for the attended path.** `/substrate:execute` performs the doctrine mutation as its final step (execute is depth-0, so it can apply directly).
5. **`ratify-only` semantics (default binding rule).** The terminal mutation may only **codify what the epic already did** — relax an outdated rule, promote a pattern the landed code demonstrates, add coverage the code exemplifies. It may **never** introduce a MUST/MUST-NOT that the just-landed epic code violates. Consequence: re-gating the integrated tip against the mutated doctrine is deterministically green, and the terminal node's blast radius stays bounded. Stricter constraints that would require *changing* the shipped code are out of scope for the terminal node — they remain follow-up work for `/substrate:synthesize-session`.

---

## Constraints

- MUST: Make doctrine reconciliation a mandatory terminal node of every graphed epic (`graph-spec` emits it; `blocked-by` all other beads; `docs/doctrine/**` in its write-scope).
- MUST: Apply the doctrine mutation inside the epic's own diff — the doctrine change is co-revertable with the feature that drove it.
- MUST: Preserve the single-writer-tracker invariant. A group-runner may **edit `docs/doctrine/**` files in its worktree** (that's ordinary code change), but MUST NOT touch `tbd` / `git push` — the orchestrator remains the sole tracker/remote writer.
- MUST: Re-gate the integrated tip against the *mutated* doctrine after the terminal node lands.
- MUST: Enforce `ratify-only` — the terminal mutation cannot introduce a rule the landed code violates. If reconciliation would require a stricter rule that invalidates shipped code, it is deferred, not applied.
- MUST: Apply the same principle to the attended `/substrate:execute` path (doctrine mutation as final step).
- MUST: Remove the doctrine-amendment queuing from `/substrate:synthesize-session` (its old Step 5) since amendments are now applied in-epic. Synthesize keeps: session narrative, state-transfer beads, parked questions, and missing-doctrine draft authoring (a *new* axis is not a ratify-only amendment to an existing one).
- MUST: Keep the OpenCode mirror in parity — every changed `skills/<name>/SKILL.md` re-translates its `opencode/command/substrate/<name>.md` in the same change (binding parity rule).
- SHOULD: Keep `bead-tracker: none` working — under `none`, the terminal node still applies the doctrine mutation to `docs/doctrine/**` directly (markdown is canonical); no queue file.
- MUST NOT: Reintroduce a working-tree `doctrine-amendments.md` dead-letter file under `tbd`.

---

## References

- Contract: `references/sdd-protocol/templates/spec-template.md` (§ Phase N: Doctrine Review — Step N.1 / N.2)
- Skills to update: `skills/graph-spec/SKILL.md`, `skills/orchestrate/SKILL.md`, `skills/execute/SKILL.md`, `skills/synthesize-session/SKILL.md`, `skills/architect-spec/SKILL.md`
- OpenCode mirrors: `opencode/command/substrate/{graph-spec,orchestrate,execute,synthesize-session,architect-spec}.md`
- Single-writer + worktree semantics: `agents-parallel-execution-doctrine.md` (§ Grouping & windows), `agents/bead-implementer.md`
- Synthesize step being removed: `skills/synthesize-session/SKILL.md` Step 5 (Queue doctrine amendments)

---

## Acceptance Criteria

- [ ] `graph-spec` emits a terminal doctrine-reconciliation bead per epic, `blocked-by` all other beads, with `docs/doctrine/**` in write-scope.
- [ ] Executing an epic (via `orchestrate` or `execute`) applies any ratify-only doctrine mutation to `docs/doctrine/**` inside the epic's diff, with the tip re-gated green against the mutated doctrine.
- [ ] A group-runner never writes to `tbd` or pushes; the orchestrator remains sole tracker/remote writer even for the reconciliation node.
- [ ] `synthesize-session` no longer queues `doctrine-amendment` beads; its other outputs (narrative, state-transfer beads, parked questions, missing-doctrine drafts) are unchanged.
- [ ] `spec-template.md` Phase N describes apply-and-gate (ratify-only), not detect-and-punt.
- [ ] `comm -23 <(ls skills|sort) <(ls opencode/command/substrate|sed 's/\.md$//'|sort)` parity audit passes; each changed skill's OpenCode mirror is re-translated.

---

## Out of Scope

- Mutate-and-fix semantics (introducing stricter doctrine + changing shipped code to satisfy it). Deferred; ratify-only is the binding rule for the terminal node.
- Missing-doctrine (new-axis) authoring — stays in `synthesize-session` Step 4b, unchanged.
- Any change to how `/substrate:adopt` / `/substrate:init` seed the initial doctrine tree.

---

## Open Questions

1. Where exactly does the reconciliation node's *content* come from under `orchestrate`? The group-runners that built the epic have the implementation context; the terminal node runs in its own worktree seeing the integrated tip but not the other runners' reasoning. Does it re-derive amendments purely from the diff + doctrines (self-contained, ratify-only), or does each group-runner emit amendment candidates in its ledger that the orchestrator threads into the terminal node's prompt?
2. Should `ratify-only` be enforced structurally (a lint/gate that fails if the doctrine diff adds a MUST the code violates) or only by prompt contract?
3. Does the reconciliation node get its own `group:<window-N>`, or is it always a solo terminal window?

### Resolutions (2026-07-15, implemented)

1. **Self-contained re-derivation.** The terminal node reads the full integrated diff (feature tip vs. integration base) + the relevant doctrines and derives the ratify-only mutation itself. Group-runner ledgers MAY surface doctrine-touchpoint hints the orchestrator threads in, but the node never depends on them — keeps the worktree/single-writer model clean. (`spec-template.md` §Phase N Step N.1; `orchestrate` §5h.)
2. **Prompt contract + the mandatory re-gate as the structural backstop.** No bespoke lint. Ratify-only means the mutation only codifies what the landed code already did, so re-gating the integrated tip against the mutated doctrine is deterministically green; a **red re-gate ⟹ not ratify-only ⟹ revert + defer** to `synthesize-session`. (`orchestrate` §5h; `execute` Step 4.)
3. **Always a solo terminal window.** It is `blocked-by` every other bead, so it is structurally its own final wave regardless; graph-spec gives it its own `group:<window-N>` (Step 4.6).
