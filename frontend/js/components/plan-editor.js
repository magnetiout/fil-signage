import {errorMessage} from '../api.js';
import { uiText, renderHTML, bindMessage } from '../lib/i18n-bindings.js';

// Edit or create a plan (platform admin → Billing → Plans). Server: lib/plan-admin.js.
//
// ⚠️ Checkout charges the Stripe Price linked to the plan, not the figure typed here. So prices are
// created in Stripe and linked by id, and the server refuses a save while a shown price and its linked
// Price disagree; the refusal is shown next to the field it is about. Limits and features apply to
// every account on the plan as soon as the plan is saved, so the dialog says how many first.

import { api } from '../api.js';
import { esc } from '../utils.js';
import { displayList, displayQuantity, message as t } from '../i18n.js';
import { showToast } from './toast.js';
import { openDialog, confirmDialog } from './library/dialog.js';

const LIMIT_FIELDS = ['max_devices', 'max_storage_mb'];

function fieldHtml(id, label, value, { type = 'text', help = '', attrs = '', prefix = '' } = {}) {
  return `<div class="lib-field">
    <label for="${id}">${uiText(label)}</label>
    <div class="plan-input${prefix ? ' has-prefix' : ''}">${renderHTML(prefix ? `<span class="plan-prefix" aria-hidden="true">${uiText(prefix)}</span>` : '')}
      <input id="${id}" class="input" type="${type}" value="${esc(value == null ? '' : value)}" ${attrs} aria-describedby="${id}-help ${id}-err">
    </div>
    <div class="lib-field-help" id="${id}-help">${renderHTML(help)}</div>
    <div class="lib-field-err" id="${id}-err" role="alert"></div>
  </div>`;
}

function limitHtml(id, label, value, unit) {
  const unlimited = value === -1;
  return `<div class="lib-field">
    <label for="${id}">${uiText(label)}</label>
    <div class="plan-limit">
      <input id="${id}" class="input" type="number" min="0" step="1" inputmode="numeric" value="${unlimited ? '' : esc(value)}" ${unlimited ? 'disabled' : ''} aria-describedby="${id}-help ${id}-err">
      <span class="plan-unit">${uiText(unit)}</span>
      <label class="lib-check-label"><input type="checkbox" id="${id}Unl" ${unlimited ? 'checked' : ''}> ${uiText(t('admin.plan.unlimited'))}</label>
    </div>
    <div class="lib-field-help" id="${id}-help"></div>
    <div class="lib-field-err" id="${id}-err" role="alert"></div>
  </div>`;
}

/**
 * opts: { plan (row, or null to create), stripeConfigured, onSaved(plan) }
 */
