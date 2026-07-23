import { describe, it, expect } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  loadConfig,
  DEFAULT_CONFIG,
  CONCURRENCY_HARD_CAP,
} from "../src/config.js";

function tempRepo(): string {
  return mkdtempSync(join(tmpdir(), "serve-cfg-"));
}

function writeServeYaml(repoRoot: string, body: string): void {
  mkdirSync(join(repoRoot, ".substrate"), { recursive: true });
  writeFileSync(join(repoRoot, ".substrate", "serve.yaml"), body, "utf8");
}

describe("loadConfig", () => {
  it("returns the spec §2.3 defaults when no serve.yaml is present", () => {
    const repo = tempRepo();
    try {
      const cfg = loadConfig(repo);
      expect(cfg).toEqual(DEFAULT_CONFIG);
      expect(cfg.pollIntervalSec).toBe(60);
      expect(cfg.concurrency).toBe(1);
      expect(cfg.lanes.quick).toEqual({ skill: "quick-spec", model: null });
      expect(cfg.lanes.bug).toEqual({ skill: "diagnose", model: null });
      expect(cfg.branchPrefix).toBe("serve/");
      expect(cfg.worktreeRoot).toBeNull();
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  it("merges user overrides over the defaults", () => {
    const repo = tempRepo();
    try {
      writeServeYaml(
        repo,
        [
          "pollIntervalSec: 30",
          "branchPrefix: factory/",
          "lanes:",
          "  bug: { skill: diagnose, model: opus }",
        ].join("\n"),
      );
      const cfg = loadConfig(repo);
      expect(cfg.pollIntervalSec).toBe(30);
      expect(cfg.branchPrefix).toBe("factory/");
      expect(cfg.lanes.bug).toEqual({ skill: "diagnose", model: "opus" });
      // Untouched fields keep their defaults.
      expect(cfg.lanes.quick).toEqual({ skill: "quick-spec", model: null });
      expect(cfg.concurrency).toBe(1);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  it("clamps concurrency to the v1 hard cap", () => {
    const repo = tempRepo();
    try {
      writeServeYaml(repo, "concurrency: 8");
      const cfg = loadConfig(repo);
      expect(cfg.concurrency).toBe(CONCURRENCY_HARD_CAP);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });
});
