import React, { useCallback, useEffect, useState } from 'react';
import ComboInput from '../common/ComboInput';
import { api } from '../../services/dataAPI';
import { btnSecondary } from '../settings/ui';
import Modal from '../common/Modal';
import RefundEntry from '../common/RefundEntry';
import PartyInput from '../common/PartyInput';
import ConfirmDialog from '../common/ConfirmDialog';
import MoneyInput from '../common/MoneyInput';
import { Toggle, SideSwitch, dirProps } from '../settings/ui';
import dataAPI from '../../services/dataAPI';
import { useLedger } from '../../hooks/LedgerContext';
import { useCurrencies } from '../../hooks/CurrencyContext';
import useProjectNames from '../../hooks/useProjectNames';
import { errorMessage, findParty } from '../common/format';
import { formatMoney, parseMoney } from '../../utils/money';
import QuantityPriceFields from '../common/QuantityPriceFields';
import Select from '../common/Select';
import {
  amountMinorFromQuantityAndUnitPrice,
  parseQuantityInput,
  parseUnitPriceInput,
  quantityPriceFromEntry,
  validateQuantityPriceInputs,
} from '../../utils/entryQuantityPrice.mjs';

// Documents linked to one entry. Each attach/unlink is its own immediate PUT.
function EntryDocuments({ bookId, entryId, canChange, onChanged }) {
  const [linked, setLinked] = useState(null);
  const [all, setAll] = useState([]);
  const [pick, setPick] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const base = `/books/${bookId}/documents`;
  useEffect(() => {
    let off = false;
    api.get(`${base}/for-entry/${entryId}`).then(r => { if (!off) setLinked(Array.isArray(r.data) ? r.data : []); }).catch(e => { if (!off) { setLinked([]); setErr(errorMessage(e)); } });
    return () => { off = true; };
  }, [base, entryId]);
  useEffect(() => {
    if (!canChange) return;
    api.get(base).then(r => setAll(Array.isArray(r.data) ? r.data : [])).catch(() => {});
  }, [base, canChange]);

  const replace = useCallback(async ids => {
    setBusy(true); setErr('');
    try {
      const r = await api.put(`${base}/for-entry/${entryId}`, { documentIds: ids });
      setLinked(Array.isArray(r.data) ? r.data : []);
      setPick('');
      onChanged();
    } catch (e) { setErr(errorMessage(e)); }
    setBusy(false);
  }, [base, entryId, onChanged]);

  const ids = (linked || []).map(d => d.id);
  const label = d => `${d.title} (${d.date})`;
  const items = all.filter(d => !ids.includes(d.id)).map(d => ({ id: d.id, name: label(d) }));
  const onPick = v => {
    setPick(v);
    const hit = items.find(i => i.name === v);
    if (hit) replace([...ids, hit.id]);
  };
  return (
    <div className="form-group">
      <label>Documents</label>
      {err && <p role="alert" className="text-sm text-negative">{err}</p>}
      {linked && !linked.length && <p className="text-sm text-muted-foreground">No documents linked.</p>}
      {!!linked?.length && (
        <ul className="mb-2 space-y-1" style={{ listStyle: 'none', padding: 0 }}>
          {linked.map(d => (
            <li key={d.id} className="flex min-w-0 items-center justify-between gap-2 text-sm">
              <span className="min-w-0">
                <span className="font-medium text-foreground">{d.title}</span>{' '}
                <span className="text-xs text-muted-foreground">{d.date}</span>{' '}
                {d.hasFile && <a href={`/api${base}/${d.id}/file`} target="_blank" rel="noreferrer" className="text-xs text-accent underline">Open file</a>}
              </span>
              {canChange && <button type="button" className={`${btnSecondary} !px-2 !py-1`} disabled={busy} onClick={() => replace(ids.filter(x => x !== d.id))}>Unlink</button>}
            </li>
          ))}
        </ul>
      )}
      {canChange && (
        <ComboInput value={pick} onChange={onPick} items={items} disabled={busy} placeholder="Attach document" noun="document" inputClassName="w-full" />
      )}
    </div>
  );
}

