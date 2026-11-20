import React, { useState } from 'react';
import Modal from './Modal';
import Amount from './Amount';
import QuantityPriceText from './QuantityPriceText';
import { errorMessage } from './format';
import { useLedger } from '../../hooks/LedgerContext';
import dataAPI from '../../services/dataAPI';

export default function RefundEntry({ entry, onClose, onSaved }) {
  const { book, isClosedDate } = useLedger();
  const [date, setDate] = useState(entry.date);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const closed = isClosedDate(date);
  const direction = entry.direction === 'dr' ? 'cr' : 'dr';

  const submit = async e => {
    e.preventDefault();
    if (busy) return;
    if (!date) { setError('Choose a refund date.'); return; }
    if (closed) { setError('Choose a date in an open year.'); return; }
    setBusy(true);
    setError('');
    try {
      await dataAPI.refundEntry(book.id, entry.id, { date });
      onSaved();
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  };

  return (
    <Modal title="Refund / Balance" onClose={() => { if (!busy) onClose(); }}>
      <form onSubmit={submit} className="space-y-3">
        <div className="rounded-lg border border-border p-3 space-y-1">
          <p className="font-medium break-words">{entry.comment || '(no comment)'}</p>
          <p className="text-sm text-muted-foreground">Original: {entry.date} / {entry.fundName}</p>
          <QuantityPriceText entry={entry} currency={entry.currency} />
          <p className="text-sm">
            New {direction === 'cr' ? 'credit (money in)' : 'debit (money out)'}:{' '}
            <Amount minor={entry.amount} currency={entry.currency} tone={direction} />
          </p>
        </div>
        <p className="text-sm text-muted-foreground">
          Keep the original and add a matching opposite entry to balance it out.
          The saved comment, quantity, unit price, fund, party, category and project are copied;
          unsaved edits are not included. You can edit the new entry afterwards.
        </p>
        <div className="form-group">
          <label htmlFor="refund-date">Refund date</label>
          <input id="refund-date" type="date" min="1900-01-01" max="9999-12-31" value={date} onChange={e => setDate(e.target.value)} disabled={busy} required />
        </div>
        {closed && <p role="alert" className="text-sm text-negative">{date.slice(0, 4)} is closed. Choose a date in an open year.</p>}
        {error && <p role="alert" className="text-sm text-negative">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" className="btn" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={busy || closed || !date}>
            {busy ? 'Creating...' : 'Create refund / balance'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
