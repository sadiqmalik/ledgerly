import React from 'react';
import { useLedger } from '../../hooks/LedgerContext';
import { hashIndex, useChipFilter } from './chipUtil';

// Quiet category label with a small hashed dot; click filters the ledger by it.
export default function CategoryTag({ categoryId, name }) {
  const { categories, can } = useLedger();
  const chip = useChipFilter('category');
  const c = categories.find(x => x.id === categoryId) || (name ? categories.find(x => x.name === name) : null);
  const id = c?.id || categoryId;
  const label = c?.name || name || '';
  if (!label) return null;
  const dot = <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full" style={{ background: `var(--chip-${hashIndex(label)}-fg)` }} />;
  if (!id || !can('ledger')) return <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">{dot}<span className="truncate">{label}</span></span>;
  const active = chip.active(id);
  return (
    <button type="button" title={label} aria-pressed={active} aria-label={`Category ${label}`}
      onClick={e => { e.stopPropagation(); chip.toggle(id); }}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') e.stopPropagation(); }}
      className={`inline-flex max-w-full items-center gap-1.5 border-0 bg-transparent p-0 text-sm hover:underline underline-offset-2 cursor-pointer ${active ? 'underline decoration-2 font-medium text-foreground' : 'text-muted-foreground'}`}
      style={{ boxShadow: active ? 'inset 0 0 0 1px var(--border)' : undefined, cursor: 'pointer' }}>
      {dot}<span className="truncate">{label}</span>
    </button>
  );
}
