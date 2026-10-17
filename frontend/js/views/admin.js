import { uiText, renderHTML, translatedAttribute, bindMessage, attributeBinding, binding, bindText } from '../lib/i18n-bindings.js';

import { displayQuantity, displayValue, message as t, messageCount as tn } from '../i18n.js';

import { localizeServerError } from '../api.js';

import { api } from '../api.js';
import { mountPromotionsAdmin } from '../components/promotions-admin.js';
import { showToast } from '../components/toast.js';
import { esc, isPlatformAdmin } from '../utils.js';

import { pluginFieldsHtml, readPluginFields } from '../lib/plugin-fields.js';
import { openAddUserModal } from '../components/workspace-members-add-user-modal.js';
import { openManageWorkspacesModal } from '../components/admin-user-workspaces-modal.js';
import { openCreateOrgModal } from '../components/admin-create-org-modal.js';
import { openTypeToConfirmModal } from '../components/type-to-confirm-modal.js';
// Reuse the members view's server-error -> friendly-string mapper (handles the
// 409 duplicate-email / weak-password / invalid-email cases) so we don't fork a
// second mapper.
import { mapMutationError } from './workspace-members.js';
import { mountInstanceStorage } from '../components/storage-settings.js';
import { reportHtml, mountOutbound, mountPublicToggle } from '../components/trust-report.js';
import { mountServerMove } from '../components/org-move.js';

async function loadTrustInstance() {
  const el = document.getElementById('trustInstance');
  if (!el) return;
  try { el.innerHTML = reportHtml(await api.get('/trust/report?scope=instance')); }
  catch (e) { el.innerHTML = `<p style="color:var(--text-muted)">${uiText((e.uiMessage || e.message))}</p>`; }
  mountOutbound(document.getElementById('trustOutboundInstance'), { instance: true });
  mountPublicToggle(document.getElementById('trustPublic'));
  // 3.0 export / import the whole server (components/org-move.js, docs/move-server.md).
  mountServerMove(document.getElementById('trustServerMove'));
}

const headers = () => ({ Authorization: `Bearer ${localStorage.getItem('token')}`, 'Content-Type': 'application/json' });
// A refused request must reject, not resolve.
//
// This helper used to end in `.then(r => r.json())`, so a 403/404/500 body resolved as an ordinary
// value and the surrounding try/catch was unreachable — every handler took the failure for success.
// Concretely: deleting a built-in layout template showed "Layout deleted" while the server had
// returned 403 and the template was still there, and a rejected platform-role change showed "Role
// updated" while the dropdown kept displaying a value the server refused (its revert lives only in
// the dead catch). The shared client in api.js has always thrown on !res.ok; these local copies did
// not. Same contract now, including the 401 session-expiry reload.
const API = (url, opts = {}) => fetch('/api' + url, { headers: headers(), ...opts }).then(async (r) => {
  if (r.status === 401) { localStorage.removeItem('token'); window.location.reload(); throw new Error(t("ui.labels.session_expired_b82819")); }
  if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(localizeServerError(e.error) || t("ui.admin.request_failed_value0_ad6dc0", {value0: r.status})); }
  return r.json();
});

// #14: the platform user-management dropdown manages users.role (the
// PLATFORM-level role) only - workspace/org roles are managed in the members
// views. Options are the current model; the legacy 'admin'/'superadmin' strings
// were normalized away. #13 adds 'platform_operator' (cross-org staff).
const PLATFORM_ROLE_OPTIONS = ['user', 'platform_operator', 'platform_admin'];

// Platform staff have cross-org access (no single workspace), so the Workspace
// column shows read-only "Platform (all)" for them. Note utils.isPlatformAdmin
// only covers admin/superadmin; operators are staff here too.
function isPlatformStaffRole(role) {
  return role === 'platform_admin' || role === 'superadmin' || role === 'platform_operator';
}

// Short summary of a user's workspace membership for the Users-table cell.
// Platform staff have cross-org access (not per-workspace membership) -> "Platform
// (all)". Otherwise: Unassigned (0), the workspace name (1), or "N workspaces".
function workspaceSummary(u) {
  if (isPlatformStaffRole(u.role)) return t('admin.workspace.platform_all');
  const count = u.workspace_count || 0;
  if (count === 0) return t('admin.workspace.unassigned');
  if (count === 1) return esc(u.workspace_name || '');
  return t('admin.workspace.multi', { n: count });
}

// Workspace cell: a summary + a "Manage" button that opens the full membership
// modal (add/remove workspaces, set per-workspace role). Manage is offered for
// everyone, including staff (you can grant them explicit memberships too).
function workspaceCell(u) {
  return `<td style="padding:8px">
    <div style="display:flex;align-items:center;gap:8px">
      <span style="color:var(--text-muted);font-size:12px;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${renderHTML(workspaceSummary(u))}</span>
      <button class="btn btn-secondary btn-sm" type="button" data-ws-manage="${esc(u.id)}">${renderHTML(t('admin.workspace.manage'))}</button>
    </div>
  </td>`;
}

export async function render(container, section = 'overview') {
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  if (!isPlatformAdmin(user)) {
    container.innerHTML = `<div class="empty-state"><h3>${renderHTML(t('admin.access_denied'))}</h3><p>${renderHTML(t('admin.access_denied_desc'))}</p></div>`;
    return;
  }

  // #/admin (bookmarks, old emails) lands on the overview. app.js routes #/platform/<section> here.
  const def = SECTIONS[section] ? SECTIONS[section] : SECTIONS.overview;
  const current = SECTIONS[section] ? section : 'overview';

  container.innerHTML = `
    <div class="page-header">
      <div><h1>${uiText(t(def.title))}</h1><div class="subtitle">${uiText(t(def.subtitle))}</div></div>
      <div style="display:flex;gap:8px">${renderHTML(def.actions ? def.actions() : '')}</div>
    </div>
    <nav class="platform-tabs" aria-label="${esc(t('platform.nav_label'))}" data-fil-i18n-aria-label="${binding('platform.nav_label', undefined)}">
      ${renderHTML(Object.entries(SECTIONS).map(([id, d]) => `<a href="#/platform/${id}" class="platform-tab${id === current ? ' active' : ''}"${id === current ? ' aria-current="page"' : ''}>${uiText(t(d.tab))}</a>`).join(''))}
    </nav>
    ${renderHTML(def.html())}
  `;
  def.load();
}

/*
 * The Platform area: one page per job instead of ten unrelated sections on one scroll.
 * Each entry renders ONLY its own markup and runs ONLY its own loaders, so opening Branding no
 * longer fires the diagnostics, plugin and user-table requests as well.
 * ⚠️ The section markup and loaders are the ones the single page used, moved, not rewritten:
 * every loader still finds its container by id, and returns quietly when that container is absent.
 */
const section = (title, desc, body) => `
    <div class="settings-section">
      <h3>${uiText(title)}</h3>
      ${renderHTML(desc ? `<p style="color:var(--text-muted);font-size:12px;margin-bottom:12px">${renderHTML(desc)}</p>` : '')}
      ${renderHTML(body)}
    </div>`;
const loading = () => `<p style="color:var(--text-muted)">${uiText(t('common.loading'))}</p>`;

const SECTIONS = {
  overview: {
    tab: 'platform.tab.overview', title: 'platform.overview.title', subtitle: 'platform.overview.subtitle',
    html: () => `<div id="platformOverview">${renderHTML(loading())}</div>`,
    load: () => loadOverview(),
  },
  users: {
    tab: 'platform.tab.users', title: 'platform.users.title', subtitle: 'platform.users.subtitle',
    actions: () => `<button class="btn btn-primary" id="adminAddUserBtn">${renderHTML(t('admin.add_user'))}</button>`,
    html: () => section(t('admin.all_users'), '', `
      <div class="platform-filters">
        <input type="search" class="input" id="userSearch" placeholder="${esc(t('platform.users.search'))}" data-fil-i18n-placeholder="${binding('platform.users.search', undefined)}" aria-label="${esc(t('platform.users.search'))}" data-fil-i18n-aria-label="${binding('platform.users.search', undefined)}">
        <select class="input" id="userRoleFilter" aria-label="${esc(t('platform.users.role_filter'))}" data-fil-i18n-aria-label="${binding('platform.users.role_filter', undefined)}">
          <option value="">${uiText(t('platform.users.role_all'))}</option>
          <option value="platform">${uiText(t('platform.users.role_platform'))}</option>
          <option value="user">${uiText(t('platform.users.role_user'))}</option>
        </select>
        <span class="platform-count" id="userCount"></span>
      </div>
      <div id="allUsersTable">${renderHTML(loading())}</div>`),
    load: () => { wireAddUser(); loadUsers(); },
  },
  orgs: {
    tab: 'platform.tab.orgs', title: 'platform.orgs.title', subtitle: 'platform.orgs.subtitle',
    actions: () => `<button class="btn btn-primary" id="adminCreateOrgBtn">${renderHTML(t('admin.create_org.button'))}</button>`,
    html: () => `
    <div class="settings-section" id="ssoOnlySection" style="display:none">
      <h3>${renderHTML(t('admin.sso_only.title'))}</h3>
      <p style="color:var(--text-muted);font-size:12px;margin-bottom:12px">${renderHTML(t('admin.sso_only.desc'))}</p>
      <div id="ssoOnlyRequests"><p style="color:var(--text-muted)">${uiText(t('common.loading'))}</p></div>
    </div>
${renderHTML(section(t('admin.orgs.title'), t('admin.orgs.desc'), `
      <div class="platform-filters">
        <input type="search" class="input" id="orgSearch" placeholder="${esc(t('platform.orgs.search'))}" data-fil-i18n-placeholder="${binding('platform.orgs.search', undefined)}" aria-label="${esc(t('platform.orgs.search'))}" data-fil-i18n-aria-label="${binding('platform.orgs.search', undefined)}">
        <span class="platform-count" id="orgCount"></span>
      </div>
      <div id="orgsTable">${renderHTML(loading())}</div>`))}`,
    load: () => { wireCreateOrg(); loadSsoOnlyRequests(); loadOrgs(); },
  },
  billing: {
    tab: 'platform.tab.billing', title: 'platform.billing.title', subtitle: 'platform.billing.subtitle',
    html: () => section(t('admin.plans'), '', `<div id="plansTable">${renderHTML(loading())}</div>`)
      + section(t('admin.promo.title'), t('admin.promo.desc'), `<div id="promotionsAdmin">${renderHTML(loading())}</div>`),
    load: () => { loadPlans(); mountPromotionsAdmin(document.getElementById('promotionsAdmin')); },
  },
  branding: {
    tab: 'platform.tab.branding', title: 'platform.branding.title', subtitle: 'platform.branding.subtitle',
    html: () => section(t('admin.branding.title'), t('admin.branding.desc'), `<div id="brandingForm">${renderHTML(loading())}</div>`),
    load: () => loadBranding(),
  },
  rollouts: {
    tab: 'platform.tab.rollouts', title: 'platform.rollouts.title', subtitle: 'platform.rollouts.subtitle',
    html: () => section(t('platform.rollouts.title'), t('platform.rollouts.desc'), `<div id="rolloutsBody">${renderHTML(loading())}</div>`),
    load: () => loadRollouts(),
  },
  system: {
    tab: 'platform.tab.system', title: 'platform.system.title', subtitle: 'platform.system.subtitle',
    html: () => `
      ${renderHTML(section(t('admin.system'), '', `<div id="systemInfo">${renderHTML(loading())}</div>`))}
      ${renderHTML(section(t("ui.admin.instance_storage_36aba2"), '', `<div id="instanceStorage">${renderHTML(loading())}</div>`))}
    <div class="settings-section">
      <h3>${renderHTML(t('admin.diag.title'))}</h3>
      <p style="color:var(--text-muted);font-size:12px;margin-bottom:12px">${renderHTML(t('admin.diag.desc'))}</p>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px">
        <button class="btn btn-secondary" id="diagRefreshBtn">${renderHTML(t('admin.diag.refresh'))}</button>
        <select id="diagProfileSecs" class="input" style="width:auto">
          <option value="30">30s</option><option value="60">60s</option><option value="15">15s</option>
        </select>
        <button class="btn btn-secondary" id="diagProfileBtn">${renderHTML(t('admin.diag.profile'))}</button>
        <button class="btn btn-secondary" id="diagDownloadBtn" style="display:none">${renderHTML(t('admin.diag.download'))}</button>
      </div>
      <div id="diagBody"><p style="color:var(--text-muted)">${uiText(t('common.loading'))}</p></div>
    </div>
      ${renderHTML(section(t('platform.system.status_endpoint'), '', `<div id="statusDebugForm">${renderHTML(loading())}</div>`))}
      ${renderHTML(section(t('platform.tvsafe.title'), t('platform.tvsafe.desc'), `<div id="tvSafeForm">${renderHTML(loading())}</div>`))}
      <div id="sharePresentersSection">${renderHTML(section(t('screen_share.admin.title'), t('screen_share.admin.desc'), `<div id="sharePresentersForm">${renderHTML(loading())}</div>`))}</div>
      <div id="stockKeysSection">${renderHTML(section(t('stock.admin.title'), t('stock.admin.desc'), `<div id="stockKeysForm">${renderHTML(loading())}</div>`))}</div>
      ${renderHTML(section(t('platform.system.player_debug'), t('platform.system.player_debug_desc'), `<a class="btn btn-secondary" href="#/admin/player-debug">${uiText(t('platform.system.player_debug_open'))} →</a>`))}`,
    load: () => { loadSystem(); mountInstanceStorage(document.getElementById('instanceStorage')); loadDiagnostics(); wireDiagnostics(); loadStatusDebug(); loadTvSafe(); loadSharePresenters(); loadStockKeys(); },
  },
  // 3.0 "Your data, provably" (components/trust-report.js, docs/trust.md): the instance's data
  // handling report, every external host contacted, and the optional public /trust page.
  privacy: {
    tab: 'platform.tab.privacy', title: 'trust.platform.title', subtitle: 'trust.platform.subtitle',
    html: () => `<div id="trustInstance">${renderHTML(loading())}</div>
      ${renderHTML(section(t('trust.out.title'), t('trust.out.desc_instance'), `<div id="trustOutboundInstance"></div>`))}
      ${renderHTML(section(t('imp.server.title'), '', `<div id="trustServerMove"></div>`))}
      ${renderHTML(section(t('trust.pub.title_admin'), '', `<div id="trustPublic"></div>`))}`,
    load: () => loadTrustInstance(),
  },
  cleanup: {
    tab: 'platform.tab.cleanup', title: 'platform.cleanup.title', subtitle: 'platform.cleanup.subtitle',
    html: () => `<div id="cleanupPane">${renderHTML(loading())}</div>`,
    load: () => mountCleanup(document.getElementById('cleanupPane')),
  },
  plugins: {
    tab: 'platform.tab.plugins', title: 'platform.plugins.title', subtitle: 'platform.plugins.subtitle',
    html: () => `
    <div class="settings-section" id="pluginsSection" style="display:none">
      <h3>${renderHTML(t('admin.plugins.title'))}</h3>
      <p style="color:var(--text-muted);font-size:12px;margin-bottom:12px">${renderHTML(t('admin.plugins.desc'))}</p>
      <form id="pluginUploadForm" style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-bottom:16px">
        <input type="file" id="pluginZipInput" accept=".zip,application/zip" />
        <button type="submit" class="btn btn-primary btn-sm">${renderHTML(t('admin.plugins.upload_cta'))}</button>
        <span style="color:var(--text-muted);font-size:12px">${renderHTML(t('admin.plugins.upload_hint'))}</span>
      </form>
      <h4 style="margin:16px 0 8px;font-size:13px">${renderHTML(t('admin.plugins.pending'))}</h4>
      <div id="pluginSubmissions"><p style="color:var(--text-muted)">${uiText(t('common.loading'))}</p></div>
      <h4 style="margin:16px 0 8px;font-size:13px">${renderHTML(t('admin.plugins.title'))}</h4>
      <div id="pluginsTable"><p style="color:var(--text-muted)">${uiText(t('common.loading'))}</p></div>
      <h4 style="margin:16px 0 8px;font-size:13px">${renderHTML(t('admin.plugins.allowlist_title'))}</h4>
      <div id="pluginAllowlist"><p style="color:var(--text-muted)">${uiText(t('common.loading'))}</p></div>
    </div>
      <p class="platform-empty" id="pluginsOff" hidden>${uiText(t('platform.plugins.off'))}</p>`,
    load: () => loadPlugins(),
  },
};

