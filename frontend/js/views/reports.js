import {getLocale} from '../i18n.js';
import {requestError} from '../api.js';
import {getReportHeaders} from '../api.js';
import {translatedAttribute} from '../lib/i18n-bindings.js';
import { renderHTML, uiText, attributeBinding } from '../lib/i18n-bindings.js';
import { localizedError, displayQuantity, displayValue, message as t } from '../i18n.js';

import { errorMessage, localizeServerError } from '../api.js';

import { api, meshCapability } from '../api.js';
import { showToast } from '../components/toast.js';
import { esc } from '../utils.js';

// A refused request must reject, not resolve.
//
// This helper used to end in `.then(r => r.json())`, so a 403/404/500 body resolved as an ordinary
// value and the surrounding try/catch was unreachable — every handler took the failure for success.
// Concretely: deleting a built-in layout template showed "Layout deleted" while the server had
// returned 403 and the template was still there, and a rejected platform-role change showed "Role
// updated" while the dropdown kept displaying a value the server refused (its revert lives only in
// the dead catch). The shared client in api.js has always thrown on !res.ok; these local copies did
// not. Same contract now, including the 401 session-expiry reload.
const API = (url, opts = {}) => fetch('/api' + url, { headers: { Authorization: `Bearer ${localStorage.getItem('token')}`, ...opts.headers }, ...opts }).then(async (r) => {
  if (r.status === 401) { localStorage.removeItem('token'); window.location.reload(); throw localizedError(t("ui.labels.session_expired_b82819")); }
  if (!r.ok) { const e = await r.json().catch(() => ({})); throw localizedError(localizeServerError(e.error) || t("ui.reports.request_failed_value0_ad6dc0", {value0: r.status})); }
  return r.json();
});

