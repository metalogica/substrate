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
      // local is the DEFAULT mode: nothing leaves the machine unless asked.
      expect(cfg.mode).toBe("local");
      expect(cfg.pollIntervalSec).toBe(60);
      expect(cfg.concurrency).toBe(1);
      // Both lanes run the headless lane skill; the bead's kind reaches it as a
      // hint in the prompt rather than by selecting a different skill.
      expect(cfg.lanes.quick).toEqual({ skill: "serve-bead", model: null });
      expect(cfg.lanes.bug).toEqual({ skill: "serve-bead", model: null });
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
      expect(cfg.lanes.quick).toEqual({ skill: "serve-bead", model: null });
      expect(cfg.concurrency).toBe(1);
      expect(cfg.mode).toBe("local");
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  it("honours an explicit mode: github", () => {
    const repo = tempRepo();
    try {
      writeServeYaml(repo, "mode: github");
      expect(loadConfig(repo).mode).toBe("github");
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  it("falls back to local on an unrecognised mode rather than arming gh", () => {
    // The mode decides which OPTIONAL collaborators are required, so a typo must
    // degrade to the path that needs FEWER of them — never silently to `github`.
    const repo = tempRepo();
    try {
      writeServeYaml(repo, "mode: githbu");
      expect(loadConfig(repo).mode).toBe("local");
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
