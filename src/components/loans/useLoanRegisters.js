import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../services/dataAPI';
import { errorMessage } from '../common/format';

const CHANGED = 'ledger:loans-changed';

// Tells every mounted useLoanRegisters (page and sidebar) to reload.
export const notifyLoansChanged = () => window.dispatchEvent(new Event(CHANGED));

// Loads GET /api/loans (the registers this account may see) and reloads after changes anywhere in the app.
export default function useLoanRegisters(enabled = true) {
  const [registers, setRegisters] = useState(null);
  const [error, setError] = useState('');

  const reload = useCallback(async () => {
    try {
      const res = await api.get('/loans');
      setRegisters(Array.isArray(res.data) ? res.data : []);
      setError('');
    } catch (err) {
      setError(errorMessage(err, 'Could not load the loans.'));
      setRegisters(r => r || []);
    }
  }, []);

  useEffect(() => {
    if (!enabled) return undefined;
    reload();
    window.addEventListener(CHANGED, reload);
    return () => window.removeEventListener(CHANGED, reload);
  }, [enabled, reload]);

  return { registers, error, reload };
}

// Names already used on the loans this account can see (borrowers, lenders and any extra names such as receivers),
// as [{ id, name }] for ComboInput. Like ledger parties: pick an existing spelling or type a new one.
export function useLoanNames(extra = []) {
  const { registers } = useLoanRegisters(true);
  return useMemo(() => {
    const seen = new Map();
    const add = n => {
      // "Sam & Alex" holds two people: suggest each one.
      for (const part of (typeof n === 'string' ? n.split(/\s*&\s*/) : [])) {
        const name = part.trim();
        if (name && !seen.has(name.toLowerCase())) seen.set(name.toLowerCase(), name);
      }
    };
    (registers || []).forEach(r => { add(r.borrower); add(r.lender); });
    extra.forEach(add);
    return [...seen.values()].map(name => ({ id: name.toLowerCase(), name }));
  }, [registers, extra]);
}
