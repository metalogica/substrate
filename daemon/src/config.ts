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

/**
 * How a dispatched bead's success is OBSERVED, and therefore which collaborators
 * the daemon needs at all:
 *
 * - `local`  — the DEFAULT. Nothing leaves the machine. A bead has landed when
 *   its worktree carries at least one commit AND the repo's own `substrate.yaml`
 *   gate is green there. No `gh`, no PR, no remote, no PR-sweep.
 * - `github` — the original serve-v1 contract (§5.2): landed ⇔ branch pushed ∧ PR
 *   open, with the §6 PR-sweep driving actualize/merge. Requires an authenticated
 *   `gh` and an `origin` remote.
 *
 * The mode is the single switch every GitHub-coupled path branches on; it never
 * changes the failure POLICY (retry-once-then-bounce), only what counts as
 * evidence that the work landed.
 */
export type Mode = "local" | "github";

export interface Config {
  /** How success is observed, and which collaborators are required. */
  mode: Mode;
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

/**
 * The fully-defaulted config used when `.substrate/serve.yaml` is absent (§2.3).
 *
 * Both lanes run the same skill: `/substrate:serve-bead` is the headless lane
 * contract (assess → scope → implement → gate → commit), and the bead's `kind`
 * reaches it as a HINT in the dispatch prompt rather than by selecting a skill.
 * The lanes remain distinct because they still carry independent `model` pins —
 * and because `router.ts`'s kind → lane decision stays a pure, tested function.
 */
export const DEFAULT_CONFIG: Config = {
  mode: "local",
  pollIntervalSec: 60,
  concurrency: 1,
  lanes: {
    quick: { skill: "serve-bead", model: null },
    bug: { skill: "serve-bead", model: null },
  },
  branchPrefix: "serve/",
  worktreeRoot: null,
};

/** Shape of the optional user override file — every field partial. */
interface PartialConfig {
  mode?: string;
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
 * Coerce a user-supplied `mode` to a {@link Mode}. An unrecognised value falls
 * back to the default rather than throwing: the mode decides which OPTIONAL
 * collaborators are required, and defaulting to `local` can only ever require
 * fewer of them. A typo therefore degrades to the safe, offline path instead of
 * silently arming the `gh` one.
 */
function coerceMode(raw: string | undefined): Mode {
  return raw === "github" || raw === "local" ? raw : DEFAULT_CONFIG.mode;
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
    mode: coerceMode(over.mode),
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
