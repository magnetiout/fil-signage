import { renderHTML, uiText, translatedAttribute, bindText } from '../lib/i18n-bindings.js';

import { displayValue, message as t } from '../i18n.js';

import { localizeServerError } from '../api.js';

/*
 * Microsoft 365 (server/routes/m365.js, docs/cloud-documents.md).
 *
 *   mountM365Settings  Settings card: the organization's own Entra app (tenant, client ID, secret).
 *                      Org owners and admins only — the server answers can_manage:false to everyone
 *                      else and the card stays hidden.
 *   openCloudFolders   Content library: SharePoint/OneDrive folders synced into this workspace.
 *                      Any editor can sync, pause or stop one; only org owners/admins (can_manage)
 *                      see the Add form — the server refuses everyone else.
 *
 * ⚠️ THE SECRET IS WRITE-ONLY. The form sends it; nothing the server returns contains it. A save with
 * the secret field left empty keeps the stored one.
 *
 * Escaping follows the SPA rule: values are stored raw and esc()'d where they are rendered.
 */
import { api } from '../api.js';
import { esc } from '../utils.js';
import { showToast } from './toast.js';

const when = (ts) => (ts ? displayValue(new Date(ts * 1000), "toLocaleString", undefined) : t("ui.labels.never_85777c"));

export async function mountM365Settings(host) {
  if (!host) return;
  let app;
  try { app = await api.get('/m365/app'); } catch (_) { host.style.display = 'none'; return; }
  if (!app.can_manage) { host.style.display = 'none'; return; }
  host.style.display = '';
  render();

  function render() {
    const status = !app.configured ? `<span style="color:var(--text-muted)">${renderHTML(t('ui.m365.not_configured'))}</span>`
      : app.last_test_ok === true ? `<span style="color:var(--success,#15803d)">${renderHTML(t("ui.m365_settings.working_tested_852991", {value0: when(app.last_test_at)}))}</span>`
      : app.last_test_ok === false ? `<span style="color:var(--danger,#b91c1c)">${renderHTML(t("ui.m365_settings.test_failed_ef88db", {value0: app.last_error || ''}))}</span>`
      : `<span style="color:var(--text-muted)">${renderHTML(t('ui.m365.not_tested'))}</span>`;
    host.innerHTML = `
      <h3>${renderHTML(t("ui.m365_settings.microsoft_365"))}</h3>
      <p style="color:var(--text-muted);font-size:12px;margin-bottom:8px">
        ${renderHTML(t("ui.m365_settings.connect_your_organization_s_own_microsoft_entra"))}</p>
      <div style="font-size:13px;margin-bottom:10px">${renderHTML(status)}</div>
      <div style="display:grid;gap:10px;max-width:560px">
        <div class="form-group"><label>${renderHTML(t("ui.m365_settings.directory_tenant_id"))}</label>
          <input type="text" class="input" data-m="tenant_id" value="${esc(app.tenant_id || '')}" placeholder="00000000-0000-0000-0000-000000000000" spellcheck="false"></div>
        <div class="form-group"><label>${renderHTML(t("ui.m365_settings.application_client_id"))}</label>
          <input type="text" class="input" data-m="client_id" value="${esc(app.client_id || '')}" placeholder="00000000-0000-0000-0000-000000000000" spellcheck="false"></div>
        <div class="form-group"><label>${renderHTML(t("ui.m365_settings.client_secret_value"))}</label>
          <input type="password" class="input" data-m="client_secret" autocomplete="new-password" placeholder="${app.has_client_secret ? t("ui.labels.a_secret_is_set_leave_empty_to_keep_it_65f5f2") : t("ui.labels.paste_the_secret_value_not_its_id_280bf9")}"></div>
        <div style="display:flex;gap:6px;flex-wrap:wrap">
          <button class="btn btn-primary btn-sm" data-m-act="save">${renderHTML(t("ui.m365_settings.save"))}</button>
          ${renderHTML(app.configured ? `<button class="btn btn-secondary btn-sm" data-m-act="test">${renderHTML(t("ui.m365_settings.test_connection_5bcf31"))}</button><button class="btn btn-danger btn-sm" data-m-act="remove">${renderHTML(t("ui.m365_settings.remove_c3812f"))}</button>` : '')}
        </div>
      </div>`;
    host.querySelector('[data-m-act="save"]').addEventListener('click', save);
    host.querySelector('[data-m-act="test"]')?.addEventListener('click', test);
    host.querySelector('[data-m-act="remove"]')?.addEventListener('click', remove);
  }

  const field = (k) => host.querySelector(`[data-m="${k}"]`)?.value.trim() || '';

  async function save() {
    const body = { tenant_id: field('tenant_id'), client_id: field('client_id') };
    const secret = host.querySelector('[data-m="client_secret"]').value;
    if (secret) body.client_secret = secret;
    try {
      app = await api.put('/m365/app', body);
      showToast(t("ui.m365_settings.microsoft_365_saved"), 'success');
      render();
      await test();
    } catch (err) { showToast(err.uiMessage || err.message, 'error'); }
  }

  async function test() {
    try {
      const r = await api.post('/m365/app/test', {});
      showToast(r.ok ? t("ui.labels.microsoft_accepted_the_app_credentials_6ea899") : localizeServerError(r.error), r.ok ? 'success' : 'error');
      app = await api.get('/m365/app');
      render();
    } catch (err) { showToast(err.uiMessage || err.message, 'error'); }
  }

  async function remove() {
    if (!confirm(t("ui.m365_settings.remove_the_microsoft_365_app_folder_syncs"))) return;
    try { await api.delete('/m365/app'); app = { configured: false, can_manage: true }; render(); showToast(t("ui.m365_settings.microsoft_365_removed"), 'success'); }
    catch (err) { showToast(err.uiMessage || err.message, 'error'); }
  }
}

