import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../services/dataAPI';
import { useCurrencies } from '../../hooks/CurrencyContext';
import ConfirmDialog from '../common/ConfirmDialog';
import Modal from '../common/Modal';
import { Field, Segmented, errorText, inputCls, btnPrimary, btnSecondary, btnDanger } from '../settings/ui';

// Super administrators: the list of currencies the whole app offers. Switching one off hides it from pickers
// but existing records keep showing it; delete is only possible while nothing uses it.
function Row({ c, onChanged }) {
  const [alias, setAlias] = useState(c.alias || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [confirm, setConfirm] = useState(false);
  useEffect(() => setAlias(c.alias || ''), [c.alias]);
  const dirty = alias.trim() !== (c.alias || '');

  const run = async fn => {
    setBusy(true); setError('');
    try { await fn(); await onChanged(); return true; } catch (e) { setError(errorText(e)); return false; } finally { setBusy(false); }
  };
  const save = e => { e.preventDefault(); run(() => api.put(`/currencies/${c.code}`, { alias: alias.trim() || null })); };
  const setActive = key => { if ((key === 'on') !== c.active) run(() => api.put(`/currencies/${c.code}`, { active: key === 'on' })); };
  const remove = async () => { await run(() => api.delete(`/currencies/${c.code}`)); setConfirm(false); };

  return (
    <li className={`rounded-xl border border-border bg-card p-3 ${c.active ? '' : 'opacity-80'}`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-md bg-muted px-2 py-0.5 text-sm font-semibold tracking-wide text-foreground">{c.code}</span>
        <span className="min-w-0 flex-1 truncate text-sm text-foreground">{c.name}</span>
        <Segmented label={`${c.code} availability`} value={c.active ? 'on' : 'off'} onChange={setActive} options={[['on', 'Active'], ['off', 'Off']]} />
      </div>
      <form onSubmit={save} className="mt-2 flex flex-wrap items-end gap-2">
        <label className="min-w-[8rem] flex-1 text-xs text-muted-foreground">Alias (shown instead of {c.code})
          <input className={inputCls} value={alias} maxLength={8} onChange={e => setAlias(e.target.value)} placeholder="none" disabled={busy} />
        </label>
        <button type="submit" className={btnSecondary} disabled={busy || !dirty}>Save</button>
        <button type="button" className={btnDanger} disabled={busy} onClick={() => setConfirm(true)}>Delete</button>
      </form>
      {error && <p role="alert" className="mt-2 text-sm text-negative">{error}</p>}
      {confirm && (
        <ConfirmDialog title={`Delete ${c.code}?`} confirmLabel="Delete" tone="danger" busy={busy}
          message={<>Delete {c.code} ({c.name}) from the list? This only works while nothing uses it. To hide it from pickers instead, switch it off.</>}
          onConfirm={remove} onCancel={() => setConfirm(false)} />
      )}
    </li>
  );
}

function AddDialog({ onChanged, onClose }) {
  const [f, setF] = useState({ code: '', name: '', alias: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submit = async e => {
    e.preventDefault();
    const body = { code: f.code.trim().toUpperCase(), name: f.name.trim(), alias: f.alias.trim() || null };
    if (!/^[A-Z]{3}$/.test(body.code)) { setError('The code must be 3 letters, such as SEK.'); return; }
    if (!body.name) { setError('Enter a name.'); return; }
    setBusy(true); setError('');
    try { await api.post('/currencies', body); await onChanged(); onClose(); }
    catch (err) { setError(errorText(err)); setBusy(false); }
  };
  return (
    <Modal title="Add currency" onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        {error && <p role="alert" className="text-sm text-negative">{error}</p>}
        <Field label="Code (3 letters)"><input className={`${inputCls} uppercase`} value={f.code} maxLength={3} autoComplete="off" required
          onChange={e => setF(s => ({ ...s, code: e.target.value.toUpperCase().replace(/[^A-Za-z]/g, '') }))} placeholder="SEK" /></Field>
        <Field label="Name"><input className={inputCls} value={f.name} maxLength={60} required onChange={e => setF(s => ({ ...s, name: e.target.value }))} placeholder="Swedish krona" /></Field>
        <Field label="Alias (optional, shown instead of the code)"><input className={inputCls} value={f.alias} maxLength={8} onChange={e => setF(s => ({ ...s, alias: e.target.value }))} placeholder="kr" /></Field>
        <div className="flex gap-2">
          <button type="submit" className={btnPrimary} disabled={busy}>{busy ? 'Adding...' : 'Add currency'}</button>
          <button type="button" className={btnSecondary} onClick={onClose} disabled={busy}>Cancel</button>
        </div>
      </form>
    </Modal>
  );
}

export default function CurrenciesPanel() {
  const { reload } = useCurrencies();
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    try { setRows((await api.get('/currencies')).data); setError(''); } catch (e) { setError(errorText(e)); setRows(r => r || []); }
  }, []);
  useEffect(() => { load(); }, [load]);
  const changed = useCallback(async () => { await load(); await reload(); }, [load, reload]);

  const shared = useMemo(() => {
    const by = {};
    (rows || []).filter(c => c.active && c.alias).forEach(c => { (by[c.alias] = by[c.alias] || []).push(c.code); });
    return Object.entries(by).filter(([, codes]) => codes.length > 1);
  }, [rows]);

  return (
    <div className="w-full min-w-0 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">The currencies everyone can pick. An alias is shown instead of the code on screen; exports keep the code.</p>
        <button type="button" className={btnPrimary} onClick={() => setAdding(true)}>Add currency</button>
      </div>
      {error && <p role="alert" className="text-sm text-negative">{error}</p>}
      {shared.map(([a, codes]) => (
        <p key={a} role="status" className="rounded-md border border-border bg-muted px-3 py-2 text-sm text-foreground">
          Warning: {codes.join(' and ')} both show as &ldquo;{a}&rdquo;. Totals headings still show the code and name.
        </p>
      ))}
      {adding && <AddDialog onChanged={changed} onClose={() => setAdding(false)} />}
      {rows === null ? <p className="text-sm text-muted-foreground" aria-busy="true">Loading currencies...</p>
        : rows.length === 0 ? <p className="text-sm text-muted-foreground">No currencies yet. Use Add currency.</p>
        : <ul className="grid gap-2 grid-cols-[repeat(auto-fill,minmax(min(100%,19rem),1fr))]">{rows.map(c => <Row key={c.code} c={c} onChanged={changed} />)}</ul>}
    </div>
  );
}
