import { renderHTML, uiText } from '../lib/i18n-bindings.js';
import { displayValue, displayQuantity, messageCount as tn, message as t } from '../i18n.js';

import { errorMessage, localizeServerError } from '../api.js';

/*
 * "Where media is stored" (server/routes/storage-profiles.js, docs/storage.md). Three levels:
 *
 *   instance      Platform → System (mountInstanceStorage): the profile every organization without
 *                 its own storage uses. Platform admins only. The server's environment wins over it.
 *   organization  Settings (mountStorageSettings): the org's shared profiles and its default. Org
 *                 owners and admins.
 *   workspace     the same Settings card: where THIS workspace's new uploads go (follow the
 *                 organization, or a profile of its own). Org admins always; workspace admins only
 *                 when the organization allows it — otherwise the server answers 403 and the card
 *                 is not shown.
 *
 * ⚠️ SECRETS ARE WRITE-ONLY. The form sends a key; nothing the server returns contains one. An
 * edit with the key fields left blank keeps the stored key. Stored keys are encrypted with this
 * server's JWT secret, so a changed JWT_SECRET means re-entering them — the card says so on any
 * profile whose key no longer decrypts.
 *
 * Escaping follows the SPA rule: values are stored raw and esc()'d where they are rendered.
 */
import { api } from '../api.js';
import { esc } from '../utils.js';
import { showToast } from './toast.js';

const BASE = '/storage-profiles';
const PROVIDERS = { s3: t("ui.storage_settings.s3_s3_compatible_5fe0ff"), azure: 'Azure Blob', local: t("ui.storage_settings.local_disk_8d5623") };
const SCOPE_LABEL = { instance: t("ui.storage_settings.instance_5f97f8"), organization: t("ui.storage_settings.organization_519255"), workspace: t("ui.storage_settings.workspace_4ca0a7") };