/* ============================== folder syncs ============================== */

function summaryLine(f) {
  const s = f.last_summary;
  if (!f.last_sync_at) return t("ui.labels.waiting_for_the_first_sync_74bdb1");
  if (f.last_status === 'error') return t("ui.m365_settings.last_sync_failed_value0_ce5306", {value0: f.last_error || t("ui.labels.unknown_error_af6321")});
  if (!s) return `Synced ${when(f.last_sync_at)}`;
  const bits = [];
  if (s.added) bits.push(t("ui.m365_settings.value0_added_bdee23", {value0: s.added}));
  if (s.updated) bits.push(t("ui.m365_settings.value0_updated_588ce8", {value0: s.updated}));
  if (s.removed) bits.push(t("ui.m365_settings.value0_removed_daeb03", {value0: s.removed}));
  if (s.skipped_other) bits.push(t("ui.m365_settings.value0_not_media_skipped_86092d", {value0: s.skipped_other}));
  if (s.skipped_too_large) bits.push(t("ui.m365_settings.value0_too_large_70e0c8", {value0: s.skipped_too_large}));
  if (s.failed) bits.push(t("ui.m365_settings.value0_failed_daf585", {value0: s.failed}));
  if (s.playlist === 'pending_review') bits.push(t("ui.labels.playlist_waiting_for_review_0dc908"));
  return `Synced ${when(f.last_sync_at)}${bits.length ? ' — ' + bits.join(', ') : t("ui.labels.no_changes_660fdc")}`;
}