export async function render(container) {
  const devices = await api.getDevices();
  // Scale-out (docs/scale-out.md): playback history is NOT copied to a replica. On a copied
  // workspace an empty report would read as "nothing ever played"; say where the history is.
  let copied = false;
  try { copied = !!(JSON.parse(localStorage.getItem('user') || 'null')?.current_workspace?.origin_node_id); } catch (_) { copied = false; }
  const today = new Date();
  const thirtyDaysAgo = new Date(today);
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  container.innerHTML = `
    <div class="page-header">
      <div><h1>${renderHTML(t('report.title'))} <span class="help-tip" ${translatedAttribute("data-tip", 'report.help_tip')}>?</span></h1><div class="subtitle">${renderHTML(t('report.subtitle'))}</div></div>
      <a class="btn btn-secondary" id="exportBtn">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
        </svg>
        ${renderHTML(t('report.export_csv'))}
      </a>
    </div>

    <!-- ⚠️ Uptime lives in REPORTS, not under Servers. It is a report — the artifact an MSP hands a
         customer — and filing it beside the mesh plumbing means you have to already know the
         feature is mesh-shaped in order to find it. It renders only when there are connected
         servers to report on, so an ordinary install sees nothing new. -->
    <div id="uptimeReportSection"></div>

    ${renderHTML(copied ? `<div class="empty-state" style="margin-bottom:16px;padding:12px 16px"><p style="margin:0">${renderHTML(t('report.history_on_primary'))}</p></div>` : '')}

    <div style="display:flex;gap:12px;margin-bottom:20px;flex-wrap:wrap;align-items:flex-end">
      <div class="form-group" style="margin:0"><label>${renderHTML(t('report.device'))}</label>
        <select id="reportDevice" class="input" style="width:200px;background:var(--bg-input)">
          <option value="">${renderHTML(t('report.all_devices'))}</option>
          ${renderHTML(devices.map(d => `<option value="${d.id}">${uiText(d.name)}</option>`).join(''))}
        </select>
      </div>
      <div class="form-group" style="margin:0"><label>${renderHTML(t('report.start_date'))}</label>
        <input type="date" id="reportStart" class="input" value="${thirtyDaysAgo.toISOString().split('T')[0]}">
      </div>
      <div class="form-group" style="margin:0"><label>${renderHTML(t('report.end_date'))}</label>
        <input type="date" id="reportEnd" class="input" value="${today.toISOString().split('T')[0]}">
      </div>
      <button class="btn btn-primary btn-sm" id="loadReportBtn">${renderHTML(t('report.load_report'))}</button>
    </div>

    <div id="reportContent"><div class="empty-state"><h3>${renderHTML(t('report.select_range'))}</h3></div></div>
  `;

  document.getElementById('loadReportBtn').onclick = loadReport;
  loadReport();
  // The mesh half renders itself, and renders nothing at all when there is no mesh.
  renderUptimeReport();
  document.getElementById('exportBtn').onclick = async () => {
    const deviceId = document.getElementById('reportDevice').value;
    const start = document.getElementById('reportStart').value;
    const end = document.getElementById('reportEnd').value;
    try {
      const res=await fetch('/api/reports/export?'+new URLSearchParams({device_id:deviceId,start,end}),{headers:getReportHeaders(getLocale())});
      if(!res.ok)throw requestError(res.status,await res.json().catch(()=>({})));
      const a=document.createElement('a');a.href=URL.createObjectURL(await res.blob());a.download='proof-of-play.csv';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),10000);
    }catch(error){showToast(errorMessage(error),'error');}
  };

  async function loadReport() {
    const deviceId = document.getElementById('reportDevice').value;
    const start = document.getElementById('reportStart').value;
    const end = document.getElementById('reportEnd').value;
    const content = document.getElementById('reportContent');

    content.innerHTML = `<div class="empty-state"><h3>${renderHTML(t('common.loading'))}</h3></div>`;

    try {
      const summary = await API(`/reports/summary?device_id=${deviceId}&start=${start}&end=${end}`);

      content.innerHTML = `
        <div class="info-grid" style="margin-bottom:24px">
          <div class="info-card">
            <div class="info-card-label">${renderHTML(t('report.total_plays'))}</div>
            <div class="info-card-value">${renderHTML(displayValue(summary.overall.total_plays, "toLocaleString", undefined))}</div>
          </div>
          <div class="info-card">
            <div class="info-card-label">${renderHTML(t('report.total_hours'))}</div>
            <div class="info-card-value">${renderHTML(summary.overall.total_hours)}</div>
          </div>
          <div class="info-card">
            <div class="info-card-label">${renderHTML(t('report.unique_content'))}</div>
            <div class="info-card-value">${renderHTML(summary.overall.unique_content)}</div>
          </div>
          <div class="info-card">
            <div class="info-card-label">${renderHTML(t('report.active_devices'))}</div>
            <div class="info-card-value">${renderHTML(summary.overall.unique_devices)}</div>
          </div>
          <div class="info-card">
            <div class="info-card-label">${renderHTML(t('report.avg_duration'))}</div>
            <div class="info-card-value small">${renderHTML(formatDuration(summary.overall.avg_duration_sec))}</div>
          </div>
        </div>

        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,320px),1fr));gap:20px;margin-bottom:24px">
          <div class="settings-section" style="margin:0;min-width:0">
            <h3 style="font-size:14px;margin-bottom:12px">${renderHTML(t('report.plays_per_day'))}</h3>
            <div id="dailyChart" style="height:200px;display:flex;align-items:flex-end;gap:2px"></div>
          </div>

          <div class="settings-section" style="margin:0;min-width:0">
            <h3 style="font-size:14px;margin-bottom:12px">${renderHTML(t('report.plays_by_hour'))}</h3>
            <div id="hourlyChart" style="height:200px;display:flex;align-items:flex-end;gap:1px"></div>
          </div>
        </div>

        <div class="settings-section" style="margin-bottom:20px">
          <h3 style="font-size:14px;margin-bottom:12px">${renderHTML(t('report.top_content'))}</h3>
          <div class="table-wrap">
          <table style="width:100%;border-collapse:collapse;font-size:13px;min-width:460px">
            <thead><tr style="border-bottom:1px solid var(--border)">
              <th style="padding:8px;text-align:left;color:var(--text-muted)">${renderHTML(t('report.col.content'))}</th>
              <th style="padding:8px;text-align:right;color:var(--text-muted)">${renderHTML(t('report.col.plays'))}</th>
              <th style="padding:8px;text-align:right;color:var(--text-muted)">${renderHTML(t('report.col.total_hours'))}</th>
            </tr></thead>
            <tbody>
              ${renderHTML(summary.by_content.map(c => `
                <tr style="border-bottom:1px solid var(--border)">
                  <td style="padding:8px">${uiText(c.content_name || t('common.unknown'))}</td>
                  <td style="padding:8px;text-align:right">${renderHTML(c.plays)}</td>
                  <td style="padding:8px;text-align:right">${renderHTML(displayValue(c.total_seconds/3600,'toLocaleString',{minimumFractionDigits:1,maximumFractionDigits:1}))}</td>
                </tr>
              `).join('') || `<tr><td colspan="3" style="padding:16px;text-align:center;color:var(--text-muted)">${renderHTML(t('report.no_data'))}</td></tr>`)}
            </tbody>
          </table>
          </div>
        </div>

        <div class="settings-section">
          <h3 style="font-size:14px;margin-bottom:12px">${renderHTML(t('report.by_device'))}</h3>
          <div class="table-wrap">
          <table style="width:100%;border-collapse:collapse;font-size:13px;min-width:400px">
            <thead><tr style="border-bottom:1px solid var(--border)">
              <th style="padding:8px;text-align:left;color:var(--text-muted)">${renderHTML(t('report.col.device'))}</th>
              <th style="padding:8px;text-align:right;color:var(--text-muted)">${renderHTML(t('report.col.plays'))}</th>
              <th style="padding:8px;text-align:right;color:var(--text-muted)">${renderHTML(t('report.col.total_hours'))}</th>
            </tr></thead>
            <tbody>
              ${renderHTML(summary.by_device.map(d => `
                <tr style="border-bottom:1px solid var(--border)">
                  <td style="padding:8px">${uiText(d.device_name || '')}</td>
                  <td style="padding:8px;text-align:right">${renderHTML(d.plays)}</td>
                  <td style="padding:8px;text-align:right">${renderHTML(displayValue(d.total_seconds/3600,'toLocaleString',{minimumFractionDigits:1,maximumFractionDigits:1}))}</td>
                </tr>
              `).join('') || `<tr><td colspan="3" style="padding:16px;text-align:center;color:var(--text-muted)">${renderHTML(t('report.no_data'))}</td></tr>`)}
            </tbody>
          </table>
          </div>
        </div>

        <div id="kioskReportSection"></div>
      `;

      // #473 v2: interactive web page usage. Its own request, so a server without the endpoint
      // (or an error in it) leaves the play report above untouched.
      renderKioskSessions(deviceId, start, end).catch(() => {});

      renderBarChart('dailyChart', summary.by_day.map(d => ({
        label: displayValue(new Date(d.day), "toLocaleDateString", { month: 'short', day: 'numeric' }),
        value: d.plays
      })));

      const hourData = Array.from({ length: 24 }, (_, i) => {
        const found = summary.by_hour.find(h => h.hour === i);
        return { label: displayValue(new Date(2000,0,1,i),"toLocaleTimeString",{hour:"numeric"}), value: found?.plays || 0 };
      });
      renderBarChart('hourlyChart', hourData);

    } catch (err) {
      content.innerHTML = `<div class="empty-state"><h3>${renderHTML(t('report.error'))}</h3><p>${uiText((errorMessage(err)))}</p></div>`;
    }
  }
}