export async function mountStorageSettings(host) {
  if (!host) return;
  let data;
  try { data = await api.get(BASE); } catch (_) { host.style.display = 'none'; return; }
  host.style.display = '';
  host.innerHTML = `<h3>${renderHTML(t("ui.storage_settings.where_media_is_stored_b384ca"))}</h3><div data-st="body"></div>`;
  const body = host.querySelector('[data-st="body"]');
  render();

  async function reload() {
    try { data = await api.get(BASE); } catch (err) { showToast(errorMessage(err), 'error'); return; }
    render();
  }

  function render() {
    const { profiles, settings } = data;
    const orgAdmin = !!settings.can_manage_org;
    const ws = settings.workspace;
    const writable = profiles.filter((p) => p.mode === 'rw' && !p.credentials_unreadable);
    // The org default may only be an org-wide profile; a workspace's own profile is never an option there.
    const orgChoices = writable.filter((p) => p.scope !== 'workspace');
    const wsChoices = writable.filter((p) => p.usable_here);
    const m = settings.migration && ['copying', 'ready_to_commit', 'committed', 'draining'].includes(settings.migration.state) ? settings.migration : null;
    // Choices lock only while a copy is in flight — the same rule the server applies. After the
    // switch, old copies awaiting removal do not stop anyone changing where NEW uploads go.
    const locked = !!(m && ['copying', 'ready_to_commit'].includes(m.state));
    body.innerHTML = `
      <p style="color:var(--text-muted);font-size:12px;margin-bottom:12px">${renderHTML(t('ui.storage.choice_help'))}</p>

      ${renderHTML(orgAdmin ? `
      <div class="form-group">
        <label for="stDefault">${renderHTML(t("ui.storage_settings.organization_new_uploads_go_to"))}</label>
        <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
          <select id="stDefault" class="input" style="min-width:240px" ${locked ? 'disabled' : ''}>
            <option value="">${renderHTML(t("ui.storage_settings.instance_default_eadb66", {value2: nameOf(settings.instance_default_id)}))}</option>
            ${renderHTML(orgChoices.map((p) => `<option value="${esc(p.id)}" ${settings.org_override === p.id ? 'selected' : ''}>${uiText(p.name)} — ${uiText(PROVIDERS[p.provider] || p.provider)}</option>`).join(''))}
          </select>
          <button type="button" class="btn btn-secondary btn-sm" id="stSaveDefault" ${locked ? 'disabled' : ''}>${renderHTML(t("ui.storage_settings.save_1509f5"))}</button>
        </div>
        ${renderHTML(locked ? `<div style="font-size:12px;color:var(--text-muted)">${renderHTML(t("ui.storage_settings.locked_while_a_copy_is_in_progress_b5e964"))}</div>` : '')}
        <label style="display:block;margin-top:8px;font-size:13px"><input type="checkbox" id="stWsChoice" ${settings.workspace_choice ? 'checked' : ''}> ${renderHTML(t("ui.storage_settings.workspace_admins_may_choose_their_own_workspace_715327"))}</label>
        <div style="font-size:12px;color:var(--text-muted)">${renderHTML(t("ui.storage_settings.off_by_default_where_a_workspace_s"))}</div>
      </div>` : '')}

      ${renderHTML(ws ? `
      <div class="form-group">
        <label for="stWsDefault">${renderHTML(t("ui.storage_settings.this_workspace_new_uploads_go_to_ce7b76", {value0: ws.name ? ` (${(ws.name)})` : ''}))}</label>
        <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
          <select id="stWsDefault" class="input" style="min-width:240px" ${locked ? 'disabled' : ''}>
            <option value="">${renderHTML(t("ui.storage_settings.follow_the_organization_df4112", {value2: nameOf(settings.default_profile_id)}))}</option>
            ${renderHTML(wsChoices.map((p) => `<option value="${esc(p.id)}" ${ws.override === p.id ? 'selected' : ''}>${uiText(p.name)} — ${uiText(SCOPE_LABEL[p.scope] || '')} ${uiText(PROVIDERS[p.provider] || p.provider)}</option>`).join(''))}
          </select>
          <button type="button" class="btn btn-secondary btn-sm" id="stSaveWs" ${locked ? 'disabled' : ''}>${renderHTML(t("ui.storage_settings.save_1509f5"))}</button>
        </div>
        ${renderHTML(ws.override_unusable ? `<div style="font-size:12px;color:var(--danger, #e05252)">${renderHTML(t("ui.storage_settings.the_chosen_profile_can_t_take_uploads_a0cb50", {value0: nameOf(ws.effective_profile_id)}))}</div>` : '')}
        ${renderHTML(ws.override && !ws.override_unusable ? `<div style="font-size:12px;color:var(--text-muted)">${renderHTML(t("ui.storage_settings.this_workspace_has_its_own_storage_so_45a9c2"))}</div>` : '')}
      </div>` : '')}

      <div class="form-group">
        <label for="stDirect">${renderHTML(t("ui.storage_settings.screens_in_this_workspace_may_download_from"))}</label>
        <select id="stDirect" class="input" style="width:240px">
          <option value="" ${settings.workspace_direct_fetch == null ? 'selected' : ''}>${renderHTML(t("ui.storage_settings.default_yes_when_the_bucket_has_a_9b642e"))}</option>
          <option value="1" ${settings.workspace_direct_fetch === true ? 'selected' : ''}>${renderHTML(t("ui.storage_settings.yes_85a39a"))}</option>
          <option value="0" ${settings.workspace_direct_fetch === false ? 'selected' : ''}>${renderHTML(t("ui.storage_settings.no_always_through_this_server_b290ac"))}</option>
        </select>
        <div style="font-size:12px;color:var(--text-muted)">${renderHTML(t("ui.storage_settings.no_is_the_setting_for_screens_on"))}</div>
      </div>

      ${renderHTML(m ? migrationPanel(m) : '')}

      <div class="table-wrap" style="margin-top:8px"><table class="corp-table">
        <thead><tr><th>${renderHTML(t("ui.storage_settings.name"))}</th><th>${renderHTML(t("ui.storage_settings.level"))}</th><th>${renderHTML(t("ui.storage_settings.type"))}</th><th>${renderHTML(t("ui.storage_settings.bucket"))}</th><th>${renderHTML(t("ui.storage_settings.mode"))}</th><th>${renderHTML(t("ui.storage_settings.files"))}</th><th></th></tr></thead>
        <tbody>${renderHTML(profiles.map((p) => row(p, orgAdmin, !!ws)).join(''))}</tbody>
      </table></div>
      <div style="margin-top:10px"><button type="button" class="btn btn-secondary btn-sm" id="stAdd">${renderHTML(t("ui.storage_settings.add_storage_profile"))}</button></div>
      <div id="stForm"></div>
      <div id="stBrowse"></div>`;

    const on = (sel, ev, fn) => { const el = body.querySelector(sel); if (el) el.addEventListener(ev, fn); };
    on('#stSaveDefault', 'click', async () => {
      const v = body.querySelector('#stDefault').value || null;
      try { await api.put(`${BASE}/settings/current`, { default_profile_id: v }); showToast(t("ui.storage_settings.saved_new_uploads_only_existing_files_stay"), 'success'); reload(); }
      catch (err) { showToast(errorMessage(err), 'error'); }
    });
    on('#stWsChoice', 'change', async (e) => {
      try { await api.put(`${BASE}/settings/current`, { workspace_choice: e.target.checked }); showToast(t("ui.storage_settings.saved"), 'success'); reload(); }
      catch (err) { showToast(errorMessage(err), 'error'); e.target.checked = !e.target.checked; }
    });
    on('#stSaveWs', 'click', async () => {
      const v = body.querySelector('#stWsDefault').value || null;
      try { await api.put(`${BASE}/settings/current`, { workspace_profile_id: v }); showToast(t("ui.storage_settings.saved_new_uploads_only_existing_files_stay"), 'success'); reload(); }
      catch (err) { showToast(errorMessage(err), 'error'); }
    });
    on('#stDirect', 'change', async (e) => {
      const v = e.target.value === '' ? null : e.target.value === '1';
      try { await api.put(`${BASE}/settings/current`, { workspace_direct_fetch: v }); showToast(t("ui.storage_settings.saved"), 'success'); }
      catch (err) { showToast(errorMessage(err), 'error'); }
    });
    on('#stAdd', 'click', () => openForm(body.querySelector('#stForm'), null, {
      canPrivate: settings.can_allow_private,
      scopes: orgAdmin
        ? [{ value: 'organization', label: t("ui.storage_settings.organization_every_workspace_in_it_may_use_it_f1b1dd") }, ...(ws ? [{ value: 'workspace', label: t("ui.storage_settings.this_workspace_only_value0_8d091f", {value0: ws.name ? ` (${ws.name})` : ''}) }] : [])]
        : [{ value: 'workspace', label: t("ui.storage_settings.this_workspace_only_value0_8d091f", {value0: ws && ws.name ? ` (${ws.name})` : ''}) }],
      onSaved: reload,
    }));
    body.querySelectorAll('[data-act]').forEach((b) => b.addEventListener('click', () => act(b.dataset.act, b.dataset.id)));
  }

  function nameOf(id) { const p = data.profiles.find((x) => x.id === id); return p ? p.name : id; }

  function row(p, orgAdmin, inWorkspace) {
    const btn = (act, label, cls = 'btn-secondary') => `<button type="button" class="btn ${cls} btn-sm" data-act="${act}" data-id="${esc(p.id)}">${uiText(label)}</button>`;
    const where = p.provider === 'local' ? '—' : `${esc(p.bucket || '')}${p.prefix ? `/<span style="color:var(--text-muted)">${uiText(p.prefix)}</span>` : ''}${p.endpoint ? `<div style="font-size:11px;color:var(--text-muted)">${uiText(p.endpoint)}</div>` : ''}`;
    const warn = p.credentials_unreadable ? `<div style="font-size:11px;color:var(--danger, #e05252)">${renderHTML(t('ui.storage.key_unreadable'))}</div>` : '';
    const key = p.provider !== 'local' && p.hint ? `<div style="font-size:11px;color:var(--text-muted)">${renderHTML(t("ui.storage_settings.key_5a6b2c", {value0: p.hint}))}</div>` : '';
    const level = p.scope === 'workspace' ? `Workspace${p.workspace_name ? `: ${esc(p.workspace_name)}` : ''}` : esc(SCOPE_LABEL[p.scope] || '');
    const movable = p.mode === 'rw' && !p.credentials_unreadable;
    return `<tr>
      <td>${uiText(p.name)}${renderHTML(p.from_env ? ` <span style="font-size:11px;color:var(--text-muted)">${renderHTML(t("ui.storage_settings.server_config_cde4e2"))}</span>` : '')}${renderHTML(key)}${renderHTML(warn)}</td>
      <td style="font-size:12px">${renderHTML(level)}</td>
      <td>${uiText(PROVIDERS[p.provider] || p.provider)}</td>
      <td>${renderHTML(where)}</td>
      <td>${renderHTML(p.mode === 'ro' ? t("ui.labels.read_only_1d8d39") : t("ui.labels.read_write_aa8e12"))}</td>
      <td>${uiText(String(p.in_use || 0))}</td>
      <td><div class="storage-row-actions">
        ${renderHTML(p.provider !== 'local' ? btn('test', t("ui.storage_settings.test_640ab2")) : '')}
        ${renderHTML(p.provider !== 'local' && (orgAdmin || p.usable_here) ? btn('browse', t("ui.storage_settings.browse_2f3b5c")) : '')}
        ${renderHTML(movable && orgAdmin && p.scope !== 'workspace' ? btn('migrate', t("ui.storage_settings.move_organization_here_315075")) : '')}
        ${renderHTML(movable && inWorkspace && p.usable_here ? btn('migrate-ws', t("ui.storage_settings.move_this_workspace_here_51d07f")) : '')}
        ${renderHTML(p.editable ? btn('edit', t("ui.storage_settings.edit_530164")) : '')}
        ${renderHTML(p.editable ? btn('delete', t("ui.storage_settings.delete_f6fdbe"), 'btn-danger') : '')}
      </div></td></tr>`;
  }

  function migrationPanel(m) {
    const pct = m.total ? Math.round(((m.verified + m.failed) / m.total) * 100) : 100;
    const label = { copying: t("ui.storage_settings.copying_43b7de"), ready_to_commit: t("ui.storage_settings.copied_not_switched_yet_b3f0b1"), committed: t("ui.storage_settings.switched_old_copies_still_kept_ca0ba7"), draining: t("ui.storage_settings.removing_old_copies_988ba1") }[m.state] || m.state;
    const scope = m.workspace_id ? (data.settings.workspace && data.settings.workspace.id === m.workspace_id ? t("ui.storage_settings.this_workspace_5ed971") : t("ui.storage_settings.one_workspace_456e7b")) : t("ui.storage_settings.the_organization_6727a9");
    return `<div class="settings-subsection" style="border:1px solid var(--border);border-radius:var(--radius);padding:12px;margin:8px 0">
      <div style="font-weight:500">${renderHTML(t("ui.storage_settings.to_1773f9", {value0: label, value1: scope, value2: nameOf(m.target_profile_id)}))}</div>
      <div style="font-size:12px;color:var(--text-muted);margin:4px 0">${renderHTML(t('ui.storage.verified',{done:m.verified,total:m.total,pct}))}${renderHTML(m.failed ? `, <span style="color:var(--danger, #e05252)">${renderHTML(t("ui.storage_settings.failed_afc831", {value0: String(m.failed)}))}</span>` : '')}${renderHTML(m.last_error ? t('ui.storage.last_error',{error:localizeServerError(m.last_error)}) : '')}</div>
      <div style="font-size:12px;color:var(--text-muted);margin-bottom:8px">${renderHTML(m.state === 'copying' || m.state === 'ready_to_commit'
        ? `${renderHTML(t('ui.storage.copy_readable'))}`
        : t('ui.storage.copy_preferred'))}</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        ${renderHTML(m.state === 'ready_to_commit' ? `<button type="button" class="btn btn-primary btn-sm" data-act="commit" data-id="${esc(m.target_profile_id)}">${renderHTML(t("ui.storage_settings.switch_to_the_new_copies_454532"))}</button>` : '')}
        ${renderHTML(m.state === 'committed' || m.state === 'draining' ? `<button type="button" class="btn btn-danger btn-sm" data-act="drain" data-id="${esc(m.target_profile_id)}">${renderHTML(t("ui.storage_settings.remove_old_copies_150522"))}</button>` : '')}
        <button type="button" class="btn btn-secondary btn-sm" data-act="abort" data-id="${esc(m.target_profile_id)}">${renderHTML(t("ui.storage_settings.stop_and_keep_current_copies_680752"))}</button>
        <button type="button" class="btn btn-secondary btn-sm" data-act="refresh" data-id="">${renderHTML(t("ui.storage_settings.refresh"))}</button>
      </div></div>`;
  }

  async function act(what, id) {
    const p = data.profiles.find((x) => x.id === id);
    try {
      if (what === 'refresh') return reload();
      if (what === 'test') return testProfile(id);
      if (what === 'edit') return openForm(body.querySelector('#stForm'), p, { canPrivate: data.settings.can_allow_private, onSaved: reload });
      if (what === 'browse') return openBrowser(p, '');
      if (what === 'delete') {
        if (!window.confirm(t("ui.storage_settings.delete_the_storage_profile_value0_files_are_not_touched_a_profile_515f5c", {value0: p.name}))) return;
        await api.delete(`${BASE}/${encodeURIComponent(id)}`); showToast(t("ui.storage_settings.deleted"), 'success'); return reload();
      }
      if (what === 'migrate' || what === 'migrate-ws') {
        const wsMove = what === 'migrate-ws';
        const whose = wsMove ? t("ui.storage_settings.this_workspace_5ed971") : t("ui.storage_settings.this_organization_workspaces_with_their_own_storage_are_a1e50e");
        if (!window.confirm(t("ui.storage_settings.copy_every_file_in_value0_to_value1_nothing_is_switched_or_remove_4b70af", {value0: whose, value1: p.name}))) return;
        await api.post(`${BASE}/${encodeURIComponent(id)}/migrate`, wsMove ? { scope: 'workspace' } : {}); showToast(t("ui.storage_settings.copy_started"), 'success'); return reload();
      }
      if (what === 'commit') { await api.post(`${BASE}/${encodeURIComponent(id)}/migrate/commit`, {}); showToast(t("ui.storage_settings.switched_old_copies_are_kept_until_you"), 'success'); return reload(); }
      if (what === 'drain') {
        if (!window.confirm(t("ui.storage_settings.remove_the_old_copies_only_copies_screentinker"))) return;
        const r = await api.post(`${BASE}/${encodeURIComponent(id)}/migrate/drain`, {});
        showToast(tn('ui.storage.removed_copies', r.removed), 'success'); return reload();
      }
      if (what === 'abort') { await api.post(`${BASE}/${encodeURIComponent(id)}/migrate/abort`, {}); showToast(t("ui.storage_settings.stopped_every_existing_copy_was_kept"), 'success'); return reload(); }
    } catch (err) { showToast(errorMessage(err), 'error'); }
  }

  async function openBrowser(p, prefix, cursor = null) {
    const box = body.querySelector('#stBrowse');
    box.innerHTML = `<p style="font-size:13px;color:var(--text-muted)">${renderHTML(t("ui.storage_settings.listing_856620"))}</p>`;
    let page;
    try { page = await api.get(`${BASE}/${encodeURIComponent(p.id)}/objects?prefix=${encodeURIComponent(prefix)}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`); }
    catch (err) { box.innerHTML = `<p style="color:var(--danger);font-size:13px">${uiText((errorMessage(err)))}</p>`; return; }
    const up = prefix.replace(/[^/]+\/$/, '');
    box.innerHTML = `<div style="border:1px solid var(--border);border-radius:var(--radius);padding:12px;margin-top:12px">
      <h4 style="margin-bottom:8px">${uiText(p.name)}: /${uiText(prefix)}</h4>
      ${renderHTML(prefix ? `<button type="button" class="btn btn-secondary btn-sm" data-dir="${esc(up)}">${renderHTML(t("ui.storage_settings.up_4fd8d6"))}</button>` : '')}
      <div class="table-wrap" style="margin-top:6px"><table class="corp-table"><tbody>
        ${renderHTML(page.folders.map((f) => `<tr><td colspan="3"><a href="#" data-dir="${esc(f)}">📁 ${uiText(f.slice(prefix.length))}</a></td></tr>`).join(''))}
        ${renderHTML(page.objects.map((o) => `<tr><td><label><input type="checkbox" data-key="${esc(o.key)}" ${o.importable ? '' : 'disabled'}> ${uiText(o.key.slice(prefix.length))}</label>${renderHTML(o.st_internal ? ` <span style="font-size:11px;color:var(--text-muted)">${renderHTML(t("ui.storage_settings.screentinker_0405a4"))}</span>` : '')}</td><td style="font-size:12px">${uiText(fmtSize(o.size))}</td><td style="font-size:11px;color:var(--text-muted)">${renderHTML(o.importable ? '' : t("ui.storage_settings.not_a_media_type_7f4c45"))}</td></tr>`).join(''))}
        ${renderHTML(!page.folders.length && !page.objects.length ? `<tr><td style="color:var(--text-muted);font-size:13px">${renderHTML(t("ui.storage_settings.empty_8a1121"))}</td></tr>` : '')}
      </tbody></table></div>
      ${renderHTML(page.cursor ? `<button type="button" class="btn btn-secondary btn-sm" data-next="1">${renderHTML(t("ui.storage_settings.next_page_c08ac7"))}</button>` : '')}
      <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:10px">
        <select id="sbMode" class="input" style="width:auto">
          <option value="reference">${renderHTML(t("ui.storage_settings.reference_play_it_from_this_bucket_never_fe58f8"))}</option>
          <option value="copy">${renderHTML(t("ui.storage_settings.copy_store_it_in_this_workspace_s"))}</option>
        </select>
        <button type="button" class="btn btn-primary btn-sm" id="sbImport">${renderHTML(t("ui.storage_settings.import_selected"))}</button>
        <button type="button" class="btn btn-secondary btn-sm" id="sbClose">${renderHTML(t("ui.storage_settings.close"))}</button>
      </div></div>`;
    box.querySelectorAll('[data-dir]').forEach((a) => a.addEventListener('click', (e) => { e.preventDefault(); openBrowser(p, a.dataset.dir); }));
    const next = box.querySelector('[data-next]');
    if (next) next.addEventListener('click', () => openBrowser(p, prefix, page.cursor));
    box.querySelector('#sbClose').addEventListener('click', () => { box.innerHTML = ''; });
    box.querySelector('#sbImport').addEventListener('click', async () => {
      const keys = [...box.querySelectorAll('input[data-key]:checked')].map((el) => el.dataset.key);
      if (!keys.length) return showToast(t("ui.storage_settings.select_at_least_one_file"), 'error');
      try {
        const r = await api.post(`${BASE}/${encodeURIComponent(p.id)}/import`, { keys, mode: box.querySelector('#sbMode').value });
        showToast(t("ui.storage_settings.imported_value0_value1_dab71c", {value0: r.imported.length, value1: r.errors.length ? t('ui.storage.refused_suffix',{count:r.errors.length,reason:localizeServerError(r.errors[0].error)}) : ''}), r.errors.length ? 'error' : 'success');
        reload();
      } catch (err) { showToast(errorMessage(err), 'error'); }
    });
  }
}

