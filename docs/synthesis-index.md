# Synthesis Index

Append-only cross-session ledger of beads created by `/substrate:synthesize-session`.
One row per bead. Used for cross-session dedup — check here before filing a new bead.

| Date | Feature | Bead ID | Title | Type | Effort | Blocked-by | Cross-repo |
|------|---------|---------|-------|------|--------|------------|------------|
| 2026-07-07 | orchestrate | sub-e02x | Reconcile CC bead-implementer frontmatter (permission block inert in CC) | drift | XS | — | in-repo |
| 2026-07-07 | orchestrate | sub-0w1w | Generalize skill-count-drift check into a repo-wide assert script | devx-agent | XS | — | in-repo |
| 2026-07-07 | orchestrate | sub-yum8 | Should the plugin repo self-adopt its kernel to dogfood orchestrate in-repo? (parked) | open-question | — | — | in-repo |
| 2026-07-23 | serve-v1 | sub-2860 | graph-spec: infer blocked-by edge when two beads share a write-target file (create→modify) | bug | S | — | in-repo |
| 2026-07-23 | serve-v1 | sub-7710 | orchestrate: cut feat/<epic> from origin/<trunk>, or warn when local trunk is ahead | bug | S | — | in-repo |
| 2026-07-23 | serve-v1 | sub-mxj6 | Operator: run the 3 serve-v1 live drills (dispatch, actualize/merge, full-lifecycle) | task | M | — | in-repo |
| 2026-07-23 | serve-v1 | sub-sk6w | serve daemon: re-dispatch a held/retried bead on a subsequent tick | feature | S | — | in-repo |
| 2026-07-23 | serve-v1 | sub-v60v | serve daemon: speed up the ~70s real-tbd fixture suite (queue/worktree) | chore | S | — | in-repo |
| 2026-07-23 | serve-v1 | sub-2nu6 | serve daemon: guard + document preflight coupling to tbd status --json .initialized | chore | XS | — | in-repo |
| 2026-09-04 | doctrine-crud | sub-o2bf | orchestrate: verify an epic's declared preconditions before cutting the integration branch | feature | S | — | in-repo |
| 2026-09-04 | doctrine-crud | sub-b0kt | bead-implementer: a verified claim must carry the command + its output, not prose | task | S | — | in-repo |
| 2026-09-04 | doctrine-crud | sub-scta | substrate.yaml gate covers daemon/ only — 13 of 14 beads edited files no gate command runs | task | S | sub-fsji | in-repo |
| 2026-09-04 | doctrine-crud | sub-rhbt | doctrine-lint.sh: unquoted $globs makes the governed-path count depend on the caller's cwd | bug | XS | — | in-repo |
| 2026-09-04 | doctrine-crud | sub-tiqg | synthesize-session SKILL body is 574 lines — move Step 7 record templates to references/ | chore | S | — | in-repo |
| 2026-09-04 | doctrine-crud | sub-hlre | Harvest and delete the legacy docs/tasks/ongoing/doctrine-updates/ amendment queue | chore | XS | — | in-repo |
| 2026-09-04 | doctrine-crud | sub-27h9 | May an orchestrator extend the union re-gate with checks it computes itself? (parked) | open-question | — | — | in-repo |
| 2026-09-04 | doctrine-crud | sub-p4sz | Should skill-authoring be a registered doctrine, or is CLAUDE.md the right home? (parked) | open-question | — | — | in-repo |
