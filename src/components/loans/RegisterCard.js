import React from 'react';
import Amount from '../common/Amount';
import { RoleBadge } from './shared';
import Stamp from '../common/Stamp';

export default function RegisterCard({ register: r }) {
  const t = r.totals || { taken: 0, returned: 0, balance: 0 };
  const over = t.balance < 0;
  return (
    <a href={`#/loans/${r.id}`} className="block rounded-xl border border-border bg-card p-4 no-underline text-foreground hover:bg-muted/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
      <div className="flex items-start justify-between gap-2">
        <h2 className="min-w-0 truncate text-lg font-semibold">{r.name}</h2>
        <span className="flex shrink-0 items-center gap-1.5">{r.settled && <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">Settled</span>}<RoleBadge role={r.role} /></span>
      </div>
      <p className="mt-0.5 truncate text-sm text-muted-foreground">{r.lender} &rarr; {r.borrower}</p>
      <Stamp createdAt={r.createdAt} updatedAt={r.updatedAt} className="text-xs text-muted-foreground" />
      <dl className="mt-3 space-y-1 text-sm">
        <div className="flex justify-between gap-2"><dt className="text-muted-foreground">Total taken</dt><dd><Amount minor={t.taken} currency={r.currency} /></dd></div>
        <div className="flex justify-between gap-2"><dt className="text-muted-foreground">Total returned</dt><dd><Amount minor={t.returned} currency={r.currency} /></dd></div>
        <div className="flex justify-between gap-2 border-t border-border pt-1 font-semibold">
          <dt>{over ? 'Overpaid by' : 'Remaining'}</dt>
          <dd><Amount minor={over ? -t.balance : t.balance} currency={r.currency} tone={over ? 'cr' : 'dr'} /></dd>
        </div>
      </dl>
    </a>
  );
}
