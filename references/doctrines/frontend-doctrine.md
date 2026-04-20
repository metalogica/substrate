# Substrate Frontend Doctrine

**Version**: 1.0.0
**Status**: Binding
**Date**: 2026-04-20

---

## 1. Authority

This document is **Binding**. Violations are architectural bugs.

Keywords MUST, MUST NOT, SHOULD, MAY follow RFC 2119.

**Reference Implementation**: `src/`

**Sibling doctrines**: [domain-doctrine.md](./domain-doctrine.md), [backend-doctrine.md](./backend-doctrine.md)

**Stack**: Vite + React 18 + TanStack Router + Tailwind CSS v4 + Clerk (auth) + Convex (data + realtime).

---

## 2. Layer Architecture

```
┌──────────────────────────────────────────────────────────┐
│                  Vite + React SPA                         │
├──────────────────────────────────────────────────────────┤
│                                                           │
│  ┌─────────────────────────────────────────────────────┐ │
│  │            Routes (src/routes/)                      │ │
│  │  TanStack Router file-based routing                  │ │
│  │  ONLY layer that composes pages                      │ │
│  └────────────────────────┬────────────────────────────┘ │
│                           │                               │
│  ┌────────────────────────▼────────────────────────────┐ │
│  │    Layout Components (src/components/layout/)        │ │
│  │  AuthGuard, Shell, TopBar, Sidebar                    │ │
│  │  MAY use Clerk auth, navigation, theme context       │ │
│  └────────────────────────┬────────────────────────────┘ │
│                           │                               │
│  ┌────────────────────────▼────────────────────────────┐ │
│  │           Components (src/components/)               │ │
│  │  Presentational UI. Props in, JSX out.               │ │
│  │  No Convex hooks. No navigation. No business logic.  │ │
│  └────────────────────────┬────────────────────────────┘ │
│                           │                               │
│  ┌────────────────────────▼────────────────────────────┐ │
│  │              Hooks (src/hooks/)                      │ │
│  │  Bridge Convex queries/mutations + Clerk to UI       │ │
│  └────────────────────────┬────────────────────────────┘ │
│                           │                               │
│  ┌────────────────────────▼────────────────────────────┐ │
│  │            Domain (imported from @domain/*)          │ │
│  │  Pure validation, formatting, shared types           │ │
│  └────────────────────────┬────────────────────────────┘ │
│                           │                               │
│  ┌────────────────────────▼────────────────────────────┐ │
│  │         Convex Client (useQuery, useMutation)        │ │
│  │  Real-time subscriptions — automatic                 │ │
│  └──────────────────────────────────────────────────────┘ │
│                                                           │
└──────────────────────────────────────────────────────────┘
```

### 2.1 Import Rules

| Layer | MUST NOT import | MAY import |
|-------|-----------------|------------|
| Routes (`src/routes/`) | Other route files | Layout components, components, hooks, domain |
| Layout (`src/components/layout/`) | Routes | Clerk hooks, TanStack Router navigation, hooks, components |
| Components (`src/components/`) | Routes, `convex/react`, `@clerk/clerk-react` | Other components, domain utilities, theme context |
| Hooks (`src/hooks/`) | Routes, components | Convex API, Clerk hooks, domain |
| Domain (`domain/`) | Routes, components, hooks, Convex, React, Clerk | Other domain modules only |

### 2.2 Boundary Rules

- Convex hooks (`useQuery`, `useMutation`, `useAction`) MUST live in the `hooks/` layer or in route files. Never in presentational components.
- MUST NOT use `fetch` / `axios`. All server communication goes through Convex or the Clerk SDK.
- MUST NOT use `setInterval` / polling. Convex subscriptions handle real-time updates.
- Validation logic MUST live in `domain/` or Convex args validators. Components MUST NOT validate.
- SHOULD keep route files thin — delegate UI to components, data to hooks.

### 2.3 Path Aliases

Configured in `tsconfig.json` and `vite.config.ts`:

