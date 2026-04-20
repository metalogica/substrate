# Example Backend Doctrine (Convex)

**Version**: 2.30.0
**Status**: Binding
**Author**: Architect Agent
**Date**: 2026-04-10
**App**: Clawcraft (Managed ZeroClaw Hosting Platform)

---

## 1. Authority

This document is **Binding**. Violations are architectural bugs.

Keywords MUST, MUST NOT, SHOULD, MAY follow RFC 2119.

Convex is the **sole backend**. There is no Express server, no API gateway, no separate REST layer. Convex queries, mutations, actions, and HTTP routes replace all traditional server responsibilities: auth, business logic, external API orchestration, webhooks, cron jobs, and real-time subscriptions.

**Reference Implementation**: `convex/`

---

## 2. Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Convex Cloud                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                       Tables                              │   │
│  │  users · messages · threads · usage_records · integrations │   │
│  │  telegram_identities · pairing_codes · container_events   │   │
│  │  personas · scheduled_tasks                               │   │
│  │  ~~memories~~ · ~~brain_memories~~ (STALE — pending removal) │   │
│  │  relay_logs · emails · email_dead_letters                 │   │
│  │  signup_codes · signup_code_activations · signup_policies │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                     Functions                             │   │
│  │  queries ─── read, real-time subscriptions                │   │
│  │  mutations ─ write, schedule actions                      │   │
│  │  actions ─── external APIs (GKE, Stripe, Google APIs)     │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                    HTTP Routes                            │   │
│  │  POST /container-webhook ── Container messages + Telegram  │   │
│  │   dispatch: (default) | pairing_request | telegram_message│   │
│  │   | sync_error | channel_response (!type && content)      │   │
│  │  POST /telegram-webhook ── Telegram inbound (webhook mode)│   │
│  │  POST/GET /api/schedules ── Durable scheduling (pod auth) │   │
│  │  POST/GET /api/memories ── STALE (pending removal)        │   │
│  │  POST /api/brain-memories/sync ── STALE (pending removal) │   │
│  │  POST /email-upload-url ── Convex storage URL (Worker auth)│   │
│  │  POST /email-webhook ── Inbound email from CF Worker     │   │
│  │  GET  /api/emails ── Agent inbox pull-path (pod auth)    │   │
│  │  GET  /api/media-url ── Signed download URL (pod auth)   │   │
│  │  POST /api/integration-status ── Auth error bridge        │   │
│  │  GET  /api/ws-auth ── WS gateway auth (session JWT)      │   │
│  │  (Stripe webhook deferred until billing is built)         │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                      Crons                                │   │
│  │  container health checks · usage aggregation              │   │
│  │  trial expiry · stale container cleanup                   │   │
│  │  scheduled task execution (1-min interval)                │   │
│  │  (idle-scale-down removed — always-on pod policy)         │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                   Auth (ctx.auth)                         │   │
│  │  Google OAuth via Convex Auth                             │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
        │              │                │
        ▼              ▼                ▼
   ┌─────────┐  ┌────────────┐  ┌───────────┐
   │ GKE     │  │ Stripe     │  │ Google    │
   │ Montreal│  │ (Billing)  │  │ (OAuth)   │
   └─────────┘  └────────────┘  └───────────┘
