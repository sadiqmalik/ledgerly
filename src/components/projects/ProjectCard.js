import React from 'react';
import Amount from '../common/Amount';
import FundDot from '../common/FundDot';
import { kindBadge, dateRange, BudgetBar } from './shared';

// One project as a boxed card, the same style as the loan cards: title and badges, a muted subtitle, a small table of
// figures with the net spent as the bold total line, then the budget bar. The whole card opens the project; the
// checkbox picks it for the Summary and Compare.
export default function ProjectCard({ project: p, fund, base, currency, foreign, picked, onToggle, onOpen }) {
  const t = p.totals;
  return (
    <div role="link" tabIndex={0} onClick={() => onOpen(p.id)}
      onKeyDown={e => { if (e.key === 'Enter' && e.target === e.currentTarget) onOpen(p.id); }}
      className={`flex h-full cursor-pointer flex-col rounded-xl border bg-card p-4 text-foreground hover:bg-muted/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${picked ? 'border-accent' : 'border-border'} ${p.status === 'closed' ? 'opacity-70' : ''}`}>
      <div className="flex items-start justify-between gap-2">
        <h2 className="min-w-0 truncate text-lg font-semibold" title={p.name}>{p.name}</h2>
        <span className="flex shrink-0 items-center gap-1.5">
          {p.status === 'closed' && <span className={kindBadge}>closed</span>}
          <label className="flex" onClick={e => e.stopPropagation()}>
            <input type="checkbox" className="size-4 accent-[var(--accent)]" aria-label={`Select ${p.name}`} checked={picked} onChange={() => onToggle(p.id)} />
          </label>
        </span>
      </div>
      <p className="mt-0.5 flex min-w-0 items-center gap-1.5 text-sm text-muted-foreground">
        <FundDot color={fund?.color} />
        <span className="truncate">{p.fundName}{fund?.kind === 'memo' ? ' (memo)' : ''}</span>
        <span className={kindBadge}>{p.kind}</span>
      </p>
      <p className="text-xs text-muted-foreground">{dateRange(p)} &middot; {t.count} {t.count === 1 ? 'entry' : 'entries'}</p>
      <dl className="mt-3 space-y-1 text-sm">
        <div className="flex justify-between gap-2"><dt className="text-muted-foreground">Out (debit)</dt><dd><Amount currency={base} minor={t.out || 0} /></dd></div>
        <div className="flex justify-between gap-2"><dt className="text-muted-foreground">In (credit)</dt><dd><Amount currency={base} minor={t.in || 0} /></dd></div>
        <div className="flex justify-between gap-2 border-t border-border pt-1 font-semibold"><dt>Net spent</dt><dd><Amount currency={base} minor={t.spent} /></dd></div>
        <div className="flex justify-between gap-2 text-xs text-muted-foreground">
          <dt>Paid <Amount currency={base} minor={t.paid} /></dt><dd>Pending <Amount currency={base} minor={t.pending} /></dd>
        </div>
      </dl>
      {foreign && <p className="mt-2 text-xs text-muted-foreground">Totals shown in {base}; this project&apos;s entries are in {currency}</p>}
      {p.budget ? (
        <div className="mt-auto pt-2">
          {!foreign && <BudgetBar spent={t.spent} budget={p.budget} />}
          <div className="mt-1 text-xs text-muted-foreground">Budget <Amount currency={currency} minor={p.budget} /></div>
        </div>
      ) : null}
    </div>
  );
}
