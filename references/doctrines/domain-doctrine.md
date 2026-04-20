# Substrate Domain Doctrine

**Version**: 1.0.0
**Status**: Binding
**Date**: 2026-04-20

---

## 1. Authority

This document is **Binding**. Violations are architectural bugs.

Keywords MUST, MUST NOT, SHOULD, MAY follow RFC 2119.

**Reference Implementation**: `domain/`

**Sibling doctrines**: [backend-doctrine.md](./backend-doctrine.md), [frontend-doctrine.md](./frontend-doctrine.md)

---

## 2. Layer Architecture

The domain layer is pure TypeScript. It owns the business vocabulary, invariants, and decisions that MUST hold regardless of how the application is presented or persisted.

```
┌─────────────────────────────────────────────────────┐
│                    Domain Layer                      │
├─────────────────────────────────────────────────────┤
│                                                      │
│  Pure Domain                                         │
│  ┌──────────────┐ ┌───────────────┐ ┌─────────────┐ │
│  │ Value Objects│ │ Domain Services│ │ Pure Fns    │ │
│  │ (immutable)  │ │ (stateless ops)│ │ (decisions) │ │
│  └──────┬───────┘ └───────┬────────┘ └──────┬──────┘ │
│         │                 │                 │         │
│         └─────────┬───────┘                 │         │
│                   ▼                         ▼         │
│  ┌──────────────────────────────────────────────┐    │
│  │                 Shared Kernel                 │    │
│  │  ┌─────────────┐  ┌──────────────────────┐  │    │
│  │  │   Result    │  │   Brand (type tag)   │  │    │
│  │  │  (ok / err) │  │                       │  │    │
│  │  └─────────────┘  └──────────────────────┘  │    │
│  └──────────────────────────────────────────────┘    │
│                                                      │
└─────────────────────────────────────────────────────┘
```

### 2.1 Import Rules

| Layer | MUST NOT import | MAY import |
|-------|-----------------|------------|
| `domain/*` | `convex/*`, `react`, any infra/framework, any npm library | `domain/shared/*` only |
| `domain/shared/*` | everything external | nothing (leaf) |

### 2.2 Boundary Rules

- Domain layer MUST NOT import anything external (no React, Convex, HTTP clients, databases).
- Domain layer MUST NOT have side effects (no I/O, no timers, no randomness, no `new Date()`).
- Domain layer MUST be synchronously testable (no `async`/`await` in pure functions).
- `domain/shared/` is the ONLY cross-cutting module permitted.

---

## 3. Structural Conventions

### 3.1 Directory Layout

```
domain/
├── shared/
│   ├── result.ts            # Result<T, E> + ok/err factories
│   └── types.ts             # Brand<K, T> utility
│
├── {concept-a}.ts           # Value objects / services for concept A
├── {concept-b}.ts           # Value objects / services for concept B
└── ...
```

Flat layout by default. Group a concept into its own subdirectory ONLY when it spans four or more files.

### 3.2 Naming Conventions

| Object | Pattern | Example |
|--------|---------|---------|
| Value object class | `{Concept}` or `{Concept}Identity` | `UserIdentity`, `Money` |
| Domain service fn | `verbNoun` | `buildInvitationLink`, `calculateFee` |
| Pure factory fn | `verbNoun` | `generateSlug`, `parseOrderRef` |
| Pure decision fn | `verbNoun` / `isX` / `canX` | `isEligible`, `canPublish`, `validateAddress` |
| Type alias | `PascalCase` | `PlanTier`, `OrderStatus` |
| Constants | `UPPER_SNAKE_CASE` | `MAX_ITEMS`, `DEFAULT_CURRENCY` |
| Files | `kebab-case.ts` | `user-identity.ts`, `invitation-link.ts` |

### 3.3 No Barrel Exports

MUST NOT use `index.ts` barrel exports. Import specific files directly:

```typescript
// Correct
import { UserIdentity } from "@domain/user-identity";
import { calculateFee } from "@domain/pricing";

// Forbidden
import { UserIdentity, calculateFee } from "@domain";
```

Rationale: explicit imports keep dependency graphs legible and prevent accidental coupling.

---

