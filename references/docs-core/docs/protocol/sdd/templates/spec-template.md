# <Feature>: Technical Specification

**Version**: 1.0.0
**Status**: Draft
**Author**: Architect Agent
**Date**: YYYY-MM-DD
**Brief**: `docs/tasks/ongoing/<feature>/<feature>-brief.md`

---

## 1. Overview

### 1.1 Objective

<What this feature accomplishes>

### 1.2 Constraints

- MUST: <inherited from brief>
- MUST NOT: <inherited from brief>

### 1.3 Success Criteria

- <Binary pass/fail criterion>

---

## 2. Scope

| In Scope | Out of Scope |
|----------|--------------|
| <Feature X> | <Feature Y> |

---

## 3. Architecture / Data Model

<Schema definitions, relationships, diagrams>

---

## 4. Implementation Details

### 4.1 Domain Layer

<Entities, factories, pure functions>

### 4.2 Backend Layer (Convex)

<Schema changes with `v.*` validators + indexes, queries/mutations/actions, `requireAuth` behavior, domain functions called for validation. See `docs/doctrine/backend-doctrine.md`.>

### 4.3 Frontend Layer

<Routes (TanStack Router), hooks (Convex/Clerk bridges), presentational components, styling via Tailwind v4. See `docs/doctrine/frontend-doctrine.md`.>

---

## 5. Error Handling

| Error | Cause | Handling |
|-------|-------|----------|
| <Error type> | <Trigger> | <Response> |

---

## 6. Testing Strategy

| Layer | Test Focus | Command |
|-------|------------|---------|
| Domain | Pure invariants, Result composition | `pnpm app:test test/unit/domain/<feature>` |
| Backend (Convex) | Auth guards, schema, queries/mutations via `convex-test` | `pnpm app:test test/integration/convex/<feature>` |
| Frontend | Components with Testing Library, hook wiring | `pnpm app:test test/unit/components/<feature>` |
| E2E | Full flow with Playwright + Clerk testing tokens | `pnpm app:test:e2e <feature>` |

---

## 7. Failure Modes (FMEA)

| # | Failure Mode | Severity | Mitigation |
|---|--------------|----------|------------|
| 1 | <What can go wrong> | Critical/High/Medium/Low | <Prevention> |

---

## 8. Prompt Execution Strategy

<!--
PROTOCOL: This section follows docs/protocol/sdd/execution-format.md
COMPLETENESS: Verify against docs/protocol/sdd/_SPEC-STANDARD.md §5 invariants
-->

### Phase 1: <Phase Name>

#### Step 1.1: <Step Title>

<Self-contained prompt for Claude Code CLI>

Include:
- Exact file paths
- Import patterns
- Code to create/modify
- Recovery guidance ("If X fails, do Y")

Tools to use: <Write/Edit/Bash>
Tools to NOT use: <Edit if file doesn't exist>

##### Verify

- `pnpm app:compile`
- `<additional verification>`

##### Timeout

120000

#### Step 1.2: <Step Title>

...

#### Gate

- `pnpm app:compile`
- `pnpm test:unit:ci`

### Phase 2: <Phase Name>

...

### Phase N: Doctrine Reconciliation

<!--
This phase is MANDATORY and TERMINAL. It runs against the fully integrated
feature and APPLIES the doctrine change the implementation earned — it does
not detect-and-punt. There is no amendment queue. The doctrine mutation lands
inside this epic's own diff, so feature + doctrine evolution are one
co-revertable unit and the change can never silently evaporate.
-->

This phase sees the **fully integrated feature** (every prior phase landed) and reconciles the doctrine tree with what the code actually did. It **applies** the change directly to `docs/doctrine/**` — no `doctrine-amendments.md`, no `type: doctrine-amendment` beads, no handoff to `/substrate:synthesize-session`.

#### Step N.1: Reconcile Doctrine Against the Integrated Feature (ratify-only)

