# queue.test.ts fixtures

The queue adapter is tested against a **real tbd repo**, but that repo is built
fresh per-test in an OS temp dir (`beforeEach`: `git init` → `tbd init`) and torn
down in `afterEach`. Nothing is committed here on purpose:

- a checked-in `.tbd` store would collide across parallel worktrees, and
- a throwaway repo proves the transitions against the actual CLI without polluting
  the tracked tree.

If a future test needs a static input (e.g. a canned YAML bead to import via
`tbd create --from-file`), drop it in this directory and load it by absolute path
from the test.
