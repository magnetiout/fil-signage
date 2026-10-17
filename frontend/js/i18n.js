import { localeFor, numberFor, dateFor } from './lib/admin-locale.js';
// Lightweight i18n loader. Each language is its own file under ./i18n/ so a
// translator can edit one file without touching the others. English is the
// canonical source — every other locale falls back to en for any missing key.
import en from './i18n/en.js';
import tr from './i18n/tr.js';

const fallback = en;
const registry = { en, tr };

let currentLang = 'tr';
try {
  const user = JSON.parse(localStorage.getItem('user') || 'null');
  currentLang = user?.id && localStorage.getItem('token')
    ? localStorage.getItem('fil_language:' + user.id) || user.ui_language || (!Object.hasOwn(user,'ui_language') ? localStorage.getItem('rd_lang') : null) || 'tr'
    : localStorage.getItem('fil_login_language') || localStorage.getItem('rd_lang') || 'tr';
} catch { /* blocked storage: in-memory preference */ }
if (!registry[currentLang]) currentLang = 'tr';

function lookup(key) {
  return registry[currentLang]?.[key] || fallback[key] || fallback['common.request_failed'] || 'Something went wrong. Please try again.';
}

// Replace {name} placeholders in a string with the matching property of vars.
// Unknown placeholders pass through unchanged so a missing var is visible
// during development rather than silently dropped.
/*
 * The white-label brand name, available to EVERY string without threading it through call sites.
 *
 * #292: a reseller's customers were shown "ScreenTinker" in a dozen places the white-label settings
 * never touched — setup instructions, the empty-dashboard hint, onboarding, error text. Those are
 * translated strings, so the fix belongs in the translation layer: they say {brandName} and this
 * fills it in. Threading a variable through several hundred t() calls would have been the same fix
 * with several hundred chances to miss one.
 *
 * Read at CALL time, not captured: branding.js refreshes from the server after first paint, and a
 * value captured when this module loaded would keep showing the previous workspace's brand after a
 * switch. The default is the product's own name, so an un-branded install reads exactly as before.
 */
function brandName() {
  try {
    const n = typeof window !== 'undefined' && window.__ST_BRAND_NAME;
    return (typeof n === 'string' && n.trim()) ? n.trim() : "FILSign";
  } catch (e) { return "FILSign"; }
}

function format(s, vars) {
  // Note there is no `if (!vars) return s` short-circuit any more: {brandName} has to resolve in
  // strings that take no other variables, which is most of them.
  const all = { brandName: brandName(), ...(vars || {}) };
  return String(s).replace(/\{(\w+)\}/g, (m, k) => {
    if (!(k in all)) return m;
    const value = all[k];
    return typeof value === 'number' && /^(n|count|total|done|pct|percent|size|used|limit|max|remaining|duration|seconds|minutes|hours|days|bytes)$/.test(k)
      ? numberFor(value, currentLang) : String(value);
  });
}

export function t(key, vars) {
  return format(lookup(key), vars);
}

// Plural helper: looks up `${keyBase}_one` for n===1 else `${keyBase}_other`,
// auto-injects `{n}` into vars. Use for any string that varies on a count.
export function tn(keyBase, n, vars = {}) {
  const key = keyBase + (n === 1 ? '_one' : '_other');
  return format(lookup(key), { n, ...vars });
}

const subscribers = new Set();

// Views and the navbar subscribe so they can rebuild themselves on language
// change. A language event updates the shell; keyed bindings update the view in place.
export function subscribe(fn) {
  subscribers.add(fn);
  return () => subscribers.delete(fn);
}

export function setLanguage(lang, { source = 'user' } = {}) {
  if (!registry[lang] || lang === currentLang) return;
  currentLang = lang;
  try { localStorage.setItem('rd_lang', lang); } catch { /* in-memory preference still works */ }
  document.documentElement.setAttribute('lang', lang);
  subscribers.forEach((fn) => { try { fn(lang, { source }); } catch {} });
  window.dispatchEvent(new CustomEvent('language-changed', { detail: { lang, source } }));
  // Do not route or reload: explicit keyed bindings update labels without losing editor state.
}

export function getLanguage() {
  return currentLang;
}

export function getAvailableLanguages() {
  return [
    { code: 'tr', name: 'Türkçe' },
    { code: 'en', name: 'English' },
    { code: 'ja', name: '日本語' },
    { code: 'zh', name: '简体中文' },
    { code: 'es', name: 'Español' },
    { code: 'fr', name: 'Français' },
    { code: 'it', name: 'Italiano' },
    { code: 'de', name: 'Deutsch' },
    { code: 'pt', name: 'Português' },
    { code: 'hi', name: 'हिन्दी' },
    { code: 'nl', name: 'Nederlands' },
  ];
}

// Apply the persisted language to <html lang=...> on first load so screen
// readers and CSS :lang() selectors are accurate before any user interaction.
if (typeof document !== 'undefined') {
  document.documentElement.setAttribute('lang', currentLang);
}

