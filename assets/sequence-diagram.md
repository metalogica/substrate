# Substrate — Pipeline Sequence Diagram

High-level view of the Substrate virtual framework, from empty folder to live deploy and beyond. Diagrams rendered via Mermaid (auto-renders on GitHub).

---

## Project states

The filesystem is the state machine. Each transition is driven by a skill.

```mermaid
stateDiagram-v2
    [*] --> Empty
    Empty --> Scaffolded: /substrate:init
    Scaffolded --> PrototypeReady: Gemini AI Studio → download ZIP → extract to /prototype
    PrototypeReady --> Migrated: /substrate:migrate
    Migrated --> Deployed: /substrate:deploy
    Migrated --> Migrated: /substrate:quick-spec (small feature)
    Migrated --> Migrated: /substrate:architect-spec → /substrate:execute (large feature)
    Deployed --> Deployed: /substrate:quick-spec (iterate)
    Deployed --> Deployed: git push (Vercel auto-deploys)
    Deployed --> [*]

    note right of Scaffolded
        Kernel: green
        domain/ + test/ + docs/
        src/ shows welcome screen
    end note

    note right of Migrated
        src/ has real product
        convex/ has schema + functions
        providers wired
        env still blank
    end note

    note right of Deployed
        Live URL
        Clerk auth works
        Auto-deploy on push
    end note
```

---

## Full pipeline: empty → live

One sequence, three stages. Actors: **User**, **Claude** (running skills + subagents), **Gemini AI Studio**, **GitHub**, **Vercel**, **Clerk**, **Convex**.

```mermaid
sequenceDiagram
    actor User
    participant Claude
    participant Gemini as Gemini AI Studio
    participant GitHub
    participant Clerk
    participant Convex
    participant Vercel

    Note over User,Claude: Stage 1 — /substrate:init

    User->>Claude: /substrate:init
    Claude->>User: Socratic Q&A (product name, pitch, personas, flows, entities, pages, UI tone, AI features?)
    User-->>Claude: answers
    Claude->>Claude: scaffold.sh (copy templates + install deps + verify green)
    Claude->>Claude: Edit docs/product/*.md with product tokens
    Claude->>User: AI Studio prompt ready at docs/product/ai-studio-prompt.md

    Note over User,Gemini: Manual handoff

    User->>Gemini: open aistudio.google.com/build, paste prompt
    Gemini-->>User: iterate UI in Build mode
    User->>User: download ZIP, extract to /prototype

    Note over User,Claude: Stage 2 — /substrate:migrate

    User->>Claude: /substrate:migrate
    Claude->>Claude: read prototype tree

    par Parallel architect dispatch
        Claude->>Claude: domain-architect analyzes prototype
        Claude->>Claude: backend-architect infers schema from mocks
        Claude->>Claude: frontend-architect maps migration
    end

    Claude->>User: migration plan
    User-->>Claude: approve
    Claude->>Claude: write domain/*, verify green
    Claude->>Claude: write convex/schema.ts, verify compile
    Claude->>User: run npx convex dev in another terminal
    User-->>Claude: continue (codegen done)
    Claude->>Claude: write convex functions, hooks, wire providers
    Claude->>Claude: archive prototype → prototype-archive/
    Claude->>Claude: git commit (migration)

    Note over User,Vercel: Stage 3 — /substrate:deploy

    User->>Claude: /substrate:deploy
    Claude->>Clerk: guide user through dashboard (Clerk ships shared Google OAuth — no GCP setup)
    User-->>Clerk: create app + JWT template
    Clerk-->>User: pk_test_, sk_test_, JWT issuer domain
    Claude->>Claude: setup-clerk.sh writes .env.local + sets Convex env
    Claude->>Convex: npx convex env set CLERK_JWT_ISSUER_DOMAIN
    Claude->>User: local smoke test (pnpm app:dev + pnpm convex:dev)
    User-->>Claude: sign-in works end-to-end
    Claude->>GitHub: init-github.sh → gh repo create
    Claude->>Vercel: connect-vercel.sh → vercel link + git connect
    Claude->>Vercel: push env vars from .env.local
    Claude->>GitHub: git push origin main
    GitHub-->>Vercel: webhook (git integration)
    Vercel->>Vercel: build + deploy
    Vercel-->>User: live URL (https://<project>.vercel.app)

    Note over User,Vercel: Now in Deployed state — every push auto-rebuilds
```

---

## Feature iteration — /substrate:quick-spec

Lightweight single-feature loop. Skeleton-of-thought planning grounded in doctrine, manual test gate, commit on pass.

