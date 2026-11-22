import React, { useEffect, useMemo, useState } from 'react';
import { refundedIds } from '../common/refundPairs';
import { api } from '../../services/dataAPI';
import { useLedger } from '../../hooks/LedgerContext';
import { errorMessage, readLocal, writeLocal } from '../common/format';
import Amount from '../common/Amount';
import FundChip from '../common/FundChip';
import { currencyRowStyle } from '../../utils/currencyStyle';
import { EntryComment } from '../common/CommentText';
import ExcludeSwitch from '../common/ExcludeSwitch';
import BulkBar from '../common/BulkBar';
import ConfirmDialog from '../common/ConfirmDialog';
import { useSelection } from '../../hooks/useSelection';
import PartyChip from '../common/PartyChip';
import CategoryTag from '../common/CategoryTag';
import { ChipScopeContext } from '../common/chipUtil';
import QuantityPriceText from '../common/QuantityPriceText';
import LockIcon from '../ledger/LockIcon';
import { btnPrimary, btnSecondary, btnDanger, inputCls, Toggle } from '../settings/ui';
import MultiSelect, { NONE } from '../common/MultiSelect';
import Summary, { Row } from './Summary';
import ProjectForm from './ProjectForm';
import EntryForm from './EntryForm';
import { kindBadge, dateRange, BudgetBar, labelOf } from './shared';
import Select from '../common/Select';

const Status = ({ e }) => (
  <>
    <span className={`rounded px-1.5 py-0.5 text-xs ${e.status === 'paid' ? 'bg-muted text-positive' : 'bg-muted text-muted-foreground'}`}>
      {e.status || 'pending'}
    </span>
    {e.status === 'paid' && e.paidDate && <span className="ml-1 text-xs text-muted-foreground">{e.paidDate}</span>}
    {e.exclude && <span className="ml-1 rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">excluded</span>}
  </>
);

const RefundedBadge = () => <span title="Balanced by a matching entry" className="mr-1 inline-flex items-center gap-1 rounded bg-accent/10 px-1.5 py-0.5 text-xs font-medium text-accent">⚖ Balanced</span>;

