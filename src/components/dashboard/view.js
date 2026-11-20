import { useCallback, useEffect, useState } from 'react';

// How the Dashboard shows its amounts. Chosen in Settings > Dashboard, kept in this browser for the signed-in account.
export const VIEWS = [
  { key: 'list', label: 'List', hint: 'Plain lists of funds and amounts.' },
  { key: 'pie', label: 'Pie', hint: 'A filled pie chart with a line from each slice to its amount.' },
  { key: 'bars', label: 'Bars', hint: 'One horizontal bar per fund.' },
  { key: 'graph', label: 'Graph', hint: 'Vertical columns, one per fund.' }
];
const KEYS = VIEWS.map(v => v.key);
const storageKey = accountId => `ledger.dashboardView.${accountId}`;
const EVENT = 'ledger:dashboard-view';

export const readView = accountId => {
  try { const v = localStorage.getItem(storageKey(accountId)); return KEYS.includes(v) ? v : 'list'; } catch { return 'list'; }
};

// [view, setView]. Changing it in Settings updates an open Dashboard too.
export function useDashboardView(accountId) {
  const [view, setState] = useState(() => readView(accountId));
  useEffect(() => {
    setState(readView(accountId));
    const sync = () => setState(readView(accountId));
    window.addEventListener(EVENT, sync);
    window.addEventListener('storage', sync);
    return () => { window.removeEventListener(EVENT, sync); window.removeEventListener('storage', sync); };
  }, [accountId]);
  const setView = useCallback(next => {
    if (!KEYS.includes(next)) return;
    try { localStorage.setItem(storageKey(accountId), next); } catch { /* storage unavailable */ }
    setState(next);
    window.dispatchEvent(new Event(EVENT));
  }, [accountId]);
  return [view, setView];
}
