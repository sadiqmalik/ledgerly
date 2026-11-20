import React, { useState } from 'react';
import Amount from '../common/Amount';
import { money, tint, pct, Skeleton } from './ui';
import Chart from './Chart';
import { useLedger } from '../../hooks/LedgerContext';

const Figure = ({ label, minor, big, currency }) => (
  <div className="min-w-0">
    <div className="text-xs text-muted-foreground">{label}</div>
    <div className={`tabular-nums font-semibold ${big ? 'text-3xl md:text-4xl' : 'text-xl md:text-2xl'}`}><Amount minor={minor} currency={currency} /></div>
  </div>
);

export default function Overview({ data, groups, base, view = 'list' }) {
  const [active, setActive] = useState(null);
  const { fundById } = useLedger();
  if (!data) {
    return <section className="rounded-lg border border-border bg-card p-4 md:col-span-2" aria-busy="true"><Skeleton lines={4} /></section>;
  }
  const { usable, reserved, usableTotal, reservedTotal } = groups;
  const total = usableTotal + reservedTotal;
  // Segments only show positive balances; the percentages share their sum.
  const segs = [
    ...usable.map((f, i) => ({ f, color: tint('usable', i), kind: 'Usable' })),
    ...reserved.map((f, i) => ({ f, color: tint('reserved', i), kind: 'Reserved' }))
  ].filter(s => s.f.balance > 0);
  const sumPos = segs.reduce((s, x) => s + x.f.balance, 0);
  const shown = active && segs.find(s => s.f.id === active);

  return (
    <section aria-label="Overview" className="rounded-lg border border-border bg-card p-4 md:col-span-2">
      <div className="grid grid-cols-2 gap-x-4 gap-y-3 md:grid-cols-[2fr_1fr_1fr] md:items-end">
        <div className="col-span-2 md:col-span-1"><Figure label={`Usable · ${base}`} minor={usableTotal} currency={base} big /></div>
        <Figure label={`Reserved · ${base}`} minor={reservedTotal} currency={base} />
        <Figure label={`Total · ${base}`} minor={total} currency={base} />
      </div>

      {segs.length > 0 && view !== 'list' && (
        <div className="mt-4">
          <Chart view={view} currency={base} centerLabel="Total" size={176} ariaLabel={`Total split by fund, ${base}`}
            segments={segs.map(s => ({ id: s.f.id, label: `${s.f.name}${s.kind === 'Reserved' ? ' (reserved)' : ''}`, value: s.f.balance, color: s.color }))} />
        </div>
      )}
      {segs.length > 0 && view === 'list' && (
        <>
          <div className="mt-4 flex h-4 w-full gap-0.5 overflow-hidden rounded" role="group" aria-label={`Total split by fund, ${base}`}>
            {segs.map(s => (
              <button key={s.f.id} type="button" onMouseEnter={() => setActive(s.f.id)} onMouseLeave={() => setActive(null)}
                onFocus={() => setActive(s.f.id)} onBlur={() => setActive(null)}
                aria-label={`${s.f.name}: ${money(s.f.balance, base)}, ${pct(s.f.balance, sumPos)}%`} title={`${s.f.name}: ${money(s.f.balance, base)} (${pct(s.f.balance, sumPos)}%)`}
                style={{ flex: `${s.f.balance} 0 0`, minWidth: 3, background: fundById(s.f.id)?.color || s.color, border: 0, padding: 0, borderRadius: 2, opacity: active && active !== s.f.id ? 0.45 : 1 }} />
            ))}
          </div>
          <p className="mt-1 h-5 text-xs text-muted-foreground tabular-nums" aria-live="polite">
            {shown ? `${shown.f.name}: ${money(shown.f.balance, base)} (${pct(shown.f.balance, sumPos)}%)` : ''}
          </p>
        </>
      )}
    </section>
  );
}
