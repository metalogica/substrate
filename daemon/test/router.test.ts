// router.test.ts — unit-proves the §5.1 deterministic router. The decision is a
// PURE function of bead metadata (no tbd, no model, no fixture repo), so unlike
// queue.test.ts these are fast in-memory unit tests with a spy bounce adapter.
//
// Coverage: all four §5.1 route cases —
//   1. needs-spec         → bounce (reason = "needs-spec")
//   2. kind:bug           → route bug
//   3. kind:feature|task  → route quick
//   4. missing/other kind → bounce (reason = "needs-groom: missing kind")
// plus the bounce EFFECT: needs-spec re-labels, other reasons attach a note.

import { describe, it, expect } from "vitest";
import {
  route,
  bounce,
  kindOf,
  logOverride,
  NEEDS_SPEC_LABEL,
  MISSING_KIND_NOTE,
  type BounceAdapter,
} from "../src/router.js";
import type { Bead } from "../src/queue.js";

/** Build a minimal groomed {@link Bead} with the given labels for a route decision. */
function bead(labels: string[], id = "fx-0000"): Bead {
  return {
    id,
    internalId: "is-00000000000000000000000000",
    title: "a bead",
    status: "in_progress",
    labels,
    assignee: "serve",
  };
}

/** A spy adapter recording every bounce side effect in call order. */
function spyAdapter(): BounceAdapter & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    release(id) {
      calls.push(`release:${id}`);
    },
    addLabel(id, label) {
      calls.push(`addLabel:${id}:${label}`);
    },
    note(id, note) {
      calls.push(`note:${id}:${note}`);
    },
  };
}

describe("router.ts route() — the four §5.1 cases", () => {
  it("needs-spec label bounces (spec lane is human)", () => {
    // needs-spec wins even if a routable kind is also present.
    const d = route(bead([NEEDS_SPEC_LABEL, "kind:feature"]));
    expect(d).toEqual({ action: "bounce", reason: NEEDS_SPEC_LABEL });
  });

  it("kind:bug routes to the bug lane", () => {
    expect(route(bead(["kind:bug"]))).toEqual({
      action: "route",
      lane: "bug",
    });
  });

  it("kind:feature routes to the quick lane", () => {
    expect(route(bead(["kind:feature"]))).toEqual({
      action: "route",
      lane: "quick",
    });
  });

  it("kind:task routes to the quick lane", () => {
    expect(route(bead(["kind:task"]))).toEqual({
      action: "route",
      lane: "quick",
    });
  });

  it("a missing kind bounces with the needs-groom note", () => {
    expect(route(bead([]))).toEqual({
      action: "bounce",
      reason: MISSING_KIND_NOTE,
    });
  });

  it("an unrecognised kind bounces with the needs-groom note", () => {
    expect(route(bead(["kind:chore"]))).toEqual({
      action: "bounce",
      reason: MISSING_KIND_NOTE,
    });
  });
});

describe("router.ts kindOf()", () => {
  it("extracts the kind value from the first kind: label", () => {
    expect(kindOf(bead(["groomed", "kind:bug"]))).toBe("bug");
  });

  it("is undefined when no kind: label is present", () => {
    expect(kindOf(bead(["groomed"]))).toBeUndefined();
  });
});

describe("router.ts bounce() — the §3.1 effect, incl. bounce notes", () => {
  it("needs-spec bounce releases the claim and re-applies the needs-spec label", () => {
    const a = spyAdapter();
    bounce(a, bead([NEEDS_SPEC_LABEL], "fx-spec"), NEEDS_SPEC_LABEL);
    expect(a.calls).toEqual([
      "release:fx-spec",
      `addLabel:fx-spec:${NEEDS_SPEC_LABEL}`,
    ]);
  });

  it("missing-kind bounce releases the claim and attaches the needs-groom note", () => {
    const a = spyAdapter();
    bounce(a, bead([], "fx-nokind"), MISSING_KIND_NOTE);
    expect(a.calls).toEqual([
      "release:fx-nokind",
      `note:fx-nokind:${MISSING_KIND_NOTE}`,
    ]);
  });

  it("route → bounce composes: a missing-kind decision drives the missing-kind note", () => {
    const b = bead([], "fx-compose");
    const d = route(b);
    expect(d.action).toBe("bounce");
    if (d.action === "bounce") {
      const a = spyAdapter();
      bounce(a, b, d.reason);
      expect(a.calls).toEqual([
        "release:fx-compose",
        `note:fx-compose:${MISSING_KIND_NOTE}`,
      ]);
    }
  });
});

describe("router.ts logOverride() — the v1 no-op seam", () => {
  it("is a no-op that never throws (no override to log in v1)", () => {
    expect(() =>
      logOverride(bead(["kind:bug"]), { action: "route", lane: "bug" }),
    ).not.toThrow();
  });
});
