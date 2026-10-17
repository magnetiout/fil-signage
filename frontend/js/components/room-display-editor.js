import {errorMessage} from '../api.js';
import { uiText, renderHTML, translatedAttribute, bindMessage, bindText } from '../lib/i18n-bindings.js';

// Room display editor (widget_type 'room-display'; server lib/rooms). Mounted inside the widget modal
// by views/widgets.js: mountRoomEditor() renders into #wRoomEditor, readRoomConfig() returns the
// config to save. Rooms themselves are workspace records (server/routes/rooms.js), so the editor
// picks one — and can add one inline — rather than copying calendar details into the widget.

import { esc } from '../utils.js';
import { message as t } from '../i18n.js';

let api = null;
let host = null;
let rooms = [];
let conns = [];
let canManage = false;
let cfg = {};

// The room display page's languages (server lib/rooms/strings.js), each named in itself.
const PAGE_LANGUAGES = [['en', 'English'], ['de', 'Deutsch'], ['nl', 'Nederlands'], ['fr', 'Français'], ['es', 'Español'],
  ['pt', 'Português'], ['it', 'Italiano'], ['ja', '日本語'], ['zh', '中文'], ['hi', 'हिन्दी']];

const browserTz = () => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; } catch (_) { return 'UTC'; } };

export async function mountRoomEditor(el, config, helpers) {
  host = el;
  api = helpers;
  cfg = { layout: 'auto', show_schedule: true, ...(config || {}) };
  host.innerHTML = `<p style="color:var(--text-muted);font-size:13px">${uiText(t('rooms.loading'))}</p>`;
  await load();
}

async function load() {
  try {
    const [r, c] = await Promise.all([api.get('/rooms'), api.get('/rooms/connections').catch(() => ({ connections: [] }))]);
    rooms = r.rooms || [];
    canManage = !!r.can_manage;
    conns = c.connections || [];
  } catch (e) {
    host.innerHTML = `<p style="color:var(--danger,#b91c1c);font-size:13px">${uiText((errorMessage(e)))}</p>`;
    return;
  }
  render();
}

const sourceLabel = (r) => (r.source === 'ics' ? `ICS · ${r.ics_host || ''}` : (conns.find((c) => c.id === r.connection_id)?.name || r.source) + ` · ${r.calendar_id || ''}`);

function render() {
  const sel = rooms.find((r) => r.id === cfg.room_id);
  host.innerHTML = `
    <div class="form-group"><label>${uiText(t('rooms.room'))}</label>
      <select id="rdRoom" class="input" style="background:var(--bg-input)">
        <option value="">${uiText(t('rooms.choose_room'))}</option>
        ${renderHTML(rooms.map((r) => `<option value="${esc(r.id)}" ${r.id === cfg.room_id ? 'selected' : ''}>${uiText(r.name)}</option>`).join(''))}
      </select>
      <div id="rdRoomInfo" style="font-size:12px;color:var(--text-muted);margin-top:4px">${renderHTML(sel ? esc(sourceLabel(sel)) : '')}</div>
    </div>
    ${renderHTML(sel ? roomDetails(sel) : '')}
    ${renderHTML(canManage ? addRoomForm() : `<p style="font-size:12px;color:var(--text-muted)">${uiText(t('rooms.ask_admin'))}</p>`)}
    <div class="form-group"><label>${uiText(t('rooms.layout'))}</label>
      <select id="rdLayout" class="input" style="background:var(--bg-input)">
        <option value="auto" ${cfg.layout === 'auto' ? 'selected' : ''}>${uiText(t('rooms.layout_auto'))}</option>
        <option value="landscape" ${cfg.layout === 'landscape' ? 'selected' : ''}>${uiText(t('rooms.layout_landscape'))}</option>
        <option value="portrait" ${cfg.layout === 'portrait' ? 'selected' : ''}>${uiText(t('rooms.layout_portrait'))}</option>
      </select></div>
    <div class="form-group"><label>${uiText(t('rooms.language'))}</label>
      <select id="rdLanguage" class="input" style="background:var(--bg-input)">
        <option value="" ${!cfg.language ? 'selected' : ''}>${uiText(t('rooms.language_auto'))}</option>
        ${renderHTML(PAGE_LANGUAGES.map(([code, name]) => `<option value="${code}" ${cfg.language === code ? 'selected' : ''}>${uiText(name)}</option>`).join(''))}
      </select></div>
    <label style="display:flex;gap:8px;align-items:center;font-size:13px"><input type="checkbox" id="rdSchedule" ${cfg.show_schedule !== false ? 'checked' : ''}> ${uiText(t('rooms.show_schedule'))}</label>
    <p style="font-size:12px;color:var(--text-muted);margin-top:10px">${uiText(t('rooms.player_note'))}</p>`;

  host.querySelector('#rdRoom').addEventListener('change', (e) => { capture(); cfg.room_id = e.target.value || undefined; render(); });
  host.querySelector('#rdTest')?.addEventListener('click', testRoom);
  host.querySelector('#rdSaveRoom')?.addEventListener('click', saveRoomOptions);
  if (canManage) wireAddForm();
}

