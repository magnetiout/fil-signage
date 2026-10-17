import { renderHTML, uiText, translatedAttribute, bindMessage, binding } from '../lib/i18n-bindings.js';

import { displayQuantity, displayValue, message as t } from '../i18n.js';

/*
 * NOC — the mesh / scale-out graph of THIS server, live.
 *
 * ⚠️ THIS NODE ONLY. Nodes are this server, its parents, its children and the servers whose
 * reports demonstrably travelled through a child (docs/scale-out.md "NOC on this server"). Nothing
 * here dials another server, discovers a URL, or asks a customer who did not enrol for anything
 * (I7, I8). Every number comes from one poll of GET /api/mesh/noc, which is built from what this
 * node already holds; opening this page starts no snapshot, no cache fill and no mesh read.
 *
 * ⚠️ POLLS ONLY WHILE IT IS THE ACTIVE VIEW AND THE TAB IS VISIBLE. The interval is created in
 * start(), cleared in stop(), and stop() runs on cleanup() (app.js view swap) and on
 * visibilitychange -> hidden. There is no other setInterval in this file (a source test holds it).
 *
 * "Data movement" is a pulse on a link when one of its sampled counters changed since the last
 * poll — a change-log rev, a device summary, a drained player event, a relayed command, a stored
 * file. No envelope is streamed to the browser; the counters are what moved.
 *
 * THE CHIP IS ATTENTION, THE DRAWER IS THE BOARD. A chip carries the name, "n/m online" and an
 * alert ring — enough to see at a glance which server needs a click. Roles, ids, captions, host
 * figures and the screen table live in hover titles and in the drawer, where there is room to
 * read them. Edges are colour only until hovered or selected.
 */

import { errorMessage, api } from '../api.js';
import { showToast } from '../components/toast.js';
import { esc } from '../utils.js';

const POLL_MS = 3000;
// Screens in the drawer are capped SERVER-side at 50 rows (stale first) with an "and N more"
// pointing at the Displays list — never one DOM node per screen for a big node.
const DISK_ALERT_FRACTION = 0.10; // ring this server when its DATA_DIR filesystem is below this

let timer = null;
let active = false;
let host = null;
let last = null;          // previous sample, for pulses
let selected = null;      // node id
let selectedData = null;  // the selected node's screens + alerts; re-asked on the tick for THAT node only
const pulses = new Map(); // edgeId -> until (ms)

/* ------------------------------ lifecycle ------------------------------ */

export async function render(container) {
  host = container;
  active = true;
  container.innerHTML = `
    <div class="page-header">
      <div><h1>NOC</h1><div class="subtitle">${renderHTML(t("ui.noc.this_server_s_mesh_live_polled_every_fff454", {value0: POLL_MS / 1000}))}</div></div>
      <div style="display:flex;gap:8px;align-items:center">
        <span id="nocAsOf" style="color:var(--text-muted);font-size:12px"></span>
        <button class="btn btn-secondary btn-sm" id="nocRefresh">${renderHTML(t("ui.noc.refresh"))}</button>
      </div>
    </div>
    <div id="nocHost" style="font-size:12px;color:var(--text-muted);margin:-6px 0 10px"></div>
    <div id="nocBody"><p style="color:var(--text-muted)">${renderHTML(t("ui.noc.loading"))}</p></div>`;
  container.querySelector('#nocRefresh').addEventListener('click', () => tick());
  document.addEventListener('visibilitychange', onVisibility);
  await tick();
  start();
}

export function cleanup() {
  stop();
  active = false;
  document.removeEventListener('visibilitychange', onVisibility);
  host = null; last = null; selected = null; selectedData = null; pulses.clear();
}

function start() {
  if (timer || !active || document.visibilityState === 'hidden') return;
  timer = setInterval(tick, POLL_MS);
}
function stop() { if (timer) clearInterval(timer); timer = null; }
function onVisibility() { if (document.visibilityState === 'hidden') stop(); else { tick(); start(); } }
export function isPolling() { return !!timer; }

/* ------------------------------ data ------------------------------ */

