import React, { useEffect, useMemo, useState } from 'react';
import { api } from '../../services/dataAPI';
import { useLedger } from '../../hooks/LedgerContext';
import EntryTable from '../ledger/EntryTable';
import Amount from '../common/Amount';
import { Card, Skeleton, Empty, money } from './ui';
import Chart from './Chart';
import { useAuth } from '../../auth/AuthContext';
import { hasResource } from '../../auth/resources.mjs';
import useLoanRegisters from '../loans/useLoanRegisters';

export function ThisYear({ data, view = 'list' }) {
  const { book, can } = useLedger();
  const cur = book.baseCurrency;
  const year = new Date().getFullYear();
  const y = data?.year;
  const net = y ? y.cr - y.dr : 0;
  const Row = ({ label, children }) => <div className="flex items-baseline justify-between py-1"><span className="text-sm text-muted-foreground">{label}</span><span className="tabular-nums font-medium">{children}</span></div>;
  return (
    <Card title={`This year (${year})`} id="d-year" action={can('ledger') && <a href={`#/ledger?year=${year}`} className="text-sm underline">View in Ledger</a>}>
      {!y ? <Skeleton lines={3} /> : (
        <>
          {view !== 'list' && (y.cr > 0 || y.dr > 0) && (
            <div className="mb-3">
              <Chart view={view} currency={cur} centerLabel="Credit + debit" size={140} ariaLabel={`Credit and debit this year, ${cur}`}
                segments={[{ id: 'cr', label: 'Credit', value: y.cr, color: 'var(--positive)' }, { id: 'dr', label: 'Debit', value: y.dr, color: 'var(--negative)' }].filter(s => s.value > 0)} />
            </div>
          )}
          <Row label="Credit"><span className="text-positive"><Amount minor={y.cr} currency={cur} /></span></Row>
          <Row label="Debit"><span className="text-negative"><Amount minor={y.dr} currency={cur} /></span></Row>
          <div className="my-1 border-t border-border" />
          <Row label="Net"><span className={`text-lg font-semibold ${net < 0 ? 'text-negative' : 'text-positive'}`}><Amount minor={net} currency={cur} /></span></Row>
        </>
      )}
    </Card>
  );
}

// Last 12 calendar months, oldest first, zero where there was no profit entry.
function lastMonths() {
  const out = []; const d = new Date();
  for (let i = 11; i >= 0; i -= 1) {
    const m = new Date(d.getFullYear(), d.getMonth() - i, 1);
    out.push(`${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, '0')}`);
  }
  return out;
}

