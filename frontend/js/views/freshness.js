import { uiText, renderHTML, binding } from '../lib/i18n-bindings.js';
import { displayValue, message as t, messageCount as tn } from '../i18n.js';

/*
 * 3.0 content freshness: the workspace report (server: lib/freshness.js, routes/freshness.js).
 *
 *   #/freshness[?ws=<id>]   what is going stale here, worst first, with one-click fixes
 *
 * The fixes are the product's existing ones, not new writes: Replace opens the item in the content
 * library's inspector, "Take off screens" and "Set an expiry" set the content's expiry date through
 * the same PUT the library uses (the expiry sweep then republishes, and approval applies), and Edit
 * opens the slide or widget editor. Only Snooze is new, and it changes nothing but this report.
 *
 * ?ws= comes from the weekly digest's links: a person who edits several workspaces lands in the one
 * the email was about.
 *
 * Values from the server reach the page through esc() only.
 */
import { api } from '../api.js';

import { esc } from '../utils.js';
import { showToast } from '../components/toast.js';
import { switchWorkspaceTo } from '../components/corporate-ui.js';
import { freshnessChipsHtml, freshnessWhy, invalidateFreshnessChips } from '../components/freshness-chips.js';

let report = null;

function cachedUser() {
  try { return JSON.parse(localStorage.getItem('user') || 'null'); } catch { return null; }
}
const fmtDate = (sec) => (sec ? displayValue(new Date(sec * 1000), "toLocaleDateString", undefined) : '');
const days = (n) => (n == null ? '—' : tn('fresh.days', Math.floor(n)));

export async function render(app) {
  // A digest link for another workspace: switch to it first (the switch reloads the page).
  const ws = new URLSearchParams(window.location.hash.split('?')[1] || '').get('ws');
  const u = cachedUser() || {};
  if (ws && ws !== u.current_workspace_id && (u.accessible_workspaces || []).some((w) => w.id === ws)) {
    try { await switchWorkspaceTo(ws, '#/freshness'); return; } catch (e) { showToast(e.uiMessage || e.message, 'error'); }
  }

  app.innerHTML = `
    <div class="page-header"><div><h1>${uiText(t('nav.freshness'))}</h1><div class="subtitle">${uiText(t('fresh.intro'))}</div></div></div>
    <div id="freshBody"><p style="color:var(--text-muted)">${uiText(t('common.loading'))}</p></div>`;
  await load(app);
}

async function load(app) {
  const body = document.getElementById('freshBody');
  if (!body) return;
  try {
    const r = await api.getFreshness();
    report = r && !Array.isArray(r) ? r : null;
  } catch (e) {
    body.innerHTML = `<p class="corp-notice corp-notice-danger">${uiText((e.uiMessage || e.message))}</p>`;
    return;
  }
  if (!report) { body.innerHTML = `<div class="corp-empty">${uiText(t('fresh.unavailable'))}</div>`; return; }
  if (!document.contains(body)) return;
  body.innerHTML = summaryHtml() + itemsHtml() + screensHtml() + playlistsHtml() + snoozedHtml() + settingsHtml();
  wire(app, body);
  loadDigestPref();
}

function tile(label, value, tone = '') {
  return `<div class="fresh-tile${tone ? ` fresh-tile-${tone}` : ''}"><div class="fresh-tile-value">${uiText(value)}</div><div class="fresh-tile-label">${uiText(label)}</div></div>`;
}

function summaryHtml() {
  const c = report.counts;
  const w = report.workspace;
  const stale = c.stale_screens + c.very_stale_screens;
  return `
    ${renderHTML(w.dark ? `<div class="corp-notice" style="margin-bottom:12px">${uiText(t('fresh.dark', { date: fmtDate(w.last_editor_login) || t('fresh.never') }))}</div>` : '')}
    <div class="fresh-tiles">
      ${renderHTML(tile(t('fresh.tile.avg_age'), days(w.age_days), w.status === 'very_stale' ? 'bad' : w.status === 'stale' ? 'warn' : ''))}
      ${renderHTML(tile(t('fresh.tile.stale_screens'), `${stale} / ${c.screens}`, stale ? 'warn' : ''))}
      ${renderHTML(tile(t('fresh.tile.past_date'), String(c.past_date_items), c.past_date_items ? 'bad' : ''))}
      ${renderHTML(tile(t('fresh.tile.expired'), String(c.expired_assigned_items), c.expired_assigned_items ? 'warn' : ''))}
    </div>
    <p class="corp-help" style="font-size:12px;margin:6px 0 18px">${uiText(t('fresh.thresholds', { stale: report.settings.stale_days, very: report.settings.very_stale_days, window: report.settings.window_days }))}</p>`;
}

