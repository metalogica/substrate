// gate.test.ts — the substrate.yaml `gate:` reader.
//
// In `mode: local` the gate IS the daemon's done-signal, so the distinction this
// module has to get right is "absent / unreadable / empty" vs "declared". A false
// "declared" would make the daemon run garbage; a false "absent" would make it
// refuse every bead. Both are proven here against real files on disk — the reader
// does no I/O beyond one readFileSync, so a temp dir is cheaper than a mock.

import { describe, it, expect } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadGate, gateCommands, gatePath } from "../src/gate.js";

function tempRepo(): string {
  return mkdtempSync(join(tmpdir(), "serve-gate-"));
}

function writeSubstrateYaml(repoRoot: string, body: string): void {
  writeFileSync(join(repoRoot, "substrate.yaml"), body, "utf8");
}

/** Run `fn` against a throwaway repo dir, cleaning up afterwards. */
function withRepo(fn: (repo: string) => void): void {
  const repo = tempRepo();
  try {
    fn(repo);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
}

describe("gatePath", () => {
  it("is substrate.yaml at the repo root", () => {
    expect(gatePath("/home/u/repo")).toBe("/home/u/repo/substrate.yaml");
  });
});

describe("loadGate", () => {
  it("reads compile/test/lint from the gate block", () => {
    withRepo((repo) => {
      writeSubstrateYaml(
        repo,
        [
          "gate:",
          '  compile: "cd daemon && tsc --noEmit"',
          '  test: "cd daemon && vitest run"',
          '  lint: "bash lint.sh"',
        ].join("\n"),
      );
      expect(loadGate(repo)).toEqual({
        compile: "cd daemon && tsc --noEmit",
        test: "cd daemon && vitest run",
        lint: "bash lint.sh",
      });
    });
  });

  it("keeps the fields that ARE declared and leaves the rest undefined", () => {
    // A repo with no linter is legitimate; it must not be conflated with a repo
    // that declares no gate at all.
    withRepo((repo) => {
      writeSubstrateYaml(repo, ["gate:", '  test: "npm test"'].join("\n"));
      const gate = loadGate(repo);
      expect(gate).toEqual({ compile: undefined, test: "npm test", lint: undefined });
      expect(gateCommands(gate)).toEqual(["npm test"]);
    });
  });

  it("returns null when substrate.yaml is absent", () => {
    withRepo((repo) => {
      expect(loadGate(repo)).toBeNull();
    });
  });

  it("returns null when substrate.yaml carries no gate block", () => {
    withRepo((repo) => {
      writeSubstrateYaml(repo, "worktree-seed:\n  - node_modules\n");
      expect(loadGate(repo)).toBeNull();
    });
  });

  it("returns null on unparseable yaml rather than throwing", () => {
    // A malformed gate must not crash the daemon at boot; preflight reports it.
    withRepo((repo) => {
      writeSubstrateYaml(repo, "gate: [unclosed\n");
      expect(loadGate(repo)).toBeNull();
    });
  });

  it("ignores empty/whitespace-only commands", () => {
    withRepo((repo) => {
      writeSubstrateYaml(repo, ['gate:', '  compile: "   "', '  test: "npm test"'].join("\n"));
      expect(gateCommands(loadGate(repo))).toEqual(["npm test"]);
    });
  });
});

describe("gateCommands", () => {
  it("orders compile → test → lint (cheapest failure first)", () => {
    expect(gateCommands({ lint: "l", test: "t", compile: "c" })).toEqual(["c", "t", "l"]);
  });

  it("is empty for a null gate — the signal callers treat as 'no gate declared'", () => {
    expect(gateCommands(null)).toEqual([]);
  });

  it("is empty for a gate block with every field blank", () => {
    expect(gateCommands({})).toEqual([]);
  });
});