function capture() {
  const l = host.querySelector('#rdLayout');
  const s = host.querySelector('#rdSchedule');
  const g = host.querySelector('#rdLanguage');
  if (l) cfg.layout = l.value;
  if (g) cfg.language = g.value || undefined;
  if (s) cfg.show_schedule = s.checked;
}

function roomDetails(r) {
  return `
    <div style="border:1px solid var(--border);border-radius:6px;padding:10px;margin-bottom:12px;display:grid;gap:8px">
      ${renderHTML(r.last_error ? `<div style="font-size:12px;color:var(--danger,#b91c1c)">⚠️ ${uiText(r.last_error)}</div>` : '')}
      ${renderHTML(canManage ? `
      <div class="form-group" style="margin:0"><label>${uiText(t('rooms.details'))}</label>
        <select id="rdDetails" class="input" style="background:var(--bg-input)">
          <option value="private_hidden" ${r.details === 'private_hidden' ? 'selected' : ''}>${uiText(t('rooms.details_private_hidden'))}</option>
          <option value="hidden" ${r.details === 'hidden' ? 'selected' : ''}>${uiText(t('rooms.details_hidden'))}</option>
          <option value="shown" ${r.details === 'shown' ? 'selected' : ''}>${uiText(t('rooms.details_shown'))}</option>
        </select></div>
      ${renderHTML(r.source !== 'ics' ? `<label style="display:flex;gap:8px;align-items:center;font-size:13px"><input type="checkbox" id="rdBooking" ${r.allow_booking ? 'checked' : ''}> ${uiText(t('rooms.allow_booking'))}</label>` : `<div style="font-size:12px;color:var(--text-muted)">${uiText(t('rooms.ics_read_only'))}</div>`)}
      <div style="display:flex;gap:6px;flex-wrap:wrap">
        <button type="button" class="btn btn-secondary btn-sm" id="rdSaveRoom">${uiText(t('rooms.save_room'))}</button>
        <button type="button" class="btn btn-secondary btn-sm" id="rdTest">${uiText(t('rooms.test_room'))}</button>
      </div>` : '')}
      <div id="rdTestOut" style="font-size:12px"></div>
    </div>`;
}

async function testRoom() {
  const out = host.querySelector('#rdTestOut');
  out.style.color = ''; bindText(out, 'rooms.testing', undefined);
  try {
    const r = await api.post(`/rooms/${cfg.room_id}/test`, {});
    if (!r.ok) { out.style.color = 'var(--danger,#b91c1c)'; bindMessage(out, `❌ ${r.error}`); return; }
    out.style.color = 'var(--success,#15803d)';
    bindMessage(out, `✅ ${t('rooms.test_room_ok', { n: r.events })} ${r.busy ? t('rooms.now_busy') : t('rooms.now_free')}`);
  } catch (e) { out.style.color = 'var(--danger,#b91c1c)'; bindMessage(out, (errorMessage(e))); }
}

async function saveRoomOptions() {
  const body = { details: host.querySelector('#rdDetails').value };
  const b = host.querySelector('#rdBooking');
  if (b) body.allow_booking = b.checked;
  try {
    const r = await api.put(`/rooms/${cfg.room_id}`, body);
    rooms = rooms.map((x) => (x.id === r.id ? r : x));
    capture(); render();
  } catch (e) { alert(String(errorMessage(e))); }
}

