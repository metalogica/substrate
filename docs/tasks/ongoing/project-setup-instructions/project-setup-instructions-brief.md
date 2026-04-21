# Project Setup Instructions Brief

**Author**: rei nova
**Date**: 2026-04-21
**Status**: Draft

---

## User Story

As someone encountering the substrate plugin repo for the first time (either to use it or to contribute to it),
I want a single, prescriptive setup document that walks me from zero to a green `/substrate:init` in a fresh sandbox,
so that I don't have to piece together the install path, plugin registration, invocation syntax, and dev-iteration loop from four different files.

---

## Constraints

- MUST be ONE canonical entry document (not scattered across README, CLAUDE.md, and inline SKILL steps).
- MUST cover both audiences in labelled sections: (a) end users who want to scaffold apps with substrate, (b) contributors who want to edit the plugin.
- MUST include the non-obvious bits a first-run reporter hits: plugin registration via `--plugin-dir` (symlink alone doesn't register), namespaced invocation (`/substrate:init` not `/substrate-init`), SUBSTRATE_ROOT path-search fallback.
- MUST list the prerequisite CLI tools up-front (ties to `scripts/prerequisites.sh`).
- MUST NOT duplicate content that already lives in README.md — link to it instead.
- SHOULD fit in one page when read top-to-bottom (~200 lines max).

---

## References

- `README.md` — current user-facing install + pipeline overview (keep as-is; setup doc links in)
- `CLAUDE.md` — current agent-facing plugin guidance (keep as-is; setup doc links in)
- `scripts/prerequisites.sh` — CLI prereq checker (setup doc references for the prereq section)
- `skills/init/SKILL.md` step 2 — SUBSTRATE_ROOT path-search logic to document
- First-real-install failure modes captured in session transcript: "Unknown command: /substrate-init" (namespacing), plugin-not-discovered (registration), Clerk/Vercel stage-3 gotchas (commit `69c8931`)

---

## Acceptance Criteria

- [ ] A single file (likely `docs/SETUP.md` or `docs/getting-started.md`) that a new user can read top-to-bottom in under 5 minutes
- [ ] Prereq check callout at the top (link to `scripts/prerequisites.sh`)
- [ ] End-user section: install → plugin registration (`claude --plugin-dir ...` or marketplace) → invoke `/substrate:init` → first scaffold green
- [ ] Contributor section: clone → symlink → dev iteration loop → smoke test steps (from README's "Testing the plugin" section, extracted and polished)
- [ ] Troubleshooting block covering the first-run gotchas: wrong invocation form, plugin not registered, missing prereqs
- [ ] README.md links to the new setup doc prominently near the top

---

## Out of Scope

- Plugin-marketplace publication workflow (separate concern, future)
- Contributing guidelines (CONTRIBUTING.md — if needed, a separate doc)
- API documentation for the architect subagents (lives in `agents/` themselves)
- Runbook for deploying one's own substrate-derived SaaS

---

## Open Questions

1. One file or two? Keep end-user and contributor sections under one `SETUP.md`, or split into `getting-started.md` (end user) + `CONTRIBUTING.md` (contributor)? Leaning one file with clear section headers — lower discovery cost.
2. Include a short animated terminal cast (asciinema / GIF) of the happy path? High polish, ~2 hours to produce. Defer unless the doc is clearly a blocker for adoption.
3. Should the doc live at repo root (`SETUP.md`) or under `docs/` (`docs/SETUP.md`)? Root is more discoverable; `docs/` groups with future docs. Leaning root.
4. Do we need a "what substrate is not" section? Prevents mismatched expectations (substrate is not a UI component library, not a backend framework, etc.). Might be worth ~10 lines.
