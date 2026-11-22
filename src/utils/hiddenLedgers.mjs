// Which ledgers a person hid from the sidebar switcher. Stored per account in this browser (a display choice only).
// The open ledger always stays listed, and hiding never removes access: "Choose ledgers" lists them all again.
export const hiddenKey = accountId => `ledger.sidebar.hiddenLedgers.${accountId ?? 'anon'}`;

export function parseHidden(raw) {
  try { const v = JSON.parse(raw || '[]'); return Array.isArray(v) ? v.map(Number).filter(Number.isFinite) : []; } catch { return []; }
}

export function visibleBooks(books, hidden, activeId) {
  return books.filter(b => (b.active !== false && !hidden.includes(b.id)) || b.id === activeId);
}

export function toggleHidden(hidden, id) {
  return hidden.includes(id) ? hidden.filter(x => x !== id) : [...hidden, id];
}
