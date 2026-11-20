import React, { useState } from 'react';
import { formatMoney } from '../../utils/money';
import { pct } from './ui';

// Horizontal bars, one row per item: colour dot and name on the left, amount and percentage on the right, a thick bar
// underneath (relative to the largest item). Same input as the pie: segments [{ id, label, value (minor, > 0), color }].
export default function BarChart({ segments, currency, centerLabel = 'Total', ariaLabel }) {
  const [active, setActive] = useState(null);
  const total = segments.reduce((s, x) => s + x.value, 0);
  if (!total) return null;
  const max = Math.max(...segments.map(s => s.value));
  return (
    <div role="group" aria-label={ariaLabel || `Split of ${centerLabel}`}>
      <p className="mb-3 flex items-baseline justify-between gap-2 border-b border-border pb-2 text-sm text-muted-foreground">
        <span>{centerLabel}</span>
        <span className="text-base tabular-nums text-muted-foreground">{currency} {formatMoney(total)}</span>
      </p>
      <ul className="space-y-3" style={{ listStyle: 'none' }}>
        {segments.map(s => (
          <li key={s.id} tabIndex={0} aria-label={`${s.label}: ${formatMoney(s.value)} ${currency}, ${pct(s.value, total)}%`}
            onMouseEnter={() => setActive(s.id)} onMouseLeave={() => setActive(null)} onFocus={() => setActive(s.id)} onBlur={() => setActive(null)}
            className="rounded-md outline-none focus-visible:ring-2 focus-visible:ring-accent"
            style={{ opacity: active && active !== s.id ? 0.5 : 1, transition: 'opacity .15s' }}>
            <div className="flex items-baseline gap-2 text-base">
              <span aria-hidden="true" className="size-3 shrink-0 self-center rounded-full" style={{ background: s.color }} />
              <span className={`min-w-0 flex-1 truncate ${active === s.id ? 'text-foreground' : 'text-muted-foreground'}`}>{s.label}</span>
              <span className="tabular-nums text-muted-foreground">{formatMoney(s.value)}</span>
              <span className="w-14 text-right text-sm tabular-nums" style={{ color: s.color }}>{pct(s.value, total)}%</span>
            </div>
            <div className="mt-1.5 h-3 w-full overflow-hidden rounded-full bg-muted/70">
              <div className="h-full rounded-full" style={{ width: `${Math.max(1.5, (s.value / max) * 100)}%`, background: `color-mix(in srgb, ${s.color} 80%, var(--card))`, transition: 'width .3s' }} />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
