---
type: is
id: is-01m1pv8rkvna1sr470ypsjypqw
title: "adopt: stamp substrate kernel version+commit into the target repo"
kind: feature
status: open
priority: 2
version: 2
labels: []
dependencies:
  - type: blocks
    target: is-01m1pwcvyhybknz9fdcv502dcz
created_at: 2026-09-04T18:35:33.370Z
updated_at: 2026-09-04T18:55:16.431Z
---
## Why now
Adopted repos carry NO record of which substrate installed them: substrate.yaml
`version: 1` is the gate-file schema version, plugin.json#version never leaves the
plugin repo. Operator question that surfaced it: "I'm adopting a client repo — how do
I ensure/verify it got the latest kernel?" Today: forensic diffing only.

## Acceptance
- adopt Step 5 stamps the target, e.g. in substrate.yaml:
    # substrate-kernel: <plugin.json version> @ <git -C $SUBSTRATE_ROOT rev-parse --short HEAD> (<date>)
  (comment line — no schema change; dirty-tree flagged with -dirty suffix).
- Handoff prints the stamp. Re-adopt overwrites it.
- Enables a future `adopt --refresh`: diff installed kernel vs current docs-core.
- opencode mirror re-translated. Repo gate green.

## State-transfer prompt
> Working in metalogica/substrate. Task: adopt stamps the kernel version+commit into
> the target repo.
> Relevant files: skills/adopt/SKILL.md Step 5 (install) + Step 9 (handoff);
> opencode/command/substrate/adopt.md; .claude-plugin/plugin.json (version source).
> Constraint: a comment, not a parsed field — nothing may start depending on it yet.
> Verification: repo gate; fresh adopt narrative shows the stamp; re-adopt replaces it.
