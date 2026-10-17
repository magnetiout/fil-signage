import {displayList} from '../i18n.js';
import {storedErrorMessage} from '../api.js';
import { renderHTML, uiText, translatedAttribute, bindMessage, bindAttribute, binding, bindText } from '../lib/i18n-bindings.js';

import { displayValue, getLocale, message as t, messageCount as tn } from '../i18n.js';

import { errorMessage, api } from '../api.js';
import * as gettingStarted from '../components/getting-started.js';
import { showToast } from '../components/toast.js';
import { esc, hydrateAuthImages } from '../utils.js';
import { openContentPicker } from '../components/content-picker.js';

import { frameDeviceOutput, displayAspectRatio } from '../lib/device-frame.js';
import { renderApprovalBar } from '../components/approval-actions.js';
import { openSmartRulesModal, rulesSummary, loadFolders, DEFAULT_RULES } from '../components/smart-rules.js';
import * as cui from '../components/corporate-ui.js';
import { openSlotDialog } from '../components/corporate-slot-dialog.js';
import { confirmAccessibility } from '../components/accessibility.js';
import { layoutPickerHtml, mountLayoutPicker, zoneSelectHtml, bindZoneSelects } from '../components/playlist-layout.js';
import { layoutThumbHtml, layoutItemSummary, campaignZoneOptions, campaignZoneSelectHtml, campaignBannerHtml, openLayoutItemDialog } from '../components/campaign-editor.js';

function formatDate(ts) {
  if (!ts) return '--';
  return displayValue(new Date(ts * 1000), "toLocaleDateString", { month: 'short', day: 'numeric', year: 'numeric' });
}

function getTypeIcon(item) {
  if (item.widget_id) return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="2" width="8" height="8" rx="1"/><rect x="14" y="2" width="8" height="8" rx="1"/><rect x="2" y="14" width="8" height="8" rx="1"/><rect x="14" y="14" width="8" height="8" rx="1"/></svg>`;
  if (item.mime_type && item.mime_type.startsWith('video/')) return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"/></svg>`;
  return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>`;
}

// #74/#75 per-item schedule editor helpers. Client validation MIRRORS the server
// (server/routes/playlists.js validateBlocks): same time/date regexes, non-empty days.
const SCHED_TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const SCHED_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function daysSummary(days) {
  const labels = t('itemsched.dow_short').split(',');
  const s = [...days].sort((a, b) => a - b);
  if (s.length === 7) return t('itemsched.every_day');
  if (s.length === 5 && [1, 2, 3, 4, 5].every(d => s.includes(d))) return t('itemsched.mon_fri');
  if (s.length === 2 && s.includes(0) && s.includes(6)) return t('itemsched.sat_sun');
  return s.map(d => labels[d]).join(' ');
}
function blockSummary(b) {
  let s = `${daysSummary(b.days)} ${b.start}-${b.end}`;
  if (b.start_date || b.end_date) s += ` · ${b.start_date || '…'}→${b.end_date || '…'}`;
  return s;
}
function scheduleSummary(schedules) {
  if (!schedules || !schedules.length) return '';
  return schedules.length === 1 ? blockSummary(schedules[0]) : `${blockSummary(schedules[0])} +${schedules.length - 1}`;
}
function windowSummary(item) {
  if (!item || (!item.play_from && !item.play_until)) return '';
  return `${item.play_from || '…'} → ${item.play_until || '…'}`;
}
function validateScheduleBlocks(blocks) {
  for (const b of blocks) {
    if (!b.days || !b.days.length) return t('itemsched.err.days');
    if (!SCHED_TIME_RE.test(b.start)) return t('itemsched.err.start');
    if (!(SCHED_TIME_RE.test(b.end) || b.end === '24:00')) return t('itemsched.err.end');
    // A zero-length window (start == end) never plays; reject it (start > end is a valid overnight window).
    if (b.start === b.end) return t('itemsched.err.same');
    if (b.start_date && !SCHED_DATE_RE.test(b.start_date)) return t('itemsched.err.start_date');
    if (b.end_date && !SCHED_DATE_RE.test(b.end_date)) return t('itemsched.err.end_date');
  }
  return null;
}

let currentPlaylistId = null;
let currentPlaybackOrder = 'sequential';
// #319: the items exactly as last rendered. Sorting needs the list the operator is looking at, and
// every path that changes it already funnels through renderItems, so that is where it is kept.
let currentPlaylistItems = [];
/*
 * Head office (corporate) editor state, or null for an ordinary playlist (docs/corporate-playlists.md):
 *   { mode: 'corporate', playlistId, slots: Map<slotId, slotView>, canAuthor, screens }
 *   { mode: 'fill', playlistId, slot (slotView), fill (fill view), limits, preview }
 * 'corporate' is head office's own playlist: slot rows render as slots, only authors edit it.
 * 'fill' is a store's content for one local slot: limits, meters, no nesting / repeat / order.
 */
let corpEditor = null;
let selectedItemIds = new Set();
let selectAnchorId = null;
const CLIP_KEY = 'st.playlistClipboard';

export function render(container) {
  const hash = window.location.hash;
  const match = hash.match(/#\/playlists\/(.+)/);
  if (match) {
    currentPlaylistId = match[1];
    renderDetail(container, match[1]);
  } else {
    currentPlaylistId = null;
    renderList(container);
  }
}

export function cleanup() {
  currentPlaylistId = null;
  corpEditor = null;
}

// Deliberately default-ON (commit aca1558): per-device "<Device> playlist" rows and every
// playlist migrated from a legacy DB carry is_auto_generated=1, and those are the playlists
// screens actually play — defaulting off strands operators on an "all auto-generated"
// placeholder. Persisted across reloads like the other rd_* UI prefs.
let showAutoGenerated = true;
try {
  const stored = localStorage.getItem('rd_show_auto_playlists');
  if (stored !== null) showAutoGenerated = stored !== '0';
} catch {}
// Last fetched page, so flipping the toggle filters client-side instead of re-fetching
// GET /playlists for data already in hand.
let cachedPlaylists = null;
// 3.0: the layout the open playlist is drawn in (explicit or derived), for the per-item zone picker.
let currentLayout = null;

async function renderList(container) {
  container.innerHTML = `
    <div class="page-header">
      <div>
        <h1>${renderHTML(t('playlist.title'))} <span class="help-tip" ${translatedAttribute("data-tip", 'playlist.help_tip')}>?</span></h1>
        <div class="subtitle">${renderHTML(t('playlist.subtitle'))}</div>
      </div>
      <div style="display:flex;gap:8px;align-items:center">
        <label style="display:flex;align-items:center;gap:6px;font-size:13px;color:var(--text-secondary);cursor:pointer">
          <input type="checkbox" id="showAutoToggle" ${showAutoGenerated ? 'checked' : ''}>
          ${renderHTML(t('playlist.show_auto_generated'))}
        </label>
        <button class="btn btn-primary" id="createPlaylistBtn">${renderHTML(t('playlist.new_playlist_btn'))}</button>
      </div>
    </div>
    <!-- Same reason as the Content Library: the step that sent you here has to still be here. -->
    <div id="gettingStarted"></div>
    <div id="playlistGrid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:16px">
      <div style="color:var(--text-muted);padding:40px;text-align:center">${uiText(t('common.loading'))}</div>
    </div>
  `;

  document.getElementById('createPlaylistBtn').addEventListener('click', () => showCreateModal());
  document.getElementById('showAutoToggle').addEventListener('change', (e) => {
    showAutoGenerated = e.target.checked;
    try { localStorage.setItem('rd_show_auto_playlists', showAutoGenerated ? '1' : '0'); } catch {}
    if (cachedPlaylists) renderPlaylistGrid(cachedPlaylists);
    else loadPlaylists();
  });
  /*
   * The checklist, if this account still has one. Fire-and-forget so the grid never waits on it.
   *
   * ⚠️ onAction IS NOT OPTIONAL HERE. Step 3 points at this page, so its button would otherwise
   * fall through to `location.hash = '#/playlists'` — which does nothing when you are already on
   * /playlists. Reported as "it just sits there doing nothing" while the New Playlist button at
   * the top worked. Same modal, same function, one entry point.
   */
  gettingStarted.mount(document.getElementById('gettingStarted'), {
    onAction: (a) => {
      if (a === 'new-playlist') { showCreateModal(); return true; }
      return false;
    },
  }).catch(() => {});
  loadPlaylists();
}

async function loadPlaylists() {
  try {
    cachedPlaylists = await api.getPlaylists();
    renderPlaylistGrid(cachedPlaylists);
  } catch (err) {
    const grid = document.getElementById('playlistGrid');
    if (grid) grid.innerHTML = `<div style="grid-column:1/-1;color:var(--text-muted);padding:40px;text-align:center">${renderHTML(t('playlist.load_failed', { error: (errorMessage(err)) }))}</div>`;
  }

  // #313/checklist: creating a playlist ticks a step, and every create reloads this list.
  gettingStarted.refresh().catch(() => {});
}

function renderPlaylistGrid(playlists) {
  const grid = document.getElementById('playlistGrid');
  if (!grid) return;

  if (!playlists.length) {
    grid.innerHTML = `
      <div style="grid-column:1/-1;text-align:center;padding:60px 20px;color:var(--text-muted)">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="margin:0 auto 16px;display:block;opacity:0.4">
          <line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/>
          <line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>
        </svg>
        <h3 style="margin-bottom:8px;color:var(--text-primary)">${renderHTML(t('playlist.empty_title'))}</h3>
        <p>${renderHTML(t('playlist.empty_desc'))}</p>
      </div>
    `;
    return;
  }

  const filtered = showAutoGenerated ? playlists : playlists.filter(p => !p.is_auto_generated);
  if (!filtered.length) {
    grid.innerHTML = `
      <div style="grid-column:1/-1;text-align:center;padding:40px;color:var(--text-muted)">
        ${renderHTML(playlists.length ? t('playlist.all_auto_generated') : '')}
      </div>
    `;
    return;
  }

    grid.innerHTML = filtered.map(p => `
      <a href="#/playlists/${esc(p.id)}" class="playlist-card" style="background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius-lg);padding:20px;text-decoration:none;color:inherit;display:block;transition:border-color 0.15s;cursor:pointer">
        <div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:12px">
          <div style="display:flex;align-items:center;gap:8px">
            <div style="font-size:16px;font-weight:600;color:var(--text-primary)">${uiText(p.name)}</div>
            ${renderHTML(p.is_auto_generated ? `<span style="font-size:10px;padding:2px 6px;border-radius:4px;background:var(--bg-input);color:var(--text-muted)">${renderHTML(t('playlist.tag_auto'))}</span>` : '')}
            ${renderHTML(p.status === 'draft' ? `<span style="font-size:10px;padding:2px 6px;border-radius:4px;background:#78350f;color:#fbbf24">${renderHTML(t('playlist.tag_draft'))}</span>` : '')}
            ${renderHTML(p.smart_rules ? `<span title="${esc(t('smart.badge_tip'))}" data-fil-i18n-title="${binding('smart.badge_tip', undefined)}" style="font-size:10px;padding:2px 6px;border-radius:4px;background:#312e81;color:#c7d2fe">✦ ${renderHTML(t('smart.badge'))}</span>` : '')}
            ${/* ⚠️ The lock. Shown BEFORE anyone tries to delete it, because deletion is refused
                  while it is nested and an unexplained refusal is worse than a visible constraint.
                  BrightSign's pattern; the one thing Appspace conspicuously lacks. */ renderHTML('')}
            ${renderHTML(p.used_by_count ? `<span title="${esc(tn('playlist.used_by_tip', p.used_by_count))}" data-fil-i18n-title="${binding('playlist.used_by_tip', undefined, p.used_by_count)}" style="font-size:10px;padding:2px 6px;border-radius:4px;background:#1e3a2f;color:#6ee7b7">🔒 ${uiText(tn('playlist.used_by', p.used_by_count))}</span>` : '')}
            ${renderHTML(p.has_children ? `<span title="${esc(t('playlist.contains_tip'))}" data-fil-i18n-title="${binding('playlist.contains_tip', undefined)}" style="font-size:10px;padding:2px 6px;border-radius:4px;background:var(--bg-input);color:var(--text-muted)">☰ ${renderHTML(t('playlist.tag_nested'))}</span>` : '')}
            ${renderHTML(p.corporate ? cui.chip(t('corp.badge.corporate'), 'hq', t('corp.tip.corporate'), { lock: true }) : '')}
            ${renderHTML(p.corporate_slot ? cui.chip(t('corp.badge.your_slot'), 'slot', t('corp.tip.your_slot', { slot: p.corporate_slot.slot_name || '', playlist: p.corporate_slot.playlist_name || '' })) : '')}
          </div>
          <div style="font-size:12px;color:var(--text-muted);white-space:nowrap;margin-left:12px">${renderHTML(p.smart_rules ? t('smart.by_rules') : tn('playlist.item_count', p.item_count))}</div>
        </div>
        ${renderHTML(p.description ? `<div style="font-size:13px;color:var(--text-secondary);margin-bottom:12px;line-height:1.4">${uiText(p.description)}</div>` : '')}
        <div style="display:flex;justify-content:space-between;font-size:12px;color:var(--text-muted)">
          <span>${renderHTML(t('playlist.created_at', { date: formatDate(p.created_at) }))}</span>
          ${renderHTML(p.display_count ? `<span>${renderHTML(tn('playlist.display_count', p.display_count))}</span>` : '')}
          ${/* ⚠️ "Paused", not "Not used": head office's playlist plays where this one would, and the
                store must not delete it thinking nothing needs it (critique R13). */ renderHTML('')}
          ${renderHTML(!p.display_count && p.paused_count ? `<span title="${esc(t('corp.tip.paused'))}" data-fil-i18n-title="${binding('corp.tip.paused', undefined)}" style="color:var(--warning)">${uiText(tn('corp.badge.paused', p.paused_count))}</span>` : '')}
        </div>
      </a>
    `).join('');
}

function showCreateModal(prefill = {}) {
  const modal = document.createElement('div');
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;z-index:1000';
  modal.innerHTML = `
    <div role="dialog" aria-modal="true" aria-labelledby="newPlaylistTitle" style="background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius-lg);padding:24px;width:400px;max-width:90vw">
      <h3 id="newPlaylistTitle" style="margin-bottom:16px;color:var(--text-primary)">${renderHTML(t('playlist.new_playlist'))}</h3>
      <input type="text" id="newPlaylistName" class="input" placeholder="${t('playlist.name_placeholder')}" data-fil-i18n-placeholder="${binding('playlist.name_placeholder', undefined)}" style="width:100%;margin-bottom:12px" autofocus>
      <textarea id="newPlaylistDesc" class="input" placeholder="${t('playlist.desc_placeholder')}" data-fil-i18n-placeholder="${binding('playlist.desc_placeholder', undefined)}" style="width:100%;height:60px;resize:vertical;margin-bottom:12px"></textarea>
      <label style="display:flex;gap:8px;align-items:flex-start;font-size:13px;color:var(--text-secondary);margin-bottom:16px;cursor:pointer">
        <input type="checkbox" id="newPlaylistSmart" style="margin-top:3px">
        <span><strong style="color:var(--text-primary)">${renderHTML(t('smart.create_label'))}</strong><br>${renderHTML(t('smart.create_hint'))}</span>
      </label>
      <div style="display:flex;gap:8px;justify-content:flex-end">
        <button class="btn btn-secondary" id="cancelCreateBtn">${uiText(t('common.cancel'))}</button>
        <button class="btn btn-primary" id="confirmCreateBtn">${renderHTML(t('playlist.create_btn'))}</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  const nameInput = document.getElementById('newPlaylistName');
  // Back from the rules step (Cancel there) the operator's typing is restored, not thrown away.
  if (prefill.name) nameInput.value = prefill.name;
  if (prefill.desc) document.getElementById('newPlaylistDesc').value = prefill.desc;
  if (prefill.smart) document.getElementById('newPlaylistSmart').checked = true;
  nameInput.focus();

  document.getElementById('cancelCreateBtn').addEventListener('click', () => modal.remove());
  modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });

  async function doCreate() {
    const name = nameInput.value.trim();
    if (!name) { nameInput.focus(); return; }
    const desc = document.getElementById('newPlaylistDesc').value.trim();
    // A smart playlist is born with its rules: pick them first, create on save.
    if (document.getElementById('newPlaylistSmart').checked) {
      modal.remove();
      openSmartRulesModal({
        title: t('smart.title_new', { name }),
        initial: DEFAULT_RULES,
        saveLabel: t('playlist.create_btn'),
        onCancel: () => showCreateModal({ name, desc, smart: true }),
        onSave: async (rules) => {
          const pl = await api.createPlaylist(name, desc, rules);
          showToast(t('playlist.toast.created'));
          window.location.hash = `#/playlists/${pl.id}`;
        },
      });
      return;
    }
    try {
      const pl = await api.createPlaylist(name, desc);
      modal.remove();
      showToast(t('playlist.toast.created'));
      window.location.hash = `#/playlists/${pl.id}`;
    } catch (err) {
      showToast(errorMessage(err), 'error');
    }
  }

  document.getElementById('confirmCreateBtn').addEventListener('click', doCreate);
  nameInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') doCreate(); });
}

