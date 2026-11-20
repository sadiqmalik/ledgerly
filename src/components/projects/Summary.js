import React, { useEffect, useRef, useState } from 'react';
import Amount from '../common/Amount';

// Same look and behaviour as ledger/TotalsBar: sticky sidebar (>= 1024px), bottom bar plus sheet below that.
export const Row = ({ label, children, muted, strong }) => (
  <div className={`flex items-baseline justify-between gap-3 py-0.5 ${muted ? 'text-muted-foreground' : ''} ${strong ? 'font-semibold' : ''}`}>
    <span>{label}</span>
    <span className="tabular-nums text-right">{children}</span>
  </div>
);

// items: [{ key, label, minor, share (0..1), note }]
export function Breakdown({ title, items }) {
  if (!items.length) return null;
  return (
    <div className="mt-3 border-t border-border pt-2">
      <div className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">{title}</div>
      <ul style={{ listStyle: 'none' }}>
        {items.map(i => (
          <li key={i.key} className="py-1">
            <div className="flex justify-between gap-3"><span className="truncate">{i.label}</span><Amount minor={i.minor} /></div>
            {i.note && <div className="text-xs text-muted-foreground">{i.note}</div>}
            <div className="mt-0.5 h-1 w-full overflow-hidden rounded bg-muted" role="presentation">
              <div className="h-full bg-accent" style={{ width: `${Math.round(Math.max(0, Math.min(1, i.share)) * 100)}%` }} />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Header({ title, caption }) {
  return (
    <div className="mb-3">
      <h2 className="text-base font-semibold">{title}</h2>
      {caption && <p className="text-xs text-muted-foreground">{caption}</p>}
    </div>
  );
}

export default function Summary({ title = 'Summary', caption, keyLabel, keyMinor, currency, children, id = 'projects-summary-sheet' }) {
  const [open, setOpen] = useState(false);
  const root = useRef(null);
  const btn = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = e => { if (e.key === 'Escape') { e.stopPropagation(); setOpen(false); if (btn.current) btn.current.focus(); } };
    const onDown = e => { if (root.current && !root.current.contains(e.target)) setOpen(false); };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('touchstart', onDown);
    return () => { document.removeEventListener('keydown', onKey); document.removeEventListener('mousedown', onDown); document.removeEventListener('touchstart', onDown); };
  }, [open]);

  return (
    <>
      <aside aria-label="Summary" className="hidden lg:block sticky top-4 self-start rounded-lg border border-border bg-card p-4 text-sm">
        <Header title={title} caption={caption} />
        {children}
      </aside>
      <div ref={root} className="lg:hidden fixed inset-x-0 bottom-0 z-30 border-t border-border bg-card shadow-lg"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        {open && (
          <div id={id} role="region" aria-label="Summary" className="max-h-[70vh] overflow-y-auto border-b border-border p-4 text-sm">
            <Header title={title} caption={caption} />
            {children}
          </div>
        )}
        <button ref={btn} type="button" aria-expanded={open} aria-controls={id} onClick={() => setOpen(o => !o)}
          className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left" style={{ background: 'transparent', border: 0, color: 'inherit' }}>
          <span className="text-sm text-muted-foreground">{keyLabel}</span>
          <span className="ml-auto text-lg font-semibold tabular-nums"><Amount minor={keyMinor} currency={currency} /></span>
          <svg aria-hidden="true" viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
            style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 150ms' }}><path d="M3 10l5-5 5 5" /></svg>
        </button>
      </div>
    </>
  );
}
