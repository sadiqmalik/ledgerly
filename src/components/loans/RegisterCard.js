import React from 'react';
import Amount from '../common/Amount';
import { RoleBadge } from './shared';
import SharedBadge, { ledgerLine } from '../common/SharedBadge';
import { StampFooter } from '../common/Stamp';
import { useAuth } from '../../auth/AuthContext';

export default function RegisterCard({ register: r }) {
  const { account } = useAuth();
  const t = r.totals || { taken: 0, returned: 0, balance: 0 };
  const over = t.balance < 0;
  return (
    <a href={`#/loans/${r.id}`} className="block rounded-xl border border-border bg-card p-4 no-underline text-foreground hover:bg-muted/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
      <div className="flex items-start justify-between gap-2">
        <h2 className="flex min-w-0 items-center gap-2 text-lg font-semibold"><span className="min-w-0 truncate">{r.name}</span><SharedBadge kind="loan" ledgerNames={r.ledgerNames} all={!r.bookId} /></h2>
        <span className="flex shrink-0 items-center gap-1.5">{r.settled && <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">Settled</span>}<RoleBadge role={r.role} /></span>
      </div>
      <p className="mt-0.5 truncate text-sm text-muted-foreground">{r.lender} &rarr; {r.borrower}</p>
      {!account?.accessCode && r.ledgerNames?.length === 1 && <p className="mt-1 truncate text-xs text-muted-foreground"><span className="font-medium text-foreground">{ledgerLine(r.ledgerNames)}</span></p>}
      <dl className="mt-3 space-y-1 text-sm">
        <div className="flex justify-between gap-2"><dt className="text-muted-foreground">Total taken</dt><dd><Amount minor={t.taken} currency={r.currency} /></dd></div>
        <div className="flex justify-between gap-2"><dt className="text-muted-foreground">Total returned</dt><dd><Amount minor={t.returned} currency={r.currency} /></dd></div>
        <div className="flex justify-between gap-2 border-t border-border pt-1 font-semibold">
          <dt>{over ? 'Overpaid by' : 'Remaining'}</dt>
          <dd><Amount minor={over ? -t.balance : t.balance} currency={r.currency} tone={over ? 'cr' : 'dr'} /></dd>
        </div>
      </dl>
      <StampFooter createdAt={r.createdAt} updatedAt={r.updatedAt} by={r.createdByName} />
    </a>
  );
}