| Alias | Maps To |
|-------|---------|
| `@/*` | `src/*` |
| `@convex/*` | `convex/*` |
| `@domain/*` | `domain/*` |
| `@test/*` | `test/*` |

Use aliases instead of relative paths (`../../domain/x`).

---

## 3. Structural Conventions

### 3.1 Directory Layout

```
src/
├── routes/                           # TanStack Router file-based routing
│   ├── __root.tsx                    # Root layout: providers (Clerk, Convex, Theme)
│   ├── index.tsx                     # Public landing
│   ├── sign-in.tsx                   # Clerk <SignIn/>
│   ├── _authenticated.tsx            # Auth guard + shell
│   └── _authenticated/
│       └── {feature}.tsx             # Authenticated routes
│
├── components/
│   ├── layout/
│   │   ├── AuthGuard.tsx             # Clerk auth check
│   │   ├── Shell.tsx                 # App shell (sidebar + topbar)
│   │   ├── Sidebar.tsx
│   │   └── TopBar.tsx                # Includes Clerk <UserButton/>
│   ├── ui/                           # Design primitives (Button, Input, Card)
│   └── {feature}/                    # Feature-specific presentational
│
├── hooks/
│   ├── use{Feature}.ts               # Convex bridge (e.g. usePosts, useUser)
│   └── useTheme.ts
│
├── lib/
│   ├── utils.ts                      # cn() + small utilities
│   └── logger.ts                     # logInfo, logMutationError
│
├── main.tsx                          # Vite entry
├── index.css                         # Tailwind v4 @theme block + tokens
└── routeTree.gen.ts                  # Auto-generated by @tanstack/router-plugin
```

### 3.2 Naming Conventions

| Object | Pattern | Example |
|--------|---------|---------|
| Route files | `kebab-case.tsx` | `sign-in.tsx`, `settings.tsx` |
| Components | `PascalCase.tsx` | `PostCard.tsx`, `UserAvatar.tsx` |
| Hooks | `useCamelCase.ts` | `usePosts.ts`, `useAuth.ts` |
| Utils | `camelCase.ts` | `utils.ts`, `logger.ts` |
| Component props | `{Component}Props` | `PostCardProps` |
| Layout files | `_layout.tsx` or `__root.tsx` | TanStack Router convention |

---

## 4. Core Patterns

### 4.1 Auth Provider (Clerk + Convex)

```tsx
// src/main.tsx

import { ClerkProvider, useAuth } from "@clerk/clerk-react";
import { ConvexProviderWithClerk } from "convex/react-clerk";
import { ConvexReactClient } from "convex/react";
import { RouterProvider } from "@tanstack/react-router";
import { createRoot } from "react-dom/client";
import { router } from "./router";

const convex = new ConvexReactClient(import.meta.env.VITE_CONVEX_URL);

createRoot(document.getElementById("root")!).render(
  <ClerkProvider publishableKey={import.meta.env.VITE_CLERK_PUBLISHABLE_KEY}>
    <ConvexProviderWithClerk client={convex} useAuth={useAuth}>
      <RouterProvider router={router} />
    </ConvexProviderWithClerk>
  </ClerkProvider>
);
```

### 4.2 Auth Guard

```tsx
// src/components/layout/AuthGuard.tsx

import { useAuth } from "@clerk/clerk-react";
import { Navigate } from "@tanstack/react-router";

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { isLoaded, isSignedIn } = useAuth();

  if (!isLoaded) return <Spinner />;
  if (!isSignedIn) return <Navigate to="/sign-in" />;

  return <>{children}</>;
}
```

```tsx
// src/routes/_authenticated.tsx

import { createFileRoute, Outlet } from "@tanstack/react-router";
import { AuthGuard } from "@/components/layout/AuthGuard";
import { Shell } from "@/components/layout/Shell";

export const Route = createFileRoute("/_authenticated")({
  component: () => (
    <AuthGuard>
      <Shell>
        <Outlet />
      </Shell>
    </AuthGuard>
  ),
});
```

