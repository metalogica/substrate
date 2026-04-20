# Example Frontend Doctrine (Vite + React + Web)

**Version**: 3.12.0
**Status**: Binding
**Date**: 2026-04-07
**App**: Clawcraft (Managed ZeroClaw Hosting Platform)

---

## 1. Authority

This document is **Binding**. Violations are architectural bugs.

Keywords MUST, MUST NOT, SHOULD, MAY follow RFC 2119.

**Reference Implementation**: `src/`

---

## 2. Model / Layer Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Vite + React SPA                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                    Routes (src/routes/)                   │   │
│  │  TanStack Router file-based routing                       │   │
│  │  Renders pages, composes hooks + components               │   │
│  │  ONLY layer that touches navigation                       │   │
│  └─────────────────────────┬────────────────────────────────┘   │
│                             │                                    │
│  ┌──────────────────────────▼───────────────────────────────┐   │
│  │              Layout Components (components/layout/)       │   │
│  │  AuthGuard, Sidebar, TopBar, MarketingHeader.              │   │
│  │  MAY use Convex auth, navigation, i18n, theme context.    │   │
│  │  Trust boundary enforcement + navigation structure.        │   │
│  └─────────────────────────┬────────────────────────────────┘   │
│                             │                                    │
│  ┌──────────────────────────▼───────────────────────────────┐   │
│  │                  Components (components/)                 │   │
│  │  Presentational UI. Props in, JSX out.                    │   │
│  │  No Convex hooks. No navigation. No business logic.       │   │
│  │  No validation logic. MAY use i18n (useTranslation).      │   │
│  └─────────────────────────┬────────────────────────────────┘   │
│                             │                                    │
│  ┌──────────────────────────▼───────────────────────────────┐   │
│  │              Providers (routes/__root.tsx)                  │   │
│  │  ThemeContext.Provider + Sentry.ErrorBoundary.             │   │
│  │  ConvexAuthProvider wraps entire app in main.tsx.          │   │
│  └─────────────────────────┬────────────────────────────────┘   │
│                             │                                    │
│  ┌──────────────────────────▼───────────────────────────────┐   │
│  │                    Hooks (hooks/)                          │   │
│  │  Convex queries/mutations, auth, theme, threads           │   │
│  │  Bridge between Convex/state and UI                       │   │
│  └─────────────────────────┬────────────────────────────────┘   │
│                             │                                    │
│  ┌──────────────────────────▼───────────────────────────────┐   │
│  │                   Domain (domain/)                         │   │
│  │  Pure TypeScript. Zero framework imports.                  │   │
│  │  Validation, formatting, shared types, business rules.     │   │
│  │  Lives at project root, NOT under src/.                    │   │
│  └─────────────────────────┬────────────────────────────────┘   │
│                             │                                    │
│  ┌──────────────────────────▼───────────────────────────────┐   │
│  │                    Convex Client                          │   │
│  │  useQuery, useMutation, useAction                         │   │
│  │  Real-time subscriptions (automatic)                      │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 2.1 Import / Dependency Rules

| Layer | MUST NOT import from | MAY import from |
|---|---|---|
| **Routes** (`src/routes/`) | Other routes | Components, Hooks, Domain, Convex API |
| **Layout components** (`components/layout/`) | Routes | Convex auth (`useConvexAuth`), TanStack Router navigation, Hooks (useTheme), i18n, other components |
| **Components** (`components/`) | Routes, Convex directly, Hooks (except useTheme/useTranslation) | Other components, Domain utils, i18n |
| **Engine components** (`components/engine/`) | Routes, Convex (`useQuery`/`useMutation`), React state (`useState`) for render data | Zustand store (`useEngineStore`), `@react-three/*`, `three`, other engine components, types |
| **Hooks** (`hooks/`) | Routes, Components | Convex API, Domain |
| **Engine hooks** (`hooks/use{NavMesh,BlendTree,RTSControls,AgentSync}`) | Routes, Components, Convex | Zustand store (`useEngineStore`), `three`, `@react-three/*`, types |
| **Store** (`store/`) | Routes, Components, Hooks | Types (`types/`), `zustand` |
| **Domain** (`domain/`) | Routes, Components, Hooks, Convex, React | Other domain modules only |
| **Providers** (`routes/__root.tsx`) | Routes, Components | Hooks (useTheme context), Sentry lib |
| **Utils** (`lib/`) | Routes, Components, Hooks | Domain, other utils, Sentry SDK, WebSocket API |

### 2.2 Boundary Rules

- MUST keep Convex calls (`useQuery`, `useMutation`, `useAction`) in hooks or route files. Never in components.
- MUST NOT use `fetch`, `axios`, or any HTTP client. All server communication goes through Convex. **Exception**: `wsManager.ts` uses the browser WebSocket API to connect to the Nginx WS gateway (`VITE_WS_GATEWAY_URL`) for streaming chat. This is the only non-Convex communication path.
- MUST NOT use `setInterval` or polling. Convex subscriptions handle all real-time updates.
- MUST keep validation logic in `domain/` or Convex args validators. Components MUST NOT validate.
- SHOULD keep route files thin — delegate UI to components, data to hooks.
- Components MAY use `useTranslation` (i18n) and `useTheme` (context read) — these are presentation concerns, not data fetching.
- Engine components (`components/engine/`) MUST read from Zustand store only — NEVER from `useQuery`, `useMutation`, or `useState` for data that affects rendering (Invariant I2, §12.2). `useFrame()` callbacks MUST use `useEngineStore.getState()` (non-reactive).
- Engine components MAY use inline `style={{}}` for values computed dynamically at runtime (screen-space positions, agent coordinates). Tailwind classes cover all static styling.

### 2.3 Path Aliases

Configured in `tsconfig.json` and `vite.config.ts`. Use these instead of relative paths:

| Alias | Maps To |
|---|---|
| `@/*` | `src/*` |
| `@convex/*` | `convex/*` |

---

## 3. Structural Conventions

### 3.1 Directory / Schema Layout

