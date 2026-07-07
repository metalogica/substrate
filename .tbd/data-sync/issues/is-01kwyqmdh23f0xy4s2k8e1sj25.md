---
type: is
id: is-01kwyqmdh23f0xy4s2k8e1sj25
title: "[1.1] Write agents/bead-implementer.md (task:deny; edit/bash/read allow; no tbd/no push)"
kind: task
status: closed
priority: 2
version: 3
labels:
  - epic:orchestrate
dependencies:
  - type: blocks
    target: is-01kwyqmfnzpp7n5s1jsr4g0t7p
parent_id: is-01kwyqmd14n7ey3kqmtfh6qvg1
created_at: 2026-07-07T16:47:27.266Z
updated_at: 2026-07-07T17:06:19.777Z
closed_at: 2026-07-07T17:06:19.773Z
close_reason: "Phase 1: agents/bead-implementer.md written; task:deny + standing rule verified"
---
Gate: test -f agents/bead-implementer.md; grep task:deny; grep 'no tbd' + 'no git push'. Per spec §4.1.
