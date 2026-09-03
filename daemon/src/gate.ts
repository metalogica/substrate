// gate.ts — read the repo's own verification contract from `substrate.yaml`.
//
// `substrate.yaml` is substrate's stack-agnostic gate declaration: the repo names
// its OWN compile/test/lint commands there, so tooling never has to guess a
// toolchain (the `pnpm app:*` assumption baked into several skills is exactly the
// bug this avoids). Until now only the natural-language `/substrate:orchestrate`
// skill read it; `mode: local` needs it in TypeScript, because the gate IS the
// daemon's done-signal (see observe.ts).
//
// Parsing only — this module never runs anything. Executing the commands is
// observe.ts's job, so the reader stays trivially testable.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";

/**
 * The repo's declared verification commands. Every field is optional because a
 * repo may legitimately have no linter (or no test suite yet); what is NOT
 * optional in `mode: local` is that at least ONE of them exists — see
 * {@link gateCommands}.
 */
export interface Gate {
  compile?: string;
  test?: string;
  lint?: string;
}

/** The `substrate.yaml` path for a repo. */
export function gatePath(repoRoot: string): string {
  return join(repoRoot, "substrate.yaml");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Keep a `gate:` entry only when it is a non-empty string. */
function str(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

/**
 * Read the `gate:` block from `<repoRoot>/substrate.yaml`. Returns `null` when
 * the file is absent, unparseable, or carries no `gate:` block at all — the
 * three cases a caller must distinguish from "present but empty", since in
 * `mode: local` a missing gate means the daemon has no way to observe success
 * and must refuse to start rather than silently accept any commit.
 */
export function loadGate(repoRoot: string): Gate | null {
  let raw: string;
  try {
    raw = readFileSync(gatePath(repoRoot), "utf8");
  } catch {
    return null;
  }

  let parsed: unknown;
  try {
    parsed = parseYaml(raw);
  } catch {
    return null;
  }
  if (!isRecord(parsed)) return null;

  const block = parsed.gate;
  if (!isRecord(block)) return null;

  return {
    compile: str(block.compile),
    test: str(block.test),
    lint: str(block.lint),
  };
}

/**
 * The gate as an ordered list of shell commands to run: compile, then test, then
 * lint. The order is deliberate and matches how the skills state it — compile is
 * the cheapest and most likely to fail, so a broken tree fails fast instead of
 * paying for a full test run first.
 *
 * An absent {@link Gate} (or one with every field empty) yields `[]`, which is
 * the signal callers treat as "this repo declares no gate".
 */
export function gateCommands(gate: Gate | null): string[] {
  if (gate === null) return [];
  return [gate.compile, gate.test, gate.lint].filter(
    (cmd): cmd is string => cmd !== undefined,
  );
}
