import { useEffect, useState } from 'react';
import { api } from '../services/dataAPI';
import { useAuth } from '../auth/AuthContext';
import { canReadProjectNames, forBook } from '../auth/resources.mjs';
import { useLedger } from './LedgerContext';

// Map of project id → { name, kind, status } for the current book (names only, never project financials). Re-fetched when the ledger `version` changes.
export default function useProjectNames() {
  const { book, version } = useLedger();
  const { account } = useAuth();
  const allowed = canReadProjectNames(forBook(account, book.id));
  const [map, setMap] = useState({});
  useEffect(() => {
    if (!allowed) return undefined;
    let cancelled = false;
    api.get(`/books/${book.id}/project-names`)
      .then(r => {
        if (cancelled) return;
        const next = {};
        (Array.isArray(r.data) ? r.data : []).forEach(p => { next[p.id] = { name: p.name, kind: p.kind, status: p.status }; });
        setMap(next);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [book.id, version, allowed]);
  return map;
}
