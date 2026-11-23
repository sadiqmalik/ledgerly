import React from 'react';
import NoteCard from './NoteCard';
import { spanText, colorEdge, LockIcon, EntryMarks, useAppZone } from './shared';

export const tileGrid = 'grid gap-2 grid-cols-[repeat(auto-fill,minmax(min(100%,15rem),1fr))]';

const plain = s => (s || '').replace(/<[^>]*>/g, '').replace(/[*_`#>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 200);

// An important date as a compact two-line tile: the title, a divider, then the exact date and time with the countdown.
// The whole tile opens the entry (editor, or the read-only view when locked or for viewers).
// `show` overrides the dates shown (the next occurrence of a yearly date); `countdown` is hidden when empty or past.
export default function DateTile({ note: n, onOpen, countdown = null, soon = false, show = null, canEdit = false, onLock }) {
  const open = () => onOpen(n);
  const appZone = useAppZone();
  const tip = plain(n.message);
  return (
    <div role="button" tabIndex={0} onClick={open} title={tip || undefined}
      onKeyDown={e => { if ((e.key === 'Enter' || e.key === ' ') && e.target === e.currentTarget) { e.preventDefault(); open(); } }}
      className={`min-w-0 cursor-pointer rounded-lg border px-2.5 py-1.5 text-foreground hover:bg-muted/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${colorEdge(n.color)} ${soon ? `border-accent ${n.color ? '' : 'bg-accent/10'}` : n.important ? 'border-accent' : 'border-border'} ${n.active === false ? 'opacity-60' : ''}`}>
      <div className="flex items-center gap-1.5">
        <span className="min-w-0 flex-1 truncate text-sm font-medium">{n.important && <span role="img" aria-label="Starred" className="mr-1 text-accent">&#9733;</span>}{n.title}</span>
        <EntryMarks note={n} size={14} />
        {n.effectiveLocked && <LockIcon />}
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-x-2 border-t border-foreground/25 pt-1 text-xs text-muted-foreground">
        <span>{spanText(show ? { ...n, ...show } : n, appZone)}</span>
        {countdown && <span className={`font-medium ${soon ? 'text-accent' : ''}`}>{countdown}</span>}
        {n.active === false && <span title="Disabled">off</span>}
      </div>
    </div>
  );
}

// A mixed list: plain notes first as cards, then the important dates as a compact tile grid.
// rows come from the server newest first; newestFirst={false} shows them oldest first (the cards and tiles keep their order).
export function EntryGrid({ rows: serverRows, canEdit, onEdit, onDuplicate, onToggleActive, onDelete, onLock, hideCategory = false, countdownFor = () => null, noteCols = '20rem', newestFirst = true, layout = 'rows' }) {
  const rows = newestFirst ? serverRows : [...serverRows].reverse();
  const notes = rows.filter(r => r.kind !== 'date');
  const dates = rows.filter(r => r.kind === 'date');
  const countdownOf = r => { const cd = countdownFor(r); return cd ? { text: cd.text, soon: !!cd.soon } : null; };
  // Columns: every entry (notes and dates) side by side in one wrapping card grid, in list order.
  if (layout === 'columns') {
    // Fixed-width columns of up to 10 entries; the next entry starts a new column, and columns wrap to the next line.
    const chunks = [];
    for (let i = 0; i < rows.length; i += 10) chunks.push(rows.slice(i, i + 10));
    return (
      <div className="flex flex-wrap items-start gap-3">
        {chunks.map((chunk, i) => (
          <div key={i} className="flex w-full flex-col gap-3 sm:w-64">
            {chunk.map(r => (r.kind === 'date'
              ? <DateTile key={r.id} note={r} onOpen={onEdit} canEdit={canEdit} onLock={onLock} countdown={countdownOf(r)?.text ?? null} soon={!!countdownOf(r)?.soon} />
              : <NoteCard key={r.id} note={r} canEdit={canEdit} hideCategory={hideCategory} onEdit={onEdit} onDuplicate={onDuplicate} onToggleActive={onToggleActive} onDelete={onDelete} onLock={onLock} />))}
          </div>
        ))}
      </div>
    );
  }
  return (
    <div className="space-y-3">
      {!!notes.length && (
        <div className={`grid items-stretch gap-3 grid-cols-[repeat(auto-fill,minmax(min(100%,${noteCols}),1fr))]`}>
          {notes.map(r => <NoteCard key={r.id} note={r} canEdit={canEdit} hideCategory={hideCategory} onEdit={onEdit} onDuplicate={onDuplicate} onToggleActive={onToggleActive} onDelete={onDelete} onLock={onLock} />)}
        </div>
      )}
      {!!dates.length && (
        <div className={tileGrid}>
          {dates.map(r => { const cd = countdownFor(r); return <DateTile key={r.id} note={r} onOpen={onEdit} canEdit={canEdit} onLock={onLock} countdown={cd ? cd.text : null} soon={!!cd?.soon} />; })}
        </div>
      )}
    </div>
  );
}
