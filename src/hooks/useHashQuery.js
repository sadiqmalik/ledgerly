import { useCallback, useEffect, useState } from 'react';

const readQuery = () => {
  const h = window.location.hash.replace(/^#/, '');
  const i = h.indexOf('?');
  return i < 0 ? '' : h.slice(i + 1);
};

// The query part of the hash (#/ledger?year=2024). set(query, {replace}) updates it; back/forward work.
export default function useHashQuery() {
  const [query, setQ] = useState(readQuery);
  useEffect(() => {
    const on = () => setQ(readQuery());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  const set = useCallback((next, { replace = false } = {}) => {
    const path = window.location.hash.replace(/^#/, '').split('?')[0] || '/ledger';
    const url = `#${path}${next ? `?${next}` : ''}`;
    if (replace) { window.history.replaceState(null, '', url); setQ(next); } else { window.location.hash = url; }
  }, []);
  return [query, set];
}
