import React, { useState } from 'react';
import dataAPI from '../../services/dataAPI';
import { useLedger } from '../../hooks/LedgerContext';
import { errorMessage } from './format';

// Small on/off switch at the right end of an entry row: on = the entry counts in totals, off = excluded (dimmed).
// It changes only `exclude` through PUT /entries/:id; the row's own click (open the editor) is not triggered.
// Not shown for linked transfer legs or entries in a closed year (the API refuses those).
export default function ExcludeSwitch({ entry, onChanged }) {
  const { book, canEdit, isClosedDate } = useLedger();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  if (!canEdit || entry.linkId || isClosedDate(entry.date)) return <span className="w-9 shrink-0" aria-hidden="true" />;
  const counts = !entry.exclude;
  const toggle = async ev => {
    ev.stopPropagation();
    setBusy(true); setError('');
    try {
      await dataAPI.updateEntry(book.id, entry.id, { exclude: counts });
      if (onChanged) onChanged();
    } catch (e) { setError(errorMessage(e)); } finally { setBusy(false); }
  };
  const label = counts ? 'Counted in totals. Click to exclude this entry.' : 'Excluded from totals. Click to count this entry.';
  return (
    <button type="button" role="switch" aria-checked={counts} aria-label={label} title={error || label} disabled={busy}
      onClick={toggle} onKeyDown={ev => ev.stopPropagation()}
      className={`relative h-4 w-7 shrink-0 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-50 ${counts ? 'bg-accent' : 'bg-border'} ${error ? 'ring-2 ring-negative' : ''}`}>
      <span aria-hidden="true" className={`absolute left-0.5 top-0.5 size-3 rounded-full bg-white shadow transition-transform ${counts ? 'translate-x-3' : ''}`} />
    </button>
  );
}