```
src/
├── routes/                           # TanStack Router routes
│   ├── __root.tsx                    # Root layout: ThemeContext.Provider, Sentry.ErrorBoundary
│   ├── index.tsx                     # Landing page (public, composes MarketingHeader + sections)
│   ├── login.tsx                     # Two-step login: code entry (INVITE_CODE) → Google OAuth. Pending code round-trips via OAuth state param (INV-12).
│   ├── _authenticated.tsx            # Auth-guarded layout: AuthGuard + Sidebar + TopBar + Outlet
│   └── _authenticated/
│       ├── chat.tsx                  # Chat layout (Outlet wrapper)
│       ├── chat/
│       │   ├── index.tsx             # Auto-creates thread, redirects to $threadId
│       │   └── $threadId.tsx         # Thread view: 3D backdrop + floating ChatWindow + mini navbar (Hide Board) + ThreadSidebar overlay
│       ├── chat-history.tsx          # Full thread list with delete (RecentThreads + New Chat button)
│       ├── dashboard.tsx             # Settings page (leaf route): SettingsContent with 6 flat sections (Instance, AI Config, Usage, Billing, Account, Danger Zone)
│       ├── integrations.tsx          # Integration panels: Telegram, Google Suite, Notion, Calendly, LinkedIn
│       └── support.tsx               # Full-page support form (BentoCard + SupportForm)
│
├── components/
│   ├── chat/
│   │   ├── ChatInput.tsx             # Input with Send, Paperclip (multimedia: images, PDFs, audio), Zap (Quick Actions popup). MIME validation + normalization via domain/media-constraints.ts
│   │   ├── ChatWindow.tsx            # Thread-aware message area (accepts threadId + authToken)
│   │   ├── MarkdownContent.tsx       # ReactMarkdown wrapper (remarkGfm + rehypeHighlight)
│   │   ├── MessageBubble.tsx         # Message bubble: MarkdownContent for assistant, linkify for user, PDF links, audio players
│   │   ├── MessageList.tsx           # Server + streaming + pending messages + typing indicator (bouncing dots)
│   │   ├── ChatResizeHandle.tsx      # Drag-to-resize handle for chat panel (sidebar-aware clamping)
│   │   ├── PodStatusBanner.tsx       # Pod + WS state banner: provisioning → connecting → connected (hidden). Props: isProvisioning, podState, wsState
│   │   ├── ThreadSidebar.tsx         # Thread list with active highlight
│   │   └── ToolCallBlock.tsx         # Non-interactive tool call status display (name + spinner)
│   ├── dashboard/
│   │   ├── DeleteAccountModal.tsx    # Portal modal with type-to-confirm ("DELETE")
│   │   ├── DeleteAccountPanel.tsx    # Account details + danger zone cards
│   │   ├── EmailIntegrationPanel.tsx # Email inbox setup: address display, copy button, allowlist manager. Pure — receives allowlist props from route.
│   │   ├── IntegrationCard.tsx
│   │   ├── SettingsContent.tsx       # Flat settings page: 6 H2 sections (Instance, AI Config, Usage, Billing, Account, Danger Zone)
│   │   ├── StatCard.tsx
│   │   ├── TelegramIntegrationPanel.tsx  # Full Telegram lifecycle UI
│   │   └── ComposioIntegrationPanel.tsx      # Generic Composio OAuth panel (Google Suite, Notion, Calendly, LinkedIn)
│   ├── inbox/
│   │   ├── AllowlistManager.tsx     # Sender allowlist CRUD: add (address/domain), remove, warning display for domain wildcards (FMEA #4). Pure presentational.
│   │   ├── EmailDetail.tsx          # Email detail view: from, subject, body, attachments, relay status
│   │   ├── EmailList.tsx            # Paginated email list: from, subject, date, unread indicator
│   │   └── UnreadBadge.tsx          # Coral badge with count (hidden when 0)
│   ├── landing/                      # 10 marketing sections (composed in index.tsx)
│   │   ├── HeroSection.tsx
│   │   ├── IntegrationsShowcase.tsx
│   │   ├── AgentDemoSection.tsx      # Typing/processing/result animation cycle
│   │   ├── AgentDiscoverySection.tsx # Segment × agent grid with expandable cards
│   │   ├── ComparisonSection.tsx     # Why Clawcraft tiles + comparison table
│   │   ├── HowItWorksSection.tsx
│   │   ├── FoundingPartnerSection.tsx
│   │   ├── PricingSection.tsx        # Self-Serve + Done-With-You tiers
│   │   ├── DataSovereigntySection.tsx
│   │   ├── FAQSection.tsx            # Accordion
│   │   └── FooterSection.tsx         # Final CTA + footer
│   ├── workroom/
│   │   └── RecentThreads.tsx         # Thread list with delete confirm, template badges + relative time
│   ├── support/
│   │   ├── SupportForm.tsx           # Contact form (email, topic, product, description, priority, attachment)
│   │   └── SupportModal.tsx          # Portal-based modal with AnimatePresence transitions
│   ├── ui/
│   │   ├── Badge.tsx                 # default/success/warning/error pill badges
│   │   ├── BentoCard.tsx             # Brutalist card with 24px radius, hover/shadow props for offset shadow
│   │   ├── Button.tsx                # primary/secondary/ghost with sm/md/lg sizes
│   │   ├── LobsterIcon.tsx           # Animated SVG (motion/react)
│   │   ├── Spinner.tsx               # Loader2 with animate-spin
│   │   └── Toast.tsx                 # Portal-based toast (bottom-center, Framer Motion)
│   ├── engine/                       # R3F 3D engine components (Phase 6)
│   │   ├── CommandViewport.tsx       # R3F Canvas wrapper (z-0 backdrop)
│   │   ├── LobsterAgent.tsx          # Animated lobster avatar with pathfinding
│   │   ├── LobsterModel.tsx          # GLTF model loader (SkeletonUtils clone)
│   │   ├── EnvironmentSetup.tsx      # Lights, fog, background color
│   │   ├── IsometricCamera.tsx       # OrbitControls with constrained angles
│   │   ├── OceanFloor.tsx            # 100x100 interaction plane
│   │   ├── SelectionRing.tsx         # Pulsing torus at selected agent
│   │   ├── MoveTargetMarker.tsx      # Fading ring at movement target
│   │   ├── RTSInputHandler.tsx       # Keyboard listener wrapper
│   │   ├── LobsterHUD.tsx            # Exports AgentBadge (selected agent name/status) + LobsterHUD (Minimap wrapper)
│   │   ├── NavigationHUD.tsx         # Camera pan/zoom buttons
│   │   ├── AgentInfoPanel.tsx        # Hover tooltip for agents
│   │   └── Minimap.tsx               # 192x192 overview with agent dots
│   └── layout/
│       ├── AuthGuard.tsx             # Auth check + orphaned session handling (getMeSafe)
│       ├── MarketingHeader.tsx       # Fixed top nav for public routes (logo, nav, CTAs)
│       ├── Sidebar.tsx               # Fixed w-52 left nav (desktop): New Chat button, nav items (Integrations, Settings), recent threads with rename/delete, user profile with copy ID
│       └── TopBar.tsx                # Fixed h-20 header (mobile) / sticky (desktop): theme toggle, support, sign out, hamburger mobile menu with full nav overlay
│
├── hooks/
│   ├── useAuth.ts                    # Wraps @convex-dev/auth (useConvexAuth + useAuthActions)
│   ├── useChat.ts                    # WS streaming chat: connect, send, persist, [MEDIA_UPLOAD] context injection, base64 gating (images ≤500KB). Returns { messages, streamingContent, toolEvents, isStreaming, wsState, sendMessage }
│   ├── useIntegrations.ts            # Integration queries + mutations (Telegram)
│   ├── usePodStatus.ts              # Pod lifecycle status. No containerEndpoint dependency — endpoints are deterministic ClusterIP DNS
│   ├── useTheme.ts                   # ThemeContext + useTheme (extracted for react-refresh)
│   ├── useThreads.ts                 # Thread CRUD (listForUser, create, updateTitle)
│   ├── useUser.ts                    # Current user query
│   ├── useAllowlist.ts               # Email sender allowlist CRUD (listAllowlist, addAllowlistEntry, removeAllowlistEntry)
│   ├── useDeleteAccount.ts           # Account deletion (mutation → signOut → redirect to /)
│   ├── useEmails.ts                  # Email inbox (paginated list, unread count, markAsRead)
│   ├── useRTSControls.ts             # Click-to-move input handling (3D engine)
│   ├── useNavMesh.ts                 # Recast navigation mesh pathfinding
│   ├── useBlendTree.ts               # Animation state machine (Idle/Walk/Run)
│   └── useAgentSync.ts               # Agent initialization (Convex → Zustand)
│
├── i18n/
│   ├── config.ts                     # i18next init (en/fr, 4 namespaces)
│   └── locales/
│       ├── en/
│       │   ├── common.json           # Nav, actions, shared labels
│       │   ├── landing.json          # All 10 landing sections
│       │   ├── dashboard.json        # Dashboard tabs, settings
│       │   └── chat.json             # Chat UI strings
│       └── fr/
│           └── common.json           # French translations (partial)
│
├── store/
│   ├── chatPanelStore.ts             # Zustand store: chat panel width, collapse state (sidebar-aware clamping)
│   └── useEngineStore.ts             # Zustand store: agent state, selection, orbit controls
│
├── types/
│   └── engine.types.ts               # AnimationName, AgentState, EngineConfig types
│
├── lib/
│   ├── logger.ts                     # logMutationError + logInfo (Sentry integration)
│   ├── sentry.ts                     # Sentry init (prod-only, conditional on DSN)
│   ├── utils.ts                      # cn() utility (clsx + tailwind-merge)
│   └── wsManager.ts                  # WebSocket connection manager (connect, send, reconnect, state tracking)
│
├── main.tsx                          # Vite entry point: i18n import, ConvexAuthProvider, RouterProvider
├── routeTree.gen.ts                  # Auto-generated by TanStack Router plugin
├── index.css                         # Tailwind v4 theme + design tokens + animations
└── vite-env.d.ts

domain/                               # At project root, NOT under src/
├── shared/
│   ├── result.ts
│   └── types.ts
├── claw-pod-identity.ts
├── claw-config.ts
└── telegram-validation.ts

archive/v1/                           # Preserved v1 codebase (git mv history)
```