Check the doctrine manifest at `docs/doctrine/doctrine-manifest.yaml` to identify which doctrines applied to this spec based on trigger keywords. Read the full integrated diff (this feature's tip vs. its integration base) and, for each relevant doctrine, decide what the *landed* code obliges the doctrine to say:

1. **New Patterns the code demonstrates** → promote to doctrine (Recommended Practice / Example).
2. **Outdated rules the code superseded** → relax or correct them to match.
3. **Missing coverage the code exemplifies** → add the scenario.

Then **edit the doctrine file(s) directly** to codify those. This is an ordinary working-tree change to `docs/doctrine/**` — a group-runner MAY make it in its worktree; it is **not** a tracker write.

**`ratify-only` — the binding rule for this terminal node.** The mutation may only **codify what this epic already did**: relax an outdated rule, promote a pattern the landed code demonstrates, add coverage the code exemplifies. It may **never** introduce a MUST / MUST-NOT that the just-landed code violates. Consequence: re-gating the integrated tip against the *mutated* doctrine is deterministically green. If reconciliation would require a **stricter** rule that invalidates shipped code, it is **out of scope for this node** — do not apply it here; leave it as follow-up for `/substrate:synthesize-session`. A red re-gate means the mutation was not ratify-only: revert it and defer.

If no doctrine change is earned, this step passes automatically (no-op) — most specs will change nothing.

**Single-writer invariant is preserved.** Under `/substrate:orchestrate` this phase is the epic's terminal graphed bead (`blocked-by` every other bead), run by a group-runner in its own worktree. The group-runner **edits `docs/doctrine/**` files** (ordinary code) but MUST NOT touch the tracker or push — the orchestrator stays the sole tracker/remote writer and merges + re-gates the node like any other. Under `/substrate:execute` (depth-0, attended) the executor applies the same mutation directly as its final step. The behavior is identical regardless of `bead-tracker` — the doctrine files are canonical either way; there is no tracker-dependent queue.

##### Verify

- Re-run this repo's gate (`substrate.yaml` → `gate.{compile,test,lint}`) on the integrated tip **after** the doctrine edit. Green ⟹ the mutation was ratify-only and lands with the feature. Red ⟹ not ratify-only; revert the doctrine edit and defer to `/substrate:synthesize-session`.
- `git diff --name-only <integration-base>..HEAD -- docs/doctrine/ | grep -q . && echo "Doctrine reconciled in-epic" || echo "No doctrine change earned"`

---

## 9. Operational Queries

### Status Check

```sql
-- Check <entity> state
SELECT ... FROM ... WHERE ...;
```

### Invariant Audit

```sql
-- Verify <invariant> (expected: 0 rows)
SELECT ... WHERE <violation condition>;
```

---

## 10. Spec Completeness Checklist

<!-- From docs/protocol/sdd/_SPEC-STANDARD.md §9 -->

### Semantic Completeness
- [ ] All data structures fully defined (no `...`)
- [ ] All terms defined or linked
- [ ] All state machines exhaustive
- [ ] Nullability explicit on all columns

### Verification Completeness
- [ ] Each phase has executable verification
- [ ] All invariants have audit queries
- [ ] Success criteria are binary

### Recovery Completeness
- [ ] FMEA table present
- [ ] Idempotency guaranteed
- [ ] Rollback procedures defined

### Context Completeness
- [ ] Brief linked
- [ ] Decision rationale captured
- [ ] Change log present

### Boundary Completeness
- [ ] Scope table present
- [ ] Auth requirements explicit
- [ ] External dependencies listed

---

## 11. Change Log

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | YYYY-MM-DD | Initial specification |

---

<!--
TEMPLATE LOCATION: docs/protocol/sdd/templates/spec-template.md

USAGE:
This template is generated by the architect-agent from a brief.
Manual use: Copy to docs/tasks/ongoing/<feature>/<feature>-spec.md

EXECUTION:
pnpm tsx scripts/orchestrate.ts docs/tasks/ongoing/<feature>/<feature>-spec.md

OPTIONS:
--dry-run     Parse and print plan
--from 2.3    Start from specific step
--fail-fast   Stop on first error
-->