async function renderDetail(container, playlistId) {
  container.innerHTML = `
    <div style="color:var(--text-muted);padding:40px;text-align:center">${uiText(t('common.loading'))}</div>
  `;

  try {
    const playlist = await api.getPlaylist(playlistId);
    renderDetailContent(container, playlist);
  } catch (err) {
    container.innerHTML = `
      <div style="padding:40px;text-align:center;color:var(--text-muted)">
        <p>${renderHTML(t('playlist.load_failed', { error: (errorMessage(err)) }))}</p>
        <a href="#/playlists" class="btn btn-secondary" style="margin-top:16px">${renderHTML(t('playlist.back_to_playlists'))}</a>
      </div>
    `;
  }
}

// #104: draft preview by REUSING the player. Iframes /player in device-free preview
// mode (same-origin -> dashboard CSP frame-src 'self' allows it). The player fetches
// /api/playlists/:id/preview-payload and renders with its unmodified renderer, so the
// preview is byte-identical to what a device shows. Orientation toggle just reloads
// the iframe with &orientation; the server passes it through.
// #238: Portrait here had the same fault as the device preview — the iframe was given the
// as-displayed 9/16 shape AND the player rotated inside it, so the portrait toggle showed sideways
// content. The stage is the panel's face; the iframe is its landscape framebuffer, turned back by
// the stand-in for the wall mount.
function showPlaylistPreview(playlist) {
  let orientation = 'landscape';
  const aspect = () => displayAspectRatio(orientation);
  const frameSrc = () => `/player?preview=1&playlist=${encodeURIComponent(playlist.id)}&orientation=${orientation}&t=${Date.now()}`;
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.85);display:flex;align-items:center;justify-content:center;z-index:10000;padding:16px';
  overlay.innerHTML = `
    <div style="background:var(--bg-card);border-radius:8px;display:flex;flex-direction:column;overflow:hidden;border:1px solid var(--border);max-width:95vw;max-height:92vh">
      <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 16px;border-bottom:1px solid var(--border);gap:12px">
        <strong style="color:var(--text-primary)">${renderHTML(t('widget.preview'))} — ${uiText(playlist.name)}</strong>
        <div style="display:flex;gap:8px;align-items:center">
          <button class="btn btn-primary btn-sm" id="pvpLandscape">${renderHTML(t('device.form.orientation.landscape'))}</button>
          <button class="btn btn-secondary btn-sm" id="pvpPortrait">${renderHTML(t('device.form.orientation.portrait'))}</button>
          <button class="btn btn-secondary btn-sm" id="pvpClose">${renderHTML(t('widget.close'))}</button>
        </div>
      </div>
      <div style="padding:16px;display:flex;align-items:center;justify-content:center;background:#000">
          <!-- The stage is the sized box; the frame inside it is rotated to the panel's own shape
               (#238), so a portrait preview is no longer the double rotation it used to be.
               72vh rather than 78: the modal caps at 92vh with overflow:hidden, and the header plus
               the transport row cost ~12vh — at 78 the skip buttons fell off the bottom. -->
          <div id="pvpStage" style="height:72vh;max-width:92vw;aspect-ratio:${aspect()};background:#000">
            <iframe id="pvpFrame" style="border:0;background:#000" src="${frameSrc()}"></iframe>
          </div>
        </div>
        <div style="display:flex;justify-content:center;align-items:center;gap:12px;padding:10px 16px;border-top:1px solid var(--border)">
          <button class="btn btn-secondary btn-sm" id="pvpPrev" disabled>‹ ${renderHTML(t('playlist.preview_prev'))}</button>
          <span id="pvpPosition" style="color:var(--text-muted);font-size:13px;min-width:110px;text-align:center">&nbsp;</span>
          <button class="btn btn-secondary btn-sm" id="pvpNext" disabled>${renderHTML(t('playlist.preview_next'))} ›</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  const stage = overlay.querySelector('#pvpStage');
  const frame = overlay.querySelector('#pvpFrame');
  frameDeviceOutput(stage, frame, orientation);
  const btnL = overlay.querySelector('#pvpLandscape');
  const btnP = overlay.querySelector('#pvpPortrait');
  const btnPrev = overlay.querySelector('#pvpPrev');
  const btnNext = overlay.querySelector('#pvpNext');
  const position = overlay.querySelector('#pvpPosition');

  // #239: skip/next. The preview already IS the real player in device-free preview mode, so the
  // control is a message to that one iframe rather than a second copy of the playback logic.
  // Addressing frame.contentWindow (not a broadcast) and pinning targetOrigin to our own origin is
  // what keeps this off any real screen: a live display holds a socket to the server and is not
  // reachable from this page at all, and the preview player itself ignores the message unless it
  // booted with ?preview=1.
  const send = (action) => {
    try { frame.contentWindow?.postMessage({ source: 'screentinker-preview', action }, window.location.origin); } catch (e) {}
  };
  const onPlayerMessage = (ev) => {
    if (ev.origin !== window.location.origin) return;
    if (ev.source !== frame.contentWindow) return;   // ignore any other frame on the page
    const d = ev.data;
    if (!d || d.source !== 'screentinker-player' || d.type !== 'preview:state') return;
    // A multi-zone playlist plays all zones at once, so there is no single item to step through —
    // showing a counter there would be a lie and the buttons would appear dead.
    if (d.zoned || !d.total) {
      btnPrev.disabled = btnNext.disabled = true;
      bindMessage(position, d.zoned ? t('playlist.preview_zoned') : '');
      return;
    }
    btnPrev.disabled = btnNext.disabled = false;
    bindText(position, 'playlist.preview_position', { current: (d.index >= 0 ? d.index : 0) + 1, total: d.total });
  };
  window.addEventListener('message', onPlayerMessage);
  // The player posts its state as soon as it has content, but an orientation reload restarts it —
  // ask again on every load so the counter can never be left stale from the previous run.
  frame.addEventListener('load', () => send('sync'));

  const setOrientation = (o) => {
    orientation = o;
      // The stage carries the aspect; the frame is rotated inside it (#238).
      stage.style.aspectRatio = aspect();
      frameDeviceOutput(stage, frame, orientation);
      btnPrev.disabled = btnNext.disabled = true;   // reloading: no item until the player says so
      bindMessage(position, '');
    frame.src = frameSrc();
    btnL.className = 'btn btn-sm ' + (o === 'landscape' ? 'btn-primary' : 'btn-secondary');
    btnP.className = 'btn btn-sm ' + (o.startsWith('portrait') ? 'btn-primary' : 'btn-secondary');
  };
  btnL.onclick = () => setOrientation('landscape');
  btnP.onclick = () => setOrientation('portrait');
  btnPrev.onclick = () => send('prev');
  btnNext.onclick = () => send('next');
  // Listeners are on window/document, so they outlive the overlay unless close() takes them with
  // it — a leaked keydown handler would keep firing at a closed preview.
  const close = () => {
    overlay.remove();
    window.removeEventListener('message', onPlayerMessage);
    document.removeEventListener('keydown', onKey);
  };
  function onKey(ev) {
    if (ev.key === 'Escape') close();
    else if (ev.key === 'ArrowRight') send('next');
    else if (ev.key === 'ArrowLeft') send('prev');
  }
  overlay.querySelector('#pvpClose').onclick = close;
  overlay.onclick = (e) => { if (e.target === overlay) close(); };
  document.addEventListener('keydown', onKey);
}

/*
 * A small picture of where this playlist's content actually lands.
 *
 * A playlist has no intrinsic layout — the server derives one from the items' own zone bindings
 * (#104) — so the page could previously show an item tagged "Bottom Ticker" with no indication
 * that the ticker is a thin strip along the bottom. People assigned content to zones by name and
 * found out where it went by looking at a screen.
 *
 * Drawn from the zone percentages, so it is correct for any layout including portrait ones without
 * a stored thumbnail. Zones with no items are dimmed: an empty zone on a real panel shows its
 * background colour, and that is worth seeing BEFORE publishing rather than after.
 */
function layoutMockup(playlist) {
  const layout = playlist && playlist.layout;
  const items = (playlist && playlist.items) || [];

  // No layout means fullscreen — every item shares one frame. Drawing a single empty box would
  // imply a choice was made; say it in words instead.
  if (!layout || !Array.isArray(layout.zones) || layout.zones.length === 0) {
    return `<div style="font-size:12px;color:var(--text-muted);margin-bottom:12px">${renderHTML(t('playlist.layout_fullscreen'))}</div>`;
  }

  const counts = {};
  // 3.0: on a playlist that chose its layout, an item without a zone plays in the main zone.
  for (const it of items) {
    const zid = it.zone_id || (layout.explicit ? layout.main_zone_id : null);
    if (zid) counts[zid] = (counts[zid] || 0) + 1;
  }

  const w = Number(layout.width) || 1920;
  const h = Number(layout.height) || 1080;
  const portrait = h > w;
  // Fixed short edge, long edge derived — a portrait mockup must not be as wide as a landscape one
  // or it dominates the page.
  const boxW = portrait ? 90 : 200;
  const boxH = Math.round(boxW * (h / w));

  const zones = layout.zones.map((z) => {
    const n = counts[z.id] || 0;
    const filled = n > 0;
    return `<div title="${esc(z.name)}${filled ? ` — ${n}` : ''}" style="
      position:absolute;
      left:${z.x_percent}%; top:${z.y_percent}%;
      width:${z.width_percent}%; height:${z.height_percent}%;
      box-sizing:border-box;
      border:1px solid ${filled ? 'var(--accent)' : 'var(--border)'};
      background:${filled ? 'color-mix(in srgb, var(--accent) 18%, transparent)' : 'transparent'};
      display:flex;align-items:center;justify-content:center;
      font-size:9px;line-height:1;color:var(--text-muted);overflow:hidden;
    ">${renderHTML(filled ? n : '')}</div>`;
  }).join('');

  return `
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px">
      <div style="position:relative;width:${boxW}px;height:${boxH}px;background:var(--bg-primary);border:1px solid var(--border);border-radius:4px;flex:none">
        ${renderHTML(zones)}
      </div>
      <div style="font-size:12px;color:var(--text-muted)">
        <div>${uiText(layout.name || '')} · ${renderHTML(w)}×${renderHTML(h)}${renderHTML(portrait ? t('playlist.orientation_portrait') : '')}</div>
        <div>${renderHTML(tn('playlist.zones_count', layout.zones.length))}</div>
        ${renderHTML(layout._preview_ambiguous ? `<div style="color:var(--warning)">${renderHTML(t('playlist.layout_ambiguous'))}</div>` : '')}
      </div>
    </div>`;
}