async function tick() {
  if (!active || !host) return;
  let data;
  try { data = await api.get('/mesh/noc'); } catch (e) {
    const body = host.querySelector('#nocBody');
    if (body) body.innerHTML = `<p style="color:var(--text-muted)">${uiText((errorMessage(e)))}</p>`;
    // A 404 means the mesh is off here; a 403 that this is not the instance owner. Either way, stop asking.
    if (/404|403|not found|owner/i.test(e.message || '')) stop();
    return;
  }
  detectMovement(data);
  last = data;
  // The drawer ages with the graph: while a node is selected, its screen table is re-asked on the
  // same tick — ONE extra bounded query for the one selected node, never for every node. Otherwise
  // "seen 3h" would sit frozen under a link that pulses, which is the one lie this page could tell.
  if (selected) await loadSelected(selected);
  draw(data);
}

/*
 * A link ticks when its APPLIED REVISION or its OUTBOX DEPTH changed between polls — the two
 * numbers that mean rows or events actually crossed it. Not last_sync_at (a heartbeat on an idle
 * link), not a cache counter (bytes, not the link).
 */
function detectMovement(data) {
  if (!last) return;
  const prev = new Map(last.links.map((l) => [l.edgeId, l]));
  for (const l of data.links) {
    const p = prev.get(l.edgeId);
    if (!p) continue;
    const rev = (x) => (x.direction === 'down' ? x.lastAppliedRev : x.ackedRev);
    const depth = (x) => (x.players ? x.players.pending : (x.movement && x.movement.buffered) || 0);
    if (rev(l) !== rev(p) || depth(l) !== depth(p)) pulses.set(l.edgeId, Date.now() + POLL_MS);
  }
}

/** The selected node's screens and alerts: one bounded request, on selection and on each tick while selected. */
async function loadSelected(nodeId) {
  if (!nodeId) { selectedData = null; return; }
  try {
    const r = await api.get(`/mesh/noc?node=${encodeURIComponent(nodeId)}`);
    selectedData = r.selected || null;
  } catch (e) { selectedData = { id: nodeId, error: errorMessage(e), screens: [], alerts: [], more: 0 }; }
}

/* ------------------------------ layout + draw ------------------------------ */

const STATE_COLOUR = { connected: '#22c55e', lagging: '#f59e0b', down: '#ef4444', revoked: '#6b7280', unknown: '#6b7280' };
const ALERT = '#ef4444';
const roleLabel = (r) => ({ 'serves-dashboard': t("ui.labels.dashboard_f90453"), 'terminates-players': t("ui.labels.players_2912fa"), 'caches-content': t("ui.labels.cache_b03592"),
                            'relays-for-subtree': t("ui.labels.relay_bd28b2"), 'redistributes-content': t("ui.labels.redistributes_14832a") }[r] || r);
/** What a node IS in this graph, one word: primary / replica / hub / relay. Two servers with the same hostname must not look alike. */
function roleOf(n, kind, data) {
  if (kind === 'self') return (n.roles || []).includes('replica') ? t("ui.labels.replica_f1078c") : (n.roles || []).includes('primary') ? t("ui.labels.primary_e3b7c9") : (n.roles || [])[0] || t("ui.labels.server_3de4f9");
  if (kind === 'parent') return (n.roles || []).includes('serves-dashboard') ? t("ui.labels.replica_f1078c") : t("ui.labels.hub_65acf0");
  if (kind === 'child') return (n.grant || []).includes('workspace-replication') ? t("ui.labels.primary_e3b7c9") : t("ui.labels.site_c099a4");
  return t("ui.noc.value0_hop_s_0f8a61", {value0: n.hops});
}
const ageLabel = (sec) => (sec == null ? t("ui.labels.never_85777c") : sec < 60 ? `${sec}s` : sec < 3600 ? `${Math.floor(sec / 60)}m` : sec < 86400 ? `${Math.floor(sec / 3600)}h` : `${Math.floor(sec / 86400)}d`);
const fmtBytes = (b) => (b == null ? '—' : b >= 1 << 30 ? displayQuantity(b / (1 << 30),'GiB',1) : b >= 1 << 20 ? displayQuantity(b / (1 << 20),'MiB',1) : displayQuantity(b,'B'));
const fmtPct = (v) => (v == null ? '—' : `${Math.round(v * 10) / 10}%`);
const short = (id) => String(id || '').slice(0, 8);

