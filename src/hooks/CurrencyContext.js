import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api } from '../services/dataAPI';
import { useAuth } from '../auth/AuthContext';
import { CURRENCY_LIST } from '../utils/currencies';

// The managed currency list. Loaded once the account is signed in; falls back to the built-in list while
// loading, when the request fails, and for codes that are not in the list.
const FALLBACK = CURRENCY_LIST.map(c => ({ ...c, alias: null, active: true }));
const defaults = {
  currencies: FALLBACK, active: FALLBACK, loaded: false,
  label: code => code || '', name: code => CURRENCY_LIST.find(c => c.code === code)?.name || '', reload: async () => {}
};
const CurrencyContext = createContext(defaults);

export function CurrencyProvider({ children }) {
  const { status } = useAuth();
  const [list, setList] = useState(null);

  const reload = useCallback(async () => {
    try {
      const { data } = await api.get('/currencies');
      if (Array.isArray(data)) setList(data);
    } catch { /* keep the fallback list */ }
  }, []);

  useEffect(() => { if (status === 'signedIn') reload(); else setList(null); }, [status, reload]);

  const value = useMemo(() => {
    const currencies = list && list.length ? list : FALLBACK;
    const byCode = new Map(currencies.map(c => [c.code, c]));
    return {
      currencies,
      active: currencies.filter(c => c.active),
      loaded: Boolean(list),
      label: code => (code ? (byCode.get(code)?.alias || code) : ''),
      name: code => byCode.get(code)?.name || CURRENCY_LIST.find(c => c.code === code)?.name || '',
      reload
    };
  }, [list, reload]);

  return <CurrencyContext.Provider value={value}>{children}</CurrencyContext.Provider>;
}

export const useCurrencies = () => useContext(CurrencyContext);
