import { parseMoney } from '../../utils/money';

const LISTS = ['year', 'fund', 'kind', 'currency', 'party', 'category', 'project'];
const TEXT = ['direction', 'status', 'exclude', 'linked', 'min', 'max', 'from', 'to', 'q', 'sort', 'prev'];

// Reads the hash query. No query at all means "this year"; year=all means every year.
export function parseFilters(query) {
  const p = new URLSearchParams(query);
  const f = {};
  LISTS.forEach(k => { f[k] = (p.get(k) || '').split(',').filter(Boolean); });
  TEXT.forEach(k => { f[k] = p.get(k) || ''; });
  if (!query) f.year = [String(new Date().getFullYear())];
  if (f.year.includes('all')) f.year = [];
  return f;
}

export function serializeFilters(f) {
  const p = new URLSearchParams();
  LISTS.forEach(k => { if (f[k].length) p.set(k, f[k].join(',')); });
  if (!f.year.length) p.set('year', 'all');
  TEXT.forEach(k => { if (f[k]) p.set(k, f[k]); });
  return p.toString();
}

export const includePrevious = f => (f.prev === '1' ? true : f.prev === '0' ? false : (f.year.length > 0 || Boolean(f.from)));
export const hasPeriodStart = f => f.year.length > 0 || Boolean(f.from);

export function toParams(f) {
  const out = {};
  LISTS.forEach(k => { if (f[k].length) out[k] = f[k].join(','); });
  ['direction', 'status', 'from', 'to', 'q', 'sort', 'linked'].forEach(k => { if (f[k]) out[k] = f[k]; });
  if (f.exclude) out.exclude = f.exclude;
  const min = parseMoney(f.min); const max = parseMoney(f.max);
  if (min) out.min = min;
  if (max) out.max = max;
  if (includePrevious(f) && hasPeriodStart(f)) out.opening = 1;
  return out;
}

// Number of active filters (the year selection and the carry-forward switch are not counted).
export function countActive(f) {
  let n = 0;
  ['fund', 'kind', 'currency', 'party', 'category', 'project'].forEach(k => { if (f[k].length) n += 1; });
  ['direction', 'status', 'exclude', 'linked', 'min', 'max', 'from', 'to', 'q', 'sort'].forEach(k => { if (f[k]) n += 1; });
  return n;
}

// Opening-row caption: carried from the year before the earliest selected year, or before the from date.
export function openingCaption(f) {
  if (f.year.length) return `carried from ${Math.min(...f.year.map(Number)) - 1}`;
  if (f.from) return `before ${f.from}`;
  return '';
}

// Saved views live in localStorage per book.
const key = bookId => `ledger.views.${bookId}`;
export function loadViews(bookId) {
  try { const v = JSON.parse(localStorage.getItem(key(bookId)) || '{}'); return v && typeof v === 'object' ? v : {}; } catch { return {}; }
}
export function saveViews(bookId, views) {
  try { localStorage.setItem(key(bookId), JSON.stringify(views)); } catch { /* storage unavailable */ }
}
