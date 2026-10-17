import { uiText, renderHTML, translatedAttribute, bindMessage, bindText } from '../lib/i18n-bindings.js';

/*
 * Settings → Meeting rooms (server/routes/rooms.js, docs/room-booking.md): the organization's own
 * calendar apps that room displays read through, and the org-wide rules for what a panel may do.
 * Org owners and admins only; the card stays hidden for everyone else.
 *
 * ⚠️ SECRETS ARE WRITE-ONLY. The server never returns a client secret or a service-account key; an
 * edit with those fields left empty keeps the stored one.
 */
import { errorMessage, api } from '../api.js';
import { esc } from '../utils.js';
import { message as t } from '../i18n.js';
import { showToast } from './toast.js';

export async function mountRoomSettings(host) {
  if (!host) return;
  let conns, settings;
  try {
    [conns, settings] = await Promise.all([api.get('/rooms/connections'), api.get('/rooms/settings')]);
  } catch (_) { host.style.display = 'none'; return; }
  if (!conns.can_manage) { host.style.display = 'none'; return; }
  host.style.display = '';

  async function reload() {
    try { [conns, settings] = await Promise.all([api.get('/rooms/connections'), api.get('/rooms/settings')]); }
    catch (err) { showToast(errorMessage(err), 'error'); return; }
    render();
  }

  const kindLabel = (k) => (k === 'google' ? t('rooms.kind_google') : t('rooms.kind_m365'));

  function connRow(c) {
    const who = c.kind === 'google'
      ? `${esc(c.client_id || '')}${c.subject ? ` · ${esc(t('rooms.acting_as'))} ${esc(c.subject)}` : ''}`
      : `${esc(t('rooms.f_tenant'))}: ${esc(c.tenant_id || '')} · ${esc(t('rooms.f_client_id'))}: ${esc(c.client_id || '')}`;
    return `
      <div class="rm-conn" data-id="${esc(c.id)}" style="border:1px solid var(--border);border-radius:var(--radius);padding:10px;margin-bottom:8px">
        <div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;align-items:center">
          <div style="min-width:0">
            <strong>${uiText(c.name)}</strong> <span style="font-size:12px;color:var(--text-muted)">— ${uiText(kindLabel(c.kind))}${renderHTML(c.read_only ? ` · ${esc(t('rooms.read_only'))}` : '')}</span>
            <div style="font-size:12px;color:var(--text-muted);word-break:break-all">${renderHTML(who)}</div>
          </div>
          <div style="display:flex;gap:6px;flex-wrap:wrap">
            <button class="btn btn-secondary btn-sm" data-act="test">${uiText(t('rooms.test'))}</button>
            <button class="btn btn-secondary btn-sm" data-act="edit">${uiText(t('rooms.edit'))}</button>
            <button class="btn btn-danger btn-sm" data-act="delete">${uiText(t('rooms.delete'))}</button>
          </div>
        </div>
        <div data-out style="font-size:12px;margin-top:6px"></div>
        <div data-edit style="display:none;margin-top:10px">${renderHTML(form(c.kind, c))}</div>
      </div>`;
  }

  function form(kind, c = null) {
    const keep = c ? `<div style="font-size:11px;color:var(--text-muted);margin-top:4px">${uiText(t('rooms.secret_keep'))}</div>` : '';
    const common = `
      <div class="form-group"><label>${uiText(t('rooms.f_name'))}</label><input class="input" data-f="name" value="${esc(c ? c.name : '')}" placeholder="${esc(kind === 'google' ? t("ui.room_settings.google_workspace_rooms_239fb5") : t("ui.room_settings.microsoft_365_rooms_dc76aa"))}"></div>`;
    const specific = kind === 'google' ? `
      <div class="form-group"><label>${uiText(t('rooms.f_sa_json'))}</label>
        <textarea class="input" data-f="service_account_json" rows="3" spellcheck="false" style="font-family:monospace;font-size:11px" ${translatedAttribute("placeholder", "ui.room_settings.placeholder_type_service_account_490c1f")}></textarea>
        <div style="font-size:11px;color:var(--text-muted);margin-top:4px">${uiText(t('rooms.f_sa_json_hint'))}</div>${renderHTML(keep)}</div>
      <div class="form-group"><label>${uiText(t('rooms.f_subject'))}</label><input class="input" data-f="subject" value="${esc(c && c.subject ? c.subject : '')}" ${translatedAttribute("placeholder", "ui.room_settings.placeholder_admin_example_com_258d8d")}>
        <div style="font-size:11px;color:var(--text-muted);margin-top:4px">${uiText(t('rooms.f_subject_hint'))}</div></div>` : `
      <div class="form-group"><label>${uiText(t('rooms.f_tenant'))}</label><input class="input" data-f="tenant_id" value="${esc(c ? c.tenant_id || '' : '')}" placeholder="00000000-0000-0000-0000-000000000000"></div>
      <div class="form-group"><label>${uiText(t('rooms.f_client_id'))}</label><input class="input" data-f="client_id" value="${esc(c ? c.client_id || '' : '')}"></div>
      <div class="form-group"><label>${uiText(t('rooms.f_client_secret'))}</label><input type="password" class="input" data-f="client_secret" autocomplete="new-password">${renderHTML(keep)}</div>`;
    return `<div style="display:grid;gap:10px;max-width:560px">${renderHTML(common)}${renderHTML(specific)}
      <label style="display:flex;gap:8px;align-items:flex-start;font-size:13px"><input type="checkbox" data-f="read_only" ${c && c.read_only ? 'checked' : ''} style="margin-top:3px"><span>${uiText(t('rooms.f_read_only'))}<br><span style="font-size:12px;color:var(--text-muted)">${uiText(t('rooms.f_read_only_hint'))}</span></span></label>
      <div><button class="btn btn-primary btn-sm" data-act="save">${uiText(c ? t('rooms.save') : t('rooms.add_connection'))}</button></div></div>`;
  }

  function read(box, kind, editing) {
    const v = (f) => box.querySelector(`[data-f="${f}"]`);
    const body = { name: v('name').value.trim(), read_only: v('read_only').checked };
    if (kind === 'google') {
      const key = v('service_account_json').value.trim();
      if (key || !editing) body.service_account_json = key;
      body.subject = v('subject').value.trim();
    } else {
      body.tenant_id = v('tenant_id').value.trim();
      body.client_id = v('client_id').value.trim();
      const sec = v('client_secret').value;
      if (sec || !editing) body.client_secret = sec;
    }
    return body;
  }

  function render() {
    const list = conns.connections || [];
    host.innerHTML = `
      <h3>${uiText(t('rooms.title'))}</h3>
      <p style="color:var(--text-muted);font-size:12px;margin-bottom:8px">${uiText(t('rooms.blurb'))}</p>
      <div data-list>${renderHTML(list.length ? list.map(connRow).join('') : `<p style="color:var(--text-muted);font-size:13px">${uiText(t('rooms.none'))}</p>`)}</div>
      <details data-add style="margin-top:8px">
        <summary style="cursor:pointer;font-size:13px">${uiText(t('rooms.add_connection'))}</summary>
        <div style="margin-top:10px;display:grid;gap:10px;max-width:560px">
          <div class="form-group"><label>${uiText(t('rooms.f_kind'))}</label>
            <select class="input" data-kind><option value="m365">${uiText(t('rooms.kind_m365'))}</option><option value="google">${uiText(t('rooms.kind_google'))}</option></select></div>
          <div data-newform>${renderHTML(form('m365'))}</div>
        </div>
      </details>
      <h4 style="margin:16px 0 6px;font-size:14px">${uiText(t('rooms.rules'))}</h4>
      <div style="display:grid;gap:10px;max-width:560px">
        <label style="display:flex;gap:8px;align-items:flex-start;font-size:13px"><input type="checkbox" data-s="end_any" ${settings.end_any ? 'checked' : ''} style="margin-top:3px"><span>${uiText(t('rooms.end_any'))}<br><span style="font-size:12px;color:var(--text-muted)">${uiText(t('rooms.end_any_hint'))}</span></span></label>
        <div class="form-group"><label>${uiText(t('rooms.release_min'))}</label>
          <input type="number" class="input" data-s="release_min" min="0" max="60" step="1" value="${esc(settings.release_min || 0)}" style="max-width:120px">
          <div style="font-size:11px;color:var(--text-muted);margin-top:4px">${uiText(t('rooms.release_min_hint'))}</div></div>
        <div><button class="btn btn-secondary btn-sm" data-act="save-settings">${uiText(t('rooms.save_rules'))}</button></div>
      </div>`;

    const kindSel = host.querySelector('[data-kind]');
    const newForm = host.querySelector('[data-newform]');
    kindSel.addEventListener('change', () => { newForm.innerHTML = form(kindSel.value); });
    newForm.addEventListener('click', async (e) => {
      if (!e.target.closest('[data-act="save"]')) return;
      try {
        await api.post('/rooms/connections', { kind: kindSel.value, ...read(newForm, kindSel.value, false) });
        showToast(t('rooms.saved'), 'success');
        await reload();
      } catch (err) { showToast(errorMessage(err), 'error'); }
    });

    host.querySelectorAll('.rm-conn').forEach((row) => {
      const id = row.dataset.id;
      const c = list.find((x) => x.id === id);
      const out = row.querySelector('[data-out]');
      row.addEventListener('click', async (e) => {
        const btn = e.target.closest('[data-act]');
        if (!btn) return;
        const act = btn.dataset.act;
        if (act === 'edit') { const ed = row.querySelector('[data-edit]'); ed.style.display = ed.style.display === 'none' ? '' : 'none'; return; }
        if (act === 'test') {
          out.style.color = ''; bindText(out, 'rooms.testing', undefined);
          try {
            const r = await api.post(`/rooms/connections/${id}/test`, {});
            if (!r.ok) { out.style.color = 'var(--danger,#b91c1c)'; bindMessage(out, `❌ ${r.error}`); return; }
            out.style.color = 'var(--success,#15803d)';
            bindMessage(out, `✅ ${t('rooms.test_ok')}${r.rooms != null ? ` ${t('rooms.test_rooms', { n: r.rooms })}` : ''}${r.rooms_error ? ` — ${r.rooms_error}` : ''}`);
          } catch (err) { out.style.color = 'var(--danger,#b91c1c)'; bindMessage(out, (errorMessage(err))); }
          return;
        }
        if (act === 'delete') {
          if (!confirm(t('rooms.confirm_delete'))) return;
          try { await api.delete(`/rooms/connections/${id}`); showToast(t('rooms.removed'), 'success'); await reload(); }
          catch (err) { showToast(errorMessage(err), 'error'); }
          return;
        }
        if (act === 'save') {
          try { await api.put(`/rooms/connections/${id}`, read(row.querySelector('[data-edit]'), c.kind, true)); showToast(t('rooms.saved'), 'success'); await reload(); }
          catch (err) { showToast(errorMessage(err), 'error'); }
        }
      });
    });

    host.querySelector('[data-act="save-settings"]').addEventListener('click', async () => {
      try {
        settings = await api.put('/rooms/settings', {
          end_any: host.querySelector('[data-s="end_any"]').checked,
          release_min: parseInt(host.querySelector('[data-s="release_min"]').value, 10) || 0,
        });
        showToast(t('rooms.saved'), 'success');
      } catch (err) { showToast(errorMessage(err), 'error'); }
    });
  }

  // Last, not first: render() uses the const helpers above, and calling it before they are
  // initialised throws (a temporal dead zone) — which only showed once a connection existed.
  render();
}
