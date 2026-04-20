# Example Domain Logic Doctrine

**Version**: 2.12.0
**Status**: Binding
**Date**: 2026-04-09

---

## 1. Authority

This document is **Binding**. Violations are architectural bugs.

Keywords MUST, MUST NOT, SHOULD, MAY follow RFC 2119.

**Reference Implementation**: `domain/`

---

## 2. Layer Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Domain Layer                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                    Pure Domain                           │    │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐   │    │
│  │  │Value Objects │  │ Domain       │  │ Pure Fns     │   │    │
│  │  │(Identity)    │  │ Services     │  │ (Validation) │   │    │
│  │  └──────────────┘  └──────────────┘  └──────────────┘   │    │
│  └─────────────────────────────────────────────────────────┘    │
│                              │                                   │
│                              ▼                                   │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                    Shared Kernel                         │    │
│  │  ┌──────────────┐  ┌──────────────┐                     │    │
│  │  │   Result     │  │   Brand      │                     │    │
│  │  │  (ok/err)    │  │  (type tag)  │                     │    │
│  │  └──────────────┘  └──────────────┘                     │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 2.1 Import Rules

| Layer | MUST NOT import | MAY import |
|-------|-----------------|------------|
| `domain/*` | `convex/*`, `react`, `@kubernetes/*`, any external lib | `domain/shared/*` only |
| `domain/shared/*` | everything external | nothing (leaf) |

### 2.2 Boundary Rules

- Domain layer MUST NOT import anything external (no React, Convex, K8s client, infrastructure libs)
- Domain layer MUST NOT have side effects (no I/O, no timers, no randomness)
- Domain layer MUST be synchronously testable (no async in pure functions)
- Shared kernel (`domain/shared/`) is the ONLY allowed cross-cutting code

---

## 3. Structural Conventions

### 3.1 Directory Layout

```
domain/
├── shared/
│   ├── result.ts              # Result<T, E> type + ok/err factories
│   └── types.ts               # Brand type utility
│
├── claw-pod-identity.ts       # Value object: userId → K8s resource names, GATEWAY_PORT + WEBHOOK_PORT constants
├── claw-config.ts             # Domain service: config.toml rendering, tool policy (getExcludedTools), agent registry (AGENT_REGISTRY with audio_read, vision_read)
├── claw-workspace.ts          # Domain service: workspace file rendering (persona templates, memory, bootstrap, activeIntegrations, extractPersonaReady, multimedia routing in TOOLS.md)
├── media-constraints.ts       # Multimedia upload constraints: MIME validation (isAcceptedMediaType), agent routing (MIME_TO_AGENT), size limits, MIME normalization (normalizeMimeType)
├── email/                      # Email security + utility module (pure functions, importable by both CF Worker and Convex)
│   ├── address-generator.ts   # Agent email address generation (320 adjectives × 280 marine entities, generateAgentEmailCandidate)
│   ├── allowlist.ts           # Sender allowlist matching (matchesAllowlist: sender × entries → boolean)
│   ├── extract.ts             # Address parsing (extractAddress: "Name <addr>" → addr), R2 dead-letter key generation
│   ├── notification.ts        # Opaque notification formatting (formatNotification: count + url → relay text with zero email content)
│   ├── parse-auth-headers.ts  # DMARC/SPF/DKIM verdict extraction (parseAuthHeaders, isDmarcPass)
│   ├── sanitize.ts            # Read-time email body sanitization (sanitizeEmailContent: strip HTML comments, zero-width chars, hidden text, base64)
│   ├── threading.ts           # RFC 2822 email thread ID resolution (resolveEmailThreadId)
│   ├── trust.ts               # Trust decision (determineTrust: dmarcPass + allowlistMatch → trustLevel + quarantineReason)
│   ├── validate-allowlist.ts  # Allowlist pattern validation + risk scoring (validateAllowlistPattern: rejects *@gmail.com, warns on domain wildcards)
│   ├── verified-guard.ts      # Centralized access guard (filterVerifiedOnly, assertVerified: all email query results pass through this)
│   └── __tests__/             # Unit tests for all email domain functions (76 tests including adversarial sanitization cases)
├── schedule-limits.ts         # Plan-specific scheduling limits (maxActiveSchedules, minInterval, maxDaily)
├── telegram-validation.ts     # Bot token format validation, pairing code generation, deep link builder
└── user-errors.ts             # User-facing error messages for channel adapters and integrations (SUPPORT_EMAIL, agentError, agentTimeout, agentUnreachable, integrationAuthExpired, integrationNotConnected)
```

