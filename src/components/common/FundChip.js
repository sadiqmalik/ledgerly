import React, { useCallback, useState } from 'react';
import { api } from '../../services/dataAPI';
import { useLedger } from '../../hooks/LedgerContext';
import Amount from './Amount';
import ChipShell, { PopRow, PopAction } from './ChipShell';
import { hashIndex, toggleFilter, filterOnly, useLedgerFilters } from './chipUtil';


const S = { width: 12, height: 12, viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true, className: 'shrink-0' };
const ICONS = {
  general: <svg {...S}><circle cx="8" cy="8" r="4" fill="currentColor" stroke="none" /></svg>,
  reserved: <svg {...S}><rect x="3.5" y="7" width="9" height="6.5" rx="1.5" /><path d="M5.5 7V5a2.5 2.5 0 015 0v2" /></svg>,
  custodial: <svg {...S}><circle cx="8" cy="5.5" r="2.5" /><path d="M3 13.5c.5-3 2.5-4.2 5-4.2s4.5 1.200 5 4.200" /></svg>,
  investment: <svg {...S}><path d="M2.5 13.5h11M4 11V8M8 11V4.500M12 11V6.500" /></svg>,
  memo: <svg {...S}><path d="M4 2.500h6l2.500 2.500v8.500H4z" /><path d="M6 8h4M6 10.500h4" /></svg>,
  wallet: <svg {...S}><rect x="2" y="4" width="12" height="9" rx="2" /><path d="M2 6.500h12M10.500 9.500h1.500" /></svg>
};

const holderCache = new Map(); // bookId -> Promise of { id: name }
const loadHolders = (bookId, version) => {
  const key = `${bookId}:${version}`;
  if (!holderCache.has(key)) {
    holderCache.set(key, api.get(`/books/${bookId}/holders`, { params: { all: 1 } })
      .then(r => Object.fromEntries((Array.isArray(r.data) ? r.data : []).map(h => [h.id, h.name])))
      .catch(() => { holderCache.delete(key); return {}; }));
  }
  return holderCache.get(key);
};

export default function FundChip({ fund, fundId, name, size = 'md' }) {
  const { book, funds, version, can } = useLedger();
  const filters = useLedgerFilters();
  const f = fund || funds.find(x => x.id === fundId);
  const id = f?.id || fundId;
  const [holder, setHolder] = useState('');
  const label = f?.name || name || '';
  const holderId = f?.holderId;
  const bookId = book.id;
  const onOpen = useCallback(() => { if (holderId) loadHolders(bookId, version).then(m => setHolder(m[holderId] || '')); }, [holderId, bookId, version]);
  if (!label) return <span className="text-muted-foreground">{'—'}</span>;

  if (!can('ledger')) return <span className="truncate text-sm" title={label}>{label}</span>;

  const foreign = Boolean(f?.currency && f.currency !== book.baseCurrency);
  const icon = foreign ? 'wallet' : (ICONS[f?.kind] ? f.kind : 'general');
  const kindLabel = foreign ? 'Wallet' : f?.kind === 'reserved' || f?.isReserved ? 'Reserved' : f?.kind === 'memo' ? 'Memo'
    : f?.kind === 'custodial' ? 'Custodial' : f?.kind === 'investment' ? 'Investment' : 'Usable';
  const n = hashIndex(id || label);
  const dotColor = f?.color || `var(--chip-${n}-fg)`;
  const dot = <span aria-hidden="true" className="size-2 shrink-0 rounded-full" style={{ background: dotColor }} />;
  const active = Boolean(id && filters?.fund.includes(id));

  if (!id) return <span className="inline-flex items-center gap-1.5 text-sm">{dot}{label}</span>;

  return (
    <ChipShell
      label={`Fund ${label}`}
      title={label}
      active={active}
      onOpen={onOpen}
      className="text-foreground"
      onActivate={() => toggleFilter('fund', id)}
      popover={close => (
        <div className="space-y-2">
          <div className="font-semibold">{label}</div>
          <div>
            <PopRow k="Kind">{kindLabel}</PopRow>
            <PopRow k="Currency">{f?.currency || book.baseCurrency}</PopRow>
            {f && f.balance != null && <PopRow k="Balance"><Amount minor={f.balance} currency={f.currency} /></PopRow>}
            {holder && <PopRow k="Account">{holder}</PopRow>}
          </div>
          <div className="flex flex-col gap-1.5">
            <PopAction onClick={() => { close(); filterOnly('fund', id); }}>Filter ledger by this fund</PopAction>
            {can('settings') && <PopAction onClick={() => { close(); window.location.hash = '#/settings'; }}>Open in Settings</PopAction>}
          </div>
        </div>
      )}
    >
      {dot}
      <span className="truncate">{label}</span>
      {icon === 'wallet' && <span className="text-xs text-muted-foreground">{f.currency}</span>}
    </ChipShell>
  );
}