### 3.2 Naming Conventions

| Object | Pattern | Example |
|---|---|---|
| Route files | `kebab-case.tsx` | `index.tsx`, `settings.tsx`, `_authenticated.tsx` |
| Components | `PascalCase.tsx` | `MessageBubble.tsx`, `StatCard.tsx` |
| Hooks | `useCamelCase.ts` | `useChat.ts`, `useAuth.ts` |
| Domain modules | `kebab-case.ts` | `claw-config.ts`, `telegram-validation.ts` |
| Utils | `camelCase.ts` | `utils.ts`, `logger.ts` |
| Component props | `{ComponentName}Props` | `MessageBubbleProps`, `SidebarProps` |
| Layout files | `_layout.tsx` or `__root.tsx` | — (TanStack Router convention) |
| i18n namespaces | `kebab-case.json` | `common.json`, `landing.json` |

---

## 4. Core Patterns

### 4.1 Auth Guard + Sidebar Layout

```tsx
// components/layout/AuthGuard.tsx
export function AuthGuard({ children }: { children: ReactNode }) {
  const { isLoading, isAuthenticated } = useConvexAuth();
  const { signOut } = useAuthActions();
  const user = useQuery(api.users.getMe, isAuthenticated ? {} : "skip");
  const policy = useQuery(api.signupCodes.checkSignupPolicy);
  const redeemCode = useAction(api.signupCodes.redeemSignupCode);

  // Don't redirect while a code exchange is in progress
  const hasAuthCode =
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).has("code");

  // Handle orphaned sessions — wait for auth to stabilize (2s) before
  // force-signing out. Prevents race where getMe returns null during
  // initial query hydration and triggers premature sign-out.
  const authStableRef = useRef(false);
  useEffect(() => {
    if (isAuthenticated) {
      const timer = setTimeout(() => { authStableRef.current = true; }, 2000);
      return () => clearTimeout(timer);
    }
    authStableRef.current = false;
  }, [isAuthenticated]);

  useEffect(() => {
    if (isAuthenticated && authStableRef.current && user === null && !signingOut.current) {
      signingOut.current = true;
      void signOut();
    }
  }, [isAuthenticated, user, signOut]);

  // Auto-redeem pending code from OAuth state parameter (INV-12)
  useEffect(() => {
    if (!isAuthenticated || !user || redeemingRef.current) return;
    if (user.signupCodeId !== undefined) return;
    const url = new URL(window.location.href);
    const pendingCode = url.searchParams.get("pendingCode");
    if (!pendingCode) return;
    redeemingRef.current = true;
    redeemCode({ code: pendingCode })
      .finally(() => {
        url.searchParams.delete("pendingCode");
        window.history.replaceState({}, "", url.toString());
        redeemingRef.current = false;
      });
  }, [isAuthenticated, user, redeemCode]);

  if (isLoading || hasAuthCode) return <Spinner />;
  if (!isAuthenticated) return <Navigate to="/login" search={{ pendingCode: undefined }} />;
  if (user === undefined || policy === undefined) return <Spinner />;

  // Route guard: un-activated user under INVITE_CODE policy → interstitial
  if (policy.mode === "INVITE_CODE" && user && user.signupCodeId === undefined) {
    return <SignupCodeInterstitial onSignOut={() => void signOut()} />;
  }

  return <>{children}</>;
}

// routes/_authenticated.tsx — Sidebar layout for all authenticated routes
// useUser() is inside AuthenticatedContent (not AuthenticatedLayout) so
// the getMe query only fires AFTER AuthGuard confirms authentication.
function AuthenticatedLayout() {
  return (
    <AuthGuard>
      <AuthenticatedContent />
    </AuthGuard>
  );
}

function AuthenticatedContent() {
  const { signOut } = useAuth();
  const { user } = useUser();
  const { threads, createThread, deleteThread, updateTitle } = useThreads();
  const navigate = useNavigate();

  const recentThreads = (threads ?? []).slice(0, 5).map((t) => ({ _id: t._id as string, title: t.title }));

  function handleNewChat() {
    // Reuse most recent thread if it's empty (no messages sent)
    const latest = threads?.[0];
    if (latest && latest.lastMessageAt === latest.createdAt) {
      void navigate({ to: "/chat/$threadId", params: { threadId: latest._id as string } });
      return;
    }
    createThread({ title: "New Chat" })
      .then((threadId) => void navigate({ to: "/chat/$threadId", params: { threadId: threadId as string } }))
      .catch(() => {});
  }

  return (
    <div className="min-h-screen bg-surface-light dark:bg-surface-dark">
      <Sidebar
        userId={user?._id}
        userName={user?.name ?? undefined}
        userImage={user?.image ?? undefined}
        recentThreads={recentThreads}
        onNewChat={handleNewChat}
        onDeleteThread={({ threadId }) => void deleteThread({ threadId: threadId as any })}
        onRenameThread={({ threadId, title }) => void updateTitle({ threadId: threadId as any, title })}
      />
      <main className="flex min-h-screen flex-col overflow-auto lg:ml-52">
        <TopBar onSignOut={() => void signOut()} onNewChat={handleNewChat} recentThreads={recentThreads} />
        <div className="flex-1"><Outlet /></div>
      </main>
    </div>
  );
}
```

