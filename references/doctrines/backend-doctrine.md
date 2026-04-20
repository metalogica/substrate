# Substrate Backend Doctrine

**Version**: 1.0.0
**Status**: Binding
**Date**: 2026-04-20

---

## 1. Authority

This document is **Binding**. Violations are architectural bugs.

Keywords MUST, MUST NOT, SHOULD, MAY follow RFC 2119.

**Reference Implementation**: `convex/`

**Sibling doctrines**: [domain-doctrine.md](./domain-doctrine.md), [frontend-doctrine.md](./frontend-doctrine.md)

**Stack**: Convex (database + server functions + realtime) + Clerk (auth via JWT).

---

## 2. Layer Architecture

```
┌──────────────────────────────────────────────────────────┐
│                  Convex Backend Layer                     │
├──────────────────────────────────────────────────────────┤
│                                                           │
│  ┌─────────────────────────────────────────────────────┐ │
│  │              Schema (convex/schema.ts)               │ │
│  │  Single source of truth for persisted data types    │ │
│  └────────────────────────┬────────────────────────────┘ │
│                           │                               │
│  ┌────────────────────────▼────────────────────────────┐ │
│  │                Server Functions                      │ │
│  │  ┌──────────┐   ┌────────────┐   ┌──────────────┐   │ │
│  │  │ queries  │   │ mutations  │   │   actions    │   │ │
│  │  │(reactive │   │(writes,    │   │(side effects,│   │ │
│  │  │ reads)   │   │ txnl)      │   │external HTTP)│   │ │
│  │  └────┬─────┘   └─────┬──────┘   └──────┬───────┘   │ │
│  │       │               │                  │           │ │
│  │       └───────────────┼──────────────────┘           │ │
│  │                       ▼                               │ │
│  │  ┌──────────────────────────────────────────────┐    │ │
│  │  │        Args Validators (convex/values `v`)   │    │ │
│  │  └──────────────────────────────────────────────┘    │ │
│  │                       │                               │ │
│  │                       ▼                               │ │
│  │  ┌──────────────────────────────────────────────┐    │ │
│  │  │    Auth Guard (requireAuth via Clerk JWT)    │    │ │
│  │  └──────────────────────────────────────────────┘    │ │
│  └──────────────────────┬───────────────────────────────┘ │
│                         │                                  │
│  ┌──────────────────────▼───────────────────────────────┐ │
│  │               Domain (imported from @domain/*)        │ │
│  │  Pure validation, calculations, decisions             │ │
│  └───────────────────────────────────────────────────────┘ │
│                                                            │
└──────────────────────────────────────────────────────────┘
```

### 2.1 Function Kinds

| Kind | Purpose | Side Effects | Example |
|------|---------|--------------|---------|
| `query` | Reactive reads. Client subscribes. | None — MUST be deterministic | `getUser`, `listPosts` |
| `mutation` | Transactional writes. | Writes to Convex DB only | `createPost`, `updateProfile` |
| `action` | External I/O (HTTP, SDK calls, AI). | Any side effect | `sendEmail`, `callLLM` |

Rules:
- Queries MUST NOT write. If you need to write while reading, call a mutation from an action.
- Mutations MUST NOT call external HTTP. Move those calls to an action.
- Actions MAY call queries and mutations via `ctx.runQuery` / `ctx.runMutation`.

### 2.2 Import Rules

| Layer | MUST NOT import | MAY import |
|-------|-----------------|------------|
| `convex/*` | React, Vite, UI libraries | `@domain/*`, `convex/_generated/*`, Convex SDK, Clerk server SDK |
| `domain/*` | `convex/*` (reverse dependency forbidden) | `domain/shared/*` only |

The domain is a dependency of the backend, never the other way around.

---

## 3. Structural Conventions

### 3.1 Directory Layout

```
convex/
├── schema.ts                # Tables, indexes, validators
├── auth.config.ts           # Clerk JWT issuer domain + application ID
├── http.ts                  # HTTP actions (webhooks, OAuth callbacks)
├── _lib/
│   ├── auth.ts              # requireAuth(ctx) → identity + user record
│   └── errors.ts            # Result → ConvexError translation
│
├── users.ts                 # user queries/mutations
├── {feature-a}.ts           # feature A's queries/mutations/actions
├── {feature-b}.ts           # feature B's queries/mutations/actions
└── _generated/              # Auto-generated; never edit by hand
```

