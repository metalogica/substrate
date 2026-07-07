#!/usr/bin/env node
// bead-tui — a live, terminal view of a bead DAG that re-renders as tbd state
// evolves: beads change status, new beads appear, the graph fills in. Zero runtime
// deps (Node built-ins only), so it ships wherever bead-graph.sh ships.
//
//   node watch.mjs                       # live view of the bundled fixture
//   node watch.mjs --tbd <epic-slug>     # live view of epic:<slug> from tbd
//   node watch.mjs --tbd tui-viz --once  # render one frame and exit (for CI/verify)
//   node watch.mjs --fixture path.json   # live view of a specific fixture file
//
// Topology is Kahn's waves (same layering bead-graph.sh computes). Rendering is the
// "waves + rails + inline ← blockers" layout de-risked in the prototype: top-to-bottom,
// width-stable, DAG-safe. `blocked` is derived (an open bead with an unclosed blocker).

import { readFileSync, statSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));

// ---- args -------------------------------------------------------------------
const argv = process.argv.slice(2);
const flag = (name) => { const i = argv.indexOf(name); return i >= 0 ? (argv[i + 1] ?? true) : undefined; };
const ONCE = argv.includes('--once');
const EPIC = flag('--tbd');                                   // epic slug, or undefined for fixture mode
const FIXTURE = flag('--fixture') || join(HERE, 'fixture.json');
const INTERVAL = Number(flag('--interval')) || 1000;

// ---- tbd resolver (mirror bead-graph.sh: prefer global tbd, else local get-tbd) --
function tbdRunner() {
  try { execFileSync('tbd', ['--version'], { stdio: 'ignore' }); return (a) => execFileSync('tbd', a, { encoding: 'utf8' }); }
  catch { /* fall through */ }
  try { execFileSync('npx', ['--no-install', 'get-tbd', '--version'], { stdio: 'ignore' });
    return (a) => execFileSync('npx', ['--no-install', 'get-tbd', ...a], { encoding: 'utf8' }); }
  catch { die('no tbd CLI found (need `tbd` on PATH or a local get-tbd install).'); }
}
function die(msg) { process.stderr.write(`bead-tui: ${msg}\n`); process.exit(1); }

// ---- data sources → { nodes:[{id,title,status}], edges:[{from,to}] } ----------
function fromFixture() {
  const g = JSON.parse(readFileSync(FIXTURE, 'utf8'));
  return { nodes: g.nodes, edges: g.edges };
}

function fromTbd(slug) {
  const tbd = tbdRunner();
  const jlist = (extra) => {
    const out = tbd(['list', '--label', `epic:${slug}`, ...extra, '--json', '--no-sync']).trim();
    try { return JSON.parse(out); } catch { return []; }
  };
  // default list = open + in_progress; add closed so completed beads still render.
  const rows = [...jlist([]), ...jlist(['--status', 'closed'])];
  const seen = new Map();
  for (const r of rows) if (r.kind !== 'epic' && !seen.has(r.id)) seen.set(r.id, { id: r.id, title: r.title, status: r.status });
  const nodes = [...seen.values()];
  if (!nodes.length) die(`no beads found for epic:${slug} (is it seeded and labelled?).`);
  const ids = new Set(nodes.map((n) => n.id));
  const edges = [];
  for (const n of nodes) {
    let dep = {};
    try { dep = JSON.parse(tbd(['dep', 'list', n.id, '--json', '--no-sync'])); } catch { /* none */ }
    for (const b of dep.blockedBy || []) {
      const blocker = typeof b === 'string' ? b : b.id;   // tolerate string | {id}
      if (ids.has(blocker)) edges.push({ from: blocker, to: n.id });
    }
  }
  return { nodes, edges };
}

// ---- Kahn waves + derived blocked status ------------------------------------
function analyze({ nodes, edges }) {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const blockers = new Map(nodes.map((n) => [n.id, []]));
  for (const { from, to } of edges) if (blockers.has(to)) blockers.get(to).push(from);
  // waves
  const placed = new Set(); let remaining = nodes.map((n) => n.id); const waves = [];
  while (remaining.length) {
    const ready = remaining.filter((id) => blockers.get(id).every((b) => placed.has(b)));
    if (!ready.length) die('cycle detected — beads mutually block.');
    ready.forEach((id) => placed.add(id));
    waves.push(ready);
    remaining = remaining.filter((id) => !ready.includes(id));
  }
  // an open bead with any non-closed blocker is "blocked"
  const isClosed = (id) => byId.get(id)?.status === 'closed';
  const glyphStatus = (n) =>
    n.status === 'closed' ? 'closed'
      : n.status === 'in_progress' ? 'in_progress'
        : blockers.get(n.id).some((b) => !isClosed(b)) ? 'blocked' : 'open';
  return { byId, blockers, waves, glyphStatus };
}

