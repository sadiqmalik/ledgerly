import React from 'react';
import Modal from './Modal';

const empty = v => v === null || v === undefined || v === '' || v === false || (Array.isArray(v) && v.length === 0);

// The read-only look of a record (entry, document, loan entry, note): a dialog with the key figure on top, small
// label/value tiles and the long text below, instead of a form full of disabled boxes. Empty values are skipped.
//   title      dialog title (for example "Entry")
//   headline   optional big line, for example <Amount ... /> (shown first, with `headlineHint` beside it)
//   chips      small pills under the headline, for example ["Debit", "Excluded from totals"]
//   rows       [{ label, value, wide }]: tiles; `wide` spans the whole row (long text such as a comment)
//   children   anything else (attached documents, history)
//   actions    optional extra buttons (for example Duplicate); closing is the × in the dialog's title bar
export default function RecordView({ title, headline, headlineHint, chips = [], rows = [], children, actions, onClose }) {
  const shown = rows.filter(r => !empty(r.value));
  const tiles = shown.filter(r => !r.wide);
  const wide = shown.filter(r => r.wide);
  const pills = chips.filter(c => !empty(c));
  return (
    <Modal title={title} onClose={onClose}>
      <div className="flex flex-col gap-4">
        {!empty(headline) && (
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <div className="text-2xl font-semibold tabular-nums">{headline}</div>
            {!empty(headlineHint) && <div className="text-sm text-muted-foreground">{headlineHint}</div>}
          </div>
        )}
        {pills.length > 0 && (
          <ul className="flex flex-wrap gap-1.5" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {pills.map((c, i) => <li key={i} className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-foreground">{c}</li>)}
          </ul>
        )}
        {tiles.length > 0 && (
          <dl className="grid gap-2 grid-cols-[repeat(auto-fill,minmax(min(100%,10rem),1fr))]" style={{ margin: 0 }}>
            {tiles.map(r => (
              <div key={r.label} className="min-w-0 rounded-lg border border-border bg-muted/30 px-3 py-2">
                <dt className="text-xs text-muted-foreground">{r.label}</dt>
                <dd className="break-words text-sm font-medium" style={{ margin: 0 }}>{r.value}</dd>
              </div>
            ))}
          </dl>
        )}
        {wide.map(r => (
          <div key={r.label} className="rounded-lg border border-border bg-muted/30 px-3 py-2">
            <div className="text-xs text-muted-foreground">{r.label}</div>
            <div className="whitespace-pre-wrap break-words text-sm">{r.value}</div>
          </div>
        ))}
        {children}
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>
    </Modal>
  );
}