### 3.2 Naming Conventions

| Object | Pattern | Example |
|--------|---------|---------|
| Value object class | `{Concept}Identity` or `{Concept}` | `ClawPodIdentity` |
| Domain service fn | `verbNoun` | `buildConfigToml`, `getPlanLimits`, `buildWorkspaceFiles`, `extractPersonaReady`, `getExcludedTools` |
| Pure factory fn | `verbNoun` | `generatePairingCode`, `generateAgentEmailCandidate`, `resolveEmailThreadId`, `buildDeepLink`, `renderBootstrapTemplate` |
| Pure decision fn | `verbNoun` | `determineTrust`, `matchesAllowlist`, `validateAllowlistPattern`, `parseAuthHeaders`, `sanitizeEmailContent`, `filterVerifiedOnly`, `isAcceptedMediaType`, `normalizeMimeType` |
| Type alias | `PascalCase` | `Plan`, `ToolPolicy`, `PersonaSeed`, `WorkspaceFiles` |
| Constants | `UPPER_SNAKE_CASE` | `GATEWAY_PORT`, `WEBHOOK_PORT`, `PLAN_LIMITS`, `SCHEDULE_LIMITS`, `DEFAULT_COMMUNICATION_STYLE`, `SUPPORT_EMAIL`, `EMAIL_DOMAIN`, `ADJECTIVES`, `MARINE_ENTITIES`, `MEDIA_CONSTRAINTS`, `MIME_TO_AGENT`, `MIME_TO_EXTENSION`, `MIME_ALIASES` |
| Files | `kebab-case.ts` | `claw-pod-identity.ts`, `claw-config.ts` |

### 3.3 No Barrel Exports

MUST NOT use `index.ts` barrel exports. Import specific files directly:

```typescript
// Correct
import { ClawPodIdentity } from "@domain/claw-pod-identity";
import { buildConfigToml } from "@domain/claw-config";

// Forbidden
import { ClawPodIdentity, buildConfigToml } from "@domain";
```

---

## 4. Core Patterns

### 4.1 Value Object Pattern

Value objects encapsulate a concept with no identity beyond their values. They are immutable and deterministic.

```typescript
// domain/claw-pod-identity.ts

const GATEWAY_PORT = 42617;
const WEBHOOK_PORT = 42618;

export class ClawPodIdentity {
  readonly configMapName: string;
  readonly deploymentName: string;
  readonly endpoint: string;
  readonly namespace: string;
  readonly networkPolicyName: string;
  readonly serviceName: string;
  readonly userId: string;

  constructor({ userId }: { userId: string }) {
    this.userId = userId;
    this.namespace = `claw-${userId}`;
    this.deploymentName = `claw-${userId}`;
    this.serviceName = `claw-${userId}-svc`;
    this.configMapName = `claw-${userId}-config`;
    this.networkPolicyName = `claw-${userId}-netpol`;
    this.endpoint = `http://${this.serviceName}.${this.namespace}.svc.cluster.local:${GATEWAY_PORT}`;
  }
}

export { GATEWAY_PORT, WEBHOOK_PORT };
```

Rules:
- MUST use `readonly` for all fields (immutability)
- MUST derive all values deterministically from constructor params
- MUST NOT have methods that mutate state
- SHOULD compute derived values in constructor (not lazily)
- Rationale: Single source of truth for naming conventions; change it here, change it everywhere

**Note:** `ClawPodIdentity.endpoint` computes a cluster-internal address (`svc.cluster.local`). In production, `provisionUser` in `clients/gke.ts` overrides this with the external LoadBalancer IP, since Convex Cloud cannot reach cluster-internal DNS. The domain value object remains pure (no infrastructure awareness).

### 4.2 Domain Service Pattern

Domain services are pure functions that perform domain-specific transformations. They own business rules but have no identity or lifecycle.

```typescript
// domain/claw-config.ts

