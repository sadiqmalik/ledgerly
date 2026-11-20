import { useCallback, useState } from 'react';

// Section ids in default order. `wide` sections span both columns on desktop (Overview always does).
export const SECTIONS = [
  { id: 'overview', label: 'Overview', wide: true },
  { id: 'attention', label: 'Needs attention', wide: true },
  { id: 'accounts', label: 'Accounts', wide: true },
  { id: 'funds', label: 'Funds', wide: true },
  { id: 'wallets', label: 'Wallets' },
  { id: 'year', label: 'This year' },
  { id: 'loans', label: 'Loans' },
  { id: 'profit', label: 'Profit trend' },
  { id: 'projects', label: 'Open projects' },
  { id: 'recent', label: 'Recent entries', wide: true },
  { id: 'memo', label: 'Memo' }
];

const IDS = SECTIONS.map(s => s.id);
export const DEFAULT_LAYOUT = { order: IDS, hidden: ['memo'] };

// Keeps stored layouts valid when sections are added or removed later.
const clean = v => {
  if (!v || !Array.isArray(v.order) || !Array.isArray(v.hidden)) return DEFAULT_LAYOUT;
  const order = v.order.filter(id => IDS.includes(id));
  // A section missing from an older saved layout goes right after its default predecessor.
  IDS.forEach((id, i) => {
    if (order.includes(id)) return;
    const at = i > 0 ? order.indexOf(IDS[i - 1]) : -1;
    order.splice(at + 1, 0, id);
  });
  return { order: [...new Set(order)], hidden: v.hidden.filter(id => IDS.includes(id)) };
};

const storageKey = (accountId, bookId) => `ledger.dashboard.${accountId}.${bookId}`;

function read(key) {
  try { return clean(JSON.parse(localStorage.getItem(key))); } catch { return DEFAULT_LAYOUT; }
}

export function useDashboardLayout(accountId, bookId) {
  const key = storageKey(accountId, bookId);
  const [state, setState] = useState(() => ({ key, layout: read(key) }));
  const layout = state.key === key ? state.layout : read(key);
  if (state.key !== key) setState({ key, layout });

  const update = useCallback(next => {
    setState({ key, layout: next });
    try { localStorage.setItem(key, JSON.stringify(next)); } catch { /* storage unavailable */ }
  }, [key]);

  const toggle = id => update({ ...layout, hidden: layout.hidden.includes(id) ? layout.hidden.filter(x => x !== id) : [...layout.hidden, id] });
  const move = (id, dir) => {
    const order = [...layout.order];
    const i = order.indexOf(id); const j = i + dir;
    if (j < 0 || j >= order.length) return;
    [order[i], order[j]] = [order[j], order[i]];
    update({ ...layout, order });
  };
  const reset = () => update(DEFAULT_LAYOUT);
  return { layout, toggle, move, reset };
}
