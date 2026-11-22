import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { decideRoute, hasResource } from './auth/resources.mjs';
import dataAPI from './services/dataAPI';
import AppShell from './layout/AppShell';
import Dashboard from './components/Dashboard';
import Settings from './components/settings';
import Projects from './components/projects';
import Reports from './components/reports';
import Documents from './components/documents';
import Diary from './components/diary';
import ItemTracker from './components/items';
import AdminScreen from './components/admin/AdminScreen';
import Loans from './components/loans';
import { useAuth } from './auth/AuthContext';
import { LedgerScreen, QuickAdd } from './components/ledger';
import { ProfitDialog } from './optionalModules';
import { LedgerProvider, useLedger } from './hooks/LedgerContext';
import useHashRoute from './hooks/useHashRoute';
import { BooksContext } from './hooks/BooksContext';
import { readLocal, writeLocal } from './components/common/format';
import AppearanceSync from './components/common/AppearanceSync';

const BOOK_KEY = 'ledger.book';

const readStoredBook = () => readLocal(BOOK_KEY);

// Picks the screen for the current hash route and hosts the Quick add modal.
function Screens() {
  const route = useHashRoute();
  const { book, role, quickAdd, closeQuickAdd, canQuickAdd, profitOpen, closeProfit } = useLedger();
  const { account } = useAuth();
  const decision = decideRoute(route, account);

  // A route the account may not use is replaced by the first page it may use.
  useEffect(() => {
    if (!decision.allowed && decision.redirect) window.location.replace(`#${decision.redirect}`);
  }, [decision.allowed, decision.redirect]);

  if (!decision.allowed) {
    return decision.none
      ? <p className="muted" role="status">This account has no pages enabled. Ask an administrator for access.</p>
      : null;
  }
  return (
    <>
      {route === '/ledger' ? <LedgerScreen />
        : route.startsWith('/projects') ? <Projects />
        : route === '/reports' ? <Reports />
        : route === '/documents' ? <Documents />
        : route.startsWith('/diary') ? <Diary key={book?.id} />
        : route === '/items' ? <ItemTracker />
        : route === '/settings' ? <Settings book={book} role={role} />
        : route === '/admin' ? (account?.isSuperAdmin ? <AdminScreen /> : <Dashboard />)
        : <Dashboard />}
      {quickAdd && canQuickAdd && <QuickAdd preset={quickAdd.preset} onClose={closeQuickAdd} />}
      {ProfitDialog && profitOpen && canQuickAdd && <ProfitDialog onClose={closeProfit} />}
    </>
  );
}

const isLoansRoute = route => route === '/loans' || route.startsWith('/loans/');

// Loan registers do not depend on the selected ledger, so they render outside LedgerProvider.
function LoansOrNothing({ route }) {
  const { account } = useAuth();
  useEffect(() => {
    if (!hasResource(account, 'loans')) window.location.replace('#/');
  }, [account]);
  return hasResource(account, 'loans') ? <Loans key={route.startsWith('/loans/') ? 'one' : 'list'} /> : null;
}

function App() {
  const route = useHashRoute();
  const { account } = useAuth();
  const [books, setBooks] = useState(null);
  const [bookId, setBookId] = useState(readStoredBook);
  const [error, setError] = useState('');

  // Loads the books; selectId (optional) switches to that book afterwards.
  const reloadBooks = useCallback(async selectId => {
    try {
      const list = await dataAPI.getBooks();
      setBooks(list);
      setError('');
      setBookId(current => {
        const want = selectId || current;
        return list.some(b => b.id === want) ? want : (list.find(b => b.active !== false) || list[0])?.id ?? null;
      });
    } catch {
      setError('Could not load your books.');
    }
  }, []);

  useEffect(() => { reloadBooks(); }, [reloadBooks]);

  useEffect(() => { if (bookId) writeLocal(BOOK_KEY, bookId); }, [bookId]);

  // Switching books starts the ledger with fresh filters.
  const selectBook = useCallback(id => {
    setBookId(id);
    // Ids belong to one book: from #/projects/<id> go to the list (#/projects); drop any filters.
    const path = window.location.hash.split('?')[0];
    const seg = path.replace(/^#/, '').split('/').filter(Boolean);
    if (seg.length > 1) window.location.hash = `#/${seg[0]}`;
    else if (window.location.hash.includes('?')) window.history.replaceState(null, '', path);
  }, []);
  const book = books?.find(b => b.id === bookId) || null;
  const ctx = useMemo(() => ({ books: books || [], book, reloadBooks, selectBook }), [books, book, reloadBooks, selectBook]);

  // Any route the account may not open (any page, with or without a ledger) goes to its first allowed page, normally home.
  const guard = decideRoute(route, account);
  useEffect(() => {
    if (account && !guard.allowed && guard.redirect) window.location.replace(`#${guard.redirect}`);
  }, [account, guard.allowed, guard.redirect]);

  // An account with loan registers but no ledger lands on the loan registers instead of an empty page.
  useEffect(() => {
    // Not for a super administrator: with no ledger yet they need the other pages (Admin, New ledger).
    if (books && !book && !error && !isLoansRoute(route) && !account?.isSuperAdmin && hasResource(account, 'loans')) window.location.replace('#/loans');
  }, [books, book, error, route, account]);

  return (
    <BooksContext.Provider value={ctx}>
    <AppShell books={books || []} book={book} onSelectBook={selectBook}>
      {error && <div className="alert alert-error" role="alert">{error}</div>}
      {isLoansRoute(route) && guard.allowed && <LoansOrNothing route={route} />}
      {route === '/admin' && guard.allowed && !book && <AdminScreen />}
      {!isLoansRoute(route) && route !== '/admin' && books && !book && !error && <p className="muted">{account?.isSuperAdmin ? 'No ledger exists yet. Use "New ledger" in the sidebar to create your first one.' : 'No books are available for this account yet.'}</p>}
      {book && !isLoansRoute(route) && (
        <>
          <AppearanceSync bookId={book.id} />
          <LedgerProvider key={book.id} book={book}>
            <Screens />
          </LedgerProvider>
        </>
      )}
    </AppShell>
    </BooksContext.Provider>
  );
}

export default App;
