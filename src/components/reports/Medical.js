import React, { useMemo, useState } from 'react';
import { useLedger } from '../../hooks/LedgerContext';
import Amount from '../common/Amount';
import PivotView from './PivotView';
import { YearRange } from './Pivot';
import { useGet, Status, Card, TableWrap, th, td, tdL, thL } from './shared';

const THIS_YEAR = new Date().getFullYear();

export default function Medical() {
  const { book } = useLedger();
  const [from, setFrom] = useState(THIS_YEAR - 4);
  const [to, setTo] = useState(THIS_YEAR);
  const projects = useGet(`/books/${book.id}/project-names`);
  const pivot = useGet(`/books/${book.id}/reports/pivot`, { rows: 'project', direction: 'dr', from, to, memo: 1 });
  const state = useMemo(() => {
    if (projects.loading || pivot.loading) return { loading: true };
    if (projects.error || pivot.error) return { error: projects.error || pivot.error };
    const ids = new Set((projects.data || []).filter(p => p.kind === 'medical').map(p => String(p.id)));
    const rows = pivot.data.rows.filter(r => r.id != null && ids.has(String(r.id)));
    const totals = {}; let grandTotal = 0;
    pivot.data.columns.forEach(c => { totals[c] = rows.reduce((s, r) => s + ((r.values && r.values[c]) || 0), 0); });
    rows.forEach(r => { grandTotal += r.total; });
    return { data: { columns: pivot.data.columns, rows, totals, grandTotal } };
  }, [projects, pivot]);
  return (
    <div className="space-y-5">
      <div className="flex gap-3 rounded-xl border border-border bg-card p-3"><YearRange from={from} to={to} setFrom={setFrom} setTo={setTo} /></div>
      <Status state={state}>
        {data => (
          <div className="space-y-5">
            <Card title={`Medical spend per year (${book.baseCurrency})`}>
              <TableWrap>
                <table style={{ borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead><tr><th style={thL}>Year</th><th style={th}>Total spent</th></tr></thead>
                  <tbody>
                    {[...data.columns].reverse().map(c => <tr key={c}><td style={tdL}>{c}</td><td style={td}><Amount minor={data.totals[c] || 0} currency={book.baseCurrency} /></td></tr>)}
                    <tr style={{ fontWeight: 600 }}><td style={tdL}>Total</td><td style={td}><Amount minor={data.grandTotal} currency={book.baseCurrency} /></td></tr>
                  </tbody>
                </table>
              </TableWrap>
            </Card>
            <PivotView pivot={data} title="Medical projects per year" />
          </div>
        )}
      </Status>
    </div>
  );
}