## 4. Core Patterns

### 4.1 Value Object

Value objects encapsulate a concept with no identity beyond their values. They are immutable and deterministic.

```typescript
// domain/user-identity.ts

export class UserIdentity {
  readonly userId: string;
  readonly handle: string;
  readonly displayName: string;

  constructor({ userId, handle }: { userId: string; handle: string }) {
    this.userId = userId;
    this.handle = handle.toLowerCase();
    this.displayName = `@${this.handle}`;
  }
}
```

Rules:
- MUST use `readonly` for all fields.
- MUST derive all values deterministically from constructor params.
- MUST NOT have methods that mutate state.
- SHOULD compute derived values in the constructor (not lazily).

Rationale: a value object is the single source of truth for derivation rules; change the rule here, change it everywhere.

### 4.2 Domain Service (Pure Function)

Domain services are pure functions that perform domain transformations. They own business rules but have no identity or lifecycle.

```typescript
// domain/pricing.ts

export type PlanTier = "free" | "pro" | "team";

const PLAN_PRICES: Record<PlanTier, number> = {
  free: 0,
  pro: 12,
  team: 40,
};

export function getPrice({ tier }: { tier: PlanTier }): number {
  return PLAN_PRICES[tier];
}

export function calculateAnnualDiscount({
  tier,
  months,
}: {
  tier: PlanTier;
  months: number;
}): number {
  if (months < 12) return 0;
  return Math.round(PLAN_PRICES[tier] * 12 * 0.2);
}
```

Rules:
- MUST be pure (no side effects, no I/O).
- MUST use object parameters with destructuring (no positional args).
- MUST return new values (never mutate inputs).
- SHOULD co-locate related functions and types in one file.

### 4.3 Result Pattern (Railway-Oriented)

All fallible domain operations MUST return `Result<T, E>` rather than throwing.

```typescript
// domain/shared/result.ts — scaffolded by substrate-init

export type Result<T, E> = Ok<T> | Err<E>;

export interface Ok<T> {
  readonly _tag: "Ok";
  readonly value: T;
  isOk(): this is Ok<T>;
  isErr(): this is Err<never>;
  map<U>(fn: (value: T) => U): Result<U, never>;
  flatMap<U, E2>(fn: (value: T) => Result<U, E2>): Result<U, E2>;
  unwrapOr(defaultValue: T): T;
}

export interface Err<E> {
  readonly _tag: "Err";
  readonly error: E;
  isOk(): this is Ok<never>;
  isErr(): this is Err<E>;
  map<U>(fn: (value: never) => U): Result<U, E>;
  flatMap<U, E2>(fn: (value: never) => Result<U, E2>): Result<never, E>;
  unwrapOr<T>(defaultValue: T): T;
}

export function ok<T>(value: T): Ok<T>;
export function err<E>(error: E): Err<E>;
```

Rules:
- MUST return `Result<T, E>` for any domain function that can fail.
- MUST use the `_tag` discriminant for type narrowing.
- MUST NOT `throw` from domain code — throws escape the railway.
- SHOULD compose with `.map()` / `.flatMap()` rather than nested `if (isOk())` checks.

Rationale: Rust-style explicit error handling. Failures are values; control flow stays linear. Bypassing `Result` to throw breaks the contract callers rely on.

### 4.4 Brand Type

Nominally-typed primitives prevent accidental substitution across contexts.

```typescript
// domain/shared/types.ts

export type Brand<K, T> = K & { readonly __brand: T };

// Usage in a domain file:
export type UserId = Brand<string, "UserId">;
export type OrderId = Brand<string, "OrderId">;

export function asUserId(raw: string): UserId {
  return raw as UserId;
}
```

Rules:
- Use `Brand<string, "X">` for identifiers that MUST NOT cross contexts (passing a `UserId` where an `OrderId` is expected should be a compile error).
- Provide a named casting factory per brand (`asUserId`, `asOrderId`).
- MUST NOT `as` a raw string directly at call sites; cast via the factory.

### 4.5 Domain Error Pattern

Domain errors MUST be tagged unions with a `_tag` discriminant and stable reason codes.

