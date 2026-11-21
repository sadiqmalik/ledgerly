import React, { useEffect, useMemo, useState } from 'react';
import dataAPI, { api } from '../../services/dataAPI';
import useDebounced from '../../hooks/useDebounced';
import useHashQuery from '../../hooks/useHashQuery';
import { useLedger } from '../../hooks/LedgerContext';
import { errorMessage, todayISO } from '../common/format';
import EntryTable from './EntryTable';
import BulkBar from '../common/BulkBar';
import { useSelection } from '../../hooks/useSelection';
import EntryPanel from './EntryPanel';
import LedgerFilters from './LedgerFilters';
import TotalsBar from './TotalsBar';
import { parseFilters, serializeFilters, toParams, openingCaption, countActive } from './filterState';
import { ProfitDialog } from '../../optionalModules';
import usePageName from '../../utils/pageNames';

const PAGE_SIZE = 100;

const Skeleton = () => (
  <div aria-hidden="true" className="flex flex-col gap-2 animate-pulse">
    {[0, 1, 2, 3, 4, 5].map(i => <div key={i} className="h-8 rounded bg-muted" />)}
  </div>
);

function periodCaption(f) {
  if (f.from || f.to) return `${f.from || '...'} \u2013 ${f.to || '...'}`;
  if (!f.year.length) return 'All years';
  const ys = f.year.map(Number).sort((a, b) => a - b);
  if (ys.length === 1) return String(ys[0]);
  return ys.every((y, i) => i === 0 || y === ys[i - 1] + 1) ? `${ys[0]} \u2013 ${ys[ys.length - 1]}` : ys.join(', ');
}

