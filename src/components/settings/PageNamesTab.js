import { useState } from 'react';
import { api } from '../../services/dataAPI';
import { errorMessage } from '../common/format';
import { Field, inputCls, btnPrimary, btnSecondary } from './ui';
import { DEFAULT_PAGE_NAMES, PAGE_KEYS, getPageAliases, setPageAliases } from '../../utils/pageNames';

// Settings > Page names: an alias for each main page. A blank box means the default name. Saved with the ledger, so
// everyone on the ledger sees the same names.
export default function PageNamesTab({ bookId, canEdit }) {
  const [names, setNames] = useState(() => Object.fromEntries(PAGE_KEYS.map(k => [k, getPageAliases()[k] || ''])));
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const save = async next => {
    setBusy(true); setErr(''); setMsg('');
    try {
      const { data } = await api.put(`/books/${bookId}/appearance`, { pageNames: next });
      setPageAliases(data.pageNames);
      setNames(Object.fromEntries(PAGE_KEYS.map(k => [k, data.pageNames?.[k] || ''])));
      setMsg('Saved.');
    } catch (e) { setErr(errorMessage(e, 'Could not save.')); }
    setBusy(false);
  };
  const changed = PAGE_KEYS.some(k => (names[k].trim() || '') !== (getPageAliases()[k] || ''));
  const anyAlias = PAGE_KEYS.some(k => names[k].trim());

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">Give a page another name in the sidebar and on its page. Leave a box empty to use the default name. These names are shared by everyone on this ledger.</p>
      <form onSubmit={e => { e.preventDefault(); save(names); }} className="space-y-4">
        <div className="grid gap-3 grid-cols-[repeat(auto-fill,minmax(min(100%,16rem),1fr))]">
          {PAGE_KEYS.map(k => (
            <div key={k} className="rounded-xl border border-border bg-card p-4">
              <Field label={`Default: ${DEFAULT_PAGE_NAMES[k]}`}>
                <input className={inputCls} value={names[k]} onChange={e => setNames(s => ({ ...s, [k]: e.target.value }))} placeholder={DEFAULT_PAGE_NAMES[k]} maxLength={30} disabled={!canEdit || busy} />
              </Field>
              {canEdit && names[k] && (
                <button type="button" className="mt-2 text-xs text-muted-foreground underline" disabled={busy} onClick={() => setNames(s => ({ ...s, [k]: '' }))}>Use default</button>
              )}
            </div>
          ))}
        </div>
        {err && <p role="alert" className="text-sm text-negative">{err}</p>}
        {msg && <p role="status" className="text-sm text-positive">{msg}</p>}
        {canEdit && (
          <div className="flex flex-wrap gap-2">
            <button type="submit" className={btnPrimary} disabled={busy || !changed}>{busy ? 'Saving...' : 'Save names'}</button>
            <button type="button" className={btnSecondary} disabled={busy || (!anyAlias && !Object.keys(getPageAliases()).length)} onClick={() => save({})}>Reset all to defaults</button>
          </div>
        )}
      </form>
    </div>
  );
}