Rules:
- MUST wrap authenticated route groups in `AuthGuard`.
- MUST redirect to `/login` if unauthenticated.
- MUST show a loading state while auth status is resolving OR while an OAuth code exchange is in progress (`?code=` in URL).
- MUST NOT render any authenticated content before auth is confirmed.
- MUST handle orphaned sessions (authenticated but no user record → force sign out), but MUST wait for auth to stabilize (~2s) before triggering sign-out to avoid race conditions during initial query hydration.
- MUST NOT call `useUser()` or other auth-dependent hooks outside of `AuthGuard` — place them in a child component rendered after the guard confirms authentication.
- MUST check signup policy gate: if `checkSignupPolicy.mode === "INVITE_CODE"` and `user.signupCodeId === undefined`, render `SignupCodeInterstitial` instead of children.
- MUST auto-redeem `?pendingCode=` from URL (INV-12) when user is authenticated but un-activated, then clean up the URL.
- Sidebar (`w-52`, 208px) is rendered once in `_authenticated.tsx`, hidden on mobile (`-translate-x-full lg:translate-x-0`).
- TopBar (`h-20`) is rendered once in `_authenticated.tsx`. On desktop: shows theme toggle, support, sign out. On mobile: shows hamburger icon that opens a full-screen animated menu with nav items, recent threads, and actions.
- Support is accessed via TopBar button (desktop) or mobile menu, opening `SupportModal` portal.
- Login redirects to `/chat` — the authenticated landing page. When INVITE_CODE policy is active, the login page shows a code entry step before OAuth. The validated code is encoded in `redirectTo` as `?pendingCode=` and round-trips through Google OAuth (INV-12).

### 4.2 WebSocket Streaming Chat

Chat uses a dual data path: WebSocket streaming for the current turn (real-time tokens), Convex `useQuery` for persisted history. The `useChat` hook orchestrates both.