/** The caption a link earns on hover / selection: the state word, copy lag (never a number on a dead link), outbox, acked/head. */
function edgeCaption(l) {
  // "copy lag" = age of the last APPLIED change-log revision on this replica; it is unknown (not
  // zero) when the link is down. The state word is separate so a healthy-looking number can never
  // stand in for a dead link.
  return l.direction === 'down'
    ? t("ui.noc.value0_copy_lag_value1_value2_e751c4", {value0: l.state, value1: l.state === 'down' || l.lag_s == null ? '?' : `${l.lag_s}s`, value2: l.players ? t('ui.noc.outbox',{count:l.players.pending}) : ''})
    : t("ui.noc.value0_value1_a8618e", {value0: l.state, value1: l.ackedRev != null && l.headRev != null ? t('ui.noc.acked',{done:l.ackedRev,total:l.headRev}) : ''});
}

/** Does this link deserve attention on its far node: down, unreachable, or a lag nobody can state. */
const linkAlarms = (l) => l.state === 'down' || l.state === 'unknown' || (l.direction === 'down' && l.state !== 'revoked' && l.lag_s == null);

/** Free space on this server's DATA_DIR filesystem as a fraction, or null when unknown. */
function diskFraction(h) {
  if (!h || h.disk_free_bytes == null || !(h.disk_total_bytes > 0)) return null;
  return h.disk_free_bytes / h.disk_total_bytes;
}

/** Which nodes wear the alert ring: the far end of an alarming link, and this server when its disk is nearly full. */
function alertSet(data) {
  const out = new Set();
  for (const l of data.links) if (linkAlarms(l)) out.add(l.direction === 'down' ? l.from : l.to);
  const f = diskFraction(data.self && data.self.host);
  if (f != null && f < DISK_ALERT_FRACTION) out.add(data.self.id);
  return out;
}

function hostStrip(h) {
  if (!h) return '';
  const f = diskFraction(h);
  const lowDisk = f != null && f < DISK_ALERT_FRACTION;
  const disk = h.disk_free_bytes == null ? '—' : t("ui.noc.value0_free_value1_7fbda2", {value0: fmtBytes(h.disk_free_bytes), value1: f != null ? ` (${Math.round(f * 100)}%)` : ''});
  return `<span ${translatedAttribute("title", "ui.noc.title_this_process_sampled_on_each_poll_means_ed241c")}>${renderHTML(t("ui.noc.this_server_cpu_ram_e89ee9", {value0: fmtPct(h.cpu_pct), value1: fmtBytes(h.rss_bytes)}))} </span>` +
         `<span style="${lowDisk ? `color:${ALERT};font-weight:600` : ''}" ${translatedAttribute("title", "ui.noc.title_free_space_on_the_filesystem_that_holds_d93691")}>${renderHTML(t("ui.noc.disk_c765d1", {value1: disk, value2: lowDisk ? t("ui.noc.below_10_5e80cf") : ''}))}</span>`;
}