```typescript
// domain/shared/errors.ts (create when the first domain error appears)

export type DomainError =
  | { readonly _tag: "ValidationError"; readonly field: string; readonly reason: string }
  | { readonly _tag: "NotFoundError"; readonly resource: string; readonly id: string }
  | { readonly _tag: "InvariantViolation"; readonly invariant: string };

export function validationError(field: string, reason: string): DomainError {
  return { _tag: "ValidationError", field, reason };
}
export function notFoundError(resource: string, id: string): DomainError {
  return { _tag: "NotFoundError", resource, id };
}
```

Rules:
- MUST use `_tag` discriminant for narrowing.
- SHOULD prefer tagged unions over a class hierarchy.
- MUST NOT include user-facing message strings in domain errors — translate at the adapter layer (Convex mutation, React toast).

---

## 5. Operational Rules

- MUST NOT use `any`. Use `unknown` with narrowing at boundaries.
- MUST NOT use `new Date()`, `Math.random()`, or any source of non-determinism inside domain code. Inject time/randomness as parameters when needed.
- MUST use `readonly` on value-object fields and on array collections (`readonly T[]` or `ReadonlyArray<T>`).
- MUST NOT import external libraries in the domain layer. Not `luxon`, `zod`, `date-fns`, or any other npm dependency. Only primitive TypeScript.
- SHOULD keep files under 300 lines. Split by concept when a file grows past that.

---

## 6. Trust Boundaries

| Boundary | Enforcement |
|----------|-------------|
| Raw data → Value Object | Constructor validates shape; fields are `readonly` |
| Domain → Infrastructure | Domain exports types + pure functions. Infrastructure imports domain, never the reverse. |
| Shared Kernel isolation | `domain/shared/*` is a leaf — imports nothing |

---

## 7. When to Extract to Domain

Extract code to `domain/` when it meets ANY of these criteria:

1. **Shared across layers**: used by both Convex functions AND frontend hooks.
2. **Pure business logic**: pricing, naming, eligibility, validation.
3. **Safety-critical**: naming conventions, limits, money arithmetic.
4. **Independently testable**: benefits from unit tests without infrastructure mocks.

Do NOT extract:
- One-off helpers used in a single file.
- Infrastructure-specific logic (Convex schema types, Clerk JWT parsing).
- Anything requiring `async` or external state.

---

## 8. Testing Expectations

The domain layer carries the **base of the testing pyramid**. Domain tests MUST be the cheapest, fastest, and most numerous tests in the repo.

| Test Type | Location | Tool | Speed |
|-----------|----------|------|-------|
| Value object derivation | `test/unit/domain/` | Vitest | instant |
| Domain service behavior | `test/unit/domain/` | Vitest | instant |
| Result composition | `test/unit/domain/shared/` | Vitest | instant |

### 8.1 Test Pattern

```typescript
// test/unit/domain/pricing.test.ts

import { describe, it, expect } from "vitest";
import { calculateAnnualDiscount } from "@domain/pricing";

describe("calculateAnnualDiscount", () => {
  it("returns zero when months < 12", () => {
    expect(calculateAnnualDiscount({ tier: "pro", months: 6 })).toBe(0);
  });

  it("returns 20% of annual price when months >= 12", () => {
    // pro = $12/mo → 12*12*0.2 = 28.8 → rounded 29
    expect(calculateAnnualDiscount({ tier: "pro", months: 12 })).toBe(29);
  });
});
```

Rules:
- MUST test invariants, not implementations.
- MUST NOT mock anything inside domain tests (the domain has no dependencies to mock).
- SHOULD test edge cases (empty, zero, max values) explicitly.
- Coverage target: 100% of pure decision functions; 90%+ overall domain.

---

## 9. Change Protocol

### Adding a New Domain Concept

1. Create file: `domain/{concept-name}.ts`
2. Add value object / service / pure functions.
3. Add sibling test: `test/unit/domain/{concept-name}.test.ts`.
4. Run: `pnpm app:compile && pnpm app:test`.

### Changes Requiring Review

- New cross-concept dependencies (one domain file importing another).
- New brand types.
- Changes to `domain/shared/*` (affects the whole codebase).
- New error variants in `DomainError`.
