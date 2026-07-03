# Formalize tbd/beads as a first-class part of substrate — Brief

**Author**: rei nova
**Date**: 2026-07-03
**Status**: Draft

---

## User Story

As a developer running substrate's **parallel bead fan-out**, I want tbd/beads to be a
**formally provisioned and governed** part of every substrate repo — installed by the kernel,
declared in the artifact contract, and codified in its own doctrine — so the parallel-execution
doctrine's tracker dependency is **guaranteed rather than assumed**, instead of tbd being an
undocumented manual afterthought that the fan-out silently requires.

**Context / origin.** An audit of the current tree found an asymmetry: `agents-parallel-execution-doctrine.md`
**hard-depends** on tbd (single-writer tracker, `tbd update/close/sync`, `tbd ready/show`, the whole
bead-DAG orchestration), but **nothing provisions it**:
- `scripts/prerequisites.sh` checks git/node/pnpm/npx/gh — **not** tbd.
- No skill runs `tbd init`/`tbd setup`; `/substrate:adopt` lists it literally as **"(Optional)"**.
- Only `/substrate:synthesize-session` *consumes* tbd, and it **degrades gracefully** to markdown beads when absent.
- `tbd-graph.py` (keylark's bead-DAG → Mermaid) is named in the agnostic-core brief's SHOULD but is **not shipped** in `references/docs-core/`.

This brief closes the gap: provision tbd, contract it, and give it a doctrine.

---

## Constraints

- **MUST**: Add a **tbd tier to prerequisite checks** — detect a callable tbd (global `tbd` OR `npx --no-install get-tbd --version`); offer `npm i -g get-tbd` when missing.
- **MUST**: Make **both** provisioning skills (`/substrate:adopt` and `/substrate:init`) set tbd up as a **real step, not optional** — **ask the user for the bead prefix** (never guess; the AGENTS.md weave already forbids guessing), run `tbd init --prefix=<prefix>` + `tbd setup --auto`, stage `.tbd/`, and **MUST NOT gitignore `.tbd/workspaces/`**.
- **MUST**: Add **initialized `.tbd/`** (with the chosen prefix) as a formal item in the **artifact contract** (extends the agnostic-core 4-part contract; the engine can assert it).
- **MUST**: Ship a dedicated **`tbd-doctrine.md`** in `references/docs-core/docs/doctrine/`: the prefix convention, `.tbd/` layout, sync branch/remote, the single-writer rule, the "you operate tbd — the user doesn't" stance, and the **graceful-degradation contract** (which skills *require* tbd vs which *tolerate* its absence). Registered in `doctrine-manifest.yaml` + pointered from `AGENTS.md`; `doctrine-lint` green.
- **MUST**: Ship **`tbd-graph.py`** (bead-DAG → Mermaid) in `references/docs-core/docs/scripts/`, de-keylarked, runnable via `python3`.
- **MUST**: Update `agents-parallel-execution-doctrine.md` to declare tbd a **hard dependency for fan-out** (no markdown fallback for DAG orchestration) and cross-link `tbd-doctrine.md`.
- **MUST**: Preserve substrate's own `sub` prefix + existing `.tbd/`; the per-repo prefix is **asked** at provision time.
- **MUST**: Keep the shared provisioning logic **stack-agnostic** (no `pnpm`/`convex`/`vite` literal in the tbd path — `adopt` is stack-blind; `init` may use its own toolchain).
- **MUST NOT**: Abstract tbd behind a generic tracker interface in this release — tbd stays the concrete tracker (full tracker-agnosticism is a later brief).
- **MUST NOT**: Make tbd a universal hard-fail for *every* skill — keep graceful degradation where a workflow already tolerates absence (`synthesize-session`).
- **SHOULD**: Make `tbd-graph.py` discoverable — reference it from `tbd-doctrine.md` and/or the parallel-exec doctrine.

---

## References

- `references/docs-core/docs/doctrine/agents-parallel-execution-doctrine.md` — the hard consumer of tbd.
- `references/docs-core/AGENTS.md` — the tbd integration weave (operator stance, command tables, prefix rule).
- `skills/synthesize-session/SKILL.md` — the only current tbd consumer; the graceful-degradation precedent.
- `scripts/prerequisites.sh` — where the tbd prereq tier lands.
- `.tbd/config.yml` — substrate's own tbd config (`sub` prefix, `tbd-sync` branch).
- `/Users/reinova/code/soulbound-labs/keylark/scripts/tbd-graph.py` — the bead-DAG → Mermaid source to promote.
- `docs/tasks/ongoing/agnostic-core/agnostic-core-spec.md` — the 4-part artifact contract this extends.
- `skills/adopt/SKILL.md`, `skills/init/SKILL.md`, `bootstraps/*/scripts/scaffold.sh` (post-agnostic-core) — the provisioning surfaces.

---

## Acceptance Criteria

- [ ] `prerequisites.sh` (and the adopt/init prereq step) detects tbd and offers `npm i -g get-tbd`; absence is a clear warn/fail per the resolved stance.
- [ ] Running `/substrate:adopt` on a fresh repo ends with `.tbd/` initialized (the asked prefix), staged, and `doctrine-lint` green; `.tbd/workspaces/` is **not** gitignored.
- [ ] `/substrate:init`'s scaffold provisions tbd the same way.
- [ ] `tbd-doctrine.md` ships in docs-core, registered in the manifest + linked from `AGENTS.md`, `doctrine-lint` green; a grep for keylark specifics over it returns nothing.
- [ ] `tbd-graph.py` ships in `docs-core/docs/scripts/`; `python3 -c 'import ast; ast.parse(...)'` is clean and it emits a ```` ```mermaid ```` block when tbd is present.
- [ ] `agents-parallel-execution-doctrine.md` states tbd is **required** for fan-out and links `tbd-doctrine.md`.
- [ ] The artifact-contract doc lists initialized `.tbd/` as a required item.

---

## Out of Scope

- Full **tracker-agnosticism** / a generic tracker abstraction — deferred to a later brief.
- Replacing or forking tbd; a second tracker.
- The ADR (architecture decision record) construct discussed separately.

---

## Resolved Decisions (locked pre-architect)

1. **Stance** → *default-provision everywhere*; **hard-required only for parallel fan-out**; other skills tolerate absence (preserves `synthesize-session`'s degradation).
2. **Prefix** → asked at provision time (never guessed); substrate's own stays `sub`.
3. **Doctrine** → a new **standalone** core doctrine `tbd-doctrine.md` (id `tbd`, `layer-hint: cross-cutting`).
4. **Provision surfaces** → **both** `/substrate:adopt` and `/substrate:init`.
5. **Graph** → ship `tbd-graph.py` in `docs-core/docs/scripts/`.

---

## Open Questions

1. **Prereq severity** when tbd is missing at provision time — hard-fail, or warn + offer install and let the provision step degrade to "documented, run `tbd init` later"? (Lean: warn + offer; only fail-fast if the user is explicitly setting up fan-out.)
2. **Adopt skippability** — should the tbd provisioning step be skippable via a flag for users who genuinely don't want beads, with a loud "fan-out won't work" note? (Lean: yes.)
3. **`.tbd/` in the artifact contract** — is an *initialized* `.tbd/` a hard contract requirement, or a "provisioned-by-default but contract-optional" item (so a repo can satisfy the contract without beads if it never fans out)? (Lean: contract-optional, doctrine-required-for-fanout — mirrors decision 1.)

---

<!--
Next step:
  /substrate:architect-spec docs/tasks/ongoing/formalize-tbd/formalize-tbd-brief.md
-->
