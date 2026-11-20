import React from 'react';
import { formatMoney } from '../../utils/money';

export const money = (minor, currency) => formatMoney(minor, { currency });

// Splits the summary funds the way the owner thinks about the money.
export function classifyFunds(funds, base) {
  const usable = []; const reserved = []; const wallets = []; const memo = [];
  funds.forEach(f => {
    if (f.kind === 'memo') memo.push(f);
    else if (f.currency !== base) wallets.push(f);
    else if (f.isReserved) reserved.push(f);
    else usable.push(f);
  });
  const sum = list => list.reduce((s, f) => s + f.balance, 0);
  return { base, usable, reserved, wallets, memo, usableTotal: sum(usable), reservedTotal: sum(reserved) };
}

// Tints of two token hues (accent = usable, series-swish = reserved); only CSS variables are used.
export const tint = (family, i) => {
  const base = family === 'usable' ? 'var(--accent)' : 'var(--series-swish)';
  return `color-mix(in srgb, ${base} ${Math.max(35, 100 - i * 16)}%, var(--card))`;
};

export const pct = (part, whole) => (whole > 0 && part > 0 ? Math.round((part * 1000) / whole) / 10 : 0);

export function Card({ title, action, children, wide, className = '', id }) {
  return (
    <section aria-labelledby={id} className={`rounded-lg border border-border bg-card p-4 min-w-0 ${wide ? 'md:col-span-2' : ''} ${className}`}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 id={id} className="text-sm font-semibold text-foreground">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

export const Skeleton = ({ lines = 3, className = '' }) => (
  <div aria-hidden="true" className={`flex animate-pulse flex-col gap-2 ${className}`}>
    {Array.from({ length: lines }, (_, i) => <div key={i} className="h-5 rounded bg-muted" style={{ width: `${100 - (i % 3) * 15}%` }} />)}
  </div>
);

export const Empty = ({ children }) => <p className="text-sm text-muted-foreground">{children}</p>;

export const Badge = ({ children }) => (
  <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">{children}</span>
);
