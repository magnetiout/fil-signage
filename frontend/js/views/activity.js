import {translatedAttribute} from '../lib/i18n-bindings.js';
import { renderHTML, uiText } from '../lib/i18n-bindings.js';
import { localizedError, displayValue, message as t } from '../i18n.js';

import { errorMessage, localizeServerError } from '../api.js';

import { meshCapability } from '../api.js';
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
const API = (url) => fetch('/api' + url, { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }}).then(async (r) => {
  if (r.status === 401) { localStorage.removeItem('token'); window.location.reload(); throw localizedError(t("ui.labels.session_expired_b82819")); }
  if (!r.ok) { const e = await r.json().catch(() => ({})); throw localizedError(localizeServerError(e.error) || t("ui.activity.request_failed_value0_ad6dc0", {value0: r.status})); }
  return r.json();
});

/*
 * ⚠️ ONE PLACE FOR "WHAT IS WRONG RIGHT NOW", INCLUDING OTHER SERVERS.
 *
 * Open alerts used to have a mesh-only inbox under Servers, which meant two screens answering the
 * same question — and with two, the one an operator does not have open is always the one holding
 * the answer. This section shows local incidents and incidents from connected servers together,
 * because to the person on call there is no such thing as "a remote outage": there is an outage.
 *
 * The rollup matters most when the answer is THIS server. When most connected sites go quiet at
 * once, the honest reading is "suspect our own connection", not "forty sites are down" — the latter
 * dispatches engineers to premises that are fine.
 */
async function renderAlerts() {
  const el = document.getElementById('alertsPanel');
  if (!el) return;

  let mesh = null;
  // A server with no mesh simply has no remote half; that is not an error worth showing.
  // #329: and on a server that says outright it is not a hub, do not even ask — /alerts is a hub
  // route, so this was a guaranteed 404 every time the Activity view opened.
  if (meshCapability('hub') !== false) {
    try { mesh = await API('/mesh/alerts'); } catch (e) { mesh = null; }
  }

  const local = (mesh && mesh.local) || [];
  const remote = (mesh && mesh.alerts) || [];
  const rollups = ((mesh && mesh.rollups) || []).filter((r) => r.suspectSelf);

  if (!local.length && !remote.length) {
    el.innerHTML = `<div style="padding:12px 0;color:var(--text-muted);font-size:13px">
      ${renderHTML(t("ui.activity.nothing_is_open_right_now_d3f1a7", {value0: mesh ? t("ui.activity.here_or_on_any_connected_server_351301") : ''}))}</div>`;
    return;
  }

  const when = (sec) => (sec ? displayValue(new Date(sec * 1000), "toLocaleString", undefined) : '');
  const row = (label, where, since, remoteRow) => `
    <div style="display:flex;gap:12px;padding:10px 0;border-bottom:1px solid var(--border);align-items:center">
      <div style="width:8px;height:8px;border-radius:50%;background:${remoteRow ? '#f59e0b' : '#ef4444'};flex-shrink:0"></div>
      <div style="flex:1;min-width:0">
        <div style="font-size:13px"><strong>${uiText(label)}</strong></div>
        <div style="font-size:12px;color:var(--text-muted)">${uiText(where)}</div>
      </div>
      <div style="font-size:11px;color:var(--text-muted);white-space:nowrap">${uiText(when(since))}</div>
    </div>`;

  el.innerHTML = `
    ${rollups.map((r) => `
      <div style="border-left:3px solid var(--warning,#f59e0b);padding:10px 12px;margin-bottom:10px;background:var(--bg-card)">
        <strong>${renderHTML(t("ui.activity.check_this_server_s_connection_first_af97ec"))}</strong>
        <div style="font-size:12px;color:var(--text-muted);margin-top:4px">${uiText(r.summary)}</div>
      </div>`).join('')}
    ${local.map((i) => row(String(i.metric || '').replace(/[_-]/g, ' '),
                           i.device_id ? t("ui.activity.this_server_value0_911093", {value0: i.device_id}) : t("ui.activity.this_server_086b51"),
                           i.opened_at, false)).join('')}
    ${remote.map((a) => row(String(a.alert_type || '').replace(/[_-]/g, ' '),
                            // ⚠️ Says which server, and whether we can currently SEE that server.
                            // "Last known" on an alert is not pedantry: acting on a stale alert from
                            // an unreachable site is how somebody drives to a screen that is fine.
                            `${String(a.origin_node_id || '').slice(0, 8)}${a.stale ? t("ui.activity.last_known_that_server_is_not_reachable_b81952") : ''}`,
                            a.opened_at, true)).join('')}`;
}

