import React, { useMemo, useRef, useState } from 'react';
import useProjectNames from '../../hooks/useProjectNames';
import { useLedger } from '../../hooks/LedgerContext';
import MultiSelect, { useDismiss } from '../common/MultiSelect';
import PromptDialog from '../common/PromptDialog';
import LockIcon from './LockIcon';
import { countActive, includePrevious, hasPeriodStart, loadViews, saveViews, serializeFilters } from './filterState';

const Field = ({ label, children }) => (
  <label className="flex flex-col gap-0.5 text-xs text-muted-foreground min-w-0">{label}{children}</label>
);

function Segmented({ label, value, onChange, options }) {
  return (
    <div className="flex flex-col gap-0.5 text-xs text-muted-foreground min-w-0">
      <span>{label}</span>
      <div role="group" aria-label={label} className="flex rounded-md border border-border overflow-hidden">
        {options.map(([v, text]) => (
          <button key={v} type="button" aria-pressed={value === v} onClick={() => onChange(v)}
            className={`flex-1 px-2 py-1.5 text-xs whitespace-nowrap ${value === v ? 'bg-accent text-accent-foreground' : 'bg-background text-foreground hover:bg-muted'}`}>{text}</button>
        ))}
      </div>
    </div>
  );
}

function Views({ bookId, filters, onApply }) {
  const [open, setOpen] = useState(false);
  const [views, setViews] = useState(() => loadViews(bookId));
  const root = useRef(null);
  useDismiss(root, open, () => setOpen(false));
  const [naming, setNaming] = useState(false);
  // A blank name (or cancel) does nothing.
  const saveNamed = raw => {
    setNaming(false);
    const name = (raw || '').trim();
    if (!name) return;
    const next = { ...views, [name]: serializeFilters(filters) };
    setViews(next); saveViews(bookId, next);
  };
  const remove = name => {
    const { [name]: _gone, ...rest } = views;
    setViews(rest); saveViews(bookId, rest);
  };
  const names = Object.keys(views).sort();
  return (
    <div className="relative" ref={root}>
      <div className="flex gap-1">
        <button type="button" className="btn" onClick={() => setNaming(true)}>Save view</button>
        <button type="button" className="btn" aria-haspopup="menu" aria-expanded={open} onClick={() => { setViews(loadViews(bookId)); setOpen(o => !o); }}>Views &#9662;</button>
      </div>
      {open && (
        <div role="menu" className="absolute right-0 z-40 mt-1 w-64 max-w-[90vw] rounded-lg border border-border bg-card shadow-lg py-1">
          {!names.length && <p className="px-3 py-2 text-sm text-muted-foreground">No saved views.</p>}
          {names.map(n => (
            <div key={n} className="flex items-center hover:bg-muted">
              <button type="button" role="menuitem" className="flex-1 text-left px-3 py-2 text-sm truncate" style={{ background: 'transparent', border: 0 }}
                onClick={() => { onApply(views[n]); setOpen(false); }}>{n}</button>
              <button type="button" aria-label={`Delete view ${n}`} className="px-3 py-2 text-negative" style={{ background: 'transparent', border: 0 }} onClick={() => remove(n)}>&times;</button>
            </div>
          ))}
        </div>
      )}
      {naming && (
        <PromptDialog
          title="Save view"
          label="Name for this view"
          confirmLabel="Save view"
          onSubmit={saveNamed}
          onCancel={() => setNaming(false)}
        />
      )}
    </div>
  );
}

