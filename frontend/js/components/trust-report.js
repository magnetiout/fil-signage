import {localizedError} from '../i18n.js';
import { uiText, renderHTML } from '../lib/i18n-bindings.js';
import { displayQuantity, displayValue, displayList, hasMessage, message as t } from '../i18n.js';

/*
 * 3.0 "Your data, provably" — the pieces of the Data & privacy page (views/privacy.js) and the
 * Platform → Data & privacy tab (views/admin.js). Server: routes/trust.js; docs/trust.md.
 *
 * Every fact rendered here comes from GET /api/trust/report, which reads the RUNNING configuration;
 * nothing on this page is a hand-written claim. Everything the server sends is escaped with esc().
 */
import { errorMessage, api } from '../api.js';
import { showToast } from './toast.js';
import { esc } from '../utils.js';

import { openTypeToConfirmModal } from './type-to-confirm-modal.js';

/** A translated label for a computed key, or the fallback when the key is unknown (t returns the key). */
function tk(key, fallback) {
  return hasMessage(key) ? t(key) : fallback;
}

export function fmtBytes(n) {
  const b = Number(n) || 0;
  if (b < 1024) return `${b} B`;
  const u = ['KB', 'MB', 'GB', 'TB'];
  let v = b / 1024, i = 0;
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
  return displayQuantity(v,u[i],v<10?1:0);
}
/*
 * A host name or table.column, escaped, with a break opportunity after each dot: long names wrap on a
 * phone instead of widening the page (and the dotted text is not mistaken for an i18n key).
 */
const dotted = (s) => esc(s).replace(/\./g, '<wbr>.');
const when = (sec) => (sec ? displayValue(new Date(sec * 1000), "toLocaleString", undefined) : '—');
const yes = (b) => (b ? t('trust.yes') : t('trust.no'));
const section = (title, body, desc = '') => `
  <div class="settings-section trust-section">
    <h3>${uiText(title)}</h3>
    ${renderHTML(desc ? `<p class="trust-desc">${uiText(desc)}</p>` : '')}
    ${renderHTML(body)}
  </div>`;
const kv = (rows) => `<dl class="trust-kv">${renderHTML(rows.filter(Boolean).map(([k, v]) => `<dt>${uiText(k)}</dt><dd>${renderHTML(v)}</dd>`).join(''))}</dl>`;

/* ───────────── the report ───────────── */

export function residencyHtml(r) {
  const res = r.residency || { all_on_server: false, reasons: [] };
  if (res.all_on_server) {
    return `<div class="trust-residency ok"><strong>${uiText(t('trust.residency.all_here'))}</strong>
      <div>${uiText(t('trust.residency.all_here_desc'))}</div></div>`;
  }
  const names = displayList(res.reasons.map((id) => tk(`trust.int.${id}`, id)));
  return `<div class="trust-residency leaves"><strong>${uiText(t('trust.residency.some_leaves'))}</strong>
    <div>${renderHTML(t('trust.residency.because', { list: names }))}</div></div>`;
}

function storageHtml(r) {
  const s = r.storage || {};
  const d = s.default || {};
  const provider = tk(`trust.storage.provider.${d.provider}`, d.provider || 'local');
  const rows = [
    [t('trust.storage.media'), esc(d.region ? t('trust.storage.provider_region',{provider,region:d.region}) : provider)],
    d.bucket ? [t('trust.storage.bucket'), dotted(d.bucket)] : null,
    d.endpoint_host ? [t('trust.storage.endpoint'), dotted(d.endpoint_host)] : null,
    [t('trust.storage.set_by'), esc(d.from_env ? t('trust.storage.from_env') : tk(`trust.storage.scope.${d.scope}`, d.scope || ''))],
    s.files ? [t('trust.storage.files'), esc(t('trust.storage.files_value', { n: s.files.n || 0, size: fmtBytes(s.files.bytes) }))] : null,
    s.local_dir ? [t('trust.storage.local_dir'), `<code>${uiText(s.local_dir)}</code>`] : null,
    Object.keys(s.profiles || {}).length ? [t('trust.storage.profiles'), esc(displayList(Object.entries(s.profiles).map(([p, n]) => t('trust.storage.profile_count',{provider:tk(`trust.storage.provider.${p}`,p),n}))))] : null,
    s.workspace_overrides ? [t('trust.storage.overrides'), esc(String(s.workspace_overrides))] : null,
    [t('trust.db.title'), esc(t('trust.db.value'))],
    r.database && r.database.path ? [t('trust.db.path'), `<code>${uiText(r.database.path)}</code>${renderHTML(r.database.bytes ? ` · ${esc(fmtBytes(r.database.bytes))}` : '')}`] : null,
  ];
  return section(t('trust.where.title'), kv(rows), t('trust.where.desc'));
}

