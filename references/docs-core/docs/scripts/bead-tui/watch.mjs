#!/usr/bin/env node
// bead-tui — a live, terminal view of a project's bead DAGs that re-renders as tbd
// state evolves: beads change status, blocked beads unblock, new ones appear. Zero
// runtime deps (Node built-ins only), so it ships wherever bead-graph.sh ships.
//
//   node watch.mjs                       # auto-load the latest epic; Tab to cycle
//   node watch.mjs --tbd <epic-slug>     # pin one epic
//   node watch.mjs --fixture path.json   # a specific fixture file
//   node watch.mjs --once                # render the default view once, exit (CI)
//   node watch.mjs --list-views          # print discovered views, exit
//
// Tabs (interactive TTY only): Tab / →  next · Shift-Tab / ←  prev · q / Ctrl-C quit.
// Views = one per epic (newest first) + an "unassigned" tab (beads with no epic: label).
// Topology is Kahn's waves (as bead-graph.sh computes); `blocked` is derived (an open
// bead with an unclosed blocker). Rendering is top-to-bottom waves + inline ← blockers.

import { readFileSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));

// ---- args -------------------------------------------------------------------
const argv = process.argv.slice(2);
const flag = (name) => { const i = argv.indexOf(name); return i >= 0 ? (argv[i + 1] ?? true) : undefined; };
const ONCE = argv.includes('--once');
const LIST_VIEWS = argv.includes('--list-views');
const EPIC = flag('--tbd');                                   // pin a single epic
const FIXTURE_ARG = flag('--fixture');                        // pin a fixture file
const DEFAULT_FIXTURE = join(HERE, 'fixture.json');
const INTERVAL = Number(flag('--interval')) || 1500;   // tbd mode content-polls (2 procs/tick) — keep it gentle

function die(msg) { restore(); process.stderr.write(`bead-tui: ${msg}\n`); process.exit(1); }

// ---- tbd resolver (mirror bead-graph.sh: prefer global tbd, else local get-tbd) --
let _tbd = null;
function tbd(a) {
  if (!_tbd) {
    try { execFileSync('tbd', ['--version'], { stdio: 'ignore' }); _tbd = (x) => execFileSync('tbd', x, { encoding: 'utf8' }); }
    catch {
      try { execFileSync('npx', ['--no-install', 'get-tbd', '--version'], { stdio: 'ignore' });
        _tbd = (x) => execFileSync('npx', ['--no-install', 'get-tbd', ...x], { encoding: 'utf8' }); }
      catch { return null; }
    }
  }
  try { return _tbd(a); } catch { return null; }
}
const tbdAvailable = () => tbd(['--version']) !== null;
function jparse(s, fallback) { try { return JSON.parse(s); } catch { return fallback; } }
const tlist = (extra) => jparse(tbd(['list', ...extra, '--json', '--no-sync']) || '[]', []);
const tshow = (id) => jparse(tbd(['show', id, '--json', '--no-sync']) || '{}', {});
const tblocked = () => jparse(tbd(['blocked', '--json', '--no-sync']) || '[]', []);
const firstId = (s) => (typeof s === 'string' ? s : s?.id || '').trim().split(/\s/)[0] || null;  // "sub-x ◐ title" → "sub-x"
const basename = (p) => p.split('/').pop();

// ---- bulk snapshot: TWO tbd calls for the whole repo (cheap, refetched on change) --
//   SNAP.rows: id → {id,title,status,kind}   ·   SNAP.edges: childId → [blockerIds]
let SNAP = null;
function refreshSnapshot() {
  const rows = new Map();
  for (const r of tlist(['--all'])) rows.set(r.id, { id: r.id, title: r.title, status: r.status, kind: r.kind });
  const edges = new Map();
  for (const b of tblocked()) edges.set(b.id, (b.blockedBy || []).map(firstId).filter(Boolean));
  SNAP = { rows, edges };
}
const epicSignature = () => [...SNAP.rows.values()].filter((r) => r.kind === 'epic').map((r) => r.id).sort().join(',');

// ---- membership: slower (per-epic show for slug, per-slug list). Refetched only
//   when the set of epic containers changes, not on every bead status change. -----
//   MEMBERSHIP.epics: [{slug,ts}] newest-first · memberIds: slug→Set · unassigned: Set
let MEMBERSHIP = null;
function refreshMembership() {
  const epicRows = [...SNAP.rows.values()].filter((r) => r.kind === 'epic');
  const slugTs = new Map();                                           // dedupe containers sharing a slug; keep newest
  for (const e of epicRows) {
    const meta = tshow(e.id);
    const slug = (meta.labels || []).map((l) => /^epic:(.+)$/.exec(l)?.[1]).find(Boolean);
    if (!slug) continue;
    const ts = meta.updated_at || meta.created_at || '';
    if (!slugTs.has(slug) || slugTs.get(slug) < ts) slugTs.set(slug, ts);
  }
  const memberIds = new Map(); const claimed = new Set();
  for (const slug of slugTs.keys()) {
    const ids = new Set(tlist(['--label', `epic:${slug}`, '--all']).filter((r) => r.kind !== 'epic').map((r) => r.id));
    memberIds.set(slug, ids); for (const id of ids) claimed.add(id);
  }
  const active = (slug) => [...(memberIds.get(slug) || [])].some((id) => SNAP.rows.get(id)?.status !== 'closed');
  const epics = [...slugTs.entries()]
    .filter(([slug]) => active(slug))                                 // hide fully-closed (done) epics from the tabs
    .map(([slug, ts]) => ({ slug, ts })).sort((a, b) => (a.ts < b.ts ? 1 : -1));
  const unassigned = new Set([...SNAP.rows.values()].filter((r) => r.kind !== 'epic' && !claimed.has(r.id)).map((r) => r.id));
  MEMBERSHIP = { epics, memberIds, unassigned };
}

