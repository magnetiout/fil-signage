import { attributeBinding } from '../lib/i18n-bindings.js';
import { uiText, renderHTML, bindMessage, binding, bindText } from '../lib/i18n-bindings.js';

// Dynamic group rules editor (server: lib/device-group-rules.js). A group with rules fills itself
// with every screen that matches, and keeps doing so as tags change. Modelled on the smart
// playlist editor (components/smart-rules.js) so the two read the same, with a live preview of
// which screens the rules select before anything is saved.

import { api } from '../api.js';
import { esc } from '../utils.js';
import { message as t } from '../i18n.js';

const FIELD_OPS = {
  tag: ['has', 'lacks'],
  name: ['contains', 'starts_with', 'eq'],
  platform: ['eq', 'neq'],
  timezone: ['eq', 'neq'],
};
const DEFAULT = { match: 'all', rules: [{ field: 'tag', op: 'has', value: '' }] };

/** One-line summary for the group header, e.g. "tag is lobby and name contains north". */
export function groupRulesSummary(rules) {
  if (!rules || !Array.isArray(rules.rules) || !rules.rules.length) return '';
  return rules.rules
    .map((r) => t(`grouprules.sum.${r.field}.${r.op}`, { value: String(r.value == null ? '' : r.value) }))
    .join(rules.match === 'any' ? ` ${t('smart.or')} ` : ` ${t('smart.and')} `);
}

let modalOpen = false;

/**
 * `onSave(rules|null)` must return a promise: null turns the rules off (the group keeps its current
 * screens and becomes hand-built). The modal closes when it resolves and shows the error otherwise.
 */
