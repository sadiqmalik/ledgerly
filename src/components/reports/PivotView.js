import React, { useState } from 'react';
import { useLedger } from '../../hooks/LedgerContext';
import Amount from '../common/Amount';
import ColumnChart from './charts/ColumnChart';
import { Card, TableWrap, td, tdL, pivotChart, useSort, ctl } from './shared';

// Pivot table + stacked chart for a {columns, rows, totals, grandTotal} response.
export default function PivotView({ pivot, title }) {
  const { book } = useLedger();
  const cur = book.baseCurrency;
  const [q, setQ] = useState('');
  const rows = [...pivot.rows].sort((a, b) => b.total - a.total);
  const getters = React.useMemo(() => ({
    name: r => r.name || '', total: r => r.total,
    ...Object.fromEntries(pivot.columns.map(c => [`c${c}`, r => (r.values && r.values[c]) || 0]))
  }), [pivot.columns]);
  const { sorted, SortTh } = useSort(rows, getters, { key: 'total', dir: 'desc' });
  const shown = q.trim() ? sorted.filter(r => (r.name || '').toLowerCase().includes(q.trim().toLowerCase())) : sorted;
  const { series, data } = pivotChart(rows, pivot.columns);
  if (!rows.length) return <div className="p-4 text-sm text-muted-foreground">No data for this selection.</div>;
  return (
    <div className="space-y-5">
      <Card title={`${title} (${cur})`}>
        <ColumnChart data={data} series={series} stacked currency={cur} ariaLabel={`${title}, ${cur}`} />
      </Card>
      <Card>
        <div className="mb-2">
          <input type="search" aria-label="Search rows" placeholder="Search rows..." value={q} onChange={e => setQ(e.target.value)} style={{ ...ctl, width: '100%', maxWidth: 260 }} />
        </div>
        <TableWrap>
          <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 13 }}>
            <thead>
              <tr>
                <SortTh k="name" left>Name</SortTh>
                {pivot.columns.map(c => <SortTh key={c} k={`c${c}`}>{c}</SortTh>)}
                <SortTh k="total">Total</SortTh>
              </tr>
            </thead>
            <tbody>
              {shown.map(r => (
                <tr key={String(r.id) + r.name}>
                  <td style={tdL}>{r.name}</td>
                  {pivot.columns.map(c => <td key={c} style={td}>{r.values && r.values[c] ? <Amount minor={r.values[c]} currency={cur} /> : '–'}</td>)}
                  <td style={{ ...td, fontWeight: 600 }}><Amount minor={r.total} currency={cur} /></td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ fontWeight: 600 }}>
                <td style={tdL}>Total</td>
                {pivot.columns.map(c => <td key={c} style={td}><Amount minor={pivot.totals[c] || 0} currency={cur} /></td>)}
                <td style={td}><Amount minor={pivot.grandTotal} currency={cur} /></td>
              </tr>
            </tfoot>
          </table>
        </TableWrap>
        {!shown.length && <p className="p-2 text-sm text-muted-foreground">No rows match.</p>}
      </Card>
    </div>
  );
}
