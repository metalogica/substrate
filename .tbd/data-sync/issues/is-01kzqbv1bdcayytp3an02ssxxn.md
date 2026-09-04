---
type: is
id: is-01kzqbv1bdcayytp3an02ssxxn
title: "serve daemon is unrunnable: repo-local get-tbd 0.1.26 shadows the real tbd under npx"
kind: bug
status: open
priority: 0
version: 1
labels: []
dependencies: []
created_at: 2026-08-11T02:53:45.708Z
updated_at: 2026-08-11T02:53:45.708Z
---
Every `substrate serve|triage|tidy|status` verb fails before doing any work:

    {"error":"Config format 'f06' is from a newer tbd version.
              This tbd version supports up to format 'f03'."}
    triage: Error: Command failed: tbd list --label groomed --status open --json

CHAIN (all verified 2026-08-10):

1. package.json:3 pins `"get-tbd": "^0.1.26"`. A caret on a 0.x version caps at
   <0.2.0, so it can NEVER resolve to the current 0.4.2 — the pin is two minors
   stale by construction, not by neglect.
2. That installs node_modules/.bin/tbd at 0.1.26.
3. scripts/substrate runs every daemon verb via `npx -y tsx daemon/src/<verb>.ts`,
   and npx prepends node_modules/.bin to PATH. Verified from inside a tsx child:
   `which tbd` -> /Users/reinova/code/metalogica/substrate/node_modules/.bin/tbd, 0.1.26.
4. daemon/src/queue.ts defaults `bin = "tbd"` and resolves it from PATH, so the
   Queue always gets 0.1.26 — while the operator's real tbd (0.4.2, at
   ~/Library/pnpm/tbd) is the one that WROTE this board's f06-format config.
5. 0.1.26 refuses to read f06. Preflight/discovery dies on the first tbd call.

This is almost certainly WHY the daemon has never run here (.substrate/serve/
does not exist; sub-mxj6, the three live drills, is still open). It is a hard
blocker on every live-drill and on observing the ingestion loop at all.

Not caused by the kind:/DAG fixes (db8ea1c, f77ad0f) — those are unit-tested
against a fixture repo where the test harness seeds its own tbd, and verified
live only through a probe that pinned the real binary explicitly.

FIX OPTIONS (pick one, they are not equivalent):

A. Bump the pin to ^0.4.2 and reinstall. Smallest, but re-pins a moving target
   and will drift again the next time tbd bumps its config format.
B. Drop get-tbd from package.json entirely and treat tbd as an OPERATOR-PROVIDED
   binary. This matches how everything else already works — the preflight in
   serve.ts:CHECKS probes for `tbd` on PATH precisely because it expects a
   user-installed tool, and adopt tells users to `npx get-tbd`. A repo-local
   copy contradicts that contract and is what creates the shadowing.
C. Make the daemon resolve tbd explicitly (a `bin` from config, or prefer an
   absolute path over PATH) so npx's PATH mangling cannot shadow it.

Recommend B, plus C as a belt-and-braces guard: B removes the shadow, C stops
any future PATH ordering from re-creating it.

VERIFY: from the repo root, `substrate triage <a-groomed-bead>` must get past
discovery; and from inside `npx -y tsx`, `which tbd` must resolve to the
operator's 0.4.2, not a repo-local copy.

Related: sub-2nu6 (preflight coupling to `tbd status --json .initialized`) —
same preflight path, and would have caught this earlier had it asserted a
minimum version rather than just `.initialized`.
