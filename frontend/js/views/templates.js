import { uiText, renderHTML, translatedAttribute, bindMessage, attributeBinding, binding, bindText } from '../lib/i18n-bindings.js';

import { localizedError, displayValue, message as t, getLanguage } from '../i18n.js';

import { errorMessage, localizeServerError } from '../api.js';

import { api, assertLocalCallAllowed, getAuthHeaders } from '../api.js';
import { showToast } from '../components/toast.js';

import { localName, localDescription, localParams, initialFormValues, langQuery } from '../lib/template-i18n.js';
import {
  STATUS_FILTERS, KIND_FILTERS, ORIENTATION_FILTERS, matchesFilters, allTags, isActionable, orientationsOf,
  selectionToInstall, updatesOf, installSequentially,
} from '../lib/template-library-filter.js';
import { esc, isPlatformAdmin, hydrateAuthImages } from '../utils.js';
import { openContentPicker } from './widgets.js';

/*
 * The Templates library (#/templates): templates installed on this server, and the community
 * catalogs they come from.
 *
 * ⚠️ EVERY STRING FROM A MANIFEST OR A CATALOG INDEX IS THIRD-PARTY TEXT. A template's name,
 * description, author, tags, param labels, option labels, host names — all of it was written by
 * somebody who is not the operator and not us, and some of it arrives over the network from an
 * index. Every one of them goes through esc() on its way into markup, attributes included. The
 * preview is an iframe with sandbox="allow-scripts" and NEVER allow-same-origin: the preview URL is
 * on the dashboard's own origin, and the dashboard keeps its session token in localStorage (the
 * server also sends a `sandbox` CSP, but the attribute is the half this file owns).
 *
 * The server is the authority on who may install, import, uninstall or change the switches
 * (platform admins); the buttons here are hidden for everyone else only so nobody is offered a
 * control that will be refused.
 *
 * Names, descriptions and param labels are shown in the dashboard's language when the template
 * ships a translation for it (locales/<lang>.json — see lib/template-i18n.js); English otherwise.
 * A translation is third-party text exactly like the English, and goes through esc() the same way.
 */

const lang = () => getLanguage();
const nameOf = (tpl) => localName(tpl, lang());
const descOf = (tpl) => localDescription(tpl, lang());

// Own fetch helper, because request() in api.js drops the error body — and a 409 from uninstall
// carries the list of widgets still using the template, which is the whole point of the answer.
async function TAPI(url, opts = {}) {
  assertLocalCallAllowed(url, opts.method);
  const r = await fetch('/api' + url, {
    ...opts,
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders(), ...(opts.headers || {}) },
  });
  if (r.status === 401) { localStorage.removeItem('token'); window.location.reload(); throw localizedError(t("ui.labels.session_expired_b82819")); }
  const body = await r.json().catch(() => ({}));
  if (!r.ok) {
    const e = localizedError(localizeServerError(body.error) || t("ui.templates.request_failed_value0_ad6dc0", {value0: r.status}));
    e.status = r.status;
    e.body = body;
    throw e;
  }
  return body;
}

const UNSIGNED_PHRASE = 'I understand unsigned templates run unreviewed code on my screens';

function currentUser() {
  try { return JSON.parse(localStorage.getItem('user') || '{}') || {}; } catch { return {}; }
}

function fmtTime(v) {
  if (!v) return t('templates.never');
  const n = typeof v === 'number' ? (v < 1e12 ? v * 1000 : v) : Date.parse(String(v).includes('T') || String(v).endsWith('Z') ? v : String(v).replace(' ', 'T') + 'Z');
  if (!Number.isFinite(n)) return esc(String(v));
  return esc(displayValue(new Date(n), "toLocaleString", undefined));
}

function kindLabel(kind) {
  return kind === 'html' ? t('templates.kind_code') : t('templates.kind_slide');
}
function kindBadge(kind) {
  return `<span class="tpl-badge ${kind === 'html' ? 'tpl-badge-code' : 'tpl-badge-slide'}">${uiText(kindLabel(kind))}</span>`;
}
function kindIcon(kind) {
  return kind === 'html'
    ? `<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>`
    : `<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="4" width="20" height="14" rx="1.5"/><line x1="6" y1="9" x2="14" y2="9"/><line x1="6" y1="13" x2="11" y2="13"/></svg>`;
}
function trustBadge(tpl) {
  if (tpl.trust === 'verified') {
    return `<span class="tpl-badge tpl-badge-ok" title="${esc(t('templates.trust_verified_tip'))}" data-fil-i18n-title="${binding('templates.trust_verified_tip', undefined)}">${uiText(t('templates.trust_verified', { signer: tpl.signer || '?' }))}</span>`;
  }
  return `<span class="tpl-badge tpl-badge-warn" title="${esc(t('templates.trust_unverified_tip'))}" data-fil-i18n-title="${binding('templates.trust_unverified_tip', undefined)}">${uiText(t('templates.trust_unverified'))}</span>`;
}
function hostsLine(hosts) {
  const list = Array.isArray(hosts) ? hosts : [];
  if (!list.length) return `<div class="tpl-meta">${uiText(t('templates.network_none'))}</div>`;
  return `<div class="tpl-meta">${renderHTML(t('templates.network_hosts'))} ${renderHTML(list.map((h) => `<code>${uiText(h)}</code>`).join(' '))}</div>`;
}

/*
 * A card image: this server's content-addressed thumbnail route, or (library entries not cached
 * locally) an https URL on the catalog's host. Anything else — a javascript:/data: URL, a relative
 * path somewhere else on this origin — is not a thumbnail, and the kind icon is shown instead.
 * The <img> never carries credentials: the dashboard token is only ever sent by fetch().
 */
