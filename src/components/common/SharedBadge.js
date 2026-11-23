import React from 'react';
import { useAuth } from '../../auth/AuthContext';

// A small pill that makes a shared notebook, loan or item easy to spot: a two-people icon and the number of ledgers it is
// shown in. Hovering (or focusing) it opens a short card with the main ledger, the other ledgers and a one-line explanation.
// With no ledger at all (a loan shown in every ledger) pass `all`. Renders nothing for an unshared thing.
// kind: 'notebook' | 'loan' | 'item' picks the explanation.
const PeopleIcon = () => (
  <svg aria-hidden="true" viewBox="0 0 24 24" className="size-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="9" cy="8" r="3.2" />
    <path d="M3.5 19c0-3 2.4-5 5.5-5s5.5 2 5.5 5" />
    <circle cx="17" cy="9" r="2.6" />
    <path d="M16 14.2c3 0 5 1.6 5 4.3" />
  </svg>
);

const DETAIL = {
  notebook: 'Opens from each of these ledgers for people who have the Notebook page there. Entries keep their project links in the main ledger.',
  loan: 'Shown in each of these ledgers for people who have the Loans page there. Who can open it still depends on the loan access they were given.',
  item: 'Seen in each of these ledgers. Its location and deleting stay in the main ledger.'
};

// "Ledger: A" (the main ledger; the rest is in the badge's card).
export const ledgerLine = (names = []) => `Ledger: ${(names || []).filter(Boolean)[0] || ''}`;

export default function SharedBadge({ ledgerNames = [], all = false, kind = 'notebook', className = '' }) {
  const { account } = useAuth();
  const names = (ledgerNames || []).filter(Boolean);
  // A person who signed in with an access code is never told a thing is shared, or with which ledgers.
  if (account?.accessCode) return null;
  if (!all && names.length < 2) return null;
  const summary = all ? 'Shown in every ledger' : `Shared with ${names.length} ledgers`;
  return (
    <span tabIndex={0} aria-label={all ? summary : `${summary}. Main ledger ${names[0]}. Also in ${names.slice(1).join(', ')}`}
      className={`group relative inline-flex shrink-0 items-center gap-1 rounded-full border border-accent/60 bg-accent/10 px-1.5 py-px text-[11px] font-semibold leading-4 text-accent outline-none focus-visible:ring-2 focus-visible:ring-accent ${className}`}>
      <PeopleIcon />{all ? 'All' : names.length}
      <span role="tooltip" className="pointer-events-none invisible absolute left-0 top-full z-50 mt-1.5 w-64 rounded-lg border border-border bg-card p-3 text-left text-xs font-normal normal-case text-foreground opacity-0 shadow-lg transition-opacity group-hover:visible group-hover:opacity-100 group-focus-visible:visible group-focus-visible:opacity-100">
        <span className="block text-sm font-semibold">{summary}</span>
        {all
          ? <span className="mt-1 block text-muted-foreground">This loan is not linked to a ledger, so it appears in every ledger for the people it was given to.</span>
          : (
            <>
              <span className="mt-2 block text-muted-foreground">Main ledger</span>
              <span className="block font-medium">{names[0]}</span>
              <span className="mt-2 block text-muted-foreground">Also in</span>
              <span className="block font-medium">{names.slice(1).join(', ')}</span>
              <span className="mt-2 block text-muted-foreground">{DETAIL[kind] || DETAIL.notebook}</span>
            </>
          )}
      </span>
    </span>
  );
}

// The matching pill for a notebook that is not linked to any ledger: same size, colour and slot as SharedBadge, so the
// two always sit in the same place after the name. Hidden for access-code sessions (they never see private notebooks).
const LockIcon = () => (
  <svg aria-hidden="true" viewBox="0 0 24 24" className="size-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="5" y="11" width="14" height="9" rx="2" />
    <path d="M8 11V8a4 4 0 0 1 8 0v3" />
  </svg>
);

export function PrivateBadge({ className = '' }) {
  const title = 'Private: not linked to a ledger, only you can see it';
  return (
    <span tabIndex={0} title={title} aria-label={title}
      className={`inline-flex shrink-0 items-center gap-1 rounded-full border border-accent/60 bg-accent/10 px-1.5 py-px text-[11px] font-semibold leading-4 text-accent outline-none focus-visible:ring-2 focus-visible:ring-accent ${className}`}>
      <LockIcon />Private
    </span>
  );
}