/*
 * Platform → System: the instance level. One profile at most (the server enforces it). When the
 * server's environment sets STORAGE_PROVIDER that wins, and the card says the stored profile is
 * inactive rather than letting anyone edit it believing it applies.
 */
export async function mountInstanceStorage(host) {
  if (!host) return;
  let data;
  const load = async () => {
    try { data = await api.get(`${BASE}/instance`); } catch (err) { host.innerHTML = `<p style="color:var(--text-muted);font-size:13px">${uiText((errorMessage(err)))}</p>`; return false; }
    return true;
  };
  if (!(await load())) return;
  const render = () => {
    const p = data.profile;
    const env = data.env;
    host.innerHTML = `
      <p style="color:var(--text-muted);font-size:12px;margin-bottom:10px">${renderHTML(tn('ui.storage.following',data.orgs_following))}</p>
      ${renderHTML(env ? `<div style="border:1px solid var(--border);border-radius:var(--radius);padding:10px;margin-bottom:10px;font-size:13px">
        <strong>${renderHTML(t("ui.storage_settings.set_by_the_server_s_environment_079921"))}</strong> ${uiText(PROVIDERS[env.provider] || env.provider)}${renderHTML(env.bucket ? ` — ${esc(env.bucket)}` : '')}${renderHTML(env.endpoint ? ` <span style="color:var(--text-muted)">(${uiText(env.endpoint)})</span>` : '')}.
        <div style="font-size:12px;color:var(--text-muted);margin-top:4px">${renderHTML(t('ui.storage.env_default'))} ${renderHTML(p?t('ui.storage.profile_inactive'):'')}</div></div>` : '')}
      ${renderHTML(p ? `<div class="table-wrap"><table class="corp-table"><thead><tr><th>${renderHTML(t("ui.storage_settings.name"))}</th><th>${renderHTML(t("ui.storage_settings.type"))}</th><th>${renderHTML(t("ui.storage_settings.bucket"))}</th><th>${renderHTML(t("ui.storage_settings.files"))}</th><th></th></tr></thead><tbody><tr>
          <td>${uiText(p.name)}${renderHTML(p.active ? ` <span style="font-size:11px;color:var(--success)">${renderHTML(t("ui.storage_settings.in_effect_76cf78"))}</span>` : '')}${renderHTML(p.hint ? `<div style="font-size:11px;color:var(--text-muted)">${renderHTML(t("ui.storage_settings.key_5a6b2c", {value0: p.hint}))}</div>` : '')}${renderHTML(p.credentials_unreadable ? `<div style="font-size:11px;color:var(--danger, #e05252)">${renderHTML(t("ui.storage_settings.key_unreadable_re_enter_it_c6057c"))}</div>` : '')}</td>
          <td>${uiText(PROVIDERS[p.provider] || p.provider)}</td>
          <td>${uiText(p.bucket || '')}${renderHTML(p.endpoint ? `<div style="font-size:11px;color:var(--text-muted)">${uiText(p.endpoint)}</div>` : '')}</td>
          <td>${uiText(String(p.in_use || 0))}</td>
          <td style="white-space:nowrap">
            <button type="button" class="btn btn-secondary btn-sm" data-iact="test">${renderHTML(t("ui.storage_settings.test"))}</button>
            <button type="button" class="btn btn-secondary btn-sm" data-iact="edit">${renderHTML(t("ui.storage_settings.edit"))}</button>
            <button type="button" class="btn btn-danger btn-sm" data-iact="delete">${renderHTML(t("ui.storage_settings.delete"))}</button>
          </td></tr></tbody></table></div>`
        : `<p style="font-size:13px">${renderHTML(env ? '' : t("ui.storage_settings.no_instance_storage_profile_media_is_stored_on_this_ser_a5d7ca"))}</p>
           <button type="button" class="btn btn-secondary btn-sm" data-iact="add">${renderHTML(t("ui.storage_settings.add_instance_storage"))}</button>`)}
      <div data-iform></div>`;
    host.querySelectorAll('[data-iact]').forEach((b) => b.addEventListener('click', async () => {
      const box = host.querySelector('[data-iform]');
      const refresh = async () => { if (await load()) render(); };
      try {
        if (b.dataset.iact === 'add') return openForm(box, null, { canPrivate: true, extraPayload: { scope: 'instance' }, onSaved: refresh });
        if (b.dataset.iact === 'edit') return openForm(box, p, { canPrivate: true, onSaved: refresh });
        if (b.dataset.iact === 'test') return testProfile(p.id);
        if (b.dataset.iact === 'delete') {
          if (!window.confirm(t("ui.storage_settings.delete_the_instance_storage_profile_value0_organizations_that_fol_9f6848", {value0: p.name}))) return;
          await api.delete(`${BASE}/${encodeURIComponent(p.id)}`); showToast(t("ui.storage_settings.deleted"), 'success'); return refresh();
        }
      } catch (err) { showToast(errorMessage(err), 'error'); }
    }));
  };
  render();
}

