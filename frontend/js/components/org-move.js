import {storedErrorMessage} from '../api.js';
import { uiText, renderHTML } from '../lib/i18n-bindings.js';
import { localizedError, displayValue, message as t } from '../i18n.js';

import { errorMessage, localizeServerError } from '../api.js';

/*
 * 3.0 Move an organization to another server — the pieces that live on OTHER pages
 * (docs/move-server.md; the import guide itself is views/org-import.js):
 *
 *   mountMoveSection   Settings → Data & privacy: "Import an organization" and, on the OLD server,
 *                      "Send your screens to the new server" (reads the handover file the new
 *                      server produced and tells each screen to switch address).
 *   mountServerMove    Platform → Data & privacy: export / import the whole server.
 *
 * Everything the server sends is escaped with esc().
 */
import { api, getAuthHeaders } from '../api.js';
import { showToast } from './toast.js';
import { esc } from '../utils.js';

import { fmtBytes } from './trust-report.js';

const when = (sec) => (sec ? displayValue(new Date(sec * 1000), "toLocaleString", undefined) : '—');
function tk(key, fallback) { const v = t(key); return v === key ? fallback : v; }

/* ───────────── Settings → Data & privacy ───────────── */

export function mountMoveSection(el) {
  el.innerHTML = `
    <p class="trust-desc">${uiText(t('imp.move.desc'))}</p>
    <div class="trust-toolbar">
      <a class="btn btn-primary btn-sm" href="#/org-import" id="impStart">${uiText(t('imp.move.import_btn'))}</a>
      <button type="button" class="btn btn-secondary btn-sm" id="impHandoverBtn">${uiText(t('imp.handover.btn'))}</button>
    </div>
    <div id="impHandover" hidden></div>`;
  el.querySelector('#impHandoverBtn').addEventListener('click', () => {
    const box = el.querySelector('#impHandover');
    box.hidden = !box.hidden;
    if (!box.hidden) mountHandoverSender(box);
  });
}

/*
 * The OLD server's half of "move your screens": choose the handover file the new server gave you,
 * check the list, confirm, and every screen named in it that belongs to this organization is told to
 * switch to the new address (with the new server's enrolment key for it).
 */
function mountHandoverSender(el) {
  el.innerHTML = `
    <div class="imp-card">
      <p class="trust-desc">${uiText(t('imp.handover.desc'))}</p>
      <label class="btn btn-secondary btn-sm">${uiText(t('imp.handover.choose'))}<input type="file" accept=".json,application/json" hidden id="impHandoverFile"></label>
      <div id="impHandoverPreview"></div>
    </div>`;
  el.querySelector('#impHandoverFile').addEventListener('change', async (e) => {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    let doc = null;
    try { doc = JSON.parse(await f.text()); } catch { doc = null; }
    const prev = el.querySelector('#impHandoverPreview');
    if (!doc || doc.format !== 'screentinker-screen-handover-v1' || !Array.isArray(doc.screens)) {
      prev.innerHTML = `<p class="trust-muted">${uiText(t('imp.handover.bad_file'))}</p>`;
      return;
    }
    prev.innerHTML = `
      <div class="trust-residency leaves"><strong>${uiText(t('imp.handover.confirm_title', { n: doc.screens.length, server: String(doc.server || '') }))}</strong>
        <div>${uiText(t('imp.handover.confirm_desc'))}</div></div>
      <ul class="trust-list">${renderHTML(doc.screens.slice(0, 200).map((s) => `<li>${uiText(s.name || s.source_id)}</li>`).join(''))}</ul>
      <label class="trust-switch"><input type="checkbox" id="impHandoverOk"> ${uiText(t('imp.handover.understand'))}</label>
      <button type="button" class="btn btn-danger btn-sm" id="impHandoverSend" disabled>${uiText(t('imp.handover.send'))}</button>
      <div id="impHandoverResult"></div>`;
    const ok = prev.querySelector('#impHandoverOk');
    const send = prev.querySelector('#impHandoverSend');
    ok.addEventListener('change', () => { send.disabled = !ok.checked; });
    send.addEventListener('click', async () => {
      send.disabled = true;
      try {
        const r = await api.post('/org-import/handover', { handover: doc, confirm: true });
        const label = (s) => tk(`imp.handover.status.${s}`, s);
        prev.querySelector('#impHandoverResult').innerHTML = `
          <p class="trust-desc">${uiText(t('imp.handover.sent', { n: r.sent, total: r.results.length }))}</p>
          <div class="table-wrap"><table class="att-table"><tbody>
            ${renderHTML(r.results.map((x) => `<tr><td>${uiText(x.name || x.device_id)}</td><td><span class="trust-pill${x.status === 'sent' || x.status === 'relayed' ? '' : ' warn'}">${uiText(label(x.status))}</span></td></tr>`).join(''))}
          </tbody></table></div>
          <p class="trust-muted">${uiText(t('imp.handover.after'))}</p>`;
      } catch (err) {
        showToast(errorMessage(err), 'error');
        send.disabled = false;
      }
    });
  });
}

/* ───────────── Platform → Data & privacy ───────────── */