function renderDetailContent(container, playlist) {
  const isDraft = playlist.status === 'draft';
  const hasPublished = !!playlist.published_snapshot;
  currentPlaybackOrder = playlist.playback_order || 'sequential';
  // Head office: keep what the last render learnt about this playlist's slots, so a re-render after
  // every edit does not flash slot rows back to their bare form while the details reload.
  const corpMode = playlist.corporate ? 'corporate' : playlist.corporate_slot ? 'fill' : null;
  const prev = corpEditor && corpEditor.playlistId === playlist.id ? corpEditor : null;
  corpEditor = corpMode ? { ...(prev || {}), mode: corpMode, playlistId: playlist.id, slots: (prev && prev.slots) || new Map() } : null;

  container.innerHTML = `
    ${renderHTML(isDraft ? `
    <div id="draftBanner" style="position:sticky;top:0;z-index:50;background:#78350f;border:1px solid #92400e;border-radius:var(--radius-lg);padding:14px 20px;margin-bottom:16px;display:flex;align-items:center;justify-content:space-between;gap:16px;box-shadow:0 6px 16px rgba(0,0,0,0.4)">
      <div style="display:flex;align-items:center;gap:10px;color:#fbbf24">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
        <div>
          <div style="font-weight:600;font-size:14px">${renderHTML(t('playlist.draft.banner_title'))}</div>
          <div style="font-size:12px;color:#fcd34d;opacity:0.85">${renderHTML(hasPublished ? t('playlist.draft.devices_showing_published') : corpMode === 'fill' ? t('corp.fill.never_published') : t('playlist.draft.never_published'))}</div>
        </div>
      </div>
      <div style="display:flex;gap:8px;flex-shrink:0">
        ${renderHTML(hasPublished ? `<button class="btn btn-secondary btn-sm" id="discardDraftBtn" style="color:#fbbf24;border-color:#92400e">${renderHTML(t('playlist.draft.discard_changes'))}</button>` : '')}
        <button class="btn btn-sm" id="publishBtn" style="background:#f59e0b;color:#000;font-weight:600;border:none">${renderHTML(t('playlist.draft.publish'))}</button>
      </div>
    </div>
    ` : '')}

    <div class="page-header">
      <div style="display:flex;align-items:center;gap:12px">
        <a href="#/playlists" style="color:var(--text-muted);text-decoration:none;font-size:20px" title="${t('playlist.back')}" data-fil-i18n-title="${binding('playlist.back', undefined)}">&larr;</a>
        <div>
          <h1 id="playlistTitle" style="cursor:pointer" title="${t('playlist.click_to_rename')}" data-fil-i18n-title="${binding('playlist.click_to_rename', undefined)}">${uiText(playlist.name)}</h1>
          <div class="subtitle" id="playlistDesc" style="cursor:pointer" title="${t('playlist.click_to_edit_desc')}" data-fil-i18n-title="${binding('playlist.click_to_edit_desc', undefined)}">${renderHTML(playlist.description ? esc(playlist.description) : `<span style="opacity:0.5">${renderHTML(t('playlist.add_desc_placeholder'))}</span>`)}</div>
          ${renderHTML(playlist.display_count ? `<div style="font-size:12px;color:var(--text-muted);margin-top:4px">${renderHTML(tn('playlist.assigned_to', playlist.display_count))}</div>` : '')}
        </div>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <!-- Delete FIRST, away from the far right. Publish sits at the right end of the draft banner
             above; publishing removes the banner and this row moves up into its place, so whatever
             is rightmost here ends up under the cursor that just clicked Publish. A quick double
             click used to land on Delete. Keep the destructive button at the other end. -->
        <button class="btn btn-secondary" id="deletePlaylistBtn" style="color:var(--danger);margin-right:8px">${renderHTML(t('playlist.delete_playlist'))}</button>
        <button class="btn btn-secondary" id="previewPlaylistBtn">${renderHTML(t('widget.preview'))}</button>
        ${renderHTML(playlist.smart_rules
          ? `<button class="btn btn-primary" id="editRulesBtn">${renderHTML(t('smart.edit_rules'))}</button>`
          : `${renderHTML(playlist.corporate || playlist.corporate_slot || (playlist.layout && playlist.layout.explicit) ? '' : `<button class="btn btn-secondary" id="addLayoutItemBtn" data-advanced-ui title="${esc(t('campaign.add_hint'))}" data-fil-i18n-title="${binding('campaign.add_hint', undefined)}">${uiText(t('campaign.add_btn'))}</button>`)}<button class="btn btn-secondary" id="addHoldBtn">${uiText(t('playlist.add_hold'))}</button><button class="btn btn-primary" id="addItemBtn">${renderHTML(t('playlist.add_content'))}</button>`)}
        ${renderHTML(corpMode === 'corporate' ? `<button class="btn btn-secondary" id="addSlotBtn" style="display:none">+ ${uiText(t('corp.hq.add_slot'))}</button>` : '')}
      </div>
    </div>
    <div id="playlistApprovalBar" style="margin:-8px 0 12px"></div>
    ${renderHTML(corpMode ? `<div id="corpEditorBar"></div>` : '')}

    <!-- Step 3 sends you here by creating a playlist, and this is where you fill it. Losing the
         checklist at exactly this hop is what made the flow feel like it ended. -->
    <div id="gettingStarted"></div>

    ${renderHTML(campaignBannerHtml(playlist))}
    ${renderHTML(layoutPickerHtml(playlist))}
    ${renderHTML((playlist.items || []).some((it) => it.layout_ref_id) ? '' : layoutMockup(playlist))}
    
    <!-- #319: reordering was one-step-at-a-time only. A playlist of 160 photos spanning several
         screens made "put these in filename order" a manual, error-prone job. -->
    <div id="playlistSortBar" style="display:none;align-items:center;gap:8px;margin-bottom:10px">
      <span style="font-size:13px;color:var(--text-muted)">${renderHTML(t('playlist.sort_label'))}</span>
      <select id="playlistSort" class="input" style="width:auto;background:var(--bg-input)">
        <option value="">${renderHTML(t('playlist.sort.manual'))}</option>
        <option value="name_asc">${renderHTML(t('playlist.sort.name_asc'))}</option>
        <option value="name_desc">${renderHTML(t('playlist.sort.name_desc'))}</option>
        <option value="date_desc">${renderHTML(t('playlist.sort.date_desc'))}</option>
        <option value="date_asc">${renderHTML(t('playlist.sort.date_asc'))}</option>
        <option value="duration_asc">${renderHTML(t('playlist.sort.duration_asc'))}</option>
        <option value="duration_desc">${renderHTML(t('playlist.sort.duration_desc'))}</option>
      </select>
      <button class="btn btn-secondary btn-sm" id="playlistSortApply">${renderHTML(t('playlist.sort_apply'))}</button>
      <span style="width:12px"></span>
      ${renderHTML('')}
      <span style="font-size:13px;color:var(--text-muted);${corpMode === 'fill' ? 'display:none' : ''}">${renderHTML(t('playlist.order_label'))}</span>
      <select id="playlistOrder" class="input" style="width:auto;background:var(--bg-input);${corpMode === 'fill' ? 'display:none' : ''}">
        <option value="sequential" ${playlist.playback_order === 'sequential' || !playlist.playback_order ? 'selected' : ''}>${renderHTML(t('playlist.order.sequential'))}</option>
        <option value="shuffle" ${playlist.playback_order === 'shuffle' ? 'selected' : ''}>${renderHTML(t('playlist.order.shuffle'))}</option>
        <option value="weighted" ${playlist.playback_order === 'weighted' ? 'selected' : ''}>${renderHTML(t('playlist.order.weighted'))}</option>
      </select>
    </div>
    ${renderHTML(playlist.smart_rules ? `<div id="smartPanel" style="background:var(--bg-card);border:1px solid #4338ca;border-radius:var(--radius);padding:12px 16px;margin-bottom:10px"></div>` : '')}
    <div id="playlistSelectBar" style="display:none;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:10px;padding:8px 10px;background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius)">
    </div>
    <div id="playlistItems" style="display:flex;flex-direction:column;gap:8px">
    </div>
  `;

  currentLayout = playlist.layout || null;
  if (playlist.smart_rules) renderSmart(playlist);
  else renderItems(playlist.items || []);
  mountLayoutPicker(playlist, () => refreshAfterMutation());
  if (corpMode) mountCorporateEditor(container, playlist);

  renderApprovalBar(document.getElementById('playlistApprovalBar'), {
    type: 'playlist', id: playlist.id, name: playlist.name,
    onChanged: async () => { try { renderDetailContent(container, await api.getPlaylist(playlist.id)); } catch {} },
  });
  const publishBtn = document.getElementById('publishBtn');
  if (publishBtn) {
    publishBtn.addEventListener('click', async () => {
      try {
        publishBtn.disabled = true;
        // 3.0 accessibility: list errors/warnings first, with "Publish anyway".
        if (!(await confirmAccessibility('playlist', playlist.id))) { publishBtn.disabled = false; return; }
        bindText(publishBtn, 'playlist.draft.publishing', undefined);
        const updated = await api.publishPlaylist(playlist.id);
        showToast(t('playlist.toast.published'));
        // Only GET /:id resolves a smart playlist's matches, and decorates head office's playlist and a
        // slot's content (corporate_slot); the publish response is the bare row.
        renderDetailContent(container, updated.smart_rules || playlist.corporate || playlist.corporate_slot ? await api.getPlaylist(playlist.id) : updated);
      } catch (err) {
        publishBtn.disabled = false;
        bindText(publishBtn, 'playlist.draft.publish', undefined);
        showToast(errorMessage(err), 'error');
      }
    });
  }
  const previewBtn = document.getElementById('previewPlaylistBtn');
  if (previewBtn) previewBtn.addEventListener('click', () => showPlaylistPreview(playlist));

  const discardBtn = document.getElementById('discardDraftBtn');
  if (discardBtn) {
    discardBtn.addEventListener('click', async () => {
      if (!confirm(t('playlist.confirm_discard_draft'))) return;
      try {
        const updated = await api.discardPlaylistDraft(playlist.id);
        showToast(t('playlist.toast.draft_discarded'));
        renderDetailContent(container, updated.smart_rules || playlist.corporate || playlist.corporate_slot ? await api.getPlaylist(playlist.id) : updated);
      } catch (err) {
        showToast(errorMessage(err), 'error');
      }
    });
  }

  document.getElementById('playlistTitle').addEventListener('click', () => inlineEdit(playlist, 'name'));
  document.getElementById('playlistDesc').addEventListener('click', () => inlineEdit(playlist, 'description'));

  document.getElementById('addItemBtn')?.addEventListener('click', () => showAddItemModal(playlist.id));
  document.getElementById('addHoldBtn')?.addEventListener('click', (e) => showAddHoldModal(playlist.id, e.currentTarget));
  // 3.0 campaigns: a whole layout as an item.
  document.getElementById('addLayoutItemBtn')?.addEventListener('click', async () => {
    if (await openLayoutItemDialog(playlist)) refreshAfterMutation();
  });
  document.getElementById('editRulesBtn')?.addEventListener('click', () => {
    openSmartRulesModal({
      title: t('smart.title_edit', { name: playlist.name }),
      // ⚠️ Never the defaults while real rules exist: saving them would overwrite the playlist.
      initial: (playlist.smart && playlist.smart.rules) || parseStoredRules(playlist.smart_rules) || DEFAULT_RULES,
      onSave: async (rules) => {
        await api.updatePlaylist(playlist.id, { smart_rules: rules });
        showToast(t('smart.toast.saved'), 'info');
        try { renderDetailContent(container, await api.getPlaylist(playlist.id)); } catch { /* saved; the next load shows it */ }
      },
    });
  });

  /*
   * #319: sort the whole playlist in one go.
   *
   * Computed here and sent to the existing reorder route, which takes the finished order — the
   * server does not need to learn about sort modes, and the operator can still drag afterwards,
   * because the result is ordinary sort_order values rather than a stored sort rule. Widgets and
   * nested playlists have no filename or duration of their own, so they keep their relative order
   * and settle after the content rather than being scattered by a comparator that cannot see them.
   */
  document.getElementById('playlistSortApply')?.addEventListener('click', async () => {
    const mode = document.getElementById('playlistSort')?.value;
    if (!mode) return;
    const btn = document.getElementById('playlistSortApply');
    const items = (currentPlaylistItems || []).slice();
    if (items.length < 2) return;

    const key = (i) => ({
      name: (i.filename || i.widget_name || i.child_playlist_name || '').toLocaleLowerCase(getLocale()),
      when: Number(i.created_at) || 0,
      dur: Number(i.duration_sec) || Number(i.content_duration) || 0,
    });
    const sortable = (i) => !!i.content_id;
    const content = items.filter(sortable);
    const rest = items.filter((i) => !sortable(i));
    const cmp = {
      name_asc:      (a, b) => key(a).name.localeCompare(key(b).name, getLocale(), { numeric: true }),
      name_desc:     (a, b) => key(b).name.localeCompare(key(a).name, getLocale(), { numeric: true }),
      date_asc:      (a, b) => key(a).when - key(b).when,
      date_desc:     (a, b) => key(b).when - key(a).when,
      duration_asc:  (a, b) => key(a).dur - key(b).dur,
      duration_desc: (a, b) => key(b).dur - key(a).dur,
    }[mode];
    if (!cmp) return;
    content.sort(cmp);
    const order = content.concat(rest).map((i) => i.id);

    try {
      btn.disabled = true;
      const updated = await api.reorderPlaylistItems(currentPlaylistId, order);
      renderItems(updated);
      refreshAfterMutation();
      showToast(t('playlist.toast.sorted'), 'success');
    } catch (err) {
      showToast(errorMessage(err), 'error');
    } finally {
      btn.disabled = false;
    }
  });

  document.getElementById('playlistOrder')?.addEventListener('change', async (e) => {
    const order = e.target.value;
    if (!order || order === (playlist.playback_order || 'sequential')) return;
    try {
      e.target.disabled = true;
      await api.updatePlaylist(playlist.id, { playback_order: order });
      currentPlaybackOrder = order;
      showToast(t('playlist.bulk.updated', {n: '1'}));
      refreshAfterMutation();
    } catch (err) {
      showToast(errorMessage(err), 'error');
      e.target.value = playlist.playback_order || 'sequential';
    } finally {
      e.target.disabled = false;
    }
  });

  /*
   * The checklist follows the user into the playlist they just made.
   *
   * ⚠️ THE STEP MEANS SOMETHING DIFFERENT HERE. On the list page step 3 is "create a playlist";
   * standing inside an empty one it is "put something in THIS playlist" — so the action opens the
   * add-content modal rather than the new-playlist dialog, and ctaFor relabels the button to match.
   * Same step, same action, the honest verb for where you are standing.
   */
  gettingStarted.mount(document.getElementById('gettingStarted'), {
    onAction: (a) => {
      if (a === 'new-playlist') {
        if (playlist.smart_rules) document.getElementById('editRulesBtn')?.click();
        else showAddItemModal(playlist.id);
        return true;
      }
      return false;
    },
    ctaFor: { playlist: t('gs.playlist.cta_here') },
  }).catch(() => {});

  // A slot's content: "delete" means "this level goes back to the next level's content or head
  // office's fallback" — say so, with the screens it changes, as the head office page does.
  if (playlist.corporate_slot) {
    const delBtn = document.getElementById('deletePlaylistBtn');
    bindText(delBtn, 'corp.slot.remove_level', undefined);
    delBtn.addEventListener('click', async () => {
      const cs = playlist.corporate_slot;
      const f = (corpEditor && corpEditor.mode === 'fill' && corpEditor.fill) || {};
      const ok = await cui.ask({
        title: t('corp.slot.remove_level'), confirmLabel: t('corp.slot.remove_level'), danger: true,
        text: tn('corp.slot.remove_level_confirm', f.screens || 0, { level: cui.levelLabel(f.scope_kind || cs.scope_kind, f.scope_name) }),
      });
      if (!ok) return;
      try {
        await api.deleteFill(cs.fill_id);
        showToast(t('corp.slot.level_removed'), 'success');
        window.location.hash = '#/corporate';
      } catch (err) { showToast(errorMessage(err), 'error'); }
    });
    return;
  }
  document.getElementById('deletePlaylistBtn').addEventListener('click', async () => {
    if (!confirm(t('playlist.confirm_delete', { name: playlist.name }))) return;
    try {
      await api.deletePlaylist(playlist.id);
      showToast(t('playlist.toast.deleted'));
      window.location.hash = '#/playlists';
    } catch (err) {
      showToast(errorMessage(err), 'error');
    }
  });
}

async function refreshAfterMutation() {
  if (!currentPlaylistId) return;
  const mainContainer = document.getElementById('draftBanner')?.parentElement || document.querySelector('.page-header')?.parentElement;
  if (!mainContainer) return;
  try {
    const playlist = await api.getPlaylist(currentPlaylistId);
    renderDetailContent(mainContainer, playlist);
  } catch (e) { /* silent */ }
}

function selectedRows() {
  return currentPlaylistItems.filter((it) => selectedItemIds.has(String(it.id)));
}
function clipPayload(items) {
  return items.map((it) => ({
    content_id: it.content_id || null,
    widget_id: it.widget_id || null,
    child_playlist_id: it.child_playlist_id || null,
    zone_id: it.zone_id || null,
    duration_sec: it.duration_sec,
    muted: it.muted ? 1 : 0,
    play_from: it.play_from || null,
    play_until: it.play_until || null,
    enabled: it.enabled === 0 ? 0 : 1,
    log_play: it.log_play === 0 ? 0 : 1,
    fit_mode: it.fit_mode || null,
    play_when: it.play_when || null,
    weight: it.weight || 1,
    repeat_every_sec: it.repeat_every_sec || null,
    play_to_end: it.play_to_end ? 1 : null,
    schedules: it.schedules || [],
  }));
}
function setClip(items) {
  // Returns whether the write actually landed — cut relies on this so it never deletes into a void
  // (private mode / quota / disabled storage) and loses the items.
  try {
    sessionStorage.setItem(CLIP_KEY, JSON.stringify(items));
    return sessionStorage.getItem(CLIP_KEY) != null;
  } catch { return false; }
}
function getClip() {
  try { return JSON.parse(sessionStorage.getItem(CLIP_KEY) || 'null'); } catch { return null; }
}

// Field paths a data source offers, derived from its last-fetched values (top level + one nesting).
function fieldPathsOf(data) {
  const out = [];
  if (!data || typeof data !== 'object' || Array.isArray(data)) return out;
  for (const [k, v] of Object.entries(data)) {
    out.push(k);
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      for (const k2 of Object.keys(v)) out.push(`${k}.${k2}`);
    }
  }
  return out.slice(0, 100);
}