// ---- render (Renderer B: top-to-bottom waves + rails + inline ← blockers) ----
const GLYPH = { closed: '✓', in_progress: '▶', open: '○', blocked: '⊘' };
const C = { closed: '\x1b[32m', in_progress: '\x1b[33m', open: '\x1b[90m', blocked: '\x1b[31m', dim: '\x1b[90m', title: '\x1b[37m', bold: '\x1b[1m', reset: '\x1b[0m' };
const shortId = (id) => id.replace(/^sub-/, '');

function render(graph, meta, deltas) {
  const { byId, blockers, waves, glyphStatus } = analyze(graph);
  const src = EPIC ? `epic:${EPIC}` : `fixture · ${FIXTURE.split('/').pop()}`;
  const spin = ['⟳', '⟲'][meta.frame % 2];
  const lines = [];
  lines.push('');
  lines.push(`${C.bold}${src}${C.reset}                    ${C.dim}${spin} live · ${meta.updates} update${meta.updates === 1 ? '' : 's'}${C.reset}`);
  lines.push('');
  waves.forEach((wave, w) => {
    const par = wave.length > 1 ? 'PARALLEL' : 'sequential';
    lines.push(`${C.dim}── wave ${w + 1} · ${wave.length} ${par} ${'─'.repeat(Math.max(0, 28 - par.length))}${C.reset}`);
    wave.forEach((id, i) => {
      const n = byId.get(id);
      const gs = glyphStatus(n);
      const branch = wave.length === 1 ? '  ' : i === wave.length - 1 ? '└─' : '├─';
      const blk = blockers.get(id).map(shortId);
      const from = blk.length ? `  ${C.dim}← ${blk.join(', ')}${C.reset}` : '';
      let tag = '';
      if (deltas.appeared.has(id)) tag = `  ${C.in_progress}← NEW${C.reset}`;
      else if (deltas.doneNow.has(id)) tag = `  ${C.closed}✓ done${C.reset}`;
      lines.push(` ${C.dim}${branch}${C.reset} ${C[gs]}${GLYPH[gs]} ${id}${C.reset}  ${C.title}${n.title}${C.reset}${from}${tag}`);
    });
    lines.push('');
  });
  lines.push(`${C.closed}✓ closed${C.reset}   ${C.in_progress}▶ in_progress${C.reset}   ${C.open}○ open${C.reset}   ${C.blocked}⊘ blocked${C.reset}`);
  lines.push(`${C.dim}waves: ${waves.map((w) => w.length).join(' → ')}   (${graph.nodes.length} beads)${C.reset}`);
  return lines.join('\n');
}

// ---- liveness: poll a source's max mtime; re-fetch + re-render on change -----
const fetchGraph = () => (EPIC ? fromTbd(EPIC) : fromFixture());
function sourceMtime() {
  if (EPIC) return maxMtime(join(process.cwd(), '.tbd'));
  try { return statSync(FIXTURE).mtimeMs; } catch { return 0; }
}
function maxMtime(dir) {
  let max = 0;
  try {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      max = e.isDirectory() ? Math.max(max, maxMtime(p)) : Math.max(max, statSync(p).mtimeMs);
    }
  } catch { /* dir gone */ }
  return max;
}

function statusMap(graph) { return new Map(graph.nodes.map((n) => [n.id, n.status])); }

// ---- main -------------------------------------------------------------------
let prevStatus = new Map();
let lastGraph = null;
let lastDeltas = { appeared: new Set(), doneNow: new Set() };
let updates = 0;
let frame = 0;

// refetch=true → pull fresh data & recompute deltas; refetch=false → repaint cached
// graph (spinner only). Keeps idle ticks from spawning tbd every interval.
function draw(refetch) {
  if (refetch || !lastGraph) {
    lastGraph = fetchGraph();
    const cur = statusMap(lastGraph);
    const appeared = new Set(), doneNow = new Set();
    if (prevStatus.size) {
      for (const [id, st] of cur) {
        if (!prevStatus.has(id)) appeared.add(id);
        else if (st === 'closed' && prevStatus.get(id) !== 'closed') doneNow.add(id);
      }
    }
    lastDeltas = { appeared, doneNow };
    prevStatus = cur;
  }
  const out = render(lastGraph, { frame, updates }, lastDeltas);
  process.stdout.write(ONCE ? out + '\n' : `\x1b[2J\x1b[H${out}\n`);   // clear+home when live
  frame++;
}

if (ONCE) { draw(true); process.exit(0); }

draw(true);
let lastMtime = sourceMtime();
process.stdout.write('\x1b[?25l');                                   // hide cursor
setInterval(() => {
  const m = sourceMtime();
  const changed = m !== lastMtime;
  if (changed) { lastMtime = m; updates++; }
  draw(changed);                                                     // refetch only on change
}, INTERVAL);
process.on('SIGINT', () => { process.stdout.write('\x1b[?25h\n'); process.exit(0); });
