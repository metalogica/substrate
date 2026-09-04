---
type: is
id: is-01m1pyk64mc1h4gb4dvvz861fq
title: "doctrine-lint.sh: unquoted $globs makes the governed-path count depend on the caller's cwd"
kind: bug
status: open
priority: 2
version: 1
spec_path: docs/tasks/ongoing/doctrine-crud/doctrine-crud-spec.md
labels:
  - src:synth-doctrine-crud
dependencies: []
created_at: 2026-09-04T19:33:40.627Z
updated_at: 2026-09-04T19:33:40.627Z
---
---
originating-spec: docs/tasks/ongoing/doctrine-crud/doctrine-crud-spec.md
originating-session: 2026-09-04
cross-repo: in-repo
effort: XS
---

## Why now (session signal)
Found by the terminal doctrine-reconciliation bead (sub-ly37) during epic:doctrine-crud, and
reproduced on the unmodified tree. `doctrine-lint.sh:91` iterates `for g in $globs` unquoted, so
the shell pathname-expands each glob against the linter's CWD *before* the loop runs. Same script,
same manifest, different answers: "6 governed-path glob(s)" when run from `references/docs-core/`,
"4" from the repo root — because `docs/doctrine/**` expands to 3 real files in one cwd and stays
literal in the other.

## Acceptance criterion
`bash references/docs-core/docs/scripts/doctrine-lint.sh` reports the SAME governed-path glob count
regardless of the directory it is invoked from. Rule 6's pass/fail verdict must not change.

## Notes
Rule 6's verdict already survives either way (an expanded glob still matched something, which is the
question it asks), so this is cosmetic *today* — but the summary line is non-reproducible, and it
becomes a correctness bug the moment anything reads the count. Fix is to quote the expansion or read
the globs into an array before iterating.

## State-transfer prompt
> Working in metalogica/substrate. Task: make doctrine-lint.sh's governed-path glob count
> independent of the caller's working directory.
> Relevant files:
> - references/docs-core/docs/scripts/doctrine-lint.sh:91 — `for g in $globs`, the unquoted
>   expansion; see also glob_matches() around :58-70 which does the real matching correctly
> Relevant prior commits:
> - 753ec9c — the epic that shipped rules 5/6/7, where this was introduced
> Constraints — do NOT modify: rule 6's pass/fail semantics; the bash 3.2 floor (no `globstar`,
> no associative arrays); zero runtime deps.
> Verification:
> - cd references/docs-core && bash docs/scripts/doctrine-lint.sh   # note the glob count
> - cd <repo root> && bash references/docs-core/docs/scripts/doctrine-lint.sh   # must match