export default function ProjectDetail({ id }) {
  const { book, canEdit, funds, categories, notifyChanged, isClosedDate } = useLedger();
  const [project, setProject] = useState(null);
  const [entries, setEntries] = useState([]);
  const [entryCount, setEntryCount] = useState(0);
  const [error, setError] = useState('');
  const [actionErr, setActionErr] = useState('');
  const [editing, setEditing] = useState(false);
  const [duplicating, setDuplicating] = useState(false);
  const [entryDlg, setEntryDlg] = useState(null); // { entry } (entry null = new)
  const [n, setN] = useState(0);
  const [fCat, setFCat] = useState([]);
  const [fParty, setFParty] = useState([]);
  // The "other fund" note can be dismissed on this device; it comes back if the number of such entries changes.
  const fundNoteKey = `ledger.fundNote.${book.id}.${id}`;
  const [fundNoteSeen, setFundNoteSeen] = useState(() => readLocal(fundNoteKey));
  const [fStatus, setFStatus] = useState('');
  const [fDir, setFDir] = useState('');
  const [catView, setCatView] = useState('net');
  const [inclEx, setInclEx] = useState(true); // count excluded entries in this project's own figures
  const [fQ, setFQ] = useState('');
  const [fMeta, setFMeta] = useState({}); // key -> values[]
  // Open confirmation: 'move' (stray entries) or 'delete' (project), otherwise null.
  const [confirmAction, setConfirmAction] = useState(null);
  const [confirmBusy, setConfirmBusy] = useState(false);

  useEffect(() => {
    let off = false;
    Promise.all([
      api.get(`/books/${book.id}/projects/${id}`),
      api.get(`/books/${book.id}/entries`, { params: { project: id, pageSize: 500 } }),
    ]).then(([p, e]) => {
      if (off) return;
      setProject(p.data); setEntries(e.data.rows || []); setEntryCount(e.data.count || (e.data.rows || []).length); setError('');
    }).catch(ex => { if (!off) setError(errorMessage(ex)); });
    return () => { off = true; };
  }, [book.id, id, n]);

  const keys = project?.metaKeys || [];
  const metaOpts = useMemo(() => {
    const o = {};
    keys.forEach(k => { o[k] = [...new Set(entries.map(e => e.meta?.[k]).filter(Boolean))].sort().map(v => ({ value: v, label: v })); });
    return o;
  }, [entries, keys.join('|')]); // eslint-disable-line react-hooks/exhaustive-deps
  const catOpts = useMemo(() => {
    const m = new Map();
    entries.forEach(e => { if (e.categoryId) m.set(e.categoryId, e.categoryName || e.categoryId); });
    return [...m].map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label));
  }, [entries]);
  const partyOpts = useMemo(() => {
    const m = new Map();
    entries.forEach(e => { if (e.partyId) m.set(e.partyId, e.partyName || e.partyId); });
    return [...m].map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label));
  }, [entries]);
  const refunded = useMemo(() => refundedIds(entries), [entries]);
  const q = fQ.trim().toLowerCase();
  // The direction filter only narrows the list; the summary keeps both directions so out, in and net stay visible.
  const scoped = entries.filter(e =>
    (!fCat.length || fCat.includes(e.categoryId || NONE)) &&
    (!fParty.length || fParty.includes(e.partyId || NONE)) &&
    (!fStatus || (e.status || 'pending') === fStatus) &&
    (!q || `${e.comment || ''} ${e.categoryName || ''} ${Object.values(e.meta || {}).join(' ')}`.toLowerCase().includes(q)) &&
    keys.every(k => !(fMeta[k] || []).length || fMeta[k].includes(e.meta?.[k])));
  const filtered = fDir ? scoped.filter(e => e.direction === fDir) : scoped;
  const sumActive = (fCat.length ? 1 : 0) + (fParty.length ? 1 : 0) + (fStatus ? 1 : 0) + (q ? 1 : 0) + keys.filter(k => (fMeta[k] || []).length).length;
  const activeF = (fCat.length ? 1 : 0) + (fParty.length ? 1 : 0) + (fStatus ? 1 : 0) + (fDir ? 1 : 0) + (q ? 1 : 0) + keys.filter(k => (fMeta[k] || []).length).length;
  const clearF = () => { setFCat([]); setFParty([]); setFStatus(''); setFDir(''); setFQ(''); setFMeta({}); };
  // Clicking a person or category on an entry filters this project (not the ledger).
  const chipScope = {
    keys: ['party', 'category'],
    filters: { party: fParty, category: fCat },
    toggle: (key, id) => (key === 'party' ? setFParty : setFCat)(list => (list.includes(id) ? list.filter(x => x !== id) : [...list, id])),
    only: (key, id) => (key === 'party' ? setFParty : setFCat)([id]),
  };
  const canSelect = e => !e.linkId && !isClosedDate(e.date);
  const selection = useSelection(filtered, canSelect);

  const back = <a href="#/projects" className="text-sm text-accent underline">&larr; Projects</a>;
  if (error) return <section className="space-y-3">{back}<p role="alert" className="text-sm text-negative">{error}</p></section>;
  if (!project) return <section className="space-y-3">{back}<p className="text-sm text-muted-foreground">Loading...</p></section>;

  const fund = funds.find(f => f.id === project.fundId);
  const cur = fund?.currency || book.baseCurrency;
  const foreign = cur !== book.baseCurrency;
  const t0srv = project.totals;
  // Sums debit minus credit; excluded rows only count as Excluded. Only entries of one currency are summed.
  const sumRows = rows => rows.reduce((a, e) => {
    const v = e.direction === 'cr' ? -e.amount : e.amount;
    if (e.exclude) a.excluded += v;
    if (!e.exclude || inclEx) { a.spent += v; if (e.direction === 'cr') a.in += e.amount; else a.out += e.amount; if (e.status === 'paid') a.paid += v; else a.pending += v; }
    a.count += 1; return a;
  }, { spent: 0, out: 0, in: 0, paid: 0, pending: 0, excluded: 0, count: 0 });
  const rowCur = e => e.currency || cur;
  const currencies = [...new Set(entries.map(rowCur))];
  // Totals currency: base for server totals; fund currency for client totals (foreign fund or active filters).
  const clientMode = foreign || sumActive > 0;
  const sumCurrency = currencies.includes(cur) || !currencies.length ? cur : currencies[0];
  const withEx = x => (inclEx ? {
    ...x, out: x.out + x.exOut, in: x.in + x.exIn, spent: x.spent + x.exOut - x.exIn,
    paid: x.paid + x.exPaid, pending: x.pending + x.exPending
  } : x);
  const t0 = clientMode ? sumRows(entries.filter(e => rowCur(e) === sumCurrency)) : withEx(t0srv);
  const t = sumActive ? sumRows(scoped.filter(e => rowCur(e) === sumCurrency)) : t0;
  const lt = sumRows(filtered.filter(e => rowCur(e) === sumCurrency));
  const totalCur = clientMode ? sumCurrency : book.baseCurrency;
  const mixed = clientMode && currencies.length > 1;
  const lbl = k => labelOf(project, k);
  const closed = project.status === 'closed';
  const refresh = () => { setN(x => x + 1); notifyChanged(); };
  // Per category: out/in count in the ledger; exOut/exIn are the excluded entries. Three views of the same rows.
  const catRows = project.byCategory || [];
  const hasEx = catRows.some(c => c.exOut > 0 || c.exIn > 0) || t0srv.exOut > 0 || t0srv.exIn > 0 || entries.some(e => e.exclude);
  const hasIn = catRows.some(c => c.in > 0 || c.exIn > 0) || entries.some(e => e.direction === 'cr');
  const view = catView === 'counted' && !hasEx ? (hasIn ? 'net' : 'out') : catView === 'net' && !hasIn ? 'out' : catView;
  const catAmt = c => (view === 'out' ? c.out + c.exOut
    : view === 'net' ? c.amount + c.exOut - c.exIn : c.amount);
  const cats = catRows.filter(c => (view === 'out' ? c.out + c.exOut > 0 : view === 'net' ? c.out + c.exOut + c.in + c.exIn > 0 : c.out + c.in > 0))
    .sort((x, y) => catAmt(y) - catAmt(x));
  const maxCat = Math.max(1, ...cats.map(c => Math.abs(catAmt(c))));

  // Entries still in another fund than the project's (e.g. the project's fund was changed later). Linked legs stay put.
  const stray = entries.filter(e => e.fundId !== project.fundId && !e.linkId);
  const strayFunds = [...new Set(stray.map(e => e.fundName).filter(Boolean))];
  const showFundNote = canEdit && stray.length > 0 && !closed && fundNoteSeen !== String(stray.length);
  const dismissFundNote = () => { writeLocal(fundNoteKey, String(stray.length)); setFundNoteSeen(String(stray.length)); };
  const moveFrom = strayFunds.length ? ` from ${strayFunds.join(', ')}` : '';
  const moveMessage = `Move ${stray.length} ${stray.length === 1 ? 'entry' : 'entries'}${moveFrom} to ${project.fundName}?\n\nThis changes the balance of both funds from each entry's date onward. Entries in a closed year cannot be moved until that year is reopened.`;
  const moveStray = () => setConfirmAction('move');
  const runMoveStray = async () => {
    setConfirmBusy(true);
    setActionErr('');
    try { await api.put(`/books/${book.id}/projects/${id}`, { moveEntries: true }); refresh(); }
    catch (ex) { setActionErr(errorMessage(ex)); }
    setConfirmBusy(false);
    setConfirmAction(null);
  };
  const toggleClosed = () => setConfirmAction('toggle');
  const runToggleClosed = async () => {
    setConfirmBusy(true);
    setActionErr('');
    try { await api.put(`/books/${book.id}/projects/${id}`, { status: closed ? 'open' : 'closed' }); refresh(); }
    catch (ex) { setActionErr(errorMessage(ex)); }
    setConfirmBusy(false);
    setConfirmAction(null);
  };
  const del = () => setConfirmAction('delete');
  const runDelete = async () => {
    setConfirmBusy(true);
    setActionErr('');
    try { await api.delete(`/books/${book.id}/projects/${id}`); notifyChanged(); window.location.hash = '#/projects'; }
    catch (ex) { setActionErr(errorMessage(ex)); }
    setConfirmBusy(false);
    setConfirmAction(null);
  };
  const pick = e => { if (!isClosedDate(e.date)) setEntryDlg({ entry: e }); };
  const rowCls = e => (isClosedDate(e.date) ? '' : 'cursor-pointer hover:bg-muted/60');
  const lock = e => isClosedDate(e.date) && <LockIcon year={e.date.slice(0, 4)} className="mr-1 align-[-1px]" />;

  const memo = fund?.kind === 'memo';
  const remaining = project.budget ? project.budget - t.spent : null;
  return (
    <div className="min-w-0 lg:grid lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start lg:gap-4">
    <section className="min-w-0 space-y-4 pb-20 lg:pb-0">
      {back}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-xl font-semibold text-foreground">{project.name}</h2>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <span className={kindBadge}>{project.kind}</span>
            <span className={kindBadge}>{project.status}</span>
            <FundChip fund={fund} fundId={project.fundId} name={project.fundName} />
            <span>{dateRange(project)}</span>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <a href={`#/ledger?project=${encodeURIComponent(project.id)}&year=all`} className={btnSecondary}>View in Ledger</a>
        {canEdit && (<>
            <button type="button" className={btnSecondary} onClick={() => setEditing(true)}>Edit</button>
            <button type="button" className={btnSecondary} onClick={() => setDuplicating(true)}>Duplicate</button>
            <button type="button" className={btnSecondary} onClick={toggleClosed}>{closed ? 'Reopen' : 'Close'}</button>
            {t0srv.count === 0 && <button type="button" className={btnDanger} onClick={del}>Delete</button>}
        </>)}
        </div>
      </div>
      <p className="inline-block rounded-full bg-muted px-3 py-1 text-sm text-muted-foreground">
        {memo ? `Tracked only \u2014 ${project.fundName} is a memo fund and isn't part of your money`
          : `All ${t0srv.count} ${t0srv.count === 1 ? 'entry is' : 'entries are'} part of the ${project.fundName} fund's balance`}
      </p>
      {showFundNote && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-3 text-sm" role="status">
          <p className="min-w-0 flex-1 text-muted-foreground">
            <span className="text-foreground">{stray.length} of {entries.length} {entries.length === 1 ? 'entry is' : 'entries are'} in {strayFunds.join(', ') || 'another fund'}</span>
            {' '}instead of {project.fundName}. That is fine for older entries: {project.fundName} is only where new entries go.
            Move them only if they really belong there; a move changes the balance of both funds.
          </p>
          <div className="flex shrink-0 gap-2">
            <button type="button" className={btnSecondary} onClick={dismissFundNote}>Dismiss</button>
            <button type="button" className={btnSecondary} onClick={moveStray}>Move to {project.fundName}</button>
          </div>
        </div>
      )}
      {actionErr && <p role="alert" className="text-sm text-negative">{actionErr}</p>}

      {foreign && <p className="text-sm text-muted-foreground">Totals shown in {book.baseCurrency}; this project's entries are in {cur}</p>}
      {!!catRows.length && (
        <div className="rounded-lg border border-border bg-card p-3">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-medium text-foreground">By category ({book.baseCurrency})</h3>
            {(hasEx || hasIn) && <div className="flex gap-1 rounded-lg bg-muted/50 p-0.5 text-xs" role="group" aria-label="Category amounts">
              {[['out', 'Total spent'], ...(hasIn ? [['net', 'After refunds']] : []), ...(hasEx ? [['counted', 'Counted only']] : [])].map(([k, l]) => (
                <button key={k} type="button" aria-pressed={view === k} onClick={() => setCatView(k)}
                  className={`rounded-md px-2 py-1 ${view === k ? 'bg-card font-medium shadow-sm' : 'text-muted-foreground'}`} style={{ border: 0, background: view === k ? undefined : 'transparent' }}>{l}</button>
              ))}
            </div>}
          </div>
          <ul className="space-y-2" style={{ listStyle: 'none' }}>
            {cats.map(c => (
              <li key={c.categoryId || 'none'}>
                <div className="flex justify-between gap-2 text-sm">
                  <span className="truncate">{c.name || '(none)'}
                    <span className="ml-2 text-xs text-muted-foreground">
                      {view !== 'out' && (c.in + c.exIn > 0) && <span>in <Amount currency={book.baseCurrency} minor={view === 'net' ? c.in + c.exIn : c.in} /></span>}
                      {view !== 'out' && (c.in + c.exIn > 0) && view !== 'counted' && c.exOut + c.exIn > 0 && ' · '}
                      {view !== 'counted' && c.exOut + c.exIn > 0 && <span>excluded <Amount currency={book.baseCurrency} minor={c.exOut - c.exIn} /></span>}
                    </span>
                  </span>
                  <Amount currency={book.baseCurrency} minor={catAmt(c)} />
                </div>
                <div className="h-2 w-full overflow-hidden rounded bg-muted">
                  <div className="h-full bg-accent" style={{ width: `${Math.max(0, Math.round((Math.abs(catAmt(c)) / maxCat) * 100))}%` }} />
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {entryCount > entries.length && (
        <p className="text-sm text-muted-foreground" role="status">Showing the first {entries.length} of {entryCount} entries &mdash; open in Ledger for all.{' '}
          <a href={`#/ledger?project=${encodeURIComponent(project.id)}&year=all`} className="text-accent underline">View in Ledger</a></p>
      )}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-foreground">Entries</h3>
        {canEdit && !closed && <button type="button" className={btnPrimary} onClick={() => setEntryDlg({ entry: null })}>Add entry</button>}
        {canEdit && closed && <span className="text-sm text-muted-foreground">This project is closed. Reopen it to add or move entries into it.</span>}
      </div>
      {!!entries.length && (
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
            <MultiSelect label="Category" allLabel="All categories" value={fCat} onChange={setFCat} options={catOpts} noneLabel="(none)" />
            <MultiSelect label="Party" allLabel="All parties" value={fParty} onChange={setFParty} options={partyOpts} noneLabel="(none)" />
            <Select aria-label="Status" className={`${inputCls} !mt-0`} value={fStatus} onChange={e => setFStatus(e.target.value)}>
              <option value="">All statuses</option><option value="paid">Paid</option><option value="pending">Pending</option>
            </Select>
            {hasIn && <Select aria-label="Direction" className={`${inputCls} !mt-0`} value={fDir} onChange={e => setFDir(e.target.value)}>
              <option value="">Debit and credit</option><option value="dr">Debit (out)</option><option value="cr">Credit (in / refunds)</option>
            </Select>}
            <input type="search" aria-label="Search entries" placeholder="Search" className={`${inputCls} !mt-0`} value={fQ} onChange={e => setFQ(e.target.value)} />
            {keys.map(k => (
              <MultiSelect key={k} label={lbl(k)} allLabel={`All ${lbl(k).toLowerCase()}`} value={fMeta[k] || []}
                onChange={v => setFMeta(m => ({ ...m, [k]: v }))} options={metaOpts[k] || []} />
            ))}
          </div>
          {activeF > 0 && (
            <div className="text-sm text-muted-foreground">Showing {filtered.length} of {entries.length}{' '}
              <button type="button" className="text-accent underline" onClick={clearF}>Clear filters</button></div>
          )}
        </div>
      )}
      {!entries.length && <p className="text-sm text-muted-foreground">No entries.</p>}
      {!!entries.length && !filtered.length && <p className="text-sm text-muted-foreground">No entries match.</p>}

      {!!filtered.length && (
        <ChipScopeContext.Provider value={chipScope}>
          <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card" style={{ listStyle: 'none' }}>
            {filtered.map(e => (
              <li key={e.id} style={currencyRowStyle(e.currency, book.baseCurrency)} tabIndex={isClosedDate(e.date) ? undefined : 0} onClick={() => pick(e)} onKeyDown={ev => { if (ev.key === 'Enter') pick(e); }}
                className={`flex min-w-0 items-center gap-3 px-3 py-1.5 text-sm sm:gap-3 ${rowCls(e)} ${e.exclude ? 'opacity-50' : ''} ${selection.isSelected(e.id) ? 'bg-accent/10' : ''}`}>
                {canEdit && (
                  <input type="checkbox" aria-label="Select entry" checked={selection.isSelected(e.id)} onChange={() => selection.toggle(e.id)}
                    disabled={Boolean(e.linkId) || isClosedDate(e.date)}
                    title={e.linkId ? 'Linked transfer legs cannot be changed in bulk' : isClosedDate(e.date) ? 'This year is closed' : undefined}
                    onClick={ev => ev.stopPropagation()} onKeyDown={ev => ev.stopPropagation()}
                    className="size-4 shrink-0 accent-[var(--accent)]" />
                )}
                <div className="w-[4.75rem] shrink-0 whitespace-nowrap text-xs text-muted-foreground">{lock(e)}{e.date}</div>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium text-foreground" title={e.comment && !e.comment.includes('\n') ? e.comment : undefined}>
                    {refunded.has(e.id) && <RefundedBadge />}{(e.partyName || e.partyId) && (<><PartyChip partyId={e.partyId} name={e.partyName} className="uppercase" /><span className="font-normal text-muted-foreground"> - </span></>)}<EntryComment entry={e} onActivate={() => pick(e)} fallback={e.categoryName || <span className="font-normal text-muted-foreground">(no comment)</span>} />
                  </div>
                  <div className="flex flex-wrap items-center gap-x-2.5 text-xs leading-tight text-muted-foreground">
                    <CategoryTag categoryId={e.categoryId} name={e.categoryName} />
                    {keys.filter(k => e.meta?.[k]).map(k => <span key={k}>{lbl(k)}: {e.meta[k]}</span>)}
                    <Status e={e} />
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <Amount currency={e.currency || cur} minor={e.amount} tone={e.direction} className="font-semibold" />
                  <div className="text-xs text-muted-foreground"><QuantityPriceText entry={e} currency={e.currency || cur} /></div>
                </div>
                {canEdit && <ExcludeSwitch entry={e} onChanged={refresh} />}
              </li>
            ))}
          </ul>
        </ChipScopeContext.Provider>
      )}
      {!!filtered.length && <BulkBar rows={filtered} selection={selection} onDone={refresh} showStatus showProject />}

      {confirmAction === 'move' && (
        <ConfirmDialog
          title="Move entries?"
          message={<span className="whitespace-pre-line">{moveMessage}</span>}
          confirmLabel="Move"
          busy={confirmBusy}
          onConfirm={runMoveStray}
          onCancel={() => setConfirmAction(null)}
        />
      )}
      {confirmAction === 'toggle' && (
        <ConfirmDialog
          title={closed ? 'Reopen project?' : 'Close project?'}
          message={closed
            ? `Do you really want to reopen "${project.name}"? You will be able to add and move entries into it again.`
            : `Do you really want to close "${project.name}"? No entries can be added or moved into it until it is reopened.`}
          confirmLabel={closed ? 'Reopen project' : 'Close project'}
          busy={confirmBusy}
          onConfirm={runToggleClosed}
          onCancel={() => setConfirmAction(null)}
        />
      )}
      {confirmAction === 'delete' && (
        <ConfirmDialog
          title="Delete project?"
          message={`Delete project "${project.name}"?`}
          confirmLabel="Delete"
          tone="danger"
          busy={confirmBusy}
          onConfirm={runDelete}
          onCancel={() => setConfirmAction(null)}
        />
      )}
      {editing && (
        <ProjectForm bookId={book.id} project={project} funds={funds} onClose={() => setEditing(false)}
          onSaved={() => { setEditing(false); refresh(); }} />
      )}
      {duplicating && (
        <ProjectForm bookId={book.id} copyOf={project} funds={funds} onClose={() => setDuplicating(false)}
          onSaved={created => { setDuplicating(false); if (created?.id) window.location.hash = `#/projects/${created.id}`; }} />
      )}
      {entryDlg && (
        <EntryForm bookId={book.id} project={project} metaKeys={keys} labelOf={lbl} categories={categories}
          entry={entryDlg.entry} copyOf={entryDlg.copy} canEdit={canEdit} onClose={() => setEntryDlg(null)}
          onDuplicate={e => setEntryDlg({ entry: null, copy: e })}
          onSaved={() => { setEntryDlg(null); refresh(); }} />
      )}
    </section>
    <Summary title={sumActive ? 'Filtered' : 'Summary'} caption={sumActive ? `${scoped.length} of ${entries.length} entries` : `${t0.count} ${t0.count === 1 ? 'entry' : 'entries'}`}
      keyLabel={sumActive ? 'Filtered net spent' : 'Net spent'} keyMinor={t.spent} currency={totalCur}>
      {hasEx && (
        <div className="mb-3">
          <Toggle label="Include excluded" checked={inclEx} onChange={setInclEx}
            hint="Excluded entries never count in the fund balance, Ledger totals or dashboard." />
        </div>
      )}
      <Row label="Total out (debit)"><Amount currency={totalCur} minor={t.out} /></Row>
      <Row label="Total in (credit / refunds)"><Amount currency={totalCur} minor={t.in} /></Row>
      <Row label="Net spent" strong><Amount currency={totalCur} minor={t.spent} /></Row>
      <Row label="Paid"><Amount currency={totalCur} minor={t.paid} /></Row>
      <Row label="Pending"><Amount currency={totalCur} minor={t.pending} /></Row>
      <Row label="Excluded" muted><Amount currency={totalCur} minor={t.excluded} /></Row>
      {project.budget ? (
        <div className="mt-2 border-t border-border pt-2">
          <Row label="Budget"><Amount currency={cur} minor={project.budget} /></Row>
          <Row label="Remaining" strong><Amount currency={cur} minor={remaining} tone={remaining < 0 ? 'dr' : undefined} /></Row>
          <BudgetBar spent={t.spent} budget={project.budget} />
        </div>
      ) : null}
      {activeF > 0 && (
        <div className="mt-2 border-t border-border pt-2">
          <div className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Shown in list ({filtered.length})</div>
          <Row label="Out"><Amount currency={totalCur} minor={lt.out} /></Row>
          <Row label="In"><Amount currency={totalCur} minor={lt.in} /></Row>
          <Row label="Net" strong><Amount currency={totalCur} minor={lt.spent} /></Row>
        </div>
      )}
      <Row label="Entries">{sumActive ? `${scoped.length} of ${t0.count}` : t0.count}</Row>
      {mixed && <p className="mt-2 text-xs text-muted-foreground">Totals cover only the {sumCurrency} entries; other currencies are not added.</p>}
      {sumActive > 0 && <p className="mt-2 text-xs text-muted-foreground">Filtered totals cover the loaded entries only.</p>}
      {fDir && <p className="mt-2 text-xs text-muted-foreground">The list shows {fDir === 'dr' ? 'debits' : 'credits'} only; these totals include both directions.</p>}
      {foreign && !sumActive && <p className="mt-2 text-xs text-muted-foreground">Totals computed from the loaded entries in {sumCurrency}.</p>}
    </Summary>
    </div>
  );
}