export async function render(container) {
  container.innerHTML = `
    <div class="page-header">
      <div><h1>${renderHTML(t('activity.title'))} <span class="help-tip" ${translatedAttribute("data-tip", 'activity.help_tip')}>?</span></h1><div class="subtitle">${renderHTML(t('activity.subtitle'))}</div></div>
    </div>
    <div class="settings-section" style="margin-bottom:20px">
      <h3 style="font-size:14px;margin-bottom:4px">${renderHTML(t("ui.activity.open_alerts"))}</h3>
      <div id="alertsPanel"><div style="color:var(--text-muted);font-size:13px">${renderHTML(t("ui.activity.loading"))}</div></div>
    </div>
    <h3 style="font-size:14px;margin-bottom:8px">${renderHTML(t("ui.activity.recent_activity"))}</h3>
    <div id="activityList"><div class="empty-state"><h3>${renderHTML(t('common.loading'))}</h3></div></div>
    <div style="text-align:center;margin-top:16px">
      <button class="btn btn-secondary btn-sm" id="loadMoreBtn" style="display:none">${renderHTML(t('activity.load_more'))}</button>
    </div>
  `;

  let offset = 0;
  const limit = 50;

  async function loadActivity(append = false) {
    try {
      const items = await API(`/activity?limit=${limit}&offset=${offset}`);
      const list = document.getElementById('activityList');

      if (!append) list.innerHTML = '';

      if (items.length === 0 && offset === 0) {
        list.innerHTML = `<div class="empty-state"><h3>${renderHTML(t('activity.empty_title'))}</h3><p>${renderHTML(t('activity.empty_desc'))}</p></div>`;
        return;
      }

      const html = items.map(item => {
        const time = new Date(item.created_at * 1000);
        const timeStr = displayValue(time, "toLocaleDateString", { month: 'short', day: 'numeric' }) + ' ' +
                        displayValue(time, "toLocaleTimeString", { hour: '2-digit', minute: '2-digit' });
        const icon = getActionIcon(item.action);

        return `
          <div style="display:flex;gap:12px;padding:12px 0;border-bottom:1px solid var(--border);align-items:flex-start">
            <div style="width:32px;height:32px;border-radius:50%;background:var(--bg-card);display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:14px">${renderHTML(icon)}</div>
            <div style="flex:1;min-width:0">
              <div style="font-size:13px">
                <strong>${uiText(item.user_name || item.user_email || t('activity.system'))}</strong>
                <span style="color:var(--text-secondary)"> ${uiText(formatAction(item.action))}</span>
              </div>
              ${renderHTML(item.details ? `<div style="font-size:12px;color:var(--text-muted);margin-top:2px">${uiText(item.details)}</div>` : '')}
            </div>
            <div style="font-size:11px;color:var(--text-muted);white-space:nowrap;flex-shrink:0">${renderHTML(timeStr)}</div>
          </div>
        `;
      }).join('');

      if (append) {
        list.insertAdjacentHTML('beforeend', html);
      } else {
        list.innerHTML = html;
      }

      document.getElementById('loadMoreBtn').style.display = items.length >= limit ? '' : 'none';
    } catch (err) {
      showToast(errorMessage(err), 'error');
    }
  }

  document.getElementById('loadMoreBtn').onclick = () => {
    offset += limit;
    loadActivity(true);
  };

  loadActivity();
  renderAlerts();
}

function getActionIcon(action) {
  if (action.includes('DELETE')) return '&#128465;';
  if (action.includes('POST') && action.includes('content')) return '&#128228;';
  if (action.includes('POST') && action.includes('provision')) return '&#128279;';
  if (action.includes('POST') && action.includes('assignment')) return '&#128203;';
  if (action.includes('alert')) return '&#128276;';
  if (action.includes('PUT')) return '&#9998;';
  if (action.includes('POST')) return '&#10133;';
  return '&#128196;';
}

// Action verbs are user-visible; translate them through t() so they switch
// languages with the rest of the UI. The mapping below preserves the original
// verb-then-noun structure of the English version.
function formatAction(action) {
  const raw=String(action||'');
  if(raw==='alert:device_offline')return t('activity.alert_device_offline');
  const m=/^(POST|PUT|DELETE) (\/api\/[^?]*)$/.exec(raw);
  if(m)m[2]=m[2].slice(4);
  if(!m)return raw; // unknown action identifiers are diagnostic data, not translation keys
  if(m[1]==='POST'&&m[2]==='/provision/pair')return t('activity.action_paired_device');
  if(m[1]==='POST'&&m[2]==='/content/remote')return t('activity.action_added_remote_content');
  const resources=[['/assignments/device/:deviceId','activity.noun_playlist_assignment'],['/assignments/:id','activity.noun_assignment'],['/content','activity.noun_content'],['/devices/:id','activity.noun_device'],['/layouts','activity.noun_layout'],['/widgets','activity.noun_widget'],['/schedules','activity.noun_schedule'],['/walls','activity.noun_video_wall']];
  const resource=resources.find(([path])=>m[2]===path||m[2].startsWith(path+'/'));
  if(!resource)return raw;
  const keys={POST:'activity.operation_created',PUT:'activity.operation_updated',DELETE:'activity.operation_deleted'};
  return t(keys[m[1]],{resource:t(resource[1])});
}

export function cleanup() {}
