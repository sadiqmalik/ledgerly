import React, { useEffect, useRef, useState } from 'react';
import Amount from '../common/Amount';
import { useCurrencies } from '../../hooks/CurrencyContext';

// Builds one block of figures per currency, base currency first.
function buildLines({ totals, totalsByCurrency, baseCurrency }) {
  const codes = Object.keys(totalsByCurrency || {});
  const raw = codes.length > 1
    ? codes.map(c => ({ cur: c, ...totalsByCurrency[c] }))
    : [{ cur: codes[0] || baseCurrency, ...(totals || { cr: 0, dr: 0, net: 0 }), ...(codes[0] ? totalsByCurrency[codes[0]] : {}) }];
  return raw.map(l => {
    const net = l.net ?? l.cr - l.dr;
    const hasOpening = l.opening != null;
    const opening = l.opening ?? 0;
    return { cur: l.cur, cr: l.cr, dr: l.dr, net, hasOpening, opening, closing: l.closing === null ? null : l.closing ?? opening + net, closingNote: l.closingNote || null };
  }).sort((a, b) => (a.cur === baseCurrency ? -1 : b.cur === baseCurrency ? 1 : a.cur.localeCompare(b.cur)));
}

const Row = ({ label, children, muted, strong }) => (
  <div className={`flex items-baseline justify-between gap-3 py-0.5 ${muted ? 'text-muted-foreground' : ''} ${strong ? 'font-semibold' : ''}`}>
    <span>{label}</span>
    <span className="tabular-nums text-right">{children}</span>
  </div>
);


// A clear heading per currency block: code badge + name (+ "base" for the book's own currency).
function CurrencyHeading({ cur, isBase }) {
  const { name } = useCurrencies();
  return (
    <div className="flex items-center gap-2 mb-2">
      <span className="rounded-md bg-accent text-accent-foreground px-2 py-0.5 text-sm font-semibold tracking-wide">{cur}</span>
      <span className="text-sm font-medium text-foreground">{name(cur) || cur}</span>
      {isBase && <span className="ml-auto text-xs text-muted-foreground">base currency</span>}
    </div>
  );
}

function Block({ l, baseCurrency, multi }) {
  const cur = l.cur;
  const sign = n => (n >= 0 ? 'cr' : 'dr');
  return (
    <div className="py-3 first:pt-0">
      {(multi || l.cur !== baseCurrency) && <CurrencyHeading cur={l.cur} isBase={l.cur === baseCurrency} />}
      {l.hasOpening && <Row label="Opening balance" muted><Amount minor={l.opening} currency={cur} /></Row>}
      <Row label="+ Credit"><Amount minor={l.cr} currency={cur} tone="cr" /></Row>
      <Row label={'− Debit'}><Amount minor={l.dr} currency={cur} tone="dr" /></Row>
      <div className="border-t border-border my-1" role="presentation" />
      <Row label="Net" strong><Amount minor={l.net} currency={cur} tone={sign(l.net)} /></Row>
      {l.hasOpening && l.closing === null && l.closingNote && (
        <p className="mt-1.5 text-xs text-muted-foreground">{l.closingNote}</p>
      )}
      {l.hasOpening && l.closing !== null && (
        <div className="mt-1.5 rounded-md bg-muted px-2 py-1.5 -mx-2">
          <Row label="Closing balance" strong><Amount minor={l.closing} currency={cur} className="text-lg" /></Row>
        </div>
      )}
    </div>
  );
}

function Body({ lines, baseCurrency, openings, hasExcluded }) {
  return (
    <>
      <div className="divide-y divide-border">
        {lines.map(l => <Block key={l.cur} l={l} baseCurrency={baseCurrency} multi={lines.length > 1} />)}
      </div>
      {openings.length > 0 && (
        <details className="mt-3 text-sm">
          <summary className="cursor-pointer text-muted-foreground">By fund</summary>
          <ul className="mt-1" style={{ listStyle: 'none' }}>
            {openings.map(o => (
              <li key={`${o.fundId}-${o.currency}`} className="flex justify-between gap-3 py-0.5">
                <span className="truncate">{o.fundName} <span className="text-xs text-muted-foreground">opening</span></span>
                <Amount minor={o.amount} currency={o.currency} />
              </li>
            ))}
          </ul>
        </details>
      )}
      {hasExcluded && <p className="mt-3 text-xs text-muted-foreground">Excluded rows are not counted.</p>}
    </>
  );
}

function Header({ caption, count, active }) {
  return (
    <div className="mb-3">
      <h2 className="text-base font-semibold">Summary</h2>
      <p className="text-xs text-muted-foreground">
        {caption} &middot; {count} {count === 1 ? 'row' : 'rows'}
        {active > 0 ? ` · ${active} filter${active > 1 ? 's' : ''} active` : ''}
      </p>
    </div>
  );
}

// Desktop (>= 1280px): sticky sidebar card. Below that: a fixed bottom bar with the key figure that opens a sheet.
export default function TotalsBar({ totals, totalsByCurrency, baseCurrency, openings = [], count = 0, caption = '', active = 0, hasExcluded = false }) {
  const lines = buildLines({ totals, totalsByCurrency, baseCurrency });
  const key = lines[0];
  const showClosing = key.hasOpening && key.closing !== null;
  const keyLabel = showClosing ? 'Closing' : 'Net';
  const keyValue = showClosing ? key.closing : key.net;
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

  const body = <Body lines={lines} baseCurrency={baseCurrency} openings={openings} hasExcluded={hasExcluded} />;

  return (
    <>
      <aside aria-label="Summary" className="hidden xl:block sticky top-4 self-start rounded-lg border border-border bg-card p-4 text-sm">
        <Header caption={caption} count={count} active={active} />
        {body}
      </aside>

      <div ref={root} className="xl:hidden fixed inset-x-0 bottom-0 z-30 border-t border-border bg-card shadow-lg"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        {open && (
          <div id="ledger-summary-sheet" role="region" aria-label="Summary" className="max-h-[70vh] overflow-y-auto border-b border-border p-4 text-sm">
            <Header caption={caption} count={count} active={active} />
            {body}
          </div>
        )}
        <button ref={btn} type="button" aria-expanded={open} aria-controls="ledger-summary-sheet" onClick={() => setOpen(o => !o)}
          className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left" style={{ background: 'transparent', border: 0, color: 'inherit' }}>
          <span className="text-sm text-muted-foreground">{keyLabel}</span>
          <span className="ml-auto text-lg font-semibold tabular-nums">
            <Amount minor={keyValue} currency={key.cur} tone={showClosing ? undefined : (keyValue >= 0 ? 'cr' : 'dr')} />
          </span>
          <svg aria-hidden="true" viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
            style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 150ms' }}><path d="M3 10l5-5 5 5" /></svg>
        </button>
      </div>
    </>
  );
}