function addRoomForm() {
  return `
    <details id="rdAdd" style="margin-bottom:12px">
      <summary style="cursor:pointer;font-size:13px">${uiText(t('rooms.add_room'))}</summary>
      <div style="display:grid;gap:10px;margin-top:10px">
        <div class="form-group" style="margin:0"><label>${uiText(t('rooms.source'))}</label>
          <select id="rdSource" class="input" style="background:var(--bg-input)">
            ${renderHTML(conns.map((c) => `<option value="conn:${esc(c.id)}">${uiText(c.name)}</option>`).join(''))}
            <option value="ics">${uiText(t('rooms.source_ics'))}</option>
          </select>
          ${renderHTML(conns.length ? '' : `<div style="font-size:11px;color:var(--text-muted);margin-top:4px">${uiText(t('rooms.no_connections'))}</div>`)}</div>
        <div id="rdConnFields" style="display:grid;gap:10px">
          <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">
            <button type="button" class="btn btn-secondary btn-sm" id="rdFind">${uiText(t('rooms.find_rooms'))}</button>
            <select id="rdFound" class="input" style="display:none;flex:1;min-width:180px;background:var(--bg-input)"></select>
          </div>
          <div class="form-group" style="margin:0"><label>${uiText(t('rooms.calendar_id'))}</label><input id="rdCal" class="input" ${translatedAttribute("placeholder", "ui.room_display_editor.placeholder_boardroom_example_com_145081")}></div>
        </div>
        <div id="rdIcsFields" style="display:none" class="form-group"><label>${uiText(t('rooms.ics_url'))}</label><input id="rdIcs" class="input" placeholder="https://…/calendar.ics">
          <div style="font-size:11px;color:var(--text-muted);margin-top:4px">${uiText(t('rooms.ics_hint'))}</div></div>
        <div class="form-group" style="margin:0"><label>${uiText(t('rooms.room_name'))}</label><input id="rdName" class="input" ${translatedAttribute("placeholder", "ui.room_display_editor.placeholder_boardroom_7c1c8d")}></div>
        <div class="form-group" style="margin:0"><label>${uiText(t('rooms.timezone'))}</label><input id="rdTz" class="input" value="${esc(browserTz())}"></div>
        <div><button type="button" class="btn btn-primary btn-sm" id="rdCreate">${uiText(t('rooms.create_room'))}</button></div>
      </div>
    </details>`;
}

function wireAddForm() {
  const src = host.querySelector('#rdSource');
  const sync = () => {
    const ics = src.value === 'ics';
    host.querySelector('#rdConnFields').style.display = ics ? 'none' : 'grid';
    host.querySelector('#rdIcsFields').style.display = ics ? '' : 'none';
  };
  src.addEventListener('change', sync);
  sync();
  host.querySelector('#rdFind').addEventListener('click', async () => {
    const id = src.value.replace(/^conn:/, '');
    const found = host.querySelector('#rdFound');
    try {
      const r = await api.get(`/rooms/connections/${id}/rooms`);
      found.innerHTML = `<option value="">${uiText(t('rooms.pick_found', { n: r.rooms.length }))}</option>` +
        r.rooms.map((x) => `<option value="${esc(x.calendar_id)}" data-name="${esc(x.name)}">${uiText(x.name)} — ${uiText(x.calendar_id)}</option>`).join('');
      found.style.display = '';
      found.onchange = () => {
        const o = found.selectedOptions[0];
        if (!o || !o.value) return;
        host.querySelector('#rdCal').value = o.value;
        host.querySelector('#rdName').value = o.dataset.name || '';
      };
    } catch (e) { alert(String(errorMessage(e))); }
  });
  host.querySelector('#rdCreate').addEventListener('click', async () => {
    const v = (id) => host.querySelector(id).value.trim();
    const body = { name: v('#rdName'), timezone: v('#rdTz') };
    if (src.value === 'ics') Object.assign(body, { source: 'ics', ics_url: v('#rdIcs') });
    else {
      const conn = conns.find((c) => c.id === src.value.replace(/^conn:/, ''));
      Object.assign(body, { source: conn ? conn.kind : 'm365', connection_id: conn ? conn.id : '', calendar_id: v('#rdCal') });
    }
    try {
      const r = await api.post('/rooms', body);
      capture();
      cfg.room_id = r.id;
      await load();
    } catch (e) { alert(String(errorMessage(e))); }
  });
}

export function readRoomConfig() {
  capture();
  const out = { layout: cfg.layout || 'auto', show_schedule: cfg.show_schedule !== false };
  if (cfg.language) out.language = cfg.language;
  const sel = host && host.querySelector('#rdRoom');
  const id = sel ? sel.value : cfg.room_id;
  if (id) out.room_id = id;
  return out;
}