// The condition editor: data-source, tag, or metadata. Real dropdowns, validated before send.
async function editConditionModal(ids, parsed) {
  let sources = [];
  try { sources = await api.getDataSources(); } catch { sources = []; }
  const OPS = [['eq', t('playlist.condition.equal')], ['neq', t("ui.playlists.not_equal_85e993")], ['gt', t('playlist.condition.greater')],
    ['gte', t("ui.playlists.at_least_d34749")], ['lt', t('playlist.condition.less')], ['lte', t("ui.playlists.at_most_954546")], ['truthy', t("ui.playlists.is_set_true_6fbb8c")]];
  const curType = (parsed && parsed.type) || (parsed && parsed.slug ? 'ds' : 'ds');
  const curOp = (parsed && parsed.op) || (curType === 'tag' ? 'has' : 'eq');
  const opts = sources.map((s) => `<option value="${esc(s.slug)}" ${parsed && parsed.slug === s.slug ? 'selected' : ''}>${uiText(s.name || s.slug)}</option>`).join('');
  const opOpts = OPS.map(([v, l]) => `<option value="${v}" ${curOp === v ? 'selected' : ''}>${uiText(l)}</option>`).join('');

  const modal = document.createElement('div');
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;z-index:1000';
  modal.innerHTML = `
    <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius-lg);padding:24px;width:440px;max-width:92vw">
      <h3 style="margin-bottom:6px;color:var(--text-primary)">${uiText(t('playlist.bulk.condition'))}</h3>
      <p style="font-size:12px;color:var(--text-muted);margin-bottom:16px">${uiText(t('playlist.condition.hint'))}</p>
      <label style="font-size:12px;color:var(--text-muted)">${uiText(t('playlist.condition.type'))}</label>
      <select id="condType" class="input" style="width:100%;margin:4px 0 12px">
        <option value="ds" ${curType === 'ds' || !parsed ? 'selected' : ''}>${uiText(t('playlist.condition.type_ds'))}</option>
        <option value="tag" ${curType === 'tag' ? 'selected' : ''}>${uiText(t('playlist.condition.type_tag'))}</option>
        <option value="meta" ${curType === 'meta' ? 'selected' : ''}>${uiText(t('playlist.condition.type_meta'))}</option>
        <option value="weather" ${curType === 'weather' ? 'selected' : ''}>${uiText(t('playlist.condition.type_weather'))}</option>
        <option value="geo" ${curType === 'geo' ? 'selected' : ''}>${uiText(t('playlist.condition.type_geo'))}</option>
      </select>
      <div id="condWeatherWrap" hidden>
        <p style="font-size:12px;color:var(--text-muted);margin-bottom:8px">${uiText(t('playlist.condition.weather_hint'))}</p>
        <select id="condWxField" class="input" style="width:100%;margin:4px 0 12px">
          <option value="condition" ${!parsed || parsed.field !== 'temperature' ? 'selected' : ''}>${uiText(t('playlist.condition.wx_condition'))}</option>
          <option value="temperature" ${parsed && parsed.field === 'temperature' ? 'selected' : ''}>${uiText(t('playlist.condition.wx_temperature'))}</option>
        </select>
        <div id="condWxCondWrap" style="display:flex;gap:8px">
          <select id="condWxCondOp" class="input" style="flex:1"><option value="eq" ${!parsed || parsed.op !== 'neq' ? 'selected' : ''}>${uiText(t('playlist.condition.wx_is'))}</option><option value="neq" ${parsed && parsed.op === 'neq' ? 'selected' : ''}>${uiText(t('playlist.condition.wx_is_not'))}</option></select>
          <select id="condWxCondValue" class="input" style="flex:2">${renderHTML(['clear', 'cloudy', 'rain', 'snow', 'storm', 'fog'].map((g) => `<option value="${g}" ${parsed && parsed.type === 'weather' && parsed.value === g ? 'selected' : ''}>${uiText(t(`playlist.condition.wx.${g}`))}</option>`).join(''))}</select>
        </div>
        <div id="condWxTempWrap" style="display:flex;gap:8px" hidden>
          <select id="condWxTempOp" class="input" style="flex:1">${renderHTML([['gt', '>'], ['gte', '≥'], ['lt', '<'], ['lte', '≤']].map(([v, l]) => `<option value="${v}" ${parsed && parsed.type === 'weather' && parsed.op === v ? 'selected' : ''}>${uiText(l)}</option>`).join(''))}</select>
          <input id="condWxTempValue" type="number" class="input" style="flex:1" value="${esc(parsed && parsed.type === 'weather' && parsed.field === 'temperature' ? String(parsed.value) : '20')}">
          <select id="condWxUnits" class="input" style="flex:1"><option value="c" ${!parsed || parsed.units !== 'f' ? 'selected' : ''}>°C</option><option value="f" ${parsed && parsed.units === 'f' ? 'selected' : ''}>°F</option></select>
        </div>
      </div>
      <div id="condGeoWrap" hidden>
        <p style="font-size:12px;color:var(--text-muted);margin-bottom:8px">${uiText(t('playlist.condition.geo_hint'))}</p>
        <div style="display:flex;gap:8px;margin-bottom:8px">
          <select id="condGeoOp" class="input" style="flex:1"><option value="within" ${!parsed || parsed.op !== 'outside' ? 'selected' : ''}>${uiText(t('playlist.condition.geo_within'))}</option><option value="outside" ${parsed && parsed.op === 'outside' ? 'selected' : ''}>${uiText(t('playlist.condition.geo_outside'))}</option></select>
          <input id="condGeoRadius" type="number" min="1" class="input" style="width:90px" value="${esc(parsed && parsed.type === 'geo' ? String(parsed.radius_km) : '25')}"> <span style="align-self:center;font-size:13px">${renderHTML(t("ui.playlists.km"))}</span>
        </div>
        <input id="condGeoSearch" class="input" style="width:100%;margin-bottom:6px" placeholder="${esc(t('playlist.condition.geo_search'))}" data-fil-i18n-placeholder="${binding('playlist.condition.geo_search', undefined)}" value="${esc(parsed && parsed.type === 'geo' ? (parsed.label || '') : '')}">
        <div id="condGeoResults" style="display:flex;flex-direction:column;gap:4px;margin-bottom:8px"></div>
        <div id="condGeoPoint" style="font-size:12px;color:var(--text-muted);margin-bottom:12px">${renderHTML(parsed && parsed.type === 'geo' ? esc(`${parsed.lat}, ${parsed.lon}`) : '')}</div>
      </div>
      <div id="condDsWrap">
        ${renderHTML(sources.length ? '' : `<p style="color:#fbbf24;font-size:13px;margin-bottom:12px">${uiText(t('playlist.condition.no_sources'))}</p>`)}
        <label style="font-size:12px;color:var(--text-muted)">${uiText(t('playlist.condition.slug'))}</label>
        <select id="condSlug" class="input" style="width:100%;margin:4px 0 12px">${renderHTML(opts)}</select>
        <label style="font-size:12px;color:var(--text-muted)">${uiText(t('playlist.condition.path'))}</label>
        <input id="condPath" class="input" list="condFields" ${translatedAttribute("placeholder", "ui.playlists.placeholder_e_g_status_or_now_title_438736")} value="${esc(parsed && !['tag', 'meta', 'weather', 'geo'].includes(parsed.type) ? (parsed.path || '') : '')}" style="width:100%;margin:4px 0 12px">
        <datalist id="condFields"></datalist>
        <label style="font-size:12px;color:var(--text-muted)">${uiText(t('playlist.condition.op'))}</label>
        <select id="condOp" class="input" style="width:100%;margin:4px 0 12px">${renderHTML(opOpts)}</select>
        <div id="condValueWrap">
          <label style="font-size:12px;color:var(--text-muted)">${uiText(t('playlist.condition.value'))}</label>
          <input id="condValue" class="input" value="${esc(parsed && !['tag', 'meta', 'weather', 'geo'].includes(parsed.type) && parsed.value != null ? String(parsed.value) : '')}" style="width:100%;margin:4px 0 12px">
        </div>
      </div>
      <div id="condTagWrap" hidden>
        <label style="font-size:12px;color:var(--text-muted)">${uiText(t('playlist.condition.op'))}</label>
        <select id="condTagOp" class="input" style="width:100%;margin:4px 0 12px">
          <option value="has" ${curOp !== 'lacks' ? 'selected' : ''}>${uiText(t('playlist.condition.tag_has'))}</option>
          <option value="lacks" ${curOp === 'lacks' ? 'selected' : ''}>${uiText(t('playlist.condition.tag_lacks'))}</option>
        </select>
        <label style="font-size:12px;color:var(--text-muted)">${uiText(t('playlist.condition.tag'))}</label>
        <input id="condTagValue" class="input" value="${esc(parsed && parsed.type === 'tag' && parsed.value ? String(parsed.value) : '')}" placeholder="${esc(t('content.tags_placeholder'))}" data-fil-i18n-placeholder="${binding('content.tags_placeholder', undefined)}" style="width:100%;margin:4px 0 12px">
      </div>
      <div id="condMetaWrap" hidden>
        <label style="font-size:12px;color:var(--text-muted)">${uiText(t('playlist.condition.path'))}</label>
        <input id="condMetaPath" class="input" value="${esc(parsed && parsed.type === 'meta' ? (parsed.path || '') : '')}" ${translatedAttribute("placeholder", "ui.playlists.placeholder_e_g_dept_f80d89")} style="width:100%;margin:4px 0 12px">
        <label style="font-size:12px;color:var(--text-muted)">${uiText(t('playlist.condition.op'))}</label>
        <select id="condMetaOp" class="input" style="width:100%;margin:4px 0 12px">${renderHTML(OPS.map(([v, l]) => `<option value="${v}" ${parsed && parsed.type === 'meta' && curOp === v ? 'selected' : ''}>${uiText(l)}</option>`).join(''))}</select>
        <div id="condMetaValueWrap">
          <label style="font-size:12px;color:var(--text-muted)">${uiText(t('playlist.condition.value'))}</label>
          <input id="condMetaValue" class="input" value="${esc(parsed && parsed.type === 'meta' && parsed.value != null ? String(parsed.value) : '')}" style="width:100%;margin:4px 0 12px">
        </div>
      </div>
      <div style="display:flex;gap:8px;justify-content:space-between;margin-top:8px">
        <button class="btn btn-secondary" id="condClear">${uiText(t('playlist.condition.clear'))}</button>
        <div style="display:flex;gap:8px">
          <button class="btn btn-secondary" id="condCancel">${uiText(t('common.cancel'))}</button>
          <button class="btn btn-primary" id="condApply">${uiText(t('playlist.bulk.apply'))}</button>
        </div>
      </div>
    </div>`;
  document.body.appendChild(modal);

  const typeSel = modal.querySelector('#condType');
  const dsWrap = modal.querySelector('#condDsWrap');
  const tagWrap = modal.querySelector('#condTagWrap');
  const metaWrap = modal.querySelector('#condMetaWrap');
  const wxWrap = modal.querySelector('#condWeatherWrap');
  const geoWrap = modal.querySelector('#condGeoWrap');
  const showType = () => {
    const ty = typeSel.value;
    dsWrap.hidden = ty !== 'ds';
    tagWrap.hidden = ty !== 'tag';
    metaWrap.hidden = ty !== 'meta';
    wxWrap.hidden = ty !== 'weather';
    geoWrap.hidden = ty !== 'geo';
  };
  const wxField = modal.querySelector('#condWxField');
  const showWx = () => { modal.querySelector('#condWxCondWrap').hidden = wxField.value !== 'condition'; modal.querySelector('#condWxTempWrap').hidden = wxField.value !== 'temperature'; };
  wxField.addEventListener('change', showWx); showWx();
  // Area: search a place and take its coordinates as the centre.
  let geoPoint = parsed && parsed.type === 'geo' ? { lat: parsed.lat, lon: parsed.lon, label: parsed.label || '' } : null;
  const geoSearch = modal.querySelector('#condGeoSearch');
  const geoResults = modal.querySelector('#condGeoResults');
  let geoTimer = null;
  geoSearch.addEventListener('input', () => {
    clearTimeout(geoTimer);
    geoTimer = setTimeout(async () => {
      const q = geoSearch.value.trim();
      if (q.length < 2) { geoResults.innerHTML = ''; return; }
      try {
        const rows = await api.get(`/devices/geocode?q=${encodeURIComponent(q)}`);
        geoResults.innerHTML = rows.map((r, i) => `<button type="button" class="btn btn-secondary btn-sm" data-geo-i="${i}" style="text-align:left">${uiText([r.name, r.region, r.country].filter(Boolean).join(', '))}</button>`).join('');
        geoResults.querySelectorAll('[data-geo-i]').forEach((b) => b.addEventListener('click', () => {
          const r = rows[Number(b.dataset.geoI)];
          geoPoint = { lat: r.latitude, lon: r.longitude, label: [r.name, r.region, r.country].filter(Boolean).join(', ') };
          geoSearch.value = geoPoint.label; geoResults.innerHTML = '';
          bindMessage(modal.querySelector('#condGeoPoint'), `${r.latitude}, ${r.longitude}`);
        }));
      } catch (e) { geoResults.innerHTML = `<span style="font-size:12px;color:var(--danger)">${uiText((errorMessage(e)))}</span>`; }
    }, 300);
  });
  typeSel.addEventListener('change', showType);
  showType();

  const slugSel = modal.querySelector('#condSlug');
  const fieldList = modal.querySelector('#condFields');
  const opSel = modal.querySelector('#condOp');
  const valWrap = modal.querySelector('#condValueWrap');
  const bySlug = new Map(sources.map((s) => [s.slug, s]));
  const refreshFields = () => {
    const src = bySlug.get(slugSel.value);
    fieldList.innerHTML = fieldPathsOf(src && src.data).map((p) => `<option value="${esc(p)}">`).join('');
  };
  const refreshValue = () => { valWrap.hidden = opSel.value === 'truthy'; };
  slugSel.addEventListener('change', refreshFields);
  opSel.addEventListener('change', refreshValue);
  refreshFields(); refreshValue();
  const metaOp = modal.querySelector('#condMetaOp');
  const metaValWrap = modal.querySelector('#condMetaValueWrap');
  metaOp.addEventListener('change', () => { metaValWrap.hidden = metaOp.value === 'truthy'; });
  metaValWrap.hidden = metaOp.value === 'truthy';

  const close = () => modal.remove();
  modal.addEventListener('click', (e) => { if (e.target === modal) close(); });
  modal.querySelector('#condCancel').addEventListener('click', close);
  modal.querySelector('#condClear').addEventListener('click', async () => {
    close(); await runSelection({ action: 'play_when', ids, play_when: null });
    selectedItemIds.clear(); paintSelectBar(); showToast(t('playlist.bulk.updated', {n: ids.length}));
  });
  modal.querySelector('#condApply').addEventListener('click', async () => {
    const ty = typeSel.value;
    let play_when;
    if (ty === 'tag') {
      const value = modal.querySelector('#condTagValue').value.trim().toLowerCase();
      if (!value) { modal.querySelector('#condTagValue').focus(); return; }
      play_when = { type: 'tag', op: modal.querySelector('#condTagOp').value, value };
    } else if (ty === 'weather') {
      play_when = wxField.value === 'temperature'
        ? { type: 'weather', field: 'temperature', op: modal.querySelector('#condWxTempOp').value, value: Number(modal.querySelector('#condWxTempValue').value), units: modal.querySelector('#condWxUnits').value }
        : { type: 'weather', field: 'condition', op: modal.querySelector('#condWxCondOp').value, value: modal.querySelector('#condWxCondValue').value };
    } else if (ty === 'geo') {
      if (!geoPoint) { geoSearch.focus(); return; }
      play_when = { type: 'geo', op: modal.querySelector('#condGeoOp').value, lat: geoPoint.lat, lon: geoPoint.lon, radius_km: Number(modal.querySelector('#condGeoRadius').value) || 25, label: geoPoint.label };
    } else if (ty === 'meta') {
      const path = modal.querySelector('#condMetaPath').value.trim();
      const op = metaOp.value;
      if (!path) { modal.querySelector('#condMetaPath').focus(); return; }
      play_when = { type: 'meta', path, op, value: op === 'truthy' ? '' : modal.querySelector('#condMetaValue').value };
    } else {
      const slug = slugSel.value;
      const path = modal.querySelector('#condPath').value.trim();
      const op = opSel.value;
      const value = op === 'truthy' ? '' : modal.querySelector('#condValue').value;
      if (!slug) { showToast(t('playlist.condition.no_sources'), 'error'); return; }
      if (!path) { modal.querySelector('#condPath').focus(); return; }
      play_when = { slug, path, op, value };
    }
    close();
    const r = await runSelection({ action: 'play_when', ids, play_when });
    if (r) { showToast(t('playlist.bulk.updated', {n: ids.length})); }
  });
}
function paintSelectBar() {
  const bar = document.getElementById('playlistSelectBar');
  if (!bar) return;
  const n = selectedItemIds.size;
  bar.style.display = currentPlaylistItems.length && !corpIsReadOnly() ? 'flex' : 'none';
  const clip = getClip();
  bar.innerHTML = `
    <label style="display:flex;align-items:center;gap:6px;font-size:13px;color:var(--text-muted);margin:0">
      <input type="checkbox" id="playlistSelectAll" ${n && n === currentPlaylistItems.length ? 'checked' : ''}>
      ${renderHTML(n ? t('playlist.selected', {n: n}) : t('playlist.select_all'))}
    </label>
    <span style="flex:1"></span>
    <button class="btn btn-secondary btn-sm" data-sel="copy" ${n ? '' : 'disabled'}>${renderHTML(t('playlist.bulk.copy'))}</button>
    <button class="btn btn-secondary btn-sm" data-sel="cut" ${n ? '' : 'disabled'}>${renderHTML(t('playlist.bulk.cut'))}</button>
    <button class="btn btn-secondary btn-sm" data-sel="paste" ${clip && clip.length ? '' : 'disabled'}>${renderHTML(t('playlist.bulk.paste'))}</button>
    <button class="btn btn-secondary btn-sm" data-sel="duplicate" ${n ? '' : 'disabled'}>${renderHTML(t('playlist.bulk.duplicate'))}</button>
    <button class="btn btn-secondary btn-sm" data-sel="duration" ${n ? '' : 'disabled'}>${renderHTML(t('playlist.bulk.duration'))}</button>
    <button class="btn btn-secondary btn-sm" data-sel="weight" ${n ? '' : 'disabled'}>${renderHTML(t('playlist.bulk.weight'))}</button>
    <button class="btn btn-secondary btn-sm" data-sel="window" ${n ? '' : 'disabled'}>${renderHTML(t('playlist.bulk.window'))}</button>
    <button class="btn btn-secondary btn-sm" data-sel="validity" ${n ? '' : 'disabled'}>${renderHTML(t('playlist.bulk.validity'))}</button>
    <button class="btn btn-secondary btn-sm" data-sel="activate" ${n ? '' : 'disabled'}>${renderHTML(t('playlist.bulk.activate'))}</button>
    <button class="btn btn-secondary btn-sm" data-sel="deactivate" ${n ? '' : 'disabled'}>${renderHTML(t('playlist.bulk.deactivate'))}</button>
    <button class="btn btn-secondary btn-sm" data-sel="log_on" ${n ? '' : 'disabled'}>${renderHTML(t('playlist.bulk.log_on'))}</button>
    <button class="btn btn-secondary btn-sm" data-sel="log_off" ${n ? '' : 'disabled'}>${renderHTML(t('playlist.bulk.log_off'))}</button>
    <select class="input" id="playlistBulkFit" ${n ? '' : 'disabled'} style="width:auto;background:var(--bg-input);font-size:13px">
      <option value="">${renderHTML(t('playlist.bulk.fit'))}</option>
      <option value="inherit">${renderHTML(t('playlist.bulk.fit_inherit'))}</option>
      <option value="contain">${renderHTML(t('playlist.bulk.fit_contain'))}</option>
      <option value="cover">${renderHTML(t('playlist.bulk.fit_cover'))}</option>
      <option value="fill">${renderHTML(t('playlist.bulk.fit_fill'))}</option>
    </select>
    <button class="btn btn-secondary btn-sm" data-sel="transition" ${n ? '' : 'disabled'}>${renderHTML(t('playlist.bulk.transition'))}</button>
    <button class="btn btn-secondary btn-sm" data-sel="condition" ${n ? '' : 'disabled'}>${uiText(t('playlist.bulk.condition'))}</button>
    <button class="btn btn-sm" data-sel="delete" ${n ? '' : 'disabled'} style="color:var(--danger)">${renderHTML(t('playlist.bulk.delete'))}</button>
  `;
  const all = bar.querySelector('#playlistSelectAll');
  if (all) all.onchange = () => {
    if (all.checked) currentPlaylistItems.forEach((it) => selectedItemIds.add(String(it.id)));
    else selectedItemIds.clear();
    renderItems(currentPlaylistItems);
  };
  bar.querySelector('#playlistBulkFit')?.addEventListener('change', async (e) => {
    const v = e.target.value;
    if (!v || !n) return;
    await runSelection({ action: 'fit_mode', ids: [...selectedItemIds], fit_mode: v === 'inherit' ? null : v });
  });
  bar.querySelectorAll('[data-sel]').forEach((btn) => {
    btn.onclick = () => handleSelection(btn.dataset.sel);
  });
}
function bindSelection(itemsEl, items) {
  itemsEl.querySelectorAll('.item-select').forEach((box) => {
    // A `change` event is not a MouseEvent, so e.shiftKey is undefined there. Capture the modifier
    // from the mouse event that precedes it (mousedown/click both fire before change on a checkbox).
    let shiftHeld = false;
    box.addEventListener('mousedown', (e) => { shiftHeld = e.shiftKey; e.stopPropagation(); });
    box.addEventListener('click', (e) => { shiftHeld = e.shiftKey; e.stopPropagation(); });
    box.addEventListener('keydown', (e) => { shiftHeld = e.shiftKey; }); // keyboard toggle
    box.addEventListener('change', (e) => {
      const id = String(e.target.dataset.itemId);
      const idx = Number(e.target.dataset.index);
      // Anchor is tracked by item id, not index, so it survives a re-sort/re-render.
      const anchorIdx = selectAnchorId != null ? items.findIndex((it) => String(it.id) === selectAnchorId) : -1;
      if (shiftHeld && anchorIdx >= 0) {
        const a = Math.min(anchorIdx, idx);
        const b = Math.max(anchorIdx, idx);
        for (let i = a; i <= b; i++) {
          const it = items[i];
          if (it) selectedItemIds.add(String(it.id));
        }
      } else if (e.target.checked) {
        selectedItemIds.add(id);
        selectAnchorId = id;
      } else {
        selectedItemIds.delete(id);
        selectAnchorId = id;
      }
      paintSelectBar();
      itemsEl.querySelectorAll('.playlist-item').forEach((row) => {
        row.style.borderColor = selectedItemIds.has(String(row.dataset.itemId)) ? 'var(--accent, #3B82F6)' : 'var(--border)';
      });
      itemsEl.querySelectorAll('.item-select').forEach((cb) => {
        cb.checked = selectedItemIds.has(String(cb.dataset.itemId));
      });
    });
  });
}
async function refreshSelection() {
  const playlist = await api.getPlaylist(currentPlaylistId);
  renderItems(playlist.items || []);
  refreshAfterMutation();
}
async function runSelection(body) {
  try {
    const r = await api.playlistSelection(currentPlaylistId, body);
    await refreshSelection();
    return r;
  } catch (err) {
    showToast(errorMessage(err), 'error');
    return null;
  }
}
async function handleSelection(act) {
  const ids = [...selectedItemIds];
  const rows = selectedRows();
  if (act === 'copy') {
    setClip(clipPayload(rows));
    paintSelectBar();
    showToast(t('playlist.bulk.copied', {n: rows.length}));
    return;
  }
  if (act === 'cut') {
    // Never delete unless the clipboard write is confirmed, or a failed write would lose the items.
    if (!setClip(clipPayload(rows))) { showToast(t('playlist.bulk.clip_failed')); return; }
    const r = await runSelection({ action: 'delete', ids });
    if (r) {
      selectedItemIds.clear();
      showToast(t('playlist.bulk.cut_done', {n: rows.length}));
    }
    return;
  }
  if (act === 'paste') {
    const items = getClip();
    if (!items || !items.length) return;
    const r = await runSelection({ action: 'paste', items });
    if (r) showToast(t('playlist.bulk.pasted', {n: r.added || items.length}));
    return;
  }
  if (act === 'delete') {
    if (!ids.length) return;
    const r = await runSelection({ action: 'delete', ids });
    if (r) { selectedItemIds.clear(); showToast(t('playlist.bulk.deleted', {n: r.deleted || ids.length})); }
    return;
  }
  if (act === 'duplicate') {
    const r = await runSelection({ action: 'duplicate', ids });
    if (r) showToast(t('playlist.bulk.updated', {n: r.duplicated || ids.length}));
    return;
  }
  if (act === 'activate') {
    const r = await runSelection({ action: 'enabled', ids, enabled: 1 });
    if (r) showToast(t('playlist.bulk.updated', {n: r.updated || ids.length}));
    return;
  }
  if (act === 'deactivate') {
    // Deactivating every currently-enabled item empties the published snapshot, so the screen falls
    // to its "Nothing scheduled" idle state. Confirm before doing that by accident.
    const enabledCount = currentPlaylistItems.filter((it) => it.enabled !== 0).length;
    const deactivatingEnabled = rows.filter((it) => it.enabled !== 0).length;
    if (deactivatingEnabled >= enabledCount && enabledCount > 0
        && !confirm(t('playlist.bulk.deactivate_all_warn'))) return;
    const r = await runSelection({ action: 'enabled', ids, enabled: 0 });
    if (r) showToast(t('playlist.bulk.updated', {n: r.updated || ids.length}));
    return;
  }
  if (act === 'log_on') {
    const r = await runSelection({ action: 'log_play', ids, log_play: 1 });
    if (r) showToast(t('playlist.bulk.updated', {n: r.updated || ids.length}));
    return;
  }
  if (act === 'log_off') {
    const r = await runSelection({ action: 'log_play', ids, log_play: 0 });
    if (r) showToast(t('playlist.bulk.updated', {n: r.updated || ids.length}));
    return;
  }
  if (act === 'duration') {
    const raw = prompt(t('playlist.bulk.duration'), rows[0] && rows[0].duration_sec || 10);
    if (raw == null) return;
    const d = parseInt(raw, 10);
    if (!d || d < 1) return;
    const r = await runSelection({ action: 'duration', ids, duration_sec: d });
    if (r) showToast(t('playlist.bulk.updated', {n: r.updated || ids.length}));
    return;
  }
  if (act === 'weight') {
    const raw = prompt(t('playlist.bulk.weight'), (rows[0] && rows[0].weight) || 1);
    if (raw == null) return;
    let w = parseInt(raw, 10);
    if (!w || w < 1) return;
    if (w > 1000) { w = 1000; showToast(t('playlist.weight_capped'), 'info'); }
    const r = await runSelection({ action: 'weight', ids, weight: w });
    if (r) showToast(t('playlist.bulk.updated', {n: r.updated || ids.length}));
    return;
  }
  if (act === 'window') {
    const from = prompt(t('playlist.play_from'), (rows[0] && rows[0].play_from) || '');
    if (from == null) return;
    const until = prompt(t('playlist.play_until'), (rows[0] && rows[0].play_until) || '');
    if (until == null) return;
    return runSelection({ action: 'play_window', ids, play_from: from || null, play_until: until || null });
  }
  if (act === 'validity') {
    const first = rows[0];
    if (!first) return;
    showScheduleModal(first, { applyIds: ids });
    return;
  }
  if (act === 'transition') {
    try {
      const widgets = await api.getWidgets();
      const trans = (Array.isArray(widgets) ? widgets : []).filter((w) => w.widget_type === 'transition');
      if (!trans.length) { showToast(t('playlist.bulk.no_transition'), 'error'); return; }
      const w = await pickTransitionWidget(trans);
      if (!w) return;
      return runSelection({ action: 'transition', ids, widget_id: w.id });
    } catch (err) { showToast(errorMessage(err), 'error'); }
    return;
  }
  if (act === 'condition') {
    const cur = rows[0] && rows[0].play_when;
    const parsed = typeof cur === 'string' ? (() => { try { return JSON.parse(cur); } catch { return null; } })() : cur;
    return editConditionModal(ids, parsed);
  }
}