One file per feature. Each file exports the queries, mutations, and actions for that feature.

### 3.2 Naming Conventions

| Object | Pattern | Example |
|--------|---------|---------|
| Convex file | `kebab-case.ts` | `users.ts`, `posts.ts` |
| Query | `verbNoun` | `getUser`, `listPostsByAuthor` |
| Mutation | `verbNoun` | `createPost`, `updateProfile` |
| Action | `verbNoun` | `sendInviteEmail`, `callOpenAI` |
| Schema table | `camelCase` plural | `users`, `posts`, `invitations` |
| Internal helper | `internalQuery` / `internalMutation` / `internalAction` | see §4.5 |

Internal-only helpers MUST use the `internal*` constructors so they are not exposed to the client.

---

## 4. Core Patterns

### 4.1 Schema Definition

```typescript
// convex/schema.ts

import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  users: defineTable({
    clerkId: v.string(),          // sub claim from Clerk JWT
    email: v.string(),
    handle: v.string(),
    createdAt: v.number(),
  })
    .index("by_clerk_id", ["clerkId"])
    .index("by_handle", ["handle"]),

  posts: defineTable({
    authorId: v.id("users"),
    title: v.string(),
    body: v.string(),
    publishedAt: v.optional(v.number()),
  })
    .index("by_author", ["authorId"]),
});
```

Rules:
- MUST use `v.*` validators for every field (no `any`).
- MUST declare an index for every query filter pattern. A query that filters without an index is a bug.
- MUST index the Clerk `clerkId` on the `users` table for auth lookups.
- SHOULD use `v.id("table")` for references, not `v.string()`.

### 4.2 Auth Pattern (Clerk → Convex)

```typescript
// convex/auth.config.ts
export default {
  providers: [
    {
      domain: process.env.CLERK_JWT_ISSUER_DOMAIN!,
      applicationID: "convex",
    },
  ],
};
```

```typescript
// convex/_lib/auth.ts

import type { QueryCtx, MutationCtx } from "../_generated/server";

export async function requireAuth(ctx: QueryCtx | MutationCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error("Unauthenticated");

  const user = await ctx.db
    .query("users")
    .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
    .unique();

  if (!user) throw new Error("User record missing; sign out and back in");

  return { identity, user };
}
```

Rules:
- Every non-public mutation and query MUST start with `const { user } = await requireAuth(ctx);`.
- MUST NOT trust `identity.subject` as a user id — always look up the `users` row.
- Publicly readable queries MUST have "public" in their name (`getPublicProfile`) and MUST NOT call `requireAuth`.

### 4.3 Query Pattern

```typescript
// convex/posts.ts

import { query } from "./_generated/server";
import { requireAuth } from "./_lib/auth";

export const listMyPosts = query({
  args: {},
  handler: async (ctx) => {
    const { user } = await requireAuth(ctx);
    return await ctx.db
      .query("posts")
      .withIndex("by_author", (q) => q.eq("authorId", user._id))
      .order("desc")
      .collect();
  },
});
```

Rules:
- MUST declare `args` via `v.*` validators (use `{}` for no args).
- MUST use an index for any `filter` / `withIndex` clause.
- MUST return plain Convex documents. No DTOs, no mapping layer.
- SHOULD stay thin. If logic grows complex, extract decisions to `domain/`.

### 4.4 Mutation Pattern

```typescript
// convex/posts.ts

import { mutation } from "./_generated/server";
import { v } from "convex/values";
import { requireAuth } from "./_lib/auth";
import { validateTitle } from "@domain/post-rules";

export const createPost = mutation({
  args: {
    title: v.string(),
    body: v.string(),
  },
  handler: async (ctx, { title, body }) => {
    const { user } = await requireAuth(ctx);

    const validation = validateTitle({ title });
    if (validation.isErr()) {
      throw new Error(validation.error.reason);
    }

    return await ctx.db.insert("posts", {
      authorId: user._id,
      title,
      body,
    });
  },
});
```

Rules:
- MUST validate args via `domain/` functions before writing.
- MUST be transactional — all writes in a mutation succeed together or roll back.
- MUST NOT call external HTTP from a mutation. Use an action.
- `Result<T, E>` from domain functions MUST be translated to `throw new Error(...)` (or `ConvexError`) at this boundary — Convex mutations signal failure via exceptions.