export function openGroupRulesModal({ group, onSave }) {
  if (modalOpen) return;
  modalOpen = true;
  const hadRules = !!(group.rules && group.rules.rules && group.rules.rules.length);
  const state = JSON.parse(JSON.stringify(hadRules ? group.rules : DEFAULT));

  const modal = document.createElement('div');
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;z-index:1000;padding:16px';
  modal.innerHTML = `
    <div role="dialog" aria-modal="true" style="background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius-lg);padding:24px;width:640px;max-width:100%;max-height:90vh;overflow:auto">
      <h3 style="margin-bottom:6px;color:var(--text-primary)">${uiText(t('grouprules.title', { name: group.name }))}</h3>
      <p style="font-size:13px;color:var(--text-muted);margin-bottom:16px">${renderHTML(t('grouprules.intro'))}</p>
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;font-size:13px;color:var(--text-secondary)">
        ${renderHTML(t('grouprules.rule_match_label'))}
        <select id="grMatch" aria-label="${esc(t('grouprules.rule_match_label'))}"${attributeBinding("aria-label",t('grouprules.rule_match_label'))} class="input" style="width:auto">
          <option value="all">${renderHTML(t('smart.match_mode_all'))}</option>
          <option value="any">${renderHTML(t('smart.match_mode_any'))}</option>
        </select>
      </div>
      <div id="grRules" style="display:flex;flex-direction:column;gap:8px;margin-bottom:8px"></div>
      <button class="btn btn-secondary btn-sm" id="grAdd">${renderHTML(t('smart.add_rule'))}</button>
      <div style="background:var(--bg-input);border-radius:var(--radius);padding:12px;margin:16px 0 12px">
        <div id="grCount" style="font-size:13px;font-weight:600;color:var(--text-primary);margin-bottom:6px"></div>
        <div id="grPreview" style="font-size:12px;color:var(--text-muted);max-height:140px;overflow:auto"></div>
      </div>
      <p style="font-size:12px;color:var(--text-muted);margin-bottom:8px">${renderHTML(t('grouprules.wall_note'))}</p>
      <div id="grError" style="color:var(--danger);font-size:13px;min-height:18px;margin-bottom:8px"></div>
      <div style="display:flex;gap:8px;justify-content:space-between;flex-wrap:wrap">
        <div>${renderHTML(hadRules ? `<button class="btn btn-secondary" id="grOff">${renderHTML(t('grouprules.turn_off'))}</button>` : '')}</div>
        <div style="display:flex;gap:8px">
          <button class="btn btn-secondary" id="grCancel">${renderHTML(t('common.cancel'))}</button>
          <button class="btn btn-primary" id="grSave">${renderHTML(t('grouprules.save'))}</button>
        </div>
      </div>
    </div>`;
  document.body.appendChild(modal);
  const $ = (id) => modal.querySelector('#' + id);
  const close = () => { modal.remove(); modalOpen = false; };
  $('grMatch').value = state.match === 'any' ? 'any' : 'all';

  function paintRules() {
    $('grRules').innerHTML = state.rules.map((r, i) => `
      <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">
        <select class="input gr-field" data-i="${i}" style="width:auto">
          ${renderHTML(Object.keys(FIELD_OPS).map((f) => `<option value="${f}" ${r.field === f ? 'selected' : ''}>${renderHTML(t(`grouprules.field.${f}`))}</option>`).join(''))}
        </select>
        <select class="input gr-op" data-i="${i}" style="width:auto">
          ${renderHTML(FIELD_OPS[r.field].map((op) => `<option value="${op}" ${r.op === op ? 'selected' : ''}>${renderHTML(t(`grouprules.op.${op}`))}</option>`).join(''))}
        </select>
        <input class="input gr-value" data-i="${i}" value="${esc(r.value || '')}" placeholder="${esc(t(`grouprules.ph.${r.field}`))}" data-fil-i18n-placeholder="${binding(`grouprules.ph.${r.field}`, undefined)}" style="flex:1">
        <button class="btn btn-secondary btn-sm gr-del" data-i="${i}" title="${esc(t('smart.remove_rule'))}" data-fil-i18n-title="${binding('smart.remove_rule', undefined)}" ${state.rules.length < 2 ? 'disabled' : ''}>✕</button>
      </div>`).join('');
  }

  function collect() {
    return {
      match: $('grMatch').value,
      rules: state.rules.map((r) => {
        let v = String(r.value || '').trim();
        // Tags are shown as "#lobby", so people type the '#'. Stored tags never have one.
        if (r.field === 'tag') v = v.replace(/^#+/, '').toLowerCase();
        return { field: r.field, op: r.op, value: v };
      }),
    };
  }
  const incomplete = (rules) => rules.rules.some((r) => !r.value);

  let timer = null;
  let seq = 0;
  function schedulePreview() {
    clearTimeout(timer);
    timer = setTimeout(async () => {
      const rules = collect();
      const mine = ++seq;
      bindMessage($('grError'), '');
      if (incomplete(rules)) { bindText($('grCount'), 'smart.preview_incomplete', undefined); $('grPreview').innerHTML = ''; return; }
      try {
        const r = await api.groupRulesPreview(rules);
        if (mine !== seq) return;
        bindText($('grCount'), 'grouprules.preview_count', undefined, r.devices.length);
        $('grPreview').innerHTML = r.devices.length
          ? r.devices.map((d) => `<div style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${uiText(d.name || d.id)}</div>`).join('')
          : `<div>${renderHTML(t('grouprules.preview_none'))}</div>`;
      } catch (err) {
        if (mine !== seq) return;
        bindMessage($('grCount'), '');
        bindMessage($('grError'), (err.uiMessage || err.message));
      }
    }, 250);
  }

  modal.addEventListener('change', (e) => {
    const i = Number(e.target.dataset.i);
    if (e.target.classList.contains('gr-field')) {
      state.rules[i] = { field: e.target.value, op: FIELD_OPS[e.target.value][0], value: '' };
      paintRules();
    } else if (e.target.classList.contains('gr-op')) {
      state.rules[i].op = e.target.value;
    }
    schedulePreview();
  });
  modal.addEventListener('input', (e) => {
    if (!e.target.classList.contains('gr-value')) return;
    state.rules[Number(e.target.dataset.i)].value = e.target.value;
    schedulePreview();
  });
  let downOnBackdrop = false;
  modal.addEventListener('mousedown', (e) => { downOnBackdrop = e.target === modal; });
  modal.addEventListener('click', (e) => {
    if (e.target === modal) { if (downOnBackdrop) close(); return; }
    const del = e.target.closest('.gr-del');
    if (del && state.rules.length > 1) {
      state.rules.splice(Number(del.dataset.i), 1);
      paintRules();
      schedulePreview();
    }
  });
  $('grAdd').addEventListener('click', () => {
    if (state.rules.length >= 20) return;
    state.rules.push({ field: 'tag', op: 'has', value: '' });
    paintRules();
    schedulePreview();
  });
  $('grCancel').addEventListener('click', close);

  async function save(rules, btn) {
    btn.disabled = true;
    try { await onSave(rules); close(); } catch (err) { bindMessage($('grError'), (err.uiMessage || err.message)); btn.disabled = false; }
  }
  $('grSave').addEventListener('click', () => {
    const rules = collect();
    if (incomplete(rules)) { bindText($('grError'), 'smart.preview_incomplete', undefined); return; }
    save(rules, $('grSave'));
  });
  if (hadRules) $('grOff').addEventListener('click', () => save(null, $('grOff')));

  paintRules();
  schedulePreview();
}