// #473 v2: "Interactive sessions". Rendered only when the range has any, so workspaces without
// interactive pages see no change.
async function renderKioskSessions(deviceId, start, end) {
  const host = document.getElementById('kioskReportSection');
  if (!host) return;
  const k = await API(`/reports/kiosk-sessions?device_id=${encodeURIComponent(deviceId || '')}&start=${encodeURIComponent(start || '')}&end=${encodeURIComponent(end || '')}`);
  if (!k || !k.overall || !k.overall.sessions) { host.innerHTML = ''; return; }
  const th = (txt, right) => `<th style="padding:8px;text-align:${right ? 'right' : 'left'};color:var(--text-muted)">${renderHTML(txt)}</th>`;
  const td = (txt, right) => `<td style="padding:8px${right ? ';text-align:right' : ''}">${renderHTML(txt)}</td>`;
  host.innerHTML = `
    <div class="settings-section" style="margin-top:20px">
      <h3 style="font-size:14px;margin-bottom:4px">${renderHTML(t('report.kiosk.title'))}</h3>
      <div style="font-size:12px;color:var(--text-muted);margin-bottom:12px">${renderHTML(t('report.kiosk.hint'))}</div>
      <div class="info-grid" style="margin-bottom:16px">
        <div class="info-card"><div class="info-card-label">${renderHTML(t('report.kiosk.sessions'))}</div><div class="info-card-value">${renderHTML(displayValue(Number(k.overall.sessions), "toLocaleString", undefined))}</div></div>
        <div class="info-card"><div class="info-card-label">${renderHTML(t('report.kiosk.avg_length'))}</div><div class="info-card-value small">${renderHTML(formatDuration(k.overall.avg_duration_sec))}</div></div>
        <div class="info-card"><div class="info-card-label">${renderHTML(t('report.kiosk.avg_pages'))}</div><div class="info-card-value small">${uiText(String(k.overall.avg_pages))}</div></div>
      </div>
      <h3 style="font-size:13px;margin-bottom:8px">${renderHTML(t('report.kiosk.per_day'))}</h3>
      <div id="kioskDailyChart" style="height:200px;display:flex;align-items:flex-end;gap:2px;margin-bottom:16px"></div>
      <div class="table-wrap">
      <table style="width:100%;border-collapse:collapse;font-size:13px;min-width:520px">
        <thead><tr style="border-bottom:1px solid var(--border)">
          ${renderHTML(th(t('report.kiosk.col.widget')))}${renderHTML(th(t('report.kiosk.sessions'), 1))}${renderHTML(th(t('report.kiosk.col.per_active_day'), 1))}${renderHTML(th(t('report.kiosk.avg_length'), 1))}${renderHTML(th(t('report.kiosk.avg_pages'), 1))}${renderHTML(th(t('report.kiosk.col.errors'), 1))}
        </tr></thead>
        <tbody>
          ${renderHTML(k.by_widget.map((w) => `<tr style="border-bottom:1px solid var(--border)">
            ${renderHTML(td(esc(w.widget_name || t('report.kiosk.deleted_widget'))))}${renderHTML(td(displayValue(Number(w.sessions), "toLocaleString", undefined), 1))}${renderHTML(td(esc(String(w.sessions_per_day)), 1))}${renderHTML(td(formatDuration(w.avg_duration_sec), 1))}${renderHTML(td(esc(String(w.avg_pages)), 1))}${renderHTML(td(Number(w.ended_by_error || 0), 1))}
          </tr>`).join(''))}
        </tbody>
      </table>
      </div>
    </div>`;
  renderBarChart('kioskDailyChart', k.by_day.map((d) => ({
    label: displayValue(new Date(d.day + 'T00:00:00Z'), "toLocaleDateString", { month: 'short', day: 'numeric', timeZone: 'UTC' }),
    value: d.sessions,
  })));
}