function resolveViews() {
  if (FIXTURE_ARG) return [{ key: `fixture:${basename(FIXTURE_ARG)}`, type: 'fixture', path: FIXTURE_ARG }];
  if (EPIC) {                                                         // pinned single epic
    refreshSnapshot();
    const ids = new Set(tlist(['--label', `epic:${EPIC}`, '--all']).filter((r) => r.kind !== 'epic').map((r) => r.id));
    if (!ids.size) die(`no beads found for epic:${EPIC} (is it seeded and labelled?).`);
    MEMBERSHIP = { epics: [{ slug: EPIC, ts: '' }], memberIds: new Map([[EPIC, ids]]), unassigned: new Set() };
    return [{ key: `epic:${EPIC}`, type: 'epic', slug: EPIC }];
  }
  if (tbdAvailable()) {
    refreshSnapshot(); refreshMembership();
    const views = MEMBERSHIP.epics.map((e) => ({ key: `epic:${e.slug}`, type: 'epic', slug: e.slug }));
    if (MEMBERSHIP.unassigned.size) views.push({ key: 'unassigned', type: 'unassigned' });
    if (views.length) return views;
  }
  return [{ key: `fixture:${basename(DEFAULT_FIXTURE)}`, type: 'fixture', path: DEFAULT_FIXTURE }];
}

// ---- graph for a view → { nodes:[{id,title,status}], edges:[{from,to}] } -----
//   Spawn-free: built entirely from SNAP + MEMBERSHIP, so tab-switching is instant.
function graphForView(view) {
  if (view.type === 'fixture') { const g = jparse(readFileSync(view.path, 'utf8'), { nodes: [], edges: [] }); return { nodes: g.nodes, edges: g.edges }; }
  const ids = view.type === 'unassigned' ? (MEMBERSHIP?.unassigned || new Set()) : (MEMBERSHIP?.memberIds.get(view.slug) || new Set());
  const nodes = [...ids].map((id) => SNAP.rows.get(id)).filter(Boolean).map((r) => ({ id: r.id, title: r.title, status: r.status }));
  const edges = [];
  for (const id of ids) for (const b of (SNAP.edges.get(id) || [])) if (ids.has(b)) edges.push({ from: b, to: id });
  return { nodes, edges };
}

// ---- Kahn waves + derived blocked status ------------------------------------
function analyze({ nodes, edges }) {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const blockers = new Map(nodes.map((n) => [n.id, []]));
  for (const { from, to } of edges) if (blockers.has(to)) blockers.get(to).push(from);
  const placed = new Set(); let remaining = nodes.map((n) => n.id); const waves = [];
  while (remaining.length) {
    const ready = remaining.filter((id) => blockers.get(id).every((b) => placed.has(b)));
    if (!ready.length) die('cycle detected — beads mutually block.');
    ready.forEach((id) => placed.add(id));
    waves.push(ready);
    remaining = remaining.filter((id) => !ready.includes(id));
  }
  const isClosed = (id) => byId.get(id)?.status === 'closed';
  const glyphStatus = (n) =>
    n.status === 'closed' ? 'closed'
      : n.status === 'in_progress' ? 'in_progress'
        : blockers.get(n.id).some((b) => !isClosed(b)) ? 'blocked' : 'open';
  return { byId, blockers, waves, glyphStatus };
}

// ---- render -----------------------------------------------------------------
const GLYPH = { closed: '✓', in_progress: '▶', open: '○', blocked: '⊘' };
const C = { closed: '\x1b[32m', in_progress: '\x1b[33m', open: '\x1b[90m', blocked: '\x1b[31m', dim: '\x1b[90m', title: '\x1b[37m', bold: '\x1b[1m', rev: '\x1b[7m', unrev: '\x1b[27m', reset: '\x1b[0m' };
const shortId = (id) => id.replace(/^[^-]+-/, '');    // drop the tbd prefix, whatever it is

function tabBar(views, active) {
  if (views.length < 2) return '';
  return views.map((v, i) => (i === active ? `${C.rev} ${v.key} ${C.unrev}` : `${C.dim} ${v.key} ${C.reset}`)).join(' ');
}