```

**Note:** LLM inference happens inside ZeroClaw pods via OpenRouter. Convex does NOT call LLM APIs directly.

### 2.1 What Convex Replaces

| Traditional Server Concern | Convex Equivalent |
|---|---|
| REST API endpoints | Queries + Mutations (type-safe, auto-generated client) |
| Webhook receivers | HTTP routes (`httpRouter`) |
| Background jobs | Actions scheduled via `ctx.scheduler.runAfter()` |
| Cron jobs | `crons.ts` declarative scheduling |
| WebSocket / real-time | Built-in — queries auto-update on data change |
| Auth middleware | `getAuthUserId(ctx)` via `@convex-dev/auth` on every function |
| Database ORM | `ctx.db` with schema-enforced types |
| Rate limiting | Convex built-in function limits + custom counters |
| Session management | Convex Auth handles token lifecycle |

---

## 3. Schema

```typescript
// convex/schema.ts
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  // ─── Users ───────────────────────────────────────
  users: defineTable({
    // Identity
    googleId: v.string(),
    email: v.string(),
    name: v.string(),
    avatarUrl: v.optional(v.string()),
    timezone: v.optional(v.string()),

    // Billing
    stripeCustomerId: v.optional(v.string()),
    subscriptionId: v.optional(v.string()),
    plan: v.union(
      v.literal("trial"),
      v.literal("pro"),
      v.literal("byok")
    ),
    planStatus: v.union(
      v.literal("trialing"),
      v.literal("active"),
      v.literal("past_due"),
      v.literal("canceled")
    ),
    trialEndsAt: v.optional(v.number()),

    // LLM (BYOK users supply their own OpenRouter key)
    llmApiKeyEncrypted: v.optional(v.string()),

    // Container lifecycle state
    containerStatus: v.union(
      v.literal("pending"),
      v.literal("provisioning"),
      v.literal("running"),
      v.literal("stopped"),
      v.literal("error")
    ),
    containerEndpoint: v.optional(v.string()),
    containerId: v.optional(v.string()),

    // K8s-level pod state (separate from containerStatus lifecycle)
    podState: v.union(
      v.literal("running"),
      v.literal("scaled_down"),
      v.literal("starting"),
      v.literal("error"),
      v.literal("not_found")
    ),

    // Pre-shared token for pod auth
    preSharedToken: v.string(),

    // Agent email address ("{adj}-{animal}@agent.clawcraft.ca")
    agentEmailAddress: v.optional(v.string()),

    // Activity tracking for idle timeout
    lastActivityAt: v.number(),

    // OAuth
    googleScopes: v.array(v.string()),
    googleRefreshToken: v.optional(v.string()),

    createdAt: v.number(),
    updatedAt: v.number(),

    // Account deletion tombstone
    deletedAt: v.optional(v.number()),

    // Signup code gating (alpha access control)
    signupCodeId: v.optional(v.id("signup_codes")),
  })
    .index("by_google_id", ["googleId"])
    .index("by_email", ["email"])
    .index("by_stripe_customer", ["stripeCustomerId"])
    .index("by_container_status", ["containerStatus"])
    .index("by_pod_state", ["podState"])
    .index("by_pre_shared_token", ["preSharedToken"])
    .index("by_agent_email_address", ["agentEmailAddress"])
    .index("by_deleted", ["deletedAt"]),

  // ─── Signup Codes (Alpha Access Control) ───────────
  signup_codes: defineTable({
    code: v.string(),               // 5-char confusable-free uppercase alphanumeric
    type: v.string(),               // "alpha", "campaign", "invite", etc.
    maxUses: v.number(),            // Positive integer
    isActive: v.boolean(),          // Kill switch for leaked/revoked codes
    createdAt: v.number(),
    expiresAt: v.number(),
  })
    .index("by_code", ["code"])
    .index("by_active", ["isActive"]),

  signup_code_activations: defineTable({
    signupCodeId: v.id("signup_codes"),
    userId: v.id("users"),
    createdAt: v.number(),
  })
    .index("by_code", ["signupCodeId"])
    .index("by_user", ["userId"]),

  signup_policies: defineTable({
    mode: v.string(),               // "OPEN" | "INVITE_CODE"
    enabled: v.boolean(),
    updatedAt: v.number(),
  })
    .index("by_mode", ["mode"]),

  // ─── Threads ─────────────────────────────────────
  threads: defineTable({
    userId: v.id("users"),
    title: v.string(),
    metadata: v.optional(v.object({
      templateId: v.optional(v.string()),
      templateName: v.optional(v.string()),
      environmentHint: v.optional(v.string()),
    })),
    isArchived: v.optional(v.boolean()),
    deletedAt: v.optional(v.number()),   // Soft delete — queries filter out
    lastMessageAt: v.number(),
    createdAt: v.number(),
  })
    .index("by_user", ["userId", "lastMessageAt"]),

  // ─── Messages ────────────────────────────────────
  messages: defineTable({
    userId: v.id("users"),
    threadId: v.optional(v.id("threads")),
    role: v.union(
      v.literal("user"),
      v.literal("assistant"),
      v.literal("system")
    ),
    content: v.string(),
    source: v.union(
      v.literal("container"),
      v.literal("system"),
      v.literal("telegram"),
      v.literal("webhook")
    ),
    metadata: v.optional(v.object({
      chatId: v.optional(v.string()),
      clientMessageId: v.optional(v.string()),
      platform: v.optional(v.string()),
      telegramMessageId: v.optional(v.number()),
      username: v.optional(v.string()),
    })),
    status: v.optional(v.union(
      v.literal("pending"),
      v.literal("delivered"),
      v.literal("failed")
    )),
    tokensUsed: v.optional(v.number()),
    model: v.optional(v.string()),
    latencyMs: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_user", ["userId", "createdAt"])
    .index("by_user_source", ["userId", "source"])
    .index("by_user_status", ["userId", "status"])
    .index("by_thread", ["threadId", "createdAt"]),

  // ─── Usage Records ──────────────────────────────
  usage_records: defineTable({
    userId: v.id("users"),
    date: v.string(),            // "2026-02-26" — daily bucket
    messagesCount: v.number(),
    tokensIn: v.number(),
    tokensOut: v.number(),
    llmCostCents: v.number(),
  })
    .index("by_user_date", ["userId", "date"]),

  // ─── Integrations ───────────────────────────────
  integrations: defineTable({
    userId: v.id("users"),
    provider: v.union(
      v.literal("calendly"),
      v.literal("email"),
      v.literal("gmail"),
      v.literal("google_calendar"),
      v.literal("google_docs"),
      v.literal("google_sheets"),
      v.literal("google_slides"),
      v.literal("linkedin"),
      v.literal("notion"),
      v.literal("telegram"),
      v.literal("web_scraping"),
      v.literal("whatsapp"),
    ),
    status: v.union(
      v.literal("disconnected"),
      v.literal("connecting"),
      v.literal("connected"),
      v.literal("error")
    ),
    config: v.optional(v.any()),
    connectedAt: v.optional(v.number()),
    lastError: v.optional(v.string()),
  })
    .index("by_user", ["userId"])
    .index("by_user_provider", ["userId", "provider"]),

  // ─── Pairing Codes ─────────────────────────────
  pairing_codes: defineTable({
    userId: v.id("users"),
    code: v.string(),
    role: v.union(v.literal("owner"), v.literal("collaborator")),
    expiresAt: v.number(),
    usedBy: v.optional(v.string()),
    usedAt: v.optional(v.number()),
  })
    .index("by_code", ["code"])
    .index("by_user", ["userId"]),

  // ─── Telegram Identities ────────────────────────
  telegram_identities: defineTable({
    userId: v.id("users"),
    telegramChatId: v.string(),
    telegramUsername: v.optional(v.string()),
    telegramFirstName: v.optional(v.string()),
    role: v.union(v.literal("owner"), v.literal("collaborator")),
    pairedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_chat_id", ["telegramChatId"]),

  // ─── Container Events ───────────────────────────
  container_events: defineTable({
    userId: v.id("users"),
    event: v.union(
      v.literal("provision_requested"),
      v.literal("provision_started"),
      v.literal("provision_complete"),
      v.literal("health_check_pass"),
      v.literal("health_check_fail"),
      v.literal("restart"),
      v.literal("stopped"),
      v.literal("error"),
      v.literal("scale_up"),
      v.literal("scale_down"),
      v.literal("alert_stuck")
    ),
    details: v.optional(v.string()),
    timestamp: v.number(),
  })
    .index("by_user", ["userId", "timestamp"]),

  // ─── Brain Memories — STALE, pending removal ──────────────
  // brain.db lives on the pod PVC. Convex never owned agent memory.
  // The `brain_memories` table and its sync endpoint (`/api/brain-memories/sync`)
  // are unused and will be deleted in a future cleanup.
  // brain_memories: defineTable({ ... }),

  // ─── Relay Logs ─────────────────────────────────
  // Structured log of every relay attempt (success and failure).
  // One row per relayToPod() call. 30-day TTL via cron cleanup.
  relay_logs: defineTable({
    userId: v.id("users"),
    messageId: v.optional(v.id("messages")),
    channel: v.union(v.literal("composio"), v.literal("email"), v.literal("telegram"), v.literal("web")),
    outcome: v.union(
      v.literal("success"), v.literal("timeout"), v.literal("connection_refused"),
      v.literal("http_error"), v.literal("empty_response"), v.literal("skipped"),
    ),
    httpStatus: v.optional(v.number()),
    latencyMs: v.optional(v.number()),
    podEndpoint: v.optional(v.string()),
    errorMessage: v.optional(v.string()),
    responseBody: v.optional(v.string()),  // Raw response body for observability (truncated)
    createdAt: v.number(),
  })
    .index("by_user", ["userId", "createdAt"])
    .index("by_outcome", ["outcome", "createdAt"]),

  // ─── Emails ─────────────────────────────────────
  // Inbound email storage. One row per received email.
  emails: defineTable({
    userId: v.id("users"),
    direction: v.union(v.literal("inbound"), v.literal("outbound")),
    from: v.string(), to: v.string(),
    cc: v.optional(v.string()), bcc: v.optional(v.string()),
    subject: v.string(),
    textBody: v.optional(v.string()), htmlBody: v.optional(v.string()),
    messageId: v.string(), inReplyTo: v.optional(v.string()),
    references: v.optional(v.string()), emailThreadId: v.string(),
    // Trust (v2 — Cloudflare Email Routing). Optional for backward compat:
    // pre-v2 emails lack this field; treat undefined as "verified".
    trustLevel: v.optional(v.union(v.literal("verified"), v.literal("quarantined"))),
    quarantineReason: v.optional(v.union(v.literal("dmarc_fail"), v.literal("not_allowlisted"))),
    // Spam (deprecated — no longer populated in v2)
    spamFlag: v.optional(v.boolean()), spamScore: v.optional(v.number()),
    attachments: v.array(v.object({
      storageId: v.id("_storage"), filename: v.string(),
      contentType: v.string(), size: v.number(),
    })),
    relayStatus: v.union(v.literal("pending"), v.literal("relayed"), v.literal("failed")),
    agentResponse: v.optional(v.string()),
    agentRespondedAt: v.optional(v.number()),
    isRead: v.boolean(),
    searchableContent: v.string(),
    receivedAt: v.number(), createdAt: v.number(),
  })
    .index("by_userId", ["userId", "createdAt"])
    .index("by_userId_unread", ["userId", "isRead", "createdAt"])
    .index("by_userId_trustLevel", ["userId", "trustLevel", "createdAt"])
    .index("by_userId_relayStatus", ["userId", "relayStatus", "createdAt"])
    .index("by_emailThreadId", ["emailThreadId", "createdAt"])
    .index("by_messageId", ["messageId"])
    .searchIndex("search_content", {
      searchField: "searchableContent", filterFields: ["userId"],
    }),

  // ─── Email Allowlist ─────────────────────────────
  // Sender allowlist for email trust decisions.
  emailAllowlist: defineTable({
    userId: v.id("users"),
    pattern: v.string(),         // email address or domain
    type: v.union(v.literal("address"), v.literal("domain")),
    createdAt: v.number(),
  })
    .index("by_userId", ["userId"]),

  // ─── Email Dead Letters ─────────────────────────
  // Unroutable inbound emails for debugging.
  email_dead_letters: defineTable({
    from: v.string(), to: v.string(), subject: v.string(),
    messageId: v.string(),
    reason: v.union(v.literal("address_not_found"), v.literal("user_deleted")),
    receivedAt: v.number(),
  })
    .index("by_reason", ["reason", "receivedAt"])
    .index("by_to", ["to", "receivedAt"]),

  // ─── Scheduled Tasks ───────────────────────────
  scheduled_tasks: defineTable({
    userId: v.id("users"),
    task: v.string(),                                  // Task description / prompt
    cron: v.optional(v.string()),                      // 5-field cron (in user's timezone)
    runAt: v.optional(v.number()),                     // One-shot timestamp (UTC ms)
    status: v.union(
      v.literal("active"),
      v.literal("paused"),
      v.literal("completed"),
    ),
    lastRunAt: v.optional(v.number()),
    nextRunAt: v.number(),                             // Next fire time (UTC ms)
    createdAt: v.number(),
    channels: v.array(v.string()),                     // Delivery targets: "telegram", "web"
    timezone: v.optional(v.string()),                  // IANA timezone for cron interpretation
    threadId: v.optional(v.id("threads")),             // Web chat thread for schedule outputs
    lastError: v.optional(v.string()),                 // Last execution failure reason
    failCount: v.optional(v.number()),                 // Consecutive failure count
  })
    .index("by_user", ["userId"])
    .index("by_next_run", ["status", "nextRunAt"]),
});
```

---

## 4. Naming Conventions

| Object | Pattern | Example |
|---|---|---|
| Tables | `snake_case`, plural | `usage_records`, `container_events` |
| Fields | `camelCase` | `containerStatus`, `stripeCustomerId` |
| Functions (public) | `camelCase` verb | `sendMessage`, `getUser` |
| Functions (internal) | `camelCase` verb | `provisionContainer`, `syncUsage` |
| Indexes | `by_<field(s)>` | `by_user`, `by_user_date` |
| Files | `camelCase` matching domain | `pods.ts`, `billing.ts` |
| Action clients | `clients/<service>.ts` | `clients/gke.ts`, `clients/gcpAuth.ts` |

---

## 5. Directory Layout

```
convex/
├── schema.ts                  # Schema definition (single source of truth)
├── auth.ts                    # Convex Auth config (Google OAuth, createOrUpdateUser callback)
├── http.ts                    # HTTP router (webhooks, /api/media-url)
├── crons.ts                   # Scheduled jobs
│
├── users.ts                   # User CRUD + deleteAccount (tombstone + schedule cleanup) + getForWsAuth (internal query for WS gateway auth)
├── userActions.ts             # Account deletion action ("use node") — K8s namespace cleanup + repairMissingEndpoints (one-shot LB IP recovery)
├── userCleanup.ts             # Convergent cleanup mutation — registry-driven cascade delete
├── threads.ts                 # Thread CRUD (create, list, get, updateTitle, deleteThread [soft delete])
├── messages.ts                # Message CRUD + send orchestration + listByThread + persistUserMessage/persistAssistantMessage (WS write-back) + userOwnsAttachment (media ownership check)
├── pods.ts                    # Pod queries + mutations (logEvent, getProvisioningUsers, getRunningUsers, getStartingUsers)
├── podActions.ts              # Pod actions ("use node") — provision, scale, health check, cleanup
├── relay.ts                   # Web chat relay (Convex ↔ Container) + [PERSONA_READY] tag detection
├── relayHelpers.ts            # Shared relay helper (relayToPod) + cleanup cron ("use node")
├── relayLogs.ts               # relay_logs table mutations (insertRelayLog, deleteOldRelayLogs)
├── chat.ts                    # Predictive wake-up + page activity tracking
├── personas.ts                # Persona CRUD: getByUser, create, completeOnboarding, checkOnboardingTimeout
├── memories.ts                # STALE — pending removal. Durable memory via Convex is unused; brain.db on PVC is the sole memory backend.
├── brainMemories.ts           # STALE — pending removal. Brain.db sync to Convex is unused; brain.db lives on pod PVC.
├── scheduledTasks.ts          # Scheduled task CRUD + cron parser (expandCronField supports *, */N, N,M, N-M, N-M/S)
├── scheduledTaskActions.ts    # Scheduled task execution via relayToPod, multi-channel fan-out ("use node")
├── signupCodes.ts             # Signup code gating: checkSignupPolicy, validateSignupCode (public queries), redeemSignupCode (public action), createCode/revokeCode/setPolicy (internal)
├── integrations.ts            # Integration management: Telegram (connect/disconnect/pairing), Google Sheets (Composio OAuth)
├── integrationActions.ts      # Integration actions ("use node") — validate bot token, deleteWebhook (no setWebhook), Composio OAuth, ConfigMap (with telegramBotToken), restart pod (ensureNetworkPolicy + ensureService + ConfigMap + Deployment reconciliation)
├── integrationInternal.ts     # Internal mutations for webhook handler: consumePairingCode, insertTelegramMessage
├── emails.ts                  # Email queries, mutations: insertInboundEmail (idempotent, trust-aware), listByUser (paginated, verified-only), countUnread (verified-only), markAsRead, searchEmails/searchEmailsVerified, setAgentEmailAddress, listAllowlist, addAllowlistEntry, removeAllowlistEntry
├── emailActions.ts            # Email provisioning ("use node") — provisionAgentEmail (retry up to 5x on collision)
├── emailRelay.ts              # Email relay ("use node") — relayViaGateway (POST to Nginx gateway /relay/{userId} → pod /webhook, X-Relay-Token + X-Webhook-Secret auth), handleInbound with retry backoff (5s/30s/2min, max 3). Does NOT use relayToPod() from relayHelpers.ts.
├── telegramRelay.ts           # Telegram webhook relay ("use node") — handleInbound, removeWebhook
├── billing.ts                 # Stripe subscription management (deferred)
├── usage.ts                   # Usage tracking + aggregation (deferred)
├── google.ts                  # Google Calendar + Gmail data fetching (deferred)
│
├── clients/                   # External API wrappers (used by actions only)
│   ├── gke.ts                 # GKE Autopilot API client (K8s operations)
│   ├── gcpAuth.ts             # GCP JWT/OAuth2 auth + cluster discovery
│   ├── telegram.ts            # Telegram Bot API client (validateBotToken, deleteWebhook, getWebhookInfo, sendMessage)
│   ├── composio.ts            # Composio API client (initiateConnection, getConnectionStatus, deleteConnection)
│   ├── stripe.ts              # Stripe SDK wrapper
│   └── google.ts              # Google APIs (Calendar, Gmail)
│
├── migrations/                # One-time data migrations
│   ├── backfillPersonas.ts    # Retroactive persona creation for existing users
│   └── seedSignupPolicies.ts  # One-time seed: OPEN (false), INVITE_CODE (true)
│
├── lib/                       # Shared utilities
│   ├── requireAuth.ts         # Auth guard (getAuthUserId → user lookup)
│   ├── httpAuth.ts            # Pod auth helper (preSharedToken → userId lookup)
│   ├── errors.ts              # Error code constants
│   ├── encryption.ts          # AES-256 encrypt/decrypt for API keys
│   └── time.ts                # Timestamp helpers
│
└── _generated/                # Auto-generated (do not edit)

domain/                        # Pure domain logic (no Convex, no K8s imports)
├── shared/
│   ├── result.ts              # Result<T, E> type + ok/err factories
│   └── types.ts               # Brand type utility
├── claw-pod-identity.ts       # Value object: userId → K8s resource names
├── claw-config.ts             # Domain service: config.toml rendering, tool policy, getExcludedTools
├── claw-workspace.ts          # Domain service: workspace file rendering (persona, memory, bootstrap templates)
└── telegram-validation.ts     # Telegram bot token validation, pairing code generation
```

### 5.1 File Responsibility Rules

- Each file MUST correspond to one domain entity or concern.
- Files requiring Node.js APIs (crypto, `@kubernetes/client-node`, etc.) MUST have `"use node";` as the first line. These files can only contain actions, not queries or mutations.
- When a domain has both queries/mutations and actions, split into two files: `<domain>.ts` (queries/mutations) and `<domain>Actions.ts` (actions with `"use node"`). Example: `pods.ts` + `podActions.ts`.
- Convex module paths MUST NOT contain hyphens. Use camelCase for file names (e.g., `gcpAuth.ts`, not `gcp-auth.ts`).
- Public functions (called from frontend) MUST be in the domain file (`messages.ts`, `users.ts`).
- Internal functions (called from other Convex functions) MUST use `internalQuery`, `internalMutation`, `internalAction`.
- Client wrappers in `clients/` MUST be pure functions — no Convex context, no side effects beyond the API call.
- `lib/` MUST contain only pure utility functions with no Convex imports.
- `domain/` MUST contain pure domain logic with no infrastructure imports (no Convex, no `@kubernetes/*`).

---

## 6. Function Patterns

### 6.1 Auth Guard

Every public function MUST authenticate. No exceptions.

```typescript
// convex/lib/requireAuth.ts
import { getAuthUserId } from "@convex-dev/auth/server";

import type { MutationCtx, QueryCtx } from "../_generated/server";
import { SIGNUP_CODE_REQUIRED, UNAUTHORIZED, USER_NOT_FOUND } from "./errors";

export async function requireAuth(ctx: QueryCtx | MutationCtx) {
  const userId = await getAuthUserId(ctx);
  if (!userId) throw new Error(UNAUTHORIZED);

  const user = await ctx.db.get(userId);
  if (!user || user.deletedAt !== undefined) throw new Error(USER_NOT_FOUND);

  // ── Signup code policy gate ──────────────────────────────
  const openPolicy = await ctx.db
    .query("signup_policies")
    .withIndex("by_mode", (q) => q.eq("mode", "OPEN"))
    .first();

  if (!openPolicy?.enabled) {
    // INV-11: Fail closed — missing/null rows = INVITE_CODE enabled
    const invitePolicy = await ctx.db
      .query("signup_policies")
      .withIndex("by_mode", (q) => q.eq("mode", "INVITE_CODE"))
      .first();

    const inviteCodeActive = invitePolicy?.enabled ?? true;

    if (inviteCodeActive) {
      // INV-09: Un-activated users cannot call app functions
      if (user.signupCodeId === undefined) {
        throw new Error(SIGNUP_CODE_REQUIRED);
      }
    }
  }
  // ─────────────────────────────────────────────────────────

  return user;
}

// Soft auth — for public queries used as live subscriptions.
// Returns null instead of throwing on deleted/unauthenticated users,
// preventing React ErrorBoundary crashes during account deletion.
// Also enforces signup policy gate (returns null for un-activated users).
export async function tryAuth(ctx: QueryCtx) {
  const userId = await getAuthUserId(ctx);
  if (!userId) return null;

  const user = await ctx.db.get(userId);
  if (!user || user.deletedAt !== undefined) return null;

  // ── Signup code policy gate (soft — returns null) ────────
  const openPolicy = await ctx.db
    .query("signup_policies")
    .withIndex("by_mode", (q) => q.eq("mode", "OPEN"))
    .first();

  if (!openPolicy?.enabled) {
    const invitePolicy = await ctx.db
      .query("signup_policies")
      .withIndex("by_mode", (q) => q.eq("mode", "INVITE_CODE"))
      .first();

    const inviteCodeActive = invitePolicy?.enabled ?? true;

    if (inviteCodeActive) {
      if (user.signupCodeId === undefined) return null;
    }
  }
  // ─────────────────────────────────────────────────────────

  return user;
}
```

**Rule:** Mutations MUST use `requireAuth` (hard throw). Public queries used as live subscriptions (e.g. `threads.listForUser`, `messages.listByThread`, `integrations.listForUser`) MUST use `tryAuth` and return safe fallbacks (`[]` or `null`) — this prevents crashes when `deleteAccount` tombstones a user while subscriptions are active.

**Signup code exception:** `getMe` and `getMeSafe` in `convex/users.ts` use `getAuthUserId` directly (not `requireAuth`) — un-activated users must be able to read their own record for the frontend to decide whether to show the app or the signup code interstitial.

**Signup code exception:** `redeemSignupCode` in `convex/signupCodes.ts` uses `getAuthUserId` directly (not `requireAuth`) — the user is authenticated via OAuth but hasn't redeemed a code yet.

Usage in every public function:

```typescript
export const getMyMessages = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireAuth(ctx);
    return await ctx.db
      .query("messages")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .order("desc")
      .take(50);
  },
});
```

### 6.2 Query Pattern

```typescript
// Single entity: throw on not found
export const get = query({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    const user = await ctx.db.get(userId);
    if (!user) throw new Error("NOT_FOUND");
    return user;
  },
});

// List: return empty array, never throw
export const listByUser = query({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    return await ctx.db
      .query("integrations")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
  },
});

// Paginated: use Convex pagination
export const listMessages = query({
  args: {
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, { paginationOpts }) => {
    const user = await requireAuth(ctx);
    return await ctx.db
      .query("messages")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .order("desc")
      .paginate(paginationOpts);
  },
});
```

### 6.3 Mutation Pattern

```typescript
// Create + schedule: validate, rate limit, insert, trigger side effects
export const sendMessage = mutation({
  args: { content: v.string(), threadId: v.optional(v.id("threads")) },
  handler: async (ctx, { content, threadId }) => {
    const user = await requireAuth(ctx);

    // Validate plan status
    if (user.planStatus === "canceled") {
      throw new Error(SUBSCRIPTION_REQUIRED);
    }

    // Rate limit: max 60 messages per minute per user
    const oneMinuteAgo = Date.now() - 60_000;
    const recentMessages = await ctx.db
      .query("messages")
      .withIndex("by_user", (q) =>
        q.eq("userId", user._id).gte("createdAt", oneMinuteAgo))
      .collect();
    if (recentMessages.length >= 60) {
      throw new Error(PLAN_LIMIT_EXCEEDED);
    }

    const messageId = await ctx.db.insert("messages", {
      userId: user._id,
      threadId,
      role: "user",
      content,
      source: "container",
      status: "pending",
      createdAt: Date.now(),
    });

    // Update thread's lastMessageAt
    if (threadId) {
      await ctx.db.patch(threadId, { lastMessageAt: Date.now() });
    }

    // Update activity timestamp
    await ctx.db.patch(user._id, {
      lastActivityAt: Date.now(),
      updatedAt: Date.now(),
    });

    // Route to container relay
    await ctx.scheduler.runAfter(0, internal.relay.sendToContainer, {
      userId: user._id,
      messageId,
      content,
      threadId,
    });

    return messageId;
  },
});

// Status update: patch + log event
// Guards deleted/tombstoned users — crons and scheduled actions may call this
// after account deletion begins.
export const updateContainerStatus = internalMutation({
  args: {
    userId: v.id("users"),
    status: v.union(
      v.literal("pending"),
      v.literal("provisioning"),
      v.literal("running"),
      v.literal("stopped"),
      v.literal("error")
    ),
    details: v.optional(v.string()),
  },
  handler: async (ctx, { userId, status, details }) => {
    const user = await ctx.db.get(userId);
    if (!user || user.deletedAt !== undefined) return;

    await ctx.db.patch(userId, {
      containerStatus: status,
      updatedAt: Date.now(),
    });

    await ctx.db.insert("container_events", {
      userId,
      event: status === "running" ? "provision_complete"
           : status === "error" ? "error"
           : "provision_started",
      details,
      timestamp: Date.now(),
    });
  },
});
```

### 6.4 Action Pattern (External APIs)

```typescript
// Action: calls external API, then calls internal mutation to persist
export const provisionContainer = internalAction({
  args: {
    userId: v.id("users"),
  },
  handler: async (ctx, { userId }) => {
    try {
      // 1. Read user data via internal query (try/catch: user may be deleted)
      let user;
      try {
        user = await ctx.runQuery(internal.users.getInternal, { userId });
      } catch {
        return; // User deleted, bail out
      }
      if (user.deletedAt !== undefined) return;

      // 2. Create K8s API clients
      const clients = await createK8sClients({
        clusterName: process.env.GKE_CLUSTER_NAME!,
        projectId: process.env.GCP_PROJECT_ID!,
        region: process.env.GCP_REGION!,
        serviceAccountKey: process.env.GKE_SERVICE_ACCOUNT_KEY!,
      });

      // 3. Provision user's pod namespace + resources
      // provisionUser returns { endpoint: string | null } — null if LB IP
      // not yet assigned (GKE Autopilot cold-start). healthCheckAll resolves lazily.
      const { endpoint } = await provisionUser({
        clients,
        userId: user._id,
        plan: user.plan,
        openRouterApiKey: user.llmApiKeyEncrypted
          ? decrypt(user.llmApiKeyEncrypted)
          : process.env.PLATFORM_OPENROUTER_KEY!,
        preSharedToken: user.preSharedToken,
        convexUrl: process.env.CONVEX_URL!,
        convexServiceToken: process.env.CONTAINER_SERVICE_TOKEN!,
        dockerImage: process.env.CLAW_DOCKER_IMAGE!,
      });

      // 4. Persist result — containerId always, containerEndpoint only if resolved
      await ctx.runMutation(internal.users.updateContainerStatus, {
        userId,
        status: "provisioning",
        ...(endpoint ? { containerEndpoint: endpoint } : {}),
        containerId: pod.deploymentName,
      });

    } catch (err) {
      const message = err instanceof Error ? err.message : "Provisioning failed";
      await ctx.runMutation(internal.users.updateContainerStatus, {
        userId,
        status: "error",
        details: message,
      });
    }
  },
});
```

**Action rules:**
- MUST wrap all external calls in try/catch.
- MUST guarantee a terminal state on every code path (success or failure persisted).
- MUST NOT read/write `ctx.db` directly — use `ctx.runQuery` / `ctx.runMutation`.
- SHOULD be `internalAction` unless the frontend needs to call it directly.

### 6.5 HTTP Route Pattern (Webhooks)

```typescript
// convex/http.ts
import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";

const http = httpRouter();

// Stripe webhook — deferred until billing is built.
// When implemented, add route for "/stripe-webhook" to verify Stripe signature and dispatch:
//   checkout.session.completed → internal.billing.activateSubscription
//   invoice.paid → internal.billing.markPaid
//   invoice.payment_failed → internal.billing.markPastDue
//   customer.subscription.deleted → internal.billing.handleCancellation

// Container webhook — receives messages from ZeroClaw pods (LIVE)
// Dispatches on body.type field for multi-purpose routing:
//   (absent)            → insertAssistantMessage (backward compatible, web chat)
//   !type && content    → channel_response: insertAssistantMessage with source from
//                         body.channel_config (e.g. "webhook"), fallback "container"
//   "pairing_request"   → consumePairingCode (Telegram deep-link OTP)
//   "telegram_message"  → insertTelegramMessage (Telegram chat sync)
//   "sync_error"        → update integration lastSyncError (pod→Convex failure telemetry)
http.route({
  path: "/container-webhook",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const token = request.headers.get("authorization");
    const expectedToken = process.env.CONTAINER_SERVICE_TOKEN;

    if (!token || !expectedToken || token !== `Bearer ${expectedToken}`) {
      return new Response("Unauthorized", { status: 401 });
    }

    const body = await request.json();
    if (!body.userId) {
      return new Response("Missing required fields", { status: 400 });
    }

    const userId = body.userId as Id<"users">;

    // Dispatch on type field
    if (body.type === "pairing_request") {
      const result = await ctx.runMutation(
        internal.integrationInternal.consumePairingCode,
        { code: body.code, telegramChatId: body.telegramChatId, ... },
      );
      return new Response(JSON.stringify(result), { status: 200, headers: { "Content-Type": "application/json" } });
    }

    if (body.type === "telegram_message") {
      await ctx.runMutation(internal.integrationInternal.insertTelegramMessage, {
        userId, content: body.content, role: body.role, metadata: body.metadata, ...
      });
      return new Response("OK", { status: 200 });
    }

    if (body.type === "sync_error") {
      // Update integration's lastSyncError for dashboard telemetry
      // ...
      return new Response("OK", { status: 200 });
    }

    // Default: existing behavior (no type field) — insert assistant message
    if (!body.content) return new Response("Missing required fields", { status: 400 });

    await ctx.runMutation(internal.messages.insertAssistantMessage, {
      userId, threadId: body.threadId, content: body.content,
      tokensUsed: body.tokensUsed, model: body.model, latencyMs: body.latencyMs,
      source: body.source, // optional — defaults to "container" if absent
    });

    return new Response("OK", { status: 200 });
  }),
});

// WS gateway auth — validates Convex session JWT for Nginx auth_request subrequest
// Returns 200 with X-Pod-Upstream header (pod ClusterIP endpoint) on success, 401 on failure.
// Used by Nginx WS gateway to authenticate and route WebSocket connections to user pods.
http.route({
  path: "/api/ws-auth",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const url = new URL(request.url);
    const token = url.searchParams.get("token");
    if (!token) return new Response("Missing token", { status: 401 });

    // Validate session JWT and look up user's pod endpoint
    const user = await ctx.runQuery(internal.users.getForWsAuth, { token });
    if (!user || !user.containerEndpoint) {
      return new Response("Unauthorized", { status: 401 });
    }

    return new Response("OK", {
      status: 200,
      headers: { "X-Pod-Upstream": user.containerEndpoint },
    });
  }),
});

// Telegram webhook — receives Telegram messages via webhook mode (LIVE)
// Returns 200 immediately, dispatches async to telegramRelay.handleInbound.
// Handles: pairing codes (/start {code}), authorized sender relay, pod wake-up.
http.route({
  path: "/telegram-webhook",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const url = new URL(request.url);
    const userId = url.searchParams.get("userId");
    if (!userId) return new Response("OK", { status: 200 });

    const update = await request.json();
    const message = update.message;
    if (!message?.text || !message?.chat?.id) return new Response("OK", { status: 200 });

    await ctx.scheduler.runAfter(0, internal.telegramRelay.handleInbound, {
      userId,
      chatId: String(message.chat.id),
      text: message.text,
      senderUsername: message.from?.username,
      senderFirstName: message.from?.first_name,
    });
    return new Response("OK", { status: 200 });
  }),
});

// Email upload URL — CF Worker requests Convex storage URL for attachment upload
// Auth: EMAIL_WEBHOOK_SECRET (Worker → Convex shared secret)
http.route({
  path: "/email-upload-url",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    // Bearer token verification → ctx.storage.generateUploadUrl() → { uploadUrl }
  }),
});

// Email webhook — receives parsed email from CF Email Worker (LIVE)
// Auth: EMAIL_WEBHOOK_SECRET. Accepts dmarcPass (v2, replaces spamFlag/spamScore).
// Calls insertInboundEmail which runs trust decision via domain/email/ functions.
http.route({
  path: "/email-webhook",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    // Bearer token verify → parse body → ctx.runMutation(internal.emails.insertInboundEmail, { ...body, dmarcPass })
    // Returns 200 immediately — relay scheduled async via insertInboundEmail
  }),
});

// Agent inbox pull-path — pod fetches sanitized emails (LIVE)
// Auth: preSharedToken (pod auth, different credential from Worker auth).
// Applies read-time sanitization (sanitizeEmailContent) and verified-only guard (filterVerifiedOnly).
// Supports: limit, q (search), threadId, status=unread.
http.route({
  path: "/api/emails",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    // preSharedToken auth → verified-only queries → sanitizeEmailContent per email → filterVerifiedOnly → Response.json
  }),
});

export default http;
```

### 6.6 Cron Pattern

```typescript
// convex/crons.ts
import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Scale down pods idle > 30 min
// idle-scale-down REMOVED — pods are always-on (WS chat requires running pod)
// User-controlled sleep deferred to future release.

// Clean up stale provisioning containers (stuck > 10 min)
crons.interval(
  "stale-container-cleanup",
  { minutes: 5 },
  internal.podActions.cleanupStale
);

// Health check running containers every 60 seconds
crons.interval(
  "container-health-check",
  { seconds: 60 },
  internal.podActions.healthCheckAll
);

// Execute due scheduled tasks every 60 seconds
crons.interval(
  "execute-scheduled-tasks",
  { seconds: 60 },
  internal.scheduledTaskActions.executeScheduledTasks
);

// Alert on users stuck in starting/provisioning > 2 minutes
// Fires OPS_ALERT_WEBHOOK_URL (Slack webhook or any HTTP endpoint).
// No-ops if env var not set.
crons.interval(
  "alert-stuck-users",
  { minutes: 2 },
  internal.podActions.alertStuckUsers
);

// Clean up relay logs older than 30 days
crons.interval(
  "relay-log-cleanup",
  { hours: 24 },
  internal.relayHelpers.cleanupOldRelayLogs,
);

// Deferred until billing is built:
// crons.daily("trial-expiry-check", { hourUTC: 0, minuteUTC: 0 }, internal.billing.checkTrialExpirations);
// crons.interval("usage-aggregation", { hours: 1 }, internal.usage.aggregateHourly);

export default crons;
```

---

## 7. State Machines

### 7.1 Container Lifecycle

```
    ┌─────────┐
    │ pending │ ◄─── User created, no container yet
    └────┬────┘
         │ OAuth complete → ctx.scheduler.runAfter(0, provisionContainer)
         ▼
  ┌──────────────┐
  │ provisioning │ ◄─── GKE API called, deployment creating
  └──────┬───────┘
         │ health check passes
         ▼
    ┌─────────┐
    │ running │ ◄─── Accepting messages, healthy
    └────┬────┘
         │ subscription canceled / manual stop
         ▼
    ┌─────────┐
    │ stopped │ ◄─── Pod scaled to 0, namespace retained 30 days
    └─────────┘

    (any state) ──► error (on unrecoverable failure)
    error ──► provisioning (on manual retry)
```

**Transition Rules:**
- MUST transition through states in order (no skipping `provisioning`).
- MUST log every transition to `container_events`.
- `error` MUST include details string explaining the failure.
- `stopped` → `running` requires scaling deployment to 1 replica.

### 7.2 Pod State (`podState`)

The `podState` field tracks the K8s-level state of a user's pod, separate from the `containerStatus` lifecycle. This drives scaling decisions and health monitoring.

```
    ┌───────────┐
    │ not_found │ ◄─── No deployment exists yet
    └─────┬─────┘
          │ provision or scaleUp called
          ▼
    ┌──────────┐
    │ starting │ ◄─── Deployment scaling to 1, waiting for health
    └─────┬────┘
          │ health check passes
          ▼
    ┌─────────┐     idle > 30 min     ┌────────────┐
    │ running │ ──────────────────►  │ scaled_down │
    └─────────┘                       └──────┬──────┘
          ▲                                  │
          │           chat.onPageLoad        │
          └──────── (predictive wake-up) ────┘

    (any state) ──► error (on unrecoverable failure)
```

**Transition Rules:**
- `scaled_down` → `starting` triggered by `chat.onPageLoad` (predictive wake-up) or explicit `scaleUp`. `scaleUp` reconciles the full resource set (ensureNetworkPolicy + ensureService + updateConfigMap + reconcileDeployment), not just ConfigMap + Deployment.
- `starting` → `running` only after `pollHealth` succeeds.
- `running` → `scaled_down` no longer automatic (idle scale-down cron removed). Pods remain running indefinitely. User-controlled sleep deferred.
- All transitions logged to `container_events` (including `scale_up` / `scale_down` / `alert_stuck`).
- `healthCheckAll` cron monitors BOTH `running` and `starting` pods, reconciling `podState` against actual K8s deployment status. Endpoint recovery applies to `running`, `starting`, and any state where `status.podState === "running"`.
- `pollHealth` resolves LB IP inline when `containerEndpoint` is missing (prevents dead-end when `waitForLoadBalancerIP` times out during provisioning). If LB IP is still not available, reschedules instead of silently returning.
- `cleanupStale` checks actual K8s deployment state (`getDeploymentStatus` + `getLoadBalancerIP`) before escalating stuck users to error. If the pod is actually running, recovers the user to `"running"` instead of false-erroring.
- `alertStuckUsers` cron (every 2min) fires `OPS_ALERT_WEBHOOK_URL` when users are stuck in `starting`/`provisioning` > 2 minutes. No-ops if env var not set.

### 7.3 Subscription Lifecycle

```
    ┌──────────┐
    │ trialing │ ◄─── Created on signup, 7-day trial
    └────┬─────┘
         │ payment method added + first invoice paid
         ▼
    ┌────────┐
    │ active │ ◄─── Subscribed and current
    └────┬───┘
         │ invoice.payment_failed
         ▼
    ┌──────────┐
    │ past_due │ ◄─── 7-day grace period, container keeps running
    └────┬─────┘
         │ invoice.paid → active
         │ 7 days elapsed or subscription.deleted
         ▼
    ┌──────────┐
    │ canceled │ ◄─── Container stopped, namespace retained 30 days
    └──────────┘
```

### 7.4 Account Deletion Lifecycle

```
    ┌────────┐
    │ active │ ◄─── Any user with no deletedAt
    └────┬───┘
         │ user clicks "Delete Account" (type-to-confirm "DELETE")
         │ deleteAccount mutation: sets deletedAt, schedules cleanup
         ▼
    ┌─────────────┐
    │ tombstoned  │ ◄─── deletedAt set, auth guards block access
    └──────┬──────┘       user signed out + redirected to /
           │ performAccountDeletion action (async)
           │   1. deleteNamespace (K8s, best-effort)
           │   2. cleanupUserData (convergent loop)
           ▼
    ┌─────────────┐
    │  cleaning   │ ◄─── Loop: delete batch per table, re-count, re-schedule
    └──────┬──────┘       USER_OWNED_TABLES registry (13 tables + 2 auth joins)
           │ all table counts == 0 (fixed point)
           ▼
    ┌─────────┐
    │ deleted │ ◄─── User record deleted as FINAL act
    └─────────┘
```

Rules:
- MUST set `deletedAt` tombstone before scheduling cleanup (two-phase deletion).
- MUST delete user record LAST, only after all owned records across all tables are confirmed deleted.
- MUST use convergent delete-until-zero loop (not single-pass batching).
- MUST iterate `USER_OWNED_TABLES` registry — never hardcoded table names in the cleanup loop. `relay_logs` and `emails` MUST be included.
- Auth join tables (authVerificationCodes, authVerifiers) MUST be deleted BEFORE their parent tables (authAccounts, authSessions) — otherwise join keys are lost and children are orphaned.
- Post-cleanup invariant check MUST count auth join table records in addition to `USER_OWNED_TABLES`.
- K8s namespace deletion is best-effort; failure does not block DB cleanup.
- `requireAuth` and `getMeSafe` treat `deletedAt !== undefined` as non-existent.
- All callers of `getInternal` MUST use try/catch (it throws, never returns null). Null-check guards are dead code.
- Internal mutations that write to user-owned tables (`setPodState`, `updateContainerStatus`, `logEvent`, `incrementPodRestartCount`, `resetPodRestartCount`) MUST guard against deleted/tombstoned users before `ctx.db.patch` or `ctx.db.insert`.

---

## 8. Message Routing

**Web chat** now uses WebSocket streaming via the Nginx WS gateway (see claw-doctrine §2.2, §10.1). The browser writes back persisted messages to Convex via `persistUserMessage` and `persistAssistantMessage` mutations. The `messages.sendMessage` → `relay.sendToContainer` path is **no longer used for web chat** but remains active for scheduled task execution.

Scheduled task messages flow through `messages.sendMessage`:

```
User opens chat page
         │
         ▼
  chat.onPageLoad (mutation)
         │
         ├─── Updates lastActivityAt
         └─── podState === "scaled_down"?
                   │ YES → schedule pods.scaleUp (predictive wake-up)
                   │        → pollHealth → deliverQueued
                   │ NO  → no-op

User sends message via web app
         │
         ▼
  messages.sendMessage (mutation)
         │
         ├─── Validates auth + plan status
         ├─── Rate limit check (max 60/min per user)
         ├─── Inserts user message with status: "pending"
         ├─── Updates lastActivityAt
         │
         └─── Schedules relay.sendToContainer (action)
                   │
                   ├── containerStatus !== "running"?
                   │     → message stays queued (status: "pending")
                   │     → delivered later via relay.deliverQueued
                   │
                   ├── HTTP POST to container /api/chat
                   │   with Bearer pre-shared token
                   │   body: { message }
                   │   (no session_id — global memory recall, FMEA B1/B2)
                   │
                   ├── Success → markDelivered (status: "delivered")
                   │   └── If response includes content/reply/response → insertAssistantMessage (with threadId)
                   │
                   └── Failure → markFailed (status: "failed")

         Return messageId to frontend
              (frontend subscribes to messages query for real-time updates)
```

**Note:** There is no ghost chat or LLM fallback in Convex. All messages route through the ZeroClaw container. If the container is not running, messages are queued (status: "pending") and delivered when the pod becomes healthy via `relay.deliverQueued`, triggered after `pollHealth` succeeds.

### 8.1 Telegram Message Routing (Webhook Mode)

Convex is the Telegram message hub. Telegram sends messages to a Convex HTTP webhook; Convex validates, relays to the pod, and sends replies back to Telegram. The pod has zero Telegram awareness — no bot token, no channel config.

```
Telegram user sends message to bot
         │
         ▼
  Convex POST /telegram-webhook?userId={userId}
         │
         ├─── /start CLAW-XXXX?
         │     → consumePairingCode → telegram_identities row created
         │     → sendMessage reply: "Paired successfully!"
         │     → No pod involvement
         │
         ├─── Pod running?
         │     → Validate sender (chatId in telegram_identities)
         │     → Insert user message (source: "telegram")
         │     → POST /api/chat to pod (same as web relay)
         │     → Insert assistant message
         │     → sendMessage reply to Telegram
         │
         └─── Pod scaled_down/error?
               → Insert user message (source: "telegram")
               → Schedule podActions.scaleUp
               → deliverQueued delivers when healthy
               → NOTE: Telegram reply not sent for wake-up case (TODO)

Integration lifecycle (native mode — live):
  connectTelegram → validateAndSetup → deleteWebhook (clear stale) → restartPodForIntegration
  disconnectTelegram → schedule removeWebhook → deleteWebhook (best-effort) → restartPodForIntegration
  restartPodForIntegration reconciles: ensureNetworkPolicy + ensureService + updateConfigMap + reconcileDeployment
  ConfigMap contains [channels_config.telegram] with decrypted bot token when Telegram is connected
  Pod runs long polling via ZeroClaw's native TelegramChannel
```

**Key difference from web chat:** In native mode, Telegram messages go directly to the pod (long polling), not through Convex. The pod handles the full agent loop and replies directly via Telegram Bot API. Convex's `messages` table does not see native Telegram messages (known persistence gap). The dormant webhook relay path (`telegramRelay.ts`) still exists but is not active.

---

## 9. External API Client Rules

All external API calls live in `convex/clients/`. Each client:

- MUST be a plain TypeScript module (no Convex imports).
- MUST accept credentials as function parameters (not from environment directly).
- MUST return typed results (no `any`).
- MUST throw typed errors that the calling action can catch and handle.

```typescript
// convex/clients/gke.ts — Public API

export async function createK8sClients(params: {
  clusterName: string;
  projectId: string;
  region: string;
  serviceAccountKey: string;
}): Promise<K8sClients> { ... }

export async function provisionUser(params: {
  clients: K8sClients;
  convexServiceToken: string;
  convexUrl: string;
  dockerImage: string;
  openRouterApiKey: string;
  plan: Plan;
  preSharedToken: string;
  userId: string;
}): Promise<{ endpoint: string }> { ... }

// Pure function: builds complete desired K8s Deployment spec.
// Single source of truth — used by provisionUser and reconcileDeployment.
export function buildDeploymentSpec(params: {
  convexServiceToken: string;
  convexUrl: string;
  dockerImage: string;
  includeBootstrap: boolean;
  replicas: number;
  restartAnnotation?: string;
  userId: string;
}): k8s.V1Deployment { ... }

// Declarative deployment reconciliation: sends full desired spec to K8s.
// Create if not found, replace if exists. K8s handles the diff.
export async function reconcileDeployment(params: {
  clients: K8sClients;
  deploymentSpec: k8s.V1Deployment;
  userId: string;
}): Promise<void> { ... }

// Declarative NetworkPolicy reconciliation: create if not found, replace if exists.
// Called by provisionUser, scaleUp, and restartPodForIntegration.
export async function ensureNetworkPolicy(params: {
  clients: K8sClients;
  pod: ClawPodIdentity;
}): Promise<void> { ... }

// Declarative Service reconciliation: create if not found, replace if exists.
// Called by provisionUser, scaleUp, and restartPodForIntegration.
export async function ensureService(params: {
  clients: K8sClients;
  pod: ClawPodIdentity;
}): Promise<void> { ... }

// Only imperative patch — no drift risk when pod is off.
export async function scaleDown(params: {
  clients: K8sClients;
  userId: string;
}): Promise<void> { ... }

export async function getDeploymentStatus(params: {
  clients: K8sClients;
  userId: string;
}): Promise<DeploymentStatus> { ... }

export async function deleteNamespace(params: {
  clients: K8sClients;
  userId: string;
}): Promise<void> { ... }

// ConfigMapUpdateParams requires convexUrl: string (not optional) — security invariant
export async function updateConfigMap(params: ConfigMapUpdateParams): Promise<void> { ... }
```

```typescript
// convex/clients/gcpAuth.ts — GCP authentication

export async function getAccessToken(params: {
  clientEmail: string;
  privateKey: string;
}): Promise<string> { ... }

export async function getClusterInfo(params: {
  accessToken: string;
  clusterName: string;
  projectId: string;
  region: string;
}): Promise<ClusterInfo> { ... }
```

```typescript
// convex/clients/telegram.ts
export async function validateBotToken(params: {
  token: string;
}): Promise<{ ok: true; botUsername: string } | { ok: false; error: string }> { ... }
```

```typescript
// convex/clients/stripe.ts
export async function createCheckoutSession(params: {
  customerId: string;
  priceId: string;
  successUrl: string;
  cancelUrl: string;
  stripeSecretKey: string;
}): Promise<{ url: string }> { ... }
```

---

## 10. Error Handling

### 10.1 Error Codes

| Code | Meaning | HTTP Equivalent |
|---|---|---|
| `UNAUTHORIZED` | No valid auth token | 401 |
| `USER_NOT_FOUND` | Auth valid but no user record | 404 |
| `NOT_FOUND` | Entity does not exist | 404 |
| `SUBSCRIPTION_REQUIRED` | Trial expired or canceled | 402 |
| `PLAN_LIMIT_EXCEEDED` | Token budget exhausted | 429 |
| `INVALID_STATE` | Operation invalid for current state | 409 |
| `CONTAINER_UNAVAILABLE` | Container not running | 503 |
| `GKE_ERROR` | GKE API failure | 502 |
| `STRIPE_ERROR` | Stripe API failure | 502 |
| `INVALID_API_KEY` | BYOK key validation failed | 400 |
| `PROVISIONING_TIMEOUT` | Container failed to start in 10s | 504 |
| `TELEGRAM_INVALID_TOKEN` | Bot token format validation failed | 400 |
| `TELEGRAM_ALREADY_CONNECTED` | Telegram already connected for user | 409 |
| `TELEGRAM_TOKEN_REJECTED` | Telegram API rejected bot token | 400 |
| `TELEGRAM_USER_NOT_PAIRED` | Telegram user not in paired identities | 403 |
| `PAIRING_CODE_NOT_FOUND` | Pairing code does not exist | 404 |
| `PAIRING_CODE_EXPIRED` | Pairing code past expiry time | 410 |
| `PAIRING_CODE_ALREADY_USED` | Pairing code already consumed | 409 |
| `SIGNUP_CODE_REQUIRED` | Authenticated but hasn't redeemed a code (INVITE_CODE active) | 403 |
| `INVALID_CODE` | Signup code doesn't exist or format invalid | 400 |
| `CODE_REVOKED` | Signup code exists but `isActive: false` | 400 |
| `CODE_EXPIRED` | Signup code past `expiresAt` | 410 |
| `CODE_MAXED` | Signup code reached `maxUses` activations | 429 |
| `ALREADY_ACTIVATED` | User already redeemed a different code | 409 |
| `SIGNUPS_DISABLED` | All signup policies disabled | 403 |

### 10.2 Error Handling Rules

| Context | Pattern |
|---|---|
| Query not found | Throw `NOT_FOUND` |
| Mutation validation | Throw with error code |
| Action external call fails | Catch, persist error state via `runMutation`, do NOT re-throw |
| Action partial success | Persist what succeeded, log what failed |
| Webhook invalid signature | Return `400`, do NOT call any mutations |
| Container unreachable | Queue message, schedule retry |

### 10.3 Guaranteed Terminal States

Every action that begins a multi-step process MUST guarantee that a terminal state is reached:

```typescript
export const startProvisioning = internalAction({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    // Guarantee: every code path reaches a terminal state
    try {
      await doProvisioning(ctx, userId);
      // Terminal: containerStatus = "running"
    } catch (err) {
      await ctx.runMutation(internal.users.updateContainerStatus, {
        userId,
        status: "error",
        details: err instanceof Error ? err.message : "Unknown error",
      });
      // Terminal: containerStatus = "error"
    }
  },
});
```

---

## 11. Real-Time Patterns

Convex queries auto-update when underlying data changes. The frontend subscribes once and receives all updates.

```typescript
// Frontend: subscribe to messages (auto-updates on new messages)
const messages = useQuery(api.messages.listRecent);

// Frontend: subscribe to container status (auto-updates on provisioning progress)
const user = useQuery(api.users.getMe);
// user.containerStatus transitions: pending → provisioning → running

// Frontend: subscribe to usage (auto-updates as tokens are consumed)
const usage = useQuery(api.usage.getCurrentPeriod);
```

**Rule:** NEVER poll from the frontend. Convex reactivity handles all real-time updates. If you find yourself writing `setInterval` on the client, you're doing it wrong.

---

## 12. Security Rules

| Rule | Implementation |
|---|---|
| Every public function authenticates | `requireAuth(ctx)` at top of every handler |
| API keys encrypted at rest | AES-256 via `lib/encryption.ts`, decrypted only in actions |
| Google tokens scoped minimally | Request `calendar.readonly` + `gmail.readonly` only when user consents |
| Container isolation | Kubernetes namespace per user, network policies block cross-tenant |
| Webhook verification | Stripe signature verification, container service token validation |
| No PII in logs | Client wrappers MUST NOT log request/response bodies |
| Internal functions only | Actions called from mutations use `internal.*`, never exposed to frontend |
| Rate limiting | Convex function limits + custom check: max 60 messages/minute per user |

---

## 13. Operational Rules

- MUST use `v.id("table")` for foreign keys, never `v.string()`.
- MUST define indexes for ALL query patterns before writing the query.
- MUST NOT store derived/computed values — compute in queries.
- MUST wrap all actions in try/catch to guarantee terminal states.
- MUST use `internal.*` for mutations/queries called from actions.
- MUST use `ctx.scheduler.runAfter(0, ...)` to trigger actions from mutations.
- MUST log state transitions to `container_events`.
- SHOULD co-locate related functions in one file (e.g., all message logic in `messages.ts`).
- SHOULD keep action handlers under 60 seconds (Convex action time limit).
- MAY use `ctx.scheduler.runAfter(delay, ...)` for retry logic with backoff.

---

## 14. Testing Expectations

| Layer | Test Focus | Tool |
|---|---|---|
| Schema | Type safety, validator coverage | TypeScript compiler |
| Queries | Return shape, index usage, auth enforcement | Convex test framework |
| Mutations | State transitions, validation, scheduling | Convex test framework |
| Actions | External API mocking, error path coverage | Vitest + mocked clients |
| HTTP routes | Webhook signature verification, event dispatch | Vitest + mock requests |
| Crons | Correctness of scheduled logic | Manual verification via Convex dashboard |
| E2E flows | Billing, message routing, provisioning | Playwright + Convex test environment |

---

## 15. Change Protocol

- Schema changes auto-migrate (Convex handles this).
- New indexes require `npx convex dev` restart.
- Breaking changes to public function signatures require frontend updates.
- New `clients/` modules require corresponding environment variables to be set.
- New HTTP routes require webhook URL registration with the external service.

---

## 16. Environment Variables

| Variable | Purpose | Required |
|---|---|---|
| `GKE_SERVICE_ACCOUNT_KEY` | GKE API authentication | Yes |
| `GCP_PROJECT_ID` | GCP project for GKE | Yes |
| `GCP_REGION` | `northamerica-northeast1` (Montreal) | Yes |
| `GKE_CLUSTER_NAME` | GKE Autopilot cluster name | Yes |
| `STRIPE_SECRET_KEY` | Stripe API | Yes |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signature verification | Yes |
| `ENCRYPTION_KEY` | AES-256 key for API key encryption | Yes |
| `CONTAINER_SERVICE_TOKEN` | Shared secret for container → Convex webhooks | Yes |
| `CLAW_DOCKER_IMAGE` | Full Docker image URI for ZeroClaw (includes tag) | Yes |
| `PLATFORM_OPENROUTER_KEY` | Platform OpenRouter key (for non-BYOK users) | Yes |
| `CONVEX_URL` | Convex deployment URL (injected into pods) | Yes |
| `GATEWAY_RELAY_TOKEN` | Shared secret for Convex → Nginx gateway relay auth (`X-Relay-Token` header) | Yes |
| `WS_GATEWAY_URL` | Nginx WS gateway base URL (e.g., `https://gw.clawcraft.ca`) for email relay routing | Yes |
| `OPS_ALERT_WEBHOOK_URL` | Webhook URL for stuck-user alerts (Slack incoming webhook or any HTTP endpoint) | No |

---

## Document History

| Version | Date | Changes |
|---|---|---|
| 2.31.0 | 2026-04-15 | **Multimedia file serving.** §2: added `GET /api/media-url` to HTTP routes diagram. §5: updated `http.ts` description (gains `/api/media-url`), `messages.ts` description (gains `userOwnsAttachment` internal query). `GET /api/media-url`: pod resolves Convex `_storage` IDs to signed download URLs; preSharedToken auth + ownership validation via `userOwnsAttachment` (prevents cross-tenant file access). |
| 2.30.0 | 2026-04-10 | **`memories` and `brain_memories` tables marked STALE.** Agent memory lives entirely on the pod PVC (brain.db in SQLite). Convex never owned agent memory — the `memories` table (durable memory CRUD) and `brain_memories` table (brain.db sync snapshots) are unused and pending removal. §2: tables diagram updated, HTTP routes `/api/memories` and `/api/brain-memories/sync` marked stale. §3: `brain_memories` schema commented out. §5: `memories.ts` and `brainMemories.ts` marked stale. |
| 2.29.1 | 2026-04-09 | Pod lifecycle reconciliation. §7.2: `scaleUp` transition rule updated — now reconciles full resource set (ensureNetworkPolicy + ensureService + updateConfigMap + reconcileDeployment), not just ConfigMap + Deployment. §8.1: `restartPodForIntegration` lifecycle updated — same full reconciliation. §9: `gke.ts` public API gains `ensureNetworkPolicy` and `ensureService` signatures (declarative create-or-replace, accept `ClawPodIdentity`). Previously infrastructure changes (new ports, updated NetworkPolicy rules) only propagated on first provision, not on pod restarts or integration changes. |
| 2.29.0 | 2026-04-09 | Webhook channel response handler. §2: `/container-webhook` gains channel response dispatch (`!type && content`). §3: `messages.source` union gains `v.literal("webhook")`. `insertAssistantMessage` gains optional `source` parameter (defaults to `"container"`). |
| 2.28.0 | 2026-04-09 | **Email relay via gateway.** §3: `relay_logs` table gains `responseBody` field (optional string, raw response body for observability). §5: `emailRelay.ts` description updated — uses `relayViaGateway()` (POST to Nginx gateway `/relay/{userId}` → pod `/webhook`), no longer imports from `relayHelpers.ts`. §16: `GATEWAY_RELAY_TOKEN` and `WS_GATEWAY_URL` env vars added. |
| 2.27.0 | 2026-04-07 | Email v2 — §6.5: added `/email-upload-url`, `/email-webhook` (dmarcPass, trust decision via domain/email/), `/api/emails` (read-time sanitization via sanitizeEmailContent, verified-only guard via filterVerifiedOnly, status=unread param) HTTP route documentation. |
| 2.26.0 | 2026-04-07 | Email v2 — Cloudflare Email Routing migration. §3: `emails` table gains `trustLevel` (verified/quarantined), `quarantineReason` (dmarc_fail/not_allowlisted); `spamFlag`/`spamScore` deprecated (optional, no longer populated). New `emailAllowlist` table (userId, pattern, type, createdAt) with `by_userId` index. New indexes on `emails`: `by_userId_trustLevel`, `by_userId_relayStatus`. §5: `emails.ts` gains `listAllowlist`, `addAllowlistEntry`, `removeAllowlistEntry` (public), `listPendingVerified`, `listRecentVerified`, `listUnreadVerified`, `searchEmailsVerified`, `listByThreadVerified`, `addDefaultAllowlistEntry` (internal). All public queries use verified-only filtering via `filterVerifiedOnly()`. `emailRelay.ts` uses opaque notification relay (notifyInbound) with pull-based model — pod pulls pending emails via `/api/emails`. `insertInboundEmail` performs trust decision using domain functions (matchesAllowlist, determineTrust). |
| 2.25.0 | 2026-04-06 | Email integration. §2: `emails`, `email_dead_letters` added to tables diagram. HTTP routes: `/email-upload-url`, `/email-webhook`, `/api/emails`. §3: `emails` table (19 fields, 4 indexes, 1 search index), `email_dead_letters` table. `users` gains `agentEmailAddress` + `by_agent_email_address` index. `relay_logs.channel` gains `"email"`. §5: added `emails.ts`, `emailActions.ts`, `emailRelay.ts`. §7.4: `emails` added to `USER_OWNED_TABLES` cleanup registry. `deleteAccount` clears `agentEmailAddress`. `auth.ts` schedules `provisionAgentEmail` for new users. `deliverQueued` now delivers pending emails on pod wake-up. |
| 2.24.0 | 2026-04-01 | Signup code gating system. §2: `signup_codes`, `signup_code_activations`, `signup_policies` added to tables diagram. §3: three new tables + `signupCodeId` on `users`. §5: added `signupCodes.ts`, `migrations/seedSignupPolicies.ts` to directory layout. §6.1: `requireAuth()` and `tryAuth()` gain signup policy gate — checks OPEN override (INV-05), INVITE_CODE fail-closed default (INV-11), un-activated user block (INV-09). Exceptions: `getMe`/`getMeSafe` use `getAuthUserId` directly (un-activated users must read own record); `redeemSignupCode` uses `getAuthUserId` directly (user authenticated but not yet activated). §10.1: 7 signup error codes added. |
| 2.23.0 | 2026-03-31 | Pod lifecycle hardening + account deletion fix. §3: `container_events.event` gains `"alert_stuck"`. §6.1: added `tryAuth()` soft auth guard — returns null instead of throwing for live subscription queries. Rule: mutations use `requireAuth` (hard throw), subscription queries use `tryAuth` (soft null). §6.6: added `execute-scheduled-tasks` and `alert-stuck-users` crons. `alertStuckUsers` fires `OPS_ALERT_WEBHOOK_URL` every 2min for users stuck in starting/provisioning. §7.2: `pollHealth` now resolves LB IP inline when `containerEndpoint` missing (prevents dead-end). `healthCheckAll` endpoint recovery expanded to include `"starting"` users. `cleanupStale` checks actual K8s state before escalating to error (recovers healthy pods). §16: added `OPS_ALERT_WEBHOOK_URL` env var (optional). |
| 2.22.0 | 2026-03-31 | **Slack integration removed.** §3: removed `"slack"` from `messages.source`, `integrations.provider`, and `relay_logs.channel` unions. §5: deleted `slackRelay.ts`, `clients/slack.ts`. Removed `connectSlack`, `startSlackOAuth`, `disconnectSlack`, `getSlackWebhookUrl`, `internalFindBySlackTeamId` from `integrations.ts`. Removed `validateAndSetupSlack`, `completeSlackOAuth`, `failSlackOAuth` from `integrationActions.ts`. Removed `insertSlackMessage` from `integrationInternal.ts`. Removed `/slack-webhook` and `/slack-oauth-callback` HTTP routes. Removed Slack reply routing from `relay.ts`. Removed `"slack"` from `RelayChannel` type. Removed Slack delivery from `scheduledTaskActions.ts`. Slack will be re-added in a future release. |
| 2.21.0 | 2026-03-30 | Delete-account hardening + async LB IP resolution. §5: `userActions.ts` gains `repairMissingEndpoints`. §6.3: `updateContainerStatus` now guards deleted/tombstoned users. §6.4: action pattern updated — `getInternal` callers MUST use try/catch (throws, never returns null). `provisionUser` returns `{ endpoint: string \| null }` — null if LB IP not yet assigned. `containerId` saved always; `containerEndpoint` only if resolved. §7.4: `USER_OWNED_TABLES` count updated to 13 (added `relay_logs`). Auth join table ordering rule added (children before parents). Post-cleanup invariant expanded to count auth join tables. `getInternal` try/catch rule added. Internal mutation tombstone guards added (`setPodState`, `updateContainerStatus`, `logEvent`, etc.). `healthCheckAll` now resolves missing LB IPs lazily (sole recovery path). |
| 2.20.0 | 2026-03-26 | WebSocket chat gateway. §2: `GET /api/ws-auth` added to HTTP routes diagram. §3: `messages.metadata` gains `clientMessageId` field. §5: `messages.ts` gains `persistUserMessage`/`persistAssistantMessage` mutations (WS write-back). `users.ts` gains `getForWsAuth` internal query. §6.5: `GET /api/ws-auth` HTTP route documented — validates Convex session JWT, returns `X-Pod-Upstream` header. §6.6: idle-scale-down cron removed (always-on pod policy). §7.2: `running` → `scaled_down` transition no longer automatic. §8: web chat no longer uses `sendMessage` → relay path; uses WS gateway + `persistUserMessage`/`persistAssistantMessage` write-back. |
| 2.19.0 | 2026-03-25 | Native Telegram channel. §5: `clients/telegram.ts` description updated — removed `setWebhook` (no longer called). `integrationActions.ts` updated — `validateAndSetup` only calls `deleteWebhook` (not `setWebhook`), passes `telegramBotToken` to `updateConfigMap`. `restartPodForIntegration` now decrypts Telegram bot token and passes to `updateConfigMap`. §8.1: Telegram integration lifecycle rewritten — ConfigMap now contains `[channels_config.telegram]` with decrypted bot token. Pod uses native long polling. Key difference section updated. §9: `gke.ts` `ConfigMapUpdateParams` and `ProvisionParams` gain `telegramBotToken?: string`. `podActions.ts` `provision`/`scaleUp` decrypt Telegram bot token from integrations. |
| 2.19.0 | 2026-03-31 | Thread soft delete + LinkedIn integration. §3: `threads` table gains `deletedAt` (soft delete). `integrations.provider` gains `"linkedin"`. §5: `threads.ts` gains `deleteThread` mutation (sets `deletedAt` tombstone). `listForUser` and `get` filter out soft-deleted threads. `integrationActions.ts`: `COMPOSIO_AUTH_CONFIGS` gains `linkedin` → `COMPOSIO_AUTH_CONFIG_LINKEDIN`, `COMPOSIO_PROVIDERS` set gains `"linkedin"`. `integrations.ts`: `startComposioOAuth` and `disconnectComposioIntegration` args gain `"linkedin"` literal. |
| 2.18.0 | 2026-03-21 | Google Sheets via Composio + Slack cleanup. §3: `integrations.provider` gains `"google_sheets"`. `relay_logs.channel` gains `"composio"`. §5: added `composioActions.ts`, `clients/composio.ts`, `clients/slack.ts` to directory layout. Updated `integrations.ts` description (Slack OAuth, Google Sheets Composio OAuth). Updated `integrationActions.ts` description (Slack/Composio OAuth). Updated `clients/telegram.ts` (added `getWebhookInfo`). HTTP routes: added `/composio-oauth-callback` (GET) and `/api/composio/execute` (POST, pod-auth). Manual Slack app setup removed (OAuth-only). |
| 2.17.0 | 2026-03-19 | Scheduled task hardening. §3: `scheduled_tasks` schema gains `lastError` (failure reason) and `failCount` (consecutive failures) for execution tracking. §5: `scheduledTasks.ts` description updated — cron parser now supports full standard syntax via `expandCronField` (*, */N, N,M, N-M, N-M/S). `scheduledTaskActions.ts` description updated — execution now uses `relayToPod()` with multi-channel fan-out on both success and failure. |
| 2.16.0 | 2026-03-19 | Unified relay helper + relay_logs observability. §3: `relay_logs` table added (userId, messageId, channel, outcome, httpStatus, latencyMs, podEndpoint, errorMessage). §5: added `relayHelpers.ts` (shared `relayToPod()` function + cleanup action) and `relayLogs.ts` (relay_logs mutations). §6.6: added `relay-log-cleanup` cron (24h interval, 30-day TTL). All three channel relays (web, Telegram, Slack) now call `relayToPod()` instead of inline fetch. Bug fix: Telegram and Slack now escalate `podState: "error"` on connection failures (was only web). |
| 2.15.0 | 2026-03-19 | Scheduled task execution. §3: `scheduled_tasks` table schema added with `channels` (delivery targets), `timezone` (IANA, for cron interpretation), `threadId` (web chat thread). |
| 2.14.0 | 2026-03-18 | Declarative pod lifecycle. §9: `gke.ts` public API updated — `scaleUp`, `restartDeployment`, `updateDeployment`, `verifyConfigMapDeploymentSync` removed, replaced by `buildDeploymentSpec` (pure spec builder) + `reconcileDeployment` (declarative create-or-replace). `scaleDown` unchanged (imperative patch, no drift risk). All callers in `podActions.ts` and `integrationActions.ts` migrated. |
| 2.13.0 | 2026-03-18 | Brain memory sync. §2: `brain_memories` added to tables diagram, `/api/brain-memories/sync` added to HTTP routes. §3: `brain_memories` table added to schema. §5: `brainMemories.ts` added to directory layout. |
| 2.12.0 | 2026-03-17 | Telegram webhook mode. §2: added `/telegram-webhook` HTTP route. §5: added `telegramRelay.ts` to directory layout, updated `clients/telegram.ts` (setWebhook, deleteWebhook, sendMessage). §6.5: added `/telegram-webhook` route documentation. §8.1: rewritten from pod long-polling to Convex webhook mode — Convex receives Telegram messages, relays to pod via `/api/chat`, sends replies via `sendMessage`. Pod has zero Telegram awareness. ConfigMap no longer contains `[channels_config.telegram]`. `IntegrationConfig` removed from `provisionUser` and `updateConfigMap` signatures. |
| 2.11.0 | 2026-03-17 | Relay migration `/webhook` → `/api/chat`. §8: relay now POSTs to `/api/chat` (full agent loop with memory tools) instead of `/webhook` (single-shot inference). No `session_id` sent — ZeroClaw's `build_memory_context` uses strict session filtering; omitting session_id enables global memory recall across channels (FMEA B1/B2). Response field `reply` added to parsing chain (`content ?? reply ?? response`). History prepend hack removed. `listThreadHistory` internal query removed. Gateway `request_timeout_secs` set to 120s for agent loop tool calls. Fetch uses `AbortSignal.timeout(120_000)`. |
| 2.10.0 | 2026-03-17 | Account deletion. §3: `users` table gains `deletedAt: v.optional(v.number())` + `by_deleted` index. §5: added `userActions.ts` (K8s deletion action), `userCleanup.ts` (convergent cleanup mutation with `USER_OWNED_TABLES` registry). `users.ts` gains `deleteAccount` public mutation. §7.4: new Account Deletion Lifecycle state machine (tombstone → cleaning → deleted). `requireAuth` + `getMeSafe` filter tombstoned users. `podActions.ts`: null-check guards on `pollHealth`, `scaleUp`, `scaleDown` for deleted users. |
| 2.9.0 | 2026-03-17 | Tool exclusion & convexUrl hardening. §9: `ConfigMapUpdateParams.convexUrl` changed from optional to required — `[http_request]` domain restriction is a security invariant. `ZEROCLAW_DEFAULT_EXCLUDED` corrected to match schema.rs (25 tools, was placeholder). All `updateConfigMap` callers now pass `process.env.CONVEX_URL!`. |
| 2.8.0 | 2026-03-17 | Persona, memory & scheduling. §2: added `personas`, `memories`, `scheduled_tasks` to tables diagram. HTTP routes: added `/api/schedules` and `/api/memories` (pod-auth via preSharedToken). Crons: added scheduled task execution (1-min interval). §3: new `personas`, `memories`, `scheduled_tasks` table schemas. `users` table gains `by_pre_shared_token` index. §5: added `personas.ts`, `memories.ts`, `scheduledTasks.ts`, `scheduledTaskActions.ts`, `migrations/backfillPersonas.ts`, `lib/httpAuth.ts`, `claw-workspace.ts` to domain. Relay now detects `[PERSONA_READY]` tags and strips them. `buildConfigToml()` now renders `[web_search]`, `[identity]`, `[http_request]` sections and `non_cli_excluded_tools`. Onboarding timeout auto-completes after 20 assistant messages. ScaleUp flow now reads persona + memories, builds workspace files, runs ConfigMap-Deployment reconciliation check. |
| 2.7.0 | 2026-03-15 | Thread-aware relay. `sendToContainer` and `insertAssistantMessage` now pass `threadId` so assistant responses appear in the correct thread. §6.3: relay code example updated. §6.5: container-webhook `insertAssistantMessage` call now includes `threadId`. §8: message flow diagram updated. |
| 2.6.0 | 2026-03-09 | Threading support. §2: added `threads` to tables list. §3: added threads table schema, `threadId` + `by_thread` index on messages. §5: added `threads.ts` to directory layout. §6.3: updated `sendMessage` mutation to accept optional `threadId`, insert into messages, and patch thread `lastMessageAt`. |
| 2.5.0 | 2026-03-07 | Telegram integration alignment. §2: tables diagram adds `telegram_identities`, `pairing_codes`. HTTP routes: multi-dispatch webhook pattern. §3: messages table extended with `source: "telegram"`, `metadata` object; new `pairing_codes` + `telegram_identities` tables. §5: added `integrations.ts`, `integrationActions.ts`, `integrationInternal.ts`, `clients/telegram.ts`, `telegram-validation.ts`. §6.5: container-webhook now dispatches on `body.type` (pairing_request, telegram_message, sync_error, default). §8.1: new Telegram message routing section. §9: added `clients/telegram.ts` API surface. §10.1: added 7 Telegram/pairing error codes. |
| 2.4.1 | 2026-03-07 | §6.5: Removed Stripe webhook stub from code example (no longer in http.ts). Moved Stripe dispatch notes to deferred comment block. Updated §2 architecture diagram to match. |
| 2.4.0 | 2026-03-07 | Integrate-provisioned-claw alignment. §5: added `getStartingUsers` to pods.ts. §6.5: container-webhook is now LIVE (not stub). §7.2: healthCheckAll monitors both running and starting pods. §8: relay payload sends `{ message }` not `{ content }`, response field is `content ?? response`. §16: removed `CLAW_IMAGE_TAG` (full URI in `CLAW_DOCKER_IMAGE`). |
| 2.3.0 | 2026-03-06 | Fixed §6.1 auth guard: replaced broken `identity.subject` / `by_google_id` lookup with `getAuthUserId()` from `@convex-dev/auth/server`. Moved `requireAuth` from `auth.ts` to `lib/requireAuth.ts` in directory layout. Updated `auth.ts` description to reflect Convex Auth config role. Updated §2.1 auth middleware description. |
| 2.2.0 | 2026-03-04 | E2E smoke test alignment. Split pods.ts into pods.ts (queries/mutations) + podActions.ts ("use node" actions). Renamed gcp-auth.ts → gcpAuth.ts (Convex forbids hyphens). Fixed cron refs to internal.podActions.*. Marked stripe webhook as stub. Added "use node" and module naming rules to §5.1. |
| 2.1.0 | 2026-03-04 | Post-implementation alignment. Schema: added podState/preSharedToken/lastActivityAt to users, status field to messages, scale_up/scale_down events. Renamed containers.ts→pods.ts. Added chat.ts (predictive wake-up). Container webhook now receives assistant messages (not usage telemetry). Crons: added idle-scale-down, deferred usage-aggregation and trial-expiry. New pod state machine (§7.2). Updated message routing with status tracking and rate limiting. |
| 2.0.0 | 2026-03-03 | Aligned with infra-doctrine v2.0. Removed Vertex AI, Composio, ghost chat. Updated schema, directory layout, GKE client API, message routing, env vars. |
| 1.0.0 | 2026-02-26 | Initial backend doctrine for Clawcraft |