```mermaid
sequenceDiagram
    actor User
    participant Claude

    User->>Claude: /substrate:quick-spec "add delete button to posts"

    Note over Claude: Plan (skeleton-of-thought)
    Claude->>Claude: skeleton (3-7 bullets)
    Claude->>Claude: consult relevant doctrine
    Claude->>Claude: expand each bullet
    Claude->>Claude: critique (indexes? Result? validation placement?)
    Claude->>Claude: finalize

    Claude->>User: plan for approval
    User-->>Claude: approve
    Claude->>Claude: implement

    Note over Claude: Green gate
    Claude->>Claude: pnpm app:compile
    Claude->>Claude: pnpm app:lint
    Claude->>Claude: pnpm app:test

    Claude->>User: manual test gate
    User-->>Claude: pass
    Claude->>Claude: git commit

    Note over User,Claude: On fail: return to plan with accumulated failure context (max 3 iterations before escalation)
```

---

## Large feature — /substrate:architect-spec → /substrate:execute

Heavyweight gated loop. User writes a brief by hand; orchestrator runs Socratic Q&A + parallel architect analysis + spec composition. A FRESH Claude session executes the spec phase-by-phase with approval gates.

```mermaid
sequenceDiagram
    actor User
    participant SessionA as Claude (Session A)
    participant SessionB as Claude (Session B — fresh)

    User->>User: write docs/tasks/ongoing/<feature>/<feature>-brief.md

    User->>SessionA: /substrate:architect-spec <brief-path>
    SessionA->>SessionA: validate brief sections
    SessionA->>SessionA: architect-spec agent spawned
    SessionA->>User: Socratic Q&A

    loop Until unambiguous
        SessionA->>User: 1-2 questions
        User-->>SessionA: answers
    end

    par Parallel dispatch
        SessionA->>SessionA: domain-architect
        SessionA->>SessionA: backend-architect
        SessionA->>SessionA: frontend-architect
    end

    SessionA->>SessionA: compose spec per spec-template.md
    SessionA->>User: spec written at <feature>-spec.md, open a NEW terminal

    Note over User,SessionB: Fresh context window — clean slate for long execution

    User->>SessionB: claude /substrate:execute <spec-path>
    SessionB->>SessionB: parse execution plan
    SessionB->>User: phase summary, ok to start?
    User-->>SessionB: yes

    loop For each phase
        loop For each step
            SessionB->>SessionB: execute step prompt
            SessionB->>SessionB: run verify commands
            alt verify fails
                SessionB->>SessionB: attempt one fix
                SessionB->>SessionB: re-run verify
                opt still failing
                    SessionB->>User: ask what to do
                end
            end
        end
        SessionB->>SessionB: run phase gate commands
        SessionB->>User: phase complete, continue?
        User-->>SessionB: y / n / pause
    end

    Note over SessionB: Mandatory final phase: Doctrine Review

    SessionB->>SessionB: doctrine compliance check
    SessionB->>SessionB: write doctrine-amendments.md if needed
    SessionB->>SessionB: archive docs/tasks/ongoing/<feature> → completed/
    SessionB->>SessionB: git commit
    SessionB->>User: done (live in docs/tasks/completed/)
```

---

## Participants

| Actor | Role |
|-------|------|
| **User** | Non-technical operator. Drives skills via slash commands, answers Socratic Q&A, approves plans + phase gates. |
| **Claude** | Runs skills in a terminal session. Spawns subagents (architects) in parallel via the Agent tool. Calls bash scripts for mechanical work (scaffold, git, Vercel). |
| **Gemini AI Studio** | Browser-only UI for generating the initial frontend prototype from a scaffolding prompt. Exports a ZIP. |
| **GitHub** | Source of truth for the repo. Auto-deploy trigger for Vercel. |
| **Vercel** | Build + hosting. Auto-deploys every push to `main`. |
| **Clerk** | Auth provider. Dev instance ships with shared Google OAuth — no Google Cloud Console setup required. |
| **Convex** | Realtime database + server functions. Validates Clerk JWT via `auth.config.ts`. Generates types via `npx convex dev` / `npx convex deploy`. |

---

## Subagents (spawned by Claude, not directly addressable by the user)

| Agent | Invoked by | Role |
|-------|-----------|------|
| `domain-architect` | `architect-spec`, `/substrate:migrate` | Identifies domain concepts, enforces purity + Result pattern + Brand types. |
| `backend-architect` | `architect-spec`, `/substrate:migrate` | Schema + indexes + queries/mutations/actions, `requireAuth` placement, external API routing. |
| `frontend-architect` | `architect-spec`, `/substrate:migrate` | Route structure, hook-layer bridges, pure presentational components, Tailwind v4 styling. |
| `architect-spec` | `/substrate:architect-spec` | SDD orchestrator. Runs Q&A, dispatches the three layer architects in parallel, composes the gated spec. |
