import React, { useEffect, useState } from 'react';
import { api } from '../../services/dataAPI';

// GET helper with loading/error state. `url` null = skip. Re-fetches when url or params change.
export function useGet(url, params) {
  const [state, setState] = useState({ loading: !!url, error: null, data: null });
  const key = url ? url + JSON.stringify(params || {}) : '';
  useEffect(() => {
    if (!url) { setState({ loading: false, error: null, data: null }); return undefined; }
    let cancelled = false;
    setState(s => ({ ...s, loading: true, error: null }));
    api.get(url, { params }).then(
      r => { if (!cancelled) setState({ loading: false, error: null, data: r.data }); },
      e => { if (!cancelled) setState({ loading: false, error: (e.response && e.response.data && e.response.data.error) || e.message || 'Request failed', data: null }); }
    );
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, url]);
  return state;
}

export function Status({ state, children }) {
  if (state.loading) return <div className="p-4 text-sm text-muted-foreground" role="status">Loading…</div>;
  if (state.error) return <div className="p-4 text-sm" role="alert" style={{ color: 'var(--negative)' }}>Could not load: {String(state.error)}</div>;
  if (!state.data) return null;
  return children(state.data);
}

export const Card = ({ title, children }) => (
  <section className="rounded-xl border border-border bg-card p-4" style={{ minWidth: 0 }}>
    {title && <h3 className="text-sm font-semibold mb-3">{title}</h3>}
    {children}
  </section>
);

export const TableWrap = ({ children }) => (
  <div style={{ overflowX: 'auto', maxWidth: '100%' }}>{children}</div>
);

export const th = { textAlign: 'right', padding: '6px 10px', fontWeight: 600, whiteSpace: 'nowrap', borderBottom: '1px solid var(--border)', color: 'var(--muted-foreground)', fontSize: 12 };
export const td = { textAlign: 'right', padding: '6px 10px', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums', borderBottom: '1px solid var(--border)' };
export const tdL = { ...td, textAlign: 'left' };
export const thL = { ...th, textAlign: 'left' };

export const Field = ({ label, children }) => (
  <label className="text-xs text-muted-foreground" style={{ display: 'inline-flex', flexDirection: 'column', gap: 2 }}>
    {label}{children}
  </label>
);
export const ctl = { background: 'var(--background)', color: 'var(--foreground)', border: '1px solid var(--border)', borderRadius: 6, padding: '6px 10px', fontSize: 14, minHeight: 34 };

// Pill group (same look as the Settings tabs): one option is selected, click another to switch.
export function Segmented({ label, value, onChange, options }) {
  return (
    <div role="group" aria-label={label} className="inline-flex gap-1 rounded-xl border border-border bg-card p-1">
      {options.map(([key, text]) => (
        <button key={key} type="button" aria-pressed={value === key} onClick={() => onChange(key)}
          className={`whitespace-nowrap rounded-lg px-3 py-1 text-sm font-medium transition-colors ${value === key ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:text-foreground'}`}>{text}</button>
      ))}
    </div>
  );
}

// Click a column header to sort; click again to reverse. Returns the sorted copy and a header renderer.
export function useSort(rows, getters, initial) {
  const [sort, setSort] = useState(initial);
  const sorted = React.useMemo(() => {
    const get = getters[sort.key];
    if (!get) return rows;
    return [...rows].sort((a, b) => {
      const x = get(a); const y = get(b);
      const c = typeof x === 'string' ? x.localeCompare(y) : x - y;
      return sort.dir === 'asc' ? c : -c;
    });
  }, [rows, sort, getters]);
  const SortTh = ({ k, left, children }) => (
    <th style={left ? thL : th} aria-sort={sort.key === k ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <button type="button" onClick={() => setSort(s => ({ key: k, dir: s.key === k && s.dir === 'desc' ? 'asc' : 'desc' }))}
        style={{ background: 'none', border: 0, cursor: 'pointer', color: 'inherit', font: 'inherit', padding: 0 }}>
        {children}<span aria-hidden="true" style={{ marginLeft: 4, opacity: sort.key === k ? 1 : 0.3 }}>{sort.key === k ? (sort.dir === 'asc' ? '▲' : '▼') : '↕'}</span>
      </button>
    </th>
  );
  return { sorted, SortTh };
}

// Categorical palette (fixed order). Defined here because tokens.css has no categorical series colours.
export const PALETTE_CSS = `
.rpt tbody tr:hover td,.rpt tfoot tr:hover td{background:color-mix(in srgb,var(--muted) 60%,transparent)}
.rpt{--c1:#2f5d50;--c2:#c27c2c;--c3:#3d6fa8;--c4:#a8456b;--c5:#7a5aa6;--c6:#8a8a3a;--c7:#8f8a80;--rate:#b3412f}
.dark .rpt{--c1:#7fb8a4;--c2:#e0a458;--c3:#7aa8dc;--c4:#e08aab;--c5:#b39ae0;--c6:#c6c66a;--c7:#a19c90;--rate:#e07a64}
`;
export const COLORS = ['var(--c1)', 'var(--c2)', 'var(--c3)', 'var(--c4)', 'var(--c5)', 'var(--c6)'];
export const OTHER = 'var(--c7)';

// Build chart data from a pivot response: top N rows by total + "Other".
export function pivotChart(rows, columns, top = 6) {
  const sorted = [...rows].sort((a, b) => b.total - a.total);
  const head = sorted.slice(0, top);
  const rest = sorted.slice(top);
  const series = head.map((r, i) => ({ key: 'r' + i, name: r.name, color: COLORS[i] }));
  if (rest.length) series.push({ key: 'other', name: 'Other', color: OTHER });
  const data = columns.map(c => {
    const values = {};
    head.forEach((r, i) => { values['r' + i] = (r.values && r.values[c]) || 0; });
    if (rest.length) values.other = rest.reduce((s, r) => s + ((r.values && r.values[c]) || 0), 0);
    return { label: String(c), values };
  });
  return { series, data };
}