export default function LedgerScreen() {
  const pageName = usePageName();
  const { book, canEdit, canQuickAdd, version, notifyChanged, openQuickAdd, openProfit, isClosedDate } = useLedger();
  const [query, setQuery] = useHashQuery();
  const filters = useMemo(() => parseFilters(query), [query]);
  const [allYears, setAllYears] = useState([]);
  const [pageState, setPageState] = useState({ key: '', page: 1 });
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState(null);
  const [draft, setDraft] = useState(null);
  const canSelect = e => !e.linkId && !isClosedDate(e.date);
  const selection = useSelection(data?.rows || [], canSelect);

  const debouncedQ = useDebounced(filters.q.trim(), 300);
  const params = useMemo(() => toParams({ ...filters, q: debouncedQ }), [filters, debouncedQ]);
  const paramKey = JSON.stringify(params);
  const rawPage = pageState.key === paramKey ? pageState.page : 1;
  const page = data ? Math.min(rawPage, Math.max(1, Math.ceil(data.count / PAGE_SIZE))) : rawPage;

  useEffect(() => {
    let cancelled = false;
    api.get(`/books/${book.id}/years`)
      .then(r => { if (!cancelled) setAllYears((Array.isArray(r.data) ? r.data : []).map(y => y.year).sort((a, b) => b - a)); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [book.id, version]);

  useEffect(() => {
    let cancelled = false;
    setError('');
    dataAPI.getEntries(book.id, { ...JSON.parse(paramKey), page, pageSize: PAGE_SIZE })
      .then(d => { if (!cancelled) setData(d); })
      .catch(err => { if (!cancelled) setError(errorMessage(err, 'Could not load entries.')); });
    return () => { cancelled = true; };
  }, [book.id, paramKey, page, version]);

  // Hint when a project/people filter finds nothing in the selected years but does elsewhere.
  const scoped = Boolean((filters.project.length || filters.party.length) && filters.year.length > 0);
  const emptyNow = Boolean(data) && data.count === 0;
  const [elsewhere, setElsewhere] = useState(0);
  useEffect(() => {
    if (!scoped || !emptyNow) { setElsewhere(0); return undefined; }
    let cancelled = false;
    const { year: _y, from: _f, to: _t, ...rest } = JSON.parse(paramKey);
    dataAPI.getEntries(book.id, { ...rest, page: 1, pageSize: 1 })
      .then(d => { if (!cancelled) setElsewhere(d.count || 0); })
      .catch(() => { if (!cancelled) setElsewhere(0); });
    return () => { cancelled = true; };
  }, [book.id, paramKey, scoped, emptyNow, version]);

  const change = patch => {
    const next = { ...filters, ...patch };
    // Picking projects while the year is still the untouched default (current year) widens to all years.
    if (!query && patch.project && patch.project.length && !('year' in patch)) next.year = [];
    const typing = Object.keys(patch).every(k => k === 'q' || k === 'min' || k === 'max');
    setQuery(serializeFilters(next), { replace: typing });
  };
  const clearAll = () => setQuery('');
  const applyView = q => setQuery(q);

  const pages = data ? Math.max(1, Math.ceil(data.count / PAGE_SIZE)) : 1;
  const first = data && data.count ? (page - 1) * PAGE_SIZE + 1 : 0;
  const last = data ? Math.min(page * PAGE_SIZE, data.count) : 0;
  const setPage = fn => setPageState({ key: paramKey, page: typeof fn === 'function' ? fn(page) : fn });
  const openings = data?.openings || [];

  return (
    <section aria-label="Ledger" className="pb-20 xl:pb-0">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <h2 className="text-lg font-semibold">{pageName('ledger')}</h2>
        {canQuickAdd && <div className="flex gap-2">{ProfitDialog && <button type="button" className="btn" onClick={openProfit}>Profit entry</button>}<button type="button" className="btn btn-primary" onClick={() => openQuickAdd()}>Add entry <span className="opacity-70 text-xs">(n)</span></button></div>}
      </div>

      <LedgerFilters filters={filters} onChange={change} onClear={clearAll} onApplyView={applyView} allYears={allYears} />

      {error && <div className="alert alert-error" role="alert">{error}</div>}
      {scoped && emptyNow && elsewhere > 0 && (
        <p className="mb-2 text-sm text-muted-foreground" role="status">
          No entries for this {filters.project.length ? 'project' : 'person'} in {filters.year.join(', ')}.{' '}
          <button type="button" className="text-accent underline" onClick={() => change({ year: [] })}>Show all years</button>
        </p>
      )}

      <div className="xl:grid xl:grid-cols-[minmax(0,1fr)_300px] xl:gap-4 xl:items-start">
        <div className="min-w-0">
          <div className="card p-0">
            <div className="p-3">
              {data ? <EntryTable rows={data.rows} openings={openings} openingCaption={openingCaption(filters)} onSelect={canEdit ? setSelected : undefined} selection={selection} /> : !error && <Skeleton />}
            </div>
          </div>
          <BulkBar rows={data?.rows || []} selection={selection} onDone={notifyChanged} showProject />
          {data && (
            <div className="flex items-center justify-between gap-2 mt-3 text-sm">
              <span className="muted">{data.count ? `${first}-${last} of ${data.count}` : '0 entries'}</span>
              <div className="flex gap-2 items-center">
                <button type="button" className="btn" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Previous</button>
                <span>Page {page} / {pages}</span>
                <button type="button" className="btn" disabled={page >= pages} onClick={() => setPage(p => p + 1)}>Next</button>
              </div>
            </div>
          )}
        </div>
        {data && (
          <TotalsBar totals={data.totals} totalsByCurrency={data.totalsByCurrency} baseCurrency={book.baseCurrency} openings={openings}
            count={data.count} caption={periodCaption(filters)} active={countActive(filters)} hasExcluded={data.rows.some(r => r.exclude)} />
        )}
      </div>

      {draft && canEdit && (
        <EntryPanel entry={draft} onClose={() => setDraft(null)} onChanged={() => { setDraft(null); notifyChanged(); }} />
      )}
      {selected && canEdit && (
        <EntryPanel entry={selected} onClose={() => setSelected(null)}
          onChanged={() => { setSelected(null); notifyChanged(); }} onLinksChanged={notifyChanged}
          onDuplicate={e => { setSelected(null); setDraft({ ...e, id: null, linkId: null, date: todayISO(), docCount: 0 }); }} />
      )}
    </section>
  );
}
