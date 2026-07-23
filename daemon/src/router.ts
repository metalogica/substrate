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
/** Prefix of the human's grooming prior — `kind:bug` | `kind:feature` | `kind:task`. */
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

/** Extract the human's `kind:` prior from a bead's labels, if present (first wins). */
export function kindOf(bead: Bead): string | undefined {
  const label = bead.labels.find((l) => l.startsWith(KIND_PREFIX));
  return label ? label.slice(KIND_PREFIX.length) : undefined;
}

/**
 * The pure §5.1 decision. No model, no side effects, no adapter — a function of the
 * bead's own metadata only:
 *
 *   - `needs-spec` label      → bounce (the spec lane is human, by design).
 *   - `kind:bug`              → route to the **bug** lane (`/substrate:diagnose`).
 *   - `kind:feature|task`     → route to the **quick** lane (`/substrate:quick-spec`).
 *   - missing / other `kind`  → bounce with `needs-groom: missing kind`.
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
