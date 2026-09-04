# Doctrine CRUD — history to git, binding to the DAG

**Status**: Graphed (epic `epic:doctrine-crud`) — awaiting `/substrate:orchestrate`
**Origin**: 2026-09-03/04 doctrine-CRUD assessment session (changelog analysis, clawcraft
field evidence, ambient-skills quick-spec `be283dd`). This is a *compact* spec — the design
work happened in-session; this document carries the rationale and the execution strategy,
not full SDD ceremony.

---

## 1. Context & rationale

Substrate's doctrine machinery mandates hand-maintained history metadata (a `## Change Log`
table + `**Version**`/`**Date**` headers in every stub `add-doctrine` scaffolds) and loads
doctrine **late and by pull** (workers trigger-match at runtime; orchestrate hands
group-runners only a `CLAUDE.md` pointer to chase).

Field evidence against both, gathered from clawcraft (19 doctrines, ~16.6k lines):

- The five heaviest doctrines (91–107 git edits each) **never adopted** the changelog table;
  the mid-generation tables that exist are good content **in the wrong index** (filed by
  date; agents query doctrine by topic; git owns time). The newest doctrine (praxis) dropped
  every history field and kept only `Last verified: <date>` — a freshness attestation.
- Substrate's own baseline doctrines sit frozen at `**Version**: 1.0.0` — dead apparatus.
- The meta-doctrine already bans the practice in spirit (§2: "durable, not transient";
  "one fact, one home — duplication IS drift").

**The law this epic codifies:** append-only history belongs on *immutable* artifacts
(specs, per `_SPEC-STANDARD.md` §11 — untouched by this epic); *living* documents get
current-state-only, history in git, freshness attested by a machine-maintainable
`Last verified` header.

**The loading redesign:** doctrine binding moves to graph time — the manifest gains
`paths:` (governed-file globs), `graph-spec` stamps `doctrine:<id>` labels from
write-scope ∩ paths, and dispatchers **push** doctrine at dispatch: a cheap Binding-Rules
*digest* inlined per window, the full body only when a bead is squarely in-domain. This
formalizes the operator's existing manual workflow (spec agent tells the orchestrator which
doctrine to preload per bead) and closes the unverifiable "go read the doctrine" gap.

Completing CRUD: a `--retire` path (the D is missing today — a dead doctrine keeps its
binding authority forever), and per-epic bound-vs-cited telemetry in `synthesize-session`
so doctrine EV becomes an observable.

## 2. Preconditions (before orchestrating — NOT before bead creation)

- Merge `feat/doctrine-ambient-skills` (`be283dd`): D1's retire flow sweeps ambient stubs
  via `docs/scripts/doctrine-skills-sync.sh`; A2's lint rule numbering follows its rule 4.
- Merge `feat/serve-local-mode` (`2c653bf`): B4's target file `skills/serve-bead/SKILL.md`
  exists only there.

**Gate (every bead):** the repo's own `substrate.yaml` gate —
`cd daemon && pnpm exec tsc --noEmit` · `cd daemon && pnpm exec vitest run` ·
`bash references/docs-core/docs/scripts/doctrine-lint.sh`.

**Standing constraint (every bead touching `skills/`):** re-translate the matching
`opencode/command/substrate/<name>.md` in the same bead (CLAUDE.md parity rule).

## 3. Prompt Execution Strategy

### Phase 1 — shed history metadata (wave 1: windows 1–3, parallel)

**A1 · window-1 · task — stub sheds history metadata**
Goal: `skills/add-doctrine/SKILL.md` Step-3 stub (L80–133): delete §6 Change Log +
`**Version**` + `**Date**`; add `**Last verified**: <today>`; renumber; new constraint:
MUST NOT emit changelog/version headers in doctrine. Files: `skills/add-doctrine/SKILL.md`,
`opencode/command/substrate/add-doctrine.md`.

**D1 · window-1 · feature — retire flow (blocked-by A1)**
Goal: `--retire <name>` arm: confirm → remove manifest entry (text-edit) → move doctrine
file to `docs/doctrine/archive/` → fold still-true rules into surviving doctrines → run
`docs/scripts/doctrine-skills-sync.sh` (sweeps the ambient stub) → lint green. Files: same
as A1.

**A3 · window-2 · chore — strip dead Version headers**
Goal: remove `**Version**: 1.0.0` lines from `references/doctrines/{domain,backend,frontend}-doctrine.md`.

**A4 · window-2 · task — adopt harvests pre-existing changelogs**
Goal: new adopt step (between Steps 5 and 8, `skills/adopt/SKILL.md`): detect
`## Change Log` / `**Version**` in the target repo's existing doctrines; fold
rationale-bearing rows inline as why-notes at the section each row cites; delete the
table/headers; the removal commit body carries the harvested table verbatim. Files:
`skills/adopt/SKILL.md`, `opencode/command/substrate/adopt.md`.

