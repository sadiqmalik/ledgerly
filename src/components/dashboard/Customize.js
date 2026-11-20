import React from 'react';
import { SECTIONS } from './layout';

const label = id => SECTIONS.find(s => s.id === id).label;

// Show/hide switch plus move up/down buttons for every section. Changes apply instantly.
export default function Customize({ layout, toggle, move, reset, onClose }) {
  return (
    <section aria-label="Customize dashboard" className="rounded-lg border border-border bg-card p-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">Customize dashboard</h2>
        <div className="flex gap-2">
          <button type="button" className="btn" onClick={reset}>Reset to default</button>
          <button type="button" className="btn" onClick={onClose}>Done</button>
        </div>
      </div>
      <ul style={{ listStyle: 'none' }} className="divide-y divide-border">
        {layout.order.map((id, i) => {
          const on = !layout.hidden.includes(id);
          return (
            <li key={id} className="flex items-center gap-2 py-1.5">
              <button type="button" role="switch" aria-checked={on} aria-label={`Show ${label(id)}`} onClick={() => toggle(id)}
                className={`relative h-6 w-10 shrink-0 rounded-full border border-border ${on ? 'bg-accent' : 'bg-muted'}`} style={{ padding: 0 }}>
                <span aria-hidden="true" className="absolute top-0.5 h-4 w-4 rounded-full bg-card transition-all" style={{ left: on ? '1.15rem' : '0.15rem', border: '1px solid var(--border)' }} />
              </button>
              <span className={`flex-1 text-sm ${on ? '' : 'text-muted-foreground'}`}>{label(id)}</span>
              <button type="button" className="btn px-2 py-1" aria-label={`Move ${label(id)} up`} disabled={i === 0} onClick={() => move(id, -1)}>&uarr;</button>
              <button type="button" className="btn px-2 py-1" aria-label={`Move ${label(id)} down`} disabled={i === layout.order.length - 1} onClick={() => move(id, 1)}>&darr;</button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
