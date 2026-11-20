import React, { useState } from 'react';
import { api } from '../services/dataAPI';
import { useBooks } from '../hooks/BooksContext';
import { useCurrencies } from '../hooks/CurrencyContext';
import Modal from './common/Modal';
import { errorMessage } from './common/format';
import CurrencySelect from './common/CurrencySelect';

// Super admins only: creates a ledger, reloads the books and switches to it.
export default function NewLedgerModal({ onClose }) {
  const { books, reloadBooks, selectBook } = useBooks();
  const [name, setName] = useState('');
  const { active } = useCurrencies();
  // Default to the base currency of an existing ledger, else the first active currency of the managed list.
  const [currency, setCurrency] = useState(books?.[0]?.baseCurrency || active[0]?.code || 'USD');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async e => {
    e.preventDefault();
    setError(''); setBusy(true);
    try {
      const { data } = await api.post('/books', { name: name.trim(), baseCurrency: currency });
      await reloadBooks(data.id);
      selectBook(data.id);
      onClose();
    } catch (err) {
      setError(errorMessage(err, 'Could not create the ledger.'));
      setBusy(false);
    }
  };

  return (
    <Modal title="New ledger" onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <label className="flex flex-col gap-1 text-sm">Name
          <input value={name} onChange={e => setName(e.target.value)} required autoFocus placeholder="e.g. Acme Ltd" />
        </label>
        <label className="flex flex-col gap-1 text-sm">Base currency
          <CurrencySelect value={currency} onChange={setCurrency} />
          <span className="text-xs text-muted-foreground">Totals and reports are shown in this currency. It cannot change once the ledger has entries. Wallets in other currencies can be added later.</span>
        </label>
        {error && <div className="alert alert-error" role="alert">{error}</div>}
        <div className="flex gap-2 justify-end">
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={busy || !name.trim() || currency.length !== 3}>Create ledger</button>
        </div>
      </form>
    </Modal>
  );
}