function reasonsList(flags) {
  return `<ul class="fresh-why">${renderHTML((flags || []).map((f) => `<li>${uiText(freshnessWhy(f))}</li>`).join(''))}</ul>`;
}

function itemActions(i) {
  if (!report.can_write) return '';
  const a = [];
  if (i.type === 'content') {
    a.push(`<a class="btn btn-secondary btn-sm" href="#/content?open=${encodeURIComponent(i.id)}">${uiText(t('fresh.act.replace'))}</a>`);
    // An expired item already plays nowhere; "take it off" would only move its date.
    if (!i.flags.some((f) => f.code === 'expired_assigned')) {
      a.push(`<button type="button" class="btn btn-secondary btn-sm" data-act="remove">${uiText(t('fresh.act.remove'))}</button>`);
    }
    a.push(`<button type="button" class="btn btn-secondary btn-sm" data-act="expiry">${uiText(t('fresh.act.expiry'))}</button>`);
  } else {
    a.push(`<a class="btn btn-secondary btn-sm" href="${i.kind === 'slide' ? '#/slides' : '#/widgets'}">${uiText(t('fresh.act.edit'))}</a>`);
  }
  a.push(snoozeSelect());
  return `<div class="fresh-actions">${renderHTML(a.join(''))}</div>
    <div class="fresh-expiry" hidden>
      <label>${uiText(t('fresh.expiry_label'))} <input type="date" class="input" data-expiry-date></label>
      <button type="button" class="btn btn-primary btn-sm" data-act="expiry-save">${uiText(t('common.save'))}</button>
    </div>`;
}

function snoozeSelect() {
  return `<select class="input fresh-snooze" data-act="snooze" aria-label="${esc(t('fresh.act.snooze'))}" data-fil-i18n-aria-label="${binding('fresh.act.snooze', undefined)}">
    <option value="">${uiText(t('fresh.act.snooze'))}</option>
    <option value="30">${uiText(tn('fresh.snooze_for', 30))}</option>
    <option value="90">${uiText(tn('fresh.snooze_for', 90))}</option>
    <option value="365">${uiText(tn('fresh.snooze_for', 365))}</option>
  </select>`;
}

function itemsHtml() {
  const list = report.items.filter((i) => !i.snoozed_until && i.flags.length).slice(0, 50);
  return `<h2 class="fresh-h2">${uiText(t('fresh.offenders'))}</h2>
    ${renderHTML(list.length ? list.map((i) => `
      <div class="corp-card fresh-row" data-type="${esc(i.type)}" data-id="${esc(i.id)}">
        <div class="fresh-row-main">
          <div><strong>${uiText(i.name)}</strong> <span class="fresh-chips">${renderHTML(freshnessChipsHtml({ reasons: i.flags }))}</span></div>
          ${renderHTML(reasonsList(i.flags))}
          <div class="corp-help" style="font-size:12px">${uiText([
            i.last_changed ? t('fresh.last_changed', { date: fmtDate(i.last_changed) }) : '',
            i.screens ? tn('fresh.on_screens', i.screens) : '',
            i.playlists.length ? t('fresh.in_playlists', { names: i.playlists.map((p) => p.name).join(', ') }) : '',
          ].filter(Boolean).join(' · '))}</div>
        </div>
        ${renderHTML(itemActions(i))}
      </div>`).join('') : `<div class="corp-empty">${uiText(t('fresh.nothing'))}</div>`)}`;
}

function screensHtml() {
  const list = report.devices.filter((d) => !d.snoozed_until)
    .sort((a, b) => (b.age_days ?? -1) - (a.age_days ?? -1));
  if (!list.length) return '';
  return `<h2 class="fresh-h2">${uiText(t('fresh.screens'))}</h2>
    <div class="corp-card" style="padding:4px 16px">${renderHTML(list.map((d) => `
      <div class="fresh-line" data-type="device" data-id="${esc(d.id)}">
        <a href="#/device/${encodeURIComponent(d.id)}"><strong>${uiText(d.name)}</strong></a>
        <span class="fresh-status fresh-status-${esc(d.status)}">${uiText(t(`fresh.status.${d.status}`))}</span>
        <span class="corp-help" style="font-size:12px;flex:1;min-width:200px">${uiText(screenWhy(d))}</span>
        ${renderHTML(report.can_write && (d.status === 'stale' || d.status === 'very_stale') ? snoozeSelect() : '')}
      </div>`).join(''))}</div>`;
}

