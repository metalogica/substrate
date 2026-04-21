---
name: migrate
description: "Migrate a Gemini AI Studio prototype into the substrate kernel. Expects prototype/ (Gemini Build export) alongside a scaffolded substrate project. Spawns domain/backend/frontend architects in parallel to analyze the prototype against substrate doctrines, drafts Convex schema + functions from inferred data shapes, moves components into src/ with doctrine alignment, wires Clerk+Convex providers, and presents a migration plan for approval before executing. Invoke after /substrate:init + Gemini handoff, before /substrate:deploy."
---

# /substrate:migrate

Bring a Gemini AI Studio prototype into the substrate kernel. This is stage 2 — turning a standalone Vite app (frontend only, mock data) into a full-stack Vite + Convex + Clerk project aligned to the three doctrines.

**Heads up:** this is a multi-minute operation. It spawns three architect subagents in parallel, then executes many file writes with verification gates between each sub-step. Narrate progress so the user sees what's happening.

## When to run

- `prototype/` directory exists at the repo root (Gemini Build ZIP extracted there).
- Scaffold exists: `package.json` at repo root + `docs/doctrine/` + `domain/` + `convex/` + `test/`.
- User has finished iterating on the prototype in AI Studio.

## When to REFUSE

| Signal | Redirect |
|--------|----------|
| `prototype/` missing | Wait for the Gemini export. Run `/substrate:init` first if needed, or drop the ZIP contents into `prototype/`. |
| `package.json` at repo root missing | Project not scaffolded. Run `/substrate:init` first. |
| `src/App.tsx` no longer shows the substrate welcome screen | Migration already ran. Use `/substrate:quick-spec` or `/substrate:architect-spec` for further work. |

## Workflow

### Step 1. Stage sanity check

Run:

```bash
test -f package.json && test -d domain && test -d convex && test -d prototype || echo "STAGE_MISMATCH"
```

If any check fails, stop and redirect the user.

Verify `src/App.tsx` still contains the string `"Substrate project initialized"`. If not, migration has already run — ask the user before proceeding (step 5 is destructive to `src/`).

### Step 2. Load the prototype

**First, detect the prototype root.** The Gemini ZIP extracts with a project-named wrapper folder (e.g. `curd-connect/`), and `/substrate:init` tells users to drag that whole folder into `/prototype/`. So the expected layout is **nested**:

```
prototype/<project-name>/package.json
prototype/<project-name>/src/
prototype/<project-name>/vite.config.ts
```

Resolve `PROTOTYPE_ROOT` via this logic:

1. If `prototype/package.json` exists → the prototype is **flat**. `PROTOTYPE_ROOT=prototype`.
2. Else if `prototype/` contains exactly ONE subdirectory (excluding `.gitkeep` / dotfiles) and that subdirectory has `package.json` → the prototype is **nested**. `PROTOTYPE_ROOT=prototype/<subdir>`.
3. Else if `prototype/` is empty (still just `.gitkeep`) → the user hasn't extracted the Gemini ZIP yet. Stop and tell them.
4. Else → ambiguous (multiple candidate subdirs or no `package.json` anywhere). Stop and ask the user which path is the prototype root.

Use `$PROTOTYPE_ROOT` everywhere below instead of hardcoded `prototype/`.

Then map the prototype's shape before dispatching architects. Use Glob + Read:

- `$PROTOTYPE_ROOT/src/**/*.tsx` — components + pages
- `$PROTOTYPE_ROOT/src/**/*.ts` — utilities, types, mock data
- `$PROTOTYPE_ROOT/package.json` — reveals which libs Gemini chose (router, state)
- `$PROTOTYPE_ROOT/src/App.tsx` — entry / layout
- `$PROTOTYPE_ROOT/src/main.tsx` — bootstrapping (usually trivial)
- Any `types.ts` / `types/*.ts` — data shapes
- Any file matching `*mock*` / `*seed*` / `*sample*` / `data.ts` — mock data sources

You don't need to read every component in full — sample them to understand structure. Pass the resolved `$PROTOTYPE_ROOT` through to the architect dispatches in step 3 so they look at the correct path.

### Step 3. Dispatch architects in parallel

Spawn the three architect subagents via the Agent tool **in a single message with three parallel tool calls**. Each gets a migration-focused prompt.

**domain-architect:**