```tsx
// hooks/useChat.ts — WS streaming + Convex persistence
export function useChat({ threadId, authToken }: { threadId: Id<"threads">; authToken: string }) {
  const rawMessages = useQuery(api.messages.listByThread, { threadId });
  const persistUser = useMutation(api.messages.persistUserMessage);
  const persistAssistant = useMutation(api.messages.persistAssistantMessage);

  // WS connection via wsManager (src/lib/wsManager.ts)
  // Connects to VITE_WS_GATEWAY_URL with authToken as query param
  // Streams: streamingContent (current assistant turn), toolEvents, wsState

  const sendMessage = useCallback(({ content }: { content: string }) => {
    // 1. Send over WebSocket (immediate)
    // 2. Persist user message to Convex (write-back)
    // 3. On assistant turn complete: persist assistant message to Convex
  }, [/* deps */]);

  return {
    messages: rawMessages ?? [],    // Persisted history from Convex
    streamingContent,               // Current assistant turn (live tokens)
    toolEvents,                     // Tool call events from current turn
    isStreaming,                    // Whether assistant is currently generating
    wsState,                        // WS connection state ("connecting" | "open" | "closed" | "error")
    sendMessage,
    isLoading: rawMessages === undefined,
  };
}

// hooks/useThreads.ts
export function useThreads() {
  const threads = useQuery(api.threads.listForUser);
  const createThread = useMutation(api.threads.create);
  const updateTitle = useMutation(api.threads.updateTitle);
  return { threads, createThread, updateTitle, isLoading: threads === undefined };
}

// Route: routes/_authenticated/chat/$threadId.tsx — overlay model
// Canvas fills container. Chat panel + HUD overlay on top via motion.div.
// Chat panel is resizable (chatPanelStore), translucent glass on desktop.
// Mobile: binary toggle — full chat OR full 3D world, never both.
const MemoizedViewport = React.memo(CommandViewport);

function ThreadView() {
  const { threadId } = Route.useParams();
  const [boardHidden, setBoardHidden] = useState(() => window.innerWidth < 1024);
  const { width, isCollapsed, setWidth, toggleCollapsed } = useChatPanelStore();
  useAgentSync();

  return (
    <div className="fixed inset-0 top-20 lg:left-52">
      {/* Canvas — outside motion.div so R3F measures correct dimensions */}
      {!boardHidden && <div className="absolute inset-0"><MemoizedViewport /></div>}

      <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
        className="pointer-events-none absolute inset-0 origin-center">

        {/* HUD: AgentBadge → NavigationHUD → Minimap, stacked bottom-right */}
        {!boardHidden && (
          <div className="pointer-events-none absolute inset-0 z-10">
            <div className="pointer-events-auto absolute bottom-4 right-4 flex w-48 flex-col items-stretch gap-3">
              <AgentBadge />
              <NavigationHUD />
              <LobsterHUD />  {/* renders Minimap only */}
            </div>
          </div>
        )}

        {/* Chat panel: full-width when board hidden, resizable overlay when visible */}
        {/* Mobile: max-lg:hidden when board is showing (binary toggle) */}
        <div style={boardHidden ? undefined : { width }}
          className={cn("pointer-events-auto z-20 flex min-h-0 flex-col",
            boardHidden ? "absolute inset-0 bg-white dark:bg-neutral-950"
              : "absolute inset-y-0 left-0 ... max-lg:hidden")} >
          {/* Mini navbar: lobster icon + agent status + Hide/Show Board toggle */}
          <ChatWindow className="flex-1 overflow-hidden" threadId={threadId} authToken={authToken} />
        </div>

        {/* Mobile: floating "Hide Board" pill over 3D world */}
        {!boardHidden && <button className="... lg:hidden" onClick={() => setBoardHidden(true)}>Hide Board</button>}
      </motion.div>
    </div>
  );
}
```

Rules:
- MUST treat `useQuery` returning `undefined` as loading state.
- MUST treat `useQuery` returning `[]` as empty (loaded, no data).
- MUST NOT add loading skeletons that flash — if data arrives in <100ms, show nothing.
- MUST provide a fallback default (`?? []`, `?? null`) in every hook.
- MUST pass `threadId` to all message queries and mutations.
- Rationale: Convex queries are reactive. No polling, no refetch, no cache invalidation needed.

### 4.3 Streaming Chat UI

User messages are shown immediately on send. Assistant responses stream token-by-token via WebSocket (`streamingContent`). Once the turn completes, messages are persisted to Convex and appear in the `useQuery` history. Tool calls are rendered inline via `ToolCallBlock`.

Rules:
- MUST show user messages immediately on send.
- MUST render streaming assistant text with a cursor indicator (replaces `TypingIndicator`).
- MUST persist both user and assistant messages to Convex on turn completion (write-back).
- MUST NOT disable the chat input based on pod/connection status.
- MUST render tool call events inline via `ToolCallBlock` during streaming.
- `PodStatusBanner` MUST show pod lifecycle state during provisioning ("Setting up..." / "Starting..."), then WS connection state once pod is running ("Connecting..." / hidden when connected). MUST suppress all banners when `podState === "scaled_down"` (intentional pause — no reconnect noise).
- `ChatWindow` lifts `wsState` to parent via `onWsStateChange` callback so the lobster status indicator in the chat header stays in sync with the banner.
- `TypingIndicator` is removed — replaced by streaming text with cursor.

### 4.4 Component Pattern (Pure Presentation)

```tsx
// components/chat/MessageBubble.tsx
interface MessageBubbleProps {
  role: string;
  content: string;
  pending?: boolean;
}

export function MessageBubble({ role, content, pending }: MessageBubbleProps) {
  const isUser = role === "user";

  return (
    <div className={cn("flex", isUser ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[85%] p-4 text-sm font-medium leading-relaxed",
          isUser
            ? "rounded-[14px_14px_4px_14px] bg-[#1A1A1A] text-white"
            : "rounded-[14px_14px_14px_4px] border border-black/5 bg-white/80 text-black shadow-sm backdrop-blur-sm dark:border-white/10 dark:bg-white/5 dark:text-white",
          pending && "opacity-60",
        )}
      >
        {content}
        {pending && (
          <Loader2 className="ml-2 inline-block h-3 w-3 animate-spin text-brand-coral" />
        )}
      </div>
    </div>
  );
}
```

Rules:
- MUST accept data via props. No Convex hooks inside presentational components.
- MUST be a named export (not default), except route files which use `createFileRoute`.
- MUST use Tailwind classes for styling. No inline styles, no CSS modules.
- MUST NOT import from `convex/react` or any data layer.
- MUST NOT contain validation logic. Validation lives in `domain/`.
- MAY use `useTranslation` and `useTheme` (presentation concerns).

### 4.5 Component Escalation: Container/UI/Skeleton

When a flat component grows beyond 100 lines or requires 3+ distinct loading/error states, split it:

```
components/dashboard/
└── UsageChart/
    ├── index.ts                    # Re-exports all three
    ├── UsageChart.container.tsx    # Hooks, data transformation, state
    ├── UsageChart.ui.tsx           # Pure presentation (props only)
    └── UsageChart.skeleton.tsx     # Loading placeholder
```

| File | Responsibility | Rules |
|---|---|---|
| `*.container.tsx` | Hooks, state, data transformation | MAY use hooks. Passes props to UI. |
| `*.ui.tsx` | Pure render | MUST NOT use hooks. MUST NOT have state. |
| `*.skeleton.tsx` | Loading placeholder | MUST NOT fetch data. |

This pattern is NOT required initially. Use it when a component becomes unwieldy, not preemptively.

### 4.6 Route File Patterns

**Chat routes use nested layout routing**: `chat.tsx` is a layout (Outlet wrapper), `chat/index.tsx` auto-creates a thread and redirects, `chat/$threadId.tsx` renders the overlay model — R3F Canvas fills container, chat panel overlays on top as a resizable translucent panel with mini navbar (lobster icon, agent status, Hide/Show Board toggle). `chatPanelStore` manages width + collapse state. Zoom entrance animation via `motion.div`. See §12.1 for z-axis layering.