// Add User (#10): platform admin provisions a user into ANY workspace. The modal opens in picker
// mode (no fixed workspace) so the admin chooses the target org/workspace. The endpoint
// additionally enforces canAdminWorkspace (platform_admin passes everywhere).
function wireAddUser() {
  document.getElementById('adminAddUserBtn')?.addEventListener('click', () => {
    openAddUserModal(null, {
      onSuccess: (result) => {
        showToast(t('members.success.user_created', { email: result.email }), 'success');
        loadUsers();
      },
      mapError: mapMutationError,
    });
  });
}

// Create Organization (#35): platform admin provisions a new customer org + its first workspace
// (owned by the admin). The modal reloads on success so the new org shows up in the switcher.
function wireCreateOrg() {
  document.getElementById('adminCreateOrgBtn')?.addEventListener('click', () => {
    openCreateOrgModal({
      onSuccess: (result) => showToast(t('admin.create_org.success', { name: result.name }), 'success'),
    });
  });
}

/*
 * Overview: the numbers an operator checks first, and a list of what needs them — the SSO-only
 * removal requests (a tenant is locked out while one waits), plugin submissions, an available
 * update. Each item links to the page that deals with it. Server: GET /api/admin/overview.
 */
function formatBytes(n) {
  const b = Number(n) || 0;
  if (b < 1024 * 1024) return `${Math.round(b / 1024)} KB`;
  if (b < 1024 ** 3) return displayQuantity((b / 1024 ** 2),'MB',1);
  if (b < 1024 ** 4) return displayQuantity((b / 1024 ** 3),'GB',b < 100 * 1024 ** 3 ? 2 : 0);
  return displayQuantity((b / 1024 ** 4),'TB',2);
}

/*
 * One expanded "Needs your attention" item: what exactly is wrong, and a link to where it is fixed.
 * Every value is escaped: organization names, emails and screen names are customer-chosen.
 */
async function loadAttentionDetail(d) {
  const body = d.querySelector('.att-body');
  const item = d.dataset.item;
  const go = (label) => `<a class="att-go" href="${body.dataset.href}">${uiText(label)} →</a>`;
  const ago = (sec) => (sec ? relAgo(sec) : t('platform.att.never'));
  const table = (heads, rows) => rows.length ? `<div class="table-wrap"><table class="att-table"><thead><tr>${renderHTML(heads.map((h) => `<th>${uiText(h)}</th>`).join(''))}</tr></thead>
    <tbody>${renderHTML(rows.map((r) => `<tr>${renderHTML(r.map((c) => `<td>${renderHTML(c)}</td>`).join(''))}</tr>`).join(''))}</tbody></table></div>` : `<p class="platform-empty">${uiText(t('platform.att.nothing_now'))}</p>`;
  let r = {};
  if (item !== 'host') try { r = await api.adminAttention(item); } catch (err) { body.innerHTML = `<p style="color:var(--danger)">${uiText((err.uiMessage || err.message))}</p>`; return; }
  switch (item) {
    case 'sso':
      body.innerHTML = `<p class="att-why">${uiText(t('platform.att.sso_why'))}</p>` +
        table([t('platform.att.col_org'), t('platform.att.col_requested_by'), t('platform.att.col_reason'), t('platform.att.col_waiting')],
          r.rows.map((x) => [esc(x.organization || '—'), esc(x.requested_by || '—'), esc(x.reason || '—'), esc(ago(x.created_at))])) + go(t('platform.att.go_orgs'));
      break;
    case 'plugins':
      body.innerHTML = `<p class="att-why">${uiText(t('platform.att.plugins_why'))}</p>` +
        table([t('platform.att.col_plugin'), t('platform.att.col_version'), t('platform.att.col_submitted_by'), t('platform.att.col_waiting')],
          r.rows.map((x) => [esc(x.name || x.plugin_id), esc(x.version || '—'), esc(x.submitted_by || '—'), esc(ago(x.submitted_at))])) + go(t('platform.att.go_plugins'));
      break;
    case 'host':
      body.innerHTML = `<p class="att-why">${uiText(t('platform.host.att_why'))}</p>`;
      break;
    case 'update':
      body.innerHTML = `<p class="att-why">${uiText(t('platform.att.update_why', { current: r.current, latest: r.latest || '?' }))}</p>` + go(t('platform.att.go_system'));
      break;
    case 'orphans':
      body.innerHTML = `<p class="att-why">${uiText(t('platform.att.orphans_why'))}</p>` +
        table([t('platform.att.col_missing_plan'), t('platform.att.col_accounts'), t('platform.att.col_examples')],
          r.rows.map((x) => [`<code>${uiText(x.plan_id)}</code>`, esc(String(x.accounts)), esc(x.emails)])) + go(t('platform.att.go_billing'));
      break;
    case 'offline':
      body.innerHTML = `<p class="att-why">${uiText(t('platform.att.offline_why'))}</p>` +
        table([t('platform.att.col_screen'), t('platform.att.col_org'), t('platform.att.col_workspace'), t('platform.att.col_last_seen'), t('platform.att.col_app')],
          r.rows.map((x) => [esc(x.screen), esc(x.organization), esc(x.workspace), esc(ago(x.last_heartbeat)), esc(x.app_version || '—')])) + go(t('platform.att.go_orgs'));
      break;
    case 'stale': {
      const c = r.counts || {};
      body.innerHTML = `<p class="att-why">${uiText(t('platform.att.stale_why', { a: c.not_warned || 0, b: c.notice || 0, c: c.ready || 0 }))}</p>` +
        table([t('platform.att.col_account'), t('platform.att.col_last_activity'), t('platform.att.col_notice'), t('platform.att.col_uploads')],
          r.rows.map((x) => [esc(x.email), esc(ago(x.last_activity)), esc(t(NOTICE_KEYS[x.notice] || NOTICE_KEYS.not_warned)), esc(x.content_bytes ? formatBytes(x.content_bytes) : '—')])) + go(t('platform.att.go_cleanup'));
      break;
    }
    default:
      body.innerHTML = go(t('platform.att.open'));
  }
}

const NOTICE_KEYS = {
  not_warned: 'platform.att.notice_not_warned',
  notice: 'platform.att.notice_notice',
  ready: 'platform.att.notice_ready',
};

function relAgo(sec) {
  const d = Math.max(0, Math.floor(Date.now() / 1000) - sec);
  if (d < 3600) return t('platform.att.ago_min', { n: Math.max(1, Math.round(d / 60)) });
  if (d < 86400) return t('platform.att.ago_h', { n: Math.round(d / 3600) });
  return t('platform.att.ago_d', { n: Math.round(d / 86400) });
}

/*
 * 3.0: this server's machine — disk, CPU, memory (GET /api/admin/host, lib/host-stats.js). Refreshed
 * every 10 s while the overview is on screen; the timer stops itself once the section is gone.
 */
let hostTimer = null;
function pctBar(pct, warnAt = 85) {
  const p = pct == null ? 0 : Math.max(0, Math.min(100, pct));
  return `<span class="host-bar"><span class="${pct != null && pct >= warnAt ? 'warn' : ''}" style="width:${p}%"></span></span>`;
}
function durationShort(sec) {
  if (!(sec > 0)) return '—';
  const d = Math.floor(sec / 86400), h = Math.floor((sec % 86400) / 3600), m = Math.floor((sec % 3600) / 60);
  return d ? t('platform.host.uptime_d', { d, h }) : h ? t('platform.host.uptime_h', { h, m }) : t('platform.host.uptime_m', { m });
}
// 3.0 TV-safe video copies (server/lib/video-variants.js): the encode queue beside the CPU it uses.
// Shown once the server has had any copy to make (or when the feature is switched off).
function tvCard(v) {
  if (!v || (!v.queued && !(v.running || []).length && !v.failed && !v.ready && v.enabled)) return '';
  const now = (v.running || [])[0];
  const wait = { cpu: 'platform.host.tv_wait_cpu', window: 'platform.host.tv_wait_window', no_ffmpeg: 'platform.host.tv_wait_ffmpeg', disabled: 'platform.host.tv_wait_disabled' }[v.waiting];
  const main = now ? t('platform.host.tv_now', { name: now.filename || now.content_id, secs: now.seconds })
    : wait ? t(wait) : v.queued ? t('platform.host.tv_queue', { n: v.queued }) : t('platform.host.tv_idle');
  const sub = [now && v.queued ? t('platform.host.tv_queue', { n: v.queued }) : '', v.failed ? t('platform.host.tv_failed', { n: v.failed }) : '', v.encoder || '']
    .filter(Boolean).join(' · ');
  return `<div class="host-card">
        <span class="host-k">${uiText(t('platform.host.tv'))}</span>
        <span class="host-v" style="font-size:14px">${uiText(main)}</span>
        <span class="host-s">${uiText(sub)}</span>
      </div>`;
}
async function loadHost() {
  clearTimeout(hostTimer);
  const el = document.getElementById('platformHost');
  if (!el) return;
  let h;
  try { h = await api.adminHost(); } catch (err) { el.innerHTML = ''; return; }
  if (!document.contains(el)) return;
  const disk = (d) => {
    const used = d.total - d.free;
    const pct = Math.round((used / d.total) * 1000) / 10;
    return `<div class="host-card" title="${esc(d.path)}"${attributeBinding("title", d.path)}>
      <span class="host-k">${uiText(t(d.role === 'uploads' ? 'platform.host.disk_uploads' : 'platform.host.disk'))}</span>
      <span class="host-v">${uiText(t('platform.host.pct_used', { n: Math.round(pct) }))}</span>
      ${renderHTML(pctBar(pct, 90))}
      <span class="host-s">${uiText(t('platform.host.disk_free', { free: formatBytes(d.free), total: formatBytes(d.total) }))}</span>
    </div>`;
  };
  const cpu = h.cpu || {};
  const mem = h.memory || {};
  const memUsed = mem.total && mem.available != null ? mem.total - mem.available : null;
  const memPct = memUsed != null ? Math.round((memUsed / mem.total) * 1000) / 10 : null;
  const warn = (h.warnings || []).map((w) => w.kind === 'disk_low'
    ? t('platform.host.warn_disk', { free: formatBytes(w.free) })
    : t('platform.host.warn_mem', { free: formatBytes(w.available) }));
  el.innerHTML = `
    <h3 class="platform-subhead">${uiText(t('platform.host.title'))} <span class="host-name">${uiText(h.hostname || '')}</span></h3>
    ${renderHTML(warn.length ? `<p class="host-warn">⚠️ ${renderHTML(warn.map(esc).join(' '))}</p>` : '')}
    <div class="host-grid">
      ${renderHTML((h.disks || []).map(disk).join('') || `<div class="host-card"><span class="host-k">${uiText(t('platform.host.disk'))}</span><span class="host-v">—</span></div>`)}
      <div class="host-card">
        <span class="host-k">${uiText(t('platform.host.cpu'))}</span>
        <span class="host-v">${renderHTML(cpu.pct == null ? '—' : t('platform.host.pct_busy', { n: Math.round(cpu.pct) }))}</span>
        ${renderHTML(pctBar(cpu.pct))}
        <span class="host-s">${uiText(tn('platform.host.cores', cpu.cores || 0))}${renderHTML(cpu.load ? ` · ${esc(t('platform.host.load', { l: cpu.load.join(' / ') }))}` : '')}</span>
      </div>
      ${renderHTML(tvCard(h.video_variants))}
      <div class="host-card">
        <span class="host-k">${uiText(t('platform.host.memory'))}</span>
        <span class="host-v">${renderHTML(memPct == null ? '—' : t('platform.host.pct_used', { n: Math.round(memPct) }))}</span>
        ${renderHTML(pctBar(memPct, 90))}
        <span class="host-s">${renderHTML(memUsed == null ? '' : t('platform.host.mem_used', { used: formatBytes(memUsed), total: formatBytes(mem.total) }))}${renderHTML(mem.process_rss ? ` · ${esc(t('platform.host.mem_app', { n: formatBytes(mem.process_rss) }))}` : '')}</span>
      </div>
    </div>
    <p class="host-foot">${uiText(t('platform.host.foot', { db: h.db_bytes ? formatBytes(h.db_bytes) : '—', up: durationShort(h.uptime && h.uptime.process_sec), host: durationShort(h.uptime && h.uptime.host_sec) }))}</p>`;
  hostTimer = setTimeout(loadHost, 10000);
}

