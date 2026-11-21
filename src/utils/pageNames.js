import { useSyncExternalStore } from 'react';

// Names of the main pages. The defaults are fixed here; a ledger administrator can set an alias for each page in
// Settings > Page names (stored with the ledger's appearance). A blank alias means "use the default".
export const DEFAULT_PAGE_NAMES = Object.freeze({
  ledger: 'Ledger', projects: 'Projects', loans: 'Loans', reports: 'Reports',
  documents: 'Documents', diary: 'Notebook', items: 'Item Vault'
});
export const PAGE_KEYS = Object.keys(DEFAULT_PAGE_NAMES);
// Sidebar path to page key.
export const PATH_KEYS = Object.freeze({ '/ledger': 'ledger', '/projects': 'projects', '/loans': 'loans', '/reports': 'reports', '/documents': 'documents', '/diary': 'diary', '/items': 'items' });

let aliases = {};
const listeners = new Set();
const subscribe = fn => { listeners.add(fn); return () => listeners.delete(fn); };

export const setPageAliases = map => {
  const next = Object.fromEntries(Object.entries(map || {}).filter(([k, v]) => k in DEFAULT_PAGE_NAMES && typeof v === 'string' && v.trim()));
  if (JSON.stringify(next) === JSON.stringify(aliases)) return;
  aliases = next;
  listeners.forEach(fn => fn());
};
export const getPageAliases = () => aliases;

// The name to show for a page key: its alias, else the default.
export const pageName = key => aliases[key] || DEFAULT_PAGE_NAMES[key] || key;

// React: re-renders when the aliases change. Returns (key) => name.
export default function usePageName() {
  useSyncExternalStore(subscribe, getPageAliases);
  return pageName;
}
