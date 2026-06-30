---
type: is
id: is-01kprm5g661xjhmb8rtgsja382
title: Skills offer to auto-install missing prerequisites
kind: epic
status: open
priority: 2
version: 1
labels:
  - ux
  - prereqs
dependencies: []
created_at: 2026-04-21T18:17:15.205Z
updated_at: 2026-04-21T18:17:15.205Z
---
# Skills offer to auto-install missing prerequisites (prereq shell)

## Problem

When a substrate skill (`/substrate:init`, `/substrate:migrate`, `/substrate:deploy`) starts, it checks prerequisites (`pnpm`, `node` version, `gh`, `convex` CLI, etc.). Today, on a failed check the skill tells the user to install it manually. Users context-switch to a terminal, hunt for the right install command, re-run the skill. Friction, and easy to get wrong on a fresh machine.

## Proposal

When a prereq check fails, the skill:

1. Shows what's missing and the canonical install command for the user's platform.
2. Asks for approval to run it (single yes/no per prereq).
3. On yes: Bash-runs the install, re-checks, continues.
4. On no or install error: **aborts fast** with a clear explanation and the copy-paste command.

Claude Code exposes this capability today via the `Bash` tool inside a skill — no harness changes required.

## Decisions (locked)

1. **Protocol shape.** Display fail + install command → ask permission → Bash-run → re-check → continue-or-abort. Single prompt per prereq, no batching.
2. **Platform detection.** `uname -s`:
   - `darwin` → `brew`
   - `linux` → `apt` / `curl` as appropriate
   - `windows` → **not supported**; print "substrate does not support Windows yet; run under WSL or on macOS/Linux" and abort.
3. **Fail-closed on install errors.** If `brew install X` fails, abort with clear explanation + the command. No retry loop, no alternate-installer fallback.
4. **Scope.** `architect-spec`, `execute`, `quick-spec` mostly need runtime deps already covered by `init`. Confirm during A-phase; don't add new prereq logic to them unless genuinely needed.

## TBD graph

```
[A] Inventory prereqs across skills
    ├─ A1 /substrate:init   — pnpm, node version, corepack, gh, convex?
    ├─ A2 /substrate:migrate — prototype/ dir, pnpm, convex
    ├─ A3 /substrate:deploy  — gh, vercel CLI, clerk setup deps
    └─ A4 others (archt/exec/quick) — confirm nothing new

[B] Pattern design
    ├─ B1 canonical protocol (decided: prompt per prereq, abort-fast)
    ├─ B2 fail path (decided: abort with explanation)
    └─ B3 platform detect (decided: brew/apt/curl; Windows refused)

[C] UX guardrails
    ├─ C1 ask-once-per-run per prereq (no silent re-prompts)
    ├─ C2 user approval required — never Bash-install without consent
    └─ C3 log failures somewhere the next session can find them

[D] Shared reference  →  references/prereqs/
    ├─ protocol.md    (the canonical prompt/approve/install loop)
    └─ tool-index.md  (per-tool install command matrix: pnpm/node/gh/convex/vercel × darwin/linux)

[E] Update skills
    ├─ E1 skills/init/SKILL.md      (add prereq preamble)
    ├─ E2 skills/migrate/SKILL.md
    ├─ E3 skills/deploy/SKILL.md
    └─ E4 others (only if A4 says so)

[F] Test matrix
    ├─ F1 missing pnpm         → init offers corepack/brew install
    ├─ F2 wrong node version   → init prints nvm instructions, does not auto-switch (too risky)
    └─ F3 install itself fails → skill aborts gracefully with command

[G] Ship
    ├─ G1 CHANGELOG
    ├─ G2 bump minor → 0.3.0 (UX feature, backward compatible)
    └─ G3 tag + release

[H] Dog-food on clean VM with nothing preinstalled
```

## Critical path

A1 → B1 → D → E1 → F1 → G3 → H
(inventory init → protocol locked → shared reference → update init → test missing-pnpm → release → clean-VM smoke)

## Out of scope

- Installing Claude Code itself or other plugins (meta-recursive).
- Installing project-level dependencies (`pnpm install` inside a scaffolded repo) — already covered.
- Windows / PowerShell support. WSL users are told to run under WSL's Linux path.
- Version-manager automation (nvm switch, pyenv, etc.) — too risky; print instructions instead.

## First concrete move

**A1** — read `skills/init/SKILL.md` and enumerate its prerequisite checks. Everything else calibrates off that list.
