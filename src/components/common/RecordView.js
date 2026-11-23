import React from 'react';
import Modal from './Modal';

const empty = v => v === null || v === undefined || v === '' || v === false || (Array.isArray(v) && v.length === 0);

// Small pills under a title (used inside the shaded header box).
export function TagPills({ tags = [] }) {
  const list = tags.filter(c => !empty(c));
  if (!list.length) return null;
  return (
    <div className="mt-1.5 flex flex-wrap gap-1.5">
      {list.map((t, i) => <span key={i} className="rounded-full border border-border bg-background/70 px-2 py-px text-[11px] font-medium text-muted-foreground">{t}</span>)}
    </div>
  );
}

// The read-only look of a record (entry, document, loan entry, note): a dialog with the key figure on top, small
// label/value tiles and the long text below, instead of a form full of disabled boxes. Empty values are skipped.
//   title      shown in the shaded header box with the × close button (a note's title, or for example "Entry")
//   headline   optional big line, for example <Amount ... /> (shown first, with `headlineHint` beside it)
//   tags       small pills inside the shaded header under the title (hidden when empty)
//   chips      small pills under the headline, for example ["Debit", "Excluded from totals"]
//   rows       [{ label, value, wide }]: tiles; `wide` spans the whole row (long text such as a comment)
//   children   anything else (attached documents, history)
//   actions    optional extra buttons (for example Duplicate); closing is the × in the header box
export default function RecordView({ title, titleSuffix = null, headline, headlineHint, chips = [], tags = [], rows = [], children, actions, onClose }) {
  const shown = rows.filter(r => !empty(r.value));
  const tiles = shown.filter(r => !r.wide);
  const wide = shown.filter(r => r.wide);
  const pills = chips.filter(c => !empty(c));
  const tagList = tags.filter(c => !empty(c));
  return (
    <Modal title={title} onClose={onClose} bare>
      <div className="flex flex-col gap-4">
        <div className="flex items-start justify-between gap-3 rounded-xl border border-border bg-muted/30 px-4 py-3">
          <div className="min-w-0">
            <h3 className="break-words text-xl font-semibold text-foreground" style={{ margin: 0 }}>{title}{titleSuffix ? <> {titleSuffix}</> : null}</h3>
            <TagPills tags={tagList} />
          </div>
          <button type="button" aria-label="Close" onClick={onClose} className="btn shrink-0 px-2 py-1">&times;</button>
        </div>
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
