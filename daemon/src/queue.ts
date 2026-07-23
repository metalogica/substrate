// queue.ts — typed adapter over the `tbd` CLI implementing the §3.1 lifecycle
// transitions. The daemon is the single writer for its own transitions; every
// mutation and every read goes through `tbd … --json` subprocesses. We never
// parse tbd's on-disk store — the CLI is the only contract.
//
// FIFO note (§4 step 3): the public display id (e.g. `probe-z24q`) has a random
// suffix and is NOT time-ordered. tbd's `internalId` is `is-<ULID>`, and the
// ULID is Crockford base32 and lexicographically sortable by creation time —
// so FIFO order is `internalId` ascending.

import { execFileSync } from "node:child_process";

/** Label that marks a bead as sitting on the board, ready to be pulled (§3.1). */
export const GROOMED_LABEL = "groomed";
/** Label that disqualifies a bead from discovery — it needs grooming (§4 step 3). */
export const NEEDS_SPEC_LABEL = "needs-spec";
/** Label applied once a PR exists and the bead is awaiting merge (§3.1). */
export const IN_REVIEW_LABEL = "in-review";
/** Assignee the daemon stamps onto beads it claims (§3.1). */
export const SERVE_ASSIGNEE = "serve";

/** The lane a claimed bead was routed to; drives the `route:*` stamp label. */
export type Route = "quick" | "bug";

/** The route label written onto a bead for a given lane (§3.1 claimed → routed). */
export function routeLabel(route: Route): `route:${Route}` {
  return `route:${route}`;
}

/**
 * The subset of a tbd issue the queue consumes. Modelled off `tbd list --json`
 * / `tbd show --json`; extra fields tbd emits are ignored.
 */
export interface Bead {
  /** Public display id (e.g. `sub-6v4l`) — the handle passed to every tbd verb. */
  id: string;
  /** `is-<ULID>` internal id; its ULID orders beads by creation time (FIFO key). */
  internalId: string;
  title: string;
  status: string;
  labels: string[];
  /** Present once claimed; absent/empty on the board. */
  assignee?: string;
}

/** How a lifecycle stamp marks a bead (§3.1 claimed → routed / routed → in-review). */
export interface Stamp {
  /** Route the bead was assigned; adds the `route:<lane>` label. */
  route?: Route;
  /** Free-form working note, e.g. `serve: PR <url>` or `serve: routed <lane>`. */
  note?: string;
  /** When true, also add the `in-review` label (post-PR). */
  inReview?: boolean;
}

/** Injectable subprocess runner — lets tests drive a real `tbd` in a fixture repo. */
export type Runner = (args: string[]) => string;

/** Options for constructing a {@link Queue}. */
export interface QueueOptions {
  /** Directory the `tbd` process runs in (the target repo root / fixture repo). */
  cwd: string;
  /** Path/name of the tbd binary. Defaults to `tbd` on PATH. */
  bin?: string;
  /** Override the subprocess runner (tests). Defaults to a real `execFileSync`. */
  runner?: Runner;
}

/** Extract the sortable ULID from an `is-<ULID>` internal id (lowercased, stable). */
function ulidOf(internalId: string): string {
  const dash = internalId.indexOf("-");
  return (dash >= 0 ? internalId.slice(dash + 1) : internalId).toLowerCase();
}

/** Ascending ULID comparator — the FIFO order beads are pulled in (§4 step 3). */
function byUlid(a: Bead, b: Bead): number {
  const ua = ulidOf(a.internalId);
  const ub = ulidOf(b.internalId);
  return ua < ub ? -1 : ua > ub ? 1 : 0;
}

/** Coerce one raw `tbd --json` object into our {@link Bead} shape (defensive). */
function toBead(raw: unknown): Bead {
  const r = (raw ?? {}) as Record<string, unknown>;
  const labels = Array.isArray(r.labels)
    ? r.labels.filter((l): l is string => typeof l === "string")
    : [];
  return {
    id: String(r.id ?? ""),
    internalId: String(r.internalId ?? ""),
    title: typeof r.title === "string" ? r.title : "",
    status: typeof r.status === "string" ? r.status : "",
    labels,
    assignee: typeof r.assignee === "string" ? r.assignee : undefined,
  };
}

/**
 * Typed adapter over the `tbd` CLI. One instance is bound to one repo (`cwd`).
 * All methods are thin shells over `tbd <verb> … --json`; none touch the store.
 */
export class Queue {
  private readonly run: Runner;

  constructor(private readonly opts: QueueOptions) {
    const bin = opts.bin ?? "tbd";
    const cwd = opts.cwd;
    this.run =
      opts.runner ??
      ((args: string[]): string =>
        execFileSync(bin, args, { cwd, encoding: "utf8" }));
  }

  /** Run a tbd verb and parse its `--json` stdout as `T`. */
  private json<T>(args: string[]): T {
    const out = this.run([...args, "--json"]);
    return JSON.parse(out) as T;
  }

  /** Run a tbd verb for its side effect, ignoring stdout. */
  private exec(args: string[]): void {
    this.run([...args, "--json"]);
  }

  /**
   * Discover claimable beads (§4 step 3): open + `groomed`, `needs-spec`
   * excluded, returned FIFO by ULID (oldest first).
   */
  list(): Bead[] {
    const raw = this.json<unknown[]>([
      "list",
      "--label",
      GROOMED_LABEL,
      "--status",
      "open",
    ]);
    const beads = (Array.isArray(raw) ? raw : []).map(toBead);
    return beads
      .filter((b) => !b.labels.includes(NEEDS_SPEC_LABEL))
      .sort(byUlid);
  }

  /**
   * groomed → claimed (§3.1): status → in_progress, assignee → serve, and drop
   * the `groomed` label so the bead leaves the board.
   */
  claim(id: string): void {
    this.exec([
      "update",
      id,
      "--status",
      "in_progress",
      "--assignee",
      SERVE_ASSIGNEE,
      "--remove-label",
      GROOMED_LABEL,
    ]);
  }

  /**
   * Add a single label to a bead (§3.1 support). Minimal verb the router's
   * {@link import("./router.js").BounceAdapter} needs to re-apply `needs-spec`
   * on a spec-lane bounce — the pure `stamp` seam only carries `route`/`in-review`
   * labels, not an arbitrary one. Kept intentionally narrow (one label, no note).
   */
  addLabel(id: string, label: string): void {
    this.exec(["update", id, "--add-label", label]);
  }

  /**
   * any → released (§3.1): restore the `groomed` label, clear the assignee, and
   * set status back to open so the bead returns to the board.
   */
  release(id: string): void {
    this.exec([
      "update",
      id,
      "--status",
      "open",
      "--assignee",
      "",
      "--add-label",
      GROOMED_LABEL,
    ]);
  }

  /**
   * claimed → routed / routed → in-review (§3.1): add the route label and/or a
   * working note, optionally flipping the bead to `in-review`. A no-op stamp
   * (nothing to add) is a no-op subprocess-free.
   */
  stamp(id: string, stamp: Stamp): void {
    const args = ["update", id];
    if (stamp.route) args.push("--add-label", routeLabel(stamp.route));
    if (stamp.inReview) args.push("--add-label", IN_REVIEW_LABEL);
    if (stamp.note) args.push("--notes", stamp.note);
    // Guard: an empty stamp would be a bare `tbd update <id>` — skip it.
    if (args.length === 2) return;
    this.exec(args);
  }

  /** in-review → closed (§3.1): `tbd close <id> --reason "…"`. */
  close(id: string, reason: string): void {
    this.exec(["close", id, "--reason", reason]);
  }
}