export async function openPlanEditor({ plan = null, stripeConfigured = false, onSaved } = {}) {
  const creating = !plan;
  const p = plan || { id: '', display_name: '', max_devices: 1, max_storage_mb: 500, remote_control: 0, remote_url: 0, priority_support: 0, price_monthly: 0, price_yearly: 0, stripe_price_monthly: null, stripe_price_yearly: null, active: 0, sort_order: '' };
  const isFree = p.id === 'free';
  let impact = null;
  if (!creating) { try { impact = await api.adminPlanImpact(p.id); } catch (_) { impact = null; } }

  const d = openDialog({
    title: creating ? t('admin.plan.new_title') : t('admin.plan.edit_title', { name: p.display_name }),
    size: 'lg',
    html: `<form novalidate data-form class="plan-form">
      ${renderHTML(impact && impact.accounts ? `<p class="lib-requirement">${uiText(t('admin.plan.impact', { accounts: impact.accounts, subscribers: impact.subscribers }))}</p>` : '')}
      <div class="plan-grid">
        ${renderHTML(creating ? fieldHtml('planId', t('admin.plan.id'), '', { help: t('admin.plan.id_help'), attrs: 'autocomplete="off" maxlength="32"' }) : `<div class="lib-field"><span class="lib-label">${uiText(t('admin.plan.id'))}</span><code class="plan-id">${uiText(p.id)}</code></div>`)}
        ${renderHTML(fieldHtml('planName', t('admin.plan.name'), p.display_name, { attrs: 'maxlength="60" autocomplete="off"' }))}
      </div>
      <fieldset class="plan-section"><legend>${uiText(t('admin.plan.limits'))}</legend>
        <div class="plan-grid">
          ${renderHTML(limitHtml('planDevices', t('admin.plan.screens'), p.max_devices, t('admin.plan.screens_unit')))}
          ${renderHTML(limitHtml('planStorage', t('admin.plan.storage'), p.max_storage_mb, 'MB'))}
        </div>
      </fieldset>
      <fieldset class="plan-section"><legend>${uiText(t('admin.plan.features'))}</legend>
        <label class="lib-check-label"><input type="checkbox" id="planRemoteControl" ${p.remote_control ? 'checked' : ''}> ${uiText(t('admin.plan.remote_control'))}</label>
        <label class="lib-check-label"><input type="checkbox" id="planRemoteUrl" ${p.remote_url ? 'checked' : ''}> ${uiText(t('admin.plan.remote_url'))}</label>
        <label class="lib-check-label"><input type="checkbox" id="planPriority" ${p.priority_support ? 'checked' : ''}> ${uiText(t('admin.plan.priority'))}</label>
      </fieldset>
      <fieldset class="plan-section"><legend>${uiText(t('admin.plan.pricing'))}</legend>
        ${renderHTML(isFree ? `<p class="lib-field-help">${uiText(t('admin.plan.free_note'))}</p>` : `
        <p class="lib-field-help">${uiText(t('admin.plan.pricing_help'))}</p>
        ${renderHTML(stripeConfigured ? '' : `<p class="lib-requirement">${uiText(t('admin.plan.no_stripe'))}</p>`)}
        <div class="plan-grid">
          ${renderHTML(fieldHtml('planMonthly', t('admin.plan.monthly'), p.price_monthly, { type: 'number', prefix: '$', attrs: 'min="0" step="0.01" inputmode="decimal"' }))}
          ${renderHTML(fieldHtml('planStripeMonthly', t('admin.plan.stripe_monthly'), p.stripe_price_monthly || '', { attrs: 'autocomplete="off" spellcheck="false" placeholder="price_…"' }))}
          ${renderHTML(fieldHtml('planYearly', t('admin.plan.yearly'), p.price_yearly, { type: 'number', prefix: '$', attrs: 'min="0" step="0.01" inputmode="decimal"' }))}
          ${renderHTML(fieldHtml('planStripeYearly', t('admin.plan.stripe_yearly'), p.stripe_price_yearly || '', { attrs: 'autocomplete="off" spellcheck="false" placeholder="price_…"' }))}
        </div>
        ${renderHTML(!creating && impact && impact.subscribers ? `<p class="lib-field-help">${uiText(t('admin.plan.subscribers_keep', { count: impact.subscribers }))}</p>` : '')}`)}
      </fieldset>
      <fieldset class="plan-section"><legend>${uiText(t('admin.plan.visibility'))}</legend>
        <label class="lib-check-label"><input type="checkbox" id="planActive" ${p.active ? 'checked' : ''}> ${uiText(t('admin.plan.active'))}</label>
        <p class="lib-field-help">${uiText(t('admin.plan.active_help'))}</p>
        <div class="plan-grid">${renderHTML(fieldHtml('planOrder', t('admin.plan.order'), p.sort_order, { type: 'number', attrs: 'min="0" step="1" inputmode="numeric"', help: t('admin.plan.order_help') }))}</div>
      </fieldset>
      <div class="lib-dialog-actions">
        <span class="lib-form-error" role="alert" data-form-error></span>
        <button type="button" class="btn btn-secondary" data-cancel>${uiText(t('common.cancel'))}</button>
        <button type="submit" class="btn btn-primary" data-submit>${uiText(creating ? t('admin.plan.create') : t('common.save'))}</button>
      </div>
    </form>`,
    initialFocus: creating ? '#planId' : '#planName',
  });
  const $ = (s) => d.root.querySelector(s);

  // Unlimited switches the number off (and back on with the last value).
  for (const id of ['planDevices', 'planStorage']) {
    const box = $(`#${id}Unl`), input = $(`#${id}`);
    box.addEventListener('change', () => { input.disabled = box.checked; if (!box.checked) input.focus(); });
  }
  const storageHelp = () => {
    const v = Number($('#planStorage').value);
    bindMessage($('#planStorage-help'), !$('#planStorageUnl').checked && v >= 1024 ? displayList(['= ',displayQuantity(v / 1024,'GB',v % 1024 ? 1 : 0)],'') : '');
  };
  $('#planStorage').addEventListener('input', storageHelp);
  storageHelp();

  const read = () => {
    const num = (sel) => { const v = $(sel); return v && v.value !== '' ? Number(v.value) : null; };
    const out = {
      display_name: $('#planName').value.trim(),
      max_devices: $('#planDevicesUnl').checked ? -1 : num('#planDevices'),
      max_storage_mb: $('#planStorageUnl').checked ? -1 : num('#planStorage'),
      remote_control: $('#planRemoteControl').checked ? 1 : 0,
      remote_url: $('#planRemoteUrl').checked ? 1 : 0,
      priority_support: $('#planPriority').checked ? 1 : 0,
      active: $('#planActive').checked ? 1 : 0,
    };
    if (num('#planOrder') !== null) out.sort_order = num('#planOrder');
    if (!isFree) {
      out.price_monthly = num('#planMonthly') ?? 0;
      out.price_yearly = num('#planYearly') ?? 0;
      out.stripe_price_monthly = $('#planStripeMonthly').value.trim() || null;
      out.stripe_price_yearly = $('#planStripeYearly').value.trim() || null;
    }
    return out;
  };
  const ID_OF = { display_name: 'planName', max_devices: 'planDevices', max_storage_mb: 'planStorage', price_monthly: 'planMonthly', price_yearly: 'planYearly', stripe_price_monthly: 'planStripeMonthly', stripe_price_yearly: 'planStripeYearly', sort_order: 'planOrder', id: 'planId' };
  const clearErrors = () => d.root.querySelectorAll('.lib-field-err').forEach((e) => { bindMessage(e, ''); });
  const showError = (field, msg) => {
    const id = ID_OF[field];
    const el = id && $(`#${id}-err`);
    if (el) { bindMessage(el, msg); const input = $(`#${id}`); if (input) { input.setAttribute('aria-invalid', 'true'); if (!input.disabled) input.focus(); } }
    else bindMessage($('[data-form-error]'), msg);
  };

  $('[data-cancel]').addEventListener('click', () => d.close());
  $('[data-form]').addEventListener('submit', async (e) => {
    e.preventDefault();
    clearErrors();
    bindMessage($('[data-form-error]'), '');
    const values = read();
    if (!values.display_name) { showError('display_name', t('admin.plan.err_name')); return; }
    for (const f of LIMIT_FIELDS) if (values[f] === null) { showError(f, t('admin.plan.err_limit')); return; }

    // Only what changed goes to the server, so a field nobody touched is never re-checked or rewritten.
    let body = values;
    if (!creating) {
      body = {};
      for (const [k, v] of Object.entries(values)) if (String(v ?? '') !== String(p[k] ?? '')) body[k] = v;
      if (!Object.keys(body).length) { d.close(); return; }
      // Lowering a limit takes it away from people now.
      const lowered = LIMIT_FIELDS.some((f) => {
        if (body[f] === undefined || body[f] === -1) return false;   // unchanged, or now unlimited
        return p[f] === -1 || body[f] < p[f];                          // was unlimited, or is now less
      });
      if (lowered && impact && impact.accounts) {
        const ok = await confirmDialog({
          title: t('admin.plan.lower_title'),
          bodyHtml: esc(t('admin.plan.lower_text', { count: impact.accounts })),
          confirmLabel: t('admin.plan.lower_yes'),
        });
        if (!ok) return;
      }
    } else {
      body.id = $('#planId').value.trim();
    }
    const btn = $('[data-submit]');
    btn.disabled = true;
    try {
      const r = creating ? await api.adminCreatePlan(body) : await api.adminUpdatePlan(p.id, body);
      for (const w of (r.warnings || [])) showToast(t(w === 'Stripe is not configured on this server, so the linked prices were saved without being checked.' ? 'admin.plan.prices_unchecked' : 'admin.plan.server_warning'), 'info', 7000);
      showToast(creating ? t('admin.plan.created', { name: r.plan.display_name }) : t('admin.plan.saved', { name: r.plan.display_name }), 'success');
      d.close();
      if (onSaved) onSaved(r.plan);
    } catch (err) {
      showError(err.body && err.body.field, errorMessage(err));
      btn.disabled = false;
    }
  });
  return d;
}
