---
type: is
id: is-01ky6dmsxcepw4jkz0ybdkszd9
title: "Docs: README verb table + config + permission-bypass risk; CLI help; CHANGELOG"
kind: task
status: closed
priority: 2
version: 4
labels:
  - epic:serve-v1
  - group:window-7
  - gate-scope:partial
dependencies:
  - type: blocks
    target: is-01ky6dmwp06b4qw21mkfh8befa
parent_id: is-01ky6dm7cmm0kzaza6379jer1p
created_at: 2026-07-23T02:42:31.466Z
updated_at: 2026-07-23T05:06:14.644Z
closed_at: 2026-07-23T05:06:14.644Z
close_reason: "gate green: README verb table + config + permission risk; CHANGELOG (docs gate + union green)"
---
Goal: README (serve/status/tidy/triage table, .substrate/serve.yaml config, the --dangerously-skip-permissions standing risk), scripts/substrate help text, CHANGELOG entry (spec 7.2 docs half).
Files (modifies): README.md scripts/substrate CHANGELOG.md
Consumes: b13 final behavior.
Gate: grep -q "substrate serve" README.md && grep -qi "permission" README.md; doctrine-lint green
gate-scope: partial (docs; union re-gate authorizes)
spec: docs/tasks/ongoing/serve-v1/serve-v1-spec.md#phase-7-step-7.2