export type Plan = "trial" | "byok" | "pro";

const PLAN_LIMITS: Record<Plan, PlanLimits> = {
  byok: { maxActionsPerHour: 50, maxCostPerDay: 10 },
  pro: { maxActionsPerHour: 100, maxCostPerDay: 25 },
  trial: { maxActionsPerHour: 10, maxCostPerDay: 1 },
};

export function getPlanLimits({ plan }: { plan: Plan }): PlanLimits {
  return PLAN_LIMITS[plan];
}

export function buildConfigToml({
  convexUrl,
  openRouterApiKey,
  preSharedToken,
  telegramBotToken,
  toolPolicy = "safe",
}: {
  convexUrl: string;
  openRouterApiKey: string;
  preSharedToken: string;
  telegramBotToken?: string;
  toolPolicy?: ToolPolicy;
}): string {
  const limits = getPlanLimits({ plan });
  // ... renders TOML string with [web_search], [identity], [http_request],
  //     non_cli_excluded_tools sections
  // Conditional: [channels_config] + [channels_config.telegram] when telegramBotToken is provided
}
```

Rules:
- MUST be pure functions (no side effects, no I/O)
- MUST use object parameters with destructuring
- MUST return new values (not mutate inputs)
- SHOULD co-locate related functions and types in one file
- Rationale: Testable domain logic separated from infrastructure plumbing

### 4.3 Result Pattern

```typescript
// domain/shared/result.ts

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

// Factory functions
export function ok<T>(value: T): Ok<T>;
export function err<E>(error: E): Err<E>;
```

Rules:
- MUST use `Result<T, E>` for fallible domain operations
- MUST use `_tag` discriminant for type narrowing
- MUST provide `isOk()` / `isErr()` type guards
- SHOULD use `map()` / `flatMap()` for composition
- Rationale: Railway-oriented programming; explicit error handling

```ts
// Result type for Railway Oriented Programming
// Based on Rust's Result<T, E> with functional composition methods

export type Result<T, E> = Ok<T> | Err<E>;

export interface Ok<T> {
  readonly _tag: 'Ok';
  readonly value: T;
  isOk(): this is Ok<T>;
  isErr(): this is Err<never>;
  map<U>(fn: (value: T) => U): Result<U, never>;
  flatMap<U, E2>(fn: (value: T) => Result<U, E2>): Result<U, E2>;
  unwrapOr(defaultValue: T): T;
}
export interface Err<E> {
  readonly _tag: 'Err';
  readonly error: E;
  isOk(): this is Ok<never>;
  isErr(): this is Err<E>;
  map<U>(fn: (value: never) => U): Result<U, E>;
  flatMap<U, E2>(fn: (value: never) => Result<U, E2>): Result<never, E>;
  unwrapOr<T>(defaultValue: T): T;
}

export function ok<T>(value: T): Ok<T> {
  return {
    _tag: 'Ok',
    value,
    isOk(): this is Ok<T> {
      return true;
    },
    isErr(): this is Err<never> {
      return false;
    },
    map: (fn) => ok(fn(value)),
    flatMap: (fn) => fn(value),
    unwrapOr: () => value,
  };
}

export function err<E>(error: E): Err<E> {
  return {
    _tag: 'Err',
    error,
    isOk(): this is Ok<never> {
      return false;
    },
    isErr(): this is Err<E> {
      return true;
    },
    map: <_U>() => err(error) as unknown as Result<_U, E>,
    flatMap: <_U, _E2>() => err(error) as unknown as Result<never, E>,
    unwrapOr: (defaultValue) => defaultValue,
  };
}

// Backward compatibility: Re-export DomainError from DomainError.ts
export type { DomainError } from './DomainError';

export { validationError } from './DomainError';

```

### 4.4 Brand Type Pattern

```typescript
// domain/shared/types.ts