function thumbHtml(url, kind) {
  const u = typeof url === 'string' ? url : '';
  const ok = /^\/api\/templates\/thumb\/[0-9a-f]{64}$/.test(u) || /^https:\/\/[^\s"'<>]+$/i.test(u);
  if (!ok) return kindIcon(kind);
  return `<img data-thumb data-kind="${esc(kind)}" src="${esc(u)}" alt="" loading="lazy" referrerpolicy="no-referrer">`;
}
function wireThumbFallbacks(root) {
  root.querySelectorAll('img[data-thumb]').forEach((img) => img.addEventListener('error', () => {
    const wrap = img.parentElement;
    if (wrap) wrap.innerHTML = kindIcon(img.dataset.kind);
  }));
}

/* ------------------------------------------------------------------ small modal helper */

function openModal({ title, body, footer, width = 520 }) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal" style="width:${Number(width) || 520}px">
      <div class="modal-header"><h3>${uiText(title)}</h3>
        <button class="btn-icon" data-close aria-label="${esc(t('common.cancel'))}" data-fil-i18n-aria-label="${binding('common.cancel', undefined)}">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
      <div class="modal-body">${renderHTML(body)}</div>
      ${renderHTML(footer ? `<div class="modal-footer">${renderHTML(footer)}</div>` : '')}
    </div>`;
  document.body.appendChild(overlay);
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  const closers = [];
  function close() {
    document.removeEventListener('keydown', onKey);
    overlay.remove();
    for (const fn of closers) { try { fn(); } catch { /* ignore */ } }
  }
  document.addEventListener('keydown', onKey);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  overlay.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', close));
  return { overlay, close, onClose: (fn) => closers.push(fn), $: (sel) => overlay.querySelector(sel) };
}

function confirmModal({ title, body, confirmLabel, danger = false }) {
  return new Promise((resolve) => {
    let answered = false;
    const m = openModal({
      title,
      body,
      footer: `<button class="btn btn-secondary" data-close>${uiText(t('common.cancel'))}</button>
               <button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-ok>${uiText(confirmLabel)}</button>`,
    });
    m.onClose(() => { if (!answered) resolve(false); });
    m.$('[data-ok]').addEventListener('click', () => { answered = true; m.close(); resolve(true); });
  });
}

/* ------------------------------------------------------------------ the view */

let activeTab = 'installed';

export async function render(container) {
  const admin = isPlatformAdmin(currentUser());
  container.innerHTML = `
    <div class="page-header">
      <div><h1>${uiText(t('templates.title'))}</h1><div class="subtitle">${uiText(t('templates.subtitle'))}</div></div>
      ${renderHTML(admin ? `<div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn btn-secondary" id="tplImportBtn">${uiText(t('templates.import'))}</button>
        <button class="btn btn-secondary" id="tplSettingsBtn">${uiText(t('templates.settings'))}</button>
      </div>` : '')}
    </div>
    <p class="tpl-meta" style="margin:-6px 0 14px">${renderHTML(t('templates.builtin_note'))} <a href="#/signs">${uiText(t('signs.new_from_template'))} →</a></p>
    <div class="tabs" role="tablist">
      <div class="tab" data-tab="installed" role="tab">${uiText(t('templates.tab_installed'))}</div>
      <div class="tab" data-tab="library" role="tab">${uiText(t('templates.tab_library'))} <span id="tplNewCount"></span></div>
    </div>
    <div id="tplBody"></div>`;

  const body = container.querySelector('#tplBody');
  const setTab = (tab) => {
    activeTab = tab;
    container.querySelectorAll('[data-tab]').forEach((el) => el.classList.toggle('active', el.dataset.tab === tab));
    if (tab === 'library') renderLibrary(body, admin, refresh);
    else renderInstalled(body, admin, refresh);
  };
  const refresh = () => setTab(activeTab);
  container.querySelectorAll('[data-tab]').forEach((el) => el.addEventListener('click', () => setTab(el.dataset.tab)));
  if (admin) {
    container.querySelector('#tplImportBtn').addEventListener('click', () => openImportModal(refresh));
    container.querySelector('#tplSettingsBtn').addEventListener('click', () => openSettingsModal(refresh));
  }
  setTab(activeTab);
}

export function cleanup() {}

/* ------------------------------------------------------------------ installed */

async function renderInstalled(body, admin, refresh) {
  body.innerHTML = `<div class="tpl-meta">${uiText(t('templates.loading'))}</div>`;
  let list;
  try { list = (await TAPI('/templates/installed' + langQuery(lang()))).templates || []; } catch (e) {
    body.innerHTML = `<div class="tpl-callout tpl-callout-error">${uiText((errorMessage(e)))}</div>`;
    return;
  }
  if (activeTab !== 'installed') return;
  if (!list.length) {
    body.innerHTML = `<div class="empty-state"><h3>${uiText(t('templates.installed_empty_title'))}</h3>
      <p>${uiText(admin ? t('templates.installed_empty_admin') : t('templates.installed_empty_user'))}</p></div>`;
    return;
  }
  // How many of this workspace's widgets each template is behind, so it is obvious that "Use…" makes
  // ANOTHER independent widget rather than being a one-time step. Best-effort: no count on failure.
  const inUse = new Map();
  try {
    for (const w of (await TAPI('/widgets')) || []) {
      if (w.widget_type !== 'template') continue;
      let key = null;
      try { key = JSON.parse(w.config || '{}').template; } catch { /* unreadable config */ }
      if (key) inUse.set(key, (inUse.get(key) || 0) + 1);
    }
  } catch { /* counts are a hint, never a blocker */ }
  if (activeTab !== 'installed') return;
  body.innerHTML = `${renderHTML(toolbarHtml(instFilter, allTags(list), false))}<div id="tplInstList"></div>`;
  const listEl = body.querySelector('#tplInstList');
  function paint() {
    const shown = list.filter((tpl) => matchesFilters(tpl, instFilter, lang()));
    listEl.innerHTML = shown.length
      ? `<div class="content-grid tpl-grid">${renderHTML(shown.map((tpl) => installedCard(tpl, admin, inUse.get(tpl.key) || 0)).join(''))}</div>`
      : noMatchesHtml();
    listEl.querySelectorAll('[data-use]').forEach((b) => b.addEventListener('click', () => {
      const tpl = list.find((x) => x.key === b.dataset.use);
      if (tpl) openUseModal({ tpl });
    }));
    listEl.querySelectorAll('[data-uninstall]').forEach((b) => b.addEventListener('click', () => {
      const tpl = list.find((x) => x.key === b.dataset.uninstall);
      if (tpl) uninstall(tpl, refresh);
    }));
    const clear = listEl.querySelector('[data-clear-filters]');
    if (clear) clear.addEventListener('click', () => {
      resetFilter(instFilter);
      body.querySelectorAll('.tpl-toolbar [data-filter]').forEach((el) => { el.value = el.dataset.filter === 'q' || el.dataset.filter === 'tag' ? '' : 'all'; });
      paint();
    });
    wireThumbFallbacks(listEl);
  }
  wireToolbar(body, instFilter, paint);
  paint();
}

function installedCard(tpl, admin, used = 0) {
  const revoked = tpl.status && tpl.status !== 'active';
  const preview = thumbHtml(tpl.thumbnail, tpl.kind);
  return `
    <div class="content-item tpl-card${revoked ? ' tpl-card-revoked' : ''}">
      <div class="content-item-preview tpl-preview">${renderHTML(preview)}</div>
      ${renderHTML(revoked ? `<div class="tpl-banner-danger">${uiText(t('templates.revoked'))}${renderHTML(tpl.status_reason ? `: ${esc(tpl.status_reason)}` : '')}</div>` : '')}
      <div class="content-item-body">
        <div class="content-item-name" title="${esc(nameOf(tpl))}">${uiText(nameOf(tpl))}</div>
        <div class="tpl-meta">v${uiText(tpl.version)}${renderHTML(tpl.author ? ` · ${esc(tpl.author)}` : '')}${renderHTML(tpl.license ? ` · ${esc(tpl.license)}` : '')}</div>
        <div class="tpl-badges">${renderHTML(kindBadge(tpl.kind))} ${renderHTML(trustBadge(tpl))}</div>
        ${renderHTML(descOf(tpl) ? `<div class="tpl-desc">${uiText(descOf(tpl))}</div>` : '')}
        ${renderHTML(tpl.kind === 'html' ? hostsLine(tpl.network) : '')}
        ${renderHTML(!tpl.usable && !revoked && tpl.unusable_reason ? `<div class="tpl-meta tpl-warn-text">${uiText(tpl.unusable_reason)}</div>` : '')}
        ${renderHTML(used ? `<div class="tpl-meta tpl-inuse"><a href="#/widgets">${uiText(used === 1 ? t('templates.in_use_one') : t('templates.in_use_many', { count: used }))}</a>${renderHTML(tpl.usable ? ` · ${esc(t('templates.use_again_hint'))}` : '')}</div>` : '')}
      </div>
      <div class="content-item-actions">
        ${renderHTML(admin ? `<button class="btn btn-danger btn-sm" data-uninstall="${esc(tpl.key)}">${uiText(t('templates.uninstall'))}</button>` : '')}
        <button class="btn btn-primary btn-sm" data-use="${esc(tpl.key)}" ${tpl.usable ? '' : `disabled title="${esc(tpl.unusable_reason || '')}"`}>${uiText(t('templates.use'))}</button>
      </div>
    </div>`;
}

async function uninstall(tpl, refresh) {
  const ok = await confirmModal({
    title: t('templates.uninstall_title'),
    body: `<p>${uiText(t('templates.uninstall_confirm', { name: nameOf(tpl), version: tpl.version }))}</p>`,
    confirmLabel: t('templates.uninstall'),
    danger: true,
  });
  if (!ok) return;
  const [cat, id] = String(tpl.key).split('/');
  try {
    await TAPI(`/templates/installed/${encodeURIComponent(cat)}/${encodeURIComponent(id)}`, { method: 'DELETE' });
    showToast(t('templates.toast_uninstalled', { name: nameOf(tpl) }), 'success');
    refresh();
  } catch (e) {
    if (e.status === 409 && e.body && Array.isArray(e.body.widgets)) {
      openModal({
        title: t('templates.still_used_title'),
        body: `<p>${uiText(t('templates.still_used_desc', { name: nameOf(tpl), n: e.body.widgets.length }))}</p>
          <ul class="tpl-list">${renderHTML(e.body.widgets.map((w) => `<li>${uiText(w.name || w.id)} <span class="tpl-meta">(${uiText(w.workspace_id || '')})</span></li>`).join(''))}</ul>`,
        footer: `<a class="btn btn-secondary" href="#/widgets" data-close>${uiText(t('templates.go_widgets'))}</a><button class="btn btn-primary" data-close>${uiText(t('common.done'))}</button>`,
      });
      return;
    }
    showToast(errorMessage(e), 'error');
  }
}

/* ------------------------------------------------------------------ search, filters, selection */

/*
 * Search and filters. They live in module state so an install (which re-renders the tab) or a tab
 * switch keeps them; a page reload starts clean. The selection is the same: keys of library
 * entries ticked for a bulk install, kept until they are installed or cleared.
 */
const libFilter = { q: '', status: 'all', kind: 'all', orientation: 'all', tag: '' };
const instFilter = { q: '', kind: 'all', orientation: 'all', tag: '' };
const selected = new Set();

const SEARCH_ICON = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>';

function filterSelect(name, label, values, current, labelOf) {
  return `<select class="input tpl-filter" data-filter="${esc(name)}" aria-label="${esc(label)}"${attributeBinding("aria-label", label)}>
    ${renderHTML(values.map((v) => `<option value="${esc(v)}" ${v === current ? 'selected' : ''}>${uiText(labelOf(v))}</option>`).join(''))}
  </select>`;
}

/** The search box and filter dropdowns. `withStatus` = the library tab (installed has no status). */
function toolbarHtml(state, tags, withStatus) {
  const tagValues = ['', ...tags];
  return `<div class="tpl-toolbar" role="search">
    <div class="tpl-search">${renderHTML(SEARCH_ICON)}
      <input type="search" class="input" data-filter="q" value="${esc(state.q)}" autocomplete="off"
        placeholder="${esc(t('templates.search_placeholder'))}" data-fil-i18n-placeholder="${binding('templates.search_placeholder', undefined)}" aria-label="${esc(t('templates.search_label'))}" data-fil-i18n-aria-label="${binding('templates.search_label', undefined)}">
    </div>
    ${renderHTML(withStatus ? filterSelect('status', t('templates.filter_status'), STATUS_FILTERS, state.status, (v) => t(`templates.filter_status_${v}`)) : '')}
    ${renderHTML(filterSelect('kind', t('templates.filter_kind'), KIND_FILTERS, state.kind, (v) => (v === 'all' ? t('templates.filter_kind_all') : kindLabel(v))))}
    ${renderHTML(filterSelect('orientation', t('templates.filter_orientation'), ORIENTATION_FILTERS, state.orientation, (v) => t(`templates.filter_orientation_${v}`)))}
    ${renderHTML(tags.length ? filterSelect('tag', t('templates.filter_tag'), tagValues, state.tag, (v) => (v === '' ? t('templates.filter_tag_all') : v)) : '')}
  </div>`;
}

/**
 * Wire a toolbar to its state object. The search box repaints as you type (short debounce) without
 * rebuilding the toolbar, so it keeps focus; the dropdowns repaint on change.
 */
function wireToolbar(root, state, paint) {
  let timer = null;
  root.querySelectorAll('[data-filter]').forEach((el) => {
    const key = el.dataset.filter;
    if (key === 'q') {
      el.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(() => { state.q = el.value; paint(); }, 120); });
    } else {
      el.addEventListener('change', () => { state[key] = el.value; paint(); });
    }
  });
}

function resetFilter(state) {
  state.q = '';
  for (const k of ['status', 'kind', 'orientation']) if (k in state) state[k] = 'all';
  state.tag = '';
}

function noMatchesHtml() {
  return `<div class="empty-state tpl-nomatch"><h3>${uiText(t('templates.no_matches'))}</h3>
    <button class="btn btn-secondary btn-sm" data-clear-filters>${uiText(t('templates.clear_filters'))}</button></div>`;
}

/* ------------------------------------------------------------------ library */

async function renderLibrary(body, admin, refresh) {
  body.innerHTML = `<div class="tpl-meta">${uiText(t('templates.loading'))}</div>`;
  let lib;
  try { lib = await TAPI('/templates/library' + langQuery(lang())); } catch (e) {
    body.innerHTML = `<div class="tpl-callout tpl-callout-error">${uiText((errorMessage(e)))}</div>`;
    return;
  }
  if (activeTab !== 'library') return;
  const catalogs = Array.isArray(lib.catalogs) ? lib.catalogs : [];
  const entries = catalogs.flatMap((c) => c.templates || []);
  // A key that is no longer actionable (installed meanwhile, gone from the catalog) leaves the selection.
  for (const k of [...selected]) if (!entries.some((e) => e.key === k && isActionable(e))) selected.delete(k);

  let html = '';
  if (!lib.network_enabled) {
    html += `<div class="tpl-callout">
      <strong>${uiText(t('templates.network_off_title'))}</strong>
      <p>${uiText(t('templates.network_off_desc'))}</p>
      ${renderHTML(admin ? `<button class="btn btn-primary btn-sm" id="tplEnableNet">${uiText(t('templates.enable_network'))}</button>`
    : `<p class="tpl-meta">${uiText(t('templates.network_off_ask_admin'))}</p>`)}
    </div>`;
  }
  if (entries.length) {
    html += toolbarHtml(libFilter, allTags(entries), true);
    if (admin) {
      html += `<div class="tpl-bulkbar" id="tplBulkBar">
        <label class="tpl-check"><input type="checkbox" id="tplSelAll"> <span id="tplSelAllLabel"></span></label>
        <span class="tpl-meta" id="tplSelCount"></span>
        <button class="btn btn-secondary btn-sm" id="tplSelClear">${uiText(t('templates.bulk_clear'))}</button>
        <span class="tpl-bulk-spacer"></span>
        <button class="btn btn-secondary btn-sm" id="tplUpdateAll" hidden></button>
        <button class="btn btn-primary btn-sm" id="tplInstallSel" disabled></button>
      </div>`;
    }
  }
  html += '<div id="tplLibList"></div>';
  if (!catalogs.length) html += `<div class="empty-state"><h3>${uiText(t('templates.no_catalogs'))}</h3></div>`;
  body.innerHTML = html;

  const newCount = entries.filter((e) => e.is_new || e.is_updated).length;
  const counter = document.getElementById('tplNewCount');
  if (counter) counter.innerHTML = newCount ? `<span class="tpl-badge tpl-badge-new">${uiText(String(newCount))}</span>` : '';

  const listEl = body.querySelector('#tplLibList');
  const visible = () => entries.filter((e) => matchesFilters(e, libFilter, lang()));

  function updateBulkBar() {
    if (!admin || !entries.length) return;
    const shown = visible().filter(isActionable);
    const allShownSelected = shown.length > 0 && shown.every((e) => selected.has(e.key));
    const selAll = body.querySelector('#tplSelAll');
    selAll.checked = allShownSelected;
    selAll.indeterminate = !allShownSelected && shown.some((e) => selected.has(e.key));
    selAll.disabled = !shown.length;
    bindText(body.querySelector('#tplSelAllLabel'), 'templates.bulk_select_shown', { n: shown.length });
    const picked = selectionToInstall(entries, selected);
    bindMessage(body.querySelector('#tplSelCount'), picked.length ? t('templates.bulk_selected', { n: picked.length }) : '');
    body.querySelector('#tplSelClear').hidden = !picked.length;
    const inst = body.querySelector('#tplInstallSel');
    inst.disabled = !picked.length;
    bindMessage(inst, picked.length ? t('templates.bulk_install_selected', { n: picked.length }) : t('templates.bulk_install_none'));
    const updates = updatesOf(entries);
    const upd = body.querySelector('#tplUpdateAll');
    upd.hidden = !updates.length;
    bindText(upd, 'templates.bulk_update_all', { n: updates.length });
  }

  function paint() {
    const shown = new Set(visible().map((e) => e.key));
    let out = '';
    for (const c of catalogs) {
      const own = (c.templates || []).filter((e) => shown.has(e.key));
      out += `<section class="tpl-catalog">
        <div class="tpl-catalog-head">
          <div>
            <h3>${uiText(c.label || c.id)} ${renderHTML(c.enabled ? '' : `<span class="tpl-badge">${uiText(t('templates.catalog_disabled'))}</span>`)}</h3>
            <div class="tpl-meta">${renderHTML(t('templates.catalog_key'))} <code>${uiText(c.key_id || '?')}</code> · ${renderHTML(t('templates.last_checked'))} ${renderHTML(fmtTime(c.last_checked))}${renderHTML(c.serial ? ` · ${esc(t('templates.serial'))} ${esc(c.serial)}` : '')}${renderHTML(c.templates && c.templates.length ? ` · ${esc(t('templates.shown_of', { shown: own.length, total: c.templates.length }))}` : '')}</div>
          </div>
          ${renderHTML(admin ? `<button class="btn btn-secondary btn-sm" data-refresh="${esc(c.id)}" ${lib.network_enabled && c.enabled && c.url ? '' : `disabled title="${esc(t('templates.check_now_disabled'))}"`}>${uiText(t('templates.check_now'))}</button>` : '')}
        </div>
        ${renderHTML(c.stale ? `<div class="tpl-callout tpl-callout-warn">${uiText(t('templates.stale', { date: c.expires || '' }))}</div>` : '')}
        ${renderHTML(c.last_error ? `<div class="tpl-callout tpl-callout-error">${uiText(t('templates.last_error'))} ${uiText(c.last_error)}</div>` : '')}
        ${renderHTML(!(c.templates && c.templates.length)
    ? `<div class="tpl-meta" style="padding:8px 0 16px">${uiText(c.enabled ? t('templates.catalog_empty') : t('templates.catalog_off'))}</div>`
    : own.length
      ? `<div class="content-grid tpl-grid">${renderHTML(own.map((e) => libraryCard(e, admin)).join(''))}</div>`
      : '')}
      </section>`;
    }
    if (entries.length && !shown.size) out += noMatchesHtml();
    listEl.innerHTML = out;
    wireThumbFallbacks(listEl);
    listEl.querySelectorAll('[data-refresh]').forEach((b) => b.addEventListener('click', async () => {
      b.disabled = true;
      bindText(b, 'templates.checking', undefined);
      try {
        const r = await TAPI(`/templates/catalogs/${encodeURIComponent(b.dataset.refresh)}/refresh`, { method: 'POST', body: '{}' });
        showToast(t('templates.toast_checked', { n: r.templates }), 'success');
      } catch (e) { showToast(errorMessage(e), 'error'); }
      refresh();
    }));
    listEl.querySelectorAll('[data-install]').forEach((b) => b.addEventListener('click', () => {
      const e = entries.find((x) => x.key === b.dataset.install);
      if (e) installFromLibrary(e, refresh);
    }));
    listEl.querySelectorAll('[data-select]').forEach((cb) => cb.addEventListener('change', () => {
      if (cb.checked) selected.add(cb.dataset.select); else selected.delete(cb.dataset.select);
      cb.closest('.tpl-card')?.classList.toggle('tpl-card-selected', cb.checked);
      updateBulkBar();
    }));
    const clear = listEl.querySelector('[data-clear-filters]');
    if (clear) clear.addEventListener('click', () => {
      resetFilter(libFilter);
      body.querySelectorAll('.tpl-toolbar [data-filter]').forEach((el) => { el.value = el.dataset.filter === 'q' || el.dataset.filter === 'tag' ? '' : 'all'; });
      paint();
    });
    updateBulkBar();
  }

  wireToolbar(body, libFilter, paint);
  paint();

  if (admin && entries.length) {
    body.querySelector('#tplSelAll').addEventListener('change', (ev) => {
      for (const e of visible().filter(isActionable)) {
        if (ev.target.checked) selected.add(e.key); else selected.delete(e.key);
      }
      paint();
    });
    body.querySelector('#tplSelClear').addEventListener('click', () => { selected.clear(); paint(); });
    body.querySelector('#tplInstallSel').addEventListener('click', () => installMany(selectionToInstall(entries, selected), refresh));
    body.querySelector('#tplUpdateAll').addEventListener('click', () => installMany(updatesOf(entries), refresh));
  }

  const en = body.querySelector('#tplEnableNet');
  if (en) en.addEventListener('click', async () => {
    en.disabled = true;
    try {
      await TAPI('/templates/settings', { method: 'PUT', body: JSON.stringify({ network_enabled: true }) });
      showToast(t('templates.toast_network_on'), 'success');
      refresh();
    } catch (e) { en.disabled = false; showToast(errorMessage(e), 'error'); }
  });

  // Opening the tab is what "seen" means; the badges on screen stay until the next load.
  if (newCount) TAPI('/templates/library/seen', { method: 'POST', body: '{}' }).catch(() => {});
}

function libraryCard(e, admin) {
  const badges = [];
  if (e.is_new) badges.push(`<span class="tpl-badge tpl-badge-new">${uiText(t('templates.badge_new'))}</span>`);
  if (e.is_updated) badges.push(`<span class="tpl-badge tpl-badge-new">${uiText(t('templates.badge_updated'))}</span>`);
  let status = '';
  if (e.update_available) status = `<span class="tpl-badge tpl-badge-warn">${uiText(t('templates.update_available', { from: e.installed, to: e.latest }))}</span>`;
  else if (e.installed) status = `<span class="tpl-badge tpl-badge-ok">${uiText(t('templates.installed_version', { version: e.installed }))}</span>`;
  const actionable = admin && isActionable(e);
  const action = actionable
    ? `<button class="btn btn-primary btn-sm" data-install="${esc(e.key)}">${uiText(e.installed ? t('templates.update') : t('templates.install'))}</button>`
    : '';
  const isSel = actionable && selected.has(e.key);
  const orient = orientationsOf(e);
  return `
    <div class="content-item tpl-card${isSel ? ' tpl-card-selected' : ''}">
      ${renderHTML(actionable ? `<label class="tpl-select" title="${esc(t('templates.bulk_select_one', { name: nameOf(e) }))}" data-fil-i18n-title="${binding('templates.bulk_select_one', { name: nameOf(e) })}">
        <input type="checkbox" data-select="${esc(e.key)}" ${isSel ? 'checked' : ''} aria-label="${esc(t('templates.bulk_select_one', { name: nameOf(e) }))}" data-fil-i18n-aria-label="${binding('templates.bulk_select_one', { name: nameOf(e) })}">
      </label>` : '')}
      <div class="content-item-preview tpl-preview">${renderHTML(thumbHtml(e.thumbnail, e.kind))}</div>
      <div class="content-item-body">
        <div class="content-item-name" title="${esc(nameOf(e))}">${uiText(nameOf(e))}</div>
        <div class="tpl-meta">v${uiText(e.latest)}${renderHTML(e.author ? ` · ${esc(e.author)}` : '')}${renderHTML(e.license ? ` · ${esc(e.license)}` : '')}</div>
        <div class="tpl-badges">${renderHTML(kindBadge(e.kind))} ${renderHTML(orient.map((o) => `<span class="tpl-badge">${uiText(t(`templates.filter_orientation_${o === 'portrait' ? 'portrait' : 'landscape'}`))}</span>`).join(' '))} ${renderHTML(badges.join(' '))} ${renderHTML(status)}</div>
        ${renderHTML(descOf(e) ? `<div class="tpl-desc">${uiText(descOf(e))}</div>` : '')}
        ${renderHTML(Array.isArray(e.tags) && e.tags.length ? `<div class="tpl-tags">${renderHTML(e.tags.map((x) => `<span class="tpl-tag">${uiText(x)}</span>`).join(''))}</div>` : '')}
        ${renderHTML(e.kind === 'html' ? hostsLine(e.network) : '')}
        ${renderHTML(e.compatible === false ? `<div class="tpl-meta tpl-warn-text">${uiText(t('templates.needs_server', { version: e.min_server || '?' }))}</div>` : '')}
      </div>
      <div class="content-item-actions">${renderHTML(action)}</div>
    </div>`;
}

const installBody = (e) => JSON.stringify({ catalog: e.catalog, id: e.id, version: e.latest });

async function installFromLibrary(e, refresh) {
  const code = e.kind === 'html';
  const ok = await confirmModal({
    title: e.installed ? t('templates.update_title', { name: nameOf(e) }) : t('templates.install_title', { name: nameOf(e) }),
    body: `
      <p>${uiText(t('templates.install_confirm', { name: nameOf(e), version: e.latest, catalog: e.catalog }))}</p>
      <p>${uiText(t('templates.kind'))} ${renderHTML(kindBadge(e.kind))}</p>
      ${renderHTML(code ? `<div class="tpl-callout tpl-callout-warn">
          <p><strong>${uiText(t('templates.code_warning'))}</strong></p>
          ${renderHTML(hostsLine(e.network))}
        </div>` : `<p class="tpl-meta">${uiText(t('templates.slide_note'))}</p>`)}
      <p class="tpl-meta">${uiText(t('templates.install_instance_wide'))}</p>`,
    confirmLabel: e.installed ? t('templates.update') : t('templates.install'),
  });
  if (!ok) return;
  try {
    await TAPI('/templates/install', { method: 'POST', body: installBody(e) });
    selected.delete(e.key);
    showToast(t('templates.toast_installed', { name: nameOf(e), version: e.latest }), 'success');
  } catch (err) { showToast(errorMessage(err), 'error'); }
  refresh();
}

/*
 * Install or update several at once. One confirmation lists every template, and every CODE template
 * is named with the hosts it may contact — the same disclosure the single install gives, never
 * folded into a count. Installs then run one at a time through the ordinary install endpoint, so
 * each is checked by the server exactly as a single install is; a failure is reported and the rest
 * carry on. Closing the progress window stops after the current one.
 */
async function installMany(list, refresh) {
  if (!list.length) return;
  if (list.length === 1) return installFromLibrary(list[0], refresh);
  const code = list.filter((e) => e.kind === 'html');
  const row = (e) => `<li>${uiText(nameOf(e))} <span class="tpl-meta">${uiText(e.installed
    ? t('templates.bulk_row_update', { from: e.installed, to: e.latest })
    : t('templates.bulk_row_install', { version: e.latest }))}</span></li>`;
  const ok = await confirmModal({
    title: t('templates.bulk_title', { n: list.length }),
    body: `
      <ul class="tpl-list tpl-bulk-list">${renderHTML(list.map(row).join(''))}</ul>
      ${renderHTML(code.length ? `<div class="tpl-callout tpl-callout-warn">
          <p><strong>${uiText(t('templates.bulk_code_warning', { n: code.length }))}</strong></p>
          ${renderHTML(code.map((e) => `<div class="tpl-bulk-code"><div>${uiText(nameOf(e))}</div>${renderHTML(hostsLine(e.network))}</div>`).join(''))}
        </div>` : `<p class="tpl-meta">${uiText(t('templates.slide_note'))}</p>`)}
      <p class="tpl-meta">${uiText(t('templates.install_instance_wide'))}</p>`,
    confirmLabel: t('templates.bulk_confirm', { n: list.length }),
  });
  if (!ok) return;

  let stop = false;
  let finished = false;
  const m = openModal({
    title: t('templates.bulk_title', { n: list.length }),
    body: `<div class="tpl-progress"><div class="tpl-progress-bar" id="tplProgBar"></div></div>
      <p id="tplProgText" class="tpl-meta" aria-live="polite"></p><div id="tplProgResult"></div>`,
    footer: `<button class="btn btn-secondary" data-close id="tplProgClose">${uiText(t('templates.bulk_stop'))}</button>`,
  });
  m.onClose(() => { stop = true; if (finished) refresh(); });
  const result = await installSequentially(
    list,
    async (e) => {
      await TAPI('/templates/install', { method: 'POST', body: installBody(e) });
      selected.delete(e.key);
    },
    ({ done, total, entry }) => {
      const bar = m.$('#tplProgBar');
      if (bar) bar.style.width = `${Math.round((done / total) * 100)}%`;
      const txt = m.$('#tplProgText');
      if (txt) bindMessage(txt, entry ? t('templates.bulk_progress', { done: done + 1, total, name: nameOf(entry) }) : '');
    },
    { shouldStop: () => stop },
  );
  finished = true;
  const skipped = list.length - result.ok.length - result.failed.length;
  if (stop) {
    // The window was closed mid-run: report in a toast instead.
    showToast(t('templates.bulk_done', { ok: result.ok.length, total: list.length }), result.failed.length ? 'error' : 'success');
    refresh();
    return;
  }
  bindText(m.$('#tplProgText'), 'templates.bulk_done', { ok: result.ok.length, total: list.length });
  m.$('#tplProgResult').innerHTML = result.failed.length
    ? `<div class="tpl-callout tpl-callout-error"><p><strong>${uiText(t('templates.bulk_failed', { n: result.failed.length }))}</strong></p>
        <ul class="tpl-list">${renderHTML(result.failed.map((f) => `<li>${uiText(nameOf(f.entry))}: ${uiText(f.error)}</li>`).join(''))}</ul></div>`
    : (skipped ? '' : `<div class="tpl-callout tpl-callout-ok">${uiText(t('templates.bulk_all_ok'))}</div>`);
  bindText(m.$('#tplProgClose'), 'templates.bulk_close', undefined);
  if (!result.failed.length) showToast(t('templates.bulk_done', { ok: result.ok.length, total: list.length }), 'success');
}

/* ------------------------------------------------------------------ import */

function openImportModal(refresh) {
  const m = openModal({
    title: t('templates.import_title'),
    body: `
      <p class="modal-description">${uiText(t('templates.import_desc'))}</p>
      <div class="form-group"><input type="file" id="tplImportFile" class="input" accept=".sttemplate,.zip,application/zip,application/json"></div>
      <div class="form-group"><label style="display:flex;gap:8px;align-items:center;cursor:pointer">
        <input type="checkbox" id="tplImportBundle"> ${uiText(t('templates.import_bundle'))}</label>
        <div class="tpl-meta">${uiText(t('templates.import_bundle_hint'))}</div></div>
      <div id="tplImportStatus" class="tpl-meta"></div>`,
    footer: `<button class="btn btn-secondary" data-close>${uiText(t('common.cancel'))}</button>
             <button class="btn btn-primary" id="tplImportGo">${uiText(t('templates.import'))}</button>`,
  });
  const status = m.$('#tplImportStatus');
  m.$('#tplImportGo').addEventListener('click', async () => {
    const file = m.$('#tplImportFile').files[0];
    if (!file) { bindText(status, 'templates.import_pick_file', undefined); return; }
    const bundle = m.$('#tplImportBundle').checked;
    const url = '/templates/import' + (bundle ? '?kind=bundle' : '');
    const go = m.$('#tplImportGo');
    go.disabled = true;
    bindText(status, 'templates.importing', undefined);
    try {
      assertLocalCallAllowed(url, 'POST');
      const r = await fetch('/api' + url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/octet-stream', ...getAuthHeaders() },
        body: file,
      });
      const out = await r.json().catch(() => ({}));
      if (!r.ok) throw localizedError(localizeServerError(out.error) || t("ui.templates.request_failed_value0_ad6dc0", {value0: r.status}));
      if (out.bundle) {
        showToast(t('templates.toast_bundle', { catalog: out.bundle.catalog, n: out.bundle.templates, packages: out.bundle.packages }), 'success');
        activeTab = 'library';
      } else {
        showToast(t('templates.toast_imported', { name: out.name, version: out.version }), 'success');
        activeTab = 'installed';
      }
      m.close();
      refresh();
    } catch (e) {
      go.disabled = false;
      status.innerHTML = `<span class="tpl-warn-text">${uiText((errorMessage(e)))}</span>`;
    }
  });
}

/* ------------------------------------------------------------------ settings */

async function openSettingsModal(refresh) {
  const m = openModal({ title: t('templates.settings_title'), body: `<div class="tpl-meta">${uiText(t('templates.loading'))}</div>`, width: 720 });
  m.onClose(refresh);
  const bodyEl = m.$('.modal-body');

  async function draw() {
    let s, cats;
    try {
      [s, cats] = await Promise.all([TAPI('/templates/settings'), TAPI('/templates/catalogs')]);
    } catch (e) { bodyEl.innerHTML = `<div class="tpl-callout tpl-callout-error">${uiText((errorMessage(e)))}</div>`; return; }
    const list = cats.catalogs || [];
    bodyEl.innerHTML = `
      <div class="form-group">
        <label style="display:flex;gap:8px;align-items:center;cursor:pointer;font-size:14px;color:var(--text-primary)">
          <input type="checkbox" id="tplSetNet" ${s.network_enabled ? 'checked' : ''}> ${uiText(t('templates.setting_network'))}</label>
        <div class="tpl-meta">${uiText(t('templates.setting_network_hint'))}</div>
      </div>
      <div class="form-group">
        <label style="display:flex;gap:8px;align-items:center;cursor:pointer;font-size:14px;color:var(--text-primary)">
          <input type="checkbox" id="tplSetUnsigned" ${s.unsigned_code_allowed ? 'checked' : ''}> ${uiText(t('templates.setting_unsigned'))}</label>
        <div class="tpl-meta">${uiText(t('templates.setting_unsigned_hint'))}</div>
        <div id="tplUnsignedConfirm" class="tpl-callout tpl-callout-warn" style="display:none;margin-top:8px">
          <p>${uiText(t('templates.unsigned_type_phrase'))}</p>
          <p><code>${uiText(UNSIGNED_PHRASE)}</code></p>
          <input type="text" class="input" id="tplUnsignedPhrase" autocomplete="off" spellcheck="false">
          <div style="display:flex;gap:8px;margin-top:8px">
            <button class="btn btn-secondary btn-sm" id="tplUnsignedCancel">${uiText(t('common.cancel'))}</button>
            <button class="btn btn-danger btn-sm" id="tplUnsignedGo" disabled>${uiText(t('templates.unsigned_enable'))}</button>
          </div>
        </div>
      </div>
      <h4 style="margin:20px 0 8px">${uiText(t('templates.catalogs'))}</h4>
      <div class="table-wrap"><table class="tpl-table">
        <thead><tr><th>${uiText(t('templates.col_catalog'))}</th><th>${uiText(t('templates.col_key'))}</th><th>${uiText(t('templates.col_status'))}</th><th></th></tr></thead>
        <tbody>${renderHTML(list.map((c) => `<tr>
          <td><strong>${uiText(c.label)}</strong> <span class="tpl-meta">(${uiText(c.id)})</span>${renderHTML(c.builtin ? ` <span class="tpl-badge">${uiText(t('templates.builtin'))}</span>` : '')}<div class="tpl-meta tpl-break">${uiText(c.url || t('templates.no_url'))}</div></td>
          <td><code>${uiText(c.key_id || '?')}</code></td>
          <td class="tpl-meta">${renderHTML(t('templates.last_checked'))} ${renderHTML(fmtTime(c.last_checked))}${renderHTML(c.last_error ? `<div class="tpl-warn-text">${uiText(c.last_error)}</div>` : '')}</td>
          <td style="white-space:nowrap">
            <label style="display:inline-flex;gap:4px;align-items:center;cursor:pointer"><input type="checkbox" data-cat-toggle="${esc(c.id)}" ${c.enabled ? 'checked' : ''}> ${uiText(t('templates.enabled'))}</label>
            ${renderHTML(c.builtin ? '' : `<button class="btn btn-danger btn-sm" data-cat-remove="${esc(c.id)}">${uiText(t('templates.remove'))}</button>`)}
          </td></tr>`).join(''))}</tbody>
      </table></div>
      <details style="margin-top:12px"><summary style="cursor:pointer">${uiText(t('templates.add_catalog'))}</summary>
        <div style="margin-top:10px">
          <p class="tpl-meta">${uiText(t('templates.add_catalog_hint'))}</p>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
            <div class="form-group"><label>${uiText(t('templates.catalog_id'))}</label><input class="input" id="tplCatId" ${translatedAttribute("placeholder", "ui.templates.placeholder_acme_822b33")} maxlength="32"></div>
            <div class="form-group"><label>${uiText(t('templates.catalog_label'))}</label><input class="input" id="tplCatLabel" maxlength="60"></div>
          </div>
          <div class="form-group"><label>${uiText(t('templates.catalog_url'))}</label><input class="input" id="tplCatUrl" placeholder="https://example.com/templates/index.json"></div>
          <div class="form-group"><label>${uiText(t('templates.catalog_pubkey'))}</label><textarea class="input" id="tplCatKey" rows="4" ${translatedAttribute("placeholder", "ui.templates.placeholder_begin_public_key_59a583")} spellcheck="false"></textarea></div>
          <button class="btn btn-primary btn-sm" id="tplCatAdd">${uiText(t('templates.add_catalog_btn'))}</button>
        </div>
      </details>`;

    const put = (payload) => TAPI('/templates/settings', { method: 'PUT', body: JSON.stringify(payload) });
    const net = bodyEl.querySelector('#tplSetNet');
    net.addEventListener('change', async () => {
      try { await put({ network_enabled: net.checked }); showToast(net.checked ? t('templates.toast_network_on') : t('templates.toast_network_off'), 'success'); }
      catch (e) { net.checked = !net.checked; showToast(errorMessage(e), 'error'); }
    });
    const uns = bodyEl.querySelector('#tplSetUnsigned');
    const box = bodyEl.querySelector('#tplUnsignedConfirm');
    const phrase = bodyEl.querySelector('#tplUnsignedPhrase');
    const goBtn = bodyEl.querySelector('#tplUnsignedGo');
    uns.addEventListener('change', async () => {
      if (uns.checked) {
        // Said, not clicked past: the server refuses without the exact phrase.
        uns.checked = false;
        box.style.display = '';
        phrase.value = '';
        goBtn.disabled = true;
        phrase.focus();
        return;
      }
      try { await put({ unsigned_code_allowed: false }); showToast(t('templates.toast_unsigned_off'), 'success'); }
      catch (e) { uns.checked = true; showToast(errorMessage(e), 'error'); }
    });
    phrase.addEventListener('input', () => { goBtn.disabled = phrase.value.trim() !== UNSIGNED_PHRASE; });
    bodyEl.querySelector('#tplUnsignedCancel').addEventListener('click', () => { box.style.display = 'none'; });
    goBtn.addEventListener('click', async () => {
      try {
        await put({ unsigned_code_allowed: true, confirm: phrase.value.trim() });
        showToast(t('templates.toast_unsigned_on'), 'success');
        box.style.display = 'none';
        uns.checked = true;
      } catch (e) { showToast(errorMessage(e), 'error'); }
    });
    bodyEl.querySelectorAll('[data-cat-toggle]').forEach((cb) => cb.addEventListener('change', async () => {
      try {
        await TAPI(`/templates/catalogs/${encodeURIComponent(cb.dataset.catToggle)}`, { method: 'PATCH', body: JSON.stringify({ enabled: cb.checked }) });
      } catch (e) { cb.checked = !cb.checked; showToast(errorMessage(e), 'error'); }
    }));
    bodyEl.querySelectorAll('[data-cat-remove]').forEach((b) => b.addEventListener('click', async () => {
      const id = b.dataset.catRemove;
      if (!window.confirm(t('templates.remove_catalog_confirm', { id }))) return;
      try { await TAPI(`/templates/catalogs/${encodeURIComponent(id)}`, { method: 'DELETE' }); showToast(t('templates.toast_catalog_removed'), 'success'); draw(); }
      catch (e) { showToast(errorMessage(e), 'error'); }
    }));
    bodyEl.querySelector('#tplCatAdd').addEventListener('click', async () => {
      const payload = {
        id: bodyEl.querySelector('#tplCatId').value.trim(),
        label: bodyEl.querySelector('#tplCatLabel').value.trim(),
        url: bodyEl.querySelector('#tplCatUrl').value.trim(),
        public_key: bodyEl.querySelector('#tplCatKey').value.trim(),
      };
      try { await TAPI('/templates/catalogs', { method: 'POST', body: JSON.stringify(payload) }); showToast(t('templates.toast_catalog_added'), 'success'); draw(); }
      catch (e) { showToast(errorMessage(e), 'error'); }
    });
  }
  draw();
}

/* ------------------------------------------------------------------ use / edit form */

function supportedTimezones() {
  try { return Intl.supportedValuesOf('timeZone') || []; } catch { return []; }
}
const COMMON_LOCALES = ['en', 'en-GB', 'en-US', 'de', 'de-CH', 'es', 'fr', 'it', 'ja', 'nl', 'pt', 'pt-BR', 'zh', 'hi'];

function toHexColor(v) {
  const s = String(v || '');
  if (/^#[0-9a-fA-F]{6}$/.test(s)) return s;
  if (/^#[0-9a-fA-F]{3}$/.test(s)) return '#' + s.slice(1).split('').map((c) => c + c).join('');
  return '#000000';
}

function paramFieldHtml(p, value, dataSources) {
  const id = 'tplp_' + p.name;
  const label = `${esc(p.label || p.name)}${p.required ? ' *' : ''}`;
  const help = p.help ? `<div class="tpl-meta">${uiText(p.help)}</div>` : '';
  const v = value === undefined || value === null ? '' : value;
  switch (p.type) {
    case 'textarea':
      return `<div class="form-group"><label for="${esc(id)}">${renderHTML(label)}</label><textarea class="input" id="${esc(id)}" data-param="${esc(p.name)}" rows="3" maxlength="${Number(p.max) || 2000}">${uiText(v)}</textarea>${renderHTML(help)}</div>`;
    case 'color':
      return `<div class="form-group"><label for="${esc(id)}">${renderHTML(label)}</label><input type="color" id="${esc(id)}" data-param="${esc(p.name)}" value="${esc(toHexColor(v))}" style="width:60px;height:32px;border:none;background:none">${renderHTML(help)}</div>`;
    case 'number':
      return `<div class="form-group"><label for="${esc(id)}">${renderHTML(label)}</label><input type="number" class="input" id="${esc(id)}" data-param="${esc(p.name)}" value="${esc(v)}"${p.min !== undefined ? ` min="${esc(p.min)}"` : ''}${p.max !== undefined ? ` max="${esc(p.max)}"` : ''}${p.step !== undefined ? ` step="${esc(p.step)}"` : ''}>${renderHTML(help)}</div>`;
    case 'select':
      return `<div class="form-group"><label for="${esc(id)}">${renderHTML(label)}</label><select class="input" id="${esc(id)}" data-param="${esc(p.name)}">${renderHTML((p.options || []).map((o) => `<option value="${esc(o.value)}" ${String(o.value) === String(v) ? 'selected' : ''}>${uiText(o.label || o.value)}</option>`).join(''))}</select>${renderHTML(help)}</div>`;
    case 'checkbox':
      return `<div class="form-group"><label style="display:flex;gap:8px;align-items:center;cursor:pointer"><input type="checkbox" id="${esc(id)}" data-param="${esc(p.name)}" ${v === true || v === 'true' ? 'checked' : ''}> ${renderHTML(label)}</label>${renderHTML(help)}</div>`;
    case 'timezone': {
      const zones = supportedTimezones();
      if (!zones.length) return `<div class="form-group"><label for="${esc(id)}">${renderHTML(label)}</label><input class="input" id="${esc(id)}" data-param="${esc(p.name)}" value="${esc(v)}" ${translatedAttribute("placeholder", "ui.templates.placeholder_europe_london_d851b3")}>${renderHTML(help)}</div>`;
      const all = [...new Set([v, 'UTC', ...zones].filter(Boolean))].sort();
      return `<div class="form-group"><label for="${esc(id)}">${renderHTML(label)}</label><select class="input" id="${esc(id)}" data-param="${esc(p.name)}">
        <option value="" ${v === '' ? 'selected' : ''}>${uiText(t('templates.tz_screen'))}</option>
        ${renderHTML(all.map((z) => `<option value="${esc(z)}" ${z === v ? 'selected' : ''}>${uiText(z)}</option>`).join(''))}</select>${renderHTML(help)}</div>`;
    }
    case 'locale':
      return `<div class="form-group"><label for="${esc(id)}">${renderHTML(label)}</label><input class="input" id="${esc(id)}" data-param="${esc(p.name)}" value="${esc(v)}" list="${esc(id)}_list" placeholder="${esc(t('templates.locale_placeholder'))}" data-fil-i18n-placeholder="${binding('templates.locale_placeholder', undefined)}" maxlength="32">
        <datalist id="${esc(id)}_list">${renderHTML(COMMON_LOCALES.map((l) => `<option value="${esc(l)}">`).join(''))}</datalist>${renderHTML(help)}</div>`;
    case 'data_source': {
      const known = dataSources.some((d) => d.slug === v);
      return `<div class="form-group"><label for="${esc(id)}">${renderHTML(label)}</label><select class="input" id="${esc(id)}" data-param="${esc(p.name)}">
        <option value="">${uiText(t('templates.ds_none'))}</option>
        ${renderHTML(dataSources.map((d) => `<option value="${esc(d.slug)}" ${d.slug === v ? 'selected' : ''}>${uiText(d.name)} (${uiText(d.type)})</option>`).join(''))}
        ${renderHTML(v && !known ? `<option value="${esc(v)}" selected>${uiText(v)} — ${uiText(t('templates.ds_missing'))}</option>` : '')}
      </select>${renderHTML(dataSources.length ? '' : `<div class="tpl-meta">${renderHTML(t('templates.ds_empty'))} <a href="#/data-sources">${uiText(t('nav.data_sources'))}</a></div>`)}${renderHTML(help)}</div>`;
    }
    case 'image':
      return `<div class="form-group"><label>${renderHTML(label)}</label>
        <div class="tpl-image-field" data-image-param="${esc(p.name)}">
          <div class="tpl-image-thumb" data-image-thumb></div>
          <div style="display:flex;gap:6px;flex-wrap:wrap">
            <button type="button" class="btn btn-secondary btn-sm" data-image-pick>${uiText(t('templates.image_choose'))}</button>
            ${renderHTML(p.default ? `<button type="button" class="btn btn-secondary btn-sm" data-image-default>${uiText(t('templates.image_default'))}</button>` : '')}
            <button type="button" class="btn btn-secondary btn-sm" data-image-clear>${uiText(t('templates.image_clear'))}</button>
          </div>
        </div>${renderHTML(help)}</div>`;
    case 'text':
    default:
      return `<div class="form-group"><label for="${esc(id)}">${renderHTML(label)}</label><input type="text" class="input" id="${esc(id)}" data-param="${esc(p.name)}" value="${esc(v)}" maxlength="${Number(p.max) || 200}">${renderHTML(help)}</div>`;
  }
}

/**
 * The Use form. `tpl` is an installed template (public shape) — or pass `widget` (a template
 * widget row) to edit one in place, with `values`/`name` from its config or pending draft.
 */
// onCreated(widget): hand the new widget to the caller (Make a sign puts it on screens) instead of
// this dialog's own "created — add to a playlist" step.
export async function openUseModal({ tpl, widget = null, values: initialValues = null, name: initialName = null, onSaved = null, onCreated = null } = {}) {
  if (!tpl && widget) {
    let cfg = {};
    try { cfg = JSON.parse(widget.config || '{}'); } catch { cfg = {}; }
    const key = String(cfg.template || '');
    const [cat, id] = key.split('/');
    try {
      tpl = await TAPI(`/templates/installed/${encodeURIComponent(cat || '')}/${encodeURIComponent(id || '')}${langQuery(lang())}`);
    } catch (e) {
      showToast(t('templates.widget_template_missing', { key, error: (errorMessage(e)) }), 'error');
      return;
    }
  }
  if (!tpl) return;
  // Labels, help and option labels in the dashboard's language where the template translates
  // them. A NEW widget starts from the translated text defaults; an existing one keeps what it has.
  const params = localParams(tpl, lang());
  const values = initialFormValues(params, initialValues, { isNew: !widget });
  let dataSources = [];
  if (params.some((p) => p.type === 'data_source')) {
    try { const r = await api.getDataSources(); dataSources = Array.isArray(r) ? r : []; } catch { dataSources = []; }
  }
  const editing = !!widget;
  const [cat, id] = String(tpl.key).split('/');
  const base = `/templates/installed/${encodeURIComponent(cat)}/${encodeURIComponent(id)}`;

  const m = openModal({
    title: editing ? t('templates.edit_title', { name: widget.name }) : t('templates.use_title', { name: nameOf(tpl) }),
    width: 1040,
    body: `
      <div class="tpl-use">
        <div class="tpl-use-form">
          <div class="tpl-badges" style="margin-bottom:12px">${renderHTML(kindBadge(tpl.kind))} ${renderHTML(trustBadge(tpl))} <span class="tpl-meta">v${uiText(tpl.version)}</span></div>
          ${renderHTML(tpl.kind === 'html' ? `<div class="tpl-callout tpl-callout-warn tpl-small">${uiText(t('templates.code_values_visible'))}</div>` : '')}
          <div class="form-group"><label for="tplUseName">${uiText(t('templates.widget_name'))}</label>
            <input type="text" class="input" id="tplUseName" maxlength="120" value="${esc(initialName != null ? initialName : (widget ? widget.name : nameOf(tpl)))}"></div>
          ${renderHTML(params.map((p) => paramFieldHtml(p, values[p.name], dataSources)).join(''))}
          <div id="tplUseError" class="tpl-warn-text" style="min-height:1em"></div>
        </div>
        <div class="tpl-use-preview">
          <div class="tpl-meta" style="display:flex;justify-content:space-between"><span>${uiText(t('templates.preview'))}</span><span id="tplPreviewState"></span></div>
          <div class="tpl-frame-wrap"><iframe id="tplPreviewFrame" sandbox="allow-scripts" referrerpolicy="no-referrer" title="${esc(t('templates.preview'))}" data-fil-i18n-title="${binding('templates.preview', undefined)}"></iframe></div>
          <div id="tplDone" style="display:none"></div>
        </div>
      </div>`,
    footer: `<button class="btn btn-secondary" data-close>${uiText(t('common.cancel'))}</button>
             <button class="btn btn-primary" id="tplUseGo">${uiText(editing ? t('common.save') : t('templates.create'))}</button>`,
  });

  // Image params: the value is a content id from this workspace's library, or tpl:<file> for the
  // template's own bundled image. Neither is shown as a URL anyone typed.
  function paintImage(name) {
    const host = m.overlay.querySelector(`[data-image-param="${CSS.escape(name)}"] [data-image-thumb]`);
    if (!host) return;
    const v = values[name];
    if (!v) host.innerHTML = `<span class="tpl-meta">${uiText(t('templates.image_none'))}</span>`;
    else if (String(v).startsWith('tpl:')) host.innerHTML = `<span class="tpl-meta">${uiText(t('templates.image_bundled', { file: String(v).slice(4) }))}</span>`;
    else {
      host.innerHTML = `<img data-auth-src="/api/content/${encodeURIComponent(v)}/thumbnail" alt="">`;
      hydrateAuthImages(host, { eager: true });
    }
  }
  for (const p of params.filter((x) => x.type === 'image')) {
    const wrap = m.overlay.querySelector(`[data-image-param="${CSS.escape(p.name)}"]`);
    paintImage(p.name);
    wrap.querySelector('[data-image-pick]').addEventListener('click', async () => {
      const item = await openContentPicker({ title: p.label || p.name, returnItem: true });
      if (item && item.id) { values[p.name] = String(item.id); paintImage(p.name); schedulePreview(); }
    });
    const def = wrap.querySelector('[data-image-default]');
    if (def) def.addEventListener('click', () => { values[p.name] = p.default; paintImage(p.name); schedulePreview(); });
    wrap.querySelector('[data-image-clear]').addEventListener('click', () => { values[p.name] = ''; paintImage(p.name); schedulePreview(); });
  }

  function readValues() {
    const out = { ...values };
    m.overlay.querySelectorAll('[data-param]').forEach((el) => {
      const name = el.dataset.param;
      const p = params.find((x) => x.name === name);
      if (!p) return;
      if (p.type === 'checkbox') out[name] = !!el.checked;
      else if (p.type === 'number') out[name] = el.value === '' ? '' : Number(el.value);
      else out[name] = el.value;
    });
    // An empty number would be refused; leave it out so the template's default applies.
    for (const p of params) if (p.type === 'number' && out[p.name] === '') delete out[p.name];
    return out;
  }

  const frame = m.$('#tplPreviewFrame');
  const stateEl = m.$('#tplPreviewState');
  const errEl = m.$('#tplUseError');
  let timer = null;
  let seq = 0;
  let closed = false;
  m.onClose(() => { closed = true; clearTimeout(timer); });
  async function updatePreview() {
    const mine = ++seq;
    bindText(stateEl, 'templates.preview_updating', undefined);
    try {
      const r = await TAPI(`${base}/preview`, { method: 'POST', body: JSON.stringify({ values: readValues() }) });
      if (closed || mine !== seq) return;
      // Only a same-server preview path is ever put in the frame.
      if (typeof r.url === 'string' && r.url.startsWith('/api/templates/preview/')) frame.src = r.url;
      bindMessage(stateEl, '');
      bindMessage(errEl, '');
    } catch (e) {
      if (closed || mine !== seq) return;
      bindMessage(stateEl, '');
      bindMessage(errEl, (errorMessage(e)));
    }
  }
  function schedulePreview() { clearTimeout(timer); timer = setTimeout(updatePreview, 400); }
  m.overlay.querySelectorAll('[data-param]').forEach((el) => {
    el.addEventListener('input', schedulePreview);
    el.addEventListener('change', schedulePreview);
  });
  updatePreview();

  const go = m.$('#tplUseGo');
  go.addEventListener('click', async () => {
    go.disabled = true;
    bindMessage(errEl, '');
    const name = m.$('#tplUseName').value.trim();
    try {
      if (editing) {
        assertLocalCallAllowed(`/widgets/${widget.id}`, 'PUT');
        await TAPI(`/widgets/${encodeURIComponent(widget.id)}`, { method: 'PUT', body: JSON.stringify({ name: name || widget.name, config: { values: readValues() } }) });
        showToast(t('templates.toast_widget_saved'), 'success');
        m.close();
        if (onSaved) onSaved();
        return;
      }
      const w = await TAPI(`${base}/use`, { method: 'POST', body: JSON.stringify({ name, values: readValues() }) });
      showToast(t('templates.toast_widget_created', { name: w.name }), 'success');
      if (onCreated) { m.close(); onCreated(w); return; }
      showCreated(m, w);
    } catch (e) {
      go.disabled = false;
      bindMessage(errEl, (errorMessage(e)));
      if (e.body && e.body.param) {
        const el = m.overlay.querySelector(`[data-param="${CSS.escape(e.body.param)}"], [data-image-param="${CSS.escape(e.body.param)}"]`);
        if (el) el.scrollIntoView({ block: 'center' });
      }
    }
  });
}

async function showCreated(m, w) {
  const done = m.$('#tplDone');
  const footer = m.overlay.querySelector('.modal-footer');
  if (footer) footer.innerHTML = `<a class="btn btn-secondary" href="#/widgets" data-close>${uiText(t('templates.go_widgets'))}</a>
    <button class="btn btn-primary" data-close>${uiText(t('common.done'))}</button>`;
  footer.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', m.close));
  done.style.display = '';
  done.innerHTML = `<div class="tpl-callout tpl-callout-ok">
      <strong>${uiText(t('templates.created_title', { name: w.name }))}</strong>
      <p class="tpl-meta">${uiText(t('templates.created_desc'))}</p>
      <p class="tpl-meta">${uiText(t('templates.created_again'))}</p>
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
        <select class="input" id="tplAddPl" style="flex:1;min-width:180px"><option value="">${uiText(t('templates.loading'))}</option></select>
        <button class="btn btn-primary btn-sm" id="tplAddPlGo" disabled>${uiText(t('templates.add_to_playlist'))}</button>
      </div>
      <div id="tplAddPlMsg" class="tpl-meta" style="margin-top:6px"></div>
    </div>`;
  m.overlay.querySelectorAll('.tpl-use-form input, .tpl-use-form select, .tpl-use-form textarea, .tpl-use-form button').forEach((el) => { el.disabled = true; });
  const sel = done.querySelector('#tplAddPl');
  const btn = done.querySelector('#tplAddPlGo');
  const msg = done.querySelector('#tplAddPlMsg');
  let pls = [];
  try { pls = await api.getPlaylists(); } catch { pls = []; }
  pls = Array.isArray(pls) ? pls : [];
  sel.innerHTML = pls.length
    ? `<option value="">${uiText(t('templates.choose_playlist'))}</option>${renderHTML(pls.map((p) => `<option value="${esc(p.id)}">${uiText(p.name)}</option>`).join(''))}`
    : `<option value="">${uiText(t('templates.no_playlists'))}</option>`;
  sel.addEventListener('change', () => { btn.disabled = !sel.value; });
  btn.addEventListener('click', async () => {
    btn.disabled = true;
    try {
      await api.addPlaylistItem(sel.value, { widget_id: w.id });
      const pl = pls.find((p) => String(p.id) === sel.value);
      msg.innerHTML = `${renderHTML(t('templates.added_to_playlist_draft', { name: pl ? pl.name : '' }))} <a href="#/playlists/${encodeURIComponent(sel.value)}">${uiText(t('templates.open_playlist'))}</a>`;
    } catch (e) { btn.disabled = false; msg.innerHTML = `<span class="tpl-warn-text">${uiText((errorMessage(e)))}</span>`; }
  });
}
