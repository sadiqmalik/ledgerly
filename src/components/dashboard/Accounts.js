import { useEffect, useMemo, useState } from 'react';
import { api } from '../../services/dataAPI';
import { useLedger } from '../../hooks/LedgerContext';
import FundDot from '../common/FundDot';
import Amount from '../common/Amount';
import { Card, Skeleton, Empty } from './ui';
import Chart, { PALETTE } from './Chart';

const neg = n => (n < 0 ? 'text-negative' : '');

function Totals({ funds }) {
  const by = {};
  funds.forEach(f => { by[f.currency] = (by[f.currency] || 0) + f.balance; });
  return Object.entries(by).sort(([a], [b]) => a.localeCompare(b)).map(([c, m]) => (
    <div key={c} className="flex items-center justify-between gap-2 border-t border-border pt-2 text-sm">
      <span className="text-muted-foreground">Total {c}</span>
      <span className={`tabular-nums font-semibold ${neg(m)}`}><Amount minor={m} currency={c} /></span>
    </div>
  ));
}

function Box({ title, sub, funds, hint, view }) {
  const { fundById } = useLedger();
  return (
    <div className="flex min-w-0 flex-col gap-2 rounded-md border border-border p-3">
      <div className="flex items-baseline gap-2">
        <h3 className="min-w-0 truncate text-sm font-semibold">{title}</h3>
        {sub && <span className="text-xs text-muted-foreground">{sub}</span>}
      </div>
      {view !== 'list' && (() => {
        // One donut per currency (never mixed); only positive balances.
        const cur = [...new Set(funds.map(f => f.currency))];
        return cur.map(c => {
          const list = funds.filter(f => f.currency === c && f.balance > 0);
          return list.length ? <Chart view={view} key={c} currency={c} centerLabel="Total" size={120} ariaLabel={`${title} by fund, ${c}`}
            segments={list.map((f, i) => ({ id: f.id, label: f.name, value: f.balance, color: PALETTE[i % PALETTE.length] }))} /> : null;
        });
      })()}
      <ul style={{ listStyle: 'none' }} className={`flex flex-col gap-1.5 ${view !== 'list' ? 'hidden' : ''}`}>
        {funds.map(f => (
          <li key={f.id} className="flex items-center gap-2 text-sm">
            <FundDot color={fundById(f.id)?.color} />
            <span className="min-w-0 flex-1 truncate">{f.name}</span>
            <span className={`tabular-nums ${neg(f.balance)}`}><Amount minor={f.balance} currency={f.currency} /></span>
          </li>
        ))}
      </ul>
      <Totals funds={funds} />
      {hint}
    </div>
  );
}

// Which money sits in which account. Memo and zero-balance funds are excluded; currencies are never mixed.
export function Accounts({ data, view = 'list' }) {
  const { book, version, can } = useLedger();
  const [holders, setHolders] = useState([]);
  useEffect(() => {
    let cancelled = false;
    api.get(`/books/${book.id}/holders`)
      .then(r => { if (!cancelled) setHolders(Array.isArray(r.data) ? r.data : []); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [book.id, version]);

  const { boxes, orphans } = useMemo(() => {
    const funds = (data ? data.funds : []).filter(f => f.kind !== 'memo' && f.balance !== 0);
    const ids = new Set(holders.map(h => h.id));
    return {
      boxes: holders.map(h => ({ h, funds: funds.filter(f => f.holderId === h.id) })).filter(b => b.funds.length),
      orphans: funds.filter(f => !f.holderId || !ids.has(f.holderId)),
    };
  }, [data, holders]);

  return (
    <Card title="Accounts" id="d-accounts" wide>
      {!data ? <Skeleton lines={3} /> : !boxes.length && !orphans.length ? <Empty>No non-zero balances.</Empty> : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {boxes.map(({ h, funds }) => <Box key={h.id} title={h.name} sub={h.kind} funds={funds} view={view} />)}
          {orphans.length > 0 && (
            <Box title="No account set" funds={orphans} view={view}
              hint={can('settings') && <a href="#/settings" className="text-xs underline text-muted-foreground">Set accounts in Settings › Funds</a>} />
          )}
        </div>
      )}
    </Card>
  );
}