**Settings route**: `dashboard.tsx` is a leaf route (no sub-nav, no Outlet). Renders `SettingsContent` — a single flat page with 6 H2 sections: Instance, AI Configuration, Usage, Billing, Account, Danger Zone. Centered `max-w-5xl` container.

**Integrations route**: `integrations.tsx` is a top-level leaf route. Renders integration panels in grid layout (`md:grid-cols-2 lg:grid-cols-3` for apps, `md:grid-cols-2 lg:grid-cols-3` for channels). Providers: Telegram, Email (with AllowlistManager), Google Suite (Sheets, Gmail, Docs, Slides, Calendar), Notion, Calendly, LinkedIn. Slack was removed in v3.9.0 and will be re-added in a future release. Cards use `BentoCard hover` with brutalist hover effects. Email panel receives allowlist data via `useAllowlist` hook wired in the route — `EmailIntegrationPanel` is pure (no Convex hooks).

**Inbox route** (`inbox.tsx`): Email inbox with two-column layout (list + detail). Uses `useEmails` hook for paginated email list and unread count. `EmailList`, `EmailDetail`, `UnreadBadge` are pure components. Sidebar shows "Inbox" link with real-time `UnreadBadge` (live Convex subscription via `countUnread`).

**Chat History route** (`chat-history.tsx`): Thread list page with `RecentThreads` component (inline delete confirm) and a "New Chat" button. Replaces the former Workroom hub.

**Support route** (`support.tsx`): Full-page render of `SupportForm` inside a `BentoCard`. Also accessible via TopBar button / mobile menu, opening `SupportModal` (AnimatePresence + createPortal).

Rules:
- Route components are internal to `createFileRoute`. No default exports.
- MUST compose hooks + components. Minimal logic in the route file itself.
- SHOULD be under 60 lines. If longer, extract a hook or component.
- Layout routes (chat.tsx) MUST render `<Outlet />`.

### 4.7 Validation Ownership

Validation logic MUST live in `domain/` (at project root), not in components or hooks.

Rules:
- Input validation MUST live in `domain/` or Convex args validators.
- Components MUST NOT contain validation logic.
- Hooks MAY call domain validation functions before invoking mutations.
- Convex mutations are the final authority — client-side validation is a UX convenience, never trusted.

---

## 5. Design System (Brutalist)

### 5.1 Design Tokens

Defined in `src/index.css` via Tailwind v4 `@theme` block:

| Token | Value | Usage |
|---|---|---|
| `--font-sans` | Switzer | Body text |
| `--font-heading` | Instrument Serif | Headings, hero |
| `--font-mono` | JetBrains Mono | Code, technical text |
| `--color-brand-coral` | `#FF7F50` | Primary accent, CTAs |
| `--color-brand-coral-dark` | `#D65A40` | Hover state for coral |
| `--color-accent-blue` | `#9FB2EB` | Secondary accents |
| `--color-accent-yellow` | `#FFD100` | Status highlights |
| `--color-accent-teal` | `#20A493` | Success indicators |
| `--color-accent-pink` | `#FF91E7` | Feature highlights |
| `--color-accent-green` | `#27CA40` | Online/active status |
| `--color-surface-light` | `#FAFAF6` | Light mode background |
| `--color-surface-dark` | `#0A0A0A` | Dark mode background |

### 5.2 Brutalist Conventions

- **Border radius**: `rounded-2xl` (16px) for cards (`BentoCard`), 14px for message bubbles, 12px for buttons/inputs
- **Borders**: `border-black` or `border-black/20` (light mode), `border-white/20` (dark mode). Sidebar uses `border-black/20`.
- **Shadows**: `BentoCard` supports `shadow` prop (static `shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]`) and `hover` prop (translate + shadow on hover). Settings/billing cards use static shadows. Grid cards use hover shadows.
- **Typography**: Serif headings (`font-heading`, Instrument Serif) at `text-4xl` for page titles. Section headers use `text-xl font-bold uppercase tracking-wider`. Meta labels use `text-[10px] font-black uppercase tracking-widest`.
- **User message bubbles**: Solid dark `bg-[#1A1A1A] text-white` (not tinted coral).
- **Agent message bubbles**: `bg-white/80 backdrop-blur-sm shadow-sm` (translucent on chat panel).
- **Motion**: `motion/react` (Motion v12) for entrance animations, hover effects. NOT `framer-motion`. Pages use staggered fade-in (`opacity: 0→1, y: 20→0` with 50ms delay per section). Chat view uses zoom entrance (`scale: 0.9→1`). Message bubbles animate in individually. Quick actions popover uses `AnimatePresence` with scale + fade.
- **Icons**: lucide-react library exclusively

### 5.3 Engine HUD Styling (Exception)

Engine overlay components (NavigationHUD, LobsterHUD, Minimap, AgentInfoPanel) use **glass-morphism** patterns (`bg-white/10 backdrop-blur-md border-white/10`) instead of Brutalist styling. This is intentional — engine overlays must be semi-transparent to show the 3D scene behind them. The ocean scene background (`#0d1b2a`) provides contrast for white-on-dark glass elements.

This exception applies ONLY to `components/engine/` — all other components MUST use the Brutalist conventions in §5.2.

### 5.4 Dark Mode

- Toggled via `.dark` class on root `<div>` (managed by `ThemeContext` in `__root.tsx`)
- Tailwind v4 variant: `@variant dark (&:where(.dark, .dark *))` in `index.css`
- Surface tokens: `bg-surface-light` / `bg-surface-dark`
- Text: `text-black` / `dark:text-white`
- Borders: `border-black` / `dark:border-white/20`

---

## 6. Internationalization (i18n)

Framework: `i18next` + `react-i18next`

```typescript
// src/i18n/config.ts — initialized as side-effect import in main.tsx
i18n.use(LanguageDetector).use(initReactI18next).init({
  resources: { en: { common, landing, dashboard, chat } },
  fallbackLng: "en",
  ns: ["common", "landing", "dashboard", "chat"],
  defaultNS: "common",
});
```

