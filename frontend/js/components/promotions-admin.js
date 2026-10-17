import { uiText, renderHTML, bindMessage, binding } from '../lib/i18n-bindings.js';

import { displayValue, message as t } from '../i18n.js';

/*
 * Admin → Sales & discounts (server: lib/promotions.js, routes/admin.js /promotions).
 *
 * A sale is a percentage off chosen plans for a time window. Creating one creates a Stripe coupon,
 * and checkout applies it — so what this form previews is what customers will actually be charged.
 *
 * The same form edits an existing sale (PUT /promotions/:id). Live and scheduled sales can change
 * anything; a finished one keeps its terms (they are a record of what customers were offered) unless
 * it is given new dates, which runs it again. Delete is for sales that are not running.
 */
import { api, localizeServerError } from '../api.js';
import { esc } from '../utils.js';

import { showToast } from './toast.js';

const pad = (n) => String(n).padStart(2, '0');
// <input type="datetime-local"> speaks local wall time without a zone.
const toLocalInput = (sec) => { const d = new Date(sec * 1000); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const fromLocalInput = (v) => (v ? Math.floor(new Date(v).getTime() / 1000) : null);
const when = (sec) => (sec ? displayValue(new Date(sec * 1000), "toLocaleString", undefined) : '—');
const money = (n) => '$' + displayValue(Number(n), "toLocaleString", { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 });
const sale = (price, pct) => Math.round(Number(price) * (100 - pct)) / 100;

function statusOf(p, now) {
  if (p.ended_at) return ['ended', t('admin.promo.status_ended')];
  if (p.ends_at && p.ends_at <= now) return ['ended', t('admin.promo.status_expired')];
  if (p.starts_at > now) return ['scheduled', t('admin.promo.status_scheduled')];
  return ['live', t('admin.promo.status_live')];
}

function durationText(p) {
  if (p.duration === 'forever') return t('admin.promo.dur_forever');
  if (p.duration === 'repeating') return t('admin.promo.dur_repeating', { n: p.duration_in_months });
  return t('admin.promo.dur_once');
}

export async function mountPromotionsAdmin(el, editId = null) {
  let data;
  let plans;
  try {
    [data, { plans }] = await Promise.all([api.adminListPromotions(), api.adminListPlans()]);
  } catch (err) {
    el.innerHTML = `<p style="color:var(--danger)">${uiText((err.uiMessage || err.message))}</p>`;
    return;
  }
  const paid = plans.filter((p) => p.active && p.price_monthly > 0);
  const now = Math.floor(Date.now() / 1000);
  const planName = (id) => (plans.find((p) => p.id === id) || {}).display_name || id;
  const editing = editId ? data.promotions.find((p) => p.id === editId) || null : null;
  const finished = editing && statusOf(editing, now)[0] === 'ended';
  const f = editing || { percent_off: 20, cycles: 'both', duration: 'once', duration_in_months: 3, starts_at: now, ends_at: now + 7 * 86400, plan_ids: [] };
  const sel = (v, cur) => (v === cur ? ' selected' : '');
  const planOn = (id) => !f.plan_ids.length || f.plan_ids.includes(id);

  el.innerHTML = `
    ${renderHTML(data.unavailable_reason ? `<p class="promo-warn">${uiText(localizeServerError(data.unavailable_reason))}</p>` : '')}
    <div class="promo-list">
      ${renderHTML(data.promotions.length ? data.promotions.map((p) => {
        const [cls, label] = statusOf(p, now);
        return `<div class="promo-row">
          <span class="promo-status promo-${cls}">${uiText(label)}</span>
          <div class="promo-main">
            <strong>${uiText(p.name)}</strong> · ${renderHTML(p.percent_off)}% ${renderHTML(t('admin.promo.off'))} · ${uiText(durationText(p))}
            <div class="promo-sub">“${uiText(p.headline)}” · ${uiText(p.plan_ids.length ? p.plan_ids.map(planName).join(', ') : t('admin.promo.all_plans'))} · ${uiText(t(`admin.promo.cycle_${p.cycles}`))}</div>
            <div class="promo-sub">${uiText(when(p.starts_at))} → ${uiText(p.ends_at ? when(p.ends_at) : t('admin.promo.no_end'))}${renderHTML(p.ended_at ? ` · ${esc(t('admin.promo.ended_at', { at: when(p.ended_at) }))}` : '')}</div>
          </div>
          <div class="promo-actions">
            <button class="btn btn-sm btn-secondary" data-edit="${esc(p.id)}">${uiText(t('admin.promo.edit'))}</button>
            ${renderHTML(cls === 'live'
              ? `<button class="btn btn-sm btn-danger" data-end="${esc(p.id)}">${uiText(t('admin.promo.end_now'))}</button>`
              : `<button class="btn btn-sm btn-danger" data-delete="${esc(p.id)}" data-name="${esc(p.name)}">${uiText(t('admin.promo.delete'))}</button>`)}
          </div>
        </div>`;
      }).join('') : `<p style="color:var(--text-muted);font-size:13px">${uiText(t('admin.promo.none'))}</p>`)}
    </div>
    <details class="promo-new" ${data.promotions.length && !editing ? '' : 'open'}>
      <summary>${uiText(editing ? t('admin.promo.editing', { name: editing.name }) : t('admin.promo.new'))}</summary>
      <div class="promo-form">
        ${renderHTML(finished ? `<p class="promo-warn">${uiText(t('admin.promo.edit_finished'))}</p>` : '')}
        ${renderHTML(editing && !finished ? `<p class="promo-note">${uiText(t('admin.promo.edit_note'))}</p>` : '')}
        <label>${uiText(t('admin.promo.name'))}<input class="input" id="pmName" maxlength="80" placeholder="${esc(t('admin.promo.name_ph'))}" data-fil-i18n-placeholder="${binding('admin.promo.name_ph', undefined)}" value="${esc(f.name || '')}"></label>
        <label>${uiText(t('admin.promo.headline'))}<input class="input" id="pmHeadline" maxlength="120" placeholder="${esc(t('admin.promo.headline_ph'))}" data-fil-i18n-placeholder="${binding('admin.promo.headline_ph', undefined)}" value="${esc(f.headline || '')}"></label>
        <div class="promo-grid">
          <label>${uiText(t('admin.promo.percent'))}<input class="input" id="pmPct" type="number" min="1" max="90" step="1" value="${f.percent_off}"></label>
          <label>${uiText(t('admin.promo.cycles'))}<select class="input" id="pmCycles">
            <option value="both"${sel('both', f.cycles)}>${uiText(t('admin.promo.cycle_both'))}</option>
            <option value="yearly"${sel('yearly', f.cycles)}>${uiText(t('admin.promo.cycle_yearly'))}</option>
            <option value="monthly"${sel('monthly', f.cycles)}>${uiText(t('admin.promo.cycle_monthly'))}</option></select></label>
          <label>${uiText(t('admin.promo.duration'))}<select class="input" id="pmDuration">
            <option value="once"${sel('once', f.duration)}>${uiText(t('admin.promo.dur_once'))}</option>
            <option value="repeating"${sel('repeating', f.duration)}>${uiText(t('admin.promo.dur_repeating_pick'))}</option>
            <option value="forever"${sel('forever', f.duration)}>${uiText(t('admin.promo.dur_forever'))}</option></select></label>
          <label id="pmMonthsWrap" hidden>${uiText(t('admin.promo.months'))}<input class="input" id="pmMonths" type="number" min="1" max="36" value="${f.duration_in_months || 3}"></label>
          <label>${uiText(t('admin.promo.starts'))}<input class="input" id="pmStarts" type="datetime-local" value="${toLocalInput(f.starts_at)}"></label>
          <label>${uiText(t('admin.promo.ends'))}<input class="input" id="pmEnds" type="datetime-local" value="${f.ends_at ? toLocalInput(f.ends_at) : ''}"></label>
        </div>
        <fieldset class="promo-plans"><legend>${uiText(t('admin.promo.plans'))}</legend>
          ${renderHTML(paid.map((p) => `<label><input type="checkbox" value="${esc(p.id)}"${planOn(p.id) ? ' checked' : ''}> ${uiText(p.display_name)}</label>`).join(''))}
        </fieldset>
        <div class="promo-preview" id="pmPreview" aria-live="polite"></div>
        <p class="promo-note">${uiText(t('admin.promo.note'))}</p>
        <div class="promo-actions">
          <button class="btn btn-primary" id="pmCreate" ${data.unavailable_reason && !editing ? 'disabled' : ''}>${uiText(editing ? t('admin.promo.save') : t('admin.promo.create'))}</button>
          ${renderHTML(editing ? `<button class="btn btn-secondary" id="pmStopEdit">${uiText(t('admin.promo.stop_edit'))}</button>` : '')}
        </div>
      </div>
    </details>`;

  const $ = (s) => el.querySelector(s);
  // The picker shows minutes. An untouched field sends the stored time to the second, so opening a
  // sale and saving it unchanged is not read as new dates (which would re-run a finished sale).
  const keepSeconds = (v, orig) => (editing && orig && v === toLocalInput(orig) ? orig : fromLocalInput(v));
  const read = () => {
    const planIds = [...el.querySelectorAll('.promo-plans input:checked')].map((i) => i.value);
    const body = {
      name: $('#pmName').value.trim(),
      headline: $('#pmHeadline').value.trim(),
      percent_off: parseInt($('#pmPct').value, 10),
      cycles: $('#pmCycles').value,
      duration: $('#pmDuration').value,
      plan_ids: planIds.length === paid.length ? [] : planIds, // all ticked = every plan, including ones added later
      starts_at: keepSeconds($('#pmStarts').value, f.starts_at),
      ends_at: keepSeconds($('#pmEnds').value, f.ends_at),
    };
    if (body.duration === 'repeating') body.duration_in_months = parseInt($('#pmMonths').value, 10);
    return { body, planIds };
  };
  const preview = () => {
    $('#pmMonthsWrap').hidden = $('#pmDuration').value !== 'repeating';
    const { body, planIds } = read();
    const pct = body.percent_off;
    if (!(pct >= 1 && pct <= 90)) { bindMessage($('#pmPreview'), ''); return; }
    const rows = paid.filter((p) => planIds.includes(p.id)).map((p) => {
      const parts = [];
      if (body.cycles !== 'yearly') parts.push(`${renderHTML(money(p.price_monthly))} → <b>${renderHTML(money(sale(p.price_monthly, pct)))}</b>${renderHTML(t('ui.common.per_month'))}`);
      if (body.cycles !== 'monthly' && p.price_yearly > 0) parts.push(`${renderHTML(money(p.price_yearly))} → <b>${renderHTML(money(sale(p.price_yearly, pct)))}</b>${renderHTML(t('ui.common.per_year'))}`);
      return `<div><span>${uiText(p.display_name)}</span> ${renderHTML(parts.join(' · '))}</div>`;
    });
    $('#pmPreview').innerHTML = rows.length ? `<div class="promo-preview-h">${uiText(t('admin.promo.preview'))}</div>${renderHTML(rows.join(''))}` : '';
  };
  el.querySelectorAll('.promo-form input, .promo-form select').forEach((i) => { i.oninput = preview; i.onchange = preview; });
  preview();

  $('#pmCreate').onclick = async () => {
    const btn = $('#pmCreate');
    btn.disabled = true;
    try {
      if (editing) {
        const r = await api.adminUpdatePromotion(editing.id, read().body);
        showToast(r.stripe_warning ? t('admin.promo.saved_warn', { w: r.stripe_warning }) : t('admin.promo.saved'), r.stripe_warning ? 'warning' : 'success');
      } else {
        await api.adminCreatePromotion(read().body);
        showToast(t('admin.promo.created'), 'success');
      }
      await mountPromotionsAdmin(el);
    } catch (err) {
      showToast(err.uiMessage || err.message, 'error');
      btn.disabled = false;
    }
  };
  if (editing) $('#pmStopEdit').onclick = () => mountPromotionsAdmin(el);
  el.querySelectorAll('[data-edit]').forEach((b) => {
    b.onclick = async () => {
      await mountPromotionsAdmin(el, b.dataset.edit);
      el.querySelector('.promo-new')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };
  });
  el.querySelectorAll('[data-delete]').forEach((b) => {
    b.onclick = async () => {
      if (!confirm(t('admin.promo.confirm_delete', { name: b.dataset.name }))) return;
      b.disabled = true;
      try {
        const r = await api.adminDeletePromotion(b.dataset.delete);
        showToast(r.stripe_warning ? t('admin.promo.deleted_warn', { w: r.stripe_warning }) : t('admin.promo.deleted'), r.stripe_warning ? 'warning' : 'success');
        await mountPromotionsAdmin(el, editId === b.dataset.delete ? null : editId);
      } catch (err) {
        showToast(err.uiMessage || err.message, 'error');
        b.disabled = false;
      }
    };
  });
  el.querySelectorAll('[data-end]').forEach((b) => {
    b.onclick = async () => {
      if (!confirm(t('admin.promo.confirm_end'))) return;
      b.disabled = true;
      try {
        const r = await api.adminEndPromotion(b.dataset.end);
        showToast(r.stripe_warning ? t('admin.promo.ended_warn', { w: r.stripe_warning }) : t('admin.promo.ended'), r.stripe_warning ? 'warning' : 'success');
        await mountPromotionsAdmin(el);
      } catch (err) {
        showToast(err.uiMessage || err.message, 'error');
        b.disabled = false;
      }
    };
  });
}