async function testProfile(id) {
  try {
    const r = await api.post(`${BASE}/${encodeURIComponent(id)}/test`, {});
    showToast(r.ok ? t("ui.storage_settings.connected_c2f9b7") : t('storage.test.failed',{error:errorMessage({message:r.message,status:400})}), r.ok ? 'success' : 'error');
  } catch (err) { showToast(errorMessage(err), 'error'); }
}

/**
 * The add/edit form. `scopes` (add only) offers where the new profile belongs; `extraPayload` is
 * merged into the request (the instance card passes { scope: 'instance' }).
 */
function openForm(box, p, { canPrivate = false, scopes = null, extraPayload = null, onSaved } = {}) {
  const provider = p ? p.provider : 's3';
  const v = (k) => esc(p && p[k] != null ? p[k] : '');
  box.innerHTML = `<div style="border:1px solid var(--border);border-radius:var(--radius);padding:12px;margin-top:12px">
    <h4 style="margin-bottom:8px">${renderHTML(p ? `Edit “${esc(p.name)}”` : t("ui.storage_settings.add_storage_profile_a6ea2d"))}</h4>
    ${renderHTML(!p && scopes && scopes.length > 1 ? `<div class="form-group"><label>${renderHTML(t("ui.storage_settings.belongs_to"))}</label>
      <select id="sfScope" class="input" style="width:auto">${renderHTML(scopes.map((s) => `<option value="${esc(s.value)}">${uiText(s.label)}</option>`).join(''))}</select></div>` : '')}
    <div class="form-group"><label>${renderHTML(t("ui.storage_settings.type"))}</label>
      <select id="sfProvider" class="input" style="width:240px" ${p ? 'disabled' : ''}>
        <option value="s3" ${provider === 's3' ? 'selected' : ''}>${renderHTML(t("ui.storage_settings.s3_s3_compatible_aws_minio_r2_b2_81a265"))}</option>
        <option value="azure" ${provider === 'azure' ? 'selected' : ''}>${renderHTML(t("ui.storage_settings.azure_blob_d12515"))}</option>
      </select></div>
    <div class="form-group"><label>${renderHTML(t("ui.storage_settings.name"))}</label><input id="sfName" class="input" value="${esc(p ? p.name : '')}" maxlength="80"></div>
    <div class="form-group"><label data-only="s3">${renderHTML(t("ui.storage_settings.bucket"))}</label><label data-only="azure">${renderHTML(t("ui.storage_settings.container"))}</label><input id="sfBucket" class="input" value="${v('bucket')}"></div>
    <div class="form-group"><label>${renderHTML(t("ui.storage_settings.endpoint_3df972"))} <span style="font-size:11px;color:var(--text-muted)" data-only="s3">${renderHTML(t("ui.storage_settings.blank_aws_edf1e8"))}</span><span style="font-size:11px;color:var(--text-muted)" data-only="azure">${renderHTML(t("ui.storage_settings.blank_azure_public_cloud_azurite_sovereign_cloud_aaddf6"))}</span></label><input id="sfEndpoint" class="input" value="${v('endpoint')}" placeholder="https://minio.example.com:9000"></div>
    <div class="form-group"><label>${renderHTML(t("ui.storage_settings.public_endpoint_7725dd"))} <span style="font-size:11px;color:var(--text-muted)">${renderHTML(t("ui.storage_settings.the_name_screens_can_reach_blank_with_4d035c"))}</span></label><input id="sfPublic" class="input" value="${v('public_endpoint')}"></div>
    <div class="form-group" data-only="s3"><label>${renderHTML(t("ui.storage_settings.public_base_url_f74ed6"))} <span style="font-size:11px;color:var(--text-muted)">${renderHTML(t("ui.storage_settings.optional_cdn_in_front_of_a_public_9ace75"))}</span></label><input id="sfPublicBase" class="input" value="${v('public_base_url')}"></div>
    <div class="form-group" data-only="s3"><label>${renderHTML(t("ui.storage_settings.region_d3a008"))} <span style="font-size:11px;color:var(--text-muted)">${renderHTML(t("ui.storage_settings.blank_us_east_1_r2_uses_auto_29d55b"))}</span></label><input id="sfRegion" class="input" value="${v('region')}" style="width:180px"></div>
    <div class="form-group" data-only="s3"><label>${renderHTML(t("ui.storage_settings.addressing"))}</label>
      <select id="sfPathStyle" class="input" style="width:240px">
        <option value="" ${p && p.force_path_style != null ? '' : 'selected'}>${renderHTML(t("ui.storage_settings.automatic_path_style_with_a_custom_endpoint_9d80fe"))}</option>
        <option value="1" ${p && p.force_path_style === true ? 'selected' : ''}>${renderHTML(t("ui.storage_settings.path_style_beca44"))}</option>
        <option value="0" ${p && p.force_path_style === false ? 'selected' : ''}>${renderHTML(t("ui.storage_settings.virtual_hosted_9c6c83"))}</option>
      </select></div>
    <div class="form-group"><label>${renderHTML(t("ui.storage_settings.prefix_74feac"))} <span style="font-size:11px;color:var(--text-muted)">${renderHTML(t("ui.storage_settings.optional_folder_inside_the_bucket"))}</span></label><input id="sfPrefix" class="input" value="${v('prefix')}"></div>
    <div class="form-group"><label>${renderHTML(t("ui.storage_settings.mode"))}</label>
      <select id="sfMode" class="input" style="width:240px">
        <option value="rw" ${!p || p.mode === 'rw' ? 'selected' : ''}>${renderHTML(t("ui.storage_settings.read_write_uploads_may_be_stored_here_16410f"))}</option>
        <option value="ro" ${p && p.mode === 'ro' ? 'selected' : ''}>${renderHTML(t("ui.storage_settings.read_only_attach_an_existing_bucket_and_ba898e"))}</option>
      </select></div>
    <div class="form-group"><label>${renderHTML(t("ui.storage_settings.read_priority_18791c"))} <span style="font-size:11px;color:var(--text-muted)">${renderHTML(t("ui.storage_settings.lower_is_tried_first_when_a_file_f0f09f"))}</span></label><input id="sfPriority" class="input" type="number" value="${p ? esc(String(p.read_priority)) : '100'}" style="width:100px"></div>
    <label style="display:block;margin-bottom:6px"><input type="checkbox" id="sfPresign" ${!p || p.presign ? 'checked' : ''}> ${renderHTML(t("ui.storage_settings.let_screens_download_directly_with_short_lived_0ad6ba"))}</label>
    ${renderHTML(canPrivate ? `<label style="display:block;margin-bottom:6px"><input type="checkbox" id="sfPrivate" ${p && p.allow_private ? 'checked' : ''}> ${renderHTML(t("ui.storage_settings.the_endpoint_is_on_this_host_or_70c454"))}</label>` : '')}
    <div data-only="s3">
      <div class="form-group"><label>${renderHTML(t("ui.storage_settings.access_key_id"))}</label><input id="sfKeyId" class="input" autocomplete="off" placeholder="${p ? t("ui.storage_settings.unchanged_leave_blank_to_keep_73caa0") : ''}"></div>
      <div class="form-group"><label>${renderHTML(t("ui.storage_settings.secret_access_key"))}</label><input id="sfSecret" class="input" type="password" autocomplete="new-password" placeholder="${p ? t("ui.storage_settings.unchanged_leave_blank_to_keep_73caa0") : ''}"></div>
    </div>
    <div data-only="azure">
      <div class="form-group"><label>${renderHTML(t("ui.storage_settings.connection_string_511ada"))} <span style="font-size:11px;color:var(--text-muted)">${renderHTML(t("ui.storage_settings.or_the_account_fields_below"))}</span></label><input id="sfConn" class="input" type="password" autocomplete="new-password" placeholder="${p ? t("ui.storage_settings.unchanged_leave_blank_to_keep_73caa0") : ''}"></div>
      <div class="form-group"><label>${renderHTML(t("ui.storage_settings.account_name"))}</label><input id="sfAccount" class="input" autocomplete="off"></div>
      <div class="form-group"><label>${renderHTML(t("ui.storage_settings.account_key"))}</label><input id="sfAccountKey" class="input" type="password" autocomplete="new-password"></div>
      <div class="form-group"><label>${renderHTML(t('ui.storage.sas_token'))} <span style="font-size:11px;color:var(--text-muted)">${renderHTML(t("ui.storage_settings.with_a_sas_only_screens_are_always"))}</span></label><input id="sfSas" class="input" type="password" autocomplete="new-password"></div>
    </div>
    <p style="font-size:11px;color:var(--text-muted)">${renderHTML(t("ui.storage_settings.keys_are_encrypted_with_this_server_s"))}</p>
    <div style="display:flex;gap:8px"><button type="button" class="btn btn-primary btn-sm" id="sfSave">${renderHTML(p ? t("ui.storage_settings.save_efc007") : t("ui.storage_settings.add_61cc55"))}</button><button type="button" class="btn btn-secondary btn-sm" id="sfCancel">${renderHTML(t("ui.storage_settings.cancel"))}</button></div>
  </div>`;
  const showFor = () => {
    const prov = box.querySelector('#sfProvider').value;
    box.querySelectorAll('[data-only]').forEach((el) => { el.style.display = el.dataset.only === prov ? '' : 'none'; });
  };
  showFor();
  box.querySelector('#sfProvider').addEventListener('change', showFor);
  box.querySelector('#sfCancel').addEventListener('click', () => { box.innerHTML = ''; });
  box.querySelector('#sfSave').addEventListener('click', async () => {
    const val = (sel) => { const el = box.querySelector(sel); return el ? el.value.trim() : ''; };
    const prov = box.querySelector('#sfProvider').value;
    const payload = {
      provider: prov, name: val('#sfName'), bucket: val('#sfBucket'), endpoint: val('#sfEndpoint'), public_endpoint: val('#sfPublic'),
      prefix: val('#sfPrefix'), mode: val('#sfMode'), read_priority: Number(val('#sfPriority') || 0),
      presign: box.querySelector('#sfPresign').checked,
      ...(extraPayload || {}),
    };
    if (!p && scopes && scopes.length) payload.scope = (box.querySelector('#sfScope') || {}).value || scopes[0].value;
    const priv = box.querySelector('#sfPrivate');
    if (priv) payload.allow_private = priv.checked;
    if (prov === 's3') {
      payload.public_base_url = val('#sfPublicBase'); payload.region = val('#sfRegion');
      const ps = val('#sfPathStyle'); payload.force_path_style = ps === '' ? null : ps === '1';
      if (val('#sfKeyId') || val('#sfSecret')) payload.credentials = { accessKeyId: val('#sfKeyId'), secretAccessKey: val('#sfSecret') };
    } else {
      const c = { connectionString: val('#sfConn'), accountName: val('#sfAccount'), accountKey: val('#sfAccountKey'), sasToken: val('#sfSas') };
      if (Object.values(c).some(Boolean)) payload.credentials = c;
    }
    try {
      if (p) await api.put(`${BASE}/${encodeURIComponent(p.id)}`, payload);
      else await api.post(BASE, payload);
      showToast(t("ui.storage_settings.saved"), 'success');
      box.innerHTML = '';
      if (onSaved) onSaved();
    } catch (err) { showToast(errorMessage(err), 'error'); }
  });
}

function fmtSize(n) {
  if (n == null) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1048576) return displayQuantity((n / 1024),'KB',0);
  if (n < 1073741824) return displayQuantity((n / 1048576),'MB',1);
  return displayQuantity((n / 1073741824),'GB',2);
}
