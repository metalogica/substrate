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
// Nav (interactive TTY only) — views are a FIXED four, lateral switching only:
//   Planning · Epics · Unassigned · Completed   ·   Tab / Shift-Tab or 1–4 to switch · q quit.
// Epics is a drill target, not a flat tab-per-epic: it lists every active epic (newest first),
// and → / Enter drills into one epic's beads (← / Esc pops back). Arrows are HIERARCHICAL
// (drill in/out), never lateral. `/` fuzzy-filters the epic index.
// Topology is Kahn's waves (as bead-graph.sh computes); `blocked` is derived (an open
// bead with an unclosed blocker). Rendering is top-to-bottom waves + inline ← blockers.
//
// tbd's CLI is slow (~2-3s/call, git-native), so every tbd call is ASYNC (execFile) and
// runs in parallel — the event loop never blocks, keeping keypresses and the spinner live
// while data is fetched in the background.

import { readFileSync, writeFileSync, statSync } from 'node:fs';
import { execFile, spawnSync } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';

const pexec = promisify(execFile);
const HERE = dirname(fileURLToPath(import.meta.url));

// ---- args -------------------------------------------------------------------
const argv = process.argv.slice(2);
const flag = (name) => { const i = argv.indexOf(name); return i >= 0 ? (argv[i + 1] ?? true) : undefined; };
const ONCE = argv.includes('--once');
const LIST_VIEWS = argv.includes('--list-views');
const EPIC = flag('--tbd');                                   // pin a single epic
const FIXTURE_ARG = flag('--fixture');                        // pin a fixture file
const DEFAULT_FIXTURE = join(HERE, 'fixture.json');
const INTERVAL = Number(flag('--interval')) || 800;           // idle gap between (self-paced) polls
const MAX_NODES = Number(flag('--max')) || 60;                    // max beads rendered per view (--max <n> to override)

