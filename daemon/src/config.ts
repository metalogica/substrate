// config.ts — .substrate/serve.yaml loader + defaults (spec §2.3).
// Optional file in the target repo; every field defaulted. Parsed with `yaml`
// (parsing only). User values are merged over the defaults.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";

/** A single dispatch lane: which skill runs and (optionally) which model to pin. */
export interface Lane {
  /** Skill invoked for beads routed to this lane (e.g. "quick-spec", "diagnose"). */
  skill: string;
  /** Model override; `null` means inherit the session default. */
  model: string | null;
}

export interface Config {
  /** Seconds between poll cycles. */
  pollIntervalSec: number;
  /** Max in-flight beads. Hard-capped at 2 in v1. */
  concurrency: number;
  /** Route target → lane. */
  lanes: {
    quick: Lane;
    bug: Lane;
  };
  /** Branch name prefix for daemon-cut worktree branches. */
  branchPrefix: string;
  /** Root dir for sibling worktrees; `null` → default `../<repo-name>-serve/`. */
  worktreeRoot: string | null;
}

/** Hard upper bound on concurrency in v1, regardless of config (§2.3). */
export const CONCURRENCY_HARD_CAP = 2;

/** The fully-defaulted config used when `.substrate/serve.yaml` is absent (§2.3). */
export const DEFAULT_CONFIG: Config = {
  pollIntervalSec: 60,
  concurrency: 1,
  lanes: {
    quick: { skill: "quick-spec", model: null },
    bug: { skill: "diagnose", model: null },
  },
  branchPrefix: "serve/",
  worktreeRoot: null,
};

/** Shape of the optional user override file — every field partial. */
interface PartialConfig {
  pollIntervalSec?: number;
  concurrency?: number;
  lanes?: {
    quick?: Partial<Lane>;
    bug?: Partial<Lane>;
  };
  branchPrefix?: string;
  worktreeRoot?: string | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Read and parse `.substrate/serve.yaml` if present; `null` when absent/empty. */
function readOverride(repoRoot: string): PartialConfig | null {
  const path = join(repoRoot, ".substrate", "serve.yaml");
  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch {
    // Missing file is the common case — all fields are defaulted.
    return null;
  }
  const parsed: unknown = parseYaml(raw);
  return isRecord(parsed) ? (parsed as PartialConfig) : null;
}

function mergeLane(base: Lane, over: Partial<Lane> | undefined): Lane {
  if (!over) return base;
  return {
    skill: over.skill ?? base.skill,
    model: over.model === undefined ? base.model : over.model,
  };
}

/**
 * Load config for `repoRoot`, merging an optional `.substrate/serve.yaml` over
 * {@link DEFAULT_CONFIG}. `concurrency` is clamped to {@link CONCURRENCY_HARD_CAP}.
 */
export function loadConfig(repoRoot: string): Config {
  const over = readOverride(repoRoot);
  if (!over) return { ...DEFAULT_CONFIG };

  const concurrency = Math.min(
    over.concurrency ?? DEFAULT_CONFIG.concurrency,
    CONCURRENCY_HARD_CAP,
  );

  return {
    pollIntervalSec: over.pollIntervalSec ?? DEFAULT_CONFIG.pollIntervalSec,
    concurrency,
    lanes: {
      quick: mergeLane(DEFAULT_CONFIG.lanes.quick, over.lanes?.quick),
      bug: mergeLane(DEFAULT_CONFIG.lanes.bug, over.lanes?.bug),
    },
    branchPrefix: over.branchPrefix ?? DEFAULT_CONFIG.branchPrefix,
    worktreeRoot:
      over.worktreeRoot === undefined
        ? DEFAULT_CONFIG.worktreeRoot
        : over.worktreeRoot,
  };
}