/*
 * The bulk Transition picker: the workspace's transition widgets as a list of choices, in the app's
 * own dialog (corporate-ui openModal) rather than the browser's prompt(), which asked the user to
 * type a number from a list and could not be translated. Radio buttons, so the arrow keys move the
 * choice and Enter applies it; Escape (or Cancel) resolves null and nothing is changed.
 */
function pickTransitionWidget(trans) {
  return new Promise((resolve) => {
    let picked = null;
    const m = cui.openModal({
      title: t('playlist.bulk.transition_title'),
      body: `<p class="corp-help" style="margin-top:0">${uiText(t('playlist.bulk.transition_pick'))}</p>
        <div id="bulkTransList" role="radiogroup" aria-label="${esc(t('playlist.bulk.transition_title'))}" data-fil-i18n-aria-label="${binding('playlist.bulk.transition_title', undefined)}" style="display:flex;flex-direction:column;gap:6px;max-height:50vh;overflow:auto">
          ${renderHTML(trans.map((w, i) => `<label style="display:flex;align-items:center;gap:8px;padding:8px 10px;border:1px solid var(--border);border-radius:6px;cursor:pointer">
            <input type="radio" name="bulkTrans" value="${esc(w.id)}" ${i === 0 ? 'checked' : ''}>
            <span>${uiText(w.name)}</span></label>`).join(''))}
        </div>`,
      footer: `<button type="button" class="btn btn-secondary" data-corp-close>${uiText(t('common.cancel'))}</button>
               <button type="button" class="btn btn-primary" id="bulkTransGo">${uiText(t('playlist.bulk.apply'))}</button>`,
      onClose: () => resolve(picked),
    });
    const apply = () => {
      const sel = m.q('input[name="bulkTrans"]:checked');
      picked = sel ? trans.find((x) => x.id === sel.value) || null : null;
      m.close();
    };
    m.q('#bulkTransGo').addEventListener('click', apply);
    m.q('#bulkTransList').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); apply(); } });
    m.q('#bulkTransList').addEventListener('dblclick', (e) => { if (e.target.closest('label')) apply(); });
    const first = m.q('input[name="bulkTrans"]:checked');
    if (first) first.focus();
  });
}

/*
 * A smart playlist's items come from its rules (server: lib/smart-playlist.js), so the editor shows
 * what they select right now, read-only. Hand-editing is the rules' job, and the item routes refuse it.
 */
function parseStoredRules(raw) {
  if (!raw) return null;
  try { const r = typeof raw === 'string' ? JSON.parse(raw) : raw; return r && Array.isArray(r.rules) ? r : null; } catch { return null; }
}

async function renderSmart(playlist) {
  currentPlaylistItems = [];
  selectedItemIds = new Set();
  const smart = playlist.smart || { rules: null, count: 0, items: [] };
  const sortBar = document.getElementById('playlistSortBar');
  if (sortBar) {
    // Order is the rules' sort; only the playback order (sequential / shuffle) applies here.
    sortBar.style.display = 'flex';
    for (const id of ['playlistSort', 'playlistSortApply']) { const el = document.getElementById(id); if (el) el.style.display = 'none'; }
    const label = sortBar.querySelector('span');
    if (label) label.style.display = 'none';
  }
  const panel = document.getElementById('smartPanel');
  const itemsEl = document.getElementById('playlistItems');
  const folders = smart.rules && smart.rules.rules.some((r) => r.field === 'folder') ? await loadFolders() : [];
  // The folder fetch is async: if the operator has moved on (another playlist, or a newer render of
  // this one), these elements are gone and this render must not paint into whatever replaced them.
  if ((panel && !panel.isConnected) || (itemsEl && !itemsEl.isConnected) || currentPlaylistId !== playlist.id) return;
  if (panel) {
    panel.innerHTML = `
      <div style="font-size:13px;color:#c7d2fe;font-weight:600;margin-bottom:4px">✦ ${renderHTML(t('smart.panel_title'))}</div>
      <div style="font-size:13px;color:var(--text-primary);margin-bottom:4px">${uiText(rulesSummary(smart.rules, folders))}</div>
      <div style="font-size:12px;color:var(--text-muted)">${renderHTML(t('smart.panel_hint'))}</div>`;
  }
  if (!itemsEl) return;
  if (!smart.items.length) {
    itemsEl.innerHTML = `
      <div style="text-align:center;padding:40px;color:var(--text-muted);border:2px dashed var(--border);border-radius:var(--radius-lg)">
        <p style="margin-bottom:8px">${renderHTML(t('smart.empty'))}</p>
        <p style="font-size:13px">${renderHTML(t('smart.empty_hint'))}</p>
      </div>`;
    return;
  }
  itemsEl.innerHTML = `
    <div style="font-size:12px;color:var(--text-muted);margin-bottom:2px">${renderHTML(t('smart.preview_count', { n: smart.count }))}${renderHTML(smart.count > smart.items.length ? displayList([' · ',t('smart.showing_first', { n: smart.items.length })],'') : '')}</div>
    ${renderHTML(smart.items.map((it, i) => `
    <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius);padding:10px 16px;display:flex;align-items:center;gap:12px">
      <div style="color:var(--text-muted);font-size:12px;min-width:24px;text-align:center">${renderHTML(i + 1)}</div>
      <div style="width:48px;height:36px;border-radius:4px;overflow:hidden;background:var(--bg-input);flex-shrink:0;display:flex;align-items:center;justify-content:center">
        ${renderHTML(it.thumbnail_path ? `<img data-auth-src="/api/content/${esc(it.id)}/thumbnail" style="width:100%;height:100%;object-fit:cover">` : `<div style="color:var(--text-muted);opacity:0.5">${renderHTML(getTypeIcon(it))}</div>`)}
      </div>
      <div style="flex:1;min-width:0">
        <div style="font-size:14px;color:var(--text-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${uiText(it.filename)}</div>
        <div style="font-size:12px;color:var(--text-muted)">${uiText(t(`smart.type.${it.type}`))}</div>
      </div>
    </div>`).join(''))}`;
  try { hydrateAuthImages(itemsEl); } catch { /* thumbnails are cosmetic */ }
}

/*
 * "Play every N": weave this item through the loop at about that interval (server:
 * lib/repeat-every.js). Sequential order only; a value that is not one of the presets (set over
 * the API) is still shown, so the select never silently misreports what is stored.
 */
const REPEAT_PRESETS = [30, 60, 120, 300, 600, 900, 1800, 3600];
function repeatLabel(sec) {
  return sec < 60 ? t('repeat.every_sec', { n: sec }) : t('repeat.every_min', { n: Math.round((sec / 60) * 10) / 10 });
}
function repeatSelect(item) {
  const cur = Number(item.repeat_every_sec) || 0;
  const opts = REPEAT_PRESETS.includes(cur) || !cur ? REPEAT_PRESETS : [...REPEAT_PRESETS, cur].sort((a, b) => a - b);
  return `<select class="input item-repeat" data-item-id="${item.id}" title="${esc(t('repeat.hint'))}" data-fil-i18n-title="${binding('repeat.hint', undefined)}" style="width:auto;padding:4px 6px;font-size:12px;${cur ? 'border-color:#6366f1;color:#c7d2fe' : ''}">
    <option value="">${renderHTML(t('repeat.once'))}</option>
    ${renderHTML(opts.map((s) => `<option value="${s}" ${s === cur ? 'selected' : ''}>↻ ${uiText(repeatLabel(s))}</option>`).join(''))}
  </select>`;
}

// #624 "Play to end": YouTube only. With it on, the item moves on when the video ends, and its
// duration is only the fallback for a screen that cannot read the video's length.
function playToEndToggle(item) {
  if (item.mime_type !== 'video/youtube') return '';
  return `<label style="display:flex;align-items:center;gap:4px;font-size:12px;color:var(--text-muted);white-space:nowrap;cursor:pointer" title="${esc(t('playlist.play_to_end_hint'))}" data-fil-i18n-title="${binding('playlist.play_to_end_hint', undefined)}">
    <input type="checkbox" class="item-play-to-end" data-item-id="${item.id}" ${item.play_to_end ? 'checked' : ''}>${uiText(t('playlist.play_to_end'))}</label>`;
}