/** The SharePoint/OneDrive folders panel, as a modal over the content library. `onChange` reloads the library. */
export async function openCloudFolders({ onChange } = {}) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;z-index:1000;padding:16px';
  overlay.innerHTML = `<div class="modal" style="width:100%;max-width:760px;max-height:90vh;overflow:auto;background:var(--bg-card);border:1px solid var(--border);border-radius:8px;padding:16px">
    <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:8px">
      <h3 style="margin:0">${renderHTML(t("ui.m365_settings.sharepoint_onedrive_folders"))}</h3>
      <button class="btn btn-secondary btn-sm" data-cf="close">${renderHTML(t("ui.m365_settings.close"))}</button>
    </div>
    <p style="color:var(--text-muted);font-size:12px;margin:0 0 12px">${renderHTML(t("ui.m365_settings.images_videos_and_audio_in_a_folder"))}</p>
    <div data-cf="body">${renderHTML(t("ui.m365_settings.loading"))}</div></div>`;
  document.body.appendChild(overlay);
  const close = () => overlay.remove();
  overlay.querySelector('[data-cf="close"]').addEventListener('click', close);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  const body = overlay.querySelector('[data-cf="body"]');

  let app = { configured: false };
  let list = [];
  async function load() {
    try {
      [app, list] = await Promise.all([api.get('/m365/app'), api.get('/m365/folders')]);
    } catch (err) { body.innerHTML = `<p style="color:var(--danger,#b91c1c)">${uiText((err.uiMessage || err.message))}</p>`; return; }
    render();
  }

  function render() {
    const setup = app.configured ? '' : `<div style="padding:10px;border:1px dashed var(--border);border-radius:6px;margin-bottom:12px;font-size:13px">
      ${renderHTML(t(app.can_manage?'ui.m365.setup_admin':'ui.m365.setup_member'))}</div>`;
    const rows = list.map((f) => `
      <div style="border:1px solid var(--border);border-radius:6px;padding:10px;margin-bottom:8px">
        <div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;align-items:flex-start">
          <div style="min-width:0;flex:1">
            <strong>${uiText(f.name)}</strong>${renderHTML(f.enabled ? '' : ` <span style="font-size:11px;color:var(--text-muted)">${renderHTML(t("ui.m365_settings.paused_beac65"))}</span>`)}
            <div style="font-size:12px;color:var(--text-muted);word-break:break-all">${uiText(f.web_url || f.share_url)}</div>
            <div style="font-size:12px;margin-top:4px;color:${f.last_status === 'error' ? 'var(--danger,#b91c1c)' : f.last_status === 'partial' ? 'var(--warning,#b45309)' : 'var(--text-secondary)'}">${uiText(summaryLine(f))}</div>
            ${renderHTML(f.last_summary && f.last_summary.errors && f.last_summary.errors.length ? `<details style="font-size:12px;margin-top:4px"><summary>${renderHTML(t("ui.m365_settings.details"))}</summary>${renderHTML(f.last_summary.errors.map((e) => `<div>${uiText(e)}</div>`).join(''))}</details>` : '')}
            <div style="font-size:12px;color:var(--text-muted);margin-top:2px">${renderHTML(t("ui.m365_settings.file_every_min_0ed7e7", {value6: f.file_count, value7: f.file_count === 1 ? '' : 's', value8: f.interval_min, value9: f.auto_playlist ? t('ui.m365.keeps_playlist') : ''}))}</div>
          </div>
          <div style="display:flex;gap:6px;flex-wrap:wrap">
            <button class="btn btn-secondary btn-sm" data-cf-sync="${esc(f.id)}">${renderHTML(t("ui.m365_settings.sync_now_885e8f"))}</button>
            <button class="btn btn-secondary btn-sm" data-cf-toggle="${esc(f.id)}" data-on="${f.enabled ? 1 : 0}">${renderHTML(t(f.enabled ? 'ui.m365.pause' : 'ui.m365.resume'))}</button>
            <button class="btn btn-danger btn-sm" data-cf-del="${esc(f.id)}">${renderHTML(t("ui.m365_settings.stop_syncing_ae5059"))}</button>
          </div>
        </div>
      </div>`).join('');
    body.innerHTML = `${setup}${rows || `<p style="color:var(--text-muted);font-size:13px">${renderHTML(t("ui.m365_settings.no_folders_yet_d890b0"))}</p>`}
      ${app.configured && !app.can_manage ? `<p style="color:var(--text-muted);font-size:12px;margin-top:12px">${renderHTML(t("ui.m365_settings.only_an_organization_owner_or_admin_can_a877d5"))}</p>` : ''}
      ${app.configured && app.can_manage ? `<details style="margin-top:12px" ${list.length ? '' : 'open'}><summary style="cursor:pointer;font-size:13px">${renderHTML(t("ui.m365_settings.add_a_folder"))}</summary>
        <div style="display:grid;gap:10px;margin-top:10px">
          <div class="form-group"><label>${renderHTML(t("ui.m365_settings.folder_sharing_link"))}</label>
            <input type="url" class="input" data-cf-f="share_url" placeholder="https://contoso.sharepoint.com/:f:/s/…" spellcheck="false">
            <div style="font-size:11px;color:var(--text-muted);margin-top:4px">${renderHTML(t("ui.m365_settings.in_sharepoint_or_onedrive_select_the_folder"))}</div></div>
          <div class="form-group"><label>${renderHTML(t("ui.m365_settings.name_optional"))}</label><input type="text" class="input" data-cf-f="name" ${translatedAttribute("placeholder", "ui.m365_settings.placeholder_the_folder_s_own_name_dbab2b")}></div>
          <div style="display:flex;gap:10px;flex-wrap:wrap">
            <div class="form-group" style="flex:1;min-width:140px"><label>${renderHTML(t("ui.m365_settings.sync_every_minutes"))}</label><input type="number" class="input" data-cf-f="interval_min" min="5" max="1440" value="15"></div>
            <div class="form-group" style="flex:1;min-width:140px"><label>${renderHTML(t("ui.m365_settings.seconds_per_image"))}</label><input type="number" class="input" data-cf-f="default_duration_sec" min="1" value="10"></div>
          </div>
          <label style="display:flex;gap:8px;align-items:center;font-size:13px"><input type="checkbox" data-cf-f="auto_playlist" checked> ${renderHTML(t("ui.m365_settings.keep_a_playlist_of_the_folder_in_d557ec"))}</label>
          <div><button class="btn btn-primary btn-sm" data-cf="add">${renderHTML(t("ui.m365_settings.add_folder"))}</button></div>
        </div></details>` : ''}`;

    body.querySelector('[data-cf="add"]')?.addEventListener('click', add);
    body.querySelectorAll('[data-cf-sync]').forEach((b) => b.addEventListener('click', async () => {
      b.disabled = true; bindText(b, "ui.m365_settings.syncing");
      try { await api.post(`/m365/folders/${b.dataset.cfSync}/sync`, {}); if (onChange) onChange(); }
      catch (err) { showToast(err.uiMessage || err.message, 'error'); }
      await load();
    }));
    body.querySelectorAll('[data-cf-toggle]').forEach((b) => b.addEventListener('click', async () => {
      try { await api.put(`/m365/folders/${b.dataset.cfToggle}`, { enabled: b.dataset.on !== '1' }); } catch (err) { showToast(err.uiMessage || err.message, 'error'); }
      await load();
    }));
    body.querySelectorAll('[data-cf-del]').forEach((b) => b.addEventListener('click', async () => {
      if (!confirm(t("ui.m365_settings.stop_syncing_this_folder_the_files_already"))) return;
      try { await api.delete(`/m365/folders/${b.dataset.cfDel}`); } catch (err) { showToast(err.uiMessage || err.message, 'error'); }
      await load();
    }));
  }

  async function add() {
    const v = (k) => body.querySelector(`[data-cf-f="${k}"]`);
    const payload = {
      share_url: v('share_url').value.trim(),
      name: v('name').value.trim() || undefined,
      interval_min: parseInt(v('interval_min').value, 10) || 15,
      default_duration_sec: parseInt(v('default_duration_sec').value, 10) || 10,
      auto_playlist: v('auto_playlist').checked,
    };
    if (!payload.share_url) { showToast(t("ui.m365_settings.paste_the_folder_s_sharing_link"), 'error'); return; }
    const btn = body.querySelector('[data-cf="add"]');
    btn.disabled = true; bindText(btn, "ui.m365_settings.checking_the_folder");
    try {
      await api.post('/m365/folders', payload);
      showToast(t("ui.m365_settings.folder_added_the_first_sync_has_started"), 'success');
      await load();
      // The first sync runs in the background; look again shortly so its outcome appears.
      setTimeout(() => { if (document.body.contains(overlay)) { load(); if (onChange) onChange(); } }, 4000);
    } catch (err) {
      showToast(err.uiMessage || err.message, 'error');
      btn.disabled = false; bindText(btn, "ui.m365_settings.add_folder");
    }
  }

  load();
}