function renderBarChart(containerId, data) {
  const container = document.getElementById(containerId);
  if (!container || !data.length) return;

  const maxVal = Math.max(...data.map(d => d.value), 1);

  container.innerHTML = data.map(d => `
    <div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;min-width:0" title="${esc(d.label)}: ${esc(d.value)}">
      <div style="font-size:9px;color:var(--text-muted);margin-bottom:2px;display:${d.value > 0 ? 'block' : 'none'}">${renderHTML(d.value)}</div>
      <div style="width:100%;max-width:20px;height:${Math.max(2, (d.value / maxVal) * 160)}px;background:var(--accent);border-radius:2px 2px 0 0;min-height:2px"></div>
      <div style="font-size:8px;color:var(--text-muted);margin-top:4px;transform:rotate(-45deg);white-space:nowrap">${uiText(d.label)}</div>
    </div>
  `).join('');
}

function formatDuration(seconds) {
  if (!seconds) return displayValue(0,'toLocaleString',{style:'unit',unit:'second',unitDisplay:'short'});
  if (seconds < 60) return displayValue(Math.round(seconds),'toLocaleString',{style:'unit',unit:'second',unitDisplay:'short'});
  if (seconds < 3600) return displayValue(Math.round(seconds/60),'toLocaleString',{style:'unit',unit:'minute',unitDisplay:'short'});
  return displayValue(seconds/3600,'toLocaleString',{style:'unit',unit:'hour',unitDisplay:'short',minimumFractionDigits:1,maximumFractionDigits:1});
}

export function cleanup() {}

/* ===================== per-client uptime (mesh) ===================== */

/*
 * ⚠️ THREE NUMBERS, AND COVERAGE IS NOT OPTIONAL. "99.9% uptime" computed over a week nobody was
 * watching is a confident lie in the reassuring direction; "99.9% uptime, 62% coverage" is an
 * honest and useful sentence. They render at the same size, side by side, because whichever one is
 * smaller is the one that gets cropped out of the screenshot somebody emails.
 */
let uptimeState = { clients: [], clientId: null, days: 30 };

