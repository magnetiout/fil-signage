// Explicit translation bindings, not dictionary matching/replacing user text. Each marker is
// emitted at the source t() call with its stable key and variables. Only its own text range or
// named attribute changes: forms, focus, editor models, handlers and iframe content survive.
import { t, tn, tHtml, subscribe, isMessage, messageData, message as makeMessage, messageCount, isDisplay, displayFromData } from '../i18n.js';
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const encode = data => encodeURIComponent(JSON.stringify(data, (_, value) => isMessage(value) ? { __fil_message: messageData(value) } : isDisplay(value) ? {__fil_display:value.display} : value));
export const binding = (key, vars, count) => encode({key,vars,...(count===undefined?{}:{count})});
const parse = value => JSON.parse(decodeURIComponent(value), (_, item) => item && item.__fil_display ? displayFromData(item.__fil_display) : item && item.__fil_message ? (item.__fil_message.count === undefined ? makeMessage(item.__fil_message.key, item.__fil_message.vars) : messageCount(item.__fil_message.key, item.__fil_message.count, item.__fil_message.vars)) : item);
const message = data => data.display ? String(displayFromData(data.display)) : data.count === undefined ? t(data.key, data.vars) : tn(data.key, data.count, data.vars);
export function ht(key, vars) {
  return `<!--fil-i18n:${binding(key, vars)}-->${tHtml(key, vars)}<!--fil-i18n-end-->`;
}
export function htn(key, count, vars) {
  return `<!--fil-i18n:${binding(key, vars, count)}-->${tHtml(key + (count === 1 ? '_one' : '_other'), { n: count, ...vars })}<!--fil-i18n-end-->`;
}
export function bindText(element, key, vars, count) {
  if (!element) return;
  element.dataset.filI18nText = binding(key, vars, count);
  element.textContent = message({ key, vars, count });
}
export function refreshBindings(root = document) {
  root.querySelectorAll('[data-fil-i18n-text]').forEach(el => {
    try { el.textContent = message(parse(el.dataset.filI18nText)); } catch { /* invalid binding is not user text */ }
  });
  for (const attribute of ['title', 'placeholder', 'aria-label', 'alt', 'aria-description','aria-valuetext','data-tip']) {
    root.querySelectorAll(`[data-fil-i18n-${attribute}]`).forEach(el => {
      try { el.setAttribute(attribute, message(parse(el.getAttribute('data-fil-i18n-' + attribute)))); } catch { /* invalid explicit binding */ }
    });
  }
  root.querySelectorAll('[data-fil-i18n-attrs]').forEach(el => {
    try {
      const attrs = parse(el.dataset.filI18nAttrs);
      for (const [attribute, data] of Object.entries(attrs)) {
        if (['title', 'placeholder', 'aria-label', 'alt', 'aria-description','aria-valuetext','data-tip'].includes(attribute)) el.setAttribute(attribute, message(data));
      }
    } catch { /* ignore invalid binding */ }
  });
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_COMMENT);
  const starts = [];
  while (walker.nextNode()) if (walker.currentNode.data.startsWith('fil-i18n:')) starts.push(walker.currentNode);
  for (const start of starts) {
    let end = start.nextSibling;
    while (end && !(end.nodeType === 8 && end.data === 'fil-i18n-end')) end = end.nextSibling;
    if (!end) continue;
    try {
      const data = parse(start.data.slice(9));
      const range = document.createRange();range.setStartAfter(start);range.setEndBefore(end);
      range.deleteContents();
      if (data.display) { range.deleteContents();range.insertNode(document.createTextNode(String(displayFromData(data.display))));continue; }
      const key = data.count === undefined ? data.key : data.key + (data.count === 1 ? '_one' : '_other');
      range.insertNode(range.createContextualFragment(tHtml(key, { ...data.vars, ...(data.count === undefined ? {} : { n: data.count }) })));
    } catch { /* no guessed replacement and no user-data mutation */ }
  }
}
if (typeof document !== 'undefined') subscribe(() => refreshBindings());

export function renderValue(value, raw = false) {
  if (isDisplay(value)) return `<!--fil-i18n:${encode({display:value.display})}-->${escape(String(value))}<!--fil-i18n-end-->`;
  if (isMessage(value)) return value.count === undefined ? ht(value.key, value.vars) : htn(value.key, value.count, value.vars);
  return raw ? String(value ?? '') : escape(value);
}
export function attributeBinding(attribute, value) {
  if ((!isMessage(value) && !isDisplay(value)) || !['title','placeholder','aria-label','alt','aria-description','aria-valuetext','data-tip'].includes(attribute)) return '';
  return ` data-fil-i18n-${attribute}="${isDisplay(value)?encode({display:value.display}):binding(value.key,value.vars,value.count)}"`;
}
export function bindMessage(element, value) {
  if (!element) return value;
  if (!element.dataset) { element.textContent = String(value ?? ''); return value; }
  if (isDisplay(value)) { element.dataset.filI18nText=encode({display:value.display});element.textContent=String(value);return value; }
  if (isMessage(value)) bindText(element, value.key, value.vars, value.count);
  else { delete element.dataset.filI18nText; element.textContent = String(value ?? ''); }
  return value;
}

export function bindAttribute(element, attribute, value) {
  if (!element) return;
  // document.title and editor data models are properties, not DOM attributes.
  // Preserve their exact assignment semantics and never register user data for translation.
  if (typeof element.setAttribute !== 'function') { element[attribute === 'aria-label' ? 'ariaLabel' : attribute] = isMessage(value) || isDisplay(value) ? String(value) : value;return value; }
  if (isMessage(value) || isDisplay(value)) element.setAttribute('data-fil-i18n-' + attribute, isDisplay(value)?encode({display:value.display}):binding(value.key,value.vars,value.count));
  else element.removeAttribute('data-fil-i18n-' + attribute);
  element.setAttribute(attribute, String(isMessage(value) ? message(messageData(value)) : value ?? ''));
}

export function translatedAttribute(attribute, key, vars) {
  if (!['title','placeholder','aria-label','alt','aria-description','aria-valuetext','data-tip'].includes(attribute)) throw new Error('Unsupported translation attribute');
  return ` ${attribute}="${escape(t(key,vars))}" data-fil-i18n-${attribute}="${binding(key,vars)}"`;
}

// Separate ordinary text from already-built UI markup at call sites, so security audits can
// identify every escaping boundary. Translation descriptors are always safely formatted.
export const uiText = value => renderValue(value, false);
export const renderHTML = value => renderValue(value, true);
