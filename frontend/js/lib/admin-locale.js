// Display-only locale helpers. Never use these to rewrite schedule/UTC values or API identifiers.
export const localeFor = language => language === 'tr' ? 'tr-TR' : 'en-US';
export function numberFor(value, language, options = {}) {
  return new Intl.NumberFormat(localeFor(language), options).format(typeof value === 'bigint' ? value : Number(value));
}
export function dateFor(value, language, options = {}, method = 'toLocaleString') {
  return new Date(value)[method](localeFor(language), options);
}
export function lowerFor(value, language) { return String(value).toLocaleLowerCase(localeFor(language)); }
export function compareFor(a, b, language) { return new Intl.Collator(localeFor(language), { numeric: true, sensitivity: 'base' }).compare(a, b); }
// Native number/date/time inputs keep their machine-readable .value. This parser is for text
// fields explicitly displaying a localized number; it does not accept ambiguous mixed separators.
export function parseNumberFor(value, language) {
  const s = String(value).trim().replace(/[\u00a0\u202f ]/g, '');
  const pattern = language === 'tr' ? /^[+-]?(?:\d+|\d{1,3}(?:\.\d{3})+)(?:,\d+)?$/ : /^[+-]?(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d+)?$/;
  if (!pattern.test(s)) return NaN;
  return Number(language === 'tr' ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, ''));
}
