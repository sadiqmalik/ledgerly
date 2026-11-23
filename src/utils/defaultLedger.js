// Personal "open this ledger when I sign in" choice: per account, in this browser (like the list-view preference).
const key = accountId => `ledger.pref.defaultBook.${accountId}`;
const APPLIED = 'ledger.defaultApplied';

export const getDefaultLedger = accountId => {
  try { return accountId ? window.localStorage.getItem(key(accountId)) : null; } catch { return null; }
};

export const setDefaultLedger = (accountId, bookId) => {
  try {
    if (bookId) window.localStorage.setItem(key(accountId), bookId);
    else window.localStorage.removeItem(key(accountId));
  } catch { /* storage unavailable */ }
};

// The default ledger to open, once per browser session (so switching ledgers and reloading keeps the one in use).
export const takeDefaultLedger = accountId => {
  try {
    if (window.sessionStorage.getItem(APPLIED) === accountId) return null;
    window.sessionStorage.setItem(APPLIED, accountId);
  } catch { return null; }
  return getDefaultLedger(accountId);
};

// True once per browser session after sign-in: the app then opens on the Dashboard instead of a stale page.
const LANDED = 'ledger.landed';
export const takeFirstLanding = accountId => {
  try {
    if (window.sessionStorage.getItem(LANDED) === accountId) return false;
    window.sessionStorage.setItem(LANDED, accountId);
    return true;
  } catch { return false; }
};

export const clearDefaultApplied = () => {
  try { window.sessionStorage.removeItem(APPLIED); window.sessionStorage.removeItem(LANDED); } catch { /* ignore */ }
};