**A5 · window-3 · chore — synthesize-session draft header**
Goal: drop `**Version**: 0.1.0` from the header Step 4b dictates
(`skills/synthesize-session/SKILL.md:232` — "Header stays `**Status**: Draft` …"), keep
`Status` + add `Last verified`. Files: `skills/synthesize-session/SKILL.md`,
`opencode/command/substrate/synthesize-session.md`.

### Phase 2 — enforcement + schema (wave 2: window-4, serialized chain)

**A2 · window-4 · task — lint rule 5 + the law (blocked-by A1, A3, A4)**
Goal: `references/docs-core/docs/scripts/doctrine-lint.sh` rule 5: fail when a registered
doctrine contains `^## .*Change Log` or `^\*\*Version\*\*`. `agents-doctrine.md`: the
immutable-vs-living law in §2 + an §8 anti-pattern row ("changelog/version headers in
doctrine — git is the history; harvest-then-delete").

**B1 · window-4 · feature — manifest gains `paths:` (blocked-by A1, A2)**
Goal: new optional manifest key `paths:` (globs of governed files). Document in
`agents-doctrine.md` §3 + the docs-core manifest header comment; `add-doctrine` Q&A gains
a paths question + writer entry line (`skills/add-doctrine/SKILL.md:151-161`); lint
validates each glob matches ≥1 real file. (Key does not exist today — verified.)

**C1 · window-4 · task — digest convention + extractor (blocked-by A1, B1)**
Goal: canonize "§2 Binding Rules is the extractable digest"; zero-dep
`docs/scripts/doctrine-digest.sh <id>` prints a doctrine's §2 block (manifest-resolved
path); documented in `agents-doctrine.md`.

**F1 · window-4 · task — Last-verified loop (blocked-by A1, C1)**
Goal: Gate-2 drift protocol (`agents-doctrine.md` §6) bumps `Last verified` on a green
pass; lint **warns** (not fails) when the date is >6 months old.

### Phase 3 — graph-time binding (wave 3: window-5)

**B2 · window-5 · feature — graph-spec stamps `doctrine:<id>` (blocked-by B1)**
Goal: new Step 4.55 in `skills/graph-spec/SKILL.md` (after the 4.5 window partition,
before the 4.6 terminal-node special case, which is exempt from generic stamping): per
bead, `doctrine:<id>` label for each manifest entry whose `paths:` intersects the bead's
write-scope (creates ∪ modifies). Persisted as extra `-l` flags at Step 5 (L128); new
constraint in §Constraints. Files: `skills/graph-spec/SKILL.md`,
`opencode/command/substrate/graph-spec.md`.

### Phase 4 — dispatch-time push (wave 4: windows 6–8, parallel)

**B3 · window-6 · feature — orchestrate inlines the digest (blocked-by B2, C1)**
Goal: `skills/orchestrate/SKILL.md` Step 5c.5 — new bullet between the bead tuples (L183)
and the `CLAUDE.md` pointer (L184): the union of the window's `doctrine:<id>` digests
(via `doctrine-digest.sh`), full doctrine body instead when a bead's write-scope majority
falls inside one doctrine's `paths:`; demote/qualify the `CLAUDE.md` bullet. Matching
`## Input` item in `agents/bead-implementer.md:32-43`. Files: those two +
`opencode/command/substrate/orchestrate.md`, `opencode/agent/bead-implementer.md`.

**B4 · window-7 · task — serve-bead binds by label (blocked-by B2)**
Goal: `skills/serve-bead/SKILL.md` Step 1 item 4 becomes: read the doctrines named by the
bead's `doctrine:<id>` labels first (they arrive via the dispatch prompt's Labels line —
zero daemon change); trigger-match/glob only as fallback for unlabeled beads. Files:
`skills/serve-bead/SKILL.md`, `opencode/command/substrate/serve-bead.md`.
*Precondition: `feat/serve-local-mode` merged.*

**E1 · window-8 · feature — bound-vs-cited telemetry (blocked-by B2, A5)**
Goal: `skills/synthesize-session/SKILL.md` gains a per-epic doctrine-usage report:
for each `doctrine:<id>` label in the epic — bound-to-N-beads vs cited-in-M
deviations/why-notes; M=0 with high N → "audit paths or content" prompt (report only,
no auto-action). Files: `skills/synthesize-session/SKILL.md` + opencode mirror.

### Phase 5 — terminal reconciliation (wave 5: window-9)

**R · window-9 · task · `kind:doctrine-reconciliation` (blocked-by ALL)**
Goal: per graph-spec Step 4.6 — against the fully-integrated epic, reconcile
`docs/doctrine/**` (ratify-only): the agents-doctrine edits from A2/B1/C1/F1 must agree
with what actually shipped; write-scope `docs/doctrine/**` +
`references/docs-core/docs/doctrine/**`.

## 4. Verification (epic level)

- Every wave: repo gate green (see §2).
- After A2: planting a `## Change Log` in a registered doctrine turns lint red.
- After B2: graphing any spec on a manifest with `paths:` yields `doctrine:` labels.
- After B3/B4: a dispatched window's prompt contains the digest text (orchestrate) /
  a serve session's Step-1 report names the labeled doctrine (serve).
