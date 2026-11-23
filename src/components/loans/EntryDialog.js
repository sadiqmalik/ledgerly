import React, { useState } from 'react';
import { api } from '../../services/dataAPI';
import Modal from '../common/Modal';
import { errorMessage, todayISO } from '../common/format';
import { formatMoney, parseMoney } from '../../utils/money';
import { inputCls, btnPrimary, btnSecondary, btnDanger, Field, SideSwitch } from '../settings/ui';
import ComboInput from '../common/ComboInput';
import MoneyInput from '../common/MoneyInput';
import { splitNames } from '../common/NamesInput';
import { notifyLoansChanged, useLoanNames } from './useLoanRegisters';
import { useCurrencies } from '../../hooks/CurrencyContext';
import Select from '../common/Select';
import RecordView from '../common/RecordView';
import Amount from '../common/Amount';


// Add (entry null) or edit an entry. onDelete (edit only) asks the caller to confirm and delete.
// The receiver follows the type until it is typed in: a loan taken is received by the borrower, a repayment by the lender.
// With several lenders the lender field already says who is repaid, so the receiver starts empty (use it only when someone else got the money).
const defaultReceiver = (register, kind, askLender) => (kind === 'returned' ? (askLender ? '' : register.lender) : register.borrower);

export default function EntryDialog({ register, entry, copyOf, onClose, onSaved, onDelete, onDuplicate, receivers = [], readOnly = false }) {
  const { label: curLabel } = useCurrencies();
  const names = useLoanNames(receivers);
  const lenders = splitNames(register.lender);
  const askLender = lenders.length > 1;
  // A duplicate (copyOf) pre-fills everything from another entry, dated today; Save creates a new entry.
  const src = entry || copyOf;
  const [touched, setTouched] = useState(Boolean(src));
  const [f, setF] = useState({
    kind: src?.kind || 'taken',
    date: entry?.date || todayISO(),
    amount: src ? formatMoney(src.amount) : '',
    lender: src?.lender || '',
    receiver: src ? (src.receiver || '') : defaultReceiver(register, 'taken', askLender),
    comment: src?.comment || ''
  });
  // A repayment on a loan with several lenders is received by the lender chosen above, so there is no separate receiver.
  const repaidToLender = askLender && f.kind === 'returned';
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = k => e => setF(s => ({ ...s, [k]: e.target.value }));

  const submit = async e => {
    e.preventDefault();
    const amount = parseMoney(f.amount);
    if (amount == null) { setError('Enter an amount greater than zero, like 1,500 or 1500.50.'); return; }
    if (!f.date) { setError('Choose a date.'); return; }
    if (askLender && !f.lender && !(entry && !entry.lender)) { setError('Choose which lender this entry is for.'); return; }
    const body = { kind: f.kind, amount, date: f.date, ...(askLender && f.lender !== (entry?.lender || '') ? { lender: f.lender || null } : {}), receiver: (repaidToLender ? f.lender : f.receiver).trim() || null, comment: f.comment.trim() || null };
    setBusy(true);
    try {
      const base = `/loans/${register.id}/entries`;
      if (entry) await api.put(`${base}/${entry.id}`, body); else await api.post(base, body);
      notifyLoansChanged();
      onSaved();
    } catch (err) { setError(errorMessage(err)); setBusy(false); }
  };

  if (readOnly && entry) {
    return (
      <RecordView title="Loan entry" onClose={onClose}
        headline={<Amount minor={entry.amount} currency={register.currency} tone={entry.kind === 'taken' ? 'dr' : 'cr'} />}
        chips={[entry.kind === 'returned' ? 'Returned' : 'Taken']}
        rows={[
          { label: 'Date', value: entry.date },
          { label: entry.kind === 'returned' ? 'Repaid to' : 'From', value: entry.lender },
          { label: 'Receiver', value: entry.receiver },
          { label: 'Comment', value: entry.comment, wide: true }
        ]} />
    );
  }

  return (
    <Modal title={entry ? 'Edit entry' : copyOf ? 'Duplicate entry' : 'Add entry'} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        {error && <p role="alert" className="text-sm text-negative">{error}</p>}
        <SideSwitch label="Loan returned" hint="On: money paid back, the remaining balance goes down. Off: loan taken, money the borrower received, the remaining balance goes up." offValue="taken" onValue="returned" value={f.kind}
          onChange={key => setF(s => ({ ...s, kind: key, receiver: touched ? s.receiver : defaultReceiver(register, key, askLender) }))} />
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Date"><input type="date" min="1900-01-01" max="9999-12-31" className={inputCls} value={f.date} onChange={set('date')} required /></Field>
          <Field label={`Amount (${curLabel(register.currency)})`}>
            <MoneyInput className={inputCls} value={f.amount} onChange={v => setF(s => ({ ...s, amount: v }))} required autoComplete="off" />
          </Field>
        </div>
        {askLender && (
          <Field label={f.kind === 'returned' ? 'Lender being repaid (they receive the money)' : 'Lender who gave the money'}>
            <Select className={inputCls} value={f.lender} required={!(entry && !entry.lender)}
              onChange={e => setF(s => ({ ...s, lender: e.target.value }))}>
              <option value="">{entry && !entry.lender ? '(not assigned)' : 'Choose a lender'}</option>
              {lenders.map(n => <option key={n} value={n}>{n}</option>)}
            </Select>
          </Field>
        )}
        {!repaidToLender && (
          <Field label={f.kind === 'returned' ? 'Receiver (who got the repayment)' : 'Receiver (who got the money)'}>
            <ComboInput value={f.receiver} onChange={v => { setTouched(true); setF(s => ({ ...s, receiver: v })); }} items={names} inputClassName={inputCls} placeholder="Pick or type a name" noun="name" />
          </Field>
        )}
        <Field label="Comment"><textarea rows={3} className={inputCls} value={f.comment} onChange={set('comment')} maxLength={500} /></Field>
        <div className="flex flex-wrap gap-2">
          <button type="submit" className={btnPrimary} disabled={busy}>{busy ? 'Saving...' : 'Save'}</button>
          <button type="button" className={btnSecondary} onClick={onClose} disabled={busy}>Cancel</button>
          {entry && onDuplicate && <button type="button" className={btnSecondary} onClick={() => onDuplicate(entry)} disabled={busy}>Duplicate</button>}
          {entry && onDelete && <button type="button" className={`${btnDanger} sm:ml-auto`} onClick={onDelete} disabled={busy}>Delete</button>}
        </div>
      </form>
    </Modal>
  );
}
