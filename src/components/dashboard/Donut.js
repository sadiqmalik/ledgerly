import React, { useState } from 'react';
import { formatMoney } from '../../utils/money';
import { pct } from './ui';

export const PALETTE = ['var(--cur-1)', 'var(--cur-2)', 'var(--cur-3)', 'var(--cur-4)', 'var(--cur-5)', 'var(--cur-6)'];

const W = 680; const H = 330; const CX = W / 2; const CY = 150;
const OUT = 120;                       // radius of the filled pie
const R = OUT / 2; const SW = OUT;     // a circle of radius OUT/2 stroked OUT wide fills the whole pie
const MIN_LABEL = 0.02;                // slices under 2% get no callout (still in the legend and on hover)
const LINE_H = 20;                     // minimum vertical distance between callouts on one side

// Filled pie chart with leader lines: each slice has a line to its amount and percentage; the legend beside it only says
// which colour is which fund. Hover or focus a slice or a legend row to highlight it. segments: [{ id, label, value (minor, > 0), color }].
// size scales the picture (its maximum width is size * 4.4 px). Only CSS variables for colour, so both themes work.
export default function Donut({ segments, currency, centerLabel = 'Total', size = 160, ariaLabel }) {
  const [active, setActive] = useState(null);
  const total = segments.reduce((s, x) => s + x.value, 0);
  if (!total) return null;
  const C = 2 * Math.PI * R;
  const gap = segments.length > 1 ? Math.min(2.5, C / segments.length / 4) : 0;

  // Slice geometry: start at 12 o'clock, clockwise.
  let acc = 0;
  const slices = segments.map(s => {
    const frac = s.value / total;
    const mid = (acc + frac / 2) * 2 * Math.PI - Math.PI / 2;
    const slice = { ...s, frac, start: acc * C, len: frac * C, mid };
    acc += frac;
    return slice;
  });

  // Callouts: anchor on the ring's outer edge, elbow a little further out, label to the left or right. Labels on one side
  // are spread vertically so they never overlap.
  const outer = OUT;
  const place = side => {
    const list = slices.filter(s => s.frac >= MIN_LABEL && (Math.cos(s.mid) >= 0) === (side === 'right'))
      .map(s => ({ s, y: CY + Math.sin(s.mid) * (outer + 14) }))
      .sort((a, b) => a.y - b.y);
    for (let i = 1; i < list.length; i += 1) if (list[i].y - list[i - 1].y < LINE_H) list[i].y = list[i - 1].y + LINE_H;
    const over = list.length ? list[list.length - 1].y - (H - 40) : 0;
    if (over > 0) list.forEach(l => { l.y -= over; });
    for (let i = list.length - 2; i >= 0; i -= 1) if (list[i + 1].y - list[i].y < LINE_H) list[i].y = list[i + 1].y - LINE_H;
    return list;
  };
  const callouts = [...place('right').map(c => ({ ...c, side: 'right' })), ...place('left').map(c => ({ ...c, side: 'left' }))];

  const shown = active ? slices.find(s => s.id === active) : null;
  const centerTop = (shown ? shown.label : centerLabel);
  const centerText = formatMoney(shown ? shown.value : total);

  return (
    <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={ariaLabel || `Split of ${centerLabel}`}
        style={{ width: '100%', maxWidth: size * 4.4, flex: '1 1 320px', height: 'auto' }}>
        <g style={{ transform: `rotate(-90deg)`, transformOrigin: `${CX}px ${CY}px` }}>
          {slices.map(s => {
            const dash = Math.max(0.5, s.len - gap);
            return (
              <circle key={s.id} cx={CX} cy={CY} r={active === s.id ? R + 4 : R} fill="none" stroke={s.color} strokeWidth={active === s.id ? SW + 8 : SW}
                strokeDasharray={`${dash} ${C - dash}`} strokeDashoffset={-s.start} tabIndex={0}
                aria-label={`${s.label}: ${formatMoney(s.value)} ${currency}, ${pct(s.value, total)}%`}
                style={{ opacity: active && active !== s.id ? 0.4 : 1, transition: 'opacity .15s, stroke-width .15s', outline: 'none' }}
                onMouseEnter={() => setActive(s.id)} onMouseLeave={() => setActive(null)} onFocus={() => setActive(s.id)} onBlur={() => setActive(null)}>
                <title>{`${s.label}: ${pct(s.value, total)}%`}</title>
              </circle>
            );
          })}
        </g>

        {callouts.map(({ s, y, side }) => {
          const dir = side === 'right' ? 1 : -1;
          const x0 = CX + Math.cos(s.mid) * outer; const y0 = CY + Math.sin(s.mid) * outer;
          const x1 = CX + Math.cos(s.mid) * (outer + 12); const y1 = CY + Math.sin(s.mid) * (outer + 12);
          const x2 = CX + dir * (outer + 30); // end of the leader, where the text starts
          const dim = active && active !== s.id;
          return (
            <g key={s.id} style={{ opacity: dim ? 0.35 : 1, transition: 'opacity .15s' }} pointerEvents="none">
              <polyline points={`${x0},${y0} ${x1},${y1} ${x2 - dir * 6},${y} ${x2},${y}`} fill="none" stroke={s.color} strokeWidth="1.6" strokeLinejoin="round" />
              <circle cx={x0} cy={y0} r="2.6" fill="#fff" stroke={s.color} strokeWidth="1.4" />
              <text x={x2 + dir * 3} y={y} textAnchor={side === 'right' ? 'start' : 'end'} dominantBaseline="middle" fontSize="14"
                fill="var(--foreground)" fontWeight={active === s.id ? 700 : 500}>
                <tspan>{formatMoney(s.value)}</tspan>
                <tspan fill="var(--muted-foreground)" fontWeight="400">{`  ${pct(s.value, total)}%`}</tspan>
              </text>
            </g>
          );
        })}

        <text x={CX} y={H - 14} textAnchor="middle" fontSize="15" fill="var(--foreground)">
          <tspan fill="var(--muted-foreground)">{centerTop.length > 28 ? `${centerTop.slice(0, 27)}…` : centerTop}</tspan>
          <tspan fontWeight="700">{`  ${currency} ${centerText}`}</tspan>
          {shown && <tspan fill="var(--muted-foreground)">{`  ${pct(shown.value, total)}%`}</tspan>}
        </text>
      </svg>

      <ul className="min-w-0 basis-36 space-y-1 text-sm" style={{ listStyle: 'none' }} aria-label="Legend">
        {segments.map(s => (
          <li key={s.id} className="flex min-w-0 items-center gap-2 rounded px-1 py-0.5" style={{ background: active === s.id ? 'var(--muted)' : undefined }}
            onMouseEnter={() => setActive(s.id)} onMouseLeave={() => setActive(null)}>
            <span aria-hidden="true" className="size-3 shrink-0 rounded-full" style={{ background: s.color }} />
            <span className="min-w-0 truncate">{s.label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