Rules:
- MUST wrap authenticated route groups in `AuthGuard`.
- MUST redirect unauthenticated users to `/sign-in`.
- MUST show a loading state while `isLoaded === false`.
- MUST NOT render authenticated content before auth is confirmed.

### 4.3 Hook Pattern (Convex Bridge)

```tsx
// src/hooks/usePosts.ts

import { useQuery, useMutation } from "convex/react";
import { api } from "@convex/_generated/api";

export function usePosts() {
  const posts = useQuery(api.posts.listMyPosts);
  const create = useMutation(api.posts.createPost);

  return {
    posts: posts ?? [],
    isLoading: posts === undefined,
    createPost: ({ title, body }: { title: string; body: string }) =>
      create({ title, body }),
  };
}
```

Rules:
- Hooks MUST be the bridge between Convex + Clerk and UI. Components never import from `convex/react` or `@clerk/clerk-react` directly.
- MUST provide a fallback (`?? []`, `?? null`) so consumers never see `undefined`.
- MUST expose a minimal, named API (`{ posts, isLoading, createPost }`), not raw query/mutation handles.
- SHOULD group feature logic in one hook file (`usePosts`, not `useListPosts` + `useCreatePost`).

### 4.4 Component Pattern (Pure Presentation)

```tsx
// src/components/posts/PostCard.tsx

interface PostCardProps {
  title: string;
  body: string;
  publishedAt?: string;
}

export function PostCard({ title, body, publishedAt }: PostCardProps) {
  return (
    <article className="rounded-2xl border border-black/10 p-6 shadow-sm">
      <h2 className="text-xl font-semibold">{title}</h2>
      <p className="mt-2 text-sm text-black/70">{body}</p>
      {publishedAt && (
        <p className="mt-4 text-xs text-black/50">{publishedAt}</p>
      )}
    </article>
  );
}
```

Rules:
- MUST accept data via props. No Convex hooks, no Clerk hooks inside presentational components.
- MUST be a named export (not default), except route components which use `createFileRoute`.
- MUST use Tailwind classes for styling. No inline styles, no CSS modules.
- MUST NOT import from `convex/react` or `@clerk/clerk-react`.
- MUST NOT contain validation logic. Validation lives in `domain/`.

### 4.5 Route File Pattern

```tsx
// src/routes/_authenticated/posts.tsx

import { createFileRoute } from "@tanstack/react-router";
import { usePosts } from "@/hooks/usePosts";
import { PostCard } from "@/components/posts/PostCard";

export const Route = createFileRoute("/_authenticated/posts")({
  component: PostsPage,
});

function PostsPage() {
  const { posts, isLoading } = usePosts();
  if (isLoading) return <Spinner />;

  return (
    <div className="grid gap-4">
      {posts.map((p) => (
        <PostCard key={p._id} title={p.title} body={p.body} />
      ))}
    </div>
  );
}
```

Rules:
- Route components are internal to `createFileRoute`. No default exports.
- MUST compose hooks + components. Minimal logic in the route file itself.
- SHOULD be under 60 lines. If longer, extract a hook or component.
- Layout routes MUST render `<Outlet />`.

### 4.6 Component Escalation: Container / UI / Skeleton

When a component exceeds 100 lines OR needs 3+ distinct loading/error states, split it:

```
src/components/posts/
└── PostList/
    ├── index.ts                    # Re-exports all three
    ├── PostList.container.tsx      # Hooks, data transformation
    ├── PostList.ui.tsx             # Pure render (props only)
    └── PostList.skeleton.tsx       # Loading placeholder
```

| File | Responsibility | Rules |
|------|----------------|-------|
| `*.container.tsx` | Hooks, state, data transformation | MAY use hooks |
| `*.ui.tsx` | Pure render | MUST NOT use hooks |
| `*.skeleton.tsx` | Loading placeholder | MUST NOT fetch data |

Do NOT escalate preemptively. Start flat.

---

## 5. Styling (Tailwind v4)

Tailwind v4 uses CSS-native configuration instead of a JS config file.