function die(msg) { restore(); process.stderr.write(`bead-tui: ${msg}\n`); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- tbd resolver (async; prefer global tbd, else local get-tbd) -------------
let _bin;                                                     // undefined until resolved; null if unavailable
async function resolveBin() {
  if (_bin !== undefined) return _bin;
  try { await pexec('tbd', ['--version']); return (_bin = { cmd: 'tbd', pre: [] }); } catch { /* try npx */ }
  try { await pexec('npx', ['--no-install', 'get-tbd', '--version']); return (_bin = { cmd: 'npx', pre: ['--no-install', 'get-tbd'] }); } catch { /* none */ }
  return (_bin = null);
}
async function tbd(a) {
  const b = await resolveBin(); if (!b) return null;
  try { const { stdout } = await pexec(b.cmd, [...b.pre, ...a], { maxBuffer: 1 << 26 }); return stdout; } catch { return null; }
}
const tbdAvailable = async () => (await resolveBin()) !== null;
function jparse(s, fallback) { try { return JSON.parse(s); } catch { return fallback; } }
const tlist = async (extra) => jparse(await tbd(['list', ...extra, '--json', '--no-sync']) || '[]', []);
const tshow = async (id) => jparse(await tbd(['show', id, '--json', '--no-sync']) || '{}', {});
const tblocked = async () => jparse(await tbd(['blocked', '--json', '--no-sync']) || '[]', []);
const firstId = (s) => (typeof s === 'string' ? s : s?.id || '').trim().split(/\s/)[0] || null;  // "sub-x ◐ title" → "sub-x"
const basename = (p) => p.split('/').pop();

// ---- bulk snapshot: TWO tbd calls (run in PARALLEL), refreshed on each poll --
//   SNAP.rows: id → {id,title,status,kind}   ·   SNAP.edges: childId → [blockerIds]
let SNAP = null;
async function refreshSnapshot() {
  const [listRows, blocked] = await Promise.all([tlist(['--all']), tblocked()]);
  const rows = new Map();
  for (const r of listRows) rows.set(r.id, { id: r.id, title: r.title, status: r.status, kind: r.kind, priority: r.priority, labels: r.labels || [] });
  const edges = new Map();
  for (const b of blocked) edges.set(b.id, (b.blockedBy || []).map(firstId).filter(Boolean));
  SNAP = { rows, edges };
}
const idSignature = () => (SNAP ? [...SNAP.rows.keys()].sort().join(',') : '');
const contentSig = () => {
  if (!SNAP) return '';
  const rows = [...SNAP.rows.values()].map((r) => `${r.id}:${r.status}`).sort().join('|');
  const edges = [...SNAP.edges.entries()].map(([k, v]) => `${k}>${[...v].sort().join(',')}`).sort().join('|');
  return `${rows}#${edges}`;
};

// ---- membership: slower (per-epic show for slug, per-slug list). Every tbd call
//   fanned out with Promise.all so cost is ~constant rounds, not per-epic serial. ---
//   MEMBERSHIP.epics: [{slug,ts}] newest-first · memberIds: slug→Set · unassigned: Set
let MEMBERSHIP = null;
async function refreshMembership() {
  // Skip closed (done) epic containers — filtered from the tabs anyway, and a `tbd show`
  // per closed epic is the dominant startup cost on repos with lots of history.
  const epicRows = [...SNAP.rows.values()].filter((r) => r.kind === 'epic' && r.status !== 'closed');
  const metas = await Promise.all(epicRows.map((e) => tshow(e.id)));    // all shows concurrently
  const slugTs = new Map();                                             // dedupe containers sharing a slug; keep newest
  for (const meta of metas) {
    const slug = (meta.labels || []).map((l) => /^epic:(.+)$/.exec(l)?.[1]).find(Boolean);
    if (!slug) continue;
    const ts = meta.updated_at || meta.created_at || '';
    if (!slugTs.has(slug) || slugTs.get(slug) < ts) slugTs.set(slug, ts);
  }
  const slugs = [...slugTs.keys()];
  const lists = await Promise.all(slugs.map((s) => tlist(['--label', `epic:${s}`, '--all'])));  // members concurrently
  const memberIds = new Map(); const claimed = new Set();
  slugs.forEach((slug, i) => {
    const ids = new Set(lists[i].filter((r) => r.kind !== 'epic').map((r) => r.id));
    memberIds.set(slug, ids); for (const id of ids) claimed.add(id);
  });
  const active = (slug) => [...(memberIds.get(slug) || [])].some((id) => SNAP.rows.get(id)?.status !== 'closed');
  const epics = [...slugTs.entries()]
    .filter(([slug]) => active(slug))                                   // hide fully-closed (done) epics from the tabs
    .map(([slug, ts]) => ({ slug, ts })).sort((a, b) => (a.ts < b.ts ? 1 : -1));
  // Orphan beads (no epic: label). Split by status so closed work gets its own
  // 'completed' tab instead of cluttering 'unassigned' with done items.
  const orphans = [...SNAP.rows.values()].filter((r) => r.kind !== 'epic' && !claimed.has(r.id));
  const unassigned = new Set(orphans.filter((r) => r.status !== 'closed').map((r) => r.id));
  const completed = new Set(orphans.filter((r) => r.status === 'closed').map((r) => r.id));
  MEMBERSHIP = { epics, memberIds, unassigned, completed };
}

async function resolveViews() {
  if (FIXTURE_ARG) return [{ key: `fixture:${basename(FIXTURE_ARG)}`, type: 'fixture', path: FIXTURE_ARG }];
  if (EPIC) {                                                           // pinned single epic
    await refreshSnapshot();
    const ids = new Set((await tlist(['--label', `epic:${EPIC}`, '--all'])).filter((r) => r.kind !== 'epic').map((r) => r.id));
    if (!ids.size) die(`no beads found for epic:${EPIC} (is it seeded and labelled?).`);
    MEMBERSHIP = { epics: [{ slug: EPIC, ts: '' }], memberIds: new Map([[EPIC, ids]]), unassigned: new Set(), completed: new Set() };
    return [{ key: `epic:${EPIC}`, type: 'epic', slug: EPIC }];
  }
  if (await tbdAvailable()) {
    await refreshSnapshot(); await refreshMembership();
    // A FIXED four-view top nav (stable 1–4 positions). Epics is a drill container, not one
    // tab per epic — so the row can never overflow. Unassigned/Completed stay present even when
    // empty so their positions (and the number keys) never shift under the user.
    return [
      { key: 'planning', label: 'Planning', type: 'board' },
      { key: 'epics', label: 'Epics', type: 'epics' },
      { key: 'unassigned', label: 'Unassigned', type: 'unassigned' },
      { key: 'completed', label: 'Completed', type: 'completed' },
    ];
  }
  return [{ key: `fixture:${basename(DEFAULT_FIXTURE)}`, type: 'fixture', path: DEFAULT_FIXTURE }];
}

// ---- graph for a view → { nodes:[{id,title,status}], edges:[{from,to}] } -----
//   Spawn-free & synchronous: built entirely from SNAP + MEMBERSHIP, so drawing and
//   tab-switching are instant even while a background fetch is in flight.
function graphForView(view) {
  if (view.type === 'fixture') { const g = jparse(readFileSync(view.path, 'utf8'), { nodes: [], edges: [] }); return { nodes: g.nodes, edges: g.edges }; }
  const ids = view.type === 'unassigned' ? (MEMBERSHIP?.unassigned || new Set())
    : view.type === 'completed' ? (MEMBERSHIP?.completed || new Set())
      : (MEMBERSHIP?.memberIds.get(view.slug) || new Set());
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
    if (!ready.length) { waves.push(remaining); break; }               // cycle: show the rest rather than abort a live view
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

// ---- orchestration partition: .substrate/execution-state.json + group: labels ----
//   The orchestrator cuts the DAG into `group:<window-N>` context-budget windows (one
//   group-runner per window) and records the run in .substrate/execution-state.json before
//   the trunk squash. This pane visualises that partition: which flow the run used and each
//   window as a lane of live per-bead status. See agents-parallel-execution-doctrine.md
//   §Grouping & windows. Absent both sources → no pane (backward compatible).
const EXEC_STATE_PATH = join(process.cwd(), '.substrate', 'execution-state.json');
function loadExecState(slug) {          // the durable run-state for this epic, or null
  try { return jparse(readFileSync(EXEC_STATE_PATH, 'utf8'), {})[slug] || null; } catch { return null; }
}
const windowKey = (name) => { const m = /(\d+)/.exec(name); return m ? Number(m[1]) : name; };   // window-2 → 2

// Build the partition for a view from the run-state (authoritative) or, failing that, the
// `group:<window-N>` labels graph-spec stamped (the planned partition, pre-run).
function partitionForView(view) {
  if (view.type !== 'epic') return null;
  const state = loadExecState(view.slug);
  const ids = MEMBERSHIP?.memberIds.get(view.slug) || new Set();

  let windows = null, source = null, runId = null, deviations = 0;
  if (state && state.partition && Object.keys(state.partition).length) {
    source = 'run'; runId = state.runId || state['run-id'] || null;
    deviations = Array.isArray(state.deviations) ? state.deviations.length : 0;
    windows = Object.entries(state.partition).map(([name, beadIds]) => ({
      name,
      // execution-state.json is written incrementally per wave, so a live watcher can hit a
      // partial/transitional partition value that isn't yet the schema's string[] (doctrine
      // §Grouping & windows). Guard like the sibling read at deviations above — a malformed
      // window degrades to empty, never crashes the render loop.
      beads: (Array.isArray(beadIds) ? beadIds : Array.isArray(beadIds?.beads) ? beadIds.beads : []).map((id) => {
        const oc = (state.outcomes || {})[id] || {};
        return { id, status: oc.status || null, commit: oc.commit || null };
      }),
    }));
  } else {                                            // fallback: planned windows from group: labels
    const byWin = new Map();
    for (const id of ids) {
      const win = (SNAP.rows.get(id)?.labels || []).map((l) => /^group:(.+)$/.exec(l)?.[1]).find(Boolean);
      if (!win) continue;
      if (!byWin.has(win)) byWin.set(win, []);
      byWin.get(win).push({ id, status: null, commit: null });
    }
    if (!byWin.size) return null;                     // no partition anywhere → no pane
    source = 'planned';
    windows = [...byWin.entries()].map(([name, beads]) => ({ name, beads }));
  }

  windows.sort((a, b) => (windowKey(a.name) < windowKey(b.name) ? -1 : 1));
  const total = windows.reduce((n, w) => n + w.beads.length, 0);
  return { source, runId, deviations, windows, rung: classifyRung(windows, total) };
}

// Which execution flow the partition represents (the "rung"): one window ⇒ monolith; every
// window a singleton ⇒ per-bead fleet; otherwise file-adjacency grouping ⇒ group-windowed.
function classifyRung(windows, total) {
  if (windows.length <= 1) return total <= 1 ? 'single' : 'monolith';
  if (windows.every((w) => w.beads.length === 1)) return 'per-bead fleet';
  return 'group-windowed';
}

// Map a partition bead to a render glyph-status: run-state outcome first, else live SNAP status.
function paneStatus(bead) {
  switch (bead.status) {                              // execution-state outcome vocabulary
    case 'pass': return 'closed';
    case 'fail': return 'blocked';
    case 'open': return 'open';
    default: break;
  }
  const live = SNAP?.rows.get(bead.id)?.status;       // planned source → live tracker status
  return live === 'closed' ? 'closed' : live === 'in_progress' ? 'in_progress' : 'open';
}

// ---- render -----------------------------------------------------------------
const GLYPH = { closed: '✓', in_progress: '▶', open: '○', blocked: '⊘' };
const C = { closed: '\x1b[32m', in_progress: '\x1b[33m', open: '\x1b[90m', blocked: '\x1b[31m', dim: '\x1b[90m', title: '\x1b[37m', bold: '\x1b[1m', rev: '\x1b[7m', unrev: '\x1b[27m', reset: '\x1b[0m' };
const shortId = (id) => id.replace(/^[^-]+-/, '');    // drop the tbd prefix, whatever it is

function tabBar(views, active) {
  if (views.length < 2) return '';
  return views.map((v, i) => { const t = v.label || v.key; return i === active ? `${C.rev} ${t} ${C.unrev}` : `${C.dim} ${t} ${C.reset}`; }).join(' ');
}

// Orchestration pane — the run's flow + each context-budget window as a lane of live status.
function orchestrationPane(part) {
  if (!part) return [];
  const lines = [''];
  const srcTag = part.source === 'run'
    ? `${C.closed}● run${C.reset}${part.runId ? ` ${C.dim}${part.runId}${C.reset}` : ''}`
    : `${C.dim}○ planned${C.reset}`;
  const dev = part.deviations ? `   ${C.in_progress}⚑ ${part.deviations} deviation${part.deviations === 1 ? '' : 's'}${C.reset}` : '';
  lines.push(`${C.bold}Orchestration${C.reset}   ${C.title}${part.rung}${C.reset}   ${srcTag}   ${C.dim}${part.windows.length} window${part.windows.length === 1 ? '' : 's'}${C.reset}${dev}`);
  for (const w of part.windows) {
    const strip = w.beads.map((b) => { const gs = paneStatus(b); return `${C[gs]}${GLYPH[gs]}${C.reset}`; }).join('');
    const ids = w.beads.map((b) => `${C[paneStatus(b)]}${shortId(b.id)}${C.reset}`).join(' ');
    const lane = w.beads.length > 1 ? 'lane' : 'solo';
    lines.push(` ${C.dim}▐${C.reset} ${C.title}${w.name}${C.reset} ${C.dim}[${lane}]${C.reset} ${strip}  ${ids}`);
  }
  lines.push(`${C.dim}windows run sequentially within a lane; parallel across file-disjoint lanes${C.reset}`);
  return lines;
}

function render(graph, meta, deltas) {
  const { byId, blockers, waves, glyphStatus } = analyze(graph);
  const spin = ['⟳', '⟲'][meta.frame % 2];
  const lines = [];
  lines.push('');
  const bar = tabBar(meta.views, meta.active);
  if (bar) { lines.push(bar); if (meta.breadcrumb) lines.push(`${C.dim}${meta.breadcrumb}${C.reset}`); lines.push(''); }
  let nav = '';
  if (meta.interactive) {
    const bits = [];
    if (meta.breadcrumb) bits.push('←/Esc back');
    if (meta.selectedId) bits.push('↑↓ select · Enter details');
    if (meta.views.length > 1) bits.push('Tab/1-4 view');
    bits.push('? help · q quit');
    nav = ` ${C.dim}· ${bits.join(' · ')}${C.reset}`;
  } else if (meta.views.length > 1) {
    nav = `${C.dim} · Tab/1-4 view · q quit${C.reset}`;
  }
  lines.push(`${C.bold}${meta.title}${C.reset}   ${C.dim}${spin} live · ${meta.updates} update${meta.updates === 1 ? '' : 's'}${C.reset}${nav}`);
  lines.push('');
  const headerLines = lines.length;             // sticky top rows: tab bar + epic title, pinned on clip
  let cursorLine = -1;                           // body index of the ↑/↓-selected bead, for scroll-to-cursor
  if (!graph.nodes.length) { lines.push(`${C.dim}(no beads)${C.reset}`); return { lines, headerLines, cursorLine }; }
  let emitted = 0;
  let remainingWavesCount = 0;
  for (let w = 0; w < waves.length; w++) {
    const wave = waves[w];
    if (emitted >= MAX_NODES) { remainingWavesCount++; continue; }
    const par = wave.length > 1 ? 'PARALLEL' : 'sequential';
    lines.push(`${C.dim}── wave ${w + 1} · ${wave.length} ${par} ${'─'.repeat(Math.max(0, 28 - par.length))}${C.reset}`);
    let waveHasRemaining = false;
    for (let i = 0; i < wave.length; i++) {
      const id = wave[i];
      if (emitted >= MAX_NODES) { waveHasRemaining = true; continue; }
      emitted++;
      const n = byId.get(id);
      const gs = glyphStatus(n);
      const branch = wave.length === 1 ? '  ' : i === wave.length - 1 ? '└─' : '├─';
      const blk = blockers.get(id).map(shortId);
      const from = blk.length ? `  ${C.dim}← ${blk.join(', ')}${C.reset}` : '';
      let tag = '';
      if (deltas.appeared.has(id)) tag = `  ${C.in_progress}← NEW${C.reset}`;
      else if (deltas.doneNow.has(id)) tag = `  ${C.closed}✓ done${C.reset}`;
      const sel = id === meta.selectedId;
      if (sel) cursorLine = lines.length;                 // remember where the cursor landed for scroll-to-cursor
      const cursor = sel ? `${C.rev}▸${C.unrev}` : ' ';
      const title = sel ? `${C.rev}${n.title}${C.unrev}` : `${C.title}${n.title}${C.reset}`;
      lines.push(` ${C.dim}${branch}${C.reset}${cursor}${C[gs]}${GLYPH[gs]} ${id}${C.reset}  ${title}${from}${tag}`);
    }
    if (waveHasRemaining) remainingWavesCount++;
    lines.push('');
  }
  const remaining = graph.nodes.length - emitted;
  if (remaining > 0) lines.push(`${C.dim}  … +${remaining} more bead${remaining === 1 ? '' : 's'} (${remainingWavesCount} wave${remainingWavesCount === 1 ? '' : 's'}) — raise with --max${C.reset}`);
  lines.push(`${C.closed}✓ closed${C.reset}   ${C.in_progress}▶ in_progress${C.reset}   ${C.open}○ open${C.reset}   ${C.blocked}⊘ blocked${C.reset}`);
  lines.push(`${C.dim}waves: ${waves.map((w) => w.length).join(' → ')}   (${graph.nodes.length} beads)${C.reset}`);
  for (const l of orchestrationPane(meta.partition)) lines.push(l);
  return { lines, headerLines, cursorLine };
}

// Clip a rendered frame to the terminal height: the header (tab bar + epic title) is pinned to
// the top, and the body scrolls so the ↑/↓-selected bead stays visible (j/k drive it). Returns the
// full frame unchanged when it already fits. Non-interactive (--once) callers skip this entirely.
//
// Budgeting is by VISUAL rows, not logical lines: a long bead title soft-wraps across several
// terminal rows, so counting one row per line under-counts and the header scrolls off. We strip
// ANSI colour codes to measure display width and divide by the terminal columns to get each line's
// wrapped height.
const ANSI = /\x1b\[[0-9;]*m/g;
function clipToViewport({ lines, headerLines, cursorLine }) {
  const rows = process.stdout.rows || 40;
  const cols = process.stdout.columns || 80;
  const cost = (s) => Math.max(1, Math.ceil((s.replace(ANSI, '').length || 1) / cols));   // wrapped terminal-row height
  const total = lines.reduce((n, l) => n + cost(l), 0);
  if (total <= rows) { scrollTop = 0; return lines.join('\n'); }                           // whole frame fits — no clip
  const header = lines.slice(0, headerLines);
  const body = lines.slice(headerLines);
  const bodyCost = body.map(cost);
  const headerCost = header.reduce((n, l) => n + cost(l), 0);
  const budget = Math.max(1, rows - headerCost - 2);        // reserve the indicator row + one blank so the trailing \n never scrolls
  const cur = cursorLine >= 0 ? Math.min(cursorLine - headerLines, body.length - 1) : 0;
  // Keep a persistent scroll offset and nudge it just enough to hold the cursor in view.
  scrollTop = Math.max(0, Math.min(scrollTop, body.length - 1));
  if (cur < scrollTop) scrollTop = cur;
  const fits = (start) => { let c = 0; for (let i = start; i <= cur; i++) c += bodyCost[i]; return c <= budget; };
  while (scrollTop < cur && !fits(scrollTop)) scrollTop++;
  const win = []; let used = 0, i = scrollTop;
  for (; i < body.length; i++) { if (used + bodyCost[i] > budget) break; used += bodyCost[i]; win.push(body[i]); }
  const above = scrollTop, below = body.length - i;
  const bar = `${C.dim}… ${above} above · ${below} below · j/k scroll${C.reset}`;
  return [...header, ...win, bar].join('\n');
}

// ---- board: flat capture/triage surface (inbox beads, no topology) ----------
//   Membership = SNAP rows labelled `inbox`, open/in_progress. Two stacked sections:
//   UNGROOMED (no `groomed` label) then GROOMED. Sorted by priority then id. A manual
//   staging surface — it never writes into an epic (endogenous-reconfiguration rule).
//   Returns { lines, headerLines, cursorLine } so it flows through clipToViewport like render().
function boardRows() {
  if (!SNAP) return { un: [], gr: [], flat: [] };
  const onBoard = [...SNAP.rows.values()].filter(
    (r) => (r.labels || []).includes('inbox') && (r.status === 'open' || r.status === 'in_progress'));
  const groomed = (r) => (r.labels || []).includes('groomed');
  const byPri = (a, b) => (a.priority ?? 2) - (b.priority ?? 2) || (a.id < b.id ? -1 : 1);
  const un = onBoard.filter((r) => !groomed(r)).sort(byPri);
  const gr = onBoard.filter(groomed).sort(byPri);
  return { un, gr, flat: [...un, ...gr] };
}

function renderBoard(meta) {
  const spin = ['⟳', '⟲'][meta.frame % 2];
  const { un, gr, flat } = boardRows();
  boardCursor = Math.max(0, Math.min(flat.length ? flat.length - 1 : 0, boardCursor));
  const selId = meta.interactive && flat.length ? flat[boardCursor].id : null;
  const lines = [''];
  const bar = tabBar(meta.views, meta.active);
  if (bar) { lines.push(bar); lines.push(''); }
  const nav = meta.interactive ? ` ${C.dim}· Tab/1-4 view · ↑↓ select · n new · ? help · q quit${C.reset}` : '';
  lines.push(`${C.bold}unfiled tasks${C.reset}   ${C.dim}${spin} live · ${meta.updates} update${meta.updates === 1 ? '' : 's'}${C.reset}${nav}`);
  lines.push('');
  const headerLines = lines.length;
  let cursorLine = -1;
  if (!flat.length && !capture) lines.push(`${C.dim}(no unfiled tasks — press n to add)${C.reset}`);
  const section = (label, rows) => {
    lines.push(`${C.dim}── ${label} · ${rows.length} ${'─'.repeat(Math.max(0, 30 - label.length))}${C.reset}`);
    let shown = 0;
    for (const r of rows) {
      if (shown >= MAX_NODES) { lines.push(`${C.dim}   … +${rows.length - shown} more — raise with --max${C.reset}`); break; }
      shown++;
      const gs = r.status === 'in_progress' ? 'in_progress' : 'open';
      const sel = r.id === selId;
      if (sel) cursorLine = lines.length;
      const cur = sel ? `${C.rev}▸${C.unrev}` : ' ';
      const pri = `${C.dim}P${r.priority ?? 2}${C.reset}`;
      const kind = `${C.dim}${(r.kind || 'task').padEnd(7)}${C.reset}`;
      const title = sel ? `${C.rev}${r.title}${C.unrev}` : `${C.title}${r.title}${C.reset}`;
      lines.push(` ${cur}${C[gs]}${GLYPH[gs]} ${r.id}${C.reset}  ${pri} ${kind} ${title}`);
    }
  };
  section('UNGROOMED', un);
  section('GROOMED', gr);
  lines.push('');
  if (capture) lines.push(`${C.in_progress}▶ new:${C.reset} ${C.title}${capture.buf}${C.reset}▌`);
  lines.push(`${C.dim}n new · e body · space groom · x kill · [ ] prio · t kind · ? help${C.reset}`);
  return { lines, headerLines, cursorLine };
}

// ---- epics: the index (a drill target, not a tab-per-epic) ------------------
//   One row per active epic with a progress strip (done → in-progress → open) and a done/total
//   count, sorted newest-first (MEMBERSHIP order). `/` fuzzy-filters by slug. →/Enter drills into
//   an epic's beads, which render through the ordinary wave view under an `Epics › slug` breadcrumb.
const PROG = { closed: '●', in_progress: '◐', open: '○', blocked: '○' };
function epicStats(slug) {
  const ids = [...(MEMBERSHIP?.memberIds.get(slug) || [])];
  const rows = ids.map((id) => SNAP?.rows.get(id)).filter(Boolean);
  return { total: rows.length, done: rows.filter((r) => r.status === 'closed').length, rows };
}
function epicStrip(rows, cap = 12) {
  const rank = { closed: 0, in_progress: 1, open: 2, blocked: 2 };
  const sorted = [...rows].sort((a, b) => (rank[a.status] ?? 2) - (rank[b.status] ?? 2));
  const strip = sorted.slice(0, cap).map((r) => {
    const gs = r.status === 'closed' ? 'closed' : r.status === 'in_progress' ? 'in_progress' : 'open';
    return `${C[gs]}${PROG[gs]}${C.reset}`;
  }).join('');
  return rows.length > cap ? `${strip} ${C.dim}+${rows.length - cap}${C.reset}` : strip;
}
function epicsFiltered() {
  const epics = MEMBERSHIP?.epics || [];
  const q = epicFilter.trim().toLowerCase();
  return q ? epics.filter((e) => e.slug.toLowerCase().includes(q)) : epics;
}

function renderEpicList(meta) {
  const spin = ['⟳', '⟲'][meta.frame % 2];
  const epics = epicsFiltered();
  epicCursor = Math.max(0, Math.min(epics.length ? epics.length - 1 : 0, epicCursor));
  const lines = [''];
  const bar = tabBar(meta.views, meta.active);
  if (bar) {
    lines.push(bar);
    lines.push(`${C.dim}Epics › ${epicFilter ? `${C.in_progress}/${epicFilter}${C.reset}` : '(all)'}${C.reset}`);
    lines.push('');
  }
  const nav = meta.interactive ? ` ${C.dim}· ↑↓ move · →/Enter open · / filter · Tab/1-4 view · ? help${C.reset}` : '';
  lines.push(`${C.bold}epics${C.reset}   ${C.dim}${spin} live · ${meta.updates} update${meta.updates === 1 ? '' : 's'} · ${epics.length} epic${epics.length === 1 ? '' : 's'}${C.reset}${nav}`);
  lines.push('');
  const headerLines = lines.length;
  let cursorLine = -1;
  if (!epics.length) lines.push(`${C.dim}(${epicFilter ? `no epics match "${epicFilter}"` : 'no active epics'})${C.reset}`);
  let shown = 0;
  for (let i = 0; i < epics.length; i++) {
    if (shown >= MAX_NODES) { lines.push(`${C.dim}   … +${epics.length - shown} more — raise with --max${C.reset}`); break; }
    shown++;
    const e = epics[i];
    const { total, done, rows } = epicStats(e.slug);
    const sel = i === epicCursor;
    if (sel) cursorLine = lines.length;
    const cur = sel ? `${C.rev}▸${C.unrev}` : ' ';
    const pad = ' '.repeat(Math.max(1, 28 - e.slug.length));
    const name = sel ? `${C.rev}${e.slug}${C.unrev}` : `${C.title}${e.slug}${C.reset}`;
    lines.push(` ${cur}${name}${pad}${epicStrip(rows)}  ${C.dim}${done}/${total}${C.reset}`);
  }
  lines.push('');
  if (epicFiltering) lines.push(`${C.in_progress}▶ filter:${C.reset} ${C.title}${epicFilter}${C.reset}▌`);
  lines.push(`${C.dim}→/Enter open · / filter · Esc clear · Tab/1-4 switch view${C.reset}`);
  return { lines, headerLines, cursorLine };
}

// Full keyboard reference — toggled with `?` from any view (rendered instead of the list).
function renderHelp(meta) {
  const lines = [''];
  const bar = tabBar(meta.views, meta.active);
  if (bar) { lines.push(bar); lines.push(''); }
  lines.push(`${C.bold}keyboard reference${C.reset}   ${C.dim}any key to close · q quit${C.reset}`);
  lines.push('');
  const row = (k, d) => lines.push(`  ${C.title}${k.padEnd(16)}${C.reset}${C.dim}${d}${C.reset}`);
  const head = (t) => lines.push(`${C.dim}── ${t} ${'─'.repeat(Math.max(0, 38 - t.length))}${C.reset}`);
  head('global · switch view (lateral)');
  row('1 – 4', 'jump to Planning · Epics · Unassigned · Completed');
  row('Tab  Shift-Tab', 'next / previous view');
  row('?', 'toggle this help');
  row('q  Ctrl-C', 'quit (flushes pending sync)');
  lines.push('');
  head('planning · unfiled tasks');
  row('↑ ↓  j k', 'move cursor');
  row('n', 'new task — type title, Enter commits (stays), Esc exits');
  row('Enter', 'open bead detail');
  row('e', 'edit body in $EDITOR');
  row('space', 'toggle groomed (ungroomed ↔ groomed)');
  row('x', 'kill / close selected');
  row('[  ]', 'priority: less / more important');
  row('t', 'cycle kind (task → feature → bug → chore)');
  row('g  G', 'top / bottom');
  lines.push('');
  head('epics · the index');
  row('↑ ↓  j k', 'move cursor');
  row('→  l  Enter', 'open the highlighted epic (drill in)');
  row('/', 'filter epics by name · Esc clears');
  row('g  G', 'top / bottom');
  lines.push('');
  head('epic beads · unassigned · completed');
  row('↑ ↓  j k', 'move cursor');
  row('←  h  Esc', 'back to the epic index (drill out)');
  row('Enter  →  l', 'open bead detail');
  row('Ctrl-D  Ctrl-U', 'half-page down / up');
  row('g  G', 'top / bottom');
  lines.push('');
  lines.push(`${C.dim}arrows are hierarchical (drill in/out); views switch with Tab or 1–4. planning never writes into an epic.${C.reset}`);
  return lines.join('\n');
}

// ---- liveness helpers -------------------------------------------------------
function sourceMtime(view) {   // fixture views only; tbd views are content-polled
  if (view.type !== 'fixture') return 0;
  try { return statSync(view.path).mtimeMs; } catch { return 0; }
}
const statusMap = (graph) => new Map(graph.nodes.map((n) => [n.id, n.status]));
const titleOf = (view) => view.type === 'fixture' ? `fixture · ${basename(view.path)}` : view.type === 'board' ? 'unfiled tasks (board)' : view.type === 'epics' ? 'epics' : view.type === 'unassigned' ? 'unassigned beads' : view.type === 'completed' ? 'completed beads' : `epic:${view.slug}`;

// ---- terminal / input -------------------------------------------------------
let raw = false;
let alt = false;                            // true once we've entered the alternate screen buffer
function restore() { try { if (raw) process.stdin.setRawMode(false); if (alt) process.stdout.write('\x1b[?1049l'); process.stdout.write('\x1b[?25h'); } catch { /* noop */ } }
process.on('exit', restore);
['SIGINT', 'SIGTERM'].forEach((s) => process.on(s, () => { restore(); process.stdout.write('\n'); process.exit(0); }));

// ---- render state -----------------------------------------------------------
let active = 0;
let updates = 0;
let frame = 0;
let selected = 0;                           // bead cursor within the active view (interactive TTY only)
let scrollTop = 0;                           // body scroll offset (logical body-line index) for the viewport clip
let detail = null;                          // opened bead detail object (tbd show), or null for list mode
let detailLoading = false;                  // Enter pressed, tbd show in flight
let boardCursor = 0;                        // selected row within the board's flat list
let capture = null;                         // { buf } while capturing a new task title; null otherwise
let dirty = false;                          // pending --no-sync board writes awaiting a flush
let showHelp = false;                       // ? overlay: full keyboard reference
let epicCursor = 0;                         // selected row within the epics index
let drillSlug = null;                       // when in the Epics view: null = index, slug = drilled into that epic's beads
let epicFilter = '';                        // active substring narrowing the epics index (persists across visits within a session)
let epicFiltering = false;                  // true while typing into the epic filter (owns every key, like capture)
const prevStatus = new Map();               // view.key → Map(id→status), drives NEW/done deltas

// Beads in the exact order render() emits them (Kahn waves, capped at MAX_NODES), so the
// ↑/↓ cursor lines up 1:1 with what's on screen.
const orderedIds = (graph) => analyze(graph).waves.flat().slice(0, MAX_NODES);

// Detail overlay for one bead (tbd show), rendered instead of the list when `detail` is set.
function detailPane(b) {
  if (!b || !Object.keys(b).length) return `\n${C.blocked}could not load bead.${C.reset}\n\n${C.dim}Esc back · q quit${C.reset}`;
  const g = GLYPH[b.status] || GLYPH.open, col = C[b.status] || C.open;
  const fmtTs = (s) => s ? String(s).slice(0, 16).replace('T', ' ') : '?';
  const wrap = (s, w) => {
    const out = []; let line = '';
    for (const word of String(s).split(/\s+/)) {
      if (line && (line + ' ' + word).length > w) { out.push(line); line = word; }
      else line = line ? `${line} ${word}` : word;
    }
    if (line) out.push(line);
    return out;
  };
  const deps = (b.dependencies || []).map((d) => (typeof d === 'string' ? d : d?.displayId || d?.id || '')).filter(Boolean);
  const lines = [''];
  lines.push(`${C.bold}${b.displayId || b.id}${C.reset}   ${C.dim}${b.kind || ''}${C.reset}   ${col}${g} ${b.status}${C.reset}${b.priority != null ? `   ${C.dim}P${b.priority}${C.reset}` : ''}`);
  lines.push('');
  lines.push(`${C.title}${b.title || '(untitled)'}${C.reset}`);
  if ((b.labels || []).length) lines.push(`${C.dim}labels:${C.reset} ${b.labels.join('  ')}`);
  if (deps.length) lines.push(`${C.dim}blocked by:${C.reset} ${deps.join(', ')}`);
  lines.push(`${C.dim}created ${fmtTs(b.created_at)} · updated ${fmtTs(b.updated_at)}${C.reset}`);
  if (b.description) { lines.push(''); for (const l of wrap(b.description, 76)) lines.push(l); }
  lines.push('');
  lines.push(`${C.dim}Esc back · q quit${C.reset}`);
  return lines.join('\n');
}

function draw() {
  const view = VIEWS[active];
  const interactive = !ONCE && process.stdin.isTTY;
  let out;
  if (showHelp) {
    out = renderHelp({ views: VIEWS, active, frame });
  } else if (detailLoading) {
    out = `\n${C.dim}loading bead…${C.reset}`;
  } else if (detail) {
    out = detailPane(detail);
  } else if (view.type === 'board') {
    const r = renderBoard({ views: VIEWS, active, frame, updates, interactive });
    out = ONCE ? r.lines.join('\n') : clipToViewport(r);
  } else if (view.type === 'epics' && drillSlug === null) {
    const r = renderEpicList({ views: VIEWS, active, frame, updates, interactive });
    out = ONCE ? r.lines.join('\n') : clipToViewport(r);
  } else {
    // Generic wave path — unassigned / completed / fixture / pinned epic, and the Epics view once
    // drilled into a slug (rendered as an ordinary epic under a breadcrumb).
    const isLeaf = view.type === 'epics';
    const effView = isLeaf ? { type: 'epic', slug: drillSlug, key: `epic:${drillSlug}` } : view;
    const graph = graphForView(effView);
    const cur = statusMap(graph);
    const prev = prevStatus.get(effView.key);
    const appeared = new Set(), doneNow = new Set();
    if (prev) for (const [id, st] of cur) {
      if (!prev.has(id)) appeared.add(id);
      else if (st === 'closed' && prev.get(id) !== 'closed') doneNow.add(id);
    }
    prevStatus.set(effView.key, cur);
    const order = orderedIds(graph);
    selected = Math.min(Math.max(0, selected), Math.max(0, order.length - 1));   // clamp to current list
    const partition = partitionForView(effView);
    const selectedId = interactive && order.length ? order[selected] : null;
    const breadcrumb = isLeaf ? `Epics › ${drillSlug}` : '';
    const r = render(graph, { title: isLeaf ? `epic:${drillSlug}` : titleOf(view), breadcrumb, views: VIEWS, active, frame, updates, partition, selectedId, interactive }, { appeared, doneNow });
    out = ONCE ? r.lines.join('\n') : clipToViewport(r);   // --once dumps the full frame; interactive clips to the viewport
  }
  process.stdout.write(ONCE ? out + '\n' : `\x1b[2J\x1b[H${out}\n`);
  frame++;
}

// ---- board write path: optimistic, batched-sync (auto_sync is off) ----------
//   Every write is a local --no-sync tbd commit; refreshSnapshot() gives immediate liveness and
//   the poll reconciles authoritative order. dirty tracks unsynced writes; flushSync() batches
//   the single `tbd sync` on capture-mode exit and on quit.
async function boardWrite(args) {
  dirty = true;
  await tbd(args);
  await refreshSnapshot();
  draw();
}
async function flushSync() { if (dirty) { dirty = false; await tbd(['sync']); } }

// Edit a bead's description in $EDITOR (never an in-TUI multiline editor). Suspend raw mode,
// hand the terminal to the editor, resume, then persist via update --description.
async function editBody(id) {
  const meta = await tshow(id);
  const tmp = join(tmpdir(), `bead-${id}.md`);
  writeFileSync(tmp, meta.description || '');
  if (raw) process.stdin.setRawMode(false);
  process.stdout.write('\x1b[?25h');
  spawnSync(process.env.EDITOR || 'vi', [tmp], { stdio: 'inherit' });
  if (raw) process.stdin.setRawMode(true);
  process.stdout.write('\x1b[?25l');
  await boardWrite(['update', id, '--description', readFileSync(tmp, 'utf8'), '--no-sync']);
  await flushSync();   // a deliberate body edit must reach the shared tbd-sync store now, not only at a clean quit
}

// ---- main -------------------------------------------------------------------
if (!ONCE && !LIST_VIEWS) process.stdout.write('bead-tui: discovering beads…\n');   // startup can take a few seconds
let VIEWS = await resolveViews();

if (LIST_VIEWS) { process.stdout.write(VIEWS.map((v) => v.key).join('\n') + '\n'); process.exit(0); }
if (ONCE) { draw(); process.exit(0); }

// interactive
process.stdout.write('\x1b[?1049h\x1b[?25l'); alt = true;   // alternate screen buffer: fixed viewport, no scrollback debris
draw();
let lastContentSig = contentSig();
let lastIdSig = idSignature();
let lastMtime = sourceMtime(VIEWS[active]);

if (process.stdin.isTTY) {                  // instant, because the event loop is never blocked
  raw = true; process.stdin.setRawMode(true); process.stdin.resume(); process.stdin.setEncoding('utf8');
  // Lateral view switch (Tab / 1–4) resets ALL per-view cursors, including the epics drill + filter.
  const resetView = () => { selected = 0; scrollTop = 0; boardCursor = 0; epicCursor = 0; drillSlug = null; detail = null; capture = null; showHelp = false; epicFiltering = false; epicFilter = ''; };
  const switchView = (d) => { active = Math.max(0, Math.min(VIEWS.length - 1, active + d)); resetView(); draw(); };
  const jumpView = (i) => { if (i < 0 || i >= VIEWS.length) return; active = i; resetView(); draw(); };
  const drillInto = (slug) => { drillSlug = slug; selected = 0; scrollTop = 0; draw(); };   // Epics index → one epic's beads
  const drillOut = () => { drillSlug = null; selected = 0; scrollTop = 0; draw(); };         // epic beads → back to the index
  const move = (d) => { selected += d; draw(); };            // draw() clamps to the current list
  const halfPage = () => Math.max(1, Math.floor((process.stdout.rows || 40) / 2));
  const quit = async () => { await flushSync(); restore(); process.stdout.write('\n'); process.exit(0); };
  const openDetail = async (id) => { if (!id) return; detailLoading = true; draw(); detail = await tshow(id); detailLoading = false; draw(); };
  // A single stdin 'data' event can batch several keystrokes (fast typing, key-repeat, paste) —
  // e.g. tapping j quickly arrives as one 'jjj' chunk, and an exact `k === 'j'` test then fails.
  // Split each chunk into individual key tokens (CSI escape sequences like \x1b[B kept whole, bare
  // Esc kept, everything else one char) and dispatch them one at a time.
  const tokenizeKeys = (s) => {
    const toks = [];
    for (let i = 0; i < s.length;) {
      if (s[i] === '\x1b' && s[i + 1] === '[') {                 // CSI: \x1b[ … <final A–Z/a–z/~>
        let j = i + 2;
        while (j < s.length && !/[A-Za-z~]/.test(s[j])) j++;
        toks.push(s.slice(i, j + 1)); i = j + 1;
      } else { toks.push(s[i]); i++; }                           // bare Esc or any single char
    }
    return toks;
  };
  const handleKey = async (k) => {
    // (1) capture mode owns every key while active
    if (capture) {
      if (k === '\r' || k === '\n') { const t = capture.buf.trim(); if (t) await boardWrite(['create', t, '-l', 'inbox', '--no-sync']); capture.buf = ''; draw(); }
      else if (k === '\x1b') { capture = null; await flushSync(); draw(); }               // Esc — exit + flush
      else if (k === '\x7f' || k === '\b') { capture.buf = capture.buf.slice(0, -1); draw(); }
      else if (k === '\x03') { await quit(); }                                            // Ctrl-C
      else if (k >= ' ' && !k.startsWith('\x1b')) { capture.buf += k; draw(); }
      return;
    }
    // (2) epic-index filter capture owns every key while typing
    if (epicFiltering) {
      if (k === '\r' || k === '\n') { epicFiltering = false; draw(); }                    // Enter — keep the narrowing, stop typing
      else if (k === '\x1b') { epicFiltering = false; epicFilter = ''; epicCursor = 0; draw(); }  // Esc — clear
      else if (k === '\x7f' || k === '\b') { epicFilter = epicFilter.slice(0, -1); epicCursor = 0; draw(); }
      else if (k === '\x03') { await quit(); }                                            // Ctrl-C
      else if (k >= ' ' && !k.startsWith('\x1b')) { epicFilter += k; epicCursor = 0; draw(); }
      return;
    }
    if (k === 'q' || k === '\x03') { await quit(); return; }                              // global quit (flushes)
    if (detail || detailLoading) { if (k === '\x1b') { detail = null; draw(); } return; } // modal: Esc closes
    if (showHelp) { showHelp = false; draw(); return; }                                   // any key closes help
    if (k === '?') { showHelp = true; draw(); return; }
    // (3) lateral view switching — Tab / Shift-Tab / number keys (full remap: arrows are hierarchical, never lateral)
    if (k >= '1' && k <= '9') { jumpView(k.charCodeAt(0) - 49); return; }                 // '1' → index 0 …
    if (k === '\t') { switchView(+1); return; }                                           // Tab · next view
    if (k === '\x1b[Z') { switchView(-1); return; }                                       // Shift-Tab · previous view
    const view = VIEWS[active];
    // (4) planning board — capture + triage hotkeys
    if (view.type === 'board') {
      const { flat } = boardRows();
      const sel = flat[boardCursor];
      if (k === '\x1b[A' || k === 'k') { boardCursor = Math.max(0, boardCursor - 1); draw(); return; }
      if (k === '\x1b[B' || k === 'j') { boardCursor = Math.min(Math.max(0, flat.length - 1), boardCursor + 1); draw(); return; }
      if (k === 'g') { boardCursor = 0; draw(); return; }
      if (k === 'G') { boardCursor = Math.max(0, flat.length - 1); draw(); return; }
      if (k === 'n') { capture = { buf: '' }; draw(); return; }
      if (sel) {
        const groomed = (sel.labels || []).includes('groomed');
        if (k === '\r' || k === '\n') { await openDetail(sel.id); return; }
        if (k === ' ') { await boardWrite(['label', groomed ? 'remove' : 'add', sel.id, 'groomed', '--no-sync']); return; }
        if (k === 'x') { boardCursor = Math.max(0, boardCursor - 1); await boardWrite(['close', sel.id, '--no-sync']); return; }
        if (k === ']') { await boardWrite(['update', sel.id, '--priority', String(Math.max(0, (sel.priority ?? 2) - 1)), '--no-sync']); return; }  // more important
        if (k === '[') { await boardWrite(['update', sel.id, '--priority', String(Math.min(4, (sel.priority ?? 2) + 1)), '--no-sync']); return; }  // less important
        if (k === 't') { const order = ['task', 'feature', 'bug', 'chore']; const next = order[(order.indexOf(sel.kind) + 1) % order.length]; await boardWrite(['update', sel.id, '--type', next, '--no-sync']); return; }
        if (k === 'e') { await editBody(sel.id); return; }
      }
      return;                                                                            // swallow other keys on the board
    }
    // (5) epics INDEX — scroll the list, filter, drill into one epic
    if (view.type === 'epics' && drillSlug === null) {
      const epics = epicsFiltered();
      if (k === '\x1b[A' || k === 'k') { epicCursor = Math.max(0, epicCursor - 1); draw(); return; }
      if (k === '\x1b[B' || k === 'j') { epicCursor = Math.min(Math.max(0, epics.length - 1), epicCursor + 1); draw(); return; }
      if (k === '\x04') { epicCursor = Math.min(Math.max(0, epics.length - 1), epicCursor + halfPage()); draw(); return; }
      if (k === '\x15') { epicCursor = Math.max(0, epicCursor - halfPage()); draw(); return; }
      if (k === 'g') { epicCursor = 0; draw(); return; }
      if (k === 'G') { epicCursor = Math.max(0, epics.length - 1); draw(); return; }
      if (k === '/') { epicFiltering = true; draw(); return; }
      if (k === '\x1b') { if (epicFilter) { epicFilter = ''; epicCursor = 0; draw(); } return; }   // Esc clears a standing filter
      if (k === 'l' || k === '\x1b[C' || k === '\r' || k === '\n') { if (epics[epicCursor]) drillInto(epics[epicCursor].slug); return; }  // → drill in
      return;                                                                            // swallow other keys on the index
    }
    // (6) wave views — epic beads (drilled), unassigned, completed, pinned epic, fixture
    const isLeaf = view.type === 'epics';
    if (isLeaf && (k === 'h' || k === '\x1b[D' || k === '\x1b')) { drillOut(); return; }  // ← drill out to the index
    if (k === '\x1b[A' || k === 'k') move(-1);               // ↑ / k
    else if (k === '\x1b[B' || k === 'j') move(+1);          // ↓ / j
    else if (k === '\x04') move(+halfPage());                // Ctrl-D · half-page down
    else if (k === '\x15') move(-halfPage());                // Ctrl-U · half-page up
    else if (k === 'g') { selected = 0; draw(); }            // g · jump to top
    else if (k === 'G') { selected = Number.MAX_SAFE_INTEGER; draw(); }  // G · jump to bottom (draw clamps)
    else if (k === '\r' || k === '\n' || k === 'l' || k === '\x1b[C') {  // Enter / → / l → open bead detail (drill deeper)
      const ev = isLeaf ? { type: 'epic', slug: drillSlug } : view;
      if (ev.type === 'fixture') return;                    // fixture ids aren't real tbd beads
      await openDetail(orderedIds(graphForView(ev))[selected]);
    }
  };
  process.stdin.on('data', async (chunk) => { for (const k of tokenizeKeys(chunk)) await handleKey(k); });
  process.stdout.on('resize', () => draw());                 // re-clip the viewport to the new terminal height
}

// self-paced async poll — fetches in the background; redraws only on change
(async function poll() {
  for (;;) {
    const view = VIEWS[active];
    try {
      let changed = false;
      if (view.type === 'fixture') {
        const m = sourceMtime(view); if (m !== lastMtime) { lastMtime = m; updates++; changed = true; }
      } else {
        await refreshSnapshot();
        const sig = contentSig();
        if (sig !== lastContentSig) {
          lastContentSig = sig; updates++; changed = true;
          if (!EPIC && idSignature() !== lastIdSig) {          // beads added/removed → rebuild tabs+membership
            const activeKey = view.key;
            VIEWS = await resolveViews();
            lastIdSig = idSignature(); lastContentSig = contentSig();
            const idx = VIEWS.findIndex((v) => v.key === activeKey);
            active = idx >= 0 ? idx : 0;
            if (drillSlug && !(MEMBERSHIP?.epics || []).some((e) => e.slug === drillSlug)) drillSlug = null;  // drilled epic went away → back to index
          }
        }
      }
      if (changed) draw();
    } catch { /* transient tbd error — keep the last good frame */ }
    await sleep(INTERVAL);
  }
})();
