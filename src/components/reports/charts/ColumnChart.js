import React, { useState } from 'react';
import { niceTicks, compact } from './scale';
import useWidth from './useWidth';
import { formatMoney } from '../../../utils/money';

/*
 * Column chart (grouped-free: single or stacked), with an optional line on a secondary axis.
 *   data:   [{ label, values: { [seriesKey]: minorAmount }, line?: number|null }]
 *   series: [{ key, name, color }]
 *   line:   { name, color, format(v) } -> secondary (right) axis, values from data[i].line
 * Hover a column to see all values for that category.
 */
export default function ColumnChart({ data, series, stacked = false, line = null, height = 260, ariaLabel, currency, onSelect = null, selected = null }) {
  const [ref, width] = useWidth();
  const [hover, setHover] = useState(null);
  const w = Math.max(width, 280);
  const small = w < 480;
  const m = { top: 12, right: line ? 40 : 10, bottom: 28, left: small ? 40 : 48 };
  const iw = w - m.left - m.right;
  const ih = height - m.top - m.bottom;

  // value extents (stacked: positives and negatives accumulate separately)
  let lo = 0; let hi = 0;
  data.forEach(d => {
    let pos = 0; let neg = 0;
    series.forEach(s => {
      const v = d.values[s.key] || 0;
      if (stacked) { if (v >= 0) pos += v; else neg += v; } else { pos = Math.max(pos, v); neg = Math.min(neg, v); }
    });
    hi = Math.max(hi, pos); lo = Math.min(lo, neg);
  });
  const ticks = niceTicks(lo, hi, 4);
  const y0 = ticks[0]; const y1 = ticks[ticks.length - 1];
  const y = v => m.top + ih - ((v - y0) / (y1 - y0)) * ih;

  const lineVals = line ? data.map(d => d.line).filter(v => v != null) : [];
  const lt = line ? niceTicks(Math.min(0, ...lineVals, 0), Math.max(0.0001, ...lineVals), 4) : [];
  const l0 = lt[0]; const l1 = lt[lt.length - 1];
  const ly = v => m.top + ih - ((v - l0) / (l1 - l0)) * ih;

  const band = data.length ? iw / data.length : iw;
  const bw = Math.min(40, band * 0.62);
  const cx = i => m.left + band * i + band / 2;
  const every = Math.ceil(data.length / Math.max(1, Math.floor(iw / 44)));

  const linePts = line ? data.map((d, i) => (d.line == null ? null : [cx(i), ly(d.line)])) : [];
  let path = ''; let pen = false;
  linePts.forEach(p => { if (!p) { pen = false; return; } path += `${pen ? 'L' : 'M'}${p[0]},${p[1]}`; pen = true; });

  const hd = hover != null ? data[hover] : null;
  return (
    <div ref={ref} style={{ position: 'relative', width: '100%' }}>
      <svg viewBox={`0 0 ${w} ${height}`} width="100%" height={height} role="img" aria-label={ariaLabel} style={{ display: 'block' }}
        onMouseLeave={() => setHover(null)}>
        {ticks.map(t => (
          <g key={t}>
            <line x1={m.left} x2={w - m.right} y1={y(t)} y2={y(t)} stroke="var(--border)" strokeWidth={t === 0 ? 1.5 : 1} />
            <text x={m.left - 6} y={y(t)} textAnchor="end" dominantBaseline="middle" fontSize="10" fill="var(--muted-foreground)">{compact(t)}</text>
          </g>
        ))}
        {line && lt.map(t => (
          <text key={t} x={w - m.right + 6} y={ly(t)} dominantBaseline="middle" fontSize="10" fill="var(--muted-foreground)">{t}%</text>
        ))}
        {data.map((d, i) => {
          let pos = 0; let neg = 0;
          const n = series.length;
          return (
            <g key={d.label}>
              {series.map((s, si) => {
                const v = d.values[s.key] || 0;
                if (!v) return null;
                let a; let b;
                if (stacked) {
                  if (v >= 0) { a = pos; b = pos + v; pos = b; } else { a = neg; b = neg + v; neg = b; }
                } else { a = 0; b = v; }
                const top = Math.min(y(a), y(b)); const h = Math.max(1, Math.abs(y(a) - y(b)) - (stacked ? 2 : 0));
                const gw = stacked ? bw : bw / n;
                const x = stacked ? cx(i) - bw / 2 : cx(i) - bw / 2 + gw * si;
                return <rect key={s.key} x={x} y={top} width={Math.max(2, gw - 1)} height={h} rx={2} fill={s.color} opacity={(hover == null && selected == null) || hover === i || selected === d.label ? 1 : 0.5} />;
              })}
              {i % every === 0 && (
                <text x={cx(i)} y={height - 8} textAnchor="middle" fontSize="10" fill="var(--muted-foreground)">{d.label}</text>
              )}
            </g>
          );
        })}
        {line && path && <path d={path} fill="none" stroke={line.color} strokeWidth={2} strokeLinejoin="round" />}
        {line && linePts.map((p, i) => p && <circle key={i} cx={p[0]} cy={p[1]} r={data.length > 24 ? 2 : 3.5} fill={line.color} stroke="var(--card)" strokeWidth={2} />)}
        {data.map((d, i) => (
          <rect key={d.label} x={m.left + band * i} y={m.top} width={band} height={ih} fill="transparent"
            style={{ cursor: onSelect ? 'pointer' : 'default' }} onMouseEnter={() => setHover(i)} onMouseMove={() => setHover(i)} onClick={() => { setHover(i); if (onSelect) onSelect(d.label); }}>
            <title>{d.label}</title>
          </rect>
        ))}
      </svg>
      {hd && (
        <div style={{
          position: 'absolute', top: 4, pointerEvents: 'none', zIndex: 5,
          left: Math.min(Math.max(cx(hover) - 80, 0), w - 180), width: 170,
          background: 'var(--card)', color: 'var(--card-foreground)', border: '1px solid var(--border)',
          borderRadius: 6, padding: '6px 8px', fontSize: 11, boxShadow: '0 2px 8px rgba(0,0,0,.15)'
        }}>
          <div style={{ fontWeight: 600, marginBottom: 2 }}>{hd.label}</div>
          {series.filter(s => hd.values[s.key]).map(s => (
            <div key={s.key} style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
              <span><i style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: s.color, marginRight: 4 }} />{s.name}</span>
              <span>{formatMoney(hd.values[s.key], { currency })}</span>
            </div>
          ))}
          {line && hd.line != null && (
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
              <span><i style={{ display: 'inline-block', width: 8, height: 2, background: line.color, marginRight: 4, verticalAlign: 'middle' }} />{line.name}</span>
              <span>{line.format ? line.format(hd.line) : hd.line}</span>
            </div>
          )}
        </div>
      )}
      {(series.length > 1 || line) && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 12px', fontSize: 11, color: 'var(--muted-foreground)', marginTop: 4 }}>
          {series.map(s => (
            <span key={s.key}><i style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: s.color, marginRight: 4 }} />{s.name}</span>
          ))}
          {line && <span><i style={{ display: 'inline-block', width: 12, height: 2, background: line.color, marginRight: 4, verticalAlign: 'middle' }} />{line.name} (right axis)</span>}
        </div>
      )}
    </div>
  );
}
