// Small shared helpers for the ledger screens.

export const todayISO = () => {
  const d = new Date();
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

// Turns an axios error into text people can act on.
export const errorMessage = (err, fallback = 'Something went wrong. Try again.') => {
  const status = err?.response?.status;
  const text = err?.response?.data?.error;
  if (status === 423) return 'That year is closed, so its entries cannot be changed.';
  if (status === 409 && text === 'delete and recreate') {
    return 'This is a linked transfer leg. Only date, comment and (same-currency) amount can change; to change anything else, delete the transfer and recreate it.';
  }
  if (status === 403) return 'You do not have permission to do that.';
  if (text) return text;
  if (!err?.response) return 'Could not reach the server.';
  return fallback;
};

export const readLocal = key => {
  try { return localStorage.getItem(key); } catch { return null; }
};
export const writeLocal = (key, value) => {
  try { localStorage.setItem(key, value); } catch { /* storage unavailable */ }
};

// Exact-name lookup among parties (name or alias, case-insensitive).
export const findParty = (parties, name) => {
  const n = (name || '').trim().toLowerCase();
  if (!n) return null;
  return parties.find(p => p.name.toLowerCase() === n || (p.aliases || []).some(a => a.toLowerCase() === n)) || null;
};
