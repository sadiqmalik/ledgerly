import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../services/dataAPI';
import { useLedger } from '../../hooks/LedgerContext';
import { errorMessage } from '../common/format';
import Amount from '../common/Amount';
import MultiSelect from '../common/MultiSelect';
import { inputCls, btnPrimary, btnSecondary } from '../settings/ui';
import ProjectForm from './ProjectForm';
import ProjectCard from './ProjectCard';
import Summary, { Row, Breakdown } from './Summary';
import { KINDS, dateRange, projectYears, chipCls } from './shared';

const list = (p, k) => (p.get(k) || '').split(',').filter(Boolean);

// #/projects?kind=&fund=&status=&year=&q=&sort= ; no status means open, status=all means both.
function readHash() {
  const p = new URLSearchParams((window.location.hash.split('?')[1]) || '');
  const status = list(p, 'status');
  return {
    kind: list(p, 'kind'), fund: list(p, 'fund'), year: list(p, 'year'), q: p.get('q') || '', sort: p.get('sort') || 'newest',
    status: p.get('status') === 'all' ? [] : status.length ? status : ['open'],
  };
}
function writeHash(f) {
  const p = new URLSearchParams();
  ['kind', 'fund', 'year'].forEach(k => { if (f[k].length) p.set(k, f[k].join(',')); });
  if (!f.status.length) p.set('status', 'all'); else if (!(f.status.length === 1 && f.status[0] === 'open')) p.set('status', f.status.join(','));
  if (f.q) p.set('q', f.q);
  if (f.sort !== 'newest') p.set('sort', f.sort);
  const s = p.toString();
  window.history.replaceState(null, '', `#/projects${s ? `?${s}` : ''}`);
}

const SORTS = { newest: 'Newest', spent: 'Net spent (high to low)', name: 'Name' };
const sumOf = ps => ps.reduce((a, p) => ({
  count: a.count + 1, spent: a.spent + p.totals.spent, out: a.out + (p.totals.out || 0), in: a.in + (p.totals.in || 0), paid: a.paid + p.totals.paid,
  pending: a.pending + p.totals.pending, excluded: a.excluded + p.totals.excluded, entries: a.entries + p.totals.count,
}), { count: 0, spent: 0, out: 0, in: 0, paid: 0, pending: 0, excluded: 0, entries: 0 });