function encryptionHtml(r) {
  const e = r.encryption || {};
  const cols = e.encrypted_columns || [];
  return section(t('trust.enc.title'), `
    ${kv([
      [t('trust.enc.secrets'), esc(t('trust.enc.secrets_value'))],
      [t('trust.enc.passwords'), esc(t('trust.enc.passwords_value'))],
      [t('trust.enc.tokens'), esc(t('trust.enc.tokens_value'))],
      [t('trust.enc.media'), esc(t('trust.enc.media_value'))],
    ])}
    ${cols.length ? `<details class="trust-details"><summary>${uiText(t('trust.enc.columns', { n: cols.length }))}</summary>
      <ul class="trust-list">${renderHTML(cols.map((c) => `<li><code>${renderHTML(dotted(c))}</code></li>`).join(''))}</ul></details>` : ''}`,
  t('trust.enc.desc'));
}

function integrationsHtml(r) {
  const ints = r.integrations || [];
  const on = ints.filter((i) => i.enabled);
  const off = ints.filter((i) => !i.enabled);
  const row = (i) => `<tr>
    <td><strong>${uiText(tk(`trust.int.${i.id}`, i.id))}</strong><div class="trust-muted">${uiText(tk(`trust.int.${i.id}.sends`, ''))}</div></td>
    <td>${renderHTML(i.customer_data ? `<span class="trust-pill warn">${uiText(t('trust.int.customer_data'))}</span>` : `<span class="trust-pill">${uiText(t('trust.int.no_customer_data'))}</span>`)}</td>
    <td>${renderHTML(i.hosts && i.hosts.length ? i.hosts.map((h) => `<code>${renderHTML(dotted(h))}</code>`).join(' ') : `<span class="trust-muted">${uiText(t('trust.int.hosts_configured'))}</span>`)}</td>
    <td>${renderHTML(i.count == null ? '' : esc(String(i.count)))}</td>
  </tr>`;
  const table = on.length ? `<div class="table-wrap"><table class="att-table">
      <thead><tr><th>${uiText(t('trust.int.col.name'))}</th><th>${uiText(t('trust.int.col.data'))}</th><th>${uiText(t('trust.int.col.to'))}</th><th>${uiText(t('trust.int.col.count'))}</th></tr></thead>
      <tbody>${renderHTML(on.map(row).join(''))}</tbody></table></div>` : `<p class="trust-muted">${uiText(t('trust.int.none_on'))}</p>`;
  const offList = off.length ? `<details class="trust-details"><summary>${uiText(t('trust.int.off', { n: off.length }))}</summary>
      <p class="trust-muted">${renderHTML(off.map((i) => esc(tk(`trust.int.${i.id}`, i.id))).join(', '))}</p></details>` : '';
  return section(t('trust.int.title'), table + offList, t('trust.int.desc'));
}

function telemetryHtml(r) {
  const tel = r.telemetry || {};
  const on = tel.state === 'on';
  return section(t('trust.tel.title'), kv([
    [t('trust.tel.state'), esc(on ? t('trust.tel.on') : tel.state === 'off' ? t('trust.tel.off') : t('trust.tel.unasked'))],
    on ? [t('trust.tel.fields'), (tel.fields || []).map((f) => `<code>${uiText(f)}</code>`).join(' ')] : null,
  ]), t('trust.tel.desc'));
}

function retentionHtml(r) {
  const val = (x) => (x.days != null ? t('trust.ret.days', { n: x.days })
    : x.hours != null ? t('trust.ret.hours', { n: x.hours })
      : x.keep != null ? t('trust.ret.keep', { n: x.keep }) : '—');
  return section(t('trust.ret.title'), `<div class="table-wrap"><table class="att-table"><tbody>
    ${renderHTML((r.retention || []).map((x) => `<tr><td>${uiText(tk(`trust.ret.${x.id}`, x.id))}</td><td>${uiText(val(x))}</td></tr>`).join(''))}
  </tbody></table></div>`, t('trust.ret.desc'));
}