export async function renderUptimeReport() {
  const host = document.getElementById('uptimeReportSection');
  if (!host) return;

  let list;
  // No mesh, or nothing visible: this section simply does not exist for that install.
  // #329: /uptime is a hub route. When the server has already said it is not a hub, skip straight
  // to the same empty outcome rather than spending a 404 to learn it.
  if (meshCapability('hub') === false) { host.innerHTML = ''; return; }
  try { list = await api.get('/mesh/uptime'); } catch (e) { host.innerHTML = ''; return; }
  uptimeState.clients = list.clients || [];
  if (!uptimeState.clients.length) { host.innerHTML = ''; return; }
  uptimeState.clientId = uptimeState.clientId || uptimeState.clients[0].id;

  host.innerHTML = `
    <div class="settings-section" style="margin-bottom:20px">
      <h3 style="font-size:14px;margin-bottom:12px">${renderHTML(t("ui.reports.screen_uptime_by_client"))}</h3>
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:12px">
        <!-- ⚠️ No "all clients" option. A report headed with no client name, mixing customers into
             one percentage, is the document that gets forwarded to one of those customers. -->
        <select id="upClient" class="input" style="max-width:260px">
          ${renderHTML(uptimeState.clients.map((c) => `<option value="${esc(c.id)}" ${c.id === uptimeState.clientId ? 'selected' : ''}>${uiText(c.name)}</option>`).join(''))}
        </select>
        <select id="upDays" class="input" style="max-width:160px">
          ${renderHTML([7, 30, 90].map((d) => `<option value="${d}" ${uptimeState.days === d ? 'selected' : ''}>${renderHTML(t("ui.reports.last_days_de8246", {value2: d}))}</option>`).join(''))}
        </select>
        <button class="btn btn-secondary btn-sm" id="upCsv">${renderHTML(t("ui.reports.download_csv"))}</button>
      </div>
      <div id="upBody"></div>
    </div>`;

  host.querySelector('#upClient').addEventListener('change', (e) => {
    uptimeState.clientId = e.target.value; loadUptime();
  });
  host.querySelector('#upDays').addEventListener('change', (e) => {
    uptimeState.days = Number(e.target.value); loadUptime();
  });
  host.querySelector('#upCsv').addEventListener('click', downloadUptimeCsv);
  await loadUptime();
}

function uptimeWindow() {
  const to = Math.floor(Date.now() / 1000);
  return { to, from: to - uptimeState.days * 86400 };
}