function screenWhy(d) {
  if (d.age_days == null) return t(d.basis === 'none' ? 'fresh.why.screen_none' : 'fresh.why.screen_live');
  const n = Math.floor(d.age_days);
  return d.basis === 'plays'
    ? t('fresh.why.screen_plays_plain', { n, window: report.settings.window_days })
    : t('fresh.why.screen_assigned_plain', { n });
}

function playlistsHtml() {
  const list = report.playlists.filter((p) => !p.snoozed_until && (p.status === 'stale' || p.status === 'very_stale'));
  if (!list.length) return '';
  return `<h2 class="fresh-h2">${uiText(t('fresh.playlists'))}</h2>
    <div class="corp-card" style="padding:4px 16px">${renderHTML(list.map((p) => `
      <div class="fresh-line" data-type="playlist" data-id="${esc(p.id)}">
        <a href="#/playlists/${encodeURIComponent(p.id)}"><strong>${uiText(p.name)}</strong></a>
        <span class="fresh-status fresh-status-${esc(p.status)}">${uiText(t(`fresh.status.${p.status}`))}</span>
        <span class="corp-help" style="font-size:12px;flex:1;min-width:200px">${uiText(days(p.age_days))}</span>
        ${renderHTML(report.can_write ? snoozeSelect() : '')}
      </div>`).join(''))}</div>`;
}

function snoozedHtml() {
  const s = [
    ...report.items.filter((i) => i.snoozed_until).map((i) => ({ type: i.type, id: i.id, name: i.name, until: i.snoozed_until })),
    ...report.devices.filter((d) => d.snoozed_until).map((d) => ({ type: 'device', id: d.id, name: d.name, until: d.snoozed_until })),
    ...report.playlists.filter((p) => p.snoozed_until).map((p) => ({ type: 'playlist', id: p.id, name: p.name, until: p.snoozed_until })),
  ];
  if (!s.length) return '';
  return `<details class="fresh-snoozed"><summary>${uiText(tn('fresh.snoozed', s.length))}</summary>
    <div class="corp-card" style="padding:4px 16px">${renderHTML(s.map((x) => `
      <div class="fresh-line" data-type="${esc(x.type)}" data-id="${esc(x.id)}">
        <strong>${uiText(x.name)}</strong>
        <span class="corp-help" style="font-size:12px;flex:1">${uiText(t('fresh.snoozed_until', { date: fmtDate(x.until) }))}</span>
        ${renderHTML(report.can_write ? `<button type="button" class="btn btn-secondary btn-sm" data-act="unsnooze">${uiText(t('fresh.act.unsnooze'))}</button>` : '')}
      </div>`).join(''))}</div></details>`;
}

function settingsHtml() {
  const s = report.settings;
  const dis = report.can_admin ? '' : 'disabled';
  return `<h2 class="fresh-h2">${uiText(t('fresh.settings'))}</h2>
    <div class="corp-card" style="padding:16px">
      <div class="fresh-settings">
        <label>${uiText(t('fresh.set.stale'))}<input type="number" class="input" min="1" max="3650" id="freshStale" value="${esc(s.stale_days)}" ${dis}></label>
        <label>${uiText(t('fresh.set.very'))}<input type="number" class="input" min="2" max="3650" id="freshVery" value="${esc(s.very_stale_days)}" ${dis}></label>
        <label>${uiText(t('fresh.set.window'))}<input type="number" class="input" min="1" max="90" id="freshWindow" value="${esc(s.window_days)}" ${dis}></label>
        <label class="fresh-check"><input type="checkbox" id="freshDigestWs" ${s.digest_enabled ? 'checked' : ''} ${dis}> ${uiText(t('fresh.set.digest_ws'))}</label>
      </div>
      ${renderHTML(report.can_admin ? `<button type="button" class="btn btn-primary btn-sm" id="freshSave" style="margin-top:10px">${uiText(t('common.save'))}</button>`
        : `<p class="corp-help" style="font-size:12px;margin-top:8px">${uiText(t('fresh.set.admin_only'))}</p>`)}
      <hr style="border:none;border-top:1px solid var(--border);margin:16px 0">
      <div id="freshDigestMine"></div>
    </div>`;
}