export type Brand<K, T> = K & { __brand: T };
```

Rules:
- Use `Brand<string, "UserId">` to create nominally-typed primitives
- Prevents accidentally passing a `string` where a specific branded type is expected
- Rationale: Compile-time safety for domain identifiers

---

### 4.5 User-Facing Error Pattern

All error messages sent to end users via channel adapters (Telegram, etc.) MUST use `domain/user-errors.ts`. No inline error strings with support contact info.

```typescript
// domain/user-errors.ts

const SUPPORT_EMAIL = "help@clawcraft.ca";

// Pod returned non-200
export function agentError({ status }: { status: number }): string;
// Fetch timeout (120s)
export function agentTimeout(): string;
// Network/connection failure
export function agentUnreachable(): string;
```

Rules:
- MUST use `agentError`, `agentTimeout`, or `agentUnreachable` for relay error paths — never inline strings
- `SUPPORT_EMAIL` is the single source of truth for the support contact
- All messages MUST include the support suffix: `"If this keeps happening, reach out to support at {SUPPORT_EMAIL}"`
- Adding a new error type = add a new function to `user-errors.ts`, not an inline string in the relay

---

## 5. Operational Rules

- MUST NOT import external libraries in domain layer
- MUST NOT use `any` type (use `unknown` if needed)
- MUST NOT mutate state after construction (immutable by design)
- MUST use `readonly` on all value object fields
- SHOULD use `readonly` arrays for collections
- NEVER use `new Date()` or `Math.random()` (inject if needed)

---

## 6. Trust Boundaries

| Boundary | Enforcement |
|----------|-------------|
| Raw Data → Value Object | Constructor validates shape, fields are readonly |
| Domain → Infrastructure | Domain exports types + pure functions only. Infrastructure imports domain, never reverse. |
| Shared Kernel | Limited to `domain/shared/*` only |

---

## 7. When to Extract to Domain

Extract code to `domain/` when it meets ANY of these criteria:

1. **Shared across layers**: Used by both Convex actions and other modules
2. **Pure business logic**: Rules about plans, pricing, naming, config rendering
3. **Safety-critical**: Naming conventions, rate limits, where a bug means wrong resource targeted
4. **Independently testable**: Logic that benefits from unit tests without infrastructure mocks

Do NOT extract:
- One-off helpers used in a single file
- Infrastructure-specific logic (K8s API calls, GCP auth)
- Convex schema types (Convex schema is the source of truth for data types)

---

## 8. Testing Expectations

| Layer | Test Focus | Tool |
|-------|------------|------|
| Value objects | Deterministic derivation, all fields correct | Vitest |
| Domain services | Pure function behavior, edge cases | Vitest |
| Result utilities | ok/err creation, map/flatMap composition | Vitest |

### 8.1 Test Pattern

```typescript
describe("ClawPodIdentity", () => {
  it("should derive all resource names from userId", () => {
    const id = new ClawPodIdentity({ userId: "abc123" });

    expect(id.namespace).toBe("claw-abc123");
    expect(id.deploymentName).toBe("claw-abc123");
    expect(id.serviceName).toBe("claw-abc123-svc");
    expect(id.configMapName).toBe("claw-abc123-config");
    expect(id.networkPolicyName).toBe("claw-abc123-netpol");
  });
});

describe("buildConfigToml", () => {
  it("should apply plan limits", () => {
    const toml = buildConfigToml({
      convexUrl: "https://myapp-123.convex.cloud",
      openRouterApiKey: "sk-test",
      plan: "trial",
      preSharedToken: "tok-test",
    });

    expect(toml).toContain("max_actions_per_hour = 10");
    expect(toml).toContain("max_cost_per_day = 1");
  });
});
```

---

## 9. Change Protocol

### Adding a New Domain Concept

1. Create file: `domain/{concept-name}.ts`
2. Add types, value objects, or pure functions
3. Import from infrastructure layer as needed
4. Run: `pnpm app:compile`

### Security Review Required

- Any change to naming conventions (`ClawPodIdentity`)
- Any change to plan limits or config rendering
- Any new pure computation functions

---

## Document History

| Version | Date | Changes |
|---------|------|---------|