// Side panel to view or edit one entry (partial PUT) and delete it. Viewers get a read-only view.
export default function EntryPanel({ entry, onClose, onChanged, onLinksChanged, onDuplicate }) {
  const { label: curLabel } = useCurrencies();
  const { book, canEdit: mayEdit, funds, categories, parties, isClosedDate, can } = useLedger();
  const projectNames = useProjectNames();
  // Open projects can be picked. A closed project is listed only when the entry is already in it (reopen a
  // project on the Projects page to assign more entries to it).
  const projectOptions = Object.entries(projectNames)
    .filter(([id, p]) => p.status !== 'closed' || id === entry.projectId)
    .map(([id, p]) => ({ id, name: p.status === 'closed' ? `${p.name} (closed)` : p.name }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const entryQP = quantityPriceFromEntry(entry);
  // A duplicate is a new, unsaved entry (no id) pre-filled from another one; Save creates it.
  const isNew = !entry.id;
  const entryClosed = !isNew && isClosedDate(entry.date);
  const canEdit = mayEdit && !entryClosed;
  const linked = Boolean(entry.linkId);
  const [f, setF] = useState({
    date: entry.date, fundId: entry.fundId, direction: entry.direction,
    party: entry.partyName || '', categoryId: entry.categoryId || '', projectId: entry.projectId || '',
    amount: formatMoney(entry.amount),
    quantity: entryQP.quantityText,
    unitPrice: entryQP.unitPriceText,
    comment: entry.comment || '', rate: entry.rate == null ? '' : String(entry.rate), exclude: entry.exclude
  });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [refunding, setRefunding] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const set = k => e => setF(s => ({ ...s, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));
  const locked = !canEdit;
  const newClosed = !entryClosed && isClosedDate(f.date);
  const lockOther = locked || linked; // linked legs only allow date, comment and amount
  const quantityPreview = parseQuantityInput(f.quantity);
  const unitPricePreview = parseUnitPriceInput(f.unitPrice);
  const totalPreview = quantityPreview && unitPricePreview
    ? amountMinorFromQuantityAndUnitPrice(quantityPreview.thousandths, unitPricePreview)
    : null;

  const save = async e => {
    e.preventDefault();
    setError('');
    if (newClosed) return;
    if (isNew) {
      const qp = validateQuantityPriceInputs(f.quantity, f.unitPrice);
      if (qp.error) { setError(qp.error); return; }
      const rate = f.rate.trim() === '' ? null : Number(f.rate);
      if (rate != null && !Number.isFinite(rate)) { setError('Rate must be a number.'); return; }
      const create = { date: f.date, fundId: f.fundId, direction: f.direction, quantity: qp.quantity, unitPrice: qp.unitPrice, amount: qp.amount, exclude: f.exclude };
      if (f.categoryId) create.categoryId = f.categoryId;
      if (f.projectId) create.projectId = f.projectId;
      if (f.comment.trim()) create.comment = f.comment;
      if (rate != null) create.rate = rate;
      if (f.party.trim()) {
        const p = findParty(parties, f.party);
        if (p) create.partyId = p.id; else create.partyName = f.party.trim();
      }
      setBusy(true);
      try { await dataAPI.createEntry(book.id, create); onChanged(); }
      catch (err) { setError(errorMessage(err)); setBusy(false); }
      return;
    }
    const body = {};
    if (f.date !== entry.date) body.date = f.date;
    if (f.comment !== (entry.comment || '')) body.comment = f.comment.trim() === '' ? null : f.comment;
    if (linked) {
      const amount = parseMoney(f.amount);
      if (amount == null) { setError('Enter a valid amount greater than zero. Use . for decimals.'); return; }
      if (amount !== entry.amount) body.amount = amount;
    } else {
      const qp = validateQuantityPriceInputs(f.quantity, f.unitPrice);
      if (qp.error) { setError(qp.error); return; }
      if (qp.quantityThousandths !== entryQP.quantityThousandths || qp.unitPrice !== entryQP.unitPrice) {
        body.quantity = qp.quantity;
        body.unitPrice = qp.unitPrice;
        body.amount = qp.amount;
      }
      if (f.fundId !== entry.fundId) body.fundId = f.fundId;
      if (f.direction !== entry.direction) body.direction = f.direction;
      if ((f.categoryId || null) !== (entry.categoryId || null)) body.categoryId = f.categoryId || null;
      if ((f.projectId || null) !== (entry.projectId || null)) body.projectId = f.projectId || null;
      if (f.exclude !== entry.exclude) body.exclude = f.exclude;
      const rate = f.rate.trim() === '' ? null : Number(f.rate);
      if (rate != null && !Number.isFinite(rate)) { setError('Rate must be a number.'); return; }
      if (rate !== entry.rate) body.rate = rate;
      if (f.party.trim() !== (entry.partyName || '')) {
        const p = findParty(parties, f.party);
        if (!f.party.trim()) body.partyId = null;
        else if (p) body.partyId = p.id;
        else body.partyName = f.party.trim();
      }
    }
    if (!Object.keys(body).length) { onClose(); return; }
    setBusy(true);
    try {
      await dataAPI.updateEntry(book.id, entry.id, body);
      onChanged();
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  };

  const remove = async () => {
    setError('');
    setBusy(true);
    try {
      await dataAPI.deleteEntry(book.id, entry.id);
      onChanged();
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  };

  if (refunding) return <RefundEntry entry={entry} onClose={() => setRefunding(false)} onSaved={onChanged} />;

  return (
    <>
    <Modal title={isNew ? 'Duplicate entry' : canEdit ? 'Edit entry' : 'Entry'} onClose={onClose}>
      <form onSubmit={save}>
        {entryClosed && <div className="alert alert-error" role="status">{entry.date.slice(0, 4)} is closed. Reopen it in Settings &rsaquo; Years to make changes.</div>}
        {newClosed && <div className="alert alert-error" role="alert">{f.date.slice(0, 4)} is closed. Pick a date in an open year, or reopen it in Settings &rsaquo; Years.</div>}
        {error && <div className="alert alert-error" role="alert">{error}</div>}
        {linked && <p className="text-sm text-muted-foreground mb-3">&#8596; Linked transfer leg. Only date, comment and same-currency amount can change.</p>}
        <div className="form-group"><label htmlFor="ep-date">Date</label>
          <input id="ep-date" type="date" min="1900-01-01" max="9999-12-31" value={f.date} onChange={set('date')} disabled={locked} required /></div>
        <div className="form-group"><label htmlFor="ep-fund">Fund</label>
          <Select id="ep-fund" value={f.fundId} onChange={set('fundId')} disabled={lockOther}>
            {funds.map(x => <option key={x.id} value={x.id}>{x.name} ({curLabel(x.currency)})</option>)}
          </Select></div>
        <div className="form-group">
          <SideSwitch {...dirProps} value={f.direction}
            onChange={v => setF(s => ({ ...s, direction: v }))} disabled={lockOther} /></div>
        <div className="form-group"><label htmlFor="ep-party">Party</label>
          <PartyInput id="ep-party" value={f.party} onChange={v => setF(s => ({ ...s, party: v }))} parties={parties} disabled={lockOther} /></div>
        <div className="form-group"><label htmlFor="ep-cat">Category</label>
          <Select id="ep-cat" value={f.categoryId} onChange={set('categoryId')} disabled={lockOther}>
            <option value="">(none)</option>
            {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select></div>
        {projectOptions.length > 0 && (
          <div className="form-group"><label htmlFor="ep-project">Project</label>
            <Select id="ep-project" value={f.projectId} onChange={set('projectId')} disabled={lockOther}>
              <option value="">(none)</option>
              {projectOptions.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </Select>
            <p className="text-xs text-muted-foreground mt-1">Moving an entry to a project (or out of one) does not change the ledger totals. To leave an entry out of the totals, turn off &ldquo;Count in ledger totals&rdquo;.</p>
          </div>
        )}
        {linked ? (
          <div className="form-group"><label htmlFor="ep-amt">Amount ({curLabel(entry.currency)})</label>
            <MoneyInput id="ep-amt" value={f.amount} onChange={v => setF(s => ({ ...s, amount: v }))} disabled={locked} /></div>
        ) : (
          <QuantityPriceFields
            idPrefix="ep"
            quantity={f.quantity}
            unitPrice={f.unitPrice}
            onQuantityChange={v => setF(s => ({ ...s, quantity: v }))}
            onUnitPriceChange={v => setF(s => ({ ...s, unitPrice: v }))}
            currency={entry.currency}
            totalMinor={totalPreview}
            disabled={locked}
          />
        )}
        {!linked && (
          <div className="form-group"><label htmlFor="ep-rate">Rate %</label>
            <input id="ep-rate" inputMode="decimal" value={f.rate} onChange={set('rate')} disabled={locked} /></div>
        )}
        <div className="form-group"><label htmlFor="ep-comment">Comment</label>
          {f.comment.includes('\n')
            ? <textarea id="ep-comment" rows={Math.min(8, f.comment.split('\n').length + 1)} value={f.comment} onChange={set('comment')} disabled={locked} />
            : <input id="ep-comment" value={f.comment} onChange={set('comment')} disabled={locked} />}</div>
        {!linked && (
          <div className="mb-3"><Toggle label="Count in ledger totals" hint="Off keeps the entry as a record, dimmed, but leaves it out of the fund balance and all totals." checked={!f.exclude} onChange={v => setF(s => ({ ...s, exclude: !v }))} disabled={locked} /></div>
        )}
        {!isNew && can('documents') && <EntryDocuments bookId={book.id} entryId={entry.id} canChange={mayEdit} onChanged={onLinksChanged || (() => {})} />}
        {canEdit && !linked && !isNew && (
          <div className="mb-3 flex flex-wrap gap-2">
            <button type="button" className="btn" onClick={() => setRefunding(true)} disabled={busy}>Refund / Balance</button>
            {onDuplicate && <button type="button" className="btn" onClick={() => onDuplicate(entry)} disabled={busy}>Duplicate</button>}
          </div>
        )}
        {canEdit && (
          <div className="flex gap-2 justify-between">
            <div className="flex gap-2">
              <button type="submit" className="btn btn-primary" disabled={busy || newClosed}>Save</button>
              <button type="button" className="btn" onClick={onClose}>Cancel</button>
            </div>
            {!isNew && <button type="button" className="btn btn-danger" onClick={() => setConfirmingDelete(true)} disabled={busy}>Delete</button>}
          </div>
        )}
      </form>
    </Modal>
    {confirmingDelete && (
      <ConfirmDialog
        title={linked ? 'Delete transfer?' : 'Delete entry?'}
        message={linked ? 'Delete this transfer? Both legs will be removed.' : 'Delete this entry?'}
        confirmLabel="Delete"
        tone="danger"
        busy={busy}
        onConfirm={async () => { await remove(); setConfirmingDelete(false); }}
        onCancel={() => setConfirmingDelete(false)}
      />
    )}
    </>
  );
}
