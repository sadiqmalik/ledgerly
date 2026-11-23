import React, { useCallback, useEffect, useState } from 'react';
import { api } from '../../services/dataAPI';
import useHashRoute from '../../hooks/useHashRoute';
import usePageName from '../../utils/pageNames';
import { StampFooter } from '../common/Stamp';
import SharedBadge, { PrivateBadge } from '../common/SharedBadge';
import { errorMessage } from '../common/format';
import { btnPrimary } from '../settings/ui';
import { useBooks } from '../../hooks/BooksContext';
import { useAuth } from '../../auth/AuthContext';
import NotebookForm from './NotebookForm';
import NotebookPage from './NotebookPage';
import { pill } from './shared';

const safeDecode = s => { try { return decodeURIComponent(s); } catch { return s; } };

// /diary lists the notebooks you can use; /diary/<notebook> opens one (its categories and entries); /diary/<notebook>/<category>
// opens a category. A notebook is linked to a ledger (that ledger's access decides who can use it) or to none (only you).
export default function Notebooks() {
  const route = useHashRoute();
  const { account } = useAuth();
  const readOnly = !!account?.accessCode; // access codes only read the notebooks of their ledgers
  const pageName = usePageName();
  const [, nbId, catId] = route.split('/').filter(Boolean).map(safeDecode);
  const [list, setList] = useState(null);
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);
  const [n, setN] = useState(0);
  const reload = useCallback(() => setN(x => x + 1), []);
  const { book } = useBooks();
  // The open ledger's notebooks plus private ones (linked to no ledger); a notebook not shared with this ledger is not listed here.
  const mine = (list || []).filter(nb => !nb.bookId || nb.bookId === book?.id || (nb.ledgerIds || []).includes(book?.id));

  useEffect(() => {
    let off = false;
    api.get('/diary/notebooks').then(r => { if (!off) { setList(r.data); setError(''); } }).catch(e => { if (!off) { setList([]); setError(errorMessage(e)); } });
    return () => { off = true; };
  }, [n]);

  if (nbId) {
    if (!list) return <p className="p-4 text-sm text-muted-foreground" role="status">Loading...</p>;
    const notebook = list.find(x => x.id === nbId);
    if (!notebook) {
      return (
        <section className="space-y-3">
          <p role="alert" className="text-sm text-negative">{error || 'That notebook does not exist or you cannot open it.'}</p>
          <a href="#/diary" className="text-sm underline">Back to all {pageName('diary').toLowerCase()}s</a>
        </section>
      );
    }
    return <NotebookPage key={notebook.id} nbId={notebook.id} catId={catId || ''} notebook={notebook} reloadNotebooks={reload} />;
  }

  return (
    <section className="min-w-0 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-xs text-muted-foreground">Each notebook has its own categories and entries. Link one to a ledger to share it by ledger access, or keep it private.</p>
        </div>
        {!readOnly && <button type="button" className={btnPrimary} onClick={() => setCreating(true)}>New notebook</button>}
      </div>
      {error && <p role="alert" className="text-sm text-negative">{error}</p>}
      {list && !mine.length && !error && <p className="text-sm text-muted-foreground">No notebooks yet. Use New notebook to create one.</p>}
      {!!mine.length && (
        <div className="grid items-stretch gap-3 grid-cols-[repeat(auto-fill,minmax(min(100%,18rem),1fr))]">
          {mine.map(nb => (
            <a key={nb.id} href={`#/diary/${nb.id}`} className="flex h-full flex-col rounded-xl border border-border bg-card p-4 no-underline text-foreground hover:bg-muted/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
              <div className="flex items-start justify-between gap-2">
                <h2 className="flex min-w-0 items-center gap-1.5 text-lg font-semibold"><span className="min-w-0 truncate">{nb.name}</span>{nb.bookName ? <SharedBadge kind="notebook" ledgerNames={nb.ledgerNames} /> : <PrivateBadge />}</h2>
                {!nb.canEdit && <span className={`${pill} shrink-0`}>view only</span>}
              </div>
              {nb.description && <p className="mt-1 line-clamp-3 whitespace-pre-wrap break-words text-sm text-muted-foreground">{nb.description}</p>}
              <p className="text-xs text-muted-foreground">{nb.categoryCount} {nb.categoryCount === 1 ? 'category' : 'categories'} · {nb.dateCount} {nb.dateCount === 1 ? 'date' : 'dates'} · {nb.noteCount} {nb.noteCount === 1 ? 'note' : 'notes'}</p>
              <StampFooter createdAt={nb.createdAt} updatedAt={nb.updatedAt} />
            </a>
          ))}
        </div>
      )}
      {creating && <NotebookForm onClose={() => setCreating(false)} onSaved={nb => { setCreating(false); setList(null); reload(); if (nb?.id) window.location.hash = `#/diary/${nb.id}`; }} />}
    </section>
  );
}
