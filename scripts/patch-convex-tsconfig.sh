#!/usr/bin/env bash
# Ensures convex/tsconfig.json has "baseUrl": ".." so path aliases
# (@/*, @domain/*, @test/*, @convex/*) resolve from the project root
# rather than from convex/ (Convex's generated tsconfig ships the
# aliases but omits the baseUrl).
#
# Run once after `npx convex dev` generates convex/tsconfig.json,
# typically from /substrate-migrate after Convex codegen completes.
# Idempotent — safe to re-run.

set -euo pipefail

CONFIG="convex/tsconfig.json"

if [ ! -f "$CONFIG" ]; then
  echo "ERROR: $CONFIG does not exist. Run 'npx convex dev' first." >&2
  exit 1
fi

node -e '
  const fs = require("fs");
  const path = "convex/tsconfig.json";
  const cfg = JSON.parse(fs.readFileSync(path, "utf8"));
  cfg.compilerOptions = cfg.compilerOptions || {};
  if (cfg.compilerOptions.baseUrl !== "..") {
    cfg.compilerOptions.baseUrl = "..";
    fs.writeFileSync(path, JSON.stringify(cfg, null, 2) + "\n");
    console.log("Patched: added \"baseUrl\": \"..\" to " + path);
  } else {
    console.log("OK: baseUrl already set in " + path);
  }
'
