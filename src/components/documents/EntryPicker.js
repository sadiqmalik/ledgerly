import React, { useEffect, useRef, useState } from 'react';
import { api } from '../../services/dataAPI';
import Amount from '../common/Amount';
import { errorMessage } from '../common/format';
import { inputCls } from '../settings/ui';

export const entryText = e => [e.date, e.partyName, e.comment].filter(Boolean).join(', ');

// Removable chips for chosen entries.
export function EntryChips({ entries, onRemove }) {
  if (!entries.length) return null;
  return (
    <ul className="flex flex-wrap gap-1.5" style={{ listStyle: 'none', padding: 0 }}>
      {entries.map(e => (
        <li key={e.id} className="inline-flex max-w-full items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs text-foreground">
          <span className="truncate">{e.date}{e.partyName ? ` ${e.partyName}` : ''} <Amount minor={e.amount} currency={e.currency} tone={e.direction} />{e.comment ? ` ${e.comment.slice(0, 24)}` : ''}</span>
          <button type="button" aria-label={`Remove entry ${e.date} ${e.partyName || ''}`} onClick={() => onRemove(e.id)} className="shrink-0 px-1 text-muted-foreground hover:text-foreground">&times;</button>
        </li>
      ))}
    </ul>
  );
}

// Search the book's entries (entries list `q`, small page) and pick one at a time.
export default function EntryPicker({ bookId, excludeIds, onPick, disabled }) {
  const [q, setQ] = useState('');
  const [rows, setRows] = useState([]);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState('');
  const root = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    let off = false;
    const t = setTimeout(() => {
      api.get(`/books/${bookId}/entries`, { params: { ...(q.trim() ? { q: q.trim() } : {}), pageSize: 20 } })
        .then(r => { if (!off) { setRows(r.data?.rows || []); setError(''); } })
        .catch(err => { if (!off) setError(errorMessage(err)); });
    }, q.trim() ? 250 : 0);
    return () => { off = true; clearTimeout(t); };
  }, [bookId, q, open]);

  const shown = rows.filter(e => !excludeIds.includes(e.id));
  return (
    <div ref={root} className="relative min-w-0" onBlur={ev => { if (!root.current?.contains(ev.relatedTarget)) setOpen(false); }}>
      <input type="search" aria-label="Search entries" className={inputCls} value={q} disabled={disabled} autoComplete="off"
        placeholder="Search entries by date, party or comment" onFocus={() => setOpen(true)} onChange={ev => { setQ(ev.target.value); setOpen(true); }}
        onKeyDown={ev => { if (ev.key === 'Escape' && open) { ev.stopPropagation(); setOpen(false); } }} />
      {open && !disabled && (
        <ul role="listbox" className="absolute left-0 right-0 top-full z-50 mt-1 max-h-60 overflow-y-auto rounded-lg border border-border bg-card py-1 text-sm text-card-foreground shadow-lg" style={{ listStyle: 'none' }}>
          {error && <li className="px-3 py-1.5 text-negative">{error}</li>}
          {shown.map(e => (
            <li key={e.id} role="option" aria-selected="false" tabIndex={-1} onMouseDown={ev => ev.preventDefault()}
              onClick={() => { onPick(e); setQ(''); setOpen(false); }} className="cursor-pointer px-3 py-1.5 hover:bg-muted">
              <span className="break-words">{entryText(e) || '(no details)'}</span>{' '}<Amount minor={e.amount} currency={e.currency} tone={e.direction} />
            </li>
          ))}
          {!error && !shown.length && <li className="px-3 py-1.5 text-muted-foreground">No matching entries.</li>}
        </ul>
      )}
    </div>
  );
}