### 4.5 Action Pattern

```typescript
// convex/users.ts

import { action, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";

export const getById = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => ctx.db.get(userId),
});

export const sendWelcomeEmail = action({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    const user = await ctx.runQuery(internal.users.getById, { userId });
    if (!user) return;

    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "team@example.com",
        to: user.email,
        subject: "Welcome",
        html: "<p>...</p>",
      }),
    });
  },
});
```

Rules:
- Actions MAY call `fetch`, third-party SDKs, AI APIs.
- Actions MUST NOT write to `ctx.db` directly — route through a mutation via `ctx.runMutation`.
- Actions MAY read via `ctx.runQuery`.
- Secrets MUST be read from `process.env.*`, never hardcoded, never committed.

### 4.6 Args Validation

```typescript
import { v } from "convex/values";

args: {
  email: v.string(),
  role: v.union(v.literal("admin"), v.literal("member")),
  tags: v.array(v.string()),
  avatar: v.optional(v.string()),
}
```

Rules:
- MUST use `v.*` for every arg (no `any`).
- MUST use `v.union(v.literal(...), ...)` for enums — never a raw `v.string()`.
- MUST use `v.optional(...)` for nullable args (not `v.union(T, v.null())`).

---

## 5. Operational Rules

- MUST NOT use client-side caches. Convex subscriptions ARE the cache.
- MUST NOT poll. Queries are reactive — clients see updates automatically.
- MUST NOT expose internal-only functions to the client. Use `internalQuery` / `internalMutation` / `internalAction`.
- MUST keep mutations under 100 lines. Extract logic to `domain/` when they grow.
- Secrets (API keys, Clerk signing keys) MUST be set via `npx convex env set` — never committed.

---

## 6. Trust Boundaries

| Boundary | Enforcement |
|----------|-------------|
| Client → Convex | Every Convex function validates auth via `requireAuth`. Client-side guards are UX only. |
| Clerk JWT → Convex identity | `ctx.auth.getUserIdentity()` validates signature + expiry via `auth.config.ts`. |
| User input → Mutation | `v.*` validators enforce types. `domain/` functions enforce business rules. |
| Mutation → External API | Mutations MUST NOT call external APIs — use actions. |
| Action → Database | Actions MUST NOT write to `ctx.db` — route through a mutation. |

---

## 7. Testing Expectations

| Test Type | Tool | Focus |
|-----------|------|-------|
| Domain functions called from Convex | Vitest (direct) | Pure logic, validation |
| Convex queries/mutations | `convex-test` | Auth guards, schema enforcement, read/write correctness |
| Actions | Mocked `fetch` | Retry, error handling, state transitions |
| End-to-end | Playwright (frontend) | Real Clerk JWT + real Convex dev deployment |

### 7.1 Test Pattern

```typescript
// test/integration/convex/posts.test.ts
import { convexTest } from "convex-test";
import { describe, it, expect } from "vitest";
import schema from "@convex/schema";
import { api } from "@convex/_generated/api";

describe("createPost", () => {
  it("rejects empty title", async () => {
    const t = convexTest(schema);
    await t.run(async (ctx) => {
      await ctx.db.insert("users", {
        clerkId: "user_1",
        email: "a@b.co",
        handle: "alice",
        createdAt: Date.now(),
      });
    });

    await expect(
      t.withIdentity({ subject: "user_1" })
        .mutation(api.posts.createPost, { title: "", body: "x" })
    ).rejects.toThrow();
  });
});
```

---

## 8. Change Protocol

### Adding a New Table

1. Add to `convex/schema.ts` with `v.*` validators.
2. Add required indexes.
3. Create `convex/{table-name}.ts` with initial queries/mutations.
4. Run `npx convex dev` to sync schema.

### Adding a New Mutation

1. Place in the feature file (`convex/posts.ts`, not a new file).
2. Start with `requireAuth(ctx)` unless explicitly public.
3. Validate args with domain functions BEFORE writing.
4. Add a `convex-test` case for the happy path + one for an auth failure.

### Changes Requiring Security Review

- New public (non-authed) queries or mutations.
- Modifications to `requireAuth` or `auth.config.ts`.
- New secrets / environment variables.
- New HTTP actions with external side effects.
