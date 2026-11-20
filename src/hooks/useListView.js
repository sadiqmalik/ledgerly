import { useEffect, useState } from 'react';

// How the Settings lists (Funds, Accounts, Categories, People) are shown: 'cards' or 'table'.
// Effective value = personal override (per account, this browser) ?? ledger default (set by an administrator) ?? 'cards'.
// KEY caches the last applied effective value so the next load paints without a flash. Applying it updates all open lists.
const KEY = 'ledger.settingsListView';
const DEFAULT_KEY = 'ledger.default.listView';
const personalKey = accountId => `ledger.pref.listView.${accountId}`;
const EVENT = 'ledger:listview';
const DEFAULT_VIEW = 'cards';

const isView = v => v === 'cards' || v === 'table';
const readKey = key => { try { return window.localStorage.getItem(key); } catch { return null; } };
const writeKey = (key, value) => {
  try {
    if (value == null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch { /* applies for this page load only */ }
};

// Last applied effective value.
export const readListView = () => (readKey(KEY) === 'table' ? 'table' : DEFAULT_VIEW);

// Sets the last-applied cache and notifies open lists.
export const applyListView = view => {
  const next = view === 'table' ? 'table' : DEFAULT_VIEW;
  writeKey(KEY, next);
  window.dispatchEvent(new CustomEvent(EVENT, { detail: next }));
  return next;
};

export const getDefaultListView = () => { const v = readKey(DEFAULT_KEY); return isView(v) ? v : null; };
export const storeDefaultListView = view => { if (isView(view)) writeKey(DEFAULT_KEY, view); };

export const getPersonalListView = accountId => {
  if (accountId == null) return null;
  const v = readKey(personalKey(accountId));
  return isView(v) ? v : null;
};
export const storePersonalListView = (accountId, view) => {
  if (accountId == null) return;
  writeKey(personalKey(accountId), isView(view) ? view : null);
};

export const getEffectiveListView = accountId => getPersonalListView(accountId) || getDefaultListView() || DEFAULT_VIEW;
export const applyEffectiveListView = accountId => applyListView(getEffectiveListView(accountId));

export function useListView() {
  const [view, setView] = useState(readListView);
  useEffect(() => {
    const on = () => setView(readListView());
    window.addEventListener(EVENT, on);
    window.addEventListener('storage', on);
    return () => { window.removeEventListener(EVENT, on); window.removeEventListener('storage', on); };
  }, []);
  return [view, applyListView];
}

export default useListView;