// 3.0 TV-safe video: the content's "already rotated for portrait screens" switch, on the row of an
// uploaded video. It is the CONTENT's flag (server/lib/video-variants.js), so it changes this video
// wherever it plays; the hint says so.
const LIVE_VIDEO = new Set(['video/youtube', 'video/hls', 'video/rtsp', 'video/hdmi-in']);
function prerotatedToggle(item) {
  if (!item.content_id || item.remote_url || !/^video\//.test(item.mime_type || '') || LIVE_VIDEO.has(item.mime_type)) return '';
  return `<label style="display:flex;align-items:center;gap:4px;font-size:12px;color:var(--text-muted);white-space:nowrap;cursor:pointer" title="${esc(t('content.tvsafe.prerotated_item_hint'))}" data-fil-i18n-title="${binding('content.tvsafe.prerotated_item_hint', undefined)}">
    <input type="checkbox" class="item-prerotated" data-content-id="${esc(item.content_id)}" ${item.video_prerotated ? 'checked' : ''}>${uiText(t('content.tvsafe.prerotated_short'))}</label>`;
}

function renderItems(items) {
  const itemsEl = document.getElementById('playlistItems');
  if (!itemsEl) return;
  currentPlaylistItems = items || [];
  const present = new Set(currentPlaylistItems.map((it) => String(it.id)));
  selectedItemIds = new Set([...selectedItemIds].filter((id) => present.has(id)));
  const sortBar = document.getElementById('playlistSortBar');
  // Head office's playlist, for someone who can't change it: no sort/order/selection tools (§7.9).
  const corpReadOnly = corpIsReadOnly();
  if (sortBar) sortBar.style.display = items.length && !corpReadOnly ? 'flex' : 'none';
  paintSelectBar();

  if (!items.length) {
    itemsEl.innerHTML = `
      <div style="text-align:center;padding:40px;color:var(--text-muted);border:2px dashed var(--border);border-radius:var(--radius-lg)">
        <p style="margin-bottom:8px">${renderHTML(t('playlist.items_empty'))}</p>
        <p style="font-size:13px">${renderHTML(t('playlist.items_empty_hint'))}</p>
      </div>
    `;
    return;
  }

  const fillMode = !!(corpEditor && corpEditor.mode === 'fill');
  // 3.0 campaigns: the zones of this playlist's layout items, for items placed inside them.
  const campaignZones = campaignZoneOptions(items);
  itemsEl.innerHTML = items.map((item, i) => item.slot_id ? slotRowHtml(item, i, items.length) : `
    <div class="playlist-item" data-item-id="${item.id}" data-index="${i}" draggable="true" style="background:var(--bg-card);border:1px solid ${selectedItemIds.has(String(item.id)) ? 'var(--accent, #3B82F6)' : 'var(--border)'};border-radius:var(--radius);padding:12px 16px;display:flex;align-items:center;gap:12px;cursor:grab;transition:border-color 0.15s;${item.enabled === 0 ? 'opacity:0.55' : ''}">
      <input type="checkbox" class="item-select" data-item-id="${item.id}" data-index="${i}" ${selectedItemIds.has(String(item.id)) ? 'checked' : ''} style="flex-shrink:0" onclick="event.stopPropagation()">
      <div style="color:var(--text-muted);font-size:12px;min-width:24px;text-align:center;user-select:none">${renderHTML(i + 1)}</div>
      <div style="width:48px;height:36px;border-radius:4px;overflow:hidden;background:var(--bg-input);flex-shrink:0;display:flex;align-items:center;justify-content:center">
        ${renderHTML(item.layout_ref_id
          ? layoutThumbHtml(item.layout)
          : item.child_playlist_id
          ? `<div style="color:var(--text-muted)">☰</div>`
          : item.thumbnail_path
            ? `<img data-auth-src="/api/content/${esc(item.content_id)}/thumbnail" style="width:100%;height:100%;object-fit:cover">`
            : `<div style="color:var(--text-muted);opacity:0.5">${renderHTML(getTypeIcon(item))}</div>`)
        }
      </div>
      <div style="flex:1;min-width:0">
        <div style="font-size:14px;color:var(--text-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${renderHTML(item.layout_ref_id ? t('campaign.item_name', { name: item.filename || '' }) : esc(item.child_playlist_name || item.filename || item.widget_name || t('common.unknown')))}</div>
        <div style="font-size:12px;color:var(--text-muted);display:flex;align-items:center;gap:8px;min-width:0">
          <span style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${renderHTML(item.layout_ref_id ? esc(layoutItemSummary(item)) : item.child_playlist_id ? t('playlist.item_nested') : item.widget_id ? t('playlist.item_widget') : esc(item.mime_type || t('playlist.unknown_type')))}</span>
          ${/* In a slot a video counts at its full length (it always plays to the end), so say so. */ renderHTML('')}
          ${renderHTML(fillMode && item.content_duration && /^(video|audio)\//.test(item.mime_type || '') ? `<span style="font-size:11px;white-space:nowrap;color:var(--warning)">${uiText(t('corp.slot.video_len', { len: cui.formatSec(item.content_duration) }))}</span>` : '')}
          ${renderHTML(item.experiment_id ? `<a href="#/experiments" style="font-size:11px;padding:1px 6px;border-radius:4px;background:#3b2a0c;color:#fcd34d;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0;flex-shrink:1;text-decoration:none" title="${esc(t('exp.row_badge_tip'))}" data-fil-i18n-title="${binding('exp.row_badge_tip', undefined)}" aria-label="${esc(t('exp.row_badge'))}" data-fil-i18n-aria-label="${binding('exp.row_badge', undefined)}">⚗</a>` : '')}
          ${renderHTML(item.play_from || item.play_until ? `<span style="font-size:11px;padding:1px 6px;border-radius:4px;background:#1a2e1a;color:#86efac;white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="${esc(windowSummary(item))}">${uiText(windowSummary(item))}</span>` : '')}
          ${renderHTML(item.schedules && item.schedules.length ? `<span style="font-size:11px;padding:1px 6px;border-radius:4px;background:#0c2a3f;color:#7dd3fc;white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="${esc(scheduleSummary(item.schedules))}">🕐 ${uiText(scheduleSummary(item.schedules))}</span>` : '')}
          ${renderHTML(Array.isArray(item.tags) && item.tags.length ? `<span style="font-size:11px;padding:1px 6px;border-radius:4px;background:var(--bg-input);color:var(--text-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${renderHTML(item.tags.map((tg) => '#' + esc(tg)).join(' '))}</span>` : '')}
        </div>
      </div>
      <div style="display:flex;align-items:center;gap:8px;flex-shrink:0">
        ${renderHTML(item.child_playlist_id
          ? `<span style="font-size:12px;color:var(--text-muted)" title="${esc(t('playlist.nested_duration_hint'))}" data-fil-i18n-title="${binding('playlist.nested_duration_hint', undefined)}">${uiText(t('playlist.plays_through'))}</span>`
          : (item.mime_type === 'video/hls' || item.mime_type === 'video/rtsp' || item.mime_type === 'video/hdmi-in')
          // A live stream's duration is DWELL (how long to stay on the channel), not clip length.
          // 0 = stay until the item is skipped (window / enabled / play_when / the playlist advances).
          ? `<label style="font-size:12px;color:var(--text-muted)" title="${esc(t('playlist.dwell_hint'))}" data-fil-i18n-title="${binding('playlist.dwell_hint', undefined)}">${renderHTML(t('playlist.dwell'))}</label>
        <input type="number" class="input item-duration" data-item-id="${item.id}" data-live="1" value="${item.duration_sec || 0}" min="0" title="${esc(t('playlist.dwell_hint'))}" data-fil-i18n-title="${binding('playlist.dwell_hint', undefined)}" style="width:60px;padding:4px 8px;font-size:13px;text-align:center">
        <span style="font-size:12px;color:var(--text-muted)">${renderHTML(t('playlist.sec'))}</span>`
          : `${renderHTML(playToEndToggle(item))}${renderHTML(prerotatedToggle(item))}<label style="font-size:12px;color:var(--text-muted)"${item.play_to_end && item.mime_type === 'video/youtube' ? ` title="${esc(t('playlist.play_to_end_fallback_hint'))}">${t('playlist.play_to_end_fallback')}` : `>${t('playlist.duration')}`}</label>
        <input type="number" class="input item-duration" data-item-id="${item.id}" value="${item.duration_sec}" min="1" style="width:60px;padding:4px 8px;font-size:13px;text-align:center">
        <span style="font-size:12px;color:var(--text-muted)">${renderHTML(t('playlist.sec'))}</span>`)}
        ${renderHTML(currentPlaybackOrder === 'weighted' && !item.child_playlist_id ? `<label style="font-size:12px;color:var(--text-muted)">${renderHTML(t('playlist.weight'))}</label>
        <input type="number" class="input item-weight" data-item-id="${item.id}" value="${item.weight || 1}" min="1" max="1000" style="width:56px;padding:4px 8px;font-size:13px;text-align:center">` : '')}
        ${renderHTML(currentPlaybackOrder === 'sequential' && !item.child_playlist_id && !item.layout_ref_id && !fillMode ? repeatSelect(item) : '')}
        ${renderHTML(campaignZones.length ? campaignZoneSelectHtml(item, campaignZones) : zoneSelectHtml(item, currentLayout))}
        <label style="font-size:12px;color:var(--text-muted)" title="${esc(t('playlist.play_window_hint'))}" data-fil-i18n-title="${binding('playlist.play_window_hint', undefined)}">${renderHTML(t('playlist.play_from'))}</label>
        <input type="datetime-local" class="input item-play-from" data-item-id="${item.id}" value="${esc(item.play_from || '')}" style="width:168px;padding:4px 6px;font-size:12px">
        <label style="font-size:12px;color:var(--text-muted)">${renderHTML(t('playlist.play_until'))}</label>
        <input type="datetime-local" class="input item-play-until" data-item-id="${item.id}" value="${esc(item.play_until || '')}" style="width:168px;padding:4px 6px;font-size:12px">
      </div>
      <div style="display:flex;align-items:center;gap:4px;flex-shrink:0">
        <button class="btn-icon item-schedule" data-item-id="${item.id}" title="${t('itemsched.title')}" data-fil-i18n-title="${binding('itemsched.title', undefined)}" aria-label="${t('itemsched.title')}" data-fil-i18n-aria-label="${binding('itemsched.title', undefined)}" style="color:${item.schedules && item.schedules.length ? '#38bdf8' : 'var(--text-muted)'};background:none;border:none;cursor:pointer;padding:4px;border-radius:4px">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15 14"/></svg>
        </button>
        ${renderHTML(item.layout_ref_id ? `<button class="btn btn-secondary btn-sm item-layout-edit" data-item-id="${item.id}">${uiText(t('campaign.edit_zones'))}</button>` : '')}
        <button class="btn-icon item-replace" data-item-id="${item.id}" title="${t('playlist.replace_item')}" data-fil-i18n-title="${binding('playlist.replace_item', undefined)}" aria-label="${t('playlist.replace_item')}" data-fil-i18n-aria-label="${binding('playlist.replace_item', undefined)}" style="color:var(--text-muted);background:none;border:none;cursor:pointer;padding:4px;border-radius:4px;${item.layout_ref_id ? 'display:none' : ''}">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>
        </button>
        <button class="btn-icon item-duplicate" data-item-id="${item.id}" title="${t('playlist.duplicate_item')}" data-fil-i18n-title="${binding('playlist.duplicate_item', undefined)}" aria-label="${t('playlist.duplicate_item')}" data-fil-i18n-aria-label="${binding('playlist.duplicate_item', undefined)}" style="color:var(--text-muted);background:none;border:none;cursor:pointer;padding:4px;border-radius:4px">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
        </button>
        <button class="btn-icon item-move" data-item-id="${item.id}" data-dir="up" title="${t('playlist.move_up')}" data-fil-i18n-title="${binding('playlist.move_up', undefined)}" aria-label="${t('playlist.move_up')}" data-fil-i18n-aria-label="${binding('playlist.move_up', undefined)}" ${i === 0 ? 'disabled' : ''} style="color:var(--text-muted);background:none;border:none;cursor:pointer;padding:4px;border-radius:4px;${i === 0 ? 'opacity:0.3;cursor:not-allowed' : ''}">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="18 15 12 9 6 15"/></svg>
        </button>
        <button class="btn-icon item-move" data-item-id="${item.id}" data-dir="down" title="${t('playlist.move_down')}" data-fil-i18n-title="${binding('playlist.move_down', undefined)}" aria-label="${t('playlist.move_down')}" data-fil-i18n-aria-label="${binding('playlist.move_down', undefined)}" ${i === items.length - 1 ? 'disabled' : ''} style="color:var(--text-muted);background:none;border:none;cursor:pointer;padding:4px;border-radius:4px;${i === items.length - 1 ? 'opacity:0.3;cursor:not-allowed' : ''}">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
        </button>
        <button class="btn-icon item-remove" data-item-id="${item.id}" title="${t('common.delete')}" data-fil-i18n-title="${binding('common.delete', undefined)}" aria-label="${t('playlist.remove_item')}" data-fil-i18n-aria-label="${binding('playlist.remove_item', undefined)}" style="color:var(--text-muted);background:none;border:none;cursor:pointer;padding:4px;border-radius:4px">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
    </div>
  `).join('');
  hydrateAuthImages(itemsEl);
  bindZoneSelects(itemsEl, currentPlaylistId, () => refreshAfterMutation());
  itemsEl.querySelectorAll('.item-layout-edit').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const item = items.find((it) => String(it.id) === btn.dataset.itemId);
      if (item && await openLayoutItemDialog({ id: currentPlaylistId }, item)) refreshAfterMutation();
    });
  });
  bindSelection(itemsEl, items);
  bindSlotRows(itemsEl);
  if (corpReadOnly) lockCorporateRows(itemsEl);

  itemsEl.querySelectorAll('.item-duration').forEach(input => {
    input.addEventListener('change', async (e) => {
      const itemId = e.target.dataset.itemId;
      // A live stream accepts 0 (dwell 0 = stay until skipped); everything else needs >= 1.
      const isLive = e.target.dataset.live === '1';
      const val = parseInt(e.target.value, 10);
      if (Number.isNaN(val) || val < (isLive ? 0 : 1)) { e.target.value = isLive ? 0 : 10; return; }
      try {
        await api.updatePlaylistItem(currentPlaylistId, itemId, { duration_sec: val });
        refreshAfterMutation();
      } catch (err) {
        showToast(errorMessage(err), 'error');
      }
    });
  });

  itemsEl.querySelectorAll('.item-play-to-end').forEach(box => {
    box.addEventListener('change', async (e) => {
      try {
        await api.updatePlaylistItem(currentPlaylistId, e.target.dataset.itemId, { play_to_end: e.target.checked });
        refreshAfterMutation();
      } catch (err) {
        showToast(errorMessage(err), 'error');
        refreshAfterMutation();   // put the checkbox back to what is actually stored
      }
    });
  });

  itemsEl.querySelectorAll('.item-prerotated').forEach(box => {
    box.addEventListener('change', async (e) => {
      try {
        await api.setContentPrerotated(e.target.dataset.contentId, e.target.checked);
        refreshAfterMutation();
      } catch (err) {
        showToast(errorMessage(err), 'error');
        refreshAfterMutation();
      }
    });
  });

  itemsEl.querySelectorAll('.item-repeat').forEach(sel => {
    sel.addEventListener('change', async (e) => {
      const v = e.target.value ? Number(e.target.value) : null;
      try {
        await api.updatePlaylistItem(currentPlaylistId, e.target.dataset.itemId, { repeat_every_sec: v });
        showToast(t('repeat.toast_saved'), 'info');
        refreshAfterMutation();
      } catch (err) {
        showToast(errorMessage(err), 'error');
        refreshAfterMutation();   // put the select back to what is actually stored
      }
    });
  });

  itemsEl.querySelectorAll('.item-weight').forEach(input => {
    input.addEventListener('change', async (e) => {
      const itemId = e.target.dataset.itemId;
      let val = parseInt(e.target.value, 10);
      if (!val || val < 1) { e.target.value = 1; return; }
      // Weight caps at 1000 (the server clamps too); reflect it so the field never
      // shows a value the stored weight will not match.
      if (val > 1000) { val = 1000; e.target.value = 1000; showToast(t('playlist.weight_capped'), 'info'); }
      try {
        await api.updatePlaylistItem(currentPlaylistId, itemId, { weight: val });
        refreshAfterMutation();
      } catch (err) {
        showToast(errorMessage(err), 'error');
      }
    });
  });

  const savePlayWindow = async (el, field) => {
    const itemId = el.dataset.itemId;
    const val = el.value || null;
    try {
      await api.updatePlaylistItem(currentPlaylistId, itemId, { [field]: val });
      // Was silent, which is how a "set a time frame but it still plays" report happens: the change
      // is a DRAFT and does nothing on screens until Publish. Say so, like the schedule modal does.
      showToast(t('playlist.toast.window_saved'), 'info');
      refreshAfterMutation();
    } catch (err) {
      showToast(errorMessage(err), 'error');
    }
  };
  itemsEl.querySelectorAll('.item-play-from').forEach(input => {
    input.addEventListener('change', (e) => savePlayWindow(e.target, 'play_from'));
  });
  itemsEl.querySelectorAll('.item-play-until').forEach(input => {
    input.addEventListener('change', (e) => savePlayWindow(e.target, 'play_until'));
  });

  itemsEl.querySelectorAll('.item-remove').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const itemId = e.currentTarget.dataset.itemId;
      try {
        await api.deletePlaylistItem(currentPlaylistId, itemId);
        const playlist = await api.getPlaylist(currentPlaylistId);
        renderItems(playlist.items || []);
        refreshAfterMutation();
        showToast(t('playlist.toast.item_removed'));
      } catch (err) {
        showToast(errorMessage(err), 'error');
      }
    });
  });

  itemsEl.querySelectorAll('.item-schedule').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const itemId = e.currentTarget.dataset.itemId;
      const item = items.find(it => String(it.id) === String(itemId));
      if (item) showScheduleModal(item);
    });
  });

  // #105 duplicate: server copies the row + its schedule blocks, appended at the end.
  itemsEl.querySelectorAll('.item-duplicate').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const itemId = e.currentTarget.dataset.itemId;
      try {
        e.currentTarget.disabled = true;
        await api.duplicatePlaylistItem(currentPlaylistId, itemId);
        const playlist = await api.getPlaylist(currentPlaylistId);
        renderItems(playlist.items || []);
        refreshAfterMutation();
        showToast(t('playlist.toast.item_duplicated'));
      } catch (err) {
        showToast(errorMessage(err), 'error');
      }
    });
  });

  // #105 replace: reuse the add-item picker in "replace" mode — swaps content/widget
  // in place, preserving duration/schedule/zone (server-side).
  itemsEl.querySelectorAll('.item-replace').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const itemId = e.currentTarget.dataset.itemId;
      showAddItemModal(currentPlaylistId, { replaceItemId: itemId });
    });
  });

  itemsEl.querySelectorAll('.item-move').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      if (btn.disabled) return;
      const itemId = parseInt(e.currentTarget.dataset.itemId, 10);
      const dir = e.currentTarget.dataset.dir;
      const order = Array.from(itemsEl.querySelectorAll('.playlist-item'))
        .map(el => parseInt(el.dataset.itemId, 10));
      const idx = order.indexOf(itemId);
      const swap = dir === 'up' ? idx - 1 : idx + 1;
      if (swap < 0 || swap >= order.length) return;
      [order[idx], order[swap]] = [order[swap], order[idx]];
      try {
        const updated = await api.reorderPlaylistItems(currentPlaylistId, order);
        renderItems(updated);
        refreshAfterMutation();
      } catch (err) {
        showToast(errorMessage(err), 'error');
      }
    });
  });

  setupDragReorder(itemsEl);
}

/* ── Head office (corporate) editor ──────────────────────────────────────────────────────────── */

/*
 * A LOCAL SLOT row of head office's playlist: the space each store fills (spec §7.3). Drawn as a
 * dashed card with its limits and what plays when a store leaves it empty, and only the controls a
 * slot has — settings, remove, move, preview. Duration, repeat, dayparts, mute and swap belong to
 * the stores' items inside the slot, not the slot.
 */
function slotRowHtml(item, i, total) {
  const view = (corpEditor && corpEditor.slots && corpEditor.slots.get(item.slot_id)) || null;
  const raw = item.slot || {};
  const name = (view && view.name) || raw.name || t('corp.hq.slot_unnamed');
  const limits = (view && view.limits) || { max_items: raw.max_items ?? null, max_total_sec: raw.max_total_sec ?? null };
  const fb = view && view.fallback;
  const empty = fb ? t('corp.hq.slot_empty_fallback', { name: fb.name || '' }) : (raw.fallback_content_id || raw.fallback_widget_id) && !view ? '' : t('corp.hq.slot_empty_skip');
  const author = !!(corpEditor && corpEditor.canAuthor);
  const btn = (cls, label, extra = '') => `<button class="btn btn-secondary btn-sm ${cls}" data-slot-id="${esc(item.slot_id)}" ${extra}>${uiText(label)}</button>`;
  return `
    <div class="playlist-item corp-slot-row" data-item-id="${item.id}" data-index="${i}" draggable="${author ? 'true' : 'false'}" style="background:var(--bg-card);border:1px dashed;border-radius:var(--radius);padding:12px 16px;display:flex;align-items:center;gap:12px;flex-wrap:wrap">
      <div style="color:var(--text-muted);font-size:12px;min-width:24px;text-align:center;user-select:none">${renderHTML(i + 1)}</div>
      <div style="flex:1;min-width:220px">
        <div style="font-size:14px;color:var(--text-primary)">${renderHTML(cui.chip(t('corp.badge.local_slot'), 'slot'))} ${uiText(t('corp.hq.slot_row', { name, limits: cui.limitsText(limits) }))}</div>
        <div class="corp-help">${uiText(empty)}${renderHTML(view && view.fills ? displayList([' · ',tn('corp.hq.slot_levels', view.fills)],'') : '')}${renderHTML(view && !view.live ? displayList([' · ',t('corp.hq.slot_not_live')],'') : '')}</div>
      </div>
      <div style="display:flex;gap:6px;flex-wrap:wrap">
        ${renderHTML(author ? btn('slot-settings', t('corp.hq.slot_settings')) + btn('slot-remove', t('corp.hq.remove_slot')) : '')}
        ${renderHTML(btn('slot-preview', t('corp.hq.preview')))}
        ${renderHTML(author ? `<button class="btn-icon item-move" data-item-id="${item.id}" data-dir="up" title="${t('playlist.move_up')}" data-fil-i18n-title="${binding('playlist.move_up', undefined)}" aria-label="${t('playlist.move_up')}" data-fil-i18n-aria-label="${binding('playlist.move_up', undefined)}" ${i === 0 ? 'disabled' : ''} style="color:var(--text-muted);background:none;border:none;cursor:pointer;padding:4px;${i === 0 ? 'opacity:0.3;cursor:not-allowed' : ''}"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="18 15 12 9 6 15"/></svg></button>
        <button class="btn-icon item-move" data-item-id="${item.id}" data-dir="down" title="${t('playlist.move_down')}" data-fil-i18n-title="${binding('playlist.move_down', undefined)}" aria-label="${t('playlist.move_down')}" data-fil-i18n-aria-label="${binding('playlist.move_down', undefined)}" ${i === total - 1 ? 'disabled' : ''} style="color:var(--text-muted);background:none;border:none;cursor:pointer;padding:4px;${i === total - 1 ? 'opacity:0.3;cursor:not-allowed' : ''}"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg></button>` : '')}
      </div>
    </div>`;
}

function bindSlotRows(itemsEl) {
  const slotOf = (b) => (corpEditor && corpEditor.slots.get(b.dataset.slotId)) || null;
  itemsEl.querySelectorAll('.slot-settings').forEach((b) => b.addEventListener('click', async () => {
    const pl = await api.getPlaylist(currentPlaylistId).catch(() => null);
    openSlotDialog(pl || { id: currentPlaylistId }, slotOf(b), () => refreshAfterMutation());
  }));
  itemsEl.querySelectorAll('.slot-remove').forEach((b) => b.addEventListener('click', async () => {
    const sl = slotOf(b);
    const ok = await cui.ask({
      title: t('corp.hq.remove_slot'), danger: true, confirmLabel: t('corp.hq.remove_slot'),
      text: tn('corp.hq.remove_slot_confirm', sl ? sl.fills || 0 : 0, { name: sl ? sl.name : '' }),
    });
    if (!ok) return;
    try { await api.deleteSlot(b.dataset.slotId); showToast(t('corp.hq.slot_removed'), 'success'); refreshAfterMutation(); }
    catch (e) { showToast(errorMessage(e), 'error'); }
  }));
  itemsEl.querySelectorAll('.slot-preview').forEach((b) => b.addEventListener('click', () => {
    cui.openScreenPreview({ playlistId: currentPlaylistId, canDraft: !!(corpEditor && corpEditor.canAuthor) });
  }));
}

/** The corporate / slot editor additions, loaded after the ordinary editor has rendered. */
/*
 * Head office's playlist opened by someone who can't author it (a head office editor when only org
 * admins author). Until the settings answer, it counts as read-only: an author sees the controls a
 * moment later, a non-author never sees a control that would only fail.
 */
function corpIsReadOnly() {
  return !!(corpEditor && corpEditor.mode === 'corporate' && corpEditor.canAuthor !== true);
}

/**
 * Lock every head office item row: inputs read-only, no drag, no selection, and a click on any of
 * them explains (corporate-ui.js: never a silently disabled control). Slot rows have their own.
 */
function lockCorporateRows(itemsEl) {
  itemsEl.querySelectorAll('.playlist-item').forEach((row) => {
    row.draggable = false;
    row.style.cursor = 'default';
    row.querySelectorAll('.item-select').forEach((cb) => { cb.style.display = 'none'; });
    row.querySelectorAll('input, select, button').forEach((el) => {
      if (el.classList.contains('item-select')) return;
      el.dataset.corpLocked = 'hq';
      bindAttribute(el, "title", t('corp.locked.title'));
      if (el.tagName === 'INPUT') el.readOnly = true;
    });
  });
  if (itemsEl._corpLockBound) return;
  itemsEl._corpLockBound = true;
  const handler = (e) => {
    if (!corpIsReadOnly()) return;
    const el = e.target && e.target.closest && e.target.closest('[data-corp-locked="hq"]');
    if (!el) return;
    // A change that got through anyway (typed into a select) never reaches the row's own handler.
    if (e.type === 'change') { e.stopImmediatePropagation(); refreshAfterMutation(); return; }
    if (e.type === 'keydown' && !['Enter', ' ', 'ArrowDown', 'ArrowUp'].includes(e.key)) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    // One explanation per gesture: a select opens on mousedown, everything else explains on click.
    const isSelect = el.tagName === 'SELECT';
    if (e.type === 'mousedown' && !isSelect) return;
    if (e.type === 'click' && isSelect) return;
    cui.explainLocked({ text: t('corp.hq.read_only') });
  };
  ['click', 'mousedown', 'keydown', 'change'].forEach((ev) => itemsEl.addEventListener(ev, handler, true));
}

async function mountCorporateEditor(container, playlist) {
  const bar = document.getElementById('corpEditorBar');
  if (!bar || !corpEditor) return;
  const ed = corpEditor;
  const s = await cui.corporateSettings();
  if (ed.mode === 'corporate') {
    let detail;
    try { detail = await api.getCorporatePlaylist(playlist.id); }
    catch (e) { bar.innerHTML = `<div class="corp-notice corp-notice-danger">${uiText((errorMessage(e)))}</div>`; return; }
    if (corpEditor !== ed || currentPlaylistId !== playlist.id) return;
    ed.slots = new Map((detail.slots || []).map((sl) => [sl.id, sl]));
    ed.screens = detail.screens || 0;
    ed.canAuthor = !!(s && s.can_author);
    bar.innerHTML = `
      <div class="corp-notice">
        ${renderHTML(cui.chip(t('corp.badge.corporate'), 'hq', '', { lock: true }))}
        ${renderHTML(tn('corp.hq.banner', ed.screens || 0))}
        <a class="btn btn-secondary btn-sm" href="#/corporate/where">${uiText(t('corp.where.title'))}</a>
        <button class="btn btn-secondary btn-sm" id="corpPvBtn">${uiText(t('corp.hq.preview'))}</button>
        ${renderHTML(ed.canAuthor ? '' : `<div class="corp-help" style="margin-top:6px">${uiText(t('corp.hq.read_only'))}</div>`)}
      </div>`;
    bar.querySelector('#corpPvBtn').addEventListener('click', () => cui.openScreenPreview({ playlistId: playlist.id, canDraft: ed.canAuthor }));
    const publishBtn = document.getElementById('publishBtn');
    if (publishBtn && ed.canAuthor && ed.screens) bindText(publishBtn, 'corp.hq.publish_n', undefined, ed.screens);
    if (!ed.canAuthor) {
      // Approve-but-not-publish (R11): a reviewer here can approve; only an admin can publish.
      if (publishBtn) publishBtn.replaceWith(Object.assign(document.createElement('span'), { className: 'corp-help', textContent: t('corp.hq.waiting_admin') }));
      ['addItemBtn', 'addHoldBtn', 'deletePlaylistBtn', 'discardDraftBtn'].forEach((id) => { const el = document.getElementById(id); if (el) el.style.display = 'none'; });
      // The name and description are head office's too: a click explains instead of opening an edit.
      ['playlistTitle', 'playlistDesc'].forEach((id) => {
        const el = document.getElementById(id);
        if (!el) return;
        const copy = el.cloneNode(true);
        bindAttribute(copy, "title", t('corp.locked.title'));
        copy.style.cursor = 'default';
        copy.addEventListener('click', () => cui.explainLocked({ text: t('corp.hq.read_only') }));
        el.replaceWith(copy);
      });
    }
    const addSlot = document.getElementById('addSlotBtn');
    if (addSlot && ed.canAuthor) {
      addSlot.style.display = '';
      addSlot.onclick = () => openSlotDialog(playlist, null, () => refreshAfterMutation());
    }
    renderItems(currentPlaylistItems);
    return;
  }

  // ── fill mode: the store's content for one local slot (§7.8)
  const cs = playlist.corporate_slot;
  let slotsResp = null;
  let pv = null;
  try {
    [slotsResp, pv] = await Promise.all([api.getSlotFills(cs.slot_id), api.previewFill(cs.fill_id).catch(() => null)]);
  } catch (e) { bar.innerHTML = `<div class="corp-notice corp-notice-danger">${uiText((errorMessage(e)))}</div>`; return; }
  if (corpEditor !== ed || currentPlaylistId !== playlist.id) return;
  const slot = slotsResp.slot || {};
  const fill = (slotsResp.fills || []).find((f) => f.id === cs.fill_id) || {};
  const limits = slot.live_limits || slot.limits || {};
  const totals = (pv && pv.draft_totals) || { items: 0, seconds: 0 };
  ed.slot = slot; ed.fill = fill; ed.limits = limits; ed.preview = pv;
  const overItems = limits.max_items != null && totals.items > limits.max_items;
  const overSec = limits.max_total_sec != null && totals.seconds > limits.max_total_sec;
  const level = cui.levelLabel(fill.scope_kind || cs.scope_kind, fill.scope_name);
  bar.innerHTML = `
    <div class="corp-card corp-slot-card">
      <div class="corp-card-head">
        <strong class="corp-card-title">${uiText(t('corp.fill.title', { slot: cs.slot_name || '', playlist: cs.playlist_name || '' }))}</strong>
        ${renderHTML(cui.chip(level, 'slot'))}
        <span class="corp-help">${uiText(tn('corp.fill.plays_on', fill.screens || 0))}</span>
      </div>
      ${renderHTML(slot.help_text ? `<div class="corp-hq-note">${uiText(t('corp.store.hq_says'))} ${uiText(slot.help_text)}</div>` : '')}
      <div class="corp-meter">
        ${renderHTML(limits.max_items != null ? `<span class="${overItems ? 'over' : ''}">${uiText(tn('corp.slot.meter_items', limits.max_items, { used: totals.items }))}</span>` : `<span>${uiText(tn('corp.n_items', totals.items))}</span>`)}
        ${renderHTML(limits.max_total_sec != null ? `<span class="${overSec ? 'over' : ''}">${uiText(t('corp.slot.meter_sec', { s: totals.seconds, max: limits.max_total_sec }))}</span>` : `<span>${uiText(t('corp.slot.loop_sec', { s: totals.seconds }))}</span>`)}
      </div>
      <div class="corp-help">${uiText(t('corp.slot.meter_note'))}${renderHTML(limits.allow_video === 0 || limits.allow_video === false ? displayList([' ',t('corp.slot.no_video')],'') : '')}${renderHTML(limits.allow_widgets === 0 || limits.allow_widgets === false ? displayList([' ',t('corp.slot.no_widgets')],'') : '')}</div>
      ${renderHTML(pv && pv.violation ? `<div class="corp-notice corp-notice-danger" style="margin-top:8px">${uiText(storedErrorMessage(pv.violation.error))}</div>` : '')}
      ${renderHTML(fill.fill_state === 'over_limit' ? `<div class="corp-notice corp-notice-danger" style="margin-top:8px">${uiText(t('corp.slot.over_limit'))}</div>` : '')}
      <div class="corp-card-actions">
        <button class="btn btn-secondary btn-sm" id="corpFillPreview">${uiText(t('corp.fill.preview'))}</button>
        <a class="btn btn-secondary btn-sm" href="#/corporate">${uiText(t('nav.head_office'))}</a>
      </div>
    </div>`;
  bar.querySelector('#corpFillPreview').addEventListener('click', () => openFillPreview(cs.fill_id));
  const publishBtn = document.getElementById('publishBtn');
  if (publishBtn) {
    if (pv && pv.violation) {
      // Refused at publish anyway (FILL_LIMIT); the reason is on the page, not only on click.
      publishBtn.disabled = true;
      bindAttribute(publishBtn, "title", pv.violation.error);
      publishBtn.style.opacity = '0.55';
    } else if (fill.screens) bindText(publishBtn, 'corp.hq.publish_n', undefined, fill.screens);
  }
}

/** In a slot's editor, the picker offers only what the slot can hold (content-picker.js slotMode). */
function fillSlotMode() {
  if (!corpEditor || corpEditor.mode !== 'fill') return null;
  const l = corpEditor.limits || {};
  return { allowVideo: !(l.allow_video === 0 || l.allow_video === false), allowWidgets: !(l.allow_widgets === 0 || l.allow_widgets === false) };
}

/** Head office's loop with this slot's DRAFT spliced in, for a screen that plays it (critique U3). */
async function openFillPreview(fillId) {
  const m = cui.openModal({ title: t('corp.fill.preview'), wide: true, body: `<div id="corpFpOut">${uiText(t('common.loading'))}</div>` });
  try {
    const r = await api.previewFill(fillId);
    m.q('#corpFpOut').innerHTML = `${r.device_id ? '' : `<div class="corp-help">${uiText(t('corp.fill.preview_no_screen'))}</div>`}${cui.previewHtml({ ...r, mandate: null, total_sec: r.total_sec != null ? r.total_sec : (r.items || []).reduce((a, i) => a + (i.seconds || 0), 0) })}`;
    hydrateAuthImages(m.overlay);
  } catch (e) { m.q('#corpFpOut').innerHTML = `<div class="corp-notice corp-notice-danger">${uiText((errorMessage(e)))}</div>`; }
}

function setupDragReorder(container) {
  let dragEl = null;

  container.addEventListener('dragstart', (e) => {
    if (e.target.closest('.item-select')) { e.preventDefault(); return; }
    dragEl = e.target.closest('.playlist-item');
    if (!dragEl) return;
    dragEl.style.opacity = '0.4';
    e.dataTransfer.effectAllowed = 'move';
  });

  container.addEventListener('dragend', () => {
    if (dragEl) dragEl.style.opacity = '';
    dragEl = null;
    container.querySelectorAll('.playlist-item').forEach(el => el.style.borderTop = '');
  });

  container.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const target = e.target.closest('.playlist-item');
    container.querySelectorAll('.playlist-item').forEach(el => el.style.borderTop = '');
    if (target && target !== dragEl) {
      target.style.borderTop = '2px solid var(--primary)';
    }
  });

  container.addEventListener('drop', async (e) => {
    e.preventDefault();
    const target = e.target.closest('.playlist-item');
    if (!target || !dragEl || target === dragEl) return;

    container.insertBefore(dragEl, target);

    const order = Array.from(container.querySelectorAll('.playlist-item'))
      .map(el => parseInt(el.dataset.itemId, 10));

    try {
      const items = await api.reorderPlaylistItems(currentPlaylistId, order);
      renderItems(items);
      refreshAfterMutation();
    } catch (err) {
      showToast(errorMessage(err), 'error');
      const playlist = await api.getPlaylist(currentPlaylistId);
      renderItems(playlist.items || []);
    }
  });
}

function inlineEdit(playlist, field) {
  const el = field === 'name' ? document.getElementById('playlistTitle') : document.getElementById('playlistDesc');
  if (!el) return;

  const current = playlist[field] || '';
  const isName = field === 'name';

  if (isName) {
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'input';
    input.value = current;
    input.style.cssText = 'font-size:24px;font-weight:700;padding:2px 8px;width:100%';
    el.replaceWith(input);
    input.focus();
    input.select();

    async function save() {
      const val = input.value.trim();
      if (!val) { input.value = current; return; }
      try {
        const updated = await api.updatePlaylist(playlist.id, { [field]: val });
        playlist[field] = updated[field];
      } catch (err) {
        showToast(errorMessage(err), 'error');
      }
      const newEl = document.createElement('h1');
      newEl.id = 'playlistTitle';
      newEl.style.cursor = 'pointer';
      bindAttribute(newEl, "title", t('playlist.click_to_rename'));
      bindMessage(newEl, playlist.name);
      input.replaceWith(newEl);
      newEl.addEventListener('click', () => inlineEdit(playlist, 'name'));
    }

    input.addEventListener('blur', save);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') input.blur(); if (e.key === 'Escape') { input.value = current; input.blur(); } });
  } else {
    const input = document.createElement('textarea');
    input.className = 'input';
    input.value = current;
    input.style.cssText = 'font-size:13px;padding:4px 8px;width:100%;height:40px;resize:vertical';
    el.replaceWith(input);
    input.focus();

    async function save() {
      const val = input.value.trim();
      try {
        const updated = await api.updatePlaylist(playlist.id, { description: val });
        playlist.description = updated.description;
      } catch (err) {
        showToast(errorMessage(err), 'error');
      }
      const newEl = document.createElement('div');
      newEl.className = 'subtitle';
      newEl.id = 'playlistDesc';
      newEl.style.cursor = 'pointer';
      bindAttribute(newEl, "title", t('playlist.click_to_edit_desc'));
      if (playlist.description) {
        bindMessage(newEl, playlist.description);
      } else {
        newEl.innerHTML = `<span style="opacity:0.5">${renderHTML(t('playlist.add_desc_placeholder'))}</span>`;
      }
      input.replaceWith(newEl);
      newEl.addEventListener('click', () => inlineEdit(playlist, 'description'));
    }

    input.addEventListener('blur', save);
    input.addEventListener('keydown', (e) => { if (e.key === 'Escape') { input.value = current; input.blur(); } });
  }
}

/*
 * The add-content picker is shared with the display page (components/content-picker.js) so the two
 * can never drift apart again. This only says where a picked item goes.
 */
function showAddItemModal(playlistId, opts = {}) {
  const replaceItemId = opts.replaceItemId || null;
  const toData = (item) => (item.type === 'widget' ? { widget_id: item.id }
    : item.type === 'playlist' ? { child_playlist_id: item.id } : { content_id: item.id });
  return openContentPicker({
    targetPlaylistId: playlistId,
    replaceItemId,
    slotMode: opts.slotMode || fillSlotMode(),
    add: (item) => api.addPlaylistItem(playlistId, toData(item)),
    addBulk: (ids) => api.addPlaylistItemsBulk(playlistId, ids),
    // #105: PUT swaps content/widget in place; the server nulls the opposite FK and keeps
    // duration/schedule/zone.
    replace: async (item) => {
      await api.updatePlaylistItem(playlistId, replaceItemId, toData(item));
      const playlist = await api.getPlaylist(playlistId);
      renderItems(playlist.items || []);
      showToast(t('playlist.toast.item_replaced'));
    },
    onChanged: () => refreshAfterMutation(),
  });
}

/*
 * A hold screen is a playlist STEP (lib/hold-item.js): for its duration the screen shows nothing new —
 * the last frame frozen, or blank — which is how screens take turns. Added here, where it belongs,
 * rather than from the Content Library. A hold is a content row with no bytes; one per mode is
 * reused, so adding holds does not fill the library with copies.
 */
async function showAddHoldModal(playlistId, trigger) {
  const { openDialog } = await import('../components/library/dialog.js');
  const d = openDialog({
    title: t('playlist.hold.title'),
    returnFocus: trigger,
    html: `<p class="lib-field-help" style="margin:0">${uiText(t('content.hold_desc'))}</p>
      <fieldset class="lib-choice"><legend class="lib-visually-hidden">${uiText(t('playlist.hold.mode'))}</legend>
        <label class="lib-choice-opt"><input type="radio" name="holdMode" value="freeze" checked><span><strong>${uiText(t('content.hold_freeze'))}</strong><span class="lib-field-help">${uiText(t('playlist.hold.freeze_desc'))}</span></span></label>
        <label class="lib-choice-opt"><input type="radio" name="holdMode" value="blank"><span><strong>${uiText(t('content.hold_blank'))}</strong><span class="lib-field-help">${uiText(t('playlist.hold.blank_desc'))}</span></span></label>
      </fieldset>
      <div class="lib-field"><label for="holdSeconds">${uiText(t('playlist.hold.seconds'))}</label>
        <input id="holdSeconds" class="input" type="number" min="1" max="86400" step="1" value="10" inputmode="numeric" aria-describedby="holdSeconds-err">
        <div class="lib-field-err" id="holdSeconds-err" role="alert"></div></div>
      <p class="lib-field-help" style="margin:0">${uiText(t('playlist.hold.players'))}</p>
      <div class="lib-dialog-actions"><span class="lib-form-error" role="alert" data-err></span>
        <button type="button" class="btn btn-secondary" data-cancel>${uiText(t('common.cancel'))}</button>
        <button type="button" class="btn btn-primary" data-ok>${uiText(t('playlist.hold.add'))}</button></div>`,
  });
  d.root.querySelector('[data-cancel]').addEventListener('click', () => d.close());
  d.root.querySelector('[data-ok]').addEventListener('click', async (e) => {
    const mode = d.root.querySelector('input[name="holdMode"]:checked').value;
    const secs = Math.round(Number(d.root.querySelector('#holdSeconds').value));
    if (!Number.isFinite(secs) || secs < 1 || secs > 86400) {
      bindText(d.root.querySelector('#holdSeconds-err'), 'playlist.hold.err_seconds', undefined);
      d.root.querySelector('#holdSeconds').focus();
      return;
    }
    e.currentTarget.disabled = true;
    try {
      const page = await api.getLibraryPage({ type: 'hold', limit: 100 });
      const rows = Array.isArray(page) ? page : (page.items || []);
      let hold = rows.find((c) => c.remote_url === `hold://${mode}`);
      if (!hold) hold = await api.addHoldContent(mode);
      await api.addPlaylistItem(playlistId, { content_id: hold.id, duration_sec: secs });
      d.close();
      showToast(t('content.toast.hold_added'), 'success');
      // The editor re-renders; put focus back on the button the dialog was opened from.
      await refreshAfterMutation();
      document.getElementById('addHoldBtn')?.focus();
    } catch (err) {
      bindMessage(d.root.querySelector('[data-err]'), (errorMessage(err)));
      e.currentTarget.disabled = false;
    }
  });
}