async function loadOverview() {
  const el = document.getElementById('platformOverview');
  if (!el) return;
  try {
    const o = await api.adminOverview();
    const card = (href, value, label, sub) => `
      <a class="platform-stat" href="${href}">
        <span class="platform-stat-n">${uiText(String(value))}</span>
        <span class="platform-stat-l">${uiText(label)}</span>
        ${renderHTML(sub ? `<span class="platform-stat-s">${uiText(sub)}</span>` : '')}
      </a>`;
    const attention = [];
    if (o.sso_only_requests > 0) attention.push(['sso', '#/platform/orgs', tn('platform.overview.att_sso', o.sso_only_requests), 'warn']);
    if (o.plugin_submissions > 0) attention.push(['plugins', '#/platform/plugins', tn('platform.overview.att_plugins', o.plugin_submissions), 'info']);
    if (o.update_available) attention.push(['update', '#/platform/system', t('platform.overview.att_update', { v: o.latest_version }), 'info']);
    for (const w of o.host_warnings || []) {
      attention.push(['host', '#/platform/overview', w.kind === 'disk_low'
        ? t('platform.host.warn_disk', { free: formatBytes(w.free) })
        : t('platform.host.warn_mem', { free: formatBytes(w.available) }), 'warn']);
    }
    if (o.orphaned_plan_users > 0) attention.push(['orphans', '#/platform/billing', tn('platform.overview.att_orphans', o.orphaned_plan_users), 'warn']);
    if (o.stale_accounts_180d > 0) attention.push(['stale', '#/platform/cleanup', tn('platform.overview.att_stale', o.stale_accounts_180d), 'info']);
    if (o.screens_offline_24h > 0) attention.push(['offline', '#/platform/orgs', tn('platform.overview.att_offline', o.screens_offline_24h), 'info']);
    const mini = (href, value, label, sub) => `
      <a class="platform-mini" href="${href}">
        <span class="platform-mini-n">${uiText(String(value))}</span>
        <span class="platform-mini-l">${uiText(label)}</span>
        ${renderHTML(sub ? `<span class="platform-mini-s">${uiText(sub)}</span>` : '')}
      </a>`;
    el.innerHTML = `
      <div class="platform-stats">
        ${renderHTML(card('#/platform/users', o.users, t('platform.overview.users'), tn('platform.overview.users_sub', o.platform_staff)))}
        ${renderHTML(card('#/platform/orgs', o.organizations, t('platform.overview.orgs'), tn('platform.overview.workspaces', o.workspaces)))}
        ${renderHTML(card('#/platform/orgs', o.devices, t('platform.overview.devices'), t('platform.overview.online', { n: o.devices_online })))}
        ${renderHTML(card('#/platform/billing', o.paying_accounts, t('platform.overview.paying'), tn('platform.overview.trialing', o.trialing)))}
      </div>
      <div id="platformHost"></div>
      <h3 class="platform-subhead">${uiText(t('platform.overview.health'))}</h3>
      <div class="platform-minis">
        ${renderHTML(mini('#/platform/users', o.new_users_7d, t('platform.overview.new_7d')))}
        ${renderHTML(mini('#/platform/cleanup', o.inactive_30d, t('platform.overview.inactive_30d'), tn('platform.overview.never_signed_in', o.never_signed_in)))}
        ${renderHTML(mini('#/platform/cleanup', o.accounts_no_screens, t('platform.overview.no_screens'), tn('platform.overview.orgs_no_screens', o.orgs_no_screens)))}
        ${renderHTML(mini('#/platform/orgs', o.screens_offline_24h, t('platform.overview.offline_24h')))}
        ${renderHTML(mini('#/platform/billing', o.trials_ending_7d, t('platform.overview.trials_ending')))}
        ${renderHTML(mini('#/platform/users', o.unverified_emails, t('platform.overview.unverified')))}
        ${renderHTML(mini('#/platform/system', formatBytes(o.storage_bytes), t('platform.overview.storage')))}
        ${renderHTML(mini('#/platform/cleanup', o.stale_accounts_180d, t('platform.overview.stale'), t('platform.overview.stale_sub')))}
      </div>
      <div id="platformFunnel"></div>
      <div class="settings-section">
        <h3>${uiText(t('platform.overview.attention'))}</h3>
        ${renderHTML(attention.length ? `<div class="platform-attention">${renderHTML(attention.map(([item, href, text, kind]) => `
          <details class="att att-${kind}" data-item="${item}">
            <summary><span>${uiText(text)}</span><span class="att-chev" aria-hidden="true"></span></summary>
            <div class="att-body" data-href="${href}"><p class="platform-empty">${uiText(t('common.loading'))}</p></div>
          </details>`).join(''))}</div>`
          : `<p class="platform-empty">${uiText(t('platform.overview.all_clear'))}</p>`)}
      </div>
      <p class="platform-version">${uiText(t('platform.overview.version', { v: o.version }))}</p>`;
    loadFunnel();
    loadHost();
    // Details load the first time an item is opened (GET /admin/overview/attention/:item).
    el.querySelectorAll('details.att').forEach((d) => {
      d.addEventListener('toggle', () => { if (d.open && !d.dataset.loaded) { d.dataset.loaded = '1'; loadAttentionDetail(d); } });
    });
  } catch (err) {
    el.innerHTML = `<p style="color:var(--danger)">${uiText((err.uiMessage || err.message))}</p>`;
  }
}

/*
 * 3.0: the trial-to-paid funnel (GET /api/subscription/funnel, lib/conversion-events.js). Hidden on
 * a self-hosted instance, which records nothing. Each step is the share of the last 30 days' signups
 * who reached it, so a change to onboarding or pricing shows up as a moved number, not an anecdote.
 */
async function loadFunnel() {
  const host = document.getElementById('platformFunnel');
  if (!host) return;
  let f;
  try { f = await api.adminConversionFunnel(30); } catch { return; }
  if (!f || !f.enabled || !Array.isArray(f.steps)) return;
  const base = (f.steps[0] && f.steps[0].accounts) || 0;
  const rows = f.steps.map((st) => {
    const pct = base ? Math.round((st.accounts / base) * 100) : 0;
    return `<div class="funnel-row">
        <span class="funnel-label">${uiText(t('platform.funnel.step.' + st.event))}</span>
        <span class="funnel-bar"><span style="width:${pct}%"></span></span>
        <span class="funnel-n">${uiText(String(st.accounts))}${renderHTML(base ? ` · ${pct}%` : '')}</span>
      </div>`;
  }).join('');
  const hits = (f.limit_hits || []).map((h) => `${esc(String(h.code || '?'))}: ${esc(String(h.n))}`).join(' · ');
  host.innerHTML = `<div class="settings-section">
      <h3>${uiText(t('platform.funnel.title'))}</h3>
      <p class="platform-empty" style="margin-bottom:10px">${uiText(t('platform.funnel.sub', { days: f.days }))}</p>
      <div class="funnel">${renderHTML(rows)}</div>
      ${renderHTML(hits ? `<p class="platform-empty" style="margin-top:8px">${uiText(t('platform.funnel.limit_hits'))} ${renderHTML(hits)}</p>` : '')}
    </div>`;
}

// #36: list organizations with owner + resource counts; platform admin can
// cascade-delete an org or an individual workspace (type-the-name confirm).
/*
 * Pending "stop requiring single sign-on" requests.
 *
 * The notification email tells the operator to review this under Admin, and for a while it did not
 * exist — the only way to approve was curl, while the customer sat locked out. The section hides
 * itself when there is nothing pending so it is never noise.
 */
async function loadSsoOnlyRequests() {
  const section = document.getElementById('ssoOnlySection');
  const host = document.getElementById('ssoOnlyRequests');
  if (!section || !host) return;
  // NB: `api` is a map of named methods, not a generic client — there is no api.get(), and calling
  // one silently hid this whole section behind the catch below.
  const authed = (path, init = {}) => fetch(`/api${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token')}`, ...(init.headers || {}) },
  });

  let requests = [];
  try {
    const res = await authed('/organizations/sso-only/removal-requests');
    if (!res.ok) throw new Error(String(res.status));
    requests = (await res.json()).requests || [];
  } catch {
    section.style.display = 'none';
    return;
  }
  // Clear as well as hide: leaving the last decided request in the tree kept its live
  // Approve/Reject listeners attached to a request that no longer exists.
  if (!requests.length) { host.innerHTML = ''; section.style.display = 'none'; return; }
  section.style.display = '';

  host.innerHTML = requests.map((r) => `
    <div style="border:1px solid var(--border);border-radius:var(--radius);padding:12px;margin-bottom:8px">
      <div><strong>${uiText(r.organization_name || r.organization_id)}</strong></div>
      <div style="font-size:12px;color:var(--text-muted);margin-top:2px">
        ${uiText(t('admin.sso_only.requested_by', { who: r.requested_by_email || 'unknown' }))}
      </div>
      ${renderHTML(r.reason ? `<div style="font-size:12px;margin-top:6px">${uiText(r.reason)}</div>` : '')}
      <div style="font-size:12px;color:var(--warning,#b45309);margin-top:8px">${uiText(t('admin.sso_only.effect'))}</div>
      <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:10px">
        <button class="btn btn-danger btn-sm" data-sso-approve="${esc(r.id)}">${uiText(t('admin.sso_only.approve'))}</button>
        <button class="btn btn-secondary btn-sm" data-sso-reject="${esc(r.id)}">${uiText(t('admin.sso_only.reject'))}</button>
      </div>
    </div>`).join('');

  const decide = async (id, decision) => {
    try {
      const res = await authed(`/organizations/sso-only/removal-requests/${id}/${decision}`, { method: 'POST', body: '{}' });
      if (!res.ok) throw new Error((localizeServerError((await res.json().catch(() => ({}))).error)) || String(res.status));
      showToast(t(decision === 'approve' ? 'admin.sso_only.approved' : 'admin.sso_only.rejected'), 'success');
      await loadSsoOnlyRequests();
    } catch (e) {
      showToast((e && (e.uiMessage || e.message)) || t('admin.sso_only.failed'), 'error');
    }
  };
  // Approving RE-OPENS password sign-in for a whole organization, so it is confirmed; rejecting
  // only leaves the safe state in place and is not.
  host.querySelectorAll('[data-sso-approve]').forEach((b) => b.addEventListener('click', () => {
    if (window.confirm(t('admin.sso_only.confirm'))) decide(b.dataset.ssoApprove, 'approve');
  }));
  host.querySelectorAll('[data-sso-reject]').forEach((b) => b.addEventListener('click', () => decide(b.dataset.ssoReject, 'reject')));
}

// Search the organization cards by org name, owner name/email or workspace name.
function wireOrgFilter(el) {
  const search = document.getElementById('orgSearch');
  const count = document.getElementById('orgCount');
  if (!search) return;
  const cards = [...el.querySelectorAll('.org-card[data-filter-text]')];
  const apply = () => {
    const q = search.value.trim().toLowerCase();
    let shown = 0;
    for (const c of cards) { const ok = !q || c.dataset.filterText.includes(q); c.hidden = !ok; if (ok) shown++; }
    if (count) bindText(count, 'platform.orgs.showing', { n: shown, total: cards.length });
  };
  search.oninput = apply;
  apply();
}

async function loadOrgs() {
  const el = document.getElementById('orgsTable');
  if (!el) return;
  let orgs;
  try {
    orgs = await api.adminListOrgs();
  } catch (err) {
    el.innerHTML = `<p style="color:var(--danger)">${uiText((err.uiMessage || err.message) || t("ui.admin.failed_to_load_organizations_924642"))}</p>`;
    return;
  }
  // #talk: the per-org Talk controls are only meaningful when the TALK_ENABLED master switch is on.
  // (The per-org flag gates on top of it, so with the master off the toggle would be a no-op.)
  let talkMaster = false;
  try { const s = await api.getServerStatus(); talkMaster = !!(s && s.features && s.features.talk); } catch (_) {}
  if (!orgs.length) {
    el.innerHTML = `<p style="color:var(--text-muted)">${renderHTML(t('admin.orgs.empty'))}</p>`;
    return;
  }
  el.innerHTML = orgs.map(o => {
    const wsRows = (o.workspaces || []).map(w => `
      <div style="display:flex;align-items:center;justify-content:space-between;padding:6px 10px;border-top:1px solid var(--border)">
        <div style="font-size:13px">${uiText(w.name)}
          <span style="color:var(--text-muted);font-size:11px">· ${renderHTML(w.device_count)} ${renderHTML(t('admin.orgs.devices'))} · ${renderHTML(w.member_count)} ${renderHTML(t('admin.orgs.members'))}</span>
        </div>
        <button class="btn btn-danger btn-sm" data-del-ws="${esc(w.id)}" data-ws-name="${esc(w.name)}">${renderHTML(t('admin.orgs.delete_ws'))}</button>
      </div>`).join('');
    return `
      <div class="org-card" style="border:1px solid var(--border);border-radius:var(--radius);margin-bottom:10px" data-filter-text="${esc([o.name, o.owner_email, o.owner_name, ...(o.workspaces || []).map((w) => w.name)].filter(Boolean).join(' ').toLowerCase())}">
        <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 12px;background:var(--bg-secondary)">
          <div>
            <div style="font-weight:600">${uiText(o.name)}</div>
            <div style="color:var(--text-muted);font-size:11px">
              ${renderHTML(t('admin.orgs.owner'))}: ${uiText(o.owner_email || '—')} ·
              ${renderHTML(o.workspace_count)} ${renderHTML(t('admin.orgs.workspaces'))} · ${renderHTML(o.device_count)} ${renderHTML(t('admin.orgs.devices'))} · ${renderHTML(o.member_count)} ${renderHTML(t('admin.orgs.members'))}
            </div>
          </div>
          <button class="btn btn-danger btn-sm" data-del-org="${esc(o.id)}" data-org-name="${esc(o.name)}">${renderHTML(t('admin.orgs.delete_org'))}</button>
        </div>
        ${renderHTML(talkMaster ? `
        <div style="padding:10px 12px;border-top:1px solid var(--border);display:flex;flex-direction:column;gap:8px">
          <label style="display:flex;align-items:center;gap:8px;font-size:13px">
            <input type="checkbox" data-org-talk="${esc(o.id)}"${o.talk_enabled ? ' checked' : ''}>
            ${renderHTML(t('admin.orgs.talk_enable'))}
          </label>
          <label style="font-size:12px;color:var(--text-muted)">${renderHTML(t('admin.orgs.talk_ice_label'))}</label>
          <textarea data-org-ice="${esc(o.id)}" rows="2" ${translatedAttribute("placeholder", "ui.admin.placeholder_urls_turn_turn_example_com_3478_username_29459a")}
            style="font-family:monospace;font-size:12px;width:100%;box-sizing:border-box">${uiText(o.ice_servers || '')}</textarea>
          <div><button class="btn btn-secondary btn-sm" data-org-talk-save="${esc(o.id)}">${renderHTML(t('admin.orgs.talk_save'))}</button></div>
        </div>` : '')}
        ${renderHTML(wsRows)}
      </div>`;
  }).join('');
  wireOrgFilter(el);

  if (talkMaster) el.querySelectorAll('[data-org-talk-save]').forEach(btn => btn.addEventListener('click', async () => {
    const id = btn.dataset.orgTalkSave;
    const enabled = el.querySelector(`[data-org-talk="${id}"]`)?.checked ? 1 : 0;
    const ice = (el.querySelector(`[data-org-ice="${id}"]`)?.value || '').trim();
    try {
      await api.adminSetOrgTalk(id, { talk_enabled: enabled, ice_servers: ice || null });
      showToast(t('admin.orgs.talk_saved'), 'success');
    } catch (e) { showToast((e && (e.uiMessage || e.message)) || t('admin.orgs.talk_save_failed'), 'error'); }
  }));

  el.querySelectorAll('[data-del-org]').forEach(btn => btn.addEventListener('click', () => {
    const id = btn.dataset.delOrg, name = btn.dataset.orgName;
    openTypeToConfirmModal({
      title: t('admin.orgs.delete_org_title'),
      body: t('admin.orgs.delete_org_body', { name: esc(name) }),
      expected: name,
      confirmLabel: t('admin.orgs.delete_org'),
      onConfirm: async () => {
        await api.adminDeleteOrg(id);
        showToast(t('admin.orgs.org_deleted', { name }), 'success');
        loadOrgs(); loadUsers();
      },
    });
  }));
  el.querySelectorAll('[data-del-ws]').forEach(btn => btn.addEventListener('click', () => {
    const id = btn.dataset.delWs, name = btn.dataset.wsName;
    openTypeToConfirmModal({
      title: t('admin.orgs.delete_ws_title'),
      body: t('admin.orgs.delete_ws_body', { name: esc(name) }),
      expected: name,
      confirmLabel: t('admin.orgs.delete_ws'),
      onConfirm: async () => {
        await api.adminDeleteWorkspace(id);
        showToast(t('admin.orgs.ws_deleted', { name }), 'success');
        loadOrgs();
      },
    });
  }));
}

