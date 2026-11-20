import React from 'react';

// Small paperclip with a count. Quiet colour; for ledger rows.
export default function DocCount({ count }) {
  if (!count || count < 1) return null;
  const label = `${count} ${count === 1 ? 'document' : 'documents'}`;
  return (
    <span title={label} aria-label={label} role="img" className="inline-flex shrink-0 items-center gap-0.5 text-xs text-muted-foreground">
      <svg aria-hidden="true" viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21.4 11.1 12.2 20.3a6 6 0 0 1-8.5-8.5l9.2-9.2a4 4 0 0 1 5.7 5.7l-9.2 9.2a2 2 0 0 1-2.8-2.8l8.5-8.5" />
      </svg>
      <span aria-hidden="true">{count}</span>
    </span>
  );
}
