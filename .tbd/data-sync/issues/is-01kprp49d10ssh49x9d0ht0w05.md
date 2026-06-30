---
type: is
id: is-01kprp49d10ssh49x9d0ht0w05
title: Plugin hot-reload dev loop (cache-symlink) + README note
kind: epic
status: closed
priority: 2
version: 2
labels:
  - dev-ux
  - docs
dependencies: []
created_at: 2026-04-21T18:51:32.640Z
updated_at: 2026-04-21T19:03:20.109Z
closed_at: 2026-04-21T19:03:20.108Z
close_reason: null
---
# Plugin hot-reload dev loop (cache-symlink) + README note

## Problem

Claude Code v2.1.114 dropped auto-discovery of `~/.claude/plugins/<name>/` directories. `/plugin install` now **copies** files from marketplace source into `~/.claude/plugins/cache/<marketplace>/<plugin>/<version>/`. A dev who edits a skill in the substrate repo sees nothing change in any other project's Claude session — the cached copy is stale. Current workaround: push to GitHub, bump version, re-install. That's a release-to-test loop. Unacceptable for iteration.

## Proposal

**Cache-symlink hack.** After `/plugin install`, replace the cached plugin directory with a symlink pointing at the source repo. Claude Code loads the plugin by following the symlink → reads the current working tree of the source repo. Every edit, branch switch, or stash is immediately visible to any Claude session after `/reload-plugins`.

This gives back the old symlink hot-reload UX on top of the new marketplace model.

## Workflow this enables

1. Open a test Claude Code session in any repo (e.g. `demo1`).
2. In another terminal, `cd` into the substrate repo, create a feature branch, edit a skill.
3. Back in the test session, `/reload-plugins` — instantly see the change.
4. Iterate. Merge feature branch to main when done.
5. When ready to release: bundle ≥1 main commits, bump version in a dedicated commit, tag, `gh release create`.

Dev and release become two separate tracks. Users on `v0.2.1` never see dev churn.

## Locked decisions

1. **Mechanism:** cache-symlink. Replace `~/.claude/plugins/cache/metalogica/substrate/<ver>/` with a symlink to `~/code/metalogica/substrate`.
2. **Dev marketplace source:** local path (`~/code/metalogica/substrate`), not `metalogica/substrate` on GitHub. Avoids the risk of Claude Code's auto-update (24h default) overwriting the symlink with a fresh network fetch.
3. **Version discipline:** never bump `plugin.json#version` on a feature branch. Release bumps are a dedicated commit on main.
4. **Release flow:** before any release, run `dev-unlink.sh` → reinstall from the GitHub marketplace → verify the test session sees the to-be-released version cleanly → only then tag + `gh release create`.

## TBD graph

```
[A] Setup automation
    ├─ A1 scripts/dev-link.sh      — installs + symlinks cache → source
    ├─ A2 scripts/dev-unlink.sh    — restores a normal install (pre-release)
    └─ A3 scripts/dev-heal.sh      — (optional) detects drift, re-links

[B] Auto-update mitigation
    ├─ B1 probe: is there a per-marketplace auto-update disable flag?
    ├─ B2 if no flag: mitigate by using local-path marketplace for dev
    └─ B3 decide dev-source shape (local path wins — see decision 2)

[C] Version discipline
    ├─ C1 convention: feature branches freeze plugin.json#version
    ├─ C2 release process runs dev-unlink first for a clean reinstall test
    └─ C3 CHANGELOG convention (one entry per release tag)

[D] Docs
    ├─ D1 README — add "Development" section with hot-reload setup
    ├─ D2 CLAUDE.md — replace stale `ln -s` instructions with dev-link.sh flow
    └─ D3 Gotchas doc — "broken branch = broken plugin in test session"

[E] E2E test on this machine
    ├─ E1 run dev-link.sh
    ├─ E2 feature branch in substrate, edit a skill
    ├─ E3 /reload-plugins in demo1 — verify change visible
    ├─ E4 merge to main, verify still visible
    ├─ E5 simulate a release (tag without publishing)
    ├─ E6 run dev-unlink.sh
    └─ E7 verify test session now sees installed version, not source tree

[F] Edge case hardening
    ├─ F1 auto-update overwrites symlink — detection + recovery
    ├─ F2 plugin.json version change during dev — cache path drift handling
    └─ F3 source repo moved/deleted — symlink safety

[G] Ship
    ├─ G1 commit scripts/* to main (repo tooling, no version bump)
    ├─ G2 CLAUDE.md correction committed
    └─ G3 bead: "first-class dev mode" if Claude Code ever adds one
```

## Critical path

A1 → B3 → D1 → E1 → E2/E3 → G1/G2
(write dev-link → decide local-path dev source → write README section → run it → verify loop → commit)

## Out of scope

- Re-enabling old `~/.claude/plugins/<name>/` symlink auto-discovery — Claude Code v2.1.114 doesn't support it; not worth reverse-engineering.
- Windows/WSL dev loop — substrate doesn't support Windows.
- File-watcher daemon that auto-calls `/reload-plugins` on save. Manual reload is fast; automation is nice-to-have, not core.

## First concrete move

**A1 — write `scripts/dev-link.sh`.** Detects the cache path, removes the copied plugin, symlinks in its place. Safety checks: refuse to run if `~/.claude/plugins/cache/metalogica/substrate/` doesn't exist (means user hasn't run `/plugin install` yet).
