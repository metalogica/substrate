// state.ts — state.json read/write (atomic, versioned). Spec §3.2.
// Observability only: the tick may derive from it but truth lives in {tbd, git, gh}.
// Atomic write = write a temp sibling then rename over the target.

import { readFileSync, writeFileSync, renameSync } from "node:fs";
import { dirname, join } from "node:path";

/** state.json schema version. Bump on any breaking shape change. */
export const SCHEMA_VERSION = 1;

export type Phase = "building" | "in-review";

/** One in-flight bead being built or reviewed. */
export interface InFlight {
  bead: string;
  lane: string;
  worktree: string;
  branch: string;
  /** PR URL once opened; `null` while still building. */
  pr: string | null;
  phase: Phase;
  /** PID of the headless session process, or `null` if not (yet) spawned. */
  sessionPid: number | null;
  startedAt: string;
}

export interface State {
  schemaVersion: number;
  /** ISO timestamp of the last completed tick; `null` before the first tick. */
  lastTick: string | null;
  inFlight: InFlight[];
  /** Bead ids bounced back to the board this session. */
  bounced: string[];
  /** Ring buffer of recent human-readable event lines. */
  recentEvents: string[];
}

/** A fresh, empty state at the current schema version. */
export function emptyState(): State {
  return {
    schemaVersion: SCHEMA_VERSION,
    lastTick: null,
    inFlight: [],
    bounced: [],
    recentEvents: [],
  };
}

function isState(value: unknown): value is State {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.schemaVersion === "number" &&
    (v.lastTick === null || typeof v.lastTick === "string") &&
    Array.isArray(v.inFlight) &&
    Array.isArray(v.bounced) &&
    Array.isArray(v.recentEvents)
  );
}

/**
 * Read state from `path`. Returns a fresh {@link emptyState} when the file is
 * absent or unparseable — the daemon is crash-recoverable, so a missing/garbled
 * observability file is never fatal.
 */
export function readState(path: string): State {
  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch {
    return emptyState();
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return emptyState();
  }
  return isState(parsed) ? parsed : emptyState();
}

/**
 * Atomically write `state` to `path`: serialize, write to a temp sibling, then
 * rename over the target so a reader never observes a half-written file.
 */
export function writeState(path: string, state: State): void {
  const payload = JSON.stringify(state, null, 2) + "\n";
  const tmp = join(dirname(path), `.${process.pid}.state.json.tmp`);
  writeFileSync(tmp, payload, "utf8");
  renameSync(tmp, path);
}