// #15: instance-level default branding form (platform default; every workspace
// without its own white-label inherits this, as does the login page).
async function loadBranding() {
  const el = document.getElementById('brandingForm');
  if (!el) return;
  let b = {};
  try { b = await api.adminGetBranding(); } catch (e) { el.innerHTML = `<p style="color:var(--danger)">${uiText((e.uiMessage || e.message) || t("ui.admin.failed_to_load_af14db"))}</p>`; return; }
  const v = (x) => esc(x == null ? '' : x);
  el.innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;max-width:640px">
      <div class="form-group" style="grid-column:1/-1"><label>${renderHTML(t('admin.branding.brand_name'))}</label><input type="text" id="brBrandName" class="input" placeholder="ScreenTinker" value="${v(b.brand_name)}"></div>
      <div class="form-group"><label>${renderHTML(t('admin.branding.primary_color'))}</label><input type="text" id="brPrimary" class="input" placeholder="#3B82F6" value="${v(b.primary_color)}"></div>
      <div class="form-group"><label>${renderHTML(t('admin.branding.bg_color'))}</label><input type="text" id="brBg" class="input" placeholder="#111827" value="${v(b.bg_color)}"></div>
      <div class="form-group" style="grid-column:1/-1"><label>${renderHTML(t('admin.branding.logo_url'))}</label><input type="text" id="brLogo" class="input" placeholder="https://…/logo.png" value="${v(b.logo_url)}"></div>
      <div class="form-group" style="grid-column:1/-1"><label>${renderHTML(t('admin.branding.favicon_url'))}</label><input type="text" id="brFavicon" class="input" placeholder="https://…/favicon.ico" value="${v(b.favicon_url)}"></div>
      <div class="form-group" style="grid-column:1/-1"><label>${renderHTML(t('admin.branding.custom_css'))}</label><textarea id="brCss" class="input" rows="3" placeholder="/* optional */">${renderHTML(v(b.custom_css))}</textarea></div>
      <label style="grid-column:1/-1;display:flex;align-items:center;gap:8px;font-size:13px;cursor:pointer">
        <input type="checkbox" id="brHide" ${b.hide_branding ? 'checked' : ''}> ${renderHTML(t('admin.branding.hide_branding'))}
      </label>
    </div>
    <button class="btn btn-primary btn-sm" id="brSave" style="margin-top:12px">${renderHTML(t('admin.branding.save'))}</button>
  `;
  document.getElementById('brSave').onclick = async () => {
    try {
      await api.adminSetBranding({
        brand_name: document.getElementById('brBrandName').value.trim() || 'ScreenTinker',
        primary_color: document.getElementById('brPrimary').value.trim() || null,
        bg_color: document.getElementById('brBg').value.trim() || null,
        logo_url: document.getElementById('brLogo').value.trim() || null,
        favicon_url: document.getElementById('brFavicon').value.trim() || null,
        custom_css: document.getElementById('brCss').value.trim() || null,
        hide_branding: document.getElementById('brHide').checked,
      });
      showToast(t('admin.branding.saved'), 'success');
    } catch (err) { showToast(err.uiMessage || err.message, 'error'); }
  };
}

/*
 * Search + role filter over the rendered users table (Platform → Users). Client-side: the list is
 * already fully loaded, and filtering must not re-fire the plan and role selects' requests.
 */
function wireUserFilters(el) {
  const search = document.getElementById('userSearch');
  const role = document.getElementById('userRoleFilter');
  const count = document.getElementById('userCount');
  if (!search || !role) return;
  const rows = [...el.querySelectorAll('tr[data-filter-text]')];
  const apply = () => {
    const q = search.value.trim().toLowerCase();
    let shown = 0;
    for (const r of rows) {
      const ok = (!q || r.dataset.filterText.includes(q)) && (!role.value || r.dataset.filterKind === role.value);
      r.hidden = !ok;
      if (ok) shown++;
    }
    if (count) bindText(count, 'platform.users.showing', { n: shown, total: rows.length });
  };
  search.oninput = apply;
  role.onchange = apply;
  apply();
}

async function loadUsers() {
  const el = document.getElementById('allUsersTable');
  try {
    const [users, plans] = await Promise.all([
      API('/auth/users'),
      fetch('/api/subscription/plans').then(r => r.json()),
    ]);
    const currentUser = JSON.parse(localStorage.getItem('user') || '{}');

    el.innerHTML = `
      <div class="table-wrap">
      <table style="width:100%;border-collapse:collapse;font-size:13px;min-width:720px">
        <thead><tr style="border-bottom:1px solid var(--border)">
          <th style="padding:8px;text-align:left;color:var(--text-muted)">${renderHTML(t('admin.col.user'))}</th>
          <th style="padding:8px;text-align:left;color:var(--text-muted)">${renderHTML(t('admin.col.auth'))}</th>
          <th style="padding:8px;text-align:left;color:var(--text-muted)">${renderHTML(t('admin.col.last_login'))}</th>
          <th style="padding:8px;text-align:left;color:var(--text-muted)">${renderHTML(t('admin.col.role'))}</th>
          <th style="padding:8px;text-align:left;color:var(--text-muted)">${renderHTML(t('admin.col.plan'))}</th>
          <th style="padding:8px;text-align:left;color:var(--text-muted)">${renderHTML(t('admin.col.workspace'))}</th>
          <th style="padding:8px;text-align:left;color:var(--text-muted)">${uiText(t('admin.col.actions'))}</th>
        </tr></thead>
        <tbody>
          ${renderHTML(users.map(u => `
            <tr style="border-bottom:1px solid var(--border)" data-filter-text="${esc([u.name, u.email, workspaceSummary(u)].filter(Boolean).join(' ').toLowerCase())}" data-filter-kind="${isPlatformStaffRole(u.role) ? 'platform' : 'user'}">
              <!-- ESCAPED: these come from self-registration and from an identity provider's
                   email claim, so they are attacker-chosen. A reviewer registered an address whose
                   local part was an img tag with an onerror handler, anonymously, and got script
                   execution in the PLATFORM ADMIN's session on this page - the very page operators
                   are now emailed to. Note backticks are illegal here: this sits inside a template
                   literal. -->
              <td style="padding:8px"><div style="font-weight:500">${uiText(u.name || u.email)}</div><div style="font-size:11px;color:var(--text-muted)">${uiText(u.email)}</div></td>
              <td style="padding:8px"><span style="background:var(--bg-primary);padding:2px 8px;border-radius:10px;font-size:11px">${uiText(u.auth_provider)}</span></td>
              <td style="padding:8px;font-size:11px;color:var(--text-muted)">${renderHTML(u.last_login ? displayValue(new Date(u.last_login * 1000), "toLocaleString", undefined) : t('common.never'))}</td>
              <td style="padding:8px">
                <select class="input" style="max-width:120px;width:100%;background:var(--bg-input);font-size:12px;padding:4px" data-role-user="${esc(u.id)}">
                  ${renderHTML(PLATFORM_ROLE_OPTIONS.map(r => `<option value="${r}" ${u.role === r ? 'selected' : ''}>${renderHTML(t('admin.role.' + r))}</option>`).join(''))}
                </select>
              </td>
              <td style="padding:8px">
                <select class="input" style="max-width:130px;width:100%;background:var(--bg-input);font-size:12px;padding:4px" data-plan-user="${u.id}">
                  ${renderHTML(plans.map(p => `<option value="${p.id}" ${u.plan_id === p.id ? 'selected' : ''}>${uiText(p.display_name)}</option>`).join(''))}
                </select>
              </td>
              ${renderHTML(workspaceCell(u))}
          `).join(''))}
        </tbody>
      </table>
      </div>
      <p style="color:var(--text-muted);font-size:11px;margin-top:8px">${renderHTML(t('admin.total_users', { n: users.length }))}</p>
    `;
    wireUserFilters(el);

    el.querySelectorAll('[data-role-user]').forEach(select => {
      select.onchange = async () => {
        try {
          await API(`/auth/users/${select.dataset.roleUser}/role`, { method: 'PUT', body: JSON.stringify({ role: select.value }) });
          showToast(t('admin.toast.role_updated'), 'success');
        } catch (err) { showToast(err.uiMessage || err.message, 'error'); loadUsers(); }
      };
    });

    el.querySelectorAll('[data-plan-user]').forEach(select => {
      select.onchange = async () => {
        try {
          await API('/subscription/assign', { method: 'POST', body: JSON.stringify({ user_id: select.dataset.planUser, plan_id: select.value }) });
          showToast(t('admin.toast.plan_updated'), 'success');
        } catch (err) { showToast(err.uiMessage || err.message, 'error'); loadUsers(); }
      };
    });

    // Manage ${renderHTML(t('nav.workspaces'))}: open the per-user membership modal (add/remove
    // workspaces, set per-workspace role). Refresh the table on close only if
    // something changed (the modal calls onClose then).
    el.querySelectorAll('[data-ws-manage]').forEach(btn => {
      btn.onclick = () => {
        const u = users.find(x => x.id === btn.dataset.wsManage);
        if (!u) return;
        openManageWorkspacesModal(u, { onClose: () => loadUsers() });
      };
    });

    // Reset password handlers
    el.querySelectorAll('[data-reset-pw-user]').forEach(btn => {
      btn.onclick = async () => {
        const email = btn.dataset.userEmail;
        const pw = prompt(t('admin.prompt_reset_password', { email }));
        if (pw === null) return;
        if (pw.length < 8) { showToast(t('admin.toast.password_min_8'), 'error'); return; }
        try {
          await api.resetUserPassword(btn.dataset.resetPwUser, pw);
          showToast(t('admin.toast.password_reset'), 'success');
        } catch (err) { showToast(err.uiMessage || err.message, 'error'); }
      };
    });

    el.querySelectorAll('[data-delete-user]').forEach(btn => {
      let confirming = false;
      btn.onclick = async () => {
        if (confirming) {
          try { await api.deleteUser(btn.dataset.deleteUser); showToast(t('admin.toast.user_removed'), 'success'); loadUsers(); }
          catch (err) { showToast(err.uiMessage || err.message, 'error'); }
          return;
        }
        confirming = true; bindText(btn, 'admin.confirm', undefined); btn.style.background = 'var(--danger)'; btn.style.color = 'white';
        setTimeout(() => { confirming = false; bindText(btn, 'admin.remove', undefined); btn.style.background = ''; btn.style.color = ''; }, 3000);
      };
    });
  } catch (err) { el.innerHTML = `<p style="color:var(--danger)">${uiText((err.uiMessage || err.message))}</p>`; }
}

// #146: toggle /api/status debug-metrics exposure. Mirrors loadBranding's
// load-then-save pattern; takes effect on the next status poll (no restart).
async function loadStatusDebug() {
  const el = document.getElementById('statusDebugForm');
  if (!el) return;
  let enabled = false;
  try { enabled = (await api.adminGetStatusDebug()).enabled; }
  catch (e) { el.innerHTML = `<p style="color:var(--danger)">${uiText((e.uiMessage || e.message) || t("ui.admin.failed_to_load_af14db"))}</p>`; return; }
  el.innerHTML = `
    <label style="display:flex;align-items:center;gap:8px;font-size:13px;cursor:pointer">
      <input type="checkbox" id="statusDebugChk" ${enabled ? 'checked' : ''}> ${renderHTML(t("ui.admin.expose_api_status_debug_metrics_bdc780"))}
    </label>
    <p style="color:var(--text-muted);font-size:12px;margin:4px 0 0 24px">${renderHTML(t("ui.admin.adds_internal_limiter_prune_ota_counters_to"))}</p>
  `;
  document.getElementById('statusDebugChk').onchange = async (e) => {
    const chk = e.target;
    chk.disabled = true;
    try { await api.adminSetStatusDebug(chk.checked); showToast(t(chk.checked ? 'ui.admin.status_debug_enabled' : 'ui.admin.status_debug_disabled'), 'success'); }
    catch (err) { showToast(err.uiMessage || err.message, 'error'); chk.checked = !chk.checked; }
    finally { chk.disabled = false; }
  };
}

/*
 * 3.0 TV-safe video copies (server/lib/video-variants.js, docs/tv-safe-video.md): how much of this
 * server's CPU may go to re-encoding tall videos for Samsung TVs. Platform admins only (the server
 * enforces it); each value also has a VIDEO_VARIANTS_* env default.
 */
async function loadTvSafe() {
  const el = document.getElementById('tvSafeForm');
  if (!el) return;
  let data;
  try { data = await api.adminGetVideoVariants(); }
  catch (e) { el.innerHTML = `<p style="color:var(--danger)">${uiText((e.uiMessage || e.message) || t("ui.admin.failed_to_load_af14db"))}</p>`; return; }
  const s = data.settings || {};
  const row = (label, input, hint = '') => `<div class="form-group" style="margin-bottom:10px"><label style="font-size:13px">${uiText(label)}</label>${renderHTML(input)}${renderHTML(hint ? `<p style="color:var(--text-muted);font-size:12px;margin:4px 0 0">${uiText(hint)}</p>` : '')}</div>`;
  el.innerHTML = `
    <label style="display:flex;align-items:center;gap:8px;font-size:13px;cursor:pointer;margin-bottom:10px">
      <input type="checkbox" id="tvSafeEnabled" ${s.enabled ? 'checked' : ''}> ${uiText(t('platform.tvsafe.enabled'))}
    </label>
    ${renderHTML(row(t('platform.tvsafe.window'), `<input class="input" id="tvSafeWindow" style="max-width:140px" placeholder="22-6" value="${esc(s.window || '')}">`, t('platform.tvsafe.window_hint')))}
    ${renderHTML(row(t('platform.tvsafe.concurrency'), `<select class="input" id="tvSafeConc" style="width:auto">${renderHTML([1, 2, 3, 4].map((n) => `<option value="${n}" ${Number(s.concurrency) === n ? 'selected' : ''}>${renderHTML(n)}</option>`).join(''))}</select>`))}
    ${renderHTML(row(t('platform.tvsafe.max_cpu'), `<input class="input" type="number" min="10" max="100" id="tvSafeCpu" style="max-width:100px" value="${esc(String(s.max_cpu ?? 70))}">`))}
    ${renderHTML(row(t('platform.tvsafe.minutes'), `<input class="input" type="number" min="0" id="tvSafeMinutes" style="max-width:120px" value="${esc(String(s.org_monthly_minutes ?? 0))}">`))}
    <p style="color:var(--text-muted);font-size:12px;margin:0 0 10px">${uiText(t('platform.tvsafe.env_hint'))}</p>
    <button class="btn btn-primary btn-sm" id="tvSafeSave">${uiText(t('platform.tvsafe.save'))}</button>`;
  document.getElementById('tvSafeSave').onclick = async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    try {
      await api.adminSetVideoVariants({
        enabled: document.getElementById('tvSafeEnabled').checked,
        window: document.getElementById('tvSafeWindow').value.trim(),
        concurrency: Number(document.getElementById('tvSafeConc').value),
        max_cpu: Number(document.getElementById('tvSafeCpu').value),
        org_monthly_minutes: Number(document.getElementById('tvSafeMinutes').value),
      });
      showToast(t('platform.tvsafe.saved'), 'success');
    } catch (err) { showToast(err.uiMessage || err.message, 'error'); }
    finally { btn.disabled = false; }
  };
}

/*
 * 3.0 screen share: how many people may present on one screen at once where a workspace admin has
 * switched "several people at once" on (server/routes/admin.js /screen-share, 1-4). Platform admins
 * only: for anyone else the section is removed rather than shown broken.
 */
async function loadSharePresenters() {
  const el = document.getElementById('sharePresentersForm');
  if (!el) return;
  let cur;
  try { cur = (await api.adminGetScreenShare()).max_presenters; }
  catch (_) { document.getElementById('sharePresentersSection')?.remove(); return; }
  el.innerHTML = `
    <label style="display:flex;align-items:center;gap:10px;font-size:13px">
      ${uiText(t('screen_share.admin.label'))}
      <select class="input" id="sharePresentersSel" style="width:auto">
        ${renderHTML([1, 2, 3, 4].map((n) => `<option value="${n}" ${n === cur ? 'selected' : ''}>${renderHTML(n)}</option>`).join(''))}
      </select>
    </label>`;
  document.getElementById('sharePresentersSel').onchange = async (e) => {
    const sel = e.target;
    sel.disabled = true;
    try { await api.adminSetScreenShare(Number(sel.value)); showToast(t('screen_share.admin.saved'), 'success'); }
    catch (err) { showToast(err.uiMessage || err.message, 'error'); }
    finally { sel.disabled = false; }
  };
}

/*
 * 3.0 free stock photos (server/routes/stock-media.js): the instance's Pexels / Pixabay keys. A key
 * is never sent back, only whether one is set and where from; one set in the environment is shown
 * as such and cannot be changed here. Platform admins only (the server enforces it): for anyone
 * else the section is removed rather than shown broken.
 */
const STOCK_KEY_PAGES = { pexels: 'https://www.pexels.com/api/', pixabay: 'https://pixabay.com/api/docs/' };
async function loadStockKeys() {
  const el = document.getElementById('stockKeysForm');
  if (!el) return;
  let data;
  try { data = await api.adminGetStockKeys(); }
  catch (e) {
    if (e.status === 403) { document.getElementById('stockKeysSection')?.remove(); return; }
    el.innerHTML = `<p style="color:var(--danger)">${uiText((e.uiMessage || e.message) || t("ui.admin.failed_to_load_af14db"))}</p>`;
    return;
  }
  const stateText = (p) => p.source === 'env' ? t('stock.admin.from_env', { env: p.env })
    : p.source === 'settings' ? t('stock.admin.saved') : t('stock.admin.not_set');
  el.innerHTML = (data.providers || []).map((p) => `
    <div class="stock-admin-row" data-stock-provider="${esc(p.id)}">
      <div class="stock-admin-head">
        <strong>${uiText(p.name)}</strong>
        <span class="stock-admin-state ${p.configured ? 'on' : ''}">${uiText(stateText(p))}</span>
        <a href="${esc(STOCK_KEY_PAGES[p.id] || '#')}" target="_blank" rel="noopener noreferrer">${uiText(t('stock.admin.get_key'))}</a>
      </div>
      ${renderHTML(p.env_locked ? '' : `<form class="stock-admin-form" data-stock-form>
        <label class="lib-visually-hidden" for="stockKey-${esc(p.id)}">${uiText(t('stock.admin.key_label', { provider: p.name }))}</label>
        <input id="stockKey-${esc(p.id)}" class="input" type="password" autocomplete="off" spellcheck="false" maxlength="200"
          placeholder="${esc(t(p.configured ? 'stock.admin.key_ph_replace' : 'stock.admin.key_ph'))}" data-fil-i18n-placeholder="${binding(p.configured ? 'stock.admin.key_ph_replace' : 'stock.admin.key_ph', undefined)}">
        <button type="submit" class="btn btn-primary btn-sm">${uiText(t('common.save'))}</button>
        ${renderHTML(p.configured ? `<button type="button" class="btn btn-secondary btn-sm" data-stock-remove>${uiText(t('stock.admin.remove'))}</button>` : '')}
      </form>`)}
      ${renderHTML(p.configured ? `<button type="button" class="btn btn-secondary btn-sm" data-stock-test>${uiText(t('stock.admin.test'))}</button>` : '')}
      <span class="stock-admin-result" data-stock-result role="status"></span>
    </div>`).join('') + `<p style="color:var(--text-muted);font-size:12px;margin-top:8px">${uiText(t('stock.admin.note'))}</p>`;
  el.querySelectorAll('[data-stock-provider]').forEach((row) => {
    const id = row.dataset.stockProvider;
    const result = row.querySelector('[data-stock-result]');
    row.querySelector('[data-stock-form]')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const input = row.querySelector('input');
      const key = input.value.trim();
      if (!key) return;
      try { await api.adminSetStockKey(id, key); input.value = ''; showToast(t('stock.admin.saved_toast'), 'success'); loadStockKeys(); }
      catch (err) { bindMessage(result, (err.uiMessage || err.message)); }
    });
    row.querySelector('[data-stock-remove]')?.addEventListener('click', async () => {
      try { await api.adminSetStockKey(id, ''); loadStockKeys(); }
      catch (err) { bindMessage(result, (err.uiMessage || err.message)); }
    });
    row.querySelector('[data-stock-test]')?.addEventListener('click', async (e) => {
      e.target.disabled = true;
      bindText(result, 'stock.admin.testing', undefined);
      try {
        const r = await api.adminTestStockKey(id);
        bindMessage(result, r.ok ? t('stock.admin.test_ok') : (r.error || t('stock.admin.test_failed')));
      } catch (err) { bindMessage(result, (err.uiMessage || err.message)); }
      finally { e.target.disabled = false; }
    });
  });
}

async function loadPlans() {
  const el = document.getElementById('plansTable');
  try {
    // Admin endpoint, not /api/subscription/plans: that one filters `active = 1` because it feeds
    // the pricing page, so a deliberately hidden plan (a comped or beta tier) was invisible to the
    // operator too. Here we want every plan, plus who is actually on each one.
    const { plans, orphaned, stripe_configured: stripeConfigured } = await api.adminListPlans();
    // Platform operators look; only platform admins change plans (the server enforces it).
    const canEdit = isPlatformAdmin(JSON.parse(localStorage.getItem('user') || '{}'));
    // Whether a paid plan can actually be bought: checkout charges its linked Stripe price.
    const checkout = (p) => {
      if (!(p.price_monthly > 0) && !(p.price_yearly > 0)) return `<span style="color:var(--text-muted)">${uiText(t('admin.plan.checkout_none'))}</span>`;
      const missing = (p.price_monthly > 0 && !p.stripe_price_monthly) || (p.price_yearly > 0 && !p.stripe_price_yearly);
      return missing ? `<span style="color:var(--warning)">${uiText(t('admin.plan.checkout_missing'))}</span>` : esc(t('admin.plan.checkout_linked'));
    };
    el.innerHTML = `
      ${renderHTML(canEdit ? `<div style="display:flex;justify-content:flex-end;margin-bottom:8px"><button type="button" class="btn btn-primary btn-sm" id="planNewBtn">${uiText(t('admin.plan.new'))}</button></div>` : '')}
      <div class="table-wrap">
      <table style="width:100%;border-collapse:collapse;font-size:13px;min-width:640px">
        <thead><tr style="border-bottom:1px solid var(--border)">
          <th style="padding:8px;text-align:left;color:var(--text-muted)">${renderHTML(t('admin.col.plan'))}</th>
          <th style="padding:8px;text-align:right;color:var(--text-muted)">${renderHTML(t('admin.col.devices'))}</th>
          <th style="padding:8px;text-align:right;color:var(--text-muted)">${renderHTML(t('admin.col.storage'))}</th>
          <th style="padding:8px;text-align:right;color:var(--text-muted)">${renderHTML(t('admin.col.monthly'))}</th>
          <th style="padding:8px;text-align:right;color:var(--text-muted)">${renderHTML(t('admin.col.yearly'))}</th>
          <th style="padding:8px;text-align:right;color:var(--text-muted)">${renderHTML(t('admin.col.accounts'))}</th>
          <th style="padding:8px;text-align:right;color:var(--text-muted)">${renderHTML(t('admin.col.screens'))}</th>
          <th style="padding:8px;text-align:left;color:var(--text-muted)">${renderHTML(t('admin.plan.checkout'))}</th>
          ${renderHTML(canEdit ? `<th style="padding:8px"><span class="lib-visually-hidden">${uiText(t('admin.col.actions'))}</span></th>` : '')}
        </tr></thead>
        <tbody>
          ${renderHTML(plans.map(p => `
            <tr style="border-bottom:1px solid var(--border)${p.active ? '' : ';opacity:.7'}">
              <td style="padding:8px;font-weight:500">${uiText(p.display_name)}
                <span style="color:var(--text-muted);font-weight:400;font-size:11px">${uiText(p.id)}</span>
                ${renderHTML(p.active ? '' : `<span style="margin-left:6px;font-size:10px;padding:1px 6px;border:1px solid var(--border);border-radius:8px;color:var(--text-muted)">${renderHTML(t('admin.plan_hidden'))}</span>`)}
              </td>
              <td style="padding:8px;text-align:right">${renderHTML(p.max_devices === -1 ? t('admin.unlimited') : p.max_devices)}</td>
              <td style="padding:8px;text-align:right">${renderHTML(p.max_storage_mb === -1 ? t('admin.unlimited') : p.max_storage_mb >= 1024 ? (p.max_storage_mb/1024)+'GB' : p.max_storage_mb+'MB')}</td>
              <td style="padding:8px;text-align:right">${renderHTML(p.price_monthly > 0 ? displayValue(Number(p.price_monthly),'toLocaleString',{style:'currency',currency:'USD'}) : t('admin.free'))}</td>
              <td style="padding:8px;text-align:right">${renderHTML(p.price_yearly > 0 ? displayValue(Number(p.price_yearly),'toLocaleString',{style:'currency',currency:'USD'}) : '-')}</td>
              <td style="padding:8px;text-align:right${p.user_count ? ';font-weight:500' : ';color:var(--text-muted)'}">${renderHTML(p.user_count)}</td>
              <td style="padding:8px;text-align:right;color:var(--text-muted)">${renderHTML(p.device_count)}</td>
              <td style="padding:8px;font-size:12px">${renderHTML(checkout(p))}</td>
              ${renderHTML(canEdit ? `<td style="padding:8px;text-align:right"><button type="button" class="btn btn-secondary btn-sm" data-plan-edit="${esc(p.id)}" aria-label="${esc(t('admin.plan.edit_named', { name: p.display_name }))}" data-fil-i18n-aria-label="${binding('admin.plan.edit_named', { name: p.display_name })}">${uiText(t('admin.plan.edit'))}</button></td>` : '')}
            </tr>
          `).join(''))}
        </tbody>
      </table>
      </div>
      ${renderHTML((orphaned && orphaned.length) ? `
        <p style="margin-top:10px;color:var(--danger);font-size:12px">
          ${renderHTML(t('admin.plan_orphaned'))}: ${renderHTML(orphaned.map(o => `<strong>${uiText(o.plan_id)}</strong> (${renderHTML(o.user_count)})`).join(', '))}
        </p>` : '')}
    `;
    el.querySelector('#planNewBtn')?.addEventListener('click', async () => {
      const { openPlanEditor } = await import('../components/plan-editor.js');
      openPlanEditor({ stripeConfigured, onSaved: () => loadPlans() });
    });
    el.querySelectorAll('[data-plan-edit]').forEach((b) => b.addEventListener('click', async () => {
      const { openPlanEditor } = await import('../components/plan-editor.js');
      openPlanEditor({ plan: plans.find((x) => x.id === b.dataset.planEdit), stripeConfigured, onSaved: () => loadPlans() });
    }));
  } catch (err) { el.innerHTML = `<p style="color:var(--danger)">${uiText((err.uiMessage || err.message))}</p>`; }
}

async function loadSystem() {
  const el = document.getElementById('systemInfo');
  try {
    const version = await fetch('/api/version').then(r => r.json());
    const token = localStorage.getItem('token');
    // Platform admins only (the route enforces it); anyone else just gets the version cards.
    // ⚠️ isPlatformAdmin needs the user. Called bare it was always false, so this page never asked:
    // no "Updater ready" card, no confirm before Update Now, and no progress after a reload.
    const updateStatus = isPlatformAdmin(JSON.parse(localStorage.getItem('user') || '{}'))
      ? await fetch('/api/admin/update-status', { headers: headers() }).then(r => (r.ok ? r.json() : null)).catch(() => null)
      : null;
    const updaterInfo = updateStatus?.updater || null;

    const versionComparison = version.latest_version
      ? `<div class="info-card">
           <div class="info-card-label">${renderHTML(t('admin.latest_version'))}</div>
           <div class="info-card-value small">${uiText(version.latest_version)}</div>
         </div>
         <div class="info-card">
           <div class="info-card-label">${renderHTML(t('admin.status'))}</div>
           <div class="info-card-value small" style="color:${version.update_available ? 'var(--warning)' : 'var(--success)'}">${renderHTML(version.update_available ? (t('admin.update_available')) : (t('admin.up_to_date')))}</div>
         </div>`
      : `<div class="info-card">
           <div class="info-card-label">${renderHTML(t('admin.latest_version'))}</div>
           <div class="info-card-value small" style="color:var(--text-muted)">${renderHTML(t('admin.checking'))}</div>
         </div>`;

    el.innerHTML = `
      <div class="info-grid">
        <div class="info-card"><div class="info-card-label">${renderHTML(t('admin.version'))}</div><div class="info-card-value small">${uiText(version.version)}</div></div>
        ${renderHTML(versionComparison)}
        ${renderHTML(updaterInfo ? `<div class="info-card">
           <div class="info-card-label">${renderHTML(t('admin.updater'))}</div>
           <div class="info-card-value small" style="color:${updaterInfo.available ? 'var(--success)' : 'var(--text-muted)'}">${renderHTML(updaterInfo.available ? t('admin.updater_ready', { kind: updaterInfo.kind })
             : updaterInfo.reason === 'not_running' ? t('admin.updater_not_running') : t('admin.updater_not_installed'))}</div>
         </div>` : '')}
      </div>
      <div style="display:flex;gap:8px;margin-top:16px;flex-wrap:wrap">
        <button class="btn btn-secondary btn-sm" id="checkUpdateBtn">${renderHTML(t('admin.check_now'))}</button>
        <button class="btn btn-primary btn-sm" id="triggerUpdateBtn"${!version.update_available ? ' style="display:none"' : ''}>${renderHTML(t('admin.update_now'))}</button>
        <a href="/api/status/backup?token=${token}" class="btn btn-secondary btn-sm" style="text-decoration:none">${renderHTML(t('admin.download_db_backup'))}</a>
        <a href="/api/status" target="_blank" class="btn btn-secondary btn-sm" style="text-decoration:none">${renderHTML(t('admin.server_status'))}</a>
      </div>
      <div id="updateResult" style="margin-top:12px"></div>
    `;

    // Check Now button
    document.getElementById('checkUpdateBtn')?.addEventListener('click', async () => {
      const btn = document.getElementById('checkUpdateBtn');
      btn.disabled = true;
      bindText(btn, 'admin.checking', undefined);
      try {
        const res = await fetch('/api/admin/check-update', { method: 'POST', headers: headers() });
        const data = await res.json();
        const updBtn = document.getElementById('triggerUpdateBtn');
        if (data.update_available && updBtn) {
          updBtn.style.display = '';
        }
        loadSystem(); // refresh the whole card
      } catch (err) {
        showToast(err.uiMessage || err.message, 'error');
        btn.disabled = false;
        bindText(btn, 'admin.check_now', undefined);
      }
    });

    // Update Now button. Queues an upgrade for the host-side updater (docs/instance-updater.md);
    // without one installed, the server answers with the command to run by hand instead.
    document.getElementById('triggerUpdateBtn')?.addEventListener('click', async () => {
      const btn = document.getElementById('triggerUpdateBtn');
      const resultEl = document.getElementById('updateResult');
      const target = version.latest_version;
      if (updaterInfo?.available
          && !confirm(t('admin.update_confirm', { from: version.version, to: target }))) return;
      btn.disabled = true;
      bindText(btn, 'admin.updating', undefined);
      try {
        const res = await fetch('/api/admin/trigger-update', {
          method: 'POST',
          headers: { ...headers(), 'Content-Type': 'application/json' },
          body: JSON.stringify({ target }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(localizeServerError(data.error) || res.statusText);
        if (data.queued) {
          watchUpdate(resultEl, data.id);
          return;  // the button stays disabled until the job ends
        }
        resultEl.innerHTML = `
          <div style="margin-top:12px;border:1px solid var(--border);border-radius:var(--radius);padding:12px;background:var(--bg-secondary)">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
              <strong style="font-size:13px">${renderHTML(t('admin.manual_update'))}</strong>
              <button class="btn btn-secondary btn-sm" id="copyCmdBtn">${renderHTML(t('admin.copy_command'))}</button>
            </div>
            <p style="font-size:12px;color:var(--text-muted);margin-bottom:8px">${renderHTML(t('admin.manual_update_desc'))}</p>
            <pre style="font-size:11px;margin:0;background:var(--bg-primary);padding:8px;border-radius:4px;white-space:pre-wrap;word-break:break-all">${uiText(data.instructions || '')}</pre>
            <p style="font-size:12px;color:var(--text-muted);margin:8px 0 0">${renderHTML(t('admin.updater_hint'))}</p>
          </div>`;
        document.getElementById('copyCmdBtn')?.addEventListener('click', () => copyText(resultEl.querySelector('pre')?.textContent || ''));
      } catch (err) {
        showToast(err.uiMessage || err.message, 'error');
      }
      btn.disabled = false;
      bindText(btn, 'admin.update_now', undefined);
    });

    // An upgrade already running (this page was reloaded, or opened mid-upgrade): pick it up.
    if (updateStatus?.running || updateStatus?.pending?.length) {
      const btn = document.getElementById('triggerUpdateBtn');
      if (btn) { btn.disabled = true; bindText(btn, 'admin.updating', undefined); }
      watchUpdate(document.getElementById('updateResult'), updateStatus.pending?.[0] || updateStatus.job?.id);
    } else if (updateStatus?.job && ['failed', 'rolled_back'].includes(updateStatus.job.state)
               && Date.now() / 1000 - updateStatus.job.updated_at < 86400) {
      renderUpdateJob(document.getElementById('updateResult'), updateStatus);
    }
  } catch (err) { el.innerHTML = `<p style="color:var(--danger)">${uiText((err.uiMessage || err.message))}</p>`; }
}

let updatePollTimer = null;

function copyText(text) {
  if (navigator.clipboard) {
    navigator.clipboard.writeText(text).then(() => showToast(t('admin.copied'), 'success'));
    return;
  }
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.position = 'fixed';
  ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.select();
  document.execCommand('copy');
  document.body.removeChild(ta);
  showToast(t('admin.copied'), 'success');
}

const UPDATE_STATE_KEYS = {
  starting: 'admin.update_state_starting', backup: 'admin.update_state_backup', fetch: 'admin.update_state_fetch',
  pull: 'admin.update_state_fetch', install: 'admin.update_state_install', restart: 'admin.update_state_restart',
  verify: 'admin.update_state_verify', rollback: 'admin.update_state_rollback', done: 'admin.update_success',
  failed: 'admin.update_failed', rolled_back: 'admin.update_rolled_back',
};

function renderUpdateJob(el, s, { unreachable = false } = {}) {
  if (!el) return;
  const job = s?.job;
  const state = job?.state || 'starting';
  const color = state === 'done' ? 'var(--success)' : ['failed', 'rolled_back'].includes(state) ? 'var(--danger)' : 'var(--text-primary)';
  const title = unreachable ? t('admin.update_state_restart') : t(UPDATE_STATE_KEYS[state] || 'admin.updating');
  el.innerHTML = `
    <div style="margin-top:12px;border:1px solid var(--border);border-radius:var(--radius);padding:12px;background:var(--bg-card)">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;gap:8px">
        <strong style="font-size:13px;color:${color}">${uiText(title)}${renderHTML(job?.target ? ` · v${esc(job.from || '?')} → v${esc(job.target)}` : '')}</strong>
        <button class="btn btn-secondary btn-sm" id="copyUpdateLogBtn">${renderHTML(t('admin.copy'))}</button>
      </div>
      ${renderHTML(job?.message ? `<p style="font-size:12px;margin:0 0 8px;color:var(--text-muted)">${uiText(job.message)}</p>` : '')}
      <pre style="max-height:300px;overflow:auto;font-size:11px;margin:0;background:var(--bg-primary);padding:8px;border-radius:4px;white-space:pre-wrap;word-break:break-all">${uiText(s?.log || '')}</pre>
    </div>`;
  document.getElementById('copyUpdateLogBtn')?.addEventListener('click', () => copyText(el.querySelector('pre')?.textContent || ''));
}

// Poll the updater's status until the job ends. The server going away mid-upgrade is the normal
// case (it is being restarted), so a failed poll means "restarting", not an error.
function watchUpdate(el, jobId) {
  clearTimeout(updatePollTimer);
  const tick = async () => {
    let s = null;
    try {
      const r = await fetch('/api/admin/update-status', { headers: headers() });
      if (r.ok) s = await r.json();
    } catch (_) { /* restarting */ }
    if (!s) {
      renderUpdateJob(el, null, { unreachable: true });
    } else {
      const mine = !jobId || s.job?.id === jobId;
      renderUpdateJob(el, mine ? s : { ...s, job: { state: 'starting' } });
      if (mine && s.job && ['done', 'failed', 'rolled_back'].includes(s.job.state)) {
        if (s.job.state === 'done') {
          showToast(t('admin.update_success'), 'success');
          setTimeout(() => location.reload(), 2500);  // load the new version's dashboard
        } else {
          const btn = document.getElementById('triggerUpdateBtn');
          if (btn) { btn.disabled = false; bindText(btn, 'admin.update_now', undefined); }
        }
        return;
      }
    }
    if (document.getElementById('updateResult') === el) updatePollTimer = setTimeout(tick, 3000);
  };
  tick();
}

export function cleanup() { clearTimeout(updatePollTimer); clearTimeout(hostTimer); }

/* ------------------------------------------------------------------ server diagnostics */

const num = (n) => (n == null ? '—' : displayValue(Number(n), "toLocaleString", undefined));
const mb = (b) => (b == null ? '—' : displayQuantity((b / 1048576),'MB',1));

/*
 * ⚠️ THE POINT OF THIS SCREEN. Diagnosing a slow install used to mean sending someone a shell
 * script and talking them through running it as root on production. Every number here was already
 * being recorded — the loop-lag table gets a row a second and had never been read back — so this is
 * mostly a matter of showing what the server already knows.
 */
async function loadDiagnostics() {
  const el = document.getElementById('diagBody');
  if (!el) return;
  el.innerHTML = `<p style="color:var(--text-muted)">${uiText(t('common.loading'))}</p>`;
  let shape; let lag;
  try {
    [shape, lag] = await Promise.all([api.adminDiagShape(), api.adminDiagLag(14)]);
  } catch (e) {
    el.innerHTML = `<p style="color:var(--danger)">${uiText((e.uiMessage || e.message) || t("ui.admin.failed_to_load_diagnostics_c143ae"))}</p>`;
    return;
  }

  const live = lag.live || {};
  const bandColour = live.band === 'critical' ? 'var(--danger)' : live.band === 'elevated' ? 'var(--warning, #f59e0b)' : 'var(--success, #10b981)';

  /*
   * The daily trend first, because it answers the question that actually starts an investigation:
   * did this step up on a date? That turns "why is the server slow" into "what changed on the 14th".
   */
  const daily = (lag.daily || []).map((d) => `
    <tr><td>${uiText(d.day)}</td><td>${renderHTML(num(d.samples))}</td><td>${renderHTML(num(d.avg_p50))}</td>
        <td style="color:${d.avg_p99 >= 100 ? 'var(--danger)' : 'inherit'}">${renderHTML(num(d.avg_p99))}</td>
        <td>${renderHTML(num(d.worst))}</td><td>${renderHTML(d.samples ? Math.round((100 * d.not_normal) / d.samples) : 0)}%</td></tr>`).join('');

  const tables = (shape.tables || []).filter((r) => r.rows > 0).slice(0, 12)
    .map((r) => `<tr><td>${uiText(r.table)}</td><td>${renderHTML(num(r.rows))}</td></tr>`).join('');

  el.innerHTML = `
    <div style="display:flex;gap:24px;flex-wrap:wrap;margin-bottom:16px">
      <div><div style="font-size:11px;color:var(--text-muted)">${renderHTML(t('admin.diag.band'))}</div>
           <div style="font-size:20px;font-weight:700;color:${bandColour}">${uiText(live.band || '—')}</div></div>
      <div><div style="font-size:11px;color:var(--text-muted)">${renderHTML(t("ui.admin.sustained_p99"))}</div>
           <div style="font-size:20px;font-weight:700">${renderHTML(num(Math.round(live.sustained_p99_ms || 0)))} ms</div></div>
      <div><div style="font-size:11px;color:var(--text-muted)">${renderHTML(t("ui.admin.database"))}</div>
           <div style="font-size:20px;font-weight:700">${renderHTML(mb((shape.db || {}).path_bytes))}</div></div>
      <div><div style="font-size:11px;color:var(--text-muted)">${renderHTML(t("ui.admin.displays"))}</div>
           <div style="font-size:20px;font-weight:700">${renderHTML(num((shape.devices || {}).online))} / ${renderHTML(num((shape.devices || {}).total))}</div></div>
    </div>

    <h4 style="margin:12px 0 6px">${renderHTML(t('admin.diag.lag_daily'))}</h4>
    <div class="table-wrap"><table class="corp-table"><thead><tr>
      <th>${renderHTML(t("ui.admin.day"))}</th><th>${renderHTML(t("ui.admin.samples"))}</th><th>${renderHTML(t("ui.admin.avg_p50"))}</th><th>${renderHTML(t("ui.admin.avg_p99"))}</th><th>${renderHTML(t("ui.admin.worst"))}</th><th>${renderHTML(t("ui.admin.not_normal"))}</th>
    </tr></thead><tbody>${renderHTML(daily || `<tr><td colspan="6">${renderHTML(t('admin.diag.no_history'))}</td></tr>`)}</tbody></table></div>

    <h4 style="margin:16px 0 6px">${renderHTML(t('admin.diag.shape'))}</h4>
    <div style="display:flex;gap:24px;flex-wrap:wrap;font-size:13px;margin-bottom:8px">
      <span>${renderHTML(t('ui.admin.plays',{total:num((shape.play_logs||{}).total),open:num((shape.play_logs||{}).still_open)}))}</span>
      <span>${renderHTML(t('ui.admin.largest_playlist',{size:mb((shape.assigned_playlists||{}).max_snapshot_bytes)}))}</span>
      <span>${renderHTML(t('ui.admin.largest_widget',{size:mb((shape.widgets||{}).max_config_bytes)}))}</span>
      <span>${renderHTML(t('nav.workspaces'))}: <b>${renderHTML(num(shape.workspaces))}</b></span>
    </div>
    <div class="table-wrap"><table class="corp-table"><thead><tr><th>${renderHTML(t("ui.admin.table"))}</th><th>${renderHTML(t("ui.admin.rows"))}</th></tr></thead>
      <tbody>${renderHTML(tables)}</tbody></table></div>
    <div id="diagProfileOut"></div>`;
}

let lastProfile = null;

function wireDiagnostics() {
  const refresh = document.getElementById('diagRefreshBtn');
  if (refresh) refresh.addEventListener('click', loadDiagnostics);

  const dl = document.getElementById('diagDownloadBtn');
  if (dl) dl.addEventListener('click', () => {
    if (!lastProfile) return;
    /*
     * A .cpuprofile is what DevTools opens directly (Performance -> Load profile), which is the
     * whole reason to hand back the raw profile as well as the summary: the table says WHERE, the
     * file lets somebody see the call tree around it.
     */
    const blob = new Blob([JSON.stringify(lastProfile)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `screentinker-${new Date().toISOString().replace(/[:.]/g, '-')}.cpuprofile`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  });

  const btn = document.getElementById('diagProfileBtn');
  if (!btn) return;
  btn.addEventListener('click', async () => {
    const secs = Number(document.getElementById('diagProfileSecs').value) || 30;
    const out = document.getElementById('diagProfileOut');
    btn.disabled = true;
    const original = btn.textContent;
    // It is supposed to take this long; say so, or it reads as a hung button.
    bindText(btn, 'admin.diag.profiling', { seconds: secs });
    if (out) out.innerHTML = `<p style="color:var(--text-muted);margin-top:12px">${renderHTML(t('admin.diag.profiling_note'))}</p>`;
    try {
      const r = await api.adminDiagProfile(secs);
      lastProfile = r.profile;
      const rows = (r.top || []).map((x) => `
        <tr><td style="text-align:right">${renderHTML(x.pct)}%</td><td>${uiText(x.fn)}</td><td style="color:var(--text-muted)">${uiText(x.at)}</td></tr>`).join('');
      if (out) out.innerHTML = `
        <h4 style="margin:16px 0 6px">${renderHTML(t('admin.diag.top_self'))}</h4>
        <div class="table-wrap"><table class="corp-table"><thead><tr>
          <th>${renderHTML(t("ui.admin.self"))}</th><th>${renderHTML(t("ui.admin.function"))}</th><th>${renderHTML(t("ui.admin.where"))}</th></tr></thead><tbody>${renderHTML(rows)}</tbody></table></div>`;
      const d = document.getElementById('diagDownloadBtn');
      if (d) d.style.display = '';
      showToast(t('admin.diag.profile_done'), 'success');
    } catch (e) {
      if (out) out.innerHTML = `<p style="color:var(--danger);margin-top:12px">${uiText((e.uiMessage || e.message) || t("ui.admin.profile_failed_1f3fd3"))}</p>`;
    } finally {
      btn.disabled = false;
      bindMessage(btn, original);
    }
  });
}

async function loadPlugins() {
  const section = document.getElementById('pluginsSection');
  const host = document.getElementById('pluginsTable');
  const subHost = document.getElementById('pluginSubmissions');
  const pinHost = document.getElementById('pluginAllowlist');
  if (!section || !host) return;
  const headers = { Authorization: `Bearer ${localStorage.getItem('token')}` };
  let body;
  try {
    const res = await fetch('/api/admin/plugins', { headers });
    if (res.status === 404) {
      section.style.display = 'none';
      // PLUGINS_ENABLED is unset: say so, rather than leave the Plugins page blank.
      const off = document.getElementById('pluginsOff');
      if (off) off.hidden = false;
      return;
    }
    if (!res.ok) throw new Error(localizeServerError((await res.json().catch(() => ({}))).error) || String(res.status));
    body = await res.json();
  } catch (e) {
    section.style.display = 'none';
    return;
  }
  section.style.display = '';
  const plugins = Array.isArray(body.plugins) ? body.plugins : [];

  let pending = [];
  try {
    const r = await fetch('/api/admin/plugins/submissions?status=pending', { headers });
    if (r.ok) pending = ((await r.json()).submissions) || [];
  } catch { pending = []; }

  let pins = [];
  try {
    const r = await fetch('/api/admin/plugins/allowlist', { headers });
    if (r.ok) pins = ((await r.json()).allowlist) || [];
  } catch { pins = []; }

  if (subHost) {
    if (!pending.length) {
      subHost.innerHTML = `<p style="color:var(--text-muted);font-size:12px">${renderHTML(t('admin.plugins.pending_empty'))}</p>`;
    } else {
      subHost.innerHTML = pending.map((s) => `
        <details class="corp-card" style="margin-bottom:8px;padding:12px">
          <summary style="cursor:pointer;font-weight:600">${uiText(s.name || s.plugin_id)} <span style="font-weight:400;color:var(--text-muted);font-family:monospace;font-size:12px">${uiText(s.plugin_id)} @ ${uiText(s.version || '')}</span></summary>
          <p style="font-size:12px;color:var(--text-muted);margin:8px 0">${uiText(s.description || '')}</p>
          <p style="font-size:11px;font-family:monospace;word-break:break-all">${renderHTML(t("ui.admin.sha256_0466c7", {value4: s.sha256}))}</p>
          <details style="margin:8px 0">
            <summary style="cursor:pointer;font-size:12px">${renderHTML(t('admin.plugins.manifest'))}</summary>
            <pre style="font-size:11px;overflow:auto;max-height:240px;background:var(--bg-primary);padding:8px;border-radius:6px">${uiText(JSON.stringify(s.manifest || {}, null, 2))}</pre>
          </details>
          <p style="font-size:12px;margin:8px 0 4px">${renderHTML(t('admin.plugins.files'))}</p>
          <ul style="font-size:12px;font-family:monospace;margin:0 0 8px 16px">${renderHTML((s.files || []).map((f) => `<li><button type="button" class="btn btn-secondary btn-sm" data-plugin-inspect="${s.id}" data-plugin-path="${esc(f.name)}">${renderHTML(t('admin.plugins.inspect'))} ${uiText(f.name)}</button> (${renderHTML(f.size)})</li>`).join(''))}</ul>
          <pre data-plugin-inspect-out="${s.id}" style="display:none;font-size:11px;overflow:auto;max-height:320px;background:var(--bg-primary);padding:8px;border-radius:6px;white-space:pre-wrap"></pre>
          <div style="display:flex;gap:8px">
            <button class="btn btn-primary btn-sm" data-plugin-approve="${s.id}">${renderHTML(t('admin.plugins.approve'))}</button>
            <button class="btn btn-secondary btn-sm" data-plugin-reject="${s.id}">${renderHTML(t('admin.plugins.reject'))}</button>
          </div>
        </details>`).join('');
    }
  }

  if (!plugins.length) {
    host.innerHTML = `<p style="color:var(--text-muted)">${renderHTML(t('admin.plugins.empty'))}</p>`;
  } else {
    host.innerHTML = `<div class="table-wrap"><table class="corp-table"><thead><tr>
      <th>${renderHTML(t('admin.plugins.col_name'))}</th>
      <th>${renderHTML(t('admin.plugins.col_id'))}</th>
      <th>${renderHTML(t('admin.plugins.col_origin'))}</th>
      <th>${renderHTML(t('admin.plugins.col_status'))}</th>
      <th>${renderHTML(t('admin.plugins.col_hash'))}</th>
      <th></th>
    </tr></thead><tbody>${renderHTML(plugins.map((p) => {
      const status = p.error
        ? t('admin.plugins.error')
        : (p.enabled ? (p.loaded ? t('admin.plugins.loaded') : t('admin.plugins.enabled')) : t('admin.plugins.disabled'));
      const action = p.enabled
        ? `<button class="btn btn-secondary btn-sm" data-plugin-disable="${esc(p.id)}">${renderHTML(t('admin.plugins.disable'))}</button>`
        : `<button class="btn btn-primary btn-sm" data-plugin-enable="${esc(p.id)}">${renderHTML(t('admin.plugins.enable'))}</button>`;
      const pinBtn = p.allowlisted
        ? `<button class="btn btn-secondary btn-sm" data-plugin-unpin="${esc(p.id)}">${renderHTML(t('admin.plugins.unpin'))}</button>`
        : `<button class="btn btn-secondary btn-sm" data-plugin-pin="${esc(p.id)}">${renderHTML(t('admin.plugins.pin'))}</button>`;
      const err = p.error ? `<div style="color:var(--danger);font-size:12px;margin-top:4px">${uiText(p.error)}</div>` : '';
      const hash = p.allowlist_sha256 ? `<span style="font-family:monospace;font-size:11px">${uiText(p.allowlist_sha256.slice(0, 12))}…</span>` : '—';
      return `<tr>
        <td>${uiText(p.name || p.id)}${renderHTML(err)}</td>
        <td style="font-family:monospace;font-size:12px">${uiText(p.id)}</td>
        <td>${uiText(p.origin || '')}</td>
        <td>${uiText(status)}</td>
        <td>${renderHTML(hash)}</td>
        <td style="display:flex;gap:6px;flex-wrap:wrap">${renderHTML(action)}${renderHTML(pinBtn)}</td>
      </tr>`;
    }).join(''))}</tbody></table></div>
    <p style="color:var(--text-muted);font-size:12px;margin-top:8px">${renderHTML(t('admin.plugins.restart'))}</p>
    ${renderHTML(plugins.filter((p) => Array.isArray(p.settings_fields) && p.settings_fields.length).map((p) => `
      <details class="corp-card" style="margin-top:12px;padding:12px" data-plugin-settings="${esc(p.id)}">
        <summary style="cursor:pointer;font-weight:600">${uiText(p.name || p.id)} — ${renderHTML(t('admin.plugins.settings'))}</summary>
        <form data-plugin-settings-form="${esc(p.id)}" style="margin-top:12px">
          ${renderHTML(pluginFieldsHtml(p.settings_fields, p.settings || {}, 'plugset_' + p.id + '_'))}
          <button type="submit" class="btn btn-primary btn-sm" style="margin-top:8px">${renderHTML(t('admin.plugins.save_settings'))}</button>
        </form>
      </details>`).join(''))}`;
  }

  if (pinHost) {
    if (!pins.length) {
      pinHost.innerHTML = `<p style="color:var(--text-muted);font-size:12px">${renderHTML(t('admin.plugins.allowlist_empty'))}</p>`;
    } else {
      pinHost.innerHTML = `<div class="table-wrap"><table class="corp-table"><thead><tr>
        <th>${renderHTML(t('admin.plugins.col_id'))}</th><th>${renderHTML(t("ui.admin.sha256"))}</th><th>${renderHTML(t("ui.admin.source"))}</th></tr></thead><tbody>
        ${renderHTML(pins.map((r) => `<tr>
          <td style="font-family:monospace;font-size:12px">${uiText(r.plugin_id)}</td>
          <td style="font-family:monospace;font-size:11px;word-break:break-all">${uiText(r.sha256)}</td>
          <td>${uiText(r.source)}</td>
        </tr>`).join(''))}</tbody></table></div>`;
    }
  }

  const post = async (url, extra, okMsg) => {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: extra ? JSON.stringify(extra) : '{}',
      });
      if (!res.ok) throw new Error(localizeServerError((await res.json().catch(() => ({}))).error) || String(res.status));
      const r = await res.json().catch(() => ({}));
      showToast(okMsg || (r.restart_required ? t('admin.plugins.restart_now') : t('admin.plugins.saved')), 'success');
      await loadPlugins();
    } catch (e) {
      showToast(e.uiMessage || e.message || t('admin.plugins.failed'), 'error');
    }
  };

  const toggle = (id, enable) => post(`/api/admin/plugins/${encodeURIComponent(id)}/${enable ? 'enable' : 'disable'}`);
  host.querySelectorAll('[data-plugin-enable]').forEach((b) => b.addEventListener('click', () => toggle(b.dataset.pluginEnable, true)));
  host.querySelectorAll('[data-plugin-disable]').forEach((b) => b.addEventListener('click', () => toggle(b.dataset.pluginDisable, false)));
  host.querySelectorAll('[data-plugin-pin]').forEach((b) => b.addEventListener('click', () => post(`/api/admin/plugins/${encodeURIComponent(b.dataset.pluginPin)}/pin`, null, t('admin.plugins.pinned_ok'))));
  host.querySelectorAll('[data-plugin-unpin]').forEach((b) => b.addEventListener('click', () => {
    const plugin = plugins.find((p) => p.id === b.dataset.pluginUnpin);
    if (plugin && plugin.allowlist_source === 'upload' && !window.confirm(t('admin.plugins.unpin_upload_confirm'))) return;
    post(`/api/admin/plugins/${encodeURIComponent(b.dataset.pluginUnpin)}/unpin`);
  }));
  host.querySelectorAll('[data-plugin-settings-form]').forEach((form) => {
    form.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const id = form.dataset.pluginSettingsForm;
      const plugin = plugins.find((p) => p.id === id);
      if (!plugin) return;
      const settings = readPluginFields(plugin.settings_fields || [], 'plugset_' + id + '_');
      try {
        const res = await fetch(`/api/admin/plugins/${encodeURIComponent(id)}/settings`, {
          method: 'PUT',
          headers: { ...headers, 'Content-Type': 'application/json' },
          body: JSON.stringify({ settings }),
        });
        if (!res.ok) throw new Error(localizeServerError((await res.json().catch(() => ({}))).error) || String(res.status));
        showToast(t('admin.plugins.settings_saved'), 'success');
        await loadPlugins();
      } catch (e) {
        showToast(e.uiMessage || e.message || t('admin.plugins.failed'), 'error');
      }
    });
  });
  if (subHost) {
    const approveOne = async (id) => {
      if (!window.confirm(t('admin.plugins.approve_confirm'))) return;
      try {
        const res = await fetch(`/api/admin/plugins/submissions/${id}/approve`, {
          method: 'POST',
          headers: { ...headers, 'Content-Type': 'application/json' },
          body: '{}',
        });
        if (res.status === 409) {
          const e = await res.json().catch(() => ({}));
          if (!window.confirm((e.error ? e.error + '\n\n' : '') + t('admin.plugins.replace_confirm'))) return;
          const res2 = await fetch(`/api/admin/plugins/submissions/${id}/approve`, {
            method: 'POST',
            headers: { ...headers, 'Content-Type': 'application/json' },
            body: JSON.stringify({ replace: true }),
          });
          if (!res2.ok) throw new Error(localizeServerError((await res2.json().catch(() => ({}))).error) || String(res2.status));
          showToast(t('admin.plugins.approved_ok'), 'success');
          await loadPlugins();
          return;
        }
        if (!res.ok) throw new Error(localizeServerError((await res.json().catch(() => ({}))).error) || String(res.status));
        showToast(t('admin.plugins.approved_ok'), 'success');
        await loadPlugins();
      } catch (e) {
        showToast(e.uiMessage || e.message || t('admin.plugins.failed'), 'error');
      }
    };
    subHost.querySelectorAll('[data-plugin-approve]').forEach((b) => b.addEventListener('click', () => approveOne(b.dataset.pluginApprove)));
    subHost.querySelectorAll('[data-plugin-reject]').forEach((b) => b.addEventListener('click', () => post(`/api/admin/plugins/submissions/${b.dataset.pluginReject}/reject`, { note: '' }, t('admin.plugins.rejected_ok'))));
    subHost.querySelectorAll('[data-plugin-inspect]').forEach((b) => b.addEventListener('click', async () => {
      const id = b.dataset.pluginInspect;
      const rel = b.dataset.pluginPath;
      const out = subHost.querySelector(`[data-plugin-inspect-out="${id}"]`);
      if (!out || !rel) return;
      try {
        const res = await fetch(`/api/admin/plugins/submissions/${id}/file?path=${encodeURIComponent(rel)}`, { headers });
        if (!res.ok) throw new Error(localizeServerError((await res.json().catch(() => ({}))).error) || String(res.status));
        const body = await res.json();
        out.style.display = '';
        bindMessage(out, body.binary ? t("ui.admin.value0_value1_bytes_binary_a4caec", {value0: rel, value1: body.size}) : (body.text || ''));
      } catch (e) {
        showToast(e.uiMessage || e.message || t('admin.plugins.failed'), 'error');
      }
    }));
  }

  const form = document.getElementById('pluginUploadForm');
  if (form && !form.dataset.bound) {
    form.dataset.bound = '1';
    form.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const input = document.getElementById('pluginZipInput');
      const file = input && input.files && input.files[0];
      if (!file) return;
      const fd = new FormData();
      fd.append('package', file, file.name);
      try {
        const res = await fetch('/api/admin/plugins/submissions', {
          method: 'POST',
          headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
          body: fd,
        });
        if (!res.ok) throw new Error(localizeServerError((await res.json().catch(() => ({}))).error) || String(res.status));
        showToast(t('admin.plugins.queued'), 'success');
        input.value = '';
        await loadPlugins();
      } catch (e) {
        showToast(e.uiMessage || e.message || t('admin.plugins.failed'), 'error');
      }
    });
  }
}

/*
 * Platform → Cleanup: stale customer accounts (server: lib/account-cleanup.js).
 *
 * Notice first, then delete: select → "Send notice" (emails "deleted on <date> unless you sign in")
 * → after the notice period, the accounts still silent are "Ready" → select → type "DELETE N".
 * The server re-checks every account at each step. Deleting without notice is an explicit override
 * with its own phrase. Nothing here decides what "stale" or "ready" means; the server does.
 */
async function mountCleanup(el, days = 180, lastResult = null, noticeDays = 14) {
  if (!el) return;
  el.innerHTML = `<p style="color:var(--text-muted)">${uiText(t('common.loading'))}</p>`;
  let data;
  try { data = await api.adminStaleAccounts(days); } catch (err) { el.innerHTML = `<p style="color:var(--danger)">${uiText((err.uiMessage || err.message))}</p>`; return; }
  const when = (sec) => (sec ? displayValue(new Date(sec * 1000), "toLocaleDateString", undefined) : t('platform.cleanup.never'));
  const noticeCell = (a) => {
    if (a.notice === 'ready') return `<span class="notice-pill notice-ready">${uiText(t('platform.cleanup.st_ready'))}</span>`;
    if (a.notice === 'notice') return `<span class="notice-pill notice-running">${uiText(t('platform.cleanup.st_notice', { date: when(a.cleanup_delete_after) }))}</span>`;
    return `<span class="notice-pill">${uiText(t('platform.cleanup.st_not_warned'))}</span>`;
  };
  const rows = data.accounts.map((a) => `
    <tr data-notice="${esc(a.notice)}">
      <td><input type="checkbox" class="cleanup-pick" value="${esc(a.id)}" data-notice="${esc(a.notice)}" aria-label="${esc(t('platform.cleanup.select', { email: a.email }))}" data-fil-i18n-aria-label="${binding('platform.cleanup.select', { email: a.email })}"></td>
      <td><div style="font-weight:500">${uiText(a.name || a.email)}</div><div style="font-size:11px;color:var(--text-muted)">${uiText(a.email)}</div></td>
      <td>${uiText(when(a.created_at))}</td>
      <td>${renderHTML(a.never_signed_in ? `<span class="cleanup-never">${uiText(t('platform.cleanup.never'))}</span>` : esc(when(a.last_login)))}<div style="font-size:11px;color:var(--text-muted)">${uiText(t('platform.cleanup.last_activity', { date: when(a.last_activity) }))}</div></td>
      <td>${uiText(String(a.workspaces))} · ${uiText(String(a.content_items))}${renderHTML(a.content_bytes ? ` <span style="color:var(--text-muted)">(${uiText(formatBytes(a.content_bytes))})</span>` : '')}</td>
      <td>${renderHTML(noticeCell(a))}</td>
    </tr>`).join('');
  const summary = lastResult ? `
    <div class="cleanup-summary">
      <strong>${uiText(lastResult.warned ? tn('platform.cleanup.warned_done', lastResult.warned.length) : tn('platform.cleanup.done', lastResult.deleted.length))}</strong>
      ${renderHTML(lastResult.files_removed ? ` · ${esc(t('platform.cleanup.freed', { n: lastResult.files_removed, size: formatBytes(lastResult.bytes_freed) }))}` : '')}
      ${renderHTML(lastResult.skipped.length ? `<div class="cleanup-skipped">${uiText(tn('platform.cleanup.skipped', lastResult.skipped.length))}<ul>${renderHTML(lastResult.skipped.map((k) => `<li>${uiText(k.email || k.id)}: ${uiText(k.reason)}</li>`).join(''))}</ul></div>` : '')}
    </div>` : '';
  el.innerHTML = `
    ${renderHTML(summary)}
    <div class="settings-section">
      <h3>${uiText(t('platform.cleanup.rules_title'))}</h3>
      <div class="cleanup-rules">
        <label>${uiText(t('platform.cleanup.inactive_for'))}
          <select class="input" id="cleanupDays">${renderHTML([30, 90, 180, 365].map((d) => `<option value="${d}" ${d === data.inactive_days ? 'selected' : ''}>${uiText(tn('platform.cleanup.days', d))}</option>`).join(''))}</select>
        </label>
        <label>${uiText(t('platform.cleanup.notice_period'))}
          <select class="input" id="cleanupNotice">${renderHTML([14, 30].map((d) => `<option value="${d}" ${d === noticeDays ? 'selected' : ''}>${uiText(tn('platform.cleanup.days', d))}</option>`).join(''))}</select>
        </label>
        <ul>
          <li>${uiText(tn('platform.cleanup.rule_login', data.inactive_days))}</li>
          <li>${uiText(t('platform.cleanup.rule_screens'))}</li>
          <li>${uiText(t('platform.cleanup.rule_paying'))}</li>
          <li>${uiText(t('platform.cleanup.rule_shared'))}</li>
          <li>${uiText(t('platform.cleanup.rule_staff'))}</li>
        </ul>
      </div>
      <ol class="cleanup-steps">
        <li>${uiText(t('platform.cleanup.step1'))}</li>
        <li>${uiText(t('platform.cleanup.step2'))}</li>
        <li>${uiText(t('platform.cleanup.step3'))}</li>
      </ol>
      ${renderHTML(data.email_configured ? '' : `<p class="cleanup-warn">${uiText(t('platform.cleanup.no_email'))}</p>`)}
    </div>
    <div class="settings-section">
      <div class="cleanup-head">
        <h3 style="margin:0">${renderHTML(tn('platform.cleanup.found', data.total))}${renderHTML(data.reclaimable_bytes ? ` <span class="cleanup-bytes">${uiText(t('platform.cleanup.reclaim', { size: formatBytes(data.reclaimable_bytes) }))}</span>` : '')}</h3>
        <span style="flex:1"></span>
        <button class="btn btn-secondary btn-sm" id="cleanupExport" ${data.total ? '' : 'disabled'}>${uiText(t('platform.cleanup.export'))}</button>
      </div>
      ${renderHTML(data.total ? `
      <div class="cleanup-filters">
        <button class="chip-btn" data-pick="not_warned">${uiText(tn('platform.cleanup.pick_not_warned', data.counts.not_warned))}</button>
        <button class="chip-btn" data-pick="notice">${uiText(tn('platform.cleanup.pick_notice', data.counts.notice))}</button>
        <button class="chip-btn chip-ready" data-pick="ready">${uiText(tn('platform.cleanup.pick_ready', data.counts.ready))}</button>
        <button class="chip-btn" data-pick="none">${uiText(t('platform.cleanup.pick_none'))}</button>
      </div>
      <div class="table-wrap"><table class="org-members-table cleanup-table">
        <thead><tr><th><input type="checkbox" id="cleanupAll" aria-label="${esc(t('platform.cleanup.select_all'))}" data-fil-i18n-aria-label="${binding('platform.cleanup.select_all', undefined)}"></th>
          <th>${uiText(t('platform.cleanup.col_account'))}</th><th>${uiText(t('platform.cleanup.col_created'))}</th><th>${uiText(t('platform.cleanup.col_last_login'))}</th>
          <th>${uiText(t('platform.cleanup.col_holdings'))}</th><th>${uiText(t('platform.cleanup.col_notice'))}</th></tr></thead>
        <tbody>${renderHTML(rows)}</tbody>
      </table></div>
      <div class="cleanup-actions">
        <button class="btn btn-primary btn-sm" id="cleanupWarn" disabled>${uiText(t('platform.cleanup.warn_selected'))}</button>
        <button class="btn btn-danger btn-sm" id="cleanupDelete" disabled>${uiText(t('platform.cleanup.delete_selected'))}</button>
        <label class="cleanup-override"><input type="checkbox" id="cleanupSkipNotice"> ${uiText(t('platform.cleanup.skip_notice'))}</label>
      </div>` : `<p class="platform-empty">${uiText(t('platform.cleanup.none'))}</p>`)}
      <p class="cleanup-note">${uiText(t('platform.cleanup.note'))}</p>
    </div>`;

  const reload = (result) => mountCleanup(el, data.inactive_days, result, noticeDays);
  el.querySelector('#cleanupDays').onchange = (e) => mountCleanup(el, parseInt(e.target.value, 10), null, noticeDays);
  el.querySelector('#cleanupNotice').onchange = (e) => { noticeDays = parseInt(e.target.value, 10); };
  el.querySelector('#cleanupExport').onclick = () => {
    const csvCell = (v) => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`;
    const lines = [['email', 'name', 'created', 'last_login', 'last_activity', 'workspaces', 'content_items', 'content_bytes', 'notice'].join(',')]
      .concat(data.accounts.map((a) => [a.email, a.name, when(a.created_at), a.never_signed_in ? 'never' : when(a.last_login), when(a.last_activity), a.workspaces, a.content_items, a.content_bytes, a.notice].map(csvCell).join(',')));
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/csv' }));
    link.download = `stale-accounts-${data.inactive_days}d-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  };
  if (!data.total) return;

  const boxes = [...el.querySelectorAll('.cleanup-pick')];
  const picked = () => boxes.filter((c) => c.checked);
  const warnBtn = el.querySelector('#cleanupWarn');
  const delBtn = el.querySelector('#cleanupDelete');
  const skip = el.querySelector('#cleanupSkipNotice');
  const sync = () => {
    const sel = picked();
    const toWarn = sel.filter((c) => c.dataset.notice === 'not_warned').length;
    const toDelete = skip.checked ? sel.length : sel.filter((c) => c.dataset.notice === 'ready').length;
    warnBtn.disabled = !toWarn || !data.email_configured;
    bindMessage(warnBtn, toWarn ? tn('platform.cleanup.warn_n', toWarn) : t('platform.cleanup.warn_selected'));
    delBtn.disabled = !toDelete;
    bindMessage(delBtn, toDelete ? tn(skip.checked ? 'platform.cleanup.delete_n_now' : 'platform.cleanup.delete_n', toDelete) : t('platform.cleanup.delete_selected'));
  };
  boxes.forEach((c) => { c.onchange = sync; });
  skip.onchange = sync;
  const all = el.querySelector('#cleanupAll');
  all.onchange = () => { boxes.forEach((c) => { c.checked = all.checked; }); sync(); };
  el.querySelectorAll('[data-pick]').forEach((b) => {
    b.onclick = () => { boxes.forEach((c) => { c.checked = b.dataset.pick !== 'none' && c.dataset.notice === b.dataset.pick; }); all.checked = false; sync(); };
  });

  warnBtn.onclick = () => {
    const ids = picked().filter((c) => c.dataset.notice === 'not_warned').map((c) => c.value);
    if (!ids.length) return;
    const phrase = `NOTIFY ${ids.length}`;
    openTypeToConfirmModal({
      title: tn('platform.cleanup.warn_title', ids.length),
      body: esc(tn('platform.cleanup.warn_body', noticeDays)),
      expected: phrase,
      confirmLabel: tn('platform.cleanup.warn_n', ids.length),
      onConfirm: async () => {
        const out = await api.adminWarnStale({ ids, days: data.inactive_days, notice_days: noticeDays });
        showToast(tn('platform.cleanup.warned_done', out.warned.length), 'success');
        reload(out);
      },
    });
  };

  delBtn.onclick = () => {
    const sel = picked();
    const ids = (skip.checked ? sel : sel.filter((c) => c.dataset.notice === 'ready')).map((c) => c.value);
    if (!ids.length) return;
    const phrase = skip.checked ? `DELETE ${ids.length} WITHOUT NOTICE` : `DELETE ${ids.length}`;
    openTypeToConfirmModal({
      title: tn('platform.cleanup.confirm_title', ids.length),
      body: esc(t(skip.checked ? 'platform.cleanup.confirm_body_now' : 'platform.cleanup.confirm_body')),
      expected: phrase,
      confirmLabel: tn(skip.checked ? 'platform.cleanup.delete_n_now' : 'platform.cleanup.delete_n', ids.length),
      onConfirm: async () => {
        const out = await api.adminPurgeStale({ ids, days: data.inactive_days, confirm: phrase, skip_notice: skip.checked });
        showToast(tn('platform.cleanup.done', out.deleted.length), 'success');
        reload(out);
      },
    });
  };
}

/* ── Player rollouts (server lib/ota-rollout.js) ─────────────────────────────────────────────── */
const ROLLOUT_ACTIONS = { rolling: ['pause', 'release', 'halt'], paused: ['resume', 'release', 'halt'], halted: ['clear'], complete: [], superseded: [] };
async function loadRollouts() {
  const host = document.getElementById('rolloutsBody');
  if (!host) return;
  let data;
  try { data = await api.get('/admin/ota-rollouts'); } catch (e) { host.innerHTML = `<p class="error">${uiText((e.uiMessage || e.message))}</p>`; return; }
  const rows = data.rollouts || [];
  host.innerHTML = `
    ${data.enabled ? '' : `<p style="color:#ca8a04;font-size:13px">${uiText(t('platform.rollouts.disabled'))}</p>`}
    ${rows.length ? `<div class="table-wrap"><table class="corp-table" style="min-width:640px"><thead><tr>
      <th>${uiText(t('platform.rollouts.col.player'))}</th><th>${uiText(t('platform.rollouts.col.status'))}</th>
      <th>${uiText(t('platform.rollouts.col.health'))}</th><th></th></tr></thead><tbody>
      ${renderHTML(rows.map((r) => `<tr>
        <td><strong>${uiText(t(`platform.rollouts.family.${r.family}`))} ${uiText(r.version)}</strong>
          <div class="corp-help">${renderHTML(t('platform.rollouts.started', { when: displayValue(new Date(r.started_at * 1000), "toLocaleString", undefined) }))}</div></td>
        <td>${renderHTML(t(`platform.rollouts.status.${r.status}`, { pct: r.wave_percent }))}
          ${renderHTML(r.status === 'halted' ? `<div style="font-size:12px;color:#dc2626;max-width:340px">${uiText(r.halted_reason || '')}</div>
            <div class="corp-help">${uiText(r.family === 'android' ? t('platform.rollouts.android_note') : r.can_roll_back ? t('platform.rollouts.rolled_back', { v: r.prev_version }) : t('platform.rollouts.no_prev'))}</div>` : '')}</td>
        <td style="font-size:12px">${renderHTML(r.health ? t('platform.rollouts.health', { updated: r.health.updated, bad: r.health.bad, size: r.health.family_size }) : '')}</td>
        <td style="white-space:nowrap">${renderHTML((ROLLOUT_ACTIONS[r.status] || []).map((a) => `<button class="btn btn-secondary btn-sm" data-ro="${esc(r.family)}|${esc(r.version)}|${a}" style="margin:2px">${uiText(t(`platform.rollouts.act.${a}`))}</button>`).join(''))}</td>
      </tr>`).join(''))}</tbody></table></div>` : `<div class="corp-empty">${uiText(t('platform.rollouts.empty'))}</div>`}`;
  host.querySelectorAll('[data-ro]').forEach((b) => b.addEventListener('click', async () => {
    const [family, version, action] = b.dataset.ro.split('|');
    if ((action === 'halt' || action === 'release') && !confirm(t(`platform.rollouts.confirm.${action}`, { v: version }))) return;
    try { await api.post(`/admin/ota-rollouts/${encodeURIComponent(family)}/${encodeURIComponent(version)}/${action}`, {}); showToast(t('platform.rollouts.done'), 'success'); loadRollouts(); }
    catch (e) { showToast(e.uiMessage || e.message, 'error'); }
  }));
}
