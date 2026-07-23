---
type: is
id: is-01ky7yfqzy3y27d7st09nh3ky2
title: "graph-spec: infer blocked-by edge when two beads share a write-target file (create->modify)"
kind: bug
status: open
priority: 1
version: 1
spec_path: docs/tasks/ongoing/serve-v1/serve-v1-spec.md
labels:
  - src:synth-serve-v1
dependencies: []
created_at: 2026-07-23T16:56:05.883Z
updated_at: 2026-07-23T16:56:05.883Z
---
## Why now (session signal)
During epic:serve-v1 orchestration (Wave 4), sub-fu3f (creates daemon/src/triage.ts) and sub-35nn (modifies triage.ts + tick.ts) were placed in the SAME wave by graph-spec, yet both write triage.ts. The orchestrator's runtime file-disjoint guard caught the collision and split them into consecutive sub-waves (4a create -> 4b modify), but graph-spec should have inferred that blocked-by edge itself.

## Acceptance criterion
graph-spec's edge inference adds `blocked-by` between two beads when one bead's write-scope (Files: creates) and another's write-scope (Files: modifies) name the SAME file — the modifier is blocked-by the creator (create-before-modify). Verify: a spec where step A creates X and step B modifies X yields A -> B in the graph (not the same wave). Distinct from sub-f7im (serial-spine/destructive-migration annotation).

## State-transfer prompt
> Working in git@github.com:metalogica/substrate.git (the substrate plugin repo).
> Task: strengthen /substrate:graph-spec edge inference so two beads that share a write-target file get a blocked-by edge (create->modify order), instead of landing in one parallel wave.
> Relevant files:
> - skills/graph-spec/SKILL.md — the edge-inference rules (files/symbols consumed vs created)
> - references/docs-core/docs/scripts/bead-graph.sh — wave renderer (verify with --epic <slug>)
> Constraints: the orchestrator's runtime file-guard must remain (defense in depth); this closes the graph-side gap.
> Verification: construct a 2-bead spec (create X; modify X), graph it, confirm they land in consecutive waves.
