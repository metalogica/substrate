---
type: is
id: is-01kprr3e1vvkzxk2g3dzdf6ymg
title: Integrate TBD into scaffolded substrate projects
kind: epic
status: open
priority: 4
version: 1
labels:
  - planning
  - deferred
dependencies: []
created_at: 2026-04-21T19:26:01.786Z
updated_at: 2026-04-21T19:26:01.786Z
---
# Integrate TBD into scaffolded substrate projects

Goal: every project scaffolded via substrate initializes TBD by default so the AI in the new project uses beads for lightweight task tracking — zero-config, but disclosed in CLAUDE.md and README (not literally hidden from the user).

## Current state

- TBD is used only in substrate's own repo (`.tbd/config.yml`, prefix `sub`).
- Zero references to TBD in `skills/`, `scripts/`, `references/templates/`, or any scaffolded `CLAUDE.md`.
- SDD skills drive tasks via `docs/tasks/ongoing/<feature>/<feature>-{brief,spec}.md` — markdown artifacts, not beads.

## Integration points (ranked by leverage)

1. `scripts/scaffold.sh` — run `npx get-tbd` after the template copy, seed `.tbd/config.yml` with a prefix derived from `{{PROJECT_NAME}}` (truncated to ~4 chars).
2. `references/templates/CLAUDE.md` — add a "Task tracking" section so Claude in the scaffolded project reaches for beads instead of TodoWrite or ad-hoc markdown.
3. `skills/init/SKILL.md` — mention TBD init as a step; print the prefix to the user.
4. SDD skills (`quick-spec`, `architect-spec`, `execute`) — decide whether briefs/specs get a companion bead or stay file-only.

## Decisions to lock before coding

1. **Opt-in vs default-on** — default-on.
2. **Prefix source** — slug of `{{PROJECT_NAME}}`, truncated to ~4 chars; show it to the user.
3. **Network failure at scaffold** — fail-fast preference says abort with explanation; but TBD is additive so graceful-skip is defensible. Needs a call.
4. **Beads vs `docs/tasks/ongoing/`** — lean: keep specs as markdown (5–20KB artifacts don't fit a bead body), use beads for lightweight follow-ups, bugs, and TODOs. Link bead ↔ spec via id in the bead body.
5. **"Without the user knowing"** — reframed as zero-config default, discoverable on demand. CLAUDE.md and README disclose TBD; AI uses it silently.
6. **Sync / remote** — `.tbd/config.yml` has `sync.branch: tbd-sync`. Decide whether scaffolded projects enable `auto_sync: true` or leave it manual.

## Risks

- `npx get-tbd` cold-install latency at scaffold time — stage 1 already feels long.
- Prefix collisions across a user's portfolio of substrate projects.
- Drift between substrate's own TBD usage and scaffolded-project conventions — two divergent flavors become maintenance burden.
- Teaching four skills about beads means editing many natural-language contracts. High edit surface area.

## Proposed phased plan

- **Phase A** — scaffold-time init: `scaffold.sh` runs TBD, derives prefix, commits `.tbd/` in the initial commit. Update `skills/init/SKILL.md`.
- **Phase B** — AI awareness: add a "Task tracking" block to template `CLAUDE.md` with when-to-open-a-bead heuristics. Ship A+B together.
- **Phase C** — (deferred, own release) teach `quick-spec` / `execute` to open a bead per feature and close on merge, linked to the spec file.
- **Phase D** — (optional) backfill the `example/` Clawcraft reference with a `.tbd/`.

## Main tradeoff

Phase A+B gets ~80% of the value (TBD present, AI uses it) with low risk. Phase C is where it becomes invasive to SDD skills' natural-language contracts — worth a separate `/substrate:architect-spec` pass when tackled.

## Status at time of bead creation (2026-04-21)

Parked as low priority after skeleton-of-thought assessment. Not trivial; revisit when there's appetite for a multi-phase spec rather than a quick edit.