function draw(data) {
  const body = host && host.querySelector('#nocBody');
  if (!body) return;
  const asOf = host.querySelector('#nocAsOf');
  if (asOf) bindMessage(asOf, `as of ${displayValue(new Date(data.asOf * 1000), "toLocaleTimeString", undefined)}`);
  const strip = host.querySelector('#nocHost');
  if (strip) strip.innerHTML = hostStrip(data.self && data.self.host);

  const parents = data.nodes.filter((n) => n.kind === 'parent');
  const children = data.nodes.filter((n) => n.kind === 'child');
  const indirect = data.indirect || [];
  const alerts = alertSet(data);
  const W = Math.max(720, Math.max(parents.length, children.length, 1) * 200 + 80);
  const rows = 2 + (parents.length ? 1 : 0) + (indirect.length ? 1 : 0);
  const H = 120 * rows + 40;
  const pos = new Map();
  let y = 60;
  const place = (list, yy) => list.forEach((n, i) => pos.set(n.id, { x: 40 + (W - 80) * ((i + 0.5) / list.length), y: yy }));
  if (parents.length) { place(parents, y); y += 120; }
  pos.set(data.self.id, { x: W / 2, y }); y += 120;
  place(children, y); y += 120;
  place(indirect, y);
  const BW = 168, BH = 44, HB = BH / 2;

  /*
   * The chip: name, "n/m online", an alert ring. Role, short id and capabilities are the hover
   * title — attention on the face, detail one hover or one click away.
   */
  const nodeBox = (n, kind) => {
    const p = pos.get(n.id); if (!p) return '';
    const sel = selected === n.id;
    const roles = kind === 'self' ? n.roles : (kind === 'child' ? n.capabilitiesHere : n.roles) || [];
    const sc = n.screens;
    const line2 = sc && sc.total > 0
      ? t("ui.noc.value0_value1_online_value2_value3_c76feb", {value0: sc.online ?? 0, value1: sc.total, value2: sc.attachedHere ? t('ui.noc.screens_here',{count:sc.attachedHere}) : '', value3: sc.attachedElsewhere ? t('ui.noc.screens_replica',{count:sc.attachedElsewhere}) : ''})
      : (sc ? t("ui.noc.no_screens_281fc0") : (kind === 'indirect' ? t("ui.noc.reached_through_a_child_209408") : t("ui.noc.no_screens_281fc0")));
    const title = [short(n.id), roleOf(n, kind, data), (roles || []).map(roleLabel).join(', '), kind === 'self' ? t("ui.noc.this_server_086b51") : '', kind === 'indirect' ? t("ui.noc.value0_hop_s_via_value1_fbbaa1", {value0: n.hops, value1: short(n.via)}) : '']
      .filter(Boolean).join(' · ');
    const ring = alerts.has(n.id);
    return `
      <g class="noc-node" data-node="${esc(n.id)}" transform="translate(${p.x - BW / 2},${p.y - HB})" style="cursor:pointer">
        <title>${uiText(title)}</title>
        ${renderHTML(ring ? `<rect x="-3" y="-3" width="${BW + 6}" height="${BH + 6}" rx="10" fill="none" stroke="${ALERT}" stroke-width="2"/>` : '')}
        <rect width="${BW}" height="${BH}" rx="8" fill="var(--bg-card,#1f2937)" stroke="${sel ? 'var(--primary,#3b82f6)' : 'var(--border,#374151)'}" stroke-width="${sel ? 2 : 1}"/>
        <text x="10" y="19" fill="var(--text,#e5e7eb)" font-size="13" font-weight="600">${uiText((n.name || short(n.id)).slice(0, 20))}${renderHTML(kind === 'self' ? ` <tspan fill="var(--text-muted,#9ca3af)" font-weight="400" font-size="10">${renderHTML(t("ui.noc.this_server_98bf14"))}</tspan>` : '')}</text>
        <text x="10" y="35" fill="var(--text-muted,#9ca3af)" font-size="11">${uiText(line2)}</text>
      </g>`;
  };
  /*
   * The edge: colour by state, nothing more, until it is hovered or touches the selected node —
   * then the full caption. A wide transparent twin gives the 2 px line something to hover.
   */
  const edgeLine = (l) => {
    const a = pos.get(l.from), b = pos.get(l.to); if (!a || !b) return '';
    const colour = STATE_COLOUR[l.state] || STATE_COLOUR.unknown;
    const pulsing = (pulses.get(l.edgeId) || 0) > Date.now();
    const sel = selected && (l.from === selected || l.to === selected);
    // The caption sits near the LOWER end of the line (the child's box), where nine fan-in links
    // are spread apart; at the midpoint they all cross the same few pixels.
    const lower = a.y > b.y ? a : b, upper = a.y > b.y ? b : a;
    const tx = upper.x + (lower.x - upper.x) * 0.82, ty = upper.y + HB + ((lower.y - HB) - (upper.y + HB)) * 0.82;
    return `
      <g class="noc-edge${pulsing ? ' noc-pulse' : ''}${sel ? ' noc-sel' : ''}" data-edge="${esc(l.edgeId)}">
        <title>${uiText(edgeCaption(l))}</title>
        <line x1="${a.x}" y1="${a.y + HB}" x2="${b.x}" y2="${b.y - HB}" stroke="transparent" stroke-width="14"/>
        <line class="noc-wire" x1="${a.x}" y1="${a.y + HB}" x2="${b.x}" y2="${b.y - HB}" stroke="${colour}" stroke-width="${pulsing ? 4 : 2}" ${l.state === 'revoked' ? 'stroke-dasharray="6 4"' : ''}/>
        <text class="noc-cap" x="${tx}" y="${ty - 4}" fill="${colour}" font-size="10" text-anchor="middle">${uiText(edgeCaption(l))}</text>
      </g>`;
  };
  const indirectLine = (n) => {
    const a = pos.get(n.via), b = pos.get(n.id); if (!a || !b) return '';
    return `<line x1="${a.x}" y1="${a.y + HB}" x2="${b.x}" y2="${b.y - HB}" stroke="#6b7280" stroke-width="1" stroke-dasharray="2 4"/>`;
  };

  const svg = `
    <style>
      .noc-pulse .noc-wire { animation: nocPulse ${renderHTML(POLL_MS)}ms ease-out 1; }
      @keyframes nocPulse { 0% { stroke-opacity: 1; stroke-width: 6; } 100% { stroke-opacity: .9; stroke-width: 2; } }
      .noc-edge .noc-cap { display: none; paint-order: stroke; stroke: var(--bg-card,#1f2937); stroke-width: 3px; }
      .noc-edge:hover .noc-cap, .noc-edge.noc-sel .noc-cap { display: block; }
    </style>
    <svg viewBox="0 0 ${W} ${H}" width="100%" height="${H}" role="img" aria-label="${esc(t('noc.graph_label'))}" data-fil-i18n-aria-label="${binding('noc.graph_label', undefined)}" style="max-width:100%">
      ${renderHTML(data.links.map(edgeLine).join(''))}
      ${renderHTML(indirect.map(indirectLine).join(''))}
      ${renderHTML(parents.map((n) => nodeBox(n, 'parent')).join(''))}
      ${renderHTML(nodeBox(data.self, 'self'))}
      ${renderHTML(children.map((n) => nodeBox(n, 'child')).join(''))}
      ${renderHTML(indirect.map((n) => nodeBox(n, 'indirect')).join(''))}
    </svg>`;

  // Accessible list of the same nodes, always rendered (and the whole view if SVG is unavailable).
  const listItem = (n, kind) => `<li><strong>${uiText(n.name || short(n.id))}</strong> — ${uiText(kind)}${renderHTML(n.screens?t('ui.noc.screens_summary',{online:n.screens.online??0,total:n.screens.total??0}):'')}${renderHTML(alerts.has(n.id)?t('ui.noc.needs_attention'):'')}</li>`;
  const list = `
    <details style="margin-top:12px"><summary style="cursor:pointer;color:var(--text-muted);font-size:12px">${renderHTML(t("ui.noc.list_view"))}</summary>
      <ul style="font-size:13px">
        ${renderHTML(listItem(data.self, t("ui.noc.this_server_086b51")))}
        ${renderHTML(parents.map((n) => listItem(n, t("ui.noc.parent_a311ec") + (n.roles || []).map(roleLabel).join(', '))).join(''))}
        ${renderHTML(children.map((n) => listItem(n, t("ui.noc.child_c88849") + (n.capabilitiesHere || []).map(roleLabel).join(', '))).join(''))}
        ${renderHTML(indirect.map((n) => listItem(n, t("ui.noc.value0_hop_s_via_value1_fbbaa1", {value0: n.hops, value1: short(n.via)}))).join(''))}
        ${renderHTML(data.links.map((l) => `<li>${renderHTML(t("ui.noc.link_f8a830", {value0: short(l.from), value1: short(l.to), value2: edgeCaption(l), value3: l.lastError ? `, ${(l.lastError)}` : ''}))}</li>`).join(''))}
      </ul>
    </details>`;

  const supportsSvg = typeof document.createElementNS === 'function';
  body.innerHTML = `
    <div class="settings-section">${renderHTML(supportsSvg ? svg : '')}${renderHTML(list)}</div>
    <div id="nocDetail" class="settings-section" style="margin-top:16px">${renderHTML(detailHtml(data))}</div>`;

  body.querySelectorAll('.noc-node').forEach((g) => g.addEventListener('click', async () => {
    if (selected !== g.dataset.node) { selected = g.dataset.node; selectedData = null; draw(data); await loadSelected(selected); }
    draw(last || data);
  }));
  wireDetail(body, data);
}

