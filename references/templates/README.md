# {{PROJECT_NAME}}

{{PROJECT_DESCRIPTION}}

Built on [**Substrate**](https://github.com/metalogica/substrate) — a Claude Code plugin that scaffolds full-stack Vite + Convex apps following Domain-Driven Design, railway-oriented programming, and a testing pyramid.

## Stack

- **Frontend**: Vite + React 18 + TanStack Router + Tailwind v4
- **Backend**: Convex (realtime database + server functions)
- **Auth**: Clerk
- **Package manager**: pnpm

## Quick start

```bash
pnpm install
pnpm app:dev       # start Vite dev server on :5173
pnpm convex:dev    # start Convex dev server (separate terminal)
pnpm app:test      # run Vitest suite
pnpm app:compile   # typecheck only
```

## Project structure

```
{{PROJECT_NAME}}/
├── src/                  # Vite + React frontend
├── convex/               # Convex backend (schema, queries, mutations, actions)
├── domain/               # Pure TypeScript domain layer (shared across layers)
├── test/                 # Vitest tests (unit + integration)
├── docs/
│   ├── doctrine/         # Binding architectural doctrines
│   ├── product/          # Product spec + runtime AI persona
│   ├── protocol/sdd/     # Spec-Driven Development protocol
│   └── tasks/ongoing/    # Active feature briefs and specs
└── scripts/              # Deployment + setup helpers
```

## Substrate skills

| Skill | Purpose |
|-------|---------|
| `/substrate:init` | Scaffold a new project (already run) |
| `/substrate:migrate` | Move a Gemini AI Studio prototype into `src/`, draft Convex contract |
| `/substrate:architect-spec <brief>` | Produce a multi-phase spec from a brief |
| `/substrate:execute <spec>` | Execute a spec in a fresh session with verification gates |
| `/substrate:quick-spec` | Lightweight single-feature iteration |
| `/substrate:deploy` | Set up Clerk + Vercel + first deploy |

## Doctrine

Every substrate project binds to three doctrines in `docs/doctrine/`:

- **domain-doctrine.md** — pure TypeScript, Result<T,E>, Brand types
- **backend-doctrine.md** — Convex schema + functions + Clerk JWT
- **frontend-doctrine.md** — Vite + TanStack Router + Tailwind v4 + Clerk

Violations are architectural bugs. Read them before writing code.