export default function LedgerFilters({ filters, onChange, onClear, onApplyView, allYears }) {
  const { book, funds, categories, parties, closedYears } = useLedger();
  const projectNames = useProjectNames();
  const active = countActive(filters);
  const hiddenActive = ['kind', 'currency'].some(k => filters[k].length)
    || ['status', 'exclude', 'linked', 'min', 'max', 'from', 'to', 'sort'].some(k => filters[k]);
  const [more, setMore] = useState(hiddenActive);

  const KINDS = ['general', 'reserved', 'custodial', 'investment', 'memo'];
  const fundOpts = useMemo(() => funds.map(f => ({ value: f.id, label: f.name, group: f.kind })), [funds]);
  const kindOpts = KINDS.map(k => ({ value: k, label: k }));
  const catOpts = useMemo(() => categories.map(c => ({ value: c.id, label: c.name })), [categories]);
  const partyOpts = useMemo(() => parties.map(p => ({ value: p.id, label: p.name })), [parties]);
  const projOpts = useMemo(() => Object.entries(projectNames).map(([id, p]) => ({ value: id, label: p.name })), [projectNames]);
  const curOpts = useMemo(() => {
    const others = [...new Set(funds.map(f => f.currency))].filter(c => c && c !== book.baseCurrency).sort();
    return [book.baseCurrency, ...others].filter(Boolean).map(c => ({ value: c, label: c === book.baseCurrency ? `${c} (base)` : c }));
  }, [funds, book.baseCurrency]);

  // Memo funds are hidden by the API unless kind includes 'memo'. An empty kind list means "all but memo",
  // so ticking the box with no kinds selected sends every kind.
  const toggleMemo = (kinds, on) => {
    if (on) return kinds.length ? [...kinds, 'memo'] : [...KINDS];
    const rest = kinds.filter(k => k !== 'memo');
    return rest.length === KINDS.length - 1 ? [] : rest;
  };
  const set = k => e => onChange({ [k]: e.target.value });
  const toggleYear = (y, multi) => {
    const s = String(y);
    if (multi) onChange({ year: filters.year.includes(s) ? filters.year.filter(x => x !== s) : [...filters.year, s].sort(), from: '', to: '' });
    else onChange({ year: filters.year.length === 1 && filters.year[0] === s ? [] : [s], from: '', to: '' });
  };
  const [multi, setMulti] = useState(false);
  const chip = on => `btn px-3 py-1 ${on ? 'btn-primary' : ''}`;
  const prevOn = includePrevious(filters);
  const canPrev = hasPeriodStart(filters);

  return (
    <div className="mb-3 space-y-2">
      <div className="flex flex-wrap items-center gap-1" role="group" aria-label="Years">
        {allYears.map(y => (
          <button key={y} type="button" aria-pressed={filters.year.includes(String(y))} className={chip(filters.year.includes(String(y)))}
            onClick={e => toggleYear(y, multi || e.ctrlKey || e.metaKey)}>{y}{closedYears.has(Number(y)) && <LockIcon year={y} className="ml-1 align-[-1px] !text-current opacity-70" />}</button>
        ))}
        <button type="button" aria-pressed={!filters.year.length} className={chip(!filters.year.length)} onClick={() => onChange({ year: [] })}>All</button>
        <label className="flex items-center gap-1 ml-2 text-xs text-muted-foreground" title="Add years instead of replacing (or Ctrl/Cmd-click)">
          <input type="checkbox" checked={multi} onChange={e => setMulti(e.target.checked)} /> multi
        </label>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <Field label="Fund"><MultiSelect label="Fund" allLabel="All funds" options={fundOpts} value={filters.fund} onChange={v => onChange({ fund: v })} /></Field>
        <Field label="Category"><MultiSelect label="Category" allLabel="All categories" noneLabel="(none)" options={catOpts} value={filters.category} onChange={v => onChange({ category: v })} /></Field>
        <Field label="People"><MultiSelect label="People" allLabel="All people" noneLabel="(none)" options={partyOpts} value={filters.party} onChange={v => onChange({ party: v })} /></Field>
        <Field label="Project"><MultiSelect label="Project" allLabel="All projects" noneLabel="(none)" options={projOpts} value={filters.project} onChange={v => onChange({ project: v })} /></Field>
        <Field label="Search"><input type="search" value={filters.q} onChange={set('q')} placeholder="Comment or person" /></Field>
        <Segmented label="Direction" value={filters.direction} onChange={v => onChange({ direction: v })} options={[['', 'All'], ['cr', 'Credit'], ['dr', 'Debit']]} />
      </div>

      {more && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <div className="flex flex-col gap-1 min-w-0">
            <Field label="Fund kind"><MultiSelect label="Fund kind" allLabel={filters.fund.length ? 'All kinds' : 'All (memo hidden)'} searchable={false} options={kindOpts} value={filters.kind} onChange={v => onChange({ kind: v })} /></Field>
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <input type="checkbox" checked={filters.kind.includes('memo')} onChange={e => onChange({ kind: toggleMemo(filters.kind, e.target.checked) })} /> Show memo funds
            </label>
          </div>
          <Field label="Currency"><MultiSelect label="Currency" allLabel="All currencies" searchable={false} options={curOpts} value={filters.currency} onChange={v => onChange({ currency: v })} /></Field>
          <Field label="Sort">
            <select value={filters.sort} onChange={set('sort')}>
              <option value="">Newest first</option><option value="date_asc">Oldest first</option>
              <option value="amount_desc">Largest amount</option><option value="amount_asc">Smallest amount</option>
            </select>
          </Field>
          <Segmented label="Status" value={filters.status} onChange={v => onChange({ status: v })} options={[['', 'All'], ['paid', 'Paid'], ['pending', 'Pending']]} />
          <Segmented label="Excluded" value={filters.exclude} onChange={v => onChange({ exclude: v })} options={[['', 'All'], ['0', 'Included only'], ['1', 'Excluded only']]} />
          <Segmented label="Linked" value={filters.linked} onChange={v => onChange({ linked: v })} options={[['', 'All'], ['1', 'Only transfers'], ['0', 'No transfers']]} />
          <div className="hidden md:block" />
          <Field label="Min amount"><input inputMode="decimal" value={filters.min} onChange={set('min')} placeholder="0" /></Field>
          <Field label="Max amount"><input inputMode="decimal" value={filters.max} onChange={set('max')} placeholder="any" /></Field>
          <Field label="From"><input type="date" min="1900-01-01" max="9999-12-31" value={filters.from} onChange={e => onChange({ from: e.target.value, ...(e.target.value ? { year: [] } : {}) })} /></Field>
          <Field label="To"><input type="date" min="1900-01-01" max="9999-12-31" value={filters.to} onChange={e => onChange({ to: e.target.value, ...(e.target.value ? { year: [] } : {}) })} /></Field>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" className="btn" aria-expanded={more} onClick={() => setMore(m => !m)}>{more ? 'Fewer filters' : 'More filters'}</button>
          <button type="button" className="btn" onClick={onClear} disabled={!active && filters.year.length === 1 && filters.year[0] === String(new Date().getFullYear())}>Clear all</button>
          <span className="text-xs text-muted-foreground" aria-live="polite">{active ? `${active} active filter${active > 1 ? 's' : ''}` : 'No filters'}</span>
          <label className={`flex items-center gap-1.5 text-sm ${canPrev ? '' : 'opacity-50'}`}>
            <input type="checkbox" disabled={!canPrev} checked={canPrev && prevOn} onChange={e => onChange({ prev: e.target.checked ? '1' : '0' })} /> Include previous balance
          </label>
        </div>
        <Views bookId={book.id} filters={filters} onApply={onApplyView} />
      </div>
    </div>
  );
}
