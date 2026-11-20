import { createContext, useContext, useSyncExternalStore } from 'react';
import { parseFilters, serializeFilters } from '../ledger/filterState';

// Stable palette index (1..8) from any string.
export function hashIndex(s) {
  let h = 0;
  const str = String(s || '');
  for (let i = 0; i < str.length; i += 1) h = (h * 31 + str.charCodeAt(i)) >>> 0;
  return (h % 8) + 1;
}
export const paletteStyle = key => {
  const n = hashIndex(key);
  return { background: `var(--chip-${n}-bg)`, color: `var(--chip-${n}-fg)` };
};
export const initials = name => {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  return (parts.length === 1 ? parts[0].slice(0, 2) : parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
};

const subscribe = cb => { window.addEventListener('hashchange', cb); return () => window.removeEventListener('hashchange', cb); };
const snapshot = () => window.location.hash;

// Current ledger filters, only when the user is on #/ledger (otherwise null).
export function useLedgerFilters() {
  const hash = useSyncExternalStore(subscribe, snapshot);
  const h = hash.replace(/^#/, '');
  const [path, query = ''] = h.split(/\?(.*)/s);
  return path === '/ledger' ? parseFilters(query) : null;
}

// Toggle one id in a list filter (fund, party, category). Off the ledger, jump there with only that filter.
export function toggleFilter(key, id) {
  const h = window.location.hash.replace(/^#/, '');
  const [path, query = ''] = h.split(/\?(.*)/s);
  if (path === '/ledger') {
    const f = parseFilters(query);
    f[key] = f[key].includes(id) ? f[key].filter(x => x !== id) : [...f[key], id];
    window.location.hash = `#/ledger${serializeFilters(f) ? `?${serializeFilters(f)}` : ''}`;
  } else {
    window.location.hash = `#/ledger?${key}=${encodeURIComponent(id)}&year=all`;
  }
}
export function filterOnly(key, id) {
  window.location.hash = `#/ledger?${key}=${encodeURIComponent(id)}&year=all`;
}

// A page with its own filters (a project) wraps its list in this provider so clicking a person or category
// filters that page instead of jumping to the ledger. value: { keys, filters: {key: ids[]}, toggle(key, id), only(key, id) }.
export const ChipScopeContext = createContext(null);

// How a chip filters: inside a scope that handles `key` it filters that page, otherwise the ledger (as before).
export function useChipFilter(key) {
  const scope = useContext(ChipScopeContext);
  const ledger = useLedgerFilters();
  const local = Boolean(scope && scope.keys.includes(key));
  return {
    scoped: local,
    active: id => Boolean(local ? scope.filters[key]?.includes(id) : ledger?.[key]?.includes(id)),
    toggle: id => (local ? scope.toggle(key, id) : toggleFilter(key, id)),
    only: id => (local ? scope.only(key, id) : filterOnly(key, id)),
  };
}