```css
/* src/index.css */

@import "tailwindcss";
@variant dark (&:where(.dark, .dark *));

@theme {
  --font-sans: ui-sans-serif, system-ui, sans-serif;
  --color-brand: #4F46E5;
  --color-surface-light: #FAFAFA;
  --color-surface-dark: #0A0A0A;
}
```

Rules:
- MUST NOT create `tailwind.config.js` or `postcss.config.js` (v3 patterns).
- Design tokens MUST be defined in the `@theme` block in `src/index.css`.
- MUST use `@tailwindcss/vite` plugin in `vite.config.ts`.
- Dark mode via `@variant dark (&:where(.dark, .dark *))` and a `.dark` class on a root element.

---

## 6. Operational Rules

- MUST use TanStack Router for routing. No manual route config.
- MUST NOT use `localStorage` for persistent app state. Convex is the source of truth.
- MUST NOT use `fetch` or REST calls. All data flows through Convex or the Clerk SDK.
- MUST NOT use `setInterval` / `setTimeout` for polling. Convex handles real-time.
- MUST keep secrets out of client code. Only `VITE_CLERK_PUBLISHABLE_KEY` and `VITE_CONVEX_URL` are client-safe env vars.
- SHOULD use dynamic imports for heavy features.
- NEVER expose Clerk secret keys or Convex deploy keys in client-visible env vars.

---

## 7. Trust Boundaries

| Boundary | Enforcement |
|----------|-------------|
| Unauthenticated → Authenticated routes | `AuthGuard` in `_authenticated.tsx` |
| Client → Convex | Every Convex function re-validates via `requireAuth`. Client-side guards are UX only. |
| Clerk session → Convex | `ConvexProviderWithClerk` passes the JWT on every call. |
| User input → Mutation | MUST validate via `domain/` before calling mutations. |
| Secrets | NEVER in client code. Only `VITE_CLERK_PUBLISHABLE_KEY` + `VITE_CONVEX_URL`. |

---

## 8. Error Handling

- Convex query errors → caught by the nearest React `ErrorBoundary`.
- Mutation errors → caught in the hook, logged via `logMutationError`, surfaced as toast.
- Query returning `undefined` → loading state, never crash.
- Validation failures → inline error from `domain/`; DO NOT call the mutation.

```tsx
// src/hooks/usePosts.ts
const create = useMutation(api.posts.createPost);

const createPost = async ({ title, body }: { title: string; body: string }) => {
  try {
    return await create({ title, body });
  } catch (err) {
    logMutationError({ mutation: "createPost", args: { title }, error: err });
    throw err;
  }
};
```

---

## 9. Invariants

1. **Single source of truth**: persistent app state lives in Convex. React state is only for ephemeral UI (open/closed, input drafts).
2. **Auth is server-validated**: client-side guards are UX conveniences. Every Convex function re-checks.
3. **No stale data**: Convex queries are reactive; if the UI shows a value, it is current.
4. **Route files are thin**: a route over 60 lines indicates missing abstraction.
5. **Domain is framework-free**: `domain/` MUST NOT import React, Convex, TanStack Router, Clerk, or any framework.
6. **Web-only**: substrate targets modern web browsers. No mobile-native, no React Native.

---

## 10. Testing Expectations

| Layer | Tool | Focus |
|-------|------|-------|
| Domain (called from hooks) | Vitest | Pure logic |
| Hooks | Vitest + Convex mock | Query/mutation wiring |
| Components | Vitest + Testing Library | Render with props |
| Routes | Playwright | Navigation, auth redirect |
| Auth E2E | Playwright + Clerk testing tokens | Sign in → authenticated route |

---

## 11. Change Protocol

- New routes require corresponding layout files if introducing a route group.
- New Convex functions require a corresponding hook in `hooks/`.
- Route paths MUST NOT change without redirect handling (breaks bookmarks).
- Hook return shapes SHOULD be extended, not modified (add fields; don't rename).

### Security Review Required

- Auth flow changes.
- New OAuth scopes.
- Any data persisted client-side.
- Trust boundary rules modified.