> Analyze the prototype at `prototype/src/` against `docs/doctrine/domain-doctrine.md`. Identify:
>
> - Domain concepts embedded in the prototype (entities, value objects, pure decisions, validations).
> - Inline validation logic that MUST move to `domain/`.
> - Derived properties (e.g. `displayName`, `isEligible`, computed totals) that should become value-object getters or pure functions.
> - Any `new Date()` / `Math.random()` usages that violate the no-determinism rule.
>
> Return recommendations per your output format. Additionally produce a **migration file list**: for each new domain file, list the source path(s) in `prototype/` the logic came from and what transformation is needed (extract, rename, split, rewrite).

**backend-architect:**

> Analyze the prototype's mock data in `prototype/src/` against `docs/doctrine/backend-doctrine.md`. For each mock data source (hardcoded array, `useState` with seed data, JSON fixture):
>
> - Identify the table name (plural camelCase, e.g. `posts`, `stores`).
> - Extract field shapes → `v.*` validators.
> - Identify relationships (e.g. `Review.storeId` → `v.id("stores")`).
> - Infer required indexes from how the prototype filters/sorts that data.
>
> Return schema recommendations per your output format, plus initial query/mutation signatures for each table. Since this is a fresh backend, all mutations start with `requireAuth` unless clearly public (e.g. an anonymous store listing).

**frontend-architect:**

> Analyze the prototype's components at `prototype/src/` against `docs/doctrine/frontend-doctrine.md`. Identify:
>
> - Components violating the pure-presentation rule (hooks inside, fetch inside, validation inside).
> - Default exports that should become named exports.
> - Inline validation that belongs in `domain/`.
> - The routing pattern the prototype uses (plain conditional rendering, React Router, etc.) and how to convert it to TanStack Router file-based routes.
> - Data-fetching sites (useState + mock arrays) that should become `useQuery(api.xxx)` via a hook in `src/hooks/`.
>
> Return recommendations per your output format, plus a **per-file migration map**: source path in `prototype/src/`, target path in `src/`, and required rewrites.

Wait for all three to complete before proceeding.

### Step 4. Synthesize the migration plan

Compose the three architect outputs into a numbered migration plan. Show it to the user exactly in this shape:

```
Migration Plan — <project name>

Domain (N new files):
  - domain/<file>.ts — extracted from prototype/src/<source>
  - ...

Backend (M tables, K functions):
  convex/schema.ts:
    - <table> {fields} + indexes [<index_names>]
  convex/<feature>.ts:
    - query <verbNoun>: <args> → <return>
    - mutation <verbNoun>: <args> → <return>
  ...

Frontend (P files to move, Q rewrites):
  - prototype/src/components/Foo.tsx → src/components/<feature>/Foo.tsx (named export, remove inline validation)
  - prototype/src/pages/Home.tsx → src/routes/index.tsx (TanStack Router conversion)
  - ...

Hooks (R new bridges):
  - src/hooks/use<Feature>.ts — bridges api.<file>.<fn>, validates via @domain/<file>
  - ...

Providers (src/main.tsx rewrite):
  - Add ClerkProvider + ConvexProviderWithClerk (env vars will be blank until /substrate:deploy)

Files dropped (Gemini AI Studio artifacts not migrated):
  - prototype/package.json, tsconfig.json, vite.config.ts, index.html
  - prototype/metadata.json, AGENTS.md
  - prototype/ itself (archived to prototype-archive/ after migration)

Approve this plan? (y / n / modify)
```

If the user says `n` or `modify`, iterate: ask what to change, re-dispatch the relevant architect(s), regenerate the plan. Do NOT proceed without explicit approval.

### Step 5. Execute the plan

Execute in this order. Verify green between each sub-step. If a sub-step breaks the build, fix it before moving on — don't pile up breakage.

**5a. Domain layer.** Write domain files per domain-architect's recommendations. Write sibling unit tests at `test/unit/domain/<file>.test.ts`. Run:

```bash
pnpm app:compile
pnpm app:test
```

Must stay green.

**5b. Convex schema.** Write `convex/schema.ts` per backend-architect's recommendations. Run `pnpm app:compile` — must stay green. Query/mutation files come next; they import from `_generated/` which codegen will produce.

**5c. Convex functions.** Write `convex/_lib/auth.ts` (the `requireAuth` helper from `backend-doctrine.md §4.2`). Write `convex/<feature>.ts` files per the plan. These reference `./_generated/*` which doesn't exist yet — typecheck WILL fail until `npx convex dev` runs. That's expected.

Tell the user:

> Convex files written. Open a new terminal and run `npx convex dev` to generate types. Wait for "Convex functions ready!" then come back here and type "continue".

When the user says continue:

1. Patch `convex/tsconfig.json` so path aliases resolve from the project root:

   ```bash
   bash "$SUBSTRATE_ROOT/scripts/patch-convex-tsconfig.sh"
   ```

   Convex's generated `convex/tsconfig.json` ships the path aliases (`@/*`, `@convex/*`, `@domain/*`, `@test/*`) but omits `"baseUrl": ".."`. Without that, aliases resolve relative to `convex/` — `@domain/*` points at `convex/domain/*` instead of `<root>/domain/*`, and every Convex file that imports via an alias fails to typecheck. The patch script is idempotent.

2. Re-run `pnpm app:compile`. Must now pass.

**5d. Frontend migration.** Execute these sub-tasks in order to keep intermediate states valid.

1. **Move components.** For each prototype file in the migration map:
   - Create the new file at its target path with rewrites applied:
     - Convert default exports to named exports (unless it's a route component using `createFileRoute`).
     - Move hooks out to `src/hooks/use<Feature>.ts`.
     - Remove inline validation (it's now in `domain/`).
     - Update imports to use path aliases (`@/`, `@convex/`, `@domain/`).
   - Delete the source file from `prototype/src/`.

2. **Wire TanStack Router in `vite.config.ts`.** The scaffold ships `@tanstack/router-plugin` as a dep but does NOT activate it. Edit `vite.config.ts` to add the plugin — it MUST come before `react()`:

   ```typescript
   import { TanStackRouterVite } from "@tanstack/router-plugin/vite";
   // ...
   plugins: [
     TanStackRouterVite({
       routesDirectory: "./src/routes",
       generatedRouteTree: "./src/routeTree.gen.ts",
     }),
     react(),
     tailwindcss(),
   ],
   ```

   The plugin's first run generates `src/routeTree.gen.ts` (already in the scaffold's `.gitignore`).

3. **Update `src/main.tsx`** to wire the provider tree, gated on env vars being present. If either `VITE_CLERK_PUBLISHABLE_KEY` or `VITE_CONVEX_URL` is missing, render the `<SetupRequired />` component INSTEAD of calling `ClerkProvider` (which throws on empty key). This is load-bearing because the user runs `pnpm app:dev` post-migration — they WILL see this screen until `/substrate:deploy` wires Clerk.

   `SetupRequired` ships in the scaffold at `src/components/SetupRequired.tsx`. Do NOT rewrite it; just import and render.

   ```tsx
   import React from "react";
   import ReactDOM from "react-dom/client";
   import { ClerkProvider, useAuth } from "@clerk/clerk-react";
   import { ConvexProviderWithClerk } from "convex/react-clerk";
   import { ConvexReactClient } from "convex/react";
   import { RouterProvider } from "@tanstack/react-router";
   import { router } from "./router";
   import { SetupRequired } from "./components/SetupRequired";
   import "./index.css";

   const clerkKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;
   const convexUrl = import.meta.env.VITE_CONVEX_URL;
   const root = ReactDOM.createRoot(document.getElementById("root")!);

   if (!clerkKey || !convexUrl) {
     root.render(<SetupRequired />);
   } else {
     const convex = new ConvexReactClient(convexUrl);
     root.render(
       <React.StrictMode>
         <ClerkProvider publishableKey={clerkKey}>
           <ConvexProviderWithClerk client={convex} useAuth={useAuth}>
             <RouterProvider router={router} />
           </ConvexProviderWithClerk>
         </ClerkProvider>
       </React.StrictMode>
     );
   }
   ```

4. **Wire Clerk `<SignIn/>` and `<SignUp/>` routes with `routing="virtual"`.** When you create `src/routes/sign-in.tsx` and `src/routes/sign-up.tsx`, use `routing="virtual"` (NOT the default `routing="path"`). Clerk's path routing navigates mid-flow to `/sign-up/verify-email-address`, which 404s without splat routes; virtual routing keeps the multi-step flow in memory. See `docs/doctrine/frontend-doctrine.md` §4.2a.

5. **Delete `src/App.tsx`.** Route composition now lives under `src/routes/` (`__root.tsx` + per-page files); the top-level `App.tsx` placeholder is obsolete.

Run:

```bash
pnpm app:compile
pnpm app:test
```

**5e. Hooks.** Write `src/hooks/use<Feature>.ts` bridges per the plan. Each hook wraps `useQuery(api.<file>.<fn>)` + `useMutation(api.<file>.<fn>)` and returns a minimal named shape (`{ posts, isLoading, createPost }`). Components already migrated in 5d now import these hooks instead of having mock data.

Run `pnpm app:compile && pnpm app:test`.

**5f. Archive the prototype.**

```bash
mv prototype prototype-archive
```

Archive rather than delete, so the user has a reference. Add `prototype-archive/` to `.gitignore` unless the user prefers to commit it for history.

### Step 6. Full verification

Run the full green gate:

```bash
pnpm app:compile
pnpm app:test
pnpm app:lint
```

If any step fails, fix the specific issue. Do NOT silently skip failures.

### Step 7. Commit

Stage and commit with a structured message:

```bash
git add -A
git commit -m "feat: migrate Gemini prototype into substrate kernel

- Moved prototype/src/* → src/ with doctrine alignment
- Extracted <N> domain concepts to domain/
- Drafted Convex schema: <tables>
- Added <M> hooks to bridge Convex to UI
- Wired ClerkProvider + ConvexProviderWithClerk in main.tsx
- Archived original prototype to prototype-archive/
"
```

Do NOT push. The user decides when to push.

### Step 8. Install deps

After committing, pick up any deps added during migration. Run `pnpm install` (foreground, finite) so the user's dev server starts cleanly in step 9:

```bash
pnpm install
```

This ensures migration-added deps (svix for Clerk webhooks, Gemini-introduced libs like date-fns or lucide-react) are on disk.

Do NOT auto-launch `pnpm app:dev` — background dev servers linger after the Claude session ends, obscure Vite logs, collide on port 5173 across repeated runs, and surprise the user. Let them start the server themselves.

### Step 9. Handoff

Print this summary with a copy-pasteable NEXT STEPS box:

```
✔ Migration complete.

  Domain: <N> files, <X> tests passing
  Backend: <M> functions across <K> tables
  Frontend: <P> components migrated, routes wired via TanStack Router
  Hooks: <R> bridges to Convex
  Prototype: archived to prototype-archive/

🚀 NEXT STEPS — run these in two terminals:

  Terminal 1:  pnpm convex:dev     # if not already running
  Terminal 2:  pnpm app:dev

Then open http://localhost:5173.

Because Clerk + Convex env vars aren't configured yet, you'll see a
"Setup required" screen — that's expected. The app IS running; it's
just waiting for credentials.

Next skills:
  - /substrate:deploy to wire Clerk + Vercel and see real sign-in
  - OR /substrate:quick-spec to add features before deploying
  - OR /substrate:architect-spec docs/tasks/ongoing/<feature>/<feature>-brief.md for a multi-phase feature
```

## Constraints

- MUST stage-check before doing anything destructive (step 1 gate).
- MUST get explicit user approval at step 4 before writing any files (step 4 → 5 gate).
- MUST spawn the three architects **in parallel** — a single message with three Agent tool calls.
- MUST preserve doctrine alignment throughout the rewrite: named exports, no hooks in pure components, validation in `domain/`, `v.*` validators with indexes, `requireAuth` on non-public functions.
- MUST run verification (`pnpm app:compile && pnpm app:test`) after each sub-step 5a→5b→5c→5d→5e. If a sub-step breaks green, fix before moving on — never pile up breakage.
- MUST pause and wait for the user to run `npx convex dev` at step 5c before typechecking the Convex functions.
- MUST NOT push to GitHub or deploy to Vercel — that belongs to `/substrate:deploy`.
- MUST NOT invent data shapes not present in the prototype. If a field is ambiguous (e.g. optional vs required), ask the user.
- MUST archive `prototype/` rather than deleting outright (step 5f) — the user may want to reference it.
- MUST commit at step 7 so the migration is a single revertable unit.
- MUST auto-run `pnpm install` at step 8 so the NEXT STEPS commands work cleanly on first try.
- MUST NOT auto-launch `pnpm app:dev`. Background dev servers cause process-management issues (lingering after Claude exits, port collisions, hidden logs). Print the commands in a NEXT STEPS box so the user retains control.
- MUST write `src/main.tsx` with an env-guard that renders a "Setup required" screen when Clerk/Convex env vars are missing, rather than calling `ClerkProvider` with an undefined key (which crashes the app).
- SHOULD narrate progress ("architects dispatched", "domain layer written", "verifying", "installing deps") — the user is watching a long operation and needs to see liveness.