function backupsHtml(r) {
  const b = r.backups || {};
  const s = b.upgrade_snapshots || {};
  return section(t('trust.bak.title'), kv([
    [t('trust.bak.snapshots'), esc(t('trust.bak.snapshots_value', { keep: s.keep || 0, present: s.present || 0 }))],
    s.latest_at ? [t('trust.bak.latest'), esc(when(s.latest_at))] : null,
    s.dir ? [t('trust.bak.dir'), `<code>${uiText(s.dir)}</code>`] : null,
    [t('trust.bak.offsite'), esc(t('trust.bak.offsite_value'))],
  ]), t('trust.bak.desc'));
}

function identityHtml(r) {
  const id = r.identity || {};
  const sso = id.sso || {};
  return section(t('trust.id.title'), kv([
    [t('trust.id.mfa'), esc(t('trust.id.mfa_value', { n: id.members_with_mfa || 0, total: id.members || 0 }))],
    [t('trust.id.passkeys'), esc(t('trust.id.count_people', { n: id.members_with_passkey || 0 }))],
    [t('trust.id.totp'), esc(t('trust.id.count_people', { n: id.members_with_totp || 0 }))],
    [t('trust.id.sso'), esc(t('trust.id.sso_value', { n: (sso.org_providers || 0) + (sso.instance_providers || []).length }))],
    [t('trust.id.sso_only'), esc(typeof sso.sso_only === 'boolean' ? yes(sso.sso_only) : String(sso.sso_only || 0))],
    [t('trust.id.scim'), esc(id.scim && id.scim.enabled ? t('trust.id.scim_on', { n: id.scim.active_tokens || 0 }) : t('trust.no'))],
  ]), t('trust.id.desc'));
}

/** The whole report, read-only. */
export function reportHtml(r) {
  return `
    ${renderHTML(residencyHtml(r))}
    <p class="trust-muted trust-generated">${uiText(t('trust.generated', { when: when(r.generated_at) }))}</p>
    ${renderHTML(storageHtml(r))}
    ${renderHTML(encryptionHtml(r))}
    ${renderHTML(integrationsHtml(r))}
    ${renderHTML(telemetryHtml(r))}
    ${renderHTML(retentionHtml(r))}
    ${renderHTML(backupsHtml(r))}
    ${renderHTML(identityHtml(r))}`;
}

/* ───────────── outbound connections ───────────── */

export async function mountOutbound(el, { instance = false } = {}) {
  let days = 30;
  async function load() {
    el.innerHTML = `<p class="trust-muted">${uiText(t('common.loading'))}</p>`;
    let data;
    try { data = await api.get(`/trust/outbound?days=${days}${instance ? '&scope=instance' : ''}`); }
    catch (e) { el.innerHTML = `<p class="trust-muted">${uiText((errorMessage(e)))}</p>`; return; }
    const rows = data.rows || [];
    const scopeLabel = (s) => tk(`trust.out.scope.${s}`, s);
    el.innerHTML = `
      <div class="trust-toolbar">
        ${renderHTML([30, 90].map((d) => `<button type="button" class="btn btn-sm ${d === days ? 'btn-primary' : 'btn-secondary'}" data-days="${d}">${uiText(t('trust.out.last_days', { n: d }))}</button>`).join(''))}
        <span class="trust-muted">${uiText(t('trust.out.summary', { hosts: new Set(rows.map((r) => r.host)).size, internet: new Set(rows.filter((r) => r.scope === 'internet').map((r) => r.host)).size }))}</span>
      </div>
      ${renderHTML(rows.length ? `<div class="table-wrap"><table class="att-table">
        <thead><tr><th>${uiText(t('trust.out.col.host'))}</th><th>${uiText(t('trust.out.col.feature'))}</th><th>${uiText(t('trust.out.col.network'))}</th>
          <th>${uiText(t('trust.out.col.requests'))}</th><th>${uiText(t('trust.out.col.data'))}</th>${renderHTML(instance ? `<th>${uiText(t('trust.out.col.orgs'))}</th>` : '')}<th>${uiText(t('trust.out.col.last'))}</th></tr></thead>
        <tbody>${renderHTML(rows.map((r) => `<tr>
          <td><code>${renderHTML(dotted(r.host))}</code></td>
          <td>${uiText(tk(`trust.feature.${r.feature}`, r.feature))}</td>
          <td><span class="trust-pill${r.scope === 'internet' ? ' warn' : ''}">${uiText(scopeLabel(r.scope))}</span></td>
          <td>${uiText(String(r.count || 0))}${renderHTML(r.errors ? ` <span class="trust-muted">(${uiText(t('trust.out.errors', { n: r.errors }))})</span>` : '')}</td>
          <td>${uiText(fmtBytes((r.bytes_in || 0) + (r.bytes_out || 0)))}</td>
          ${renderHTML(instance ? `<td>${uiText(String(r.organizations || 0))}</td>` : '')}
          <td>${uiText(when(r.last_seen))}</td></tr>`).join(''))}</tbody></table></div>`
        : `<p class="trust-muted">${uiText(t('trust.out.none'))}</p>`)}
      <p class="trust-muted">${uiText(t('trust.out.note'))}</p>`;
    el.querySelectorAll('[data-days]').forEach((b) => b.addEventListener('click', () => { days = Number(b.dataset.days); load(); }));
  }
  await load();
}

