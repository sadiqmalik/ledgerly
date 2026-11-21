import React, { useEffect, useState } from 'react';
import { useLedger } from '../../hooks/LedgerContext';
import Amount from '../common/Amount';
import ColumnChart from './charts/ColumnChart';
import { useGet, Status, Card, TableWrap, Field, ctl, th, td, tdL, thL } from './shared';
import Select from '../common/Select';

export default function Profit() {
  const { book, funds } = useLedger();
  const [fund, setFund] = useState('');
  useEffect(() => {
    if (fund || !funds.length) return;
    const s = funds.find(f => /^special$/i.test(f.name)) || funds[0];
    setFund(s.id);
  }, [funds, fund]);
  const cur = funds.find(f => f.id === fund)?.currency || book.baseCurrency;
  const state = useGet(fund ? `/books/${book.id}/reports/profit` : null, { fund });
  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-border bg-card p-3">
        <Field label="Fund">
          <Select style={ctl} value={fund} onChange={e => setFund(e.target.value)}>
            {funds.map(f => <option key={f.id} value={f.id}>{f.name} ({f.currency})</option>)}
          </Select>
        </Field>
      </div>
      {!fund ? <div className="p-4 text-sm text-muted-foreground">Loading…</div> : (
        <Status state={state}>
          {({ rows }) => {
            if (!rows.length) return <div className="p-4 text-sm text-muted-foreground">No profit entries for this fund.</div>;
            const data = rows.map(r => ({ label: r.month, values: { amount: r.amount }, line: r.rate }));
            return (
              <div className="space-y-5">
                <Card title={`Monthly profit (${cur}) and rate`}>
                  <ColumnChart currency={cur} data={data} series={[{ key: 'amount', name: 'Profit', color: 'var(--c1)' }]}
                    line={{ name: 'Rate %', color: 'var(--rate)', format: v => `${Math.round(v * 100) / 100}%` }} ariaLabel={`Monthly profit in ${cur} and rate`} />
                </Card>
                <Card>
                  <TableWrap>
                    <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 13 }}>
                      <thead><tr><th style={thL}>Month</th><th style={th}>Amount</th><th style={th}>Rate</th></tr></thead>
                      <tbody>
                        {[...rows].reverse().map(r => (
                          <tr key={r.month}>
                            <td style={tdL}>{r.month}</td><td style={td}>{<Amount minor={r.amount} currency={cur} />}</td>
                            <td style={td}>{r.rate == null ? '–' : `${Math.round(r.rate * 100) / 100}%`}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </TableWrap>
                </Card>
              </div>
            );
          }}
        </Status>
      )}
    </div>
  );
}
