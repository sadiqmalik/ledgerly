import React, { useEffect, useRef, useState } from 'react';
import Modal from '../common/Modal';
import PartyInput from '../common/PartyInput';
import dataAPI from '../../services/dataAPI';
import { useLedger } from '../../hooks/LedgerContext';
import { errorMessage, findParty, readLocal, todayISO, writeLocal } from '../common/format';
import { parseMoney } from '../../utils/money';
import QuantityPriceFields from '../common/QuantityPriceFields';
import { amountMinorFromQuantityAndUnitPrice, parseQuantityInput, parseUnitPriceInput, validateQuantityPriceInputs } from '../../utils/entryQuantityPrice.mjs';
import { useCurrencies } from '../../hooks/CurrencyContext';
import { SideSwitch, dirProps } from '../settings/ui';
import MoneyInput from '../common/MoneyInput';

// direction: fixed 'cr'/'dr', or null when the user picks. category: preset category name.
const PRESETS = {
  Remittance: { direction: 'cr', category: 'Remittance' },
  Profit: { direction: 'cr', category: 'Profit', rate: true },
  Gift: { direction: null, category: 'Gift' },
  Expense: { direction: 'dr', category: null },
  Other: { direction: null, category: null },
  Transfer: { transfer: true },
  Convert: { transfer: true, convert: true }
};

const byName = (list, name) => list.find(c => c.name.toLowerCase() === (name || '').toLowerCase());