/* ───────────── exports ───────────── */

let pollTimer = null;
export function stopPolling() { if (pollTimer) { clearTimeout(pollTimer); pollTimer = null; } }

export async function mountExports(el, { canOrg = false } = {}) {
  stopPolling();
  async function load() {
    let data;
    try { data = await api.get('/trust/exports'); }
    catch (e) { el.innerHTML = `<p class="trust-muted">${uiText((errorMessage(e)))}</p>`; return; }
    const jobs = [...(data.organization || []), ...(data.personal || [])].sort((a, b) => b.created_at - a.created_at);
    const status = (j) => tk(`trust.exp.status.${j.status}`, j.status);
    el.innerHTML = `
      <div class="trust-toolbar">
        ${renderHTML(canOrg ? `<button type="button" class="btn btn-primary btn-sm" data-export="org">${uiText(t('trust.exp.org'))}</button>` : '')}
        <button type="button" class="btn btn-secondary btn-sm" data-export="user">${uiText(t('trust.exp.mine'))}</button>
      </div>
      <p class="trust-muted">${uiText(t('trust.exp.limits', { n: data.limits.per_day, hours: data.limits.kept_hours, minutes: data.limits.link_minutes }))}</p>
      ${renderHTML(jobs.length ? `<div class="table-wrap"><table class="att-table">
        <thead><tr><th>${uiText(t('trust.exp.col.what'))}</th><th>${uiText(t('trust.exp.col.status'))}</th><th>${uiText(t('trust.exp.col.size'))}</th><th>${uiText(t('trust.exp.col.requested'))}</th><th></th></tr></thead>
        <tbody>${renderHTML(jobs.map((j) => `<tr>
          <td>${uiText(j.kind === 'org' ? t('trust.exp.kind_org') : t('trust.exp.kind_user'))}</td>
          <td>${uiText(status(j))}${renderHTML(j.error ? `<div class="trust-muted">${uiText(j.error)}</div>` : '')}</td>
          <td>${renderHTML(j.bytes ? esc(fmtBytes(j.bytes)) : '')}</td>
          <td>${uiText(when(j.created_at))}${renderHTML(j.expires_at && j.status === 'ready' ? `<div class="trust-muted">${uiText(t('trust.exp.until', { when: when(j.expires_at) }))}</div>` : '')}</td>
          <td>${renderHTML(j.status === 'ready' ? `<button type="button" class="btn btn-secondary btn-sm" data-download="${esc(j.id)}">${uiText(t('trust.exp.download'))}</button>` : '')}</td>
        </tr>`).join(''))}</tbody></table></div>` : '')}`;
    el.querySelectorAll('[data-export]').forEach((b) => b.addEventListener('click', async () => {
      b.disabled = true;
      try {
        await api.post('/trust/exports', { kind: b.dataset.export });
        showToast(t('trust.exp.started'), 'success');
      } catch (e) {
        showToast(e.code ? tk(`trust.err.${e.code}`, (errorMessage(e))) : (errorMessage(e)), 'error');
      }
      load();
    }));
    el.querySelectorAll('[data-download]').forEach((b) => b.addEventListener('click', async () => {
      try {
        const { url } = await api.post(`/trust/exports/${encodeURIComponent(b.dataset.download)}/link`);
        // A same-origin path the server built; a plain navigation lets the browser stream the zip to disk.
        if (typeof url === 'string' && url.startsWith('/api/public/trust-export/')) window.location.href = url;
      } catch (e) { showToast(errorMessage(e), 'error'); }
    }));
    stopPolling();
    if (jobs.some((j) => j.status === 'queued' || j.status === 'running')) {
      pollTimer = setTimeout(() => { if (document.body.contains(el)) load(); }, 3000);
    }
  }
  await load();
}