async function loadUptime() {
  const body = document.getElementById('upBody');
  if (!body) return;
  body.innerHTML = `<div style="color:var(--text-muted);font-size:13px">${renderHTML(t("ui.reports.building_report_bcbced"))}</div>`;
  const { from, to } = uptimeWindow();
  let r;
  try {
    r = await api.get(`/mesh/uptime?clientId=${encodeURIComponent(uptimeState.clientId)}&from=${from}&to=${to}`);
  } catch (e) {
    body.innerHTML = `<div style="color:var(--text-muted)">${renderHTML(t("ui.reports.could_not_load_1c60b7", {value0: (errorMessage(e))}))}</div>`;
    return;
  }
  if (r.uptimePct == null) {
    body.innerHTML = `<div style="color:var(--text-muted);font-size:13px">${uiText(r.note ? t('reports.export.no_sites') : t("ui.labels.nothing_to_report_3da897"))}</div>`;
    return;
  }

  const TDs = 'padding:8px';
  const THs = 'padding:8px;text-align:left;color:var(--text-muted)';
  const mins = s => s >= 3600 ? t('reports.export.hours_short',{n:displayValue(Math.round(s/360)/10)}) : t('reports.export.minutes_short',{n:displayValue(Math.round(s/60))});

  body.innerHTML = `
    <div style="display:flex;gap:32px;flex-wrap:wrap;margin-bottom:12px">
      <div><div style="color:var(--text-muted);font-size:11px">${renderHTML(t("ui.reports.uptime"))}</div>
           <div style="font-size:28px">${renderHTML(displayValue(r.uptimePct/100,'toLocaleString',{style:'percent',maximumFractionDigits:1}))}</div></div>
      <div><div style="color:var(--text-muted);font-size:11px">${renderHTML(t("ui.reports.coverage"))}</div>
           <div style="font-size:28px;${r.coveragePct != null && r.coveragePct < 95 ? 'color:var(--warning,#f59e0b)' : ''}">${renderHTML(r.coveragePct == null ? '—' : displayValue(r.coveragePct/100,'toLocaleString',{style:'percent',maximumFractionDigits:1}))}</div></div>
      <div><div style="color:var(--text-muted);font-size:11px">${renderHTML(t("ui.reports.screens"))}</div>
           <div style="font-size:28px">${renderHTML(displayValue(r.deviceCount))}</div></div>
      <div><div style="color:var(--text-muted);font-size:11px">${renderHTML(t("ui.reports.incidents"))}</div>
           <div style="font-size:28px">${renderHTML(displayValue(r.incidentCount))}</div></div>
    </div>
    <p style="color:var(--text-muted);font-size:12px">${uiText(r.coverageNote ? t('reports.export.coverage_note') : '')} ${uiText(r.timezoneLabel ? t('reports.export.site_time',{zone:r.timezone||'UTC'}) : '')}</p>
    <div class="table-wrap">
      <table style="width:100%;border-collapse:collapse;font-size:13px;min-width:520px">
        <thead><tr style="border-bottom:1px solid var(--border)">
          <th style="${THs}">${renderHTML(t("ui.reports.screen_6e5613"))}</th><th style="${THs}">${renderHTML(t("ui.reports.server_aef7de"))}</th><th style="${THs}">${renderHTML(t("ui.reports.what_f8cf83"))}</th>
          <th style="${THs}">${renderHTML(t("ui.reports.started_ecbc89"))}</th><th style="${THs}">${renderHTML(t("ui.reports.for_ca15eb"))}</th>
        </tr></thead>
        <tbody>
          ${renderHTML(r.incidents.slice(0, 50).map((i) => `
            <tr style="border-bottom:1px solid var(--border)">
              <td style="${TDs}">${uiText(i.deviceName || i.deviceId)}</td>
              <td style="${TDs}"><span class="corp-chip" title="${esc(i.originNodeId)}"${attributeBinding("title", i.originNodeId)} style="font-family:monospace">${uiText(String(i.originNodeId).slice(0, 8))}</span></td>
              <td style="${TDs}">${uiText(uptimeAlertLabel(i.alertType))}</td>
              <td style="${TDs}">${renderHTML(displayValue(new Date(i.openedAt * 1000), "toLocaleString", undefined))}</td>
              <td style="${TDs}">${renderHTML(i.ongoing ? `<strong>${renderHTML(t("ui.reports.still_down_65a8d1"))}</strong>` : esc(mins(i.downSeconds)))}</td>
            </tr>`).join('') ||
            `<tr><td colspan="5" style="padding:16px;text-align:center;color:var(--text-muted)">${renderHTML(t("ui.reports.no_incidents_in_this_period_f9f610"))}</td></tr>`)}
        </tbody>
      </table>
    </div>
    ${renderHTML(r.incidents.length > 50
      // Never a silent truncation: showing 50 of 300 reads as "that was all of them".
      ? `<p style="color:var(--text-muted);font-size:12px">${renderHTML(t("ui.reports.showing_the_50_longest_of_the_csv_5de48a", {value0: r.incidents.length}))}</p>` : '')}`;
}

/*
 * ⚠️ Fetched with the auth header rather than linked. The API is Bearer-authenticated from
 * localStorage, so an <a href> would 401 — and it would 401 by REDIRECTING to login, which reads to
 * the user as "my session expired" rather than "that link cannot carry a token".
 */
async function downloadUptimeCsv() {
  const { from, to } = uptimeWindow();
  try {
    const res = await fetch(
      `/api/mesh/uptime.csv?clientId=${encodeURIComponent(uptimeState.clientId)}&from=${from}&to=${to}`,
      { headers:getReportHeaders(getLocale()) });
    if (!res.ok) throw localizedError(t("ui.reports.export_failed_value0_6dc4a6", {value0: res.status}));
    const blob = await res.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = (res.headers.get('Content-Disposition') || '').match(/filename="([^"]+)"/)?.[1] || 'uptime.csv';
    document.body.appendChild(a);
    a.click();
    a.remove();
    // Revoked on a delay: some browsers abort a download whose object URL is released too early.
    setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
  } catch (e) {
    showToast(t("ui.reports.could_not_export_value0_f26ab1", {value0: errorMessage(e)}), 'error');
  }
}

function uptimeAlertLabel(code) { const labels={offline:'offline',offline_seconds:'offline',battery_low:'battery',battery_level:'battery',temperature_c:'temperature',storage_free_mb:'storage',cpu_usage:'cpu',wifi_rssi:'wifi',ram_free_mb:'ram'};return labels[code]?t(`reports.export.alert_${labels[code]}`):t('reports.export.alert_unknown',{code:code||'—'}); }
