import SharedBadge from '../common/SharedBadge';
import { StampFooter } from '../common/Stamp';
import React, { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../../auth/AuthContext';
import { api } from '../../services/dataAPI';
import Amount from '../common/Amount';
import ConfirmDialog from '../common/ConfirmDialog';
import { errorMessage } from '../common/format';
import { inputCls, btnPrimary, btnSecondary, btnDanger, EitherSwitches } from '../settings/ui';
import EntryDialog from './EntryDialog';
import RegisterDialog from './RegisterDialog';
import { RoleBadge, Tile, canEdit, canAdmin } from './shared';
import { notifyLoansChanged } from './useLoanRegisters';

const NONE = '__none__';
const KIND_LABEL = { taken: 'Taken', returned: 'Returned' };

function KindBadge({ kind }) {
  return (
    <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${kind === 'taken' ? 'bg-muted text-negative' : 'bg-muted text-positive'}`}>{KIND_LABEL[kind] || kind}</span>
  );
}

export default function RegisterPage({ registerId }) {
  const { account } = useAuth();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [kind, setKind] = useState('all');
  const [lenderPick, setLenderPick] = useState(null); // null = all, NONE = not assigned, else a lender name
  const [datesOpen, setDatesOpen] = useState(false);
  const [q, setQ] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [entryDlg, setEntryDlg] = useState(null);   // { entry } (entry null = add)
  const [editReg, setEditReg] = useState(false);
  const [dupReg, setDupReg] = useState(false);
  const [confirm, setConfirm] = useState(null);     // { type: 'entry'|'register', entry? }
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState('');

  const load = useCallback(async () => {
    try {
      const params = {};
      if (kind !== 'all') params.kind = kind;
      if (q.trim()) params.q = q.trim();
      if (from) params.from = from;
      if (to) params.to = to;
      const res = await api.get(`/loans/${registerId}/entries`, { params });
      setData(res.data);
      setError('');
    } catch (err) { setError(errorMessage(err)); }
  }, [registerId, kind, q, from, to]);

  useEffect(() => {
    const t = setTimeout(load, q ? 250 : 0);
    return () => clearTimeout(t);
  }, [load, q]);

  const refresh = () => { notifyLoansChanged(); return load(); };

  if (error && !data) {
    return (
      <div className="space-y-3">
        <p role="alert" className="text-sm text-negative">{error}</p>
        <a href="#/loans" className="text-sm underline">Back to loans</a>
      </div>
    );
  }
  if (!data) return <p className="text-sm text-muted-foreground" role="status">Loading...</p>;

  const reg = data.register;
  const rows = data.rows || [];
  const receiverNames = rows.map(r => r.receiver).filter(Boolean);
  const tot = reg.totals || { taken: 0, returned: 0, balance: 0, count: 0 };
  const settled = Boolean(reg.settled);
  const writable = canEdit(reg.role) && !settled;
  const admin = canAdmin(reg.role);
  const hasEntries = tot.count > 0;
  const byLender = data.byLender || [];
  const showLenders = byLender.some(l => l.lender);
  const shown = lenderPick === null ? rows : rows.filter(r => (r.lender || NONE) === lenderPick);
  const filtered = kind !== 'all' || q.trim() || from || to || lenderPick !== null;

  const setSettled = async value => {
    setBusy(true); setActionError('');
    try {
      await api.put(`/loans/${reg.id}`, { settled: value });
      notifyLoansChanged();
      setConfirm(null);
      await refresh();
    } catch (err) { setActionError(errorMessage(err)); setConfirm(null); }
    setBusy(false);
  };

  const runDelete = async () => {
    setBusy(true); setActionError('');
    try {
      if (confirm.type === 'register') {
        await api.delete(`/loans/${reg.id}`);
        notifyLoansChanged();
        window.location.hash = '#/loans';
        return;
      }
      await api.delete(`/loans/${reg.id}/entries/${confirm.entry.id}`);
      setConfirm(null);
      setEntryDlg(null);
      await refresh();
    } catch (err) { setActionError(errorMessage(err)); setConfirm(null); }
    setBusy(false);
  };

  return (
    <div className="space-y-4">
      <a href="#/loans" className="text-sm text-muted-foreground underline">&larr; Loans</a>

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_19rem]">
        <aside aria-label="Loan summary" className="space-y-3 rounded-xl border border-border bg-card p-3 lg:sticky lg:top-4 lg:col-start-2 lg:row-start-1">
          <h3 className="text-sm font-semibold">Summary</h3>
          <dl className="grid gap-2 grid-cols-[repeat(auto-fit,minmax(min(100%,9rem),1fr))] lg:grid-cols-1">
            <Tile label="Total taken"><Amount minor={tot.taken} currency={reg.currency} /></Tile>
            <Tile label="Total returned"><Amount minor={tot.returned} currency={reg.currency} /></Tile>
            <Tile label={tot.balance < 0 ? 'Overpaid by' : 'Remaining balance'}>
              <Amount minor={Math.abs(tot.balance)} currency={reg.currency} tone={tot.balance < 0 ? 'cr' : 'dr'} />
            </Tile>
          </dl>
          {showLenders && (
            <div className="space-y-2 border-t border-border pt-3">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold">By lender</h3>
                {lenderPick !== null && <button type="button" className="text-xs text-muted-foreground underline" onClick={() => setLenderPick(null)}>Show all</button>}
              </div>
              <ul className="grid gap-2 grid-cols-[repeat(auto-fill,minmax(min(100%,13rem),1fr))] lg:grid-cols-1" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                {byLender.map(l => {
                  const over = l.balance < 0;
                  const key = l.lender || NONE;
                  const on = lenderPick === key;
                  return (
                    <li key={key}>
                      <button type="button" aria-pressed={on} onClick={() => setLenderPick(on ? null : key)}
                        className={`w-full rounded-lg border px-3 py-2 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${on ? 'border-accent bg-accent/10' : 'border-border hover:bg-muted/40'}`}
                        style={{ background: on ? undefined : 'transparent', color: 'inherit' }}>
                        <span className="block truncate text-sm font-semibold">{l.lender || 'Not assigned'}</span>
                        <span aria-hidden="true" className="mt-1.5 block h-1.5 overflow-hidden rounded-full bg-muted">
                          <span className="block h-full rounded-full bg-[var(--positive)]" style={{ width: `${l.taken > 0 ? Math.min(100, Math.round((l.returned / l.taken) * 100)) : 0}%` }} />
                        </span>
                        <span className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-sm">
                          <span className="text-muted-foreground">Gave</span>
                          <span className="text-right"><Amount minor={l.taken} currency={reg.currency} /></span>
                          <span className="text-muted-foreground">Paid back</span>
                          <span className="text-right font-medium"><Amount minor={l.returned} currency={reg.currency} tone="cr" /></span>
                          <span className="border-t border-border pt-0.5 font-semibold">{over ? 'Overpaid by' : 'Still owed'}</span>
                          <span className="border-t border-border pt-0.5 text-right font-semibold"><Amount minor={Math.abs(l.balance)} currency={reg.currency} tone={over ? 'cr' : 'dr'} /></span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
              <p className="text-xs text-muted-foreground">Click a lender to see only their entries.</p>
            </div>
          )}
        </aside>

        <div className="min-w-0 space-y-3 lg:col-start-1 lg:row-start-1">
        <header className="rounded-xl border border-border bg-card p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="flex flex-wrap items-center gap-2 text-lg font-semibold"><span className="min-w-0 break-words">{reg.name}</span><RoleBadge role={reg.role} /><SharedBadge kind="loan" ledgerNames={reg.ledgerNames} all={!reg.bookId} />{settled && <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">Settled</span>}{(account?.accessCode ? [] : (reg.ledgerNames || [])).map(n => <span key={n} className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-foreground">{n}</span>)}</h2>
              <p className="text-sm text-muted-foreground">{reg.lender} &rarr; {reg.borrower}</p>
              {reg.description && <p className="mt-2 max-w-prose text-sm">{reg.description}</p>}
            </div>
            {admin && (
              <div className="flex flex-wrap gap-2">
                {settled
                  ? <button type="button" className={btnSecondary} onClick={() => setSettled(false)} disabled={busy}>Reopen loan</button>
                  : <button type="button" className={btnSecondary} disabled={!hasEntries || tot.balance !== 0} aria-describedby="loan-settle-hint"
                      onClick={() => { setActionError(''); setConfirm({ type: 'settle' }); }}>Mark as settled</button>}
                <button type="button" className={btnSecondary} onClick={() => setEditReg(true)}>Edit loan</button>
                <button type="button" className={btnSecondary} onClick={() => setDupReg(true)}>Duplicate loan</button>
                <button type="button" className={btnDanger} disabled={hasEntries} aria-describedby={hasEntries ? 'loan-settle-hint' : undefined}
                  onClick={() => { setActionError(''); setConfirm({ type: 'register' }); }}>Delete loan</button>
              </div>
            )}
          </div>
          {settled && <p className="mt-2 text-xs text-muted-foreground">This loan is settled. Entries are read only until it is reopened.</p>}
          {admin && ((!settled && (!hasEntries || tot.balance !== 0)) || hasEntries) && (
            <p id="loan-settle-hint" className="mt-2 flex items-start gap-1.5 text-xs text-muted-foreground">
              <svg aria-hidden="true" viewBox="0 0 24 24" className="mt-px size-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></svg>
              <span>A loan can be settled once it has entries and the balance is zero; a loan with entries can only be deleted after its entries are deleted.</span>
            </p>
          )}
          <StampFooter createdAt={reg.createdAt} updatedAt={reg.updatedAt} by={reg.createdByName} />
        </header>

          <div className="space-y-2 rounded-xl border border-border bg-card p-3">
            <div className="flex flex-wrap items-start gap-2">
              <input type="search" aria-label="Search entries" className={`${inputCls} !mt-0 min-w-[12rem] flex-1`} value={q} onChange={e => setQ(e.target.value)} placeholder="Search comment, receiver or lender" />
              <EitherSwitches labelBelow label="Entry type" value={kind === 'all' ? '' : kind} onChange={v => setKind(v || 'all')} options={[['taken', 'Taken'], ['returned', 'Returned']]} />
              <button type="button" aria-expanded={datesOpen || Boolean(from || to)} className={btnSecondary} onClick={() => setDatesOpen(o => !o)}>Dates{from || to ? ' •' : ''}</button>
              {writable && <button type="button" className={`${btnPrimary} ml-auto`} onClick={() => setEntryDlg({ entry: null })}>Add entry</button>}
            </div>
            {(datesOpen || from || to) && (
              <div className="flex flex-wrap items-end gap-3">
                <label className="text-sm font-medium"><span className="block">From</span><input type="date" min="1900-01-01" max="9999-12-31" className={inputCls} value={from} onChange={e => setFrom(e.target.value)} /></label>
                <label className="text-sm font-medium"><span className="block">To</span><input type="date" min="1900-01-01" max="9999-12-31" className={inputCls} value={to} onChange={e => setTo(e.target.value)} /></label>
                {(from || to) && <button type="button" className="pb-2 text-xs text-muted-foreground underline" onClick={() => { setFrom(''); setTo(''); }}>Clear dates</button>}
              </div>
            )}
          </div>

        {(actionError || error) && <p role="alert" className="text-sm text-negative">{actionError || error}</p>}

        {shown.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-card p-6 text-sm text-muted-foreground">
            {filtered ? 'No entries match these filters.' : 'No entries yet.'}{!filtered && writable ? ' Use Add entry to record the first one.' : ''}
          </div>
        ) : (
          <>
            <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card" style={{ listStyle: 'none' }}>
              {shown.map(r => {
                const open = () => setEntryDlg({ entry: r });
                const who = [r.lender && `${r.kind === 'returned' ? 'Repaid to' : 'From'} ${r.lender}`, r.receiver && (r.receiver !== r.lender) && `Received by ${r.receiver}`].filter(Boolean);
                return (
                  <li key={r.id} className={`flex min-w-0 items-center gap-3 px-3 py-1.5 text-sm cursor-pointer hover:bg-muted/40`}
                    onClick={open} tabIndex={0}
                    onKeyDown={ev => { if ((ev.key === 'Enter' || ev.key === ' ')) { ev.preventDefault(); open(); } }}>
                    <div className="w-[4.75rem] shrink-0 whitespace-nowrap text-xs text-muted-foreground">{r.date}</div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium text-foreground" title={r.comment || undefined}>
                        {r.comment || <span className="font-normal text-muted-foreground">(no comment)</span>}
                      </div>
                      <div className="flex flex-wrap items-center gap-x-2.5 text-xs leading-tight text-muted-foreground">
                        <KindBadge kind={r.kind} />
                        {who.map(w => <span key={w}>{w}</span>)}
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <Amount minor={r.amount} currency={reg.currency} tone={r.kind === 'taken' ? 'dr' : 'cr'} className="font-semibold" />
                    </div>
                  </li>
                );
              })}
            </ul>
            {filtered && <p className="text-xs text-muted-foreground">Showing {shown.length} matching {shown.length === 1 ? 'entry' : 'entries'}.</p>}
          </>
        )}
        </div>
      </div>

      {entryDlg && (
        <EntryDialog readOnly={!writable} register={reg} entry={entryDlg.entry} copyOf={entryDlg.copy} receivers={receiverNames} onClose={() => setEntryDlg(null)}
          onSaved={() => { setEntryDlg(null); refresh(); }}
          onDuplicate={() => setEntryDlg({ entry: null, copy: entryDlg.entry })}
          onDelete={entryDlg.entry ? () => { setConfirm({ type: 'entry', entry: entryDlg.entry }); } : undefined} />
      )}
      {dupReg && <RegisterDialog copyOf={reg} onClose={() => setDupReg(false)} onSaved={r => { setDupReg(false); window.location.hash = `#/loans/${r.id}`; }} />}
      {editReg && <RegisterDialog readOnly={!canEdit(reg.role)} register={reg} onClose={() => setEditReg(false)} onSaved={() => { setEditReg(false); refresh(); }} />}
      {confirm && confirm.type === 'settle' && (
        <ConfirmDialog title="Mark loan as settled" message={`Mark "${reg.name}" as settled? Its entries become read only until you reopen it.`}
          confirmLabel="Mark as settled" busy={busy} onConfirm={() => setSettled(true)} onCancel={() => setConfirm(null)} />
      )}
      {confirm && confirm.type !== 'settle' && (
        <ConfirmDialog
          title={confirm.type === 'register' ? 'Delete loan' : 'Delete entry'}
          message={confirm.type === 'register' ? `Delete the loan "${reg.name}"? This cannot be undone.` : 'Delete this entry? The totals will change.'}
          confirmLabel="Delete" tone="danger" busy={busy}
          onConfirm={runDelete}
          onCancel={() => setConfirm(null)} />
      )}
    </div>
  );
}