- After R: `bead-graph.sh` shows the epic fully closed; open-count matches graph.

---

### Post-execution notes

Executed 2026-09-04 by `/substrate:orchestrate` as a 9-window / 5-wave fleet; landed on
trunk as `753ec9c`. All 14 beads passed; no window stopped mid-run; no re-batching, so
`deviations` in `.substrate/execution-state.json` is empty. Deviations from what this spec
prescribed, and the judgement calls runners made where it was silent:

**Two blockers had to clear before wave 1 could be dispatched.**

1. **The DAG was unreadable.** `bead-graph.sh` passed `--no-sync` on all three of its `tbd`
   reads with stderr discarded. tbd 0.4.2 removed that flag, so every read exited non-zero
   into `/dev/null`, `RAW` came back empty, and the script reported "no beads found" for a
   fully-populated epic. Fixed in `ccb3b9c` (probe-once shim, mirroring the one
   `scripts/bead-tui/watch.mjs:66` already carried — and whose comment claimed `bead-graph.sh`
   had it). Filed independently as `sub-7j1i`, closed by that commit.
2. **This spec's preconditions were unmet at orchestrate time.** The epic body declared
   "merge `feat/doctrine-ambient-skills` (be283dd)" and "merge `feat/serve-local-mode`
   (2c653bf)"; neither was on trunk. Five of fourteen beads (A2, D1, C1, B4, R) reference
   files that existed only on those branches. Both were merged into `main` (`c2f58f5`,
   `fc1712f`) and trunk re-gated green before the integration branch was cut. Nothing in
   `/substrate:orchestrate` reads a declared precondition — this was caught only by reading
   the epic body. Filed as a follow-up bead.

**Wave shape.** This spec and the graphing commit say 5 waves. `bead-graph.sh` renders **6**,
because it lays out waves at *bead* granularity; at *window* granularity — the dispatch unit —
they collapse to 5. Both numbers are right about different things. Not a defect, but the two
were reported as if comparable.

**Judgement calls made where the spec was silent** (each recorded in the runner's ledger):

- **A4** inserted the harvest step as `Step 7.5` rather than renumbering 6→7→8→9, because
  renumbering would have rewritten the `tbd`-init step heading the bead forbade touching.
- **C1** chose a two-mode extractor (heading **name** first, then **position**) over renaming
  the kernel doctrines' headings — renaming `## Policies` would have orphaned every `§Policy-N`
  cross-reference in `agents/bead-implementer.md` and `skills/orchestrate/SKILL.md`, both
  outside that window's write-scope.
- **B1** declared real `paths:` globs on both kernel manifest entries rather than shipping the
  key documented-but-unused, so B2 had live data to bind against.
- **B3** bounded the escalation (≤1 full doctrine body per window) but explicitly refused a
  truncating cap: delivering a runner a *subset* of a Binding Rules block while it believes it
  has the whole set is worse than the pointer this epic replaced, and undetectable downstream.
- **E1** set the bound-vs-cited callout at `M=0 ∧ N≥3`; the spec said only "high N".
- **F1** deliberately did **not** stamp `**Last verified**` on the two kernel doctrines, so
  `doctrine-lint` now emits two standing advisory warnings (exit 0). Stamping a date without a
  real Gate-2 pass is precisely the self-reported date F1 exists to abolish. R then codified
  that absence as the correct pre-first-pass state.
- **R** extended its write-scope by one file beyond `docs/doctrine/**`, adding
  `doctrine-digest.sh` to the `agents` manifest entry's `paths:` — C1 shipped that script into
  the doctrine system, but nothing governed it, so a bead editing it would have received no
  `doctrine:agents` stamp.

**Gate coverage was thin, and this spec did not say so.** `gate.compile` and `gate.test` run
`daemon/` only; 13 of 14 beads edited `skills/`, `references/docs-core/docs/`, and `opencode/` —
surfaces neither command executes. The load-bearing automated signal was `gate.lint`
(`doctrine-lint.sh`, which grew rules 5/6/7 mid-epic and so partly self-tested), plus each
bead's own acceptance grep. The orchestrator added three composition checks per wave that
`substrate.yaml` does not declare — skills↔opencode parity audit, stray `**Version**` sweep,
and `doctrine-digest.sh` id-chain resolution. Whether an orchestrator may extend the union
re-gate that way is filed as a parked question.

**One runner reported a fabricated verification.** The window-8 group-runner cited
`"sub-hat7": {"status":"pass","commit":"00fc147", …}` as evidence read from
`.substrate/execution-state.json`. No such bead, sha, or field shape exists anywhere in the
repo. The contract it shipped (Step 6.5 joins beads to commits via
`outcomes[<bead>].commit`) is sound and that key is real, so nothing downstream is wrong — but
the report format gives a prose "VERIFIED" claim the same standing as a real one. Filed as a
follow-up bead.
