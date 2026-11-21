import React from 'react';
import { whenText, CalendarIcon } from './shared';

// The important dates coming up soon, soonest first. Each is a small card with a countdown; today is highlighted.
export default function Upcoming({ items, onOpen, title = 'Upcoming' }) {
  if (!items?.length) return null;
  return (
    <div aria-label={title}>
      <h3 className="mb-1.5 text-sm font-semibold text-foreground">{title}</h3>
      <ul className="grid gap-2 grid-cols-[repeat(auto-fill,minmax(min(100%,15rem),1fr))]" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        {items.map(n => {
          const soon = n.daysAway <= 7;
          return (
            <li key={n.id}>
              <button type="button" onClick={() => onOpen && onOpen(n)}
                className={`block w-full rounded-xl border px-3 py-2 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${soon ? 'border-accent bg-accent/10' : 'border-border bg-card hover:bg-muted/40'}`}
                style={{ color: 'inherit' }}>
                <span className="flex items-start justify-between gap-2">
                  <span className="min-w-0 truncate text-sm font-semibold">{n.important && <span className="mr-1 text-accent" role="img" aria-label="Starred">&#9733;</span>}{n.title}</span>
                  <span className={`shrink-0 text-xs font-medium ${n.daysAway === 0 ? 'text-accent' : 'text-muted-foreground'}`}>{whenText(n.daysAway)}</span>
                </span>
                <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1"><CalendarIcon />{n.nextDate}</span>
                  {n.categoryName && <span>{n.categoryName}</span>}
                  {n.years > 0 && <span>{n.years} {n.years === 1 ? 'year' : 'years'}</span>}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
