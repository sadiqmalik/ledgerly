import React, { useState } from 'react';
import { formatMoney } from '../../utils/money';
import { niceTicks, compact } from '../reports/charts/scale';
import { pct } from './ui';

const W = 680; const H = 320; const M = { top: 28, right: 16, bottom: 46, left: 52 };

// Vertical columns, one per item, with a light grid and the value above each column. Same input as the pie:
// segments [{ id, label, value (minor, > 0), color }]. Hover or focus a column to see its full amount and share.
export default function ColumnGraph({ segments, currency, centerLabel = 'Total', ariaLabel }) {
  const [active, setActive] = useState(null);
  const total = segments.reduce((s, x) => s + x.value, 0);
  if (!total) return null;
  const ticks = niceTicks(0, Math.max(...segments.map(s => s.value)), 4);
  const top = ticks[ticks.length - 1];
  const iw = W - M.left - M.right; const ih = H - M.top - M.bottom;
  const y = v => M.top + ih - (v / top) * ih;
  const band = iw / segments.length; const bw = Math.min(64, band * 0.6);
  const shown = active ? segments.find(s => s.id === active) : null;
  return (
    <div>
      <p className="mb-1 text-sm text-muted-foreground" aria-live="polite">
        {shown ? <>{shown.label}: <span className="text-foreground">{currency} {formatMoney(shown.value)}</span> ({pct(shown.value, total)}%)</>
          : <>{centerLabel}: <span className="text-foreground">{currency} {formatMoney(total)}</span></>}
      </p>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={ariaLabel || `Split of ${centerLabel}`} style={{ width: '100%', height: 'auto', display: 'block' }}>
        {ticks.map(t => (
          <g key={t}>
            <line x1={M.left} x2={W - M.right} y1={y(t)} y2={y(t)} stroke="var(--border)" strokeWidth={t === 0 ? 1.5 : 1} />
            <text x={M.left - 8} y={y(t)} textAnchor="end" dominantBaseline="middle" fontSize="12" fill="var(--muted-foreground)">{compact(t)}</text>
          </g>
        ))}
        {segments.map((s, i) => {
          const cx = M.left + band * i + band / 2;
          const h = Math.max(2, y(0) - y(s.value));
          const on = active === s.id;
          return (
            <g key={s.id} tabIndex={0} aria-label={`${s.label}: ${formatMoney(s.value)} ${currency}, ${pct(s.value, total)}%`} style={{ outline: 'none', opacity: active && !on ? 0.45 : 1, transition: 'opacity .15s' }}
              onMouseEnter={() => setActive(s.id)} onMouseLeave={() => setActive(null)} onFocus={() => setActive(s.id)} onBlur={() => setActive(null)}>
              <rect x={cx - bw / 2} y={y(s.value)} width={bw} height={h} rx="6" ry="6" fill={s.color} />
              <rect x={cx - bw / 2} y={y(s.value) + h - 6} width={bw} height="6" fill={s.color} />
              <text x={cx} y={y(s.value) - 7} textAnchor="middle" fontSize="12" fill="var(--muted-foreground)" fontWeight={on ? 600 : 400}>{compact(s.value)}</text>
              <text x={cx} y={H - M.bottom + 18} textAnchor="middle" fontSize="12" fill="var(--foreground)">{s.label.length > 12 ? `${s.label.slice(0, 11)}…` : s.label}</text>
              <text x={cx} y={H - M.bottom + 33} textAnchor="middle" fontSize="11" fill="var(--muted-foreground)">{pct(s.value, total)}%</text>
              <rect x={cx - band / 2} y={M.top} width={band} height={ih + M.bottom - 6} fill="transparent" />
            </g>
          );
        })}
      </svg>
    </div>
  );
}