export default function ProjectList() {
  const { book, canEdit, funds, version } = useLedger();
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');
  const [f, setF] = useState(readHash);
  const [picked, setPicked] = useState([]);
  const [compare, setCompare] = useState(false);
  const [creating, setCreating] = useState(false);
  const [n, setN] = useState(0);

  useEffect(() => {
    let off = false;
    api.get(`/books/${book.id}/projects`, { params: { all: 1 } })
      .then(r => { if (!off) { setRows(r.data); setError(''); } })
      .catch(e => { if (!off) setError(errorMessage(e)); });
    return () => { off = true; };
  }, [book.id, version, n]);

  // Clicking the Projects nav link (or back/forward) re-reads the filters from the hash.
  useEffect(() => {
    const on = () => { if (window.location.hash.startsWith('#/projects') && !/^#\/projects\/[^?]/.test(window.location.hash)) setF(readHash()); };
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);

  const set = patch => setF(s => { const next = { ...s, ...patch }; writeHash(next); return next; });
  const open = useCallback(id => { window.location.hash = `#/projects/${id}`; }, []);
  const fundOf = id => funds.find(x => x.id === id);
  const curOf = p => fundOf(p.fundId)?.currency || book.baseCurrency;
  const foreign = p => curOf(p) !== book.baseCurrency;

  const fundOpts = useMemo(() => funds.map(x => ({ value: x.id, label: x.name, group: x.kind })), [funds]);
  const kindList = useMemo(() => [...new Set([...KINDS, ...(rows || []).map(p => p.kind)])], [rows]);
  const years = useMemo(() => [...new Set((rows || []).flatMap(projectYears))].sort().reverse(), [rows]);

  const shown = useMemo(() => {
    const q = f.q.trim().toLowerCase();
    const out = (rows || []).filter(p =>
      (!f.kind.length || f.kind.includes(p.kind)) && (!f.fund.length || f.fund.includes(p.fundId)) &&
      (!f.status.length || f.status.includes(p.status === 'closed' ? 'closed' : 'open')) &&
      (!f.year.length || projectYears(p).some(y => f.year.includes(y))) &&
      (!q || `${p.name} ${p.fundName}`.toLowerCase().includes(q)));
    const key = p => p.startsOn || p.endsOn || '';
    out.sort(f.sort === 'spent' ? (a, b) => b.totals.spent - a.totals.spent
      : f.sort === 'name' ? (a, b) => a.name.localeCompare(b.name)
        : (a, b) => key(b).localeCompare(key(a)) || a.name.localeCompare(b.name));
    return out;
  }, [rows, f]);

  const sel = shown.filter(p => picked.includes(p.id));
  const useSel = sel.length >= 2;
  const scope = useSel ? sel : shown;
  const tot = sumOf(scope);
  const active = f.kind.length + f.fund.length + f.year.length + (f.q ? 1 : 0) + (f.status.length === 1 && f.status[0] === 'open' ? 0 : 1);

  const breakdown = keyFn => {
    const m = new Map();
    scope.forEach(p => { const k = keyFn(p); m.set(k.key, { ...k, minor: (m.get(k.key)?.minor || 0) + p.totals.spent }); });
    const max = Math.max(1, ...[...m.values()].map(i => Math.abs(i.minor)));
    return [...m.values()].sort((a, b) => b.minor - a.minor).map(i => ({ ...i, share: Math.abs(i.minor) / max }));
  };
  const byKind = breakdown(p => ({ key: p.kind, label: p.kind }));
  const byFund = breakdown(p => ({ key: p.fundId, label: p.fundName, note: fundOf(p.fundId)?.kind === 'memo' ? 'memo, not in balance' : undefined }));

  const toggle = id => setPicked(s => (s.includes(id) ? s.filter(x => x !== id) : [...s, id]));
  const clearAll = () => { setF({ kind: [], fund: [], year: [], q: '', sort: f.sort, status: ['open'] }); writeHash({ kind: [], fund: [], year: [], q: '', sort: f.sort, status: ['open'] }); };

  const summary = (
    <>
      {!!(useSel || active) && (
        <p className="mb-2 text-xs text-muted-foreground">{useSel ? 'Totals of the selected projects only.' : 'Totals of the filtered projects.'}</p>
      )}
      <Row label="Projects">{tot.count}</Row>
      <Row label="Total out (debit)"><Amount minor={tot.out} currency={book.baseCurrency} /></Row>
      <Row label="Total in (credit / refunds)"><Amount minor={tot.in} currency={book.baseCurrency} /></Row>
      <Row label="Net spent" strong><Amount minor={tot.spent} currency={book.baseCurrency} /></Row>
      <Row label="Paid"><Amount minor={tot.paid} currency={book.baseCurrency} /></Row>
      <Row label="Pending"><Amount minor={tot.pending} currency={book.baseCurrency} /></Row>
      <Row label="Excluded" muted><Amount minor={tot.excluded} currency={book.baseCurrency} /></Row>
      {useSel && (
        <div className="mt-2 flex gap-2">
          <button type="button" className={btnSecondary} aria-pressed={compare} onClick={() => setCompare(c => !c)}>Compare</button>
          <button type="button" className={btnSecondary} onClick={() => { setPicked([]); setCompare(false); }}>Unselect</button>
        </div>
      )}
      {useSel && compare && (
        <div className="mt-2 overflow-x-auto">
          <table className="w-full text-xs">
            <thead><tr className="border-b border-border text-left text-muted-foreground">
              <th className="py-1 pr-2 font-medium">Project</th><th className="pr-2 text-right font-medium">Out</th><th className="pr-2 text-right font-medium">In</th><th className="pr-2 text-right font-medium">Net</th><th className="pr-2 text-right font-medium">Paid</th>
              <th className="pr-2 text-right font-medium">Pending</th><th className="pr-2 text-right font-medium">Excl.</th><th className="pr-2 text-right font-medium">Entries</th><th className="font-medium">Dates</th>
            </tr></thead>
            <tbody>{sel.map(p => (
              <tr key={p.id} className="border-b border-border">
                <td className="max-w-[7rem] truncate py-1 pr-2" title={p.name}>{p.name}</td>
                <td className="pr-2 text-right"><Amount currency={book.baseCurrency} minor={p.totals.out} /></td><td className="pr-2 text-right"><Amount currency={book.baseCurrency} minor={p.totals.in} /></td><td className="pr-2 text-right"><Amount currency={book.baseCurrency} minor={p.totals.spent} /></td><td className="pr-2 text-right"><Amount currency={book.baseCurrency} minor={p.totals.paid} /></td>
                <td className="pr-2 text-right"><Amount currency={book.baseCurrency} minor={p.totals.pending} /></td><td className="pr-2 text-right"><Amount currency={book.baseCurrency} minor={p.totals.excluded} /></td>
                <td className="pr-2 text-right">{p.totals.count}</td><td className="whitespace-nowrap">{dateRange(p)}</td>
              </tr>))}</tbody>
          </table>
          {sel.some(foreign) && <p className="mt-1 text-xs text-muted-foreground">Totals shown in {book.baseCurrency}; some of these projects' entries are in another currency.</p>}
        </div>
      )}
      <Breakdown title="By kind" items={byKind} />
      <Breakdown title="By fund" items={byFund} />
      <p className="mt-3 text-xs text-muted-foreground">A project is a tag on ordinary entries, so its spend is already in its fund and the Ledger. Memo funds are tracked only.</p>
    </>
  );

  return (
    <div className="min-w-0 lg:grid lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start lg:gap-4 lg:p-6 lg:pr-6">
      <section className="min-w-0 space-y-4 p-4 pb-20 sm:p-6 lg:p-0 lg:pb-0">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-xl font-semibold text-foreground">Projects</h2>
          {canEdit && <button type="button" className={btnPrimary} onClick={() => setCreating(true)}>New project</button>}
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-5">
          <MultiSelect label="Kind" allLabel="All kinds" value={f.kind} onChange={v => set({ kind: v })} searchable={false}
            options={kindList.map(k => ({ value: k, label: k }))} />
          <MultiSelect label="Fund" allLabel="All funds" value={f.fund} onChange={v => set({ fund: v })} options={fundOpts} />
          <MultiSelect label="Status" allLabel="Open and closed" value={f.status} onChange={v => set({ status: v })} searchable={false}
            options={[{ value: 'open', label: 'open' }, { value: 'closed', label: 'closed' }]} />
          <input type="search" aria-label="Search projects" placeholder="Search" className={`${inputCls} !mt-0`} value={f.q} onChange={e => set({ q: e.target.value })} />
          <select aria-label="Sort" className={`${inputCls} !mt-0`} value={f.sort} onChange={e => set({ sort: e.target.value })}>
            {Object.entries(SORTS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </div>
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Year">
          <button type="button" aria-pressed={!f.year.length} className={chipCls(!f.year.length)} onClick={() => set({ year: [] })}>All years</button>
          {years.map(y => (
            <button key={y} type="button" aria-pressed={f.year.includes(y)} className={chipCls(f.year.includes(y))}
              onClick={() => set({ year: f.year.includes(y) ? f.year.filter(x => x !== y) : [...f.year, y] })}>{y}</button>
          ))}
          {active > 0 && <button type="button" className="ml-auto text-sm text-accent underline" onClick={clearAll}>Clear all</button>}
        </div>
        {error && <p role="alert" className="text-sm text-negative">{error}</p>}
        {rows && !shown.length && <p className="text-sm text-muted-foreground">No projects.</p>}
        <div className="grid items-stretch gap-3 grid-cols-[repeat(auto-fill,minmax(min(100%,18rem),1fr))]">
          {shown.map(p => (
            <ProjectCard key={p.id} project={p} fund={fundOf(p.fundId)} base={book.baseCurrency} currency={curOf(p)} foreign={foreign(p)}
              picked={picked.includes(p.id)} onToggle={toggle} onOpen={open} />
          ))}
        </div>
        {creating && (
          <ProjectForm bookId={book.id} funds={funds} kinds={kindList} onClose={() => setCreating(false)}
            onSaved={() => { setCreating(false); setN(x => x + 1); }} />
        )}
      </section>
      <Summary currency={book.baseCurrency} title={useSel ? `Selected (${sel.length})` : 'Summary'} caption={useSel ? 'Selected projects' : `${tot.count} ${tot.count === 1 ? 'project' : 'projects'}${active ? ` · ${active} filter${active > 1 ? 's' : ''} active` : ''}`}
        keyLabel={useSel ? `Selected (${sel.length}) net spent` : `${tot.count} ${tot.count === 1 ? 'project' : 'projects'} · Net spent`} keyMinor={tot.spent}>
        {summary}
      </Summary>
    </div>
  );
}