/* ------------------------------ detail panel ------------------------------ */

function detailHtml(data) {
  if (!selected) return `<p style="color:var(--text-muted);font-size:13px">${renderHTML(t("ui.noc.select_a_server_for_its_links_and_9f4e53"))}</p>`;
  const n = [data.self, ...data.nodes, ...(data.indirect || [])].find((x) => x.id === selected);
  if (!n) return '';
  const links = data.links.filter((l) => l.from === n.id || l.to === n.id);
  const kv = (k, v) => `<div style="display:flex;justify-content:space-between;gap:12px;font-size:12px;padding:2px 0"><span style="color:var(--text-muted)">${uiText(k)}</span><span>${uiText(String(v))}</span></div>`;
  const linkCard = (l) => {
    const colour = STATE_COLOUR[l.state] || STATE_COLOUR.unknown;
    const rows = [];
    rows.push(kv(t("ui.labels.state_aa4a5f"), l.state));
    if (l.direction === 'down') {
      rows.push(kv(t("ui.noc.copy_lag_age_of_last_applied_change_c8132d"), l.state === 'down' || l.lag_s == null ? 'unknown' : `${l.lag_s} s`));
      rows.push(kv('phase', l.phase || '—'));
      rows.push(kv(t("ui.noc.applied_rev_937fd1"), l.lastAppliedRev ?? '—'));
      if (l.error) rows.push(kv('error', l.error));
      if (l.players) { rows.push(kv(t("ui.noc.outbox_depth_a71952"), l.players.pending)); rows.push(kv(t("ui.noc.outbox_oldest_a8c059"), `${l.players.oldest_age_s} s`)); rows.push(kv(t("ui.noc.events_applied_3e506c"), l.players.sent ?? 0)); rows.push(kv(t("ui.noc.expired_refused_at_cap_072c88"), `${l.players.expired} / ${l.players.refused_at_cap}`)); if (l.players.last_error) rows.push(kv(t("ui.noc.outbox_error_5d2389"), l.players.last_error)); }
      if (l.cache) { rows.push(kv(t("ui.labels.cache_b03592"), t("ui.noc.value0_of_value1_value2_files_afa330", {value0: fmtBytes(l.cache.bytes), value1: fmtBytes(l.cache.cap_bytes), value2: l.cache.files}))); rows.push(kv('pinned', fmtBytes(l.cache.pinned_bytes))); rows.push(kv(t("ui.noc.stored_this_run_2bee84"), l.cache.stored ?? 0)); if (l.cache.last_error) rows.push(kv(t("ui.noc.cache_error_e0bcab"), l.cache.last_error)); }
      rows.push(kv(t("ui.noc.commands_delivered_here_76e32b"), l.movement.relays_delivered ?? 0));
    } else {
      rows.push(kv(t("ui.noc.acked_rev_head_9892d4"), `${l.ackedRev ?? '—'} / ${l.headRev ?? '—'}`));
      rows.push(kv(t("ui.noc.commands_relayed_up_f4e688"), l.movement.relayed ?? 0));
      if (l.movement.buffered != null) rows.push(kv(t("ui.noc.buffered_upward_0fbb3f"), l.movement.buffered));
      if (l.lastError) rows.push(kv(t("ui.noc.last_error_4d5f57"), l.lastError));
    }
    const other = l.direction === 'down' ? l.from : l.to;
    return `
      <div style="border:1px solid ${colour};border-radius:8px;padding:10px;min-width:260px;flex:1">
        <div style="font-size:12px;margin-bottom:6px"><strong>${uiText(l.direction === 'down' ? t("ui.noc.reports_to_this_server_041fce") : t("ui.noc.this_server_reports_to_41bb41"))}</strong> · ${uiText(short(other))}</div>
        ${renderHTML(rows.join(''))}
        ${renderHTML(l.direction === 'down' && l.state !== 'revoked' ? `<button class="btn btn-secondary btn-sm" style="margin-top:8px" data-disconnect="${esc(other)}">${renderHTML(t("ui.noc.disconnect_acfc5b"))}</button>` : '')}
      </div>`;
  };
  const sc = n.screens;
  const counts = sc ? `<p style="font-size:12px;margin:6px 0">${renderHTML(t('ui.noc.screen_counts',{online:sc.online??0,total:sc.total??0}))} ${renderHTML(sc.stale?t('ui.noc.stale_count',{n:sc.stale}):'')} ${renderHTML(sc.attachedHere?t('ui.noc.here_count',{n:sc.attachedHere}):'')} ${renderHTML(sc.attachedElsewhere?t('ui.noc.replica_count',{n:sc.attachedElsewhere}):'')}</p>` : '';
  // Host figures: this server's own probe, or a child's when its report carries them (none does
  // today — node-health has no host fields, and nothing here scrapes one). A missing field is a
  // missing row, not a dash.
  const h = n.host || null;
  const hostRows = h ? [
    h.cpu_pct != null ? kv('CPU (this process, % of one core; 250% = 2.5 cores)', fmtPct(h.cpu_pct)) : '',
    h.mem_pct != null ? kv(t("ui.noc.memory_used_8f24ff"), fmtPct(h.mem_pct)) : '',
    h.rss_bytes != null ? kv(t("ui.noc.resident_memory_4f01e3"), fmtBytes(h.rss_bytes)) : '',
    h.disk_free_bytes != null ? kv(t("ui.noc.disk_free_data_dir_88d9af"), `${fmtBytes(h.disk_free_bytes)}${h.disk_total_bytes ? ` of ${fmtBytes(h.disk_total_bytes)}` : ''}`) : '',
  ].filter(Boolean).join('') : '';
  const sd = selectedData && selectedData.id === n.id ? selectedData : null;
  const TDS = 'padding:4px 8px;border-bottom:1px solid var(--border);font-size:12px;text-align:left';
  // Optional columns appear only when some row can fill them; a fleet that reports nothing gets
  // no column of dashes, and a playlist column with no titles is left out.
  const has = (k) => !!(sd && sd.screens.some((d) => d[k] != null && d[k] !== ''));
  const showCpu = has('cpu_pct'), showMem = has('mem_pct'), showStorage = has('storage_free_bytes'), showPlaylist = has('playlist');
  const screenRows = sd && sd.screens.length ? `
    <table style="width:100%;border-collapse:collapse;margin-top:6px">
      <thead><tr>
        <th style="${TDS}">${renderHTML(t("ui.noc.screen_6e5613"))}</th><th style="${TDS}">${renderHTML(t("ui.noc.status_920e41"))}</th><th style="${TDS}">${renderHTML(t("ui.noc.seen_8894cf"))}</th><th style="${TDS}">${renderHTML(t("ui.noc.attached_ac6d9b"))}</th>${renderHTML(showCpu ? `<th style="${TDS}">CPU</th>` : '')}${renderHTML(showMem ? `<th style="${TDS}">${renderHTML(t("ui.noc.memory_c3963a"))}</th>` : '')}${renderHTML(showStorage ? `<th style="${TDS}">${renderHTML(t("ui.noc.storage_free_781703"))}</th>` : '')}${renderHTML(showPlaylist ? `<th style="${TDS}">${renderHTML(t("ui.noc.playlist_7af36c"))}</th>` : '')}
      </tr></thead>
      <tbody>${renderHTML(sd.screens.map((d) => `
        <tr>
          <td style="${TDS}">${uiText(d.name)}</td>
          <td style="${TDS};color:${d.status === 'online' ? '#22c55e' : '#ef4444'}">${uiText(d.status)}</td>
          <td style="${TDS}" ${translatedAttribute("title", "ui.noc.title_seconds_since_the_last_heartbeat_or_device_bb2735")}>${uiText(ageLabel(d.seen_s))}</td>
          <td style="${TDS}">${uiText(d.attached === 'here' ? 'here' : d.attached === 'primary' ? 'primary' : short(d.attached))}</td>
          ${renderHTML(showCpu ? `<td style="${TDS}">${uiText(fmtPct(d.cpu_pct))}</td>` : '')}
          ${renderHTML(showMem ? `<td style="${TDS}">${uiText(fmtPct(d.mem_pct))}</td>` : '')}
          ${renderHTML(showStorage ? `<td style="${TDS}">${uiText(fmtBytes(d.storage_free_bytes))}</td>` : '')}
          ${renderHTML(showPlaylist ? `<td style="${TDS};color:var(--text-muted)">${uiText(d.playlist || '—')}</td>` : '')}
        </tr>`).join(''))}
      </tbody>
    </table>
    ${renderHTML(sd.more ? `<p style="font-size:12px;color:var(--text-muted);margin:6px 0">${renderHTML(t('ui.noc.more_count',{n:sd.more}))} — <a href="#/devices">${renderHTML(t("ui.noc.the_displays_list"))}</a>.</p>` : '')}
    <p style="font-size:11px;color:var(--text-muted);margin:4px 0 0">${renderHTML(t("ui.noc.stale_first_as_of_refreshes_with_the_eb2834", {value10: displayValue(new Date(sd.asOf * 1000), "toLocaleTimeString", undefined)}))}</p>`
    : (sd ? `<p style="font-size:12px;color:var(--text-muted)">${renderHTML(sd.error ? esc(sd.error) : t("ui.noc.no_screens_on_this_node_054188"))}</p>` : `<p style="font-size:12px;color:var(--text-muted)">${renderHTML(t('devices.loading'))}</p>`);
  const alertRows = sd && sd.alerts && sd.alerts.length ? `
    <h4 style="margin:12px 0 4px;font-size:13px">${renderHTML(t("ui.noc.last_alerts"))}</h4>
    <ul style="font-size:12px;margin:0;padding-left:18px">${renderHTML(sd.alerts.map((a) => `<li>${uiText(a.metric)} <span style="color:var(--text-muted)">${renderHTML(t("ui.noc.ago_bb62e4", {value1: a.severity || '', value2: a.device ? `, ${(a.device)}` : '', value3: ageLabel(Math.max(0, Math.floor(Date.now() / 1000) - (a.opened_at || 0))), value4: a.closed_at ? t("ui.noc.closed_2cc035") : ''}))}</span></li>`).join(''))}</ul>` : '';
  return `
    <h3 style="margin-top:0">${uiText(n.name || short(n.id))} <span style="color:var(--text-muted);font-size:12px;font-weight:normal">${uiText(n.id)} · ${uiText(n === data.self && (n.roles || []).length ? n.roles.join(' · ') : roleOf(n, n === data.self ? 'self' : n.kind, data))}</span></h3>
    ${renderHTML(counts)}
    ${renderHTML(hostRows ? `<div style="max-width:420px">${renderHTML(hostRows)}</div>` : '')}
    ${renderHTML(screenRows)}
    ${renderHTML(alertRows)}
    <h4 style="margin:12px 0 4px;font-size:13px">${renderHTML(t("ui.noc.links"))}</h4>
    <div style="display:flex;gap:12px;flex-wrap:wrap">${renderHTML(links.map(linkCard).join('') || `<span style="color:var(--text-muted);font-size:12px">${renderHTML(t("ui.noc.no_direct_link_reached_through_another_server_b7d45f"))}</span>`)}</div>`;
}

function wireDetail(body, data) {
  body.querySelectorAll('[data-disconnect]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const nodeId = btn.dataset.disconnect;
      // The same consent copy as Servers → Topology → Disconnect: what stays, what goes, what stops.
      if (!window.confirm(t('ui.mesh.disconnect_confirm'))) return;
      try {
        const r = await api.delete(`/mesh/links/${encodeURIComponent(nodeId)}`);
        showToast(r.summary || t("ui.noc.disconnected_f8fa2a"), 'success');
        await tick();
      } catch (e) { showToast(errorMessage(e), 'error'); }
    });
  });
}