let serverPoll = null;
export function stopServerPoll() { if (serverPoll) { clearTimeout(serverPoll); serverPoll = null; } }

export async function mountServerMove(el) {
  stopServerPoll();
  async function load() {
    let data;
    try { data = await api.get('/org-import/instance-exports'); }
    catch (e) { el.innerHTML = `<p class="trust-muted">${uiText((errorMessage(e)))}</p>`; return; }
    const status = (j) => tk(`trust.exp.status.${j.status}`, j.status);
    el.innerHTML = `
      <p class="trust-desc">${uiText(t('imp.server.desc'))}</p>
      <div class="trust-toolbar">
        <button type="button" class="btn btn-primary btn-sm" id="impServerExport">${uiText(t('imp.server.export_btn'))}</button>
        <a class="btn btn-secondary btn-sm" href="#/org-import?kind=instance">${uiText(t('imp.server.import_btn'))}</a>
        <a class="btn btn-secondary btn-sm" href="#/org-import">${uiText(t('imp.move.import_btn'))}</a>
      </div>
      <label class="trust-switch"><input type="checkbox" id="impServerSettings" checked> ${uiText(t('imp.server.include_settings'))}</label>
      <p class="trust-muted">${uiText(t('trust.exp.limits', { n: data.limits.per_day, hours: data.limits.kept_hours, minutes: data.limits.link_minutes }))}</p>
      ${renderHTML(data.exports.length ? `<div class="table-wrap"><table class="att-table">
        <thead><tr><th>${uiText(t('trust.exp.col.status'))}</th><th>${uiText(t('trust.exp.col.size'))}</th><th>${uiText(t('trust.exp.col.requested'))}</th><th></th></tr></thead>
        <tbody>${renderHTML(data.exports.map((j) => `<tr>
          <td>${uiText(status(j))}${renderHTML(j.summary ? `<div class="trust-muted">${uiText(t('imp.server.orgs', { n: j.summary.organizations }))}</div>` : '')}${renderHTML(j.error ? `<div class="trust-muted">${uiText(storedErrorMessage(j.error))}</div>` : '')}</td>
          <td>${renderHTML(j.bytes ? esc(fmtBytes(j.bytes)) : '')}</td>
          <td>${uiText(when(j.created_at))}</td>
          <td>${renderHTML(j.status === 'ready' ? `<button type="button" class="btn btn-secondary btn-sm" data-dl="${esc(j.id)}">${uiText(t('trust.exp.download'))}</button>
            <button type="button" class="btn btn-secondary btn-sm" data-copy="${esc(j.id)}">${uiText(t('imp.server.copy_link'))}</button>` : '')}</td>
        </tr>`).join(''))}</tbody></table></div>` : '')}
      <p class="trust-muted">${uiText(t('imp.server.disk_hint'))}</p>`;
    el.querySelector('#impServerExport').addEventListener('click', async (e) => {
      e.target.disabled = true;
      try { await api.post('/org-import/instance-exports', { include_settings: el.querySelector('#impServerSettings').checked }); showToast(t('trust.exp.started'), 'success'); }
      catch (err) { showToast(errorMessage(err), 'error'); }
      load();
    });
    const linkFor = async (id) => (await api.post(`/org-import/instance-exports/${encodeURIComponent(id)}/link`)).url;
    el.querySelectorAll('[data-dl]').forEach((b) => b.addEventListener('click', async () => {
      try { const url = await linkFor(b.dataset.dl); if (typeof url === 'string' && url.startsWith('/api/public/instance-export/')) window.location.href = url; }
      catch (err) { showToast(errorMessage(err), 'error'); }
    }));
    el.querySelectorAll('[data-copy]').forEach((b) => b.addEventListener('click', async () => {
      try {
        const url = await linkFor(b.dataset.copy);
        await copy(window.location.origin + url);
        showToast(t('imp.server.link_copied'), 'success');
      } catch (err) { showToast(errorMessage(err), 'error'); }
    }));
    stopServerPoll();
    if (data.exports.some((j) => j.status === 'queued' || j.status === 'running')) {
      serverPoll = setTimeout(() => { if (document.body.contains(el)) load(); }, 3000);
    }
  }
  await load();
}

export async function copy(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch {
    const ta = document.createElement('textarea');
    ta.value = text; document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); } catch { /* */ }
    ta.remove();
    return true;
  }
}

/** Raw-bytes request for the chunked upload (api.js speaks JSON). */
export async function sendChunk(jobId, offset, blob) {
  const r = await fetch(`/api/org-import/jobs/${encodeURIComponent(jobId)}/upload`, {
    method: 'PATCH',
    headers: { ...getAuthHeaders(), 'Content-Type': 'application/octet-stream', 'Upload-Offset': String(offset) },
    body: blob,
  });
  const body = await r.json().catch(() => ({}));
  if (r.status === 409 && Number.isFinite(body.offset)) return { offset: body.offset };
  if (!r.ok) throw Object.assign(localizedError(localizeServerError(body.error) || t("ui.org_move.upload_failed_value0_b6b087", {value0: r.status})), { status: r.status });
  return body;
}
