// events.ts — the append-only lifecycle ledger (spec §3.2b).
//
// `.substrate/serve/events.jsonl`: ONE JSON line per lifecycle transition. This
// is HISTORY, not state — never read by the tick, never reconstructed later, and
// the data source for the v2 `substrate report` verb (merged beads/week vs tokens
// spent = the factory-ROI metric). Because it is pure history, the writer is
// intentionally tiny: serialize one record, append one line, never truncate.
//
// The write is behind an injectable {@link EventSink} so the serve loop wires the
// real fs appender while tests capture events in memory with zero disk I/O.

import { appendFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";

/** Usage carried on a `dispatch`/`actualize` event, from the session JSON (§5.2). */
export interface EventUsage {
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

/** The lifecycle transitions the ledger records (§3.2b). */
export type EventKind =
  | "claim"
  | "route"
  | "bounce"
  | "dispatch"
  | "pr-open"
  | "actualize"
  | "merge"
  | "tidy"
  | "release";

/**
 * One ledger line (§3.2b): `{ts, bead, event, lane?, pr?, sessionOrdinal?,
 * usage?}`. `ts` is stamped by the writer; callers pass everything else. Optional
 * fields are omitted from the serialized line when absent so the JSONL stays lean.
 */
export interface ServeEvent {
  /** The lifecycle transition this line records. */
  event: EventKind;
  /** The bead the transition happened to. */
  bead: string;
  /** Lane the bead was routed to, on `route`/`dispatch`/`pr-open`. */
  lane?: string;
  /** PR url/number once one exists, on `pr-open`/`merge`/`actualize`. */
  pr?: string;
  /** Session ordinal `n`, on `dispatch`/`actualize`. */
  sessionOrdinal?: number;
  /** Token/cost usage from the headless session JSON, on `dispatch`/`actualize`. */
  usage?: EventUsage;
}

/** The write seam: append one already-serialized ledger line. Injectable for tests. */
export type EventSink = (line: string) => void;

/** The events.jsonl path for a served repo (§3.2b). */
export function eventsPath(repoRoot: string): string {
  return join(repoRoot, ".substrate", "serve", "events.jsonl");
}

/**
 * Serialize one event to its JSONL line (§3.2b), stamping `ts` from `now` and
 * dropping every absent optional field so the line carries only what happened.
 * Pure + deterministic (clock injected) so the exact line is snapshot-testable.
 */
export function serializeEvent(ev: ServeEvent, now: () => string): string {
  const record: Record<string, unknown> = {
    ts: now(),
    bead: ev.bead,
    event: ev.event,
  };
  if (ev.lane !== undefined) record.lane = ev.lane;
  if (ev.pr !== undefined) record.pr = ev.pr;
  if (ev.sessionOrdinal !== undefined) record.sessionOrdinal = ev.sessionOrdinal;
  if (ev.usage !== undefined) record.usage = ev.usage;
  return JSON.stringify(record);
}

/**
 * The real fs {@link EventSink}: ensure `.substrate/serve/` exists, then APPEND
 * one line (never truncate) so the ledger accretes across ticks and restarts.
 */
export function fileEventSink(repoRoot: string): EventSink {
  const path = eventsPath(repoRoot);
  return (line: string): void => {
    mkdirSync(dirname(path), { recursive: true });
    appendFileSync(path, line + "\n", "utf8");
  };
}

/**
 * A tiny event writer: bind a {@link EventSink} + a clock, expose `emit(ev)`. The
 * serve loop constructs one via {@link fileEventWriter} and calls `emit` at every
 * transition; tests bind an in-memory sink and assert the captured records.
 */
export interface EventWriter {
  emit(ev: ServeEvent): void;
}

/** Build an {@link EventWriter} over any {@link EventSink} (clock injectable). */
export function createEventWriter(
  sink: EventSink,
  now: () => string = () => new Date().toISOString(),
): EventWriter {
  return {
    emit(ev: ServeEvent): void {
      sink(serializeEvent(ev, now));
    },
  };
}

/** The production {@link EventWriter}: appends to `<repo>/.substrate/serve/events.jsonl`. */
export function fileEventWriter(repoRoot: string): EventWriter {
  return createEventWriter(fileEventSink(repoRoot));
}
