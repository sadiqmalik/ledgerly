export const KINDS = ['trip', 'medical', 'event', 'other'];

export const kindBadge = 'rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground';

export const metaPrefill = kind =>
  kind === 'medical'
    ? [{ key: 'hospital', label: 'Hospital' }, { key: 'doctor', label: 'Doctor' }, { key: 'payer', label: 'Payer' }]
    : kind === 'trip' ? [{ key: 'payer', label: 'Payer' }] : [];

export const dateRange = p => [p.startsOn, p.endsOn].filter(Boolean).join(' to ') || 'No dates';

export const labelOf = (project, key) => project?.metaSchema?.find(s => s.key === key)?.label || key;

export function BudgetBar({ spent, budget }) {
  if (!budget) return null;
  const pct = Math.max(0, Math.min(100, Math.round((spent / budget) * 100)));
  return (
    <div className="mt-2" title={`${Math.round((spent / budget) * 100)}% of budget`}>
      <div className="h-2 w-full overflow-hidden rounded bg-muted">
        <div className={`h-full ${spent > budget ? 'bg-negative' : 'bg-accent'}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

// Years a project's startsOn..endsOn overlaps (a single date counts as one year). No dates: [].
export function projectYears(p) {
  const a = Number((p.startsOn || p.endsOn || '').slice(0, 4));
  const b = Number((p.endsOn || p.startsOn || '').slice(0, 4));
  if (!a || !b) return [];
  const out = [];
  for (let y = Math.min(a, b); y <= Math.max(a, b) && out.length < 100; y += 1) out.push(String(y));
  return out;
}

export const chipCls = on => `rounded-full border px-3 py-1 text-sm ${on ? 'border-accent bg-accent text-accent-foreground' : 'border-border bg-background text-foreground'}`;
