# Phase 6 — E2E dry-run (DEFERRED, per gate)

**Status:** Deferred to a live runtime. The Phase 6 gate explicitly permits deferral "with the
exact manual command recorded if a live runtime is unavailable."

## Why deferred here

The substrate **plugin repo itself** is not a substrate-adopted target: it has no root
`docs/scripts/bead-graph.sh` (the script lives under `references/docs-core/docs/scripts/` as a
template) and no graphed `epic:orchestrate` bead DAG to fan out. A worktree-fleet dry-run needs a
real adopted repo with a graphed epic + a declared `substrate.yaml` gate. The brief's named first
customer, **keylark slice-2** (`/Users/reinova/code/soulbound-labs/keylark`), is a separate repo
requiring its own live session.

## Exact manual command to run once a live runtime is available

In an adopted repo (keylark slice-2, or a sandbox) that has a graphed epic and a `substrate.yaml`
`gate` block:

```bash
# 0. Preconditions
git config --get commit.gpgsign          # note the starting value (expect: true)
bash docs/scripts/bead-graph.sh --epic <slug>   # confirm the DAG renders waves

# 1. Kick off orchestrate, stop at the FIRST wave pause (do NOT pass --auto)
#    In a fresh Claude Code session:
/substrate:orchestrate <slug>
```

## What to confirm at the first-wave pause (behavioral checklist)

- `feat/<slug>` integration branch was cut from trunk.
- One `git worktree` per file-disjoint ready bead, each branched off the **current integration tip**
  (`git worktree list`).
- Each worktree contains the `worktree-seed[]` gitignored inputs (copied before dispatch).
- The gate command dispatched to each `bead-implementer` is **fully env-resolved**
  (`toolchain-pin.env` prefix + `gate.*` literals) — no bare command that finds no toolchain.
- Green beads merged into `feat/<slug>`; the integrated tip was **re-gated** after the merges.
- Any Policy-4 out-of-band bead left **open + noted** "merged; awaiting `<gate>`" (not closed).
- **`git config --get commit.gpgsign` returns `true` at the stop** (signing restored / never left off).

## Signing state in THIS session

```
$ git config --get commit.gpgsign
true
```

No orchestrate run was started here, so signing was never toggled — it remains `true`, satisfying
the invariant "MUST be true when no run is in flight" (§9 Operational Queries).
