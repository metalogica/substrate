import { describe, it, expect } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  emptyState,
  readState,
  writeState,
  SCHEMA_VERSION,
  type State,
} from "../src/state.js";

function tempDir(): string {
  return mkdtempSync(join(tmpdir(), "serve-state-"));
}

describe("state.json", () => {
  it("reads a fresh empty state when the file is absent", () => {
    const dir = tempDir();
    try {
      const s = readState(join(dir, "state.json"));
      expect(s).toEqual(emptyState());
      expect(s.schemaVersion).toBe(SCHEMA_VERSION);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("round-trips a populated state atomically", () => {
    const dir = tempDir();
    const path = join(dir, "state.json");
    try {
      const written: State = {
        schemaVersion: SCHEMA_VERSION,
        lastTick: "2026-07-22T00:00:00.000Z",
        inFlight: [
          {
            bead: "sub-abc1",
            lane: "quick",
            worktree: "../repo-serve/sub-abc1",
            branch: "serve/sub-abc1-slug",
            pr: null,
            phase: "building",
            sessionPid: 4242,
            startedAt: "2026-07-22T00:00:00.000Z",
          },
        ],
        bounced: ["sub-def2"],
        recentEvents: ["claim sub-abc1"],
      };
      writeState(path, written);
      const read = readState(path);
      expect(read).toEqual(written);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
