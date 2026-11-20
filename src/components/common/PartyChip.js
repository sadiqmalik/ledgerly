import React, { useCallback, useState } from 'react';
import { api } from '../../services/dataAPI';
import { useLedger } from '../../hooks/LedgerContext';
import Amount from './Amount';
import ChipShell, { PopRow, PopAction } from './ChipShell';
import { paletteStyle, initials, useChipFilter } from './chipUtil';

const statsCache = new Map(); // `${book}:${party}` -> Promise of stats
const loadStats = (bookId, partyId, version) => {
  const k = `${bookId}:${version}:${partyId}`;
  if (!statsCache.has(k)) {
    statsCache.set(k, api.get(`/books/${bookId}/entries`, { params: { party: partyId, pageSize: 1, year: '' } })
      .then(r => ({ dr: r.data.totals?.dr || 0, cr: r.data.totals?.cr || 0, count: r.data.count || 0, last: r.data.rows?.[0]?.date || '' }))
      .catch(() => { statsCache.delete(k); return null; }));
  }
  return statsCache.get(k);
};

export default function PartyChip({ partyId, name, className = '' }) {
  const { book, parties, version, can } = useLedger();
  const chip = useChipFilter('party');
  const [stats, setStats] = useState(undefined);
  const lower = String(name || '').toLowerCase();
  const p = parties.find(x => x.id === partyId) || (name ? parties.find(x => x.name.toLowerCase() === lower) : null);
  const id = p?.id || partyId;
  const label = p?.name || name || '';
  const bookId = book.id;
  const onOpen = useCallback(() => { if (id) loadStats(bookId, id, version).then(setStats); }, [id, bookId, version]);
  if (!label) return <span className="text-muted-foreground" aria-label="No party">{'—'}</span>;

  if (!id) return <span className={`truncate text-sm ${className}`} title={label}>{label}</span>;
  if (!can('ledger')) return <span className={`truncate text-sm ${className}`} title={label}>{label}</span>;
  const active = chip.active(id);

  return (
    <ChipShell
      label={`Person ${label}`}
      title={label}
      active={active}
      onOpen={onOpen}
      className={`text-foreground ${className}`}
      onActivate={() => chip.toggle(id)}
      popover={close => (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span aria-hidden="true" className="inline-flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold" style={paletteStyle(label)}>{initials(label)}</span>
            <div className="min-w-0">
              <div className="truncate font-semibold">{label}</div>
              {p?.relation && <div className="truncate text-xs text-muted-foreground">{p.relation}</div>}
            </div>
          </div>
          <div>
            {p?.aliases?.length > 0 && <PopRow k="Aliases">{p.aliases.join(', ')}</PopRow>}
            {stats === undefined && <div className="py-0.5 text-xs text-muted-foreground">Loading...</div>}
            {stats === null && <div className="py-0.5 text-xs text-muted-foreground">Stats unavailable</div>}
            {stats && (
              <>
                <PopRow k="Given (debits)"><Amount minor={stats.dr} currency={book.baseCurrency} tone="dr" /></PopRow>
                <PopRow k="Received (credits)"><Amount minor={stats.cr} currency={book.baseCurrency} tone="cr" /></PopRow>
                <PopRow k="Entries">{stats.count}</PopRow>
                {stats.last && <PopRow k="Last entry">{stats.last}</PopRow>}
              </>
            )}
          </div>
          <div className="flex flex-col gap-1.5">
            <PopAction onClick={() => { close(); chip.only(id); }}>{chip.scoped ? 'Filter this project by' : 'Filter ledger by'} {label}</PopAction>
            {can('reports') && <PopAction onClick={() => { close(); window.location.hash = '#/reports'; }}>See in Reports</PopAction>}
          </div>
        </div>
      )}
    >
      <span className="truncate">{label}</span>
    </ChipShell>
  );
}