function render(graph, meta, deltas) {
  const { byId, blockers, waves, glyphStatus } = analyze(graph);
  const spin = ['⟳', '⟲'][meta.frame % 2];
  const lines = [];
  lines.push('');
  const bar = tabBar(meta.views, meta.active);
  if (bar) { lines.push(bar); lines.push(''); }
  const nav = meta.views.length > 1 ? `${C.dim} · Tab/→ ←/Shift-Tab · q quit${C.reset}` : '';
  lines.push(`${C.bold}${meta.title}${C.reset}   ${C.dim}${spin} live · ${meta.updates} update${meta.updates === 1 ? '' : 's'}${C.reset}${nav}`);
  lines.push('');
  if (!graph.nodes.length) { lines.push(`${C.dim}(no beads)${C.reset}`); return lines.join('\n'); }
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

// ---- liveness ---------------------------------------------------------------
function sourceMtime(view) {   // fixture views only; tbd views are content-polled
  if (view.type !== 'fixture') return 0;
  try { return statSync(view.path).mtimeMs; } catch { return 0; }
}
const statusMap = (graph) => new Map(graph.nodes.map((n) => [n.id, n.status]));
const titleOf = (view) => view.type === 'fixture' ? `fixture · ${basename(view.path)}` : view.type === 'unassigned' ? 'unassigned beads' : `epic:${view.slug}`;

// ---- terminal / input -------------------------------------------------------
let raw = false;
function restore() { try { if (raw) process.stdin.setRawMode(false); process.stdout.write('\x1b[?25h'); } catch { /* noop */ } }
process.on('exit', restore);
['SIGINT', 'SIGTERM'].forEach((s) => process.on(s, () => { restore(); process.stdout.write('\n'); process.exit(0); }));

// ---- main -------------------------------------------------------------------
if (!ONCE && !LIST_VIEWS) process.stdout.write('bead-tui: discovering beads…\n');   // startup can take a few seconds
const idSignature = () => [...SNAP.rows.keys()].sort().join(',');
let VIEWS = resolveViews();

if (LIST_VIEWS) { process.stdout.write(VIEWS.map((v) => v.key).join('\n') + '\n'); process.exit(0); }

let active = 0;
let updates = 0;
let frame = 0;
const prevStatus = new Map();               // view.key → Map(id→status) (persists across refetch, drives deltas)

// content signature over the whole snapshot — detects status/edge/membership changes
// regardless of where tbd persists data (it writes under .git, not the working tree).
const contentSig = () => {
  if (!SNAP) return '';
  const rows = [...SNAP.rows.values()].map((r) => `${r.id}:${r.status}`).sort().join('|');
  const edges = [...SNAP.edges.entries()].map(([k, v]) => `${k}>${[...v].sort().join(',')}`).sort().join('|');
  return `${rows}#${edges}`;
};

function draw() {
  const view = VIEWS[active];
  const graph = graphForView(view);
  const cur = statusMap(graph);
  const prev = prevStatus.get(view.key);
  const appeared = new Set(), doneNow = new Set();
  if (prev) for (const [id, st] of cur) {
    if (!prev.has(id)) appeared.add(id);
    else if (st === 'closed' && prev.get(id) !== 'closed') doneNow.add(id);
  }
  prevStatus.set(view.key, cur);
  const out = render(graph, { title: titleOf(view), views: VIEWS, active, frame, updates }, { appeared, doneNow });
  process.stdout.write(ONCE ? out + '\n' : `\x1b[2J\x1b[H${out}\n`);
  frame++;
}

if (ONCE) { draw(); process.exit(0); }

// interactive
process.stdout.write('\x1b[?25l');
draw();
let lastMtime = sourceMtime(VIEWS[active]);                  // fixture mode: reliable file mtime
let lastContentSig = contentSig();                           // tbd mode: content-poll (data lives under .git)
let lastIdSig = SNAP ? idSignature() : '';

if (process.stdin.isTTY) {
  raw = true; process.stdin.setRawMode(true); process.stdin.resume(); process.stdin.setEncoding('utf8');
  const nav = (d) => { active = (active + d + VIEWS.length) % VIEWS.length; draw(); };
  process.stdin.on('data', (k) => {
    if (k === '\t' || k === '\x1b[C') nav(+1);              // Tab / →
    else if (k === '\x1b[Z' || k === '\x1b[D') nav(-1);      // Shift-Tab / ←
    else if (k === 'q' || k === '\x03') { restore(); process.stdout.write('\n'); process.exit(0); }
  });
}

setInterval(() => {
  const view = VIEWS[active];
  if (view.type === 'fixture') {                            // file-backed → cheap mtime check
    const m = sourceMtime(view);
    if (m !== lastMtime) { lastMtime = m; updates++; }
  } else {                                                  // tbd-backed → poll the 2-call snapshot & diff
    refreshSnapshot();
    const sig = contentSig();
    if (sig !== lastContentSig) {
      lastContentSig = sig; updates++;
      if (idSignature() !== lastIdSig) {                     // beads added/removed → rebuild tabs+membership
        const activeKey = view.key;
        VIEWS = resolveViews();
        lastIdSig = idSignature(); lastContentSig = contentSig();
        const idx = VIEWS.findIndex((v) => v.key === activeKey);
        active = idx >= 0 ? idx : 0;
      }
    }
  }
  draw();                                                   // idle ticks repaint the spinner
}, INTERVAL);