export default function QuickAdd({ preset: initialPreset, onClose }) {
  const { label: curLabel } = useCurrencies();
  const { book, funds, categories, parties, notifyChanged, isClosedDate } = useLedger();
  const lastFundKey = `ledger.lastFund.${book.id}`;
  const [preset, setPreset] = useState(PRESETS[initialPreset] ? initialPreset : 'Remittance');
  const [date, setDate] = useState(todayISO());
  const [fundId, setFundId] = useState('');
  const [toFundId, setToFundId] = useState('');
  const [direction, setDirection] = useState('dr');
  const [categoryId, setCategoryId] = useState('');
  const [party, setParty] = useState('');
  const [amount, setAmount] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [unitPrice, setUnitPrice] = useState('');
  const [toAmount, setToAmount] = useState('');
  const [rate, setRate] = useState('');
  const [rateTouched, setRateTouched] = useState(false);
  const [comment, setComment] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const amountRef = useRef(null);
  const unitPriceRef = useRef(null);
  const cfg = PRESETS[preset];
  const isTransfer = Boolean(cfg.transfer);
  const isConvert = Boolean(cfg.convert);

  // Default fund: the last one used (if it still exists), else the first.
  useEffect(() => {
    if (fundId || !funds.length) return;
    const stored = readLocal(lastFundKey);
    setFundId(funds.some(f => f.id === stored) ? stored : funds[0].id);
  }, [funds, fundId, lastFundKey]);

  // Preset change: set the category and direction it implies.
  // Depends on the resolved ids/direction by value, so a categories reload (after Save & add another) does not reset the user's picks.
  const presetCat = cfg.category ? byName(categories, cfg.category) : null;
  const presetCatId = presetCat ? presetCat.id : '';
  const presetDir = cfg.direction || presetCat?.defaultDirection || 'dr';
  useEffect(() => {
    if (PRESETS[preset].transfer) return;
    setCategoryId(presetCatId);
    setDirection(presetDir);
  }, [preset, presetCatId, presetDir]);

  // Transfer target: any fund other than the source.
  useEffect(() => {
    if (!isTransfer) return;
    const src = funds.find(f => f.id === fundId);
    const ok = f => f.id !== fundId && (!isConvert || !src || f.currency !== src.currency);
    const cur = funds.find(f => f.id === toFundId);
    if (!cur || !ok(cur)) setToFundId((funds.find(ok) || {}).id || '');
  }, [isTransfer, isConvert, fundId, toFundId, funds]);

  // Profit: pre-fill the last rate used for this fund.
  useEffect(() => {
    if (!cfg.rate || !fundId || rateTouched) return undefined;
    const cat = byName(categories, 'Profit');
    if (!cat) return undefined;
    let cancelled = false;
    dataAPI.getEntries(book.id, { fund: fundId, category: cat.id, pageSize: 20 })
      .then(d => {
        const hit = d.rows.find(r => r.rate != null);
        if (!cancelled) setRate(hit ? String(hit.rate) : '');
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [cfg.rate, fundId, categories, book.id, rateTouched]);

  const fund = funds.find(f => f.id === fundId);
  const toFund = funds.find(f => f.id === toFundId);
  const quantityPreview = parseQuantityInput(quantity);
  const unitPricePreview = parseUnitPriceInput(unitPrice);
  const computedTotal = quantityPreview && unitPricePreview
    ? amountMinorFromQuantityAndUnitPrice(quantityPreview.thousandths, unitPricePreview)
    : null;
  const rateText = (() => {
    const a = parseMoney(amount), b = parseMoney(toAmount);
    if (!isConvert || !a || !b || !fund || !toFund) return '';
    return `Rate: 1 ${curLabel(fund.currency)} = ${(b / a).toLocaleString('en-US', { maximumFractionDigits: 4 })} ${curLabel(toFund.currency)}`;
  })();
  const cross = isTransfer && fund && toFund && fund.currency !== toFund.currency;

  const dateClosed = isClosedDate(date);

  const submit = async again => {
    setError('');
    if (dateClosed) return;
    setNotice('');
    if (!fundId) { setError('Choose a fund.'); return; }
    const qp = isTransfer ? null : validateQuantityPriceInputs(quantity, unitPrice);
    if (!isTransfer && qp.error) { setError(qp.error); return; }
    const minor = isTransfer ? parseMoney(amount) : qp.amount;
    if (isTransfer && minor == null) { setError('Enter a valid amount greater than zero, like 1,500 or 1500.50. Use . for decimals.'); return; }
    setBusy(true);
    try {
      if (isTransfer) {
        if (isConvert && !cross) throw Object.assign(new Error(), { response: { data: { error: 'Choose funds with different currencies.' } } });
        if (!toFundId || toFundId === fundId) throw Object.assign(new Error(), { response: { data: { error: 'Choose two different funds.' } } });
        const body = { date, fromFundId: fundId, toFundId, amount: minor };
        if (cross) {
          const toMinor = parseMoney(toAmount);
          if (toMinor == null) throw Object.assign(new Error(), { response: { data: { error: 'Enter the amount received in the destination currency.' } } });
          body.toAmount = toMinor;
        }
        if (comment.trim()) body.comment = comment.trim();
        await dataAPI.createTransfer(book.id, body);
      } else {
        const body = { date, fundId, direction, quantity: qp.quantity, unitPrice: qp.unitPrice, amount: minor };
        if (categoryId) body.categoryId = categoryId;
        if (comment.trim()) body.comment = comment.trim();
        if (cfg.rate && rate.trim() !== '') {
          const r = Number(rate);
          if (!Number.isFinite(r)) throw Object.assign(new Error(), { response: { data: { error: 'Rate must be a number.' } } });
          body.rate = r;
        }
        const name = party.trim();
        if (name) {
          const p = findParty(parties, name);
          if (p) body.partyId = p.id; else body.partyName = name;
        }
        await dataAPI.createEntry(book.id, body);
      }
      writeLocal(lastFundKey, fundId);
      notifyChanged();
      if (again) {
        setAmount(''); setToAmount(''); setComment(''); setParty(''); setQuantity('1'); setUnitPrice('');
        setNotice('Saved. Add the next one.');
        setBusy(false);
        setTimeout(() => {
          const target = isTransfer ? amountRef.current : unitPriceRef.current;
          if (target) target.focus();
        }, 0);
      } else {
        onClose();
      }
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  };

  const fundOptions = list => list.map(f => <option key={f.id} value={f.id}>{f.name} ({curLabel(f.currency)})</option>);
  const showDirection = !isTransfer && !cfg.direction;

  return (
    <Modal title="Add entry" onClose={onClose}>
      <div className="flex flex-wrap gap-1 mb-3" role="tablist" aria-label="Preset">
        {Object.keys(PRESETS).map(name => (
          <button key={name} type="button" role="tab" aria-selected={preset === name}
            className={`btn px-3 py-1 ${preset === name ? 'btn-primary' : ''}`} onClick={() => setPreset(name)}>{name}</button>
        ))}
      </div>
      <form onSubmit={e => { e.preventDefault(); submit(false); }}>
        {error && <div className="alert alert-error" role="alert">{error}</div>}
        {notice && <div className="alert alert-success" role="status">{notice}</div>}
        <div className="form-group"><label htmlFor="qa-date">Date</label>
          <input id="qa-date" type="date" min="1900-01-01" max="9999-12-31" value={date} onChange={e => setDate(e.target.value)} required aria-describedby={dateClosed ? 'qa-closed' : undefined} />
          {dateClosed && <p id="qa-closed" role="alert" className="text-sm text-negative mt-1">{date.slice(0, 4)} is closed. Pick a date in an open year, or reopen it in Settings &rsaquo; Years.</p>}</div>
        <div className="form-group"><label htmlFor="qa-fund">{isTransfer ? 'From fund' : 'Fund'}</label>
          <select id="qa-fund" value={fundId} onChange={e => setFundId(e.target.value)}>{fundOptions(isConvert ? funds.filter(f => funds.some(g => g.currency !== f.currency)) : funds)}</select></div>
        {isTransfer && (
          <div className="form-group"><label htmlFor="qa-tofund">To fund</label>
            <select id="qa-tofund" value={toFundId} onChange={e => setToFundId(e.target.value)}>
              {fundOptions(funds.filter(f => f.id !== fundId && (!isConvert || !fund || f.currency !== fund.currency)))}
            </select></div>
        )}
        {showDirection && (
          <div className="form-group"><SideSwitch {...dirProps} value={direction} onChange={setDirection} /></div>
        )}
        {!isTransfer && (
          <>
            <div className="form-group"><label htmlFor="qa-party">Party</label>
              <PartyInput id="qa-party" value={party} onChange={setParty} parties={parties} /></div>
            <div className="form-group"><label htmlFor="qa-cat">Category</label>
              <select id="qa-cat" value={categoryId} onChange={e => setCategoryId(e.target.value)}>
                <option value="">(none)</option>
                {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select></div>
          </>
        )}
        {isTransfer ? (
          <div className="form-group"><label htmlFor="qa-amt">Amount{fund ? ` (${curLabel(fund.currency)})` : ''}</label>
            <MoneyInput id="qa-amt" ref={amountRef} value={amount} onChange={setAmount} placeholder="0.00" autoFocus /></div>
        ) : (
          <QuantityPriceFields
            idPrefix="qa"
            quantity={quantity}
            unitPrice={unitPrice}
            onQuantityChange={setQuantity}
            onUnitPriceChange={setUnitPrice}
            currency={fund?.currency}
            totalMinor={computedTotal}
            unitPriceRef={unitPriceRef}
            autoFocusField="unitPrice"
          />
        )}
        {cross && (
          <div className="form-group"><label htmlFor="qa-toamt">Amount received ({curLabel(toFund.currency)})</label>
            <MoneyInput id="qa-toamt" value={toAmount} onChange={setToAmount} placeholder="0.00" /></div>
        )}
        {rateText && <p className="mb-2 text-sm text-muted-foreground" aria-live="polite">{rateText}</p>}
        {cfg.rate && (
          <div className="form-group"><label htmlFor="qa-rate">Rate %</label>
            <input id="qa-rate" inputMode="decimal" value={rate} onChange={e => { setRate(e.target.value); setRateTouched(true); }} /></div>
        )}
        <div className="form-group"><label htmlFor="qa-comment">Comment</label>
          <input id="qa-comment" value={comment} onChange={e => setComment(e.target.value)} /></div>
        <div className="flex flex-wrap gap-2">
          <button type="submit" className="btn btn-primary" disabled={busy || dateClosed}>Save</button>
          <button type="button" className="btn" disabled={busy || dateClosed} onClick={() => submit(true)}>Save &amp; add another</button>
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
        </div>
      </form>
    </Modal>
  );
}
