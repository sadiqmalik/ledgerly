import React, { useState } from 'react';
import Modal from '../common/Modal';
import RefundEntry from '../common/RefundEntry';
import { api } from '../../services/dataAPI';
import { useLedger } from '../../hooks/LedgerContext';
import { errorMessage, findParty, todayISO } from '../common/format';
import PartyInput from '../common/PartyInput';
import ConfirmDialog from '../common/ConfirmDialog';
import QuantityPriceFields from '../common/QuantityPriceFields';
import { Field, Check, Toggle, SideSwitch, inputCls, btnPrimary, btnSecondary, btnDanger } from '../settings/ui';
import { amountMinorFromQuantityAndUnitPrice, parseQuantityInput, parseUnitPriceInput, quantityPriceFromEntry, validateQuantityPriceInputs } from '../../utils/entryQuantityPrice.mjs';
import Select from '../common/Select';

// Add (entry == null) or edit/delete one project entry. Errors (423 year closed, ...) show inline.
export default function EntryForm({ bookId, project, metaKeys, labelOf, categories, entry, copyOf, canEdit, onClose, onSaved, onDuplicate }) {
  const editing = !!entry;
  // A duplicate (copyOf) pre-fills everything from another entry, dated today; Save creates a new entry.
  const src = entry || copyOf;
  const { isClosedDate, funds, book, parties } = useLedger();
  const cur = funds.find(x => x.id === project.fundId)?.currency || book.baseCurrency;
  const entryClosed = editing && isClosedDate(entry.date);
  const entryQP = quantityPriceFromEntry(src || {});

  const [f, setF] = useState(() => ({
    date: entry?.date || todayISO(),
    categoryId: src?.categoryId || '',
    comment: src?.comment || '',
    quantity: entryQP.quantityText,
    unitPrice: entryQP.unitPriceText,
    direction: src?.direction || 'dr',
    meta: { ...(src?.meta || {}) },
    status: src?.status || 'pending',
    paidDate: entry?.paidDate || '',
    exclude: !!src?.exclude,
  }));
  const [party, setParty] = useState(src?.partyName || '');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [refunding, setRefunding] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const dateClosed = isClosedDate(f.date);
  const set = (k, v) => setF(s => ({ ...s, [k]: v }));
  const quantityPreview = parseQuantityInput(f.quantity);
  const unitPricePreview = parseUnitPriceInput(f.unitPrice);
  const totalPreview = quantityPreview && unitPricePreview
    ? amountMinorFromQuantityAndUnitPrice(quantityPreview.thousandths, unitPricePreview)
    : null;

  const submit = async e => {
    e.preventDefault();
    if (dateClosed || entryClosed) return;
    const qp = validateQuantityPriceInputs(f.quantity, f.unitPrice);
    if (qp.error) return setErr(qp.error);
    if (!f.date) return setErr('Date is required.');
    const meta = {};
    metaKeys.forEach(k => { if ((f.meta[k] || '').trim()) meta[k] = f.meta[k].trim(); });
    const common = {
      date: f.date, categoryId: f.categoryId || null, comment: f.comment.trim() || null,
      quantity: qp.quantity, unitPrice: qp.unitPrice, amount: qp.amount,
      direction: f.direction, meta, status: f.status,
      paidDate: f.status === 'paid' ? (f.paidDate || f.date) : null, exclude: f.exclude,
    };
    // Party: unchanged -> nothing sent; cleared -> null; a listed name -> its id; a new name -> created on save.
    const partyName = party.trim();
    const partyChanged = partyName !== (entry?.partyName || '');
    if (partyChanged || (!editing && partyName)) {
      if (!partyName) common.partyId = null;
      else { const p = findParty(parties, partyName); if (p) common.partyId = p.id; else common.partyName = partyName; }
    }
    setBusy(true); setErr('');
    try {
      if (editing) {
        const body = {};
        Object.keys(common).forEach(k => {
          if (k === 'partyId' || k === 'partyName') { body[k] = common[k]; return; }
          const a = JSON.stringify(common[k]);
          const b = JSON.stringify(
            k === 'meta' ? (entry.meta || {})
              : k === 'exclude' ? !!entry.exclude
                : k === 'quantity' ? entryQP.quantity
                  : k === 'unitPrice' ? entryQP.unitPrice
                    : k === 'amount' ? entryQP.amount
                      : (entry[k] ?? null)
          );
          if (a !== b) body[k] = common[k];
        });
        if (Object.keys(body).length) await api.put(`/books/${bookId}/entries/${entry.id}`, body);
      } else {
        await api.post(`/books/${bookId}/entries`, { ...common, fundId: project.fundId, projectId: project.id });
      }
      onSaved();
    } catch (ex) { setErr(errorMessage(ex)); setBusy(false); }
  };

  const remove = async () => {
    setBusy(true); setErr('');
    try { await api.delete(`/books/${bookId}/entries/${entry.id}`); onSaved(); }
    catch (ex) { setErr(errorMessage(ex)); setBusy(false); }
  };

  const ro = !canEdit || entryClosed;
  if (refunding) return <RefundEntry entry={entry} onClose={() => setRefunding(false)} onSaved={onSaved} />;

  return (
    <>
    <Modal title={editing ? (ro ? 'Entry' : 'Edit entry') : copyOf ? 'Duplicate entry' : 'Add entry'} onClose={onClose}>
      <form onSubmit={submit} className="space-y-5">
        <fieldset disabled={ro || busy} className="m-0 min-w-0 space-y-4 border-0 p-0">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Date"><input type="date" min="1900-01-01" max="9999-12-31" className={inputCls} value={f.date} onChange={e => set('date', e.target.value)} /></Field>
            <Field label="Category">
              <Select className={inputCls} value={f.categoryId} onChange={e => set('categoryId', e.target.value)}>
                <option value="">(none)</option>
                {categories.filter(c => !c.archived).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
            </Field>
          </div>
          <QuantityPriceFields
            idPrefix="project-entry"
            quantity={f.quantity}
            unitPrice={f.unitPrice}
            onQuantityChange={v => set('quantity', v)}
            onUnitPriceChange={v => set('unitPrice', v)}
            currency={cur}
            totalMinor={totalPreview}
            inputClassName={inputCls}
            layoutClassName="grid grid-cols-1 gap-4 sm:grid-cols-3"
            renderField={({ label, children }) => <Field label={label}>{children}</Field>}
          />
          <SideSwitch label="Credit (refund)" hint="On: credit, money coming back such as a refund. Off: debit, money spent on this project." offValue="dr" onValue="cr" value={f.direction} onChange={v => set('direction', v)} disabled={ro || busy} />
          <div className="block text-sm font-medium text-foreground"><label htmlFor="project-entry-party" className="block">Party</label>
            <div className="mt-1"><PartyInput id="project-entry-party" value={party} onChange={setParty} parties={parties} disabled={ro || busy} /></div></div>
          <Field label="Comment"><input className={inputCls} value={f.comment} onChange={e => set('comment', e.target.value)} /></Field>
          {metaKeys.map(k => (
            <Field key={k} label={labelOf(k)}>
              <input className={inputCls} value={f.meta[k] || ''} onChange={e => setF(s => ({ ...s, meta: { ...s.meta, [k]: e.target.value } }))} />
            </Field>
          ))}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Status">
              <Select className={inputCls} value={f.status} onChange={e => set('status', e.target.value)}>
                <option value="pending">pending</option>
                <option value="paid">paid</option>
              </Select>
            </Field>
            {f.status === 'paid' && (
              <Field label="Paid date"><input type="date" min="1900-01-01" max="9999-12-31" className={inputCls} value={f.paidDate} onChange={e => set('paidDate', e.target.value)} /></Field>
            )}
          </div>
          <Toggle label="Count in ledger totals" hint="Off keeps the entry as a record, dimmed, but leaves it out of the fund balance and all totals." checked={!f.exclude} onChange={v => set('exclude', !v)} />
        </fieldset>
        {editing && !ro && !entry.linkId && (
          <div className="flex flex-wrap gap-2">
            <button type="button" className={btnSecondary} disabled={busy} onClick={() => setRefunding(true)}>Refund / Balance</button>
            {onDuplicate && <button type="button" className={btnSecondary} disabled={busy} onClick={() => onDuplicate(entry)}>Duplicate</button>}
          </div>
        )}
        {(dateClosed || entryClosed) && <p role="alert" className="text-sm text-negative">{(entryClosed ? entry.date : f.date).slice(0, 4)} is closed. {entryClosed ? 'Reopen it in Settings \u203a Years to make changes.' : 'Pick a date in an open year, or reopen it in Settings \u203a Years.'}</p>}
        {err && <p role="alert" className="text-sm text-negative">{err}</p>}
        {!ro && (
          <div className="flex items-center justify-between gap-2 border-t border-border pt-4">
            {editing && !entryClosed ? <button type="button" className={btnDanger} disabled={busy} onClick={() => setConfirmingDelete(true)}>Delete</button> : <span />}
            <div className="flex gap-2">
              <button type="button" className={btnSecondary} onClick={onClose}>Cancel</button>
              <button type="submit" className={btnPrimary} disabled={busy || dateClosed}>{editing ? 'Save' : 'Add'}</button>
            </div>
          </div>
        )}
      </form>
    </Modal>
    {confirmingDelete && (
      <ConfirmDialog
        title="Delete entry?"
        message="Delete this entry?"
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