/* ───────────── delete everything ───────────── */

export async function mountDeletion(el, report) {
  async function load() {
    let st;
    try { st = await api.get('/trust/org-deletion'); }
    catch (e) { el.innerHTML = `<p class="trust-muted">${uiText((errorMessage(e)))}</p>`; return; }
    const orgName = (report.organization && report.organization.name) || '';
    if (st.scheduled) {
      el.innerHTML = `<div class="trust-residency leaves"><strong>${uiText(t('trust.del.scheduled', { when: when(st.execute_after) }))}</strong>
        <div>${uiText(t('trust.del.scheduled_desc'))}</div></div>
        ${renderHTML(st.can_delete ? `<button type="button" class="btn btn-secondary" id="trustCancelDelete">${uiText(t('trust.del.cancel'))}</button>` : '')}`;
      el.querySelector('#trustCancelDelete')?.addEventListener('click', async () => {
        try { await api.delete('/trust/org-deletion'); showToast(t('trust.del.cancelled'), 'success'); load(); }
        catch (e) { showToast(errorMessage(e), 'error'); }
      });
      return;
    }
    if (!st.can_delete) { el.innerHTML = `<p class="trust-muted">${uiText(t('trust.del.owner_only'))}</p>`; return; }
    el.innerHTML = `<p class="trust-desc">${uiText(t('trust.del.desc', { days: st.grace_days }))}</p>
      <button type="button" class="btn btn-danger" id="trustDeleteOrg">${uiText(t('trust.del.button'))}</button>`;
    el.querySelector('#trustDeleteOrg').addEventListener('click', () => {
      openTypeToConfirmModal({
        title: t('trust.del.confirm_title'),
        body: `<p>${uiText(t('trust.del.confirm_body', { name: orgName, days: st.grace_days }))}</p><p>${uiText(t('trust.del.confirm_export'))}</p>`,
        expected: orgName,
        confirmLabel: t('trust.del.confirm_button'),
        onConfirm: async () => {
          try {
            await api.post('/trust/org-deletion', { confirm_name: orgName, understand: true });
          } catch (e) {
            throw localizedError(e.code ? tk(`trust.err.${e.code}`, errorMessage(e)) : errorMessage(e));
          }
          showToast(t('trust.del.done'), 'success');
          load();
        },
      });
    });
  }
  await load();
}

/* ───────────── the public page toggle (platform) ───────────── */

export async function mountPublicToggle(el) {
  async function load() {
    let st;
    try { st = await api.get('/trust/public'); }
    catch (e) { el.innerHTML = `<p class="trust-muted">${uiText((errorMessage(e)))}</p>`; return; }
    el.innerHTML = `
      <label class="trust-switch"><input type="checkbox" id="trustPublicToggle" ${st.enabled ? 'checked' : ''}> ${uiText(t('trust.pub.toggle'))}</label>
      <p class="trust-muted">${uiText(t('trust.pub.desc'))}</p>
      ${renderHTML(st.enabled ? `<p><a href="/trust" target="_blank" rel="noopener">${uiText(t('trust.pub.open'))}</a></p>` : '')}
      <details class="trust-details"><summary>${uiText(t('trust.pub.preview'))}</summary><pre class="trust-pre">${uiText(JSON.stringify(st.preview, null, 2))}</pre></details>`;
    el.querySelector('#trustPublicToggle').addEventListener('change', async (e) => {
      try { await api.put('/trust/public', { enabled: e.target.checked }); showToast(t('trust.pub.saved'), 'success'); load(); }
      catch (err) { showToast(errorMessage(err), 'error'); e.target.checked = !e.target.checked; }
    });
  }
  await load();
}

export { section };
