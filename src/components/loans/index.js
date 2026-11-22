import React, { useState } from 'react';
import useHashRoute from '../../hooks/useHashRoute';
import useLoanRegisters from './useLoanRegisters';
import RegisterCard from './RegisterCard';
import RegisterDialog from './RegisterDialog';
import RegisterPage from './RegisterPage';
import { btnPrimary, Toggle } from '../settings/ui';
import { useAuth } from '../../auth/AuthContext';
import { useBooks } from '../../hooks/BooksContext';

function RegisterList() {
  const { registers, error } = useLoanRegisters();
  const { account } = useAuth();
  const { book } = useBooks();
  // Access-code sessions are view-only: they never create loans (the server refuses it too).
  const canCreate = !account?.accessCode;
  const [creating, setCreating] = useState(false);
  const [showSettled, setShowSettled] = useState(false);
  const settledCount = (registers || []).filter(r => r.settled && (!r.bookId || r.bookId === book?.id)).length;
  // The open ledger's loans plus loans not linked to any ledger.
  const mine = (registers || []).filter(r => !r.bookId || r.bookId === book?.id);
  const visible = mine.filter(r => showSettled || !r.settled);
  return (
    <section className="space-y-4" aria-label="Loans">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">Money lent and paid back, one loan at a time.</p>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          {settledCount > 0 && <Toggle compact label={`Show settled (${settledCount})`} checked={showSettled} onChange={setShowSettled} />}
          {canCreate && <button type="button" className={btnPrimary} onClick={() => setCreating(true)}>New loan</button>}
        </div>
      </div>
      {error && <p role="alert" className="text-sm text-negative">{error}</p>}
      {registers === null && !error && <p className="text-sm text-muted-foreground" role="status">Loading...</p>}
      {registers && registers.length === 0 && !error && (
        <div className="rounded-xl border border-dashed border-border bg-card p-6 text-sm text-muted-foreground">
          {canCreate
            ? 'No loans yet. Create one with New loan, or ask an administrator to give you access to an existing one.'
            : 'No loans are shared with this access code. Ask an administrator to share a loan with it.'}
        </div>
      )}
      {registers && registers.length > 0 && visible.length === 0 && (
        <div className="rounded-xl border border-dashed border-border bg-card p-6 text-sm text-muted-foreground">All loans are settled. Turn on Show settled loans to see them.</div>
      )}
      {visible.length > 0 && (
        <div className="grid items-start gap-3 grid-cols-[repeat(auto-fill,minmax(min(100%,18rem),1fr))]">
          {visible.map(r => <RegisterCard key={r.id} register={r} />)}
        </div>
      )}
      {creating && <RegisterDialog onClose={() => setCreating(false)} onSaved={r => { setCreating(false); window.location.hash = `#/loans/${r.id}`; }} />}
    </section>
  );
}

// /loans and /loans/<id>. Works without a selected ledger.
export default function Loans() {
  const route = useHashRoute();
  const id = route.startsWith('/loans/') ? decodeURIComponent(route.slice('/loans/'.length).split('/')[0]) : '';
  return id ? <RegisterPage key={id} registerId={id} /> : <RegisterList />;
}