function Sparkline({ points, currency }) {
  const [hover, setHover] = useState(null);
  const W = 300; const H = 64; const P = 6;
  const max = Math.max(...points.map(p => p.v), 1); const min = Math.min(...points.map(p => p.v), 0);
  const x = i => P + (i * (W - 2 * P)) / (points.length - 1);
  const yv = v => H - P - ((v - min) / (max - min || 1)) * (H - 2 * P);
  const path = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${yv(p.v).toFixed(1)}`).join(' ');
  const cur = hover == null ? points[points.length - 1] : points[hover];
  return (
    <div>
      <p className="text-xs text-muted-foreground tabular-nums" aria-live="polite">{cur.m}: <span className="text-foreground"><Amount minor={cur.v} currency={currency} /></span></p>
      <svg viewBox={`0 0 ${W} ${H}`} className="mt-1 h-16 w-full" role="group" aria-label={`Profit by month in ${currency}, last 12 months`} preserveAspectRatio="none">
        <line x1={P} x2={W - P} y1={yv(0)} y2={yv(0)} stroke="var(--border)" strokeWidth="1" />
        <path d={path} fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        {points.map((p, i) => (
          <g key={p.m}>
            <circle cx={x(i)} cy={yv(p.v)} r="14" fill="transparent" tabIndex={0} role="img" aria-label={`${p.m}: ${money(p.v, currency)}`}
              onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} onFocus={() => setHover(i)} onBlur={() => setHover(null)}><title>{`${p.m}: ${money(p.v, currency)}`}</title></circle>
            {(hover === i || (hover == null && i === points.length - 1)) && <circle cx={x(i)} cy={yv(p.v)} r="3.5" fill="var(--accent)" stroke="var(--card)" strokeWidth="2" pointerEvents="none" />}
          </g>
        ))}
      </svg>
    </div>
  );
}

export function ProfitTrend({ groups }) {
  const { book, version } = useLedger();
  const [rows, setRows] = useState(null);
  const reservedIds = useMemo(() => (groups ? groups.reserved.map(f => f.id).join(',') : null), [groups]);

  useEffect(() => {
    if (reservedIds == null) return undefined;
    let off = false;
    const ids = reservedIds.split(',').filter(Boolean);
    const run = async () => {
      // The reserved fund with the most profit entries (months with profit, as a proxy).
      const all = (await api.get(`/books/${book.id}/reports/profit`)).data.rows || [];
      const counts = {};
      all.filter(r => ids.includes(r.fundId)).forEach(r => { counts[r.fundId] = (counts[r.fundId] || 0) + 1; });
      const best = Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0];
      if (!best) return { fund: null, list: [] };
      const r = (await api.get(`/books/${book.id}/reports/profit`, { params: { fund: best } })).data.rows || [];
      return { fund: best, list: r };
    };
    run().then(r => { if (!off) setRows(r); }).catch(() => { if (!off) setRows({ fund: null, list: [] }); });
    return () => { off = true; };
  }, [book.id, reservedIds, version]);

  if (rows && !rows.list.length) return null; // no profit data: hide the section
  const fund = rows && groups.reserved.find(f => f.id === rows.fund);
  const months = lastMonths();
  const points = rows && months.map(m => ({ m, v: rows.list.filter(r => r.month === m).reduce((s, r) => s + r.amount, 0) }));
  const latest = rows && [...rows.list].reverse().find(r => r.rate != null);
  return (
    <Card title={`Profit trend (${fund ? fund.currency : book.baseCurrency})${fund ? ` · ${fund.name}` : ''}`} id="d-profit"
      action={latest && <span className="text-sm tabular-nums text-muted-foreground">Latest rate <span className="font-medium text-foreground">{Math.round(latest.rate * 100) / 100}%</span></span>}>
      {!rows ? <Skeleton lines={3} /> : <Sparkline points={points} currency={fund ? fund.currency : book.baseCurrency} />}
    </Card>
  );
}

export function OpenProjects() {
  const { book, version } = useLedger();
  const [list, setList] = useState(null);
  useEffect(() => {
    let off = false;
    api.get(`/books/${book.id}/projects`).then(r => { if (!off) setList(Array.isArray(r.data) ? r.data : []); }).catch(() => { if (!off) setList([]); });
    return () => { off = true; };
  }, [book.id, version]);
  const open = (list || []).filter(p => p.status !== 'closed').slice(0, 5);
  return (
    <Card title="Open projects" id="d-projects" action={<a href="#/projects" className="text-sm underline">All</a>}>
      {!list ? <Skeleton lines={3} /> : !open.length ? <Empty>No open projects.</Empty> : (
        <ul style={{ listStyle: 'none' }} className="divide-y divide-border">
          {open.map(p => (
            <li key={p.id}>
              <a href={`#/projects/${p.id}`} className="flex items-center gap-3 py-2 no-underline text-foreground hover:bg-muted/60">
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{p.name}</span>
                <span className="text-right text-xs text-muted-foreground tabular-nums">
                  <span className="block">Spent <span className="text-foreground"><Amount minor={p.totals?.spent ?? 0} currency={book.baseCurrency} /></span></span>
                  <span className="block">Pending <span className="text-foreground"><Amount minor={p.totals?.pending ?? 0} currency={book.baseCurrency} /></span></span>
                </span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export function Recent({ data }) {
  const { can } = useLedger();
  return (
    <Card title="Recent entries" id="d-recent" wide action={can('ledger') && <a href="#/ledger" className="text-sm underline">View all</a>}>
      {!data ? <Skeleton lines={5} /> : <EntryTable rows={data.recent} />}
    </Card>
  );
}

// Open loans: what is still owed per currency, and the biggest few with how much of each is back.
export function LoansPanel() {
  const { book } = useLedger();
  const { registers } = useLoanRegisters();
  // Same rule as the sidebar: this ledger's loans plus loans not linked to any ledger.
  const open = (registers || []).filter(r => !r.settled && (!r.bookId || r.ledgerIds?.includes(book?.id)));
  const owed = new Map();
  open.forEach(r => owed.set(r.currency, (owed.get(r.currency) || 0) + Math.max(0, r.totals?.balance ?? 0)));
  const top = open.filter(r => (r.totals?.balance ?? 0) > 0).sort((a, b) => b.totals.balance - a.totals.balance).slice(0, 3);
  return (
    <Card title="Loans" id="d-loans" action={<a href="#/loans" className="text-sm underline">All</a>}>
      {!registers ? <Skeleton lines={3} /> : !open.length ? <Empty>No open loans.</Empty> : (
        <>
          <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-1">
            <div className="min-w-0">
              <div className="text-xs text-muted-foreground">Still owed</div>
              {[...owed].map(([currency, minor]) => (
                <div key={currency} className="text-xl font-semibold tabular-nums"><Amount minor={minor} currency={currency} /></div>
              ))}
            </div>
            <div className="text-sm text-muted-foreground">{open.length} open {open.length === 1 ? 'loan' : 'loans'}</div>
          </div>
          {top.length > 0 && (
            <ul style={{ listStyle: 'none' }} className="mt-3 divide-y divide-border border-t border-border">
              {top.map(r => {
                const back = r.totals.taken > 0 ? Math.min(100, Math.round((r.totals.returned * 100) / r.totals.taken)) : 0;
                return (
                  <li key={r.id}>
                    <a href={`#/loans/${r.id}`} className="block py-2 no-underline text-foreground hover:bg-muted/60">
                      <span className="flex items-baseline justify-between gap-3">
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-medium">{r.name}</span>
                          <span className="block truncate text-xs text-muted-foreground">{r.lender} &rarr; {r.borrower}</span>
                        </span>
                        <span className="shrink-0 text-sm font-medium tabular-nums"><Amount minor={r.totals.balance} currency={r.currency} /></span>
                      </span>
                      <span className="mt-1 block h-1.5 w-full overflow-hidden rounded bg-muted" role="img" aria-label={`${back}% paid back`}>
                        <span className="block h-full rounded bg-accent" style={{ width: `${back}%` }} />
                      </span>
                    </a>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </Card>
  );
}

// Things worth a look: pending entries, past years still open (admins), loans that are fully paid back but not yet
// marked settled (loan admins). The card does not appear when there is nothing to show.
export function Attention() {
  const { book, version, role, can } = useLedger();
  const { account } = useAuth();
  const loansAllowed = hasResource(account, 'loans');
  const { registers } = useLoanRegisters(loansAllowed);
  const [pending, setPending] = useState(0);
  const [openYears, setOpenYears] = useState([]);
  const thisYear = new Date().getFullYear();

  useEffect(() => {
    let off = false;
    if (!can('ledger')) { setPending(0); return undefined; }
    api.get(`/books/${book.id}/entries`, { params: { status: 'pending', pageSize: 1 } })
      .then(r => { if (!off) setPending(Number(r.data?.count) || 0); }).catch(() => { if (!off) setPending(0); });
    return () => { off = true; };
  }, [book.id, version, can]);

  useEffect(() => {
    let off = false;
    if (role !== 'admin') { setOpenYears([]); return undefined; }
    api.get(`/books/${book.id}/years`)
      .then(r => { if (!off) setOpenYears((Array.isArray(r.data) ? r.data : []).filter(y => !y.closed && y.year < thisYear).map(y => y.year)); })
      .catch(() => { if (!off) setOpenYears([]); });
    return () => { off = true; };
  }, [book.id, version, role, thisYear]);

  const items = [];
  if (pending > 0) items.push({ key: 'pending', title: `${pending} pending ${pending === 1 ? 'entry' : 'entries'}`, hint: 'Not marked paid yet.', href: '#/ledger?status=pending' });
  openYears.slice(0, 3).forEach(y => items.push({ key: `year-${y}`, title: `${y} is still open`, hint: 'Check it, then close it in Settings, Years.', href: '#/settings' }));
  if (openYears.length > 3) items.push({ key: 'years-more', title: `${openYears.length - 3} earlier years are still open`, hint: 'Settings, Years.', href: '#/settings' });
  (registers || []).filter(r => !r.settled && r.role === 'admin' && (r.totals?.count ?? 0) > 0 && r.totals.balance === 0)
    .forEach(r => items.push({ key: `loan-${r.id}`, title: `${r.name} is fully paid back`, hint: 'You can mark the loan as settled.', href: `#/loans/${r.id}` }));

  if (!items.length) return null;
  return (
    <Card title="Needs attention" id="d-attention" wide>
      <ul style={{ listStyle: 'none' }} className="divide-y divide-border">
        {items.map(i => (
          <li key={i.key}>
            <a href={i.href} className="flex items-center justify-between gap-3 py-2 no-underline text-foreground hover:bg-muted/60">
              <span className="min-w-0">
                <span className="block text-sm font-medium">{i.title}</span>
                <span className="block text-xs text-muted-foreground">{i.hint}</span>
              </span>
              <span aria-hidden="true" className="shrink-0 text-muted-foreground">&rsaquo;</span>
            </a>
          </li>
        ))}
      </ul>
    </Card>
  );
}