// #74/#75: per-item schedule editor. Multiple blocks (days + time window + optional
// date range) OR together; an item with no blocks always plays. Client validation
// mirrors the server; saving marks the playlist DRAFT (must re-publish to reach devices).
function showScheduleModal(item, opts = {}) {
  let blocks = (item.schedules || []).map(b => ({
    days: Array.isArray(b.days) ? [...b.days] : [],
    start: b.start || '00:00',
    end: b.end || '24:00',
    start_date: b.start_date || '',
    end_date: b.end_date || ''
  }));

  const modal = document.createElement('div');
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;z-index:1000';
  document.body.appendChild(modal);

  function blockRow(b, idx) {
    const eod = b.end === '24:00';
    const dayLabels = t('itemsched.dow_short').split(',');
    return `
      <div style="border:1px solid var(--border);border-radius:var(--radius);padding:12px;margin-bottom:10px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
          <strong style="font-size:13px">${renderHTML(t('itemsched.block', { n: idx + 1 }))}</strong>
          <button class="sched-remove" data-idx="${idx}" title="${t('itemsched.remove_block')}" data-fil-i18n-title="${binding('itemsched.remove_block', undefined)}" style="color:var(--text-muted);background:none;border:none;cursor:pointer;font-size:14px">✕</button>
        </div>
        <div style="display:flex;gap:4px;flex-wrap:wrap;margin-bottom:10px">
          ${renderHTML(dayLabels.map((lbl, d) => `<button class="sched-day" data-idx="${idx}" data-day="${d}" style="padding:4px 9px;border-radius:6px;font-size:12px;cursor:pointer;border:1px solid var(--border);background:${b.days.includes(d) ? 'var(--accent)' : 'var(--bg-input)'};color:${b.days.includes(d) ? '#000' : 'var(--text-muted)'}">${renderHTML(lbl)}</button>`).join(''))}
        </div>
        <div style="display:flex;gap:12px;flex-wrap:wrap;align-items:center">
          <label style="font-size:12px;color:var(--text-muted)">${renderHTML(t('itemsched.from'))} <input type="time" class="input sched-start" data-idx="${idx}" value="${esc(b.start)}" style="width:118px"></label>
          <label style="font-size:12px;color:var(--text-muted)">${renderHTML(t('itemsched.to'))} <input type="time" class="input sched-end" data-idx="${idx}" value="${esc(eod ? '00:00' : b.end)}" ${eod ? 'disabled' : ''} style="width:118px"></label>
          <label style="font-size:12px;color:var(--text-muted)"><input type="checkbox" class="sched-eod" data-idx="${idx}" ${eod ? 'checked' : ''}> ${renderHTML(t('itemsched.end_of_day'))}</label>
        </div>
        <div style="display:flex;gap:12px;flex-wrap:wrap;align-items:center;margin-top:10px">
          <label style="font-size:12px;color:var(--text-muted)">${renderHTML(t('itemsched.starts'))} <input type="date" class="input sched-sd" data-idx="${idx}" value="${esc(b.start_date)}" style="width:150px"></label>
          <label style="font-size:12px;color:var(--text-muted)">${renderHTML(t('itemsched.ends'))} <input type="date" class="input sched-ed" data-idx="${idx}" value="${esc(b.end_date)}" style="width:150px"></label>
          <span style="font-size:11px;color:var(--text-muted)">${renderHTML(t('itemsched.dates_hint'))}</span>
        </div>
      </div>`;
  }

  function render() {
    modal.innerHTML = `
      <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius-lg);padding:24px;width:580px;max-width:94vw;max-height:88vh;overflow:auto">
        <h3 style="margin:0 0 4px">${renderHTML(t('itemsched.title'))}</h3>
        <p style="font-size:12px;color:var(--text-muted);margin:0 0 10px">${uiText(item.filename || item.widget_name || t('common.unnamed_item'))}</p>
        <p style="font-size:12px;color:#7dd3fc;background:#0c2a3f;border-radius:6px;padding:8px 10px;margin:0 0 16px">${renderHTML(t('itemsched.hint'))}</p>
        <div>${renderHTML(blocks.length ? blocks.map(blockRow).join('') : `<p style="font-size:13px;color:var(--text-muted);margin:0 0 10px">${renderHTML(t('itemsched.none'))}</p>`)}</div>
        <button class="btn btn-secondary btn-sm" id="schedAddBlock" style="margin-bottom:4px">${renderHTML(t('itemsched.add_block'))}</button>
        <div style="display:flex;align-items:center;gap:8px;font-size:12px;color:#fbbf24;background:#78350f;border:1px solid #92400e;border-radius:6px;padding:9px 11px;margin-top:16px">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="flex-shrink:0"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
          <span>${renderHTML(t('itemsched.publish_note'))}</span>
        </div>
        <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:16px">
          <button class="btn btn-secondary" id="schedCancel">${renderHTML(t('itemsched.cancel'))}</button>
          <button class="btn" id="schedSave" style="background:#f59e0b;color:#000;font-weight:600;border:none">${renderHTML(t('itemsched.save'))}</button>
        </div>
      </div>`;
    wire();
  }

  function wire() {
    modal.querySelectorAll('.sched-day').forEach(btn => btn.addEventListener('click', () => {
      const i = +btn.dataset.idx, d = +btn.dataset.day;
      const set = new Set(blocks[i].days);
      if (set.has(d)) set.delete(d); else set.add(d);
      blocks[i].days = [...set];
      render();
    }));
    modal.querySelectorAll('.sched-start').forEach(el => el.addEventListener('change', () => { blocks[+el.dataset.idx].start = el.value; }));
    modal.querySelectorAll('.sched-end').forEach(el => el.addEventListener('change', () => { blocks[+el.dataset.idx].end = el.value; }));
    modal.querySelectorAll('.sched-eod').forEach(el => el.addEventListener('change', () => {
      blocks[+el.dataset.idx].end = el.checked ? '24:00' : '17:00';
      render();
    }));
    modal.querySelectorAll('.sched-sd').forEach(el => el.addEventListener('change', () => { blocks[+el.dataset.idx].start_date = el.value; }));
    modal.querySelectorAll('.sched-ed').forEach(el => el.addEventListener('change', () => { blocks[+el.dataset.idx].end_date = el.value; }));
    modal.querySelectorAll('.sched-remove').forEach(btn => btn.addEventListener('click', () => { blocks.splice(+btn.dataset.idx, 1); render(); }));
    document.getElementById('schedAddBlock').addEventListener('click', () => {
      blocks.push({ days: [0, 1, 2, 3, 4, 5, 6], start: '09:00', end: '17:00', start_date: '', end_date: '' });
      render();
    });
    document.getElementById('schedCancel').addEventListener('click', () => modal.remove());
    document.getElementById('schedSave').addEventListener('click', doSave);
  }

  async function doSave() {
    const payload = blocks.map(b => ({
      days: b.days, start: b.start, end: b.end,
      start_date: b.start_date || null, end_date: b.end_date || null
    }));
    const err = validateScheduleBlocks(payload);
    if (err) { showToast(err, 'error'); return; }
    try {
      if (opts.applyIds && opts.applyIds.length) {
        await api.playlistSelection(currentPlaylistId, { action: 'schedules', ids: opts.applyIds, blocks: payload });
      } else {
        const saved = await api.setItemSchedules(currentPlaylistId, item.id, payload);
        item.schedules = saved;
      }
      modal.remove();
      // Saving makes the playlist a DRAFT — surface the re-publish step explicitly.
      showToast(payload.length ? t('itemsched.toast.saved') : t('itemsched.toast.cleared'));
      const playlist = await api.getPlaylist(currentPlaylistId);
      renderItems(playlist.items || []);
      refreshAfterMutation();
    } catch (e) {
      showToast(errorMessage(e), 'error');
    }
  }

  modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
  render();
}