// Only a small reviewed formatting vocabulary is markup. Variables (including branding) are
// always escaped separately, so a translated warning cannot turn a user value into executable HTML.
const htmlEscape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function tHtml(key, vars) {
  const template = htmlEscape(lookup(key)).replace(/&lt;(\/?(?:strong|b|em|code|s|br)\s*\/?)&gt;/gi, '<$1>').replace(/&lt;s class=&quot;billing-was&quot;&gt;/g, '<s class="billing-was">');
  const values = Object.fromEntries(Object.entries({brandName: brandName(), ...(vars || {})}).map(([k,v]) => [k, htmlEscape(
    typeof v === 'number' && /^(n|count|total|done|pct|percent|size|used|limit|max|remaining|duration|seconds|minutes|hours|days|bytes)$/.test(k)
      ? numberFor(v, currentLang) : v
  )]));
  return format(template, values);
}
export function getLocale() { return localeFor(currentLang); }
export function hasMessage(key) { return !!fallback[key]; }

// UI label provenance survives helper functions and arrays. t() itself stays a plain-string API.
// JSON serialization of application data remains ordinary strings; explicit DOM bindings use
// their own replacer to retain the key/variables. Never construct these from user-entered text.
class LocalizedMessage extends String {
  constructor(key, vars, count, escaped = false) {
    super(count === undefined ? t(key, vars) : tn(key, count, vars));
    this.key = key; this.vars = vars; this.count = count; this.escaped = escaped;
  }
  toString() { const value = this.count === undefined ? t(this.key, this.vars) : tn(this.key, this.count, this.vars); return this.escaped ? htmlEscape(value) : value; }
  valueOf() { return this.toString(); }
  [Symbol.toPrimitive]() { return this.toString(); }
}
export const message = (key, vars) => new LocalizedMessage(key, vars);
export const messageCount = (key, count, vars) => new LocalizedMessage(key, vars, count);
export const isMessage = value => value instanceof LocalizedMessage;
export function messageData(value) { return {key: value.key, vars: value.vars, ...(value.count === undefined ? {} : { count: value.count })}; }

export function getAdminLanguages() { return [{code:'tr',name:'Türkçe'},{code:'en',name:'English'}]; }

export const escapeMessage = value => new LocalizedMessage(value.key, value.vars, value.count, true);

function displayFormat(data) {
  if (data.kind === 'list') return data.values.map(value => value.message
    ? String(value.message.count === undefined ? message(value.message.key,value.message.vars) : messageCount(value.message.key,value.message.count,value.message.vars))
    : value.display ? displayFormat(value.display) : value.text).join(data.separator);
  if(data.kind==='region'){try{return new Intl.DisplayNames([localeFor(currentLang)],{type:'region'}).of(data.value)||data.fallback}catch{return data.fallback}}
  if (data.kind === 'dateRange') return new Intl.DateTimeFormat(localeFor(currentLang),data.options).formatRange(new Date(data.value),new Date(data.end));
  if (data.kind === 'date') {
    if (data.value === null) return t('common.unknown');
    const value = new Date(data.value);
    if (!Number.isFinite(value.getTime())) return t('common.unknown');
    return dateFor(value,currentLang,data.options,data.method);
  }
  return numberFor(data.kind === 'bigint' ? BigInt(data.value) : data.value,currentLang,data.options);
}
class LocalizedDisplay extends String {
  constructor(data, escaped = false) { super(displayFormat(data)); this.display = data; this.escaped = escaped; }
  toString() { const value = displayFormat(this.display); return this.escaped ? htmlEscape(value) : value; }
  valueOf() { return this.toString(); }
  [Symbol.toPrimitive]() { return this.toString(); }
}
export function displayValue(value, method = 'toLocaleString', options) {
  if (value instanceof Date) return new LocalizedDisplay({kind:'date',value:Number.isFinite(value.getTime()) ? value.toISOString() : null, method, options});
  if (typeof value === 'number' || typeof value === 'bigint') return new LocalizedDisplay({kind:typeof value, value:typeof value === 'bigint' ? value.toString() : value, options});
  return String(value ?? '');
}
export const isDisplay = value => value instanceof LocalizedDisplay;
export const displayFromData = data => new LocalizedDisplay(data);
export const escapeDisplay = value => new LocalizedDisplay(value.display, true);

export const displayDateRange = (start,end,options) => new LocalizedDisplay({kind:'dateRange',value:start.toISOString(),end:end.toISOString(),options});

export const displayRegion = (code,fallback=code) => new LocalizedDisplay({kind:'region',value:code,fallback});

// An explicit list of labels/values; retain locale provenance without touching its source data.
export const displayList = (values,separator=', ') => new LocalizedDisplay({kind:'list',separator,
  values:values.map(value=>isMessage(value)?{message:messageData(value)}:isDisplay(value)?{display:value.display}:{text:String(value??'')})});
export const displayQuantity = (value,unit,digits) => displayList([
  displayValue(value,'toLocaleString',digits===undefined?undefined:{minimumFractionDigits:digits,maximumFractionDigits:digits}),unit],' ');

// Error coerces messages to strings; retain the explicit descriptor for a later language switch.
export const localizedError = value => Object.assign(new Error(String(value)),{uiMessage:value});
