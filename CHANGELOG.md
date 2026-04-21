# Changelog

All notable changes to this plugin are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.1] — 2026-04-21

Schema conformance fixes for first install. `v0.2.0` failed to install from the marketplace due to two manifest schema violations; this release fixes both. No functional changes to skills, agents, or templates.

### Fixed

- `marketplace.json` — `plugins[0].source` changed from `"."` to `"./"`. Relative paths must start with `./` per the Claude Code marketplace schema.
- `plugin.json` — `repository` changed from an npm-style `{type, url}` object to a plain URL string. The Claude Code plugin schema expects a string, not an object.
- `plugin.json` — removed `bugs` field (not in the documented plugin schema).

### Added

- `marketplace.json` — `metadata.description` and `metadata.version` to satisfy the marketplace validator's warning.

## [0.2.0] — 2026-04-21

First public release. Distributed via the `metalogica` plugin marketplace:

```
/plugin marketplace add metalogica/substrate
/plugin install substrate@metalogica
```

### Skills

- `/substrate:init` — scaffold a new project in an empty directory (stage 1).
- `/substrate:migrate` — migrate a Gemini AI Studio prototype into the kernel (stage 2).
- `/substrate:deploy` — Clerk + Vercel + first live deploy (stage 3).
- `/substrate:architect-spec <brief>` — SDD orchestrator that produces gated multi-phase specs.
- `/substrate:execute <spec>` — executes a spec phase-by-phase with verification gates.
- `/substrate:quick-spec` — lightweight single-feature iteration loop.

### Agents

- `domain-architect`, `backend-architect`, `frontend-architect` — per-layer specialists spawned in parallel by orchestrator skills.
- `architect-spec` — SDD orchestrator that composes layer-specialist outputs into a spec.

### References (bundled)

- `doctrines/` — domain / backend / frontend architectural doctrines, copied into every scaffolded project as `docs/doctrine/`.
- `sdd-protocol/` — brief format, execution format, spec template, copied into every scaffolded project as `docs/protocol/sdd/`.
- `templates/` — the ready-to-copy project kernel.
- `example/` — golden-reference finished project for quality comparison.

### Metadata

- Added `LICENSE` (MIT).
- Added `homepage` and `repository` fields to `plugin.json`.
- Added `.claude-plugin/marketplace.json` for marketplace-style install.
