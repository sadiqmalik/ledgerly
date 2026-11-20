import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import dataAPI, { api } from '../services/dataAPI';
import { useAuth } from '../auth/AuthContext';
import { roleFor } from '../auth/roles';
import { canReadLookups, canReadParties, canReadYears, hasResource } from '../auth/resources.mjs';

const LedgerContext = createContext(null);

// Per-book shared state: master lists, edit permission, a refresh counter and the Quick add modal.
export function LedgerProvider({ book, children }) {
  const { account } = useAuth();
  const [funds, setFunds] = useState([]);
  const [categories, setCategories] = useState([]);
  const [parties, setParties] = useState([]);
  const [version, setVersion] = useState(0);
  const [quickAdd, setQuickAdd] = useState(null); // null or { preset }
  const [profitOpen, setProfitOpen] = useState(false); // the separate Profit entry dialog
  const [closedYears, setClosedYears] = useState(() => new Set());

  const role = book.role || roleFor(account, book.id);
  const canEdit = role === 'editor' || role === 'admin';
  const canLedger = hasResource(account, 'ledger');
  const canQuickAdd = canEdit && canLedger;
  const lookups = canReadLookups(account);
  const partyLookup = canReadParties(account);
  const yearsAllowed = canReadYears(account);

  useEffect(() => {
    let cancelled = false;
    // Only the lists this account's pages may read; the server refuses the rest.
    Promise.all([
      lookups ? dataAPI.getFunds(book.id) : [],
      lookups ? dataAPI.getCategories(book.id) : [],
      partyLookup ? dataAPI.getParties(book.id) : []
    ])
      .then(([f, c, p]) => {
        if (cancelled) return;
        setFunds(f); setCategories(c); setParties(p);
      })
      .catch(() => { /* screens show their own load errors */ });
    return () => { cancelled = true; };
  }, [book.id, version, lookups, partyLookup]);

  // Closed years come from GET /years; loaded once per book and again when refreshYears() is called.
  const refreshYears = useCallback(async () => {
    if (!yearsAllowed) return;
    try {
      const r = await api.get(`/books/${book.id}/years`);
      setClosedYears(new Set((Array.isArray(r.data) ? r.data : []).filter(y => y.closed).map(y => Number(y.year))));
    } catch { /* leave the previous set; the API still refuses writes in closed years */ }
  }, [book.id, yearsAllowed]);
  useEffect(() => { setClosedYears(new Set()); refreshYears(); }, [refreshYears]);
  const isClosedDate = useCallback(date => /^\d{4}/.test(date || '') && closedYears.has(Number(String(date).slice(0, 4))), [closedYears]);

  const notifyChanged = useCallback(() => setVersion(v => v + 1), []);
  const openQuickAdd = useCallback((preset = 'Remittance') => { if (canQuickAdd) setQuickAdd({ preset }); }, [canQuickAdd]);
  const closeQuickAdd = useCallback(() => setQuickAdd(null), []);
  const openProfit = useCallback(() => { if (canQuickAdd) setProfitOpen(true); }, [canQuickAdd]);
  const closeProfit = useCallback(() => setProfitOpen(false), []);

  // "n" opens Quick add unless the user is typing somewhere or a dialog is already open.
  useEffect(() => {
    if (!canQuickAdd) return undefined;
    const onKey = e => {
      if (e.key !== 'n' || e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target;
      if (t && (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable)) return;
      if (document.querySelector('[role="dialog"]')) return;
      e.preventDefault();
      setQuickAdd({ preset: 'Remittance' });
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [canQuickAdd]);

  const value = useMemo(() => ({
    book, role, canEdit, canQuickAdd, can: key => hasResource(account, key), funds, categories, parties, version, quickAdd, profitOpen, openProfit, closeProfit,
    notifyChanged, openQuickAdd, closeQuickAdd, closedYears, isClosedDate, refreshYears,
    fundById: id => funds.find(f => f.id === id)
  }), [book, account, role, canEdit, canQuickAdd, funds, categories, parties, version, quickAdd, profitOpen, openProfit, closeProfit, notifyChanged, openQuickAdd, closeQuickAdd, closedYears, isClosedDate, refreshYears]);

  return <LedgerContext.Provider value={value}>{children}</LedgerContext.Provider>;
}

export const useLedger = () => useContext(LedgerContext);
