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

### Phase N: Doctrine Review

<!--
This phase is MANDATORY. It ensures learnings from implementation
feed back into the doctrine system (living documentation).
-->

#### Step N.1: Review Implementation Against Doctrines

Review all code written in this spec against the doctrines that were loaded.

Check the doctrine manifest at `docs/doctrine/doctrine-manifest.yaml` to identify which doctrines applied to this spec based on trigger keywords.

For each relevant doctrine, answer these questions:

1. **Compliance**: Did we follow all MUST/MUST NOT rules?
   - If NO: Document the violation and why it was necessary

2. **New Patterns**: Did we discover patterns that should become doctrine?
   - If YES: Document the pattern with rationale

3. **Outdated Rules**: Did we find doctrine that is wrong or outdated?
   - If YES: Document what's wrong and the correction

4. **Missing Coverage**: Did we encounter scenarios doctrine doesn't address?
   - If YES: Document the gap

If ANY amendments are needed, capture them in this standard shape:

```markdown
# Doctrine Amendments: <Feature>

## Compliance Violations
- [doctrine]: [rule violated] - [justification]

## New Patterns to Add
- [doctrine]: [pattern] - [rationale]

## Outdated Rules to Update
- [doctrine]: [current rule] → [proposed update]

## Missing Coverage
- [doctrine]: [scenario not covered]
```

If no amendments are needed, this step passes automatically.

**Where the amendments go is tracker-dependent** — resolve the bead-tracker exactly as `/substrate:synthesize-session` does (honor `.substrate/config.json`'s `"bead-tracker"` if set; else auto-detect `tbd` when `.tbd/config.yml` exists AND a `tbd` binary is callable — `command -v tbd` OR `npx --no-install get-tbd --version` — else `none`):

- **`bead-tracker: none`** — the `.md` is the queue. Write the amendments to `docs/tasks/ongoing/<feature>/doctrine-amendments.md`. This is canonical.
- **`bead-tracker: tbd`** — **do NOT write any markdown under `docs/tasks/ongoing/**`** (the working tree is not a source of truth in a tbd repo), and **do NOT call `tbd` from inside this phase**. When this phase runs under `/substrate:orchestrate` it is a bead executed by a group-runner, which is forbidden from touching the tracker (single-writer stays with the orchestrator). Instead, **emit the amendment findings in this phase's completion report** and defer the actual queuing to `/substrate:synthesize-session` Step 5 — the depth-0, single-writer, tracker-aware sink that renders each amendment to an ephemeral tempfile → `tbd create --type doctrine-amendment` (`status: queued`) → unlink. This keeps amendments off the working tree and out of the group-runner's hands while preserving them for human triage.

##### Verify

- `bead-tracker: none` → `test -f docs/tasks/ongoing/<feature>/doctrine-amendments.md && echo "Amendments documented" || echo "No amendments needed"`
- `bead-tracker: tbd` → `echo "Doctrine review complete — amendments (if any) reported for /substrate:synthesize-session to queue as type=doctrine-amendment beads"`

#### Step N.2: Route Doctrine Amendments for Human Review (if any)

Only relevant when `bead-tracker: none`. If `docs/tasks/ongoing/<feature>/doctrine-amendments.md` exists, promote it to the shared review queue so it survives spec archival:

```bash
mkdir -p docs/tasks/ongoing/doctrine-updates
cp docs/tasks/ongoing/<feature>/doctrine-amendments.md \
   docs/tasks/ongoing/doctrine-updates/<feature>-amendments.md
```

Under `bead-tracker: tbd` this step is a **no-op** — the amendments are queued as `type: doctrine-amendment` beads by `/substrate:synthesize-session`, not as files. Do not create `docs/tasks/ongoing/doctrine-updates/` in a tbd repo.

##### Verify

- `bead-tracker: none` → `ls docs/tasks/ongoing/doctrine-updates/ 2>/dev/null || echo "No doctrine updates pending"`
- `bead-tracker: tbd` → `echo "Amendments deferred to synthesize-session (tbd is canonical — no working-tree files)"`

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