async function loadDigestPref() {
  const host = document.getElementById('freshDigestMine');
  if (!host || !report.can_write) return;
  let d;
  try { d = await api.getFreshnessDigest(); } catch { return; }
  if (!d || Array.isArray(d) || !document.contains(host)) return;
  const note = !d.email_configured ? t('fresh.digest.no_email') : d.email_alerts_off ? t('fresh.digest.alerts_off') : '';
  host.innerHTML = `<label class="fresh-check"><input type="checkbox" id="freshDigestMe" ${d.enabled ? 'checked' : ''}> ${uiText(t('fresh.digest.mine'))}</label>
    ${renderHTML(note ? `<p class="corp-help" style="font-size:12px;margin-top:6px">${uiText(note)}</p>` : '')}`;
  host.querySelector('#freshDigestMe').addEventListener('change', async (e) => {
    try { await api.setFreshnessDigest(e.target.checked); showToast(t('fresh.saved'), 'success'); }
    catch (err) { e.target.checked = !e.target.checked; showToast(err.uiMessage || err.message, 'error'); }
  });
}

function refreshAfterChange(app) {
  invalidateFreshnessChips();
  load(app);
}

function wire(app, body) {
  body.addEventListener('change', async (e) => {
    const sel = e.target.closest('select[data-act="snooze"]');
    if (!sel || !sel.value) return;
    const row = sel.closest('[data-type][data-id]');
    try {
      await api.snoozeFreshness(row.dataset.type, row.dataset.id, Number(sel.value));
      showToast(t('fresh.snoozed_toast'), 'success');
      refreshAfterChange(app);
    } catch (err) { sel.value = ''; showToast(err.uiMessage || err.message, 'error'); }
  });

  body.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-act]');
    if (!btn || btn.tagName === 'SELECT') return;
    const row = btn.closest('[data-type][data-id]');
    const act = btn.dataset.act;
    if (act === 'unsnooze') {
      try { await api.unsnoozeFreshness(row.dataset.type, row.dataset.id); refreshAfterChange(app); }
      catch (err) { showToast(err.uiMessage || err.message, 'error'); }
    } else if (act === 'remove') {
      const item = report.items.find((i) => i.id === row.dataset.id);
      if (!confirm(t('fresh.confirm_remove', { name: item ? item.name : '' }))) return;
      try {
        const r = await api.updateContent(row.dataset.id, { expires_at: Math.floor(Date.now() / 1000) });
        showToast(t(r && r.pending_review ? 'fresh.removed_review' : 'fresh.removed'), 'success');
        refreshAfterChange(app);
      } catch (err) { showToast(err.uiMessage || err.message, 'error'); }
    } else if (act === 'expiry') {
      const box = row.querySelector('.fresh-expiry');
      box.hidden = !box.hidden;
      if (!box.hidden) box.querySelector('[data-expiry-date]').focus();
    } else if (act === 'expiry-save') {
      const v = row.querySelector('[data-expiry-date]').value;
      if (!v) return;
      // The end of that day, in the viewer's own zone: "expires on the 31st" means after the 31st.
      const at = Math.floor(new Date(`${v}T23:59:59`).getTime() / 1000);
      if (!Number.isFinite(at)) return;
      try { await api.updateContent(row.dataset.id, { expires_at: at }); showToast(t('fresh.expiry_set', { date: v }), 'success'); refreshAfterChange(app); }
      catch (err) { showToast(err.uiMessage || err.message, 'error'); }
    }
  });

  const save = document.getElementById('freshSave');
  if (save) {
    save.addEventListener('click', async () => {
      const num = (id) => Number(document.getElementById(id).value);
      try {
        await api.updateFreshnessSettings({
          stale_days: num('freshStale'), very_stale_days: num('freshVery'), window_days: num('freshWindow'),
          digest_enabled: document.getElementById('freshDigestWs').checked,
        });
        showToast(t('fresh.saved'), 'success');
        refreshAfterChange(app);
      } catch (err) { showToast(err.uiMessage || err.message, 'error'); }
    });
  }
}

export function cleanup() { report = null; }
