import React, { useEffect, useState } from 'react';
import { api } from '../../services/dataAPI';
import Modal from '../common/Modal';
import CurrencySelect from '../common/CurrencySelect';
import { errorMessage } from '../common/format';
import { inputCls, btnPrimary, btnSecondary, Field, Toggle } from '../settings/ui';
import NamesInput from '../common/NamesInput';
import { useCurrencies } from '../../hooks/CurrencyContext';
import { notifyLoansChanged, useLoanNames } from './useLoanRegisters';
import { canAdmin } from './shared';

// Create (register null) or edit a register. The currency is locked once entries exist.
// A loan admin of an existing register also chooses which access codes may view it (view-only).
export default function RegisterDialog({ register, onClose, onSaved }) {
  const locked = Boolean(register && register.totals?.count > 0);
  const names = useLoanNames();
  const { active } = useCurrencies();
  const [f, setF] = useState({
    name: register?.name || '', borrower: register?.borrower || '', lender: register?.lender || '',
    description: register?.description || '', currency: register?.currency || active[0]?.code || 'USD'
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = k => e => setF(s => ({ ...s, [k]: e.target.value }));
  // Sharing with access codes: `codes` is null until loaded (or when this account cannot manage it).
  const canShare = Boolean(register && canAdmin(register.role));
  const [codes, setCodes] = useState(null);
  const [shared, setShared] = useState([]);
  const [sharedAtLoad, setSharedAtLoad] = useState([]);
  const [codesError, setCodesError] = useState('');
  useEffect(() => {
    if (!canShare) return undefined;
    let live = true;
    api.get(`/loans/${register.id}/access-codes`).then(res => {
      if (!live) return;
      setCodes(res.data.codes); setShared(res.data.shared); setSharedAtLoad(res.data.shared); setCodesError('');
    }).catch(err => { if (live) { setCodes(null); setCodesError(errorMessage(err)); } });
    return () => { live = false; };
  }, [canShare, register?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const toggleCode = id => setShared(s => (s.includes(id) ? s.filter(x => x !== id) : [...s, id]));
  const sharingChanged = shared.length !== sharedAtLoad.length || shared.some(id => !sharedAtLoad.includes(id));

  const submit = async e => {
    e.preventDefault();
    const body = { name: f.name.trim(), borrower: f.borrower.trim(), lender: f.lender.trim(), description: f.description.trim() || null };
    if (!body.name || !body.borrower || !body.lender) { setError('Enter a name, a borrower and a lender.'); return; }
    if (body.borrower.length > 120 || body.lender.length > 120) { setError('Too many names: borrower and lender can each be up to 120 characters in total.'); return; }
    const currency = f.currency.trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(currency)) { setError('Choose a currency.'); return; }
    setBusy(true);
    try {
      let saved;
      if (register) {
        if (!locked) body.currency = currency;
        saved = (await api.put(`/loans/${register.id}`, body)).data;
        if (codes && sharingChanged) await api.put(`/loans/${register.id}/access-codes`, { codeIds: shared });
      } else {
        saved = (await api.post('/loans', { ...body, currency })).data;
      }
      notifyLoansChanged();
      onSaved(saved);
    } catch (err) { setError(errorMessage(err)); setBusy(false); }
  };

  return (
    <Modal title={register ? 'Edit loan' : 'New loan'} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        {error && <p role="alert" className="text-sm text-negative">{error}</p>}
        <Field label="Name"><input className={inputCls} value={f.name} onChange={set('name')} required maxLength={120} /></Field>
        <Field label="Borrower (who took the loan)"><NamesInput value={f.borrower} onChange={v => setF(s => ({ ...s, borrower: v }))} items={names} inputClassName={inputCls} placeholder="Pick or type a name" /></Field>
        <Field label="Lender (who gave it)"><NamesInput value={f.lender} onChange={v => setF(s => ({ ...s, lender: v }))} items={names} inputClassName={inputCls} placeholder="Pick or type a name" /></Field>
        <Field label="Description"><textarea rows={3} className={inputCls} value={f.description} onChange={set('description')} maxLength={500} /></Field>
        <Field label="Currency">
          <CurrencySelect className={inputCls} value={f.currency} onChange={currency => setF(s => ({ ...s, currency }))} disabled={locked} aria-label="Currency" />
        </Field>
        {locked && <p id="loan-cur-hint" className="text-xs text-muted-foreground">The currency cannot change once the loan has entries.</p>}
        {canShare && !codes && codesError && (
          <p role="alert" className="text-sm text-negative">Could not load the access codes for this loan: {codesError}</p>
        )}
        {canShare && codes && (
          <div role="group" aria-label="Shared with access codes" className="space-y-2">
            <p className="text-sm font-medium text-foreground">Shared with access codes (view only)</p>
            {codes.length === 0 ? (
              <p className="text-xs text-muted-foreground">No access codes yet. A super administrator creates them in Admin &rsaquo; Access codes.</p>
            ) : (
              <>
                {codes.map(code => (
                  <Toggle key={code.id} label={code.name} checked={shared.includes(code.id)} onChange={() => toggleCode(code.id)} disabled={busy}
                    hint="On: this code can read the loan and its entries, but cannot change anything. Off: this code cannot see the loan." />
                ))}
                <p className="text-xs text-muted-foreground">The code also needs the Loans page turned on in Admin &rsaquo; Access codes.</p>
              </>
            )}
          </div>
        )}
        <div className="flex gap-2">
          <button type="submit" className={btnPrimary} disabled={busy}>{busy ? 'Saving...' : 'Save'}</button>
          <button type="button" className={btnSecondary} onClick={onClose} disabled={busy}>Cancel</button>
        </div>
      </form>
    </Modal>
  );
}
