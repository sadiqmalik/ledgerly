import React, { useEffect, useState } from 'react';
import { api } from '../../services/dataAPI';
import ConfirmDialog from '../common/ConfirmDialog';
import { errorMessage } from '../common/format';
import { btnPrimary, btnSecondary, btnDanger, Toggle } from '../settings/ui';
import CategoryForm from './CategoryForm';
import NoteCard from './NoteCard';
import { whenText, stampText } from './shared';

// One category (a person or a topic such as "Car"): its main note and all its dates and notes as a timeline.
export default function CategoryPage({ base, nbId, category, canEdit, n, reload, onAdd, onEdit, onDuplicate, onToggleActive, onDeleteNote, upcoming }) {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('active');
  const [newestFirst, setNewestFirst] = useState(false);
  const [editing, setEditing] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let off = false;
    api.get(`${base}/entries`, { params: { category: category.id, status } })
      .then(r => { if (!off) { setRows(r.data); setError(''); } })
      .catch(e => { if (!off) setError(errorMessage(e)); });
    return () => { off = true; };
  }, [base, category.id, status, n]);

  const remove = async () => {
    setBusy(true);
    try {
      await api.delete(`${base}/categories/${category.id}`);
      reload();
      window.location.hash = `#/diary/${nbId}`;
    } catch (e) { setError(errorMessage(e)); setConfirm(false); setBusy(false); }
  };

  const sorted = rows ? [...rows].sort((a, b) => (newestFirst ? b.date.localeCompare(a.date) : a.date.localeCompare(b.date)) || a.title.localeCompare(b.title)) : null;
  const countdown = id => upcoming.find(u => u.id === id);

  return (
    <section className="min-w-0 space-y-4 p-4 sm:p-6">
      <a href={`#/diary/${nbId}`} className="text-sm text-muted-foreground underline">&larr; Back to the notebook</a>
      <header className="rounded-xl border border-border bg-card p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="break-words text-xl font-semibold text-foreground">{category.name}</h2>
            {category.description && <p className="mt-2 max-w-prose whitespace-pre-wrap break-words text-sm">{category.description}</p>}
            <p className="mt-1 text-xs text-muted-foreground">{stampText(category.createdAt, category.updatedAt)}</p>
          </div>
          {canEdit && (
            <div className="flex flex-wrap gap-2">
              <button type="button" className={btnPrimary} onClick={() => onAdd({ kind: 'date', categoryName: category.name })}>Add date</button>
              <button type="button" className={btnSecondary} onClick={() => onAdd({ kind: 'note', categoryName: category.name })}>Add note</button>
              <button type="button" className={btnSecondary} onClick={() => setEditing(true)}>Edit category</button>
              <button type="button" className={btnDanger} onClick={() => setConfirm(true)}>Delete category</button>
            </div>
          )}
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-3">
        <Toggle compact label="Show disabled" checked={status === 'all'} onChange={on => setStatus(on ? 'all' : 'active')} />
        <Toggle compact label="Newest first" checked={newestFirst} onChange={setNewestFirst} />
      </div>
      {error && <p role="alert" className="text-sm text-negative">{error}</p>}
      {sorted && !sorted.length && <p className="text-sm text-muted-foreground">Nothing here yet.{canEdit && ' Use Add date or Add note.'}</p>}

      {!!sorted?.length && (
        <div className="grid items-stretch gap-3 grid-cols-[repeat(auto-fill,minmax(min(100%,19rem),1fr))]">
          {sorted.map(r => {
            const cd = countdown(r.id);
            return (
              <NoteCard key={r.id} note={r} canEdit={canEdit} hideCategory countdown={cd ? whenText(cd.daysAway) : null} soon={cd?.daysAway === 0}
                onEdit={onEdit} onDuplicate={onDuplicate} onToggleActive={onToggleActive} onDelete={onDeleteNote} />
            );
          })}
        </div>
      )}

      {editing && <CategoryForm base={base} category={category} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); reload(); }} />}
      {confirm && (
        <ConfirmDialog title="Delete category?"
          message={`Delete the category "${category.name}"? Its dates and notes are kept, but no longer belong to a category.`}
          confirmLabel="Delete" tone="danger" busy={busy} onConfirm={remove} onCancel={() => setConfirm(false)} />
      )}
    </section>
  );
}
