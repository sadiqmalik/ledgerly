import React, { useState } from 'react';
import { useLedger } from '../../hooks/LedgerContext';
import Amount from '../common/Amount';
import ColumnChart from './charts/ColumnChart';
import { useGet, Status, Card, TableWrap, th, td, tdL, thL } from './shared';
import { btnSecondary } from '../settings/ui';

export default function Yearly() {
  const { book } = useLedger();
  const state = useGet(`/books/${book.id}/reports/yearly`);
  const [open, setOpen] = useState({});
  return (
    <div className="space-y-5">
    <Status state={state}>
      {({ years }) => {
        const desc = [...years].sort((a, b) => b.year - a.year);
        const asc = [...desc].reverse();
        const data = asc.map(y => ({ label: String(y.year), values: { closing: y.total.closing } }));
        const series = [{ key: 'closing', name: 'Closing balance', color: 'var(--c1)' }];
        const allOpen = desc.length > 0 && desc.every(y => open[y.year]);
        const pick = label => setOpen(o => ({ ...o, [label]: !o[label] }));
        return (
          <>
            <Card title={`Total closing balance per year (${book.baseCurrency})`}>
              <ColumnChart data={data} series={series} currency={book.baseCurrency} ariaLabel={`Closing balance per year, ${book.baseCurrency}`}
                onSelect={pick} selected={desc.find(y => open[y.year]) ? String(desc.find(y => open[y.year]).year) : null} />
              <p className="mt-1 text-xs text-muted-foreground">Click a bar to open that year's funds in the table below.</p>
            </Card>
            <Card>
              <div className="mb-2 flex justify-end">
                <button type="button" className={btnSecondary} onClick={() => setOpen(allOpen ? {} : Object.fromEntries(desc.map(y => [y.year, true])))}>{allOpen ? 'Collapse all' : 'Expand all'}</button>
              </div>
              <TableWrap>
                <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 13 }}>
                  <thead><tr><th style={thL}>Year</th><th style={th}>Opening</th><th style={th}>Credit</th><th style={th}>Debit</th><th style={th}>Closing</th></tr></thead>
                  <tbody>
                    {desc.map(y => {
                      const isOpen = !!open[y.year];
                      const real = y.funds.filter(f => f.kind !== 'memo');
                      const memo = y.funds.filter(f => f.kind === 'memo');
                      const line = (f, isMemo) => (
                        <tr key={f.fundId} style={{ color: 'var(--muted-foreground)' }}>
                          <td style={{ ...tdL, paddingLeft: 28 }}>{f.name}{isMemo && <span style={{ marginLeft: 6, fontSize: 10, border: '1px solid var(--border)', borderRadius: 4, padding: '0 4px' }}>memo</span>}</td>
                          <td style={td}><Amount minor={f.opening} currency={f.currency || book.baseCurrency} /></td><td style={td}><Amount minor={f.cr} currency={f.currency || book.baseCurrency} /></td>
                          <td style={td}><Amount minor={f.dr} currency={f.currency || book.baseCurrency} /></td><td style={td}><Amount minor={f.closing} currency={f.currency || book.baseCurrency} /></td>
                        </tr>
                      );
                      return (
                        <React.Fragment key={y.year}>
                          <tr style={{ fontWeight: 600 }}>
                            <td style={tdL}>
                              <button type="button" aria-expanded={isOpen} onClick={() => setOpen(o => ({ ...o, [y.year]: !o[y.year] }))}
                                style={{ background: 'none', border: 0, cursor: 'pointer', color: 'inherit', font: 'inherit', padding: 0 }}>
                                <span style={{ display: 'inline-block', width: 14 }}>{isOpen ? '▾' : '▸'}</span>{y.year}
                              </button>
                            </td>
                            <td style={td}><Amount minor={y.total.opening} currency={book.baseCurrency} /></td><td style={td}><Amount minor={y.total.cr} currency={book.baseCurrency} /></td>
                            <td style={td}><Amount minor={y.total.dr} currency={book.baseCurrency} /></td><td style={td}><Amount minor={y.total.closing} currency={book.baseCurrency} /></td>
                          </tr>
                          {isOpen && real.map(f => line(f, false))}
                          {isOpen && memo.length > 0 && (
                            <tr><td colSpan={5} style={{ borderBottom: '2px solid var(--border)', padding: 0 }} /></tr>
                          )}
                          {isOpen && memo.map(f => line(f, true))}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </TableWrap>
            </Card>
          </>
        );
      }}
    </Status>
    </div>
  );
}
