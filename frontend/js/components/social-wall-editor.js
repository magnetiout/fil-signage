import { uiText, renderHTML, binding } from '../lib/i18n-bindings.js';

/*
 * The Social wall widget editor (server/lib/social/widget.js validates what this sends). A wall
 * shows one of the workspace's social feeds (Social feeds in the menu), in one of three layouts.
 */
import { esc } from '../utils.js';
import { message as t } from '../i18n.js';

export async function mountSocialEditor(host, config, { apiGet }) {
  if (!host) return;
  const c = config || {};
  let feeds = [];
  try { feeds = ((await apiGet('/social/feeds')) || {}).feeds || []; } catch { feeds = []; }
  const layout = c.layout || 'carousel';
  host.innerHTML = `
    <div class="form-group"><label>${uiText(t('social.w_feed'))}</label>
      ${renderHTML(feeds.length
        ? `<select id="swFeed" class="input">${renderHTML(feeds.map((f) => `<option value="${esc(f.id)}" ${f.id === c.feed_id ? 'selected' : ''}>${uiText(f.name)}</option>`).join(''))}</select>`
        : `<div style="font-size:13px;color:var(--warning,#b45309)">${renderHTML(t('social.w_no_feeds'))} <a href="#/social">${uiText(t('nav.social'))}</a></div><input type="hidden" id="swFeed" value="">`)}</div>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px">
      <div class="form-group"><label>${uiText(t('social.w_layout'))}</label><select id="swLayout" class="input">
        ${renderHTML(['carousel', 'grid', 'ticker'].map((l) => `<option value="${l}" ${l === layout ? 'selected' : ''}>${uiText({ carousel: t('social.layout_carousel'), grid: t('social.layout_grid'), ticker: t('social.layout_ticker') }[l])}</option>`).join(''))}</select></div>
      <div class="form-group"><label>${uiText(t('social.w_interval'))}</label><input type="number" min="4" max="300" id="swInterval" class="input" value="${esc(c.interval_sec ?? 10)}"></div>
      <div class="form-group"><label>${uiText(t('social.w_columns'))}</label><input type="number" min="0" max="6" id="swColumns" class="input" value="${esc(c.columns ?? 0)}"></div>
      <div class="form-group"><label>${uiText(t('social.w_theme'))}</label><select id="swTheme" class="input">
        <option value="dark" ${c.theme !== 'light' ? 'selected' : ''}>${uiText(t('social.theme_dark'))}</option>
        <option value="light" ${c.theme === 'light' ? 'selected' : ''}>${uiText(t('social.theme_light'))}</option></select></div>
      <div class="form-group"><label>${uiText(t('social.w_accent'))}</label><input type="color" id="swAccent" class="input" value="${esc(/^#[0-9a-f]{6}$/i.test(c.accent || '') ? c.accent : '#4f8cff')}"></div>
    </div>
    <div class="form-group"><label>${uiText(t('social.w_title'))}</label><input id="swTitle" class="input" value="${esc(c.title || '')}" placeholder="${esc(t('social.w_title_ph'))}" data-fil-i18n-placeholder="${binding('social.w_title_ph', undefined)}"></div>
    <label style="display:flex;gap:8px;font-size:13px"><input type="checkbox" id="swAuthor" ${c.show_author !== false ? 'checked' : ''}> ${uiText(t('social.w_show_author'))}</label>
    <label style="display:flex;gap:8px;font-size:13px;margin-top:4px"><input type="checkbox" id="swText" ${c.show_text !== false ? 'checked' : ''}> ${uiText(t('social.w_show_text'))}</label>
    <label style="display:flex;gap:8px;font-size:13px;margin-top:4px"><input type="checkbox" id="swPlay" ${c.show_play !== false ? 'checked' : ''}> ${uiText(t('social.w_show_play'))}</label>
    <label style="display:flex;gap:8px;font-size:13px;margin-top:4px"><input type="checkbox" id="swTime" ${c.show_time !== false ? 'checked' : ''}> ${uiText(t('social.w_show_time'))}</label>
    <div style="font-size:12px;color:var(--text-muted);margin-top:6px">${uiText(t('social.w_hint'))}</div>`;
}

export function readSocialConfig() {
  const v = (id) => { const el = document.getElementById(id); return el ? el.value : ''; };
  const chk = (id) => { const el = document.getElementById(id); return el ? el.checked : true; };
  return {
    feed_id: v('swFeed'), layout: v('swLayout') || 'carousel', interval_sec: parseInt(v('swInterval'), 10) || 10,
    columns: parseInt(v('swColumns'), 10) || 0, theme: v('swTheme') || 'dark', accent: v('swAccent'), title: v('swTitle').trim(),
    show_author: chk('swAuthor'), show_text: chk('swText'), show_play: chk('swPlay'), show_time: chk('swTime'),
  };
}
