// router.ts — the §5.1 deterministic router: a PURE function of a groomed bead's
// own metadata. There is NO model call in the tick's routing decision (v1 locks
// brief OQ1); the machine only *follows* or *returns* the human's `kind:` prior,
// it never guesses one. Model-assisted `/substrate:triage` (NL) is v2.
//
// Two layers, kept apart on purpose:
//   1. `route(bead)`   — pure decision, no side effects, unit-testable in isolation.
//   2. `bounce(...)`   — the thin EFFECT wrapper that releases the claim + applies
//                        the label/note, driven through an injectable queue adapter
//                        so the tick can wire the real `Queue` and tests can wire a spy.

import type { Bead, Route } from "./queue.js";

/** Labels the router keys off (§5.1). */
export const NEEDS_SPEC_LABEL = "needs-spec";
/** Prefix of the OPTIONAL routing override — `kind:bug` | `kind:feature` | `kind:task`. */
export const KIND_PREFIX = "kind:";

/** Note stamped when a bead reaches the board without a routable `kind:` (§3.1). */
export const MISSING_KIND_NOTE = "needs-groom: missing kind";

/**
 * The router's decision (§5.1), modelled as a discriminated union so the tick must
 * handle both arms:
 *   - `route`  → claim proceeds to a lane (`quick` | `bug`).
 *   - `bounce` → claim is released back to the board; `reason` says why.
 */
export type RouteDecision =
  | { action: "route"; lane: Route }
  | { action: "bounce"; reason: string };

/**
 * The human's grooming prior, in precedence order:
 *
 *   1. a `kind:<x>` LABEL, if present (first wins) — the explicit override,
 *      for when routing should differ from the bead's declared type;
 *   2. else tbd's NATIVE `kind` field — what `tbd update --type` and the
 *      board's `t` key write, and therefore what nearly every bead carries.
 *
 * The field is the fallback rather than the label because the two are the same
 * datum under two names: tbd emits `kind` on every `--json` payload, while the
 * `kind:` label is a convention no part of substrate writes automatically.
 * Reading only the label made every board-groomed bead un-routable — it was
 * claimed, bounced `missing kind`, released back to `groomed`, and rediscovered
 * on the next tick forever (a missing-kind bounce leaves only a note, and notes
 * are not filtered out of discovery the way `needs-spec` is).
 */
export function kindOf(bead: Bead): string | undefined {
  const label = bead.labels.find((l) => l.startsWith(KIND_PREFIX));
  if (label) return label.slice(KIND_PREFIX.length);
  return bead.kind && bead.kind.length > 0 ? bead.kind : undefined;
}

/**
 * The pure §5.1 decision. No model, no side effects, no adapter — a function of the
 * bead's own metadata only:
 *
 *   - `needs-spec` label            → bounce (the spec lane is human, by design).
 *   - `kind:bug`                    → route to the **bug** lane.
 *   - `kind:feature|task|chore`     → route to the **quick** lane.
 *   - missing / other `kind`        → bounce with `needs-groom: missing kind`.
 *
 * `chore` routes rather than bouncing because the board TUI's `t` key cycles
 * `task → feature → bug → chore` (`scripts/bead-tui/watch.mjs`), so it is a kind a
 * human can reach in one keypress. Bouncing it as "missing kind" was doubly wrong:
 * the kind was present, and the note sent the operator looking for a grooming gap
 * that did not exist. `epic` is deliberately still absent — epic beads belong to
 * `/substrate:orchestrate`, and `Queue.list` already filters them out upstream.
 */
export function route(bead: Bead): RouteDecision {
  if (bead.labels.includes(NEEDS_SPEC_LABEL)) {
    return { action: "bounce", reason: NEEDS_SPEC_LABEL };
  }

  const kind = kindOf(bead);
  switch (kind) {
    case "bug":
      return { action: "route", lane: "bug" };
    case "feature":
    case "task":
    case "chore":
      return { action: "route", lane: "quick" };
    default:
      return { action: "bounce", reason: MISSING_KIND_NOTE };
  }
}

/**
 * The override-log hook (§5.1). In v1 the router NEVER overrides the human prior —
 * it only *follows* or *returns* it — so the obligation is trivially satisfied and
 * this is a deliberate no-op SEAM: v2's model-assisted triage will replace this body
 * to record `(prior kind → chosen lane)` divergences. Kept clearly named so the seam
 * is discoverable, and called on every `route` arm so wiring it later is a one-file edit.
 */
export function logOverride(_bead: Bead, _decision: RouteDecision): void {
  // no-op in v1: no model, no override to log.
}

/**
 * The subset of the queue adapter the bounce effect needs. Declared structurally so
 * the real `Queue` satisfies it and a test can pass a lightweight spy — the router
 * never constructs a `Queue`, the tick injects one.
 */
export interface BounceAdapter {
  /** any → released (§3.1): restore `groomed`, clear assignee, status → open. */
  release(id: string): void;
  /** Add the `needs-spec` label to a bead (bounce reason = spec lane is human). */
  addLabel(id: string, label: string): void;
  /** Attach a free-form working note to a bead (bounce reason = grooming gap). */
  note(id: string, note: string): void;
}

/**
 * The bounce EFFECT (§3.1 claimed → bounced): release the claim so the bead returns
 * to the board, then record WHY —
 *   - `needs-spec` reason → re-apply the `needs-spec` label (human spec lane).
 *   - any other reason    → attach it as a working note (e.g. `needs-groom: missing kind`).
 *
 * Pure decision stays in {@link route}; this is only the thin side-effecting wrapper
 * the tick calls when `route(...).action === "bounce"`.
 */
export function bounce(
  adapter: BounceAdapter,
  bead: Bead,
  reason: string,
): void {
  adapter.release(bead.id);
  if (reason === NEEDS_SPEC_LABEL) {
    adapter.addLabel(bead.id, NEEDS_SPEC_LABEL);
  } else {
    adapter.note(bead.id, reason);
  }
}