Rules:
- MUST use namespace-scoped translations: `useTranslation("landing")` not `useTranslation()`.
- Translation keys follow dot-notation: `t("hero.title")`, `t("nav.chat")`.
- JSON files live in `src/i18n/locales/{lang}/{namespace}.json`.
- All user-visible strings in landing and dashboard MUST use i18n keys.
- Components MAY call `useTranslation` directly (it's a presentation concern).

---

## 7. Observability

### 7.1 Sentry Error Tracking

```typescript
// src/lib/sentry.ts
Sentry.init({
  dsn: import.meta.env.VITE_SENTRY_DSN,
  environment: import.meta.env.MODE,
  enabled: import.meta.env.PROD && !!import.meta.env.VITE_SENTRY_DSN,
});
```

- `Sentry.ErrorBoundary` wraps the entire app in `__root.tsx`.
- Conditional init: disabled in dev and when DSN is not set.
- `VITE_SENTRY_DSN` is the only required env var for observability.

### 7.3 Environment Variables

| Variable | Purpose | Required |
|---|---|---|
| `VITE_SENTRY_DSN` | Sentry error tracking DSN | No (disabled when absent) |
| `VITE_WS_GATEWAY_URL` | WebSocket gateway URL (e.g., `wss://gw.clawcraft.ca`) | Yes (chat streaming) |

### 7.2 Structured Logging

```typescript
// src/lib/logger.ts
logMutationError({ mutation, args, error })  // → console.error + Sentry capture in prod
logInfo(message, context?)                    // → console.log with [info] prefix
```

Rules:
- MUST use `logMutationError` for all caught mutation errors in hooks.
- MUST NOT use bare `console.error` in production code paths.

---

## 8. Operational Rules

- MUST use TanStack Router for file-based routing. No manual route configuration.
- MUST use Tailwind CSS for all styling. No inline styles, no CSS modules, no CSS-in-JS. **Exception**: engine components (`components/engine/`) MAY use `style={{}}` for values computed dynamically at runtime (screen-space agent positions, minimap dot coordinates). Static styles MUST still use Tailwind.
- MUST NOT use `localStorage` or client-side persistence for app state. Convex is the source of truth for persistent data.
- MUST NOT use `fetch` or REST calls. All data flows through Convex.
- MUST NOT use `setInterval`, `setTimeout` for polling. Convex handles real-time.
- MUST use standard web OAuth flow for Google authentication.
- SHOULD keep the bundle size small — use dynamic imports for heavy features.
- SHOULD test on Chrome as the primary target.
- MUST support modern Firefox and Safari as secondary targets.
- NEVER store secrets, API keys, or tokens in client code or environment variables exposed to the browser.

---

## 9. Trust Boundaries

| Boundary | Enforcement |
|---|---|
| Unauthenticated → Authenticated routes | `AuthGuard` component wrapping `_authenticated.tsx` layout |
| Orphaned sessions | AuthGuard queries `getMeSafe` — if authenticated but user is null, force sign out |
| Client → Convex | All Convex functions validate auth server-side via `requireAuth()`. Client auth is UX only, never trusted. |
| Convex data → UI | Data from Convex queries is typed and trusted. No client-side re-validation needed. |
| User input → Mutations | MUST validate via `domain/` functions before calling mutations. Mutations re-validate server-side. |
| External OAuth callbacks → App | MUST validate callback parameters before passing to Convex. |
| Sensitive data display | API keys shown as `•••••` after entry. Never stored in React state beyond the input form. |
| OAuth tokens | Managed by Convex auth. Never manually stored in component state or localStorage. |

---

## 10. Error Handling Model

### Pattern: Error Boundaries + Toast Notifications

```tsx
// Root-level error boundary (Sentry) wraps entire app in __root.tsx
<Sentry.ErrorBoundary fallback={<ErrorFallback />}>
  <Outlet />
</Sentry.ErrorBoundary>

// Mutation errors → catch in hook, log, surface to user
const sendMessage = async ({ content }: { content: string }) => {
  try {
    await sendMessageMutation({ content, threadId });
  } catch (err) {
    logMutationError({ mutation: "sendMessage", args: { content }, error: err });
  }
};
```

### Invariants:
- Convex query errors MUST be caught by the nearest ErrorBoundary (Sentry at root).
- Convex mutation errors MUST be caught in the calling hook and surfaced as user-friendly messages.
- Network failures MUST show a "Reconnecting..." banner (Convex client handles reconnection automatically).

### Failure Semantics:
- Query returns `undefined` → show loading state, never crash.
- Mutation throws → catch, log via `logMutationError`, show toast, do NOT retry automatically.
- Auth expired → `AuthGuard` redirects to login. No error screen.
- Validation fails → show inline errors from `domain/` validator, do NOT call mutation.

---

## 11. Invariants

1. **Single source of truth**: All persistent app state lives in Convex. React state is only for ephemeral UI concerns (input text, sidebar open/closed, thread selection).

2. **Auth is server-validated**: Client-side auth guards are UX conveniences. Every Convex function re-validates auth. A user bypassing the client guard sees nothing because queries return nothing.

3. **Web-only**: This app targets modern web browsers (Chrome, Firefox, Safari). There is NO mobile support, NO native apps, NO cross-platform considerations. Use web APIs freely.

4. **No stale data**: Because Convex queries are reactive subscriptions, the UI MUST never show stale data. If the UI shows a container status of "provisioning," it is provisioning right now.

5. **Route files are thin**: A route file over 60 lines indicates missing abstraction. Extract a hook or component.

6. **Domain is framework-free**: `domain/` MUST NOT import from React, Convex, TanStack Router, or any framework. It is pure TypeScript shared across frontend, backend, and tests.

7. **Threads are first-class**: All chat messages belong to a thread. The chat UI MUST always operate in the context of a `threadId`.

8. **Engine isolation** (I2): R3F engine components read ONLY from Zustand store (`useEngineStore`), NEVER from React state or Convex query results. `useFrame()` callbacks use `useEngineStore.getState()` (non-reactive). All engine components are `React.memo()`.

9. **ChatWindow layout contract** (I3): ChatWindow MUST contain zero `position`, `width`, `height`, or `z-index` styles. It accepts a `className` prop for layout control. Parent route controls positioning.

---

## 12. 3D Engine Architecture (Phase 6)

### 12.1 Z-Axis Layering Model

The chat route (`/chat/$threadId`) uses a full-screen stacked layer model. The R3F canvas sits **outside** the motion.div to prevent `getBoundingClientRect()` from returning scaled dimensions during the zoom entrance animation.

```
Canvas:        absolute inset-0          (R3F, outside motion.div, never scaled)
motion.div:    absolute inset-0          (zoom animation wrapper, pointer-events-none)
  z-10  HUD:   pointer-events: none     (AgentBadge + NavigationHUD + Minimap, bottom-right stack)
         ↳ interactive items:            pointer-events: auto
  z-20  Chat panel:                      pointer-events: auto (resizable, translucent overlay)
  z-30  Resize handle:                   pointer-events: auto
z-30  Sidebar (global):                  fixed, desktop only
z-40  TopBar:                            sticky, always visible
z-50  Mobile menu:                       fullscreen AnimatePresence overlay
```

Every z-layer container MUST be `pointer-events-none`. Only leaf interactive elements get `pointer-events-auto`.

**Mobile behavior**: Binary board toggle. Default: board hidden, chat full-width with solid background. "Show Board" shows full-screen 3D with floating "Hide Board" pill. Chat panel hidden (`max-lg:hidden`) when board is visible.

### 12.2 Engine Data Flow

```
FORBIDDEN:
  React state (useState, useQuery) ──✗──► useFrame() / R3F component props

REQUIRED:
  Convex query → React hook → useEngineStore.setState()
  useFrame() ← useEngineStore.getState() (non-reactive read)
  R3F components ← useEngineStore(selector) (Zustand selector)
```

### 12.3 Performance

- `CommandViewport` is wrapped in `React.memo()` with ZERO props.
- `<Stats />` from `@react-three/drei` is included in dev mode for FPS monitoring.
- Chat UI re-renders (new messages, typing) MUST NOT trigger R3F scene re-renders.
- If FPS drops below 30 during chat activity, there is an isolation violation.

---

## 12. Testing Expectations

| Layer | Test Focus | Tool |
|---|---|---|
| Components | Render with props, snapshot stability | Vitest + React Testing Library |
| Hooks | Convex query/mutation integration, state derivation | Vitest + Convex mock provider |
| Domain | Validation logic, formatters, pure functions | Vitest (no mocks needed) |
| Routes | Navigation flow, auth redirect | Playwright (web) |
| Auth E2E | Signup → OAuth → chat → dashboard | Playwright |
| Cross-browser | Chrome, Safari, Firefox rendering | Manual QA |

---

## 13. Change Protocol

- Modifications REQUIRE:
  - New routes require corresponding layout files if introducing a route group.
  - New Convex functions require a corresponding hook in `hooks/`.
  - Component API changes (props) require updating all consumers.
  - New validation rules require a `domain/` function, not inline logic.
  - New user-visible strings MUST use i18n keys in the appropriate namespace.

- Security review required when:
  - Auth flow is modified.
  - New OAuth scopes are requested.
  - Any data is persisted client-side.
  - Trust boundary rules in §9 are modified.

- Backwards compatibility rules:
  - Route paths MUST NOT change without redirect handling (breaks bookmarks, shared links).
  - Hook return shapes SHOULD be extended, not modified (add fields, don't rename).

---

## 14. Build Configuration

### 14.1 Vite Config

```typescript
// vite.config.ts
import { TanStackRouterVite } from "@tanstack/router-plugin/vite";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [TanStackRouterVite(), react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@convex": path.resolve(__dirname, "./convex"),
      "@domain": path.resolve(__dirname, "./domain"),
    },
  },
  build: {
    target: "esnext",
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks: {
          three: ["three", "@react-three/fiber", "@react-three/drei"],
          vendor: ["react", "react-dom", "zustand"],
          convex: ["convex"],
        },
      },
    },
  },
  server: {
    port: 8080,
    open: true,
    allowedHosts: true,
  },
});
```

Key changes from v2:
- Tailwind CSS v4 uses `@tailwindcss/vite` plugin (replaces PostCSS-based `tailwindcss` + `autoprefixer`).
- No `tailwind.config.js` or `postcss.config.js` — theme is defined in CSS via `@theme` block.
- Three.js manual chunk restored (Phase 6 3D engine migration). Zustand added to vendor chunk.

### 14.2 Tailwind v4 Configuration

Tailwind v4 uses CSS-native configuration instead of JS config files:

```css
/* src/index.css */
@import "tailwindcss";
@plugin "@tailwindcss/typography";
@import "highlight.js/styles/github-dark.min.css";
@variant dark (&:where(.dark, .dark *));
@theme {
  --font-sans: "Switzer", ui-sans-serif, system-ui, sans-serif;
  --color-brand-coral: #FF7F50;
  /* ... */
}
```

Rules:
- MUST NOT create `tailwind.config.js` or `postcss.config.js`. These are v3 patterns.
- All theme tokens MUST be defined in the `@theme` block in `index.css`.
- Custom utility classes (`.bento-card`) are defined as plain CSS in `index.css`.
- `@plugin "@tailwindcss/typography"` enables `prose` classes for markdown rendering.
- `highlight.js/styles/github-dark.min.css` provides syntax highlighting in fenced code blocks.

### 14.4 Markdown Rendering

Assistant messages render GitHub-Flavored Markdown via `MarkdownContent.tsx`:

- **Dependencies:** `react-markdown`, `remark-gfm`, `rehype-highlight`, `@tailwindcss/typography`
- **Assistant bubbles:** Use `<MarkdownContent>` with `prose prose-sm dark:prose-invert max-w-none` classes. Renders headings, bold, italic, lists, tables, inline code, and fenced code blocks with syntax highlighting.
- **User bubbles:** Remain plain text with `linkify()` URL auto-linking. No markdown processing.
- **Streaming:** `react-markdown` handles partial markdown gracefully (unclosed code fences render as open blocks). The streaming cursor (`▍`) is a separate `<span>` outside the markdown content to avoid being swallowed in code fences.
- **Prose overrides** in `index.css`: brand-coral links, JetBrains Mono for `code`, `rounded-lg` on `pre` blocks, collapsed first/last child margins.
- **Security:** `react-markdown` builds a React tree (no `dangerouslySetInnerHTML`). Do NOT add `rehype-raw`.

### 14.3 TypeScript Config

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "paths": {
      "@/*": ["./src/*"],
      "@convex/*": ["./convex/*"]
    }
  },
  "include": ["src"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
```

Rules:
- `app:compile` MUST use `tsc --noEmit` for type-checking only.
- `app:lint` MUST use ESLint with TypeScript parser.
- `build` MUST run type-checking before Vite build.

---

## Document History

| Version | Date | Changes |
|---|---|---|
