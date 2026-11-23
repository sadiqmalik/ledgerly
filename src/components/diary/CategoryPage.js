import { StampFooter } from '../common/Stamp';
import React, { useEffect, useState } from 'react';
import { api } from '../../services/dataAPI';
import ConfirmDialog from '../common/ConfirmDialog';
import { errorMessage } from '../common/format';
import { btnSm, btnSmPrimary, btnSmDanger, Toggle } from '../settings/ui';
import CategoryForm from './CategoryForm';
import { EntryGrid } from './DateTile';
import { whenText, stampText, HeaderLock, LockedChip, useNewestFirst } from './shared';

// One category (a person or a topic such as "Car"): its main note and all its dates and notes as a timeline.
export default function CategoryPage({ base, nbId, category, canEdit, notebookLocked = false, notebookZone = null, onToggleLock, n, reload, onAdd, onEdit, onDuplicate, onToggleActive, onDeleteNote, onLock, upcoming }) {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('active');
  const [editing, setEditing] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [newestFirst, setNewestFirst] = useNewestFirst();

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

  const sorted = rows; // the server already lists newest first (date, then time, no time last); do not re-sort here
  const open = canEdit && !notebookLocked && !category.locked; // content of a locked notebook or category is read only
  const countdown = id => upcoming.find(u => u.id === id);

  return (
    <section className="min-w-0 space-y-4">
      <a href={`#/diary/${nbId}`} className="text-sm text-muted-foreground underline">&larr; Back to the notebook</a>
      <header className="rounded-xl border border-border bg-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 className="flex flex-wrap items-center gap-2 break-words text-xl font-semibold text-foreground">{category.name}{(category.locked || notebookLocked) && (!canEdit || notebookLocked) && <LockedChip />}</h2>
            {category.description && <p className="mt-2 max-w-prose whitespace-pre-wrap break-words text-sm">{category.description}</p>}
          </div>
          {canEdit && (
            <div className="flex flex-wrap items-center gap-1.5">
              {open && <button type="button" className={btnSmPrimary} onClick={() => onAdd({ kind: 'date', categoryName: category.name })}>Add date</button>}
              {open && <button type="button" className={btnSm} onClick={() => onAdd({ kind: 'note', categoryName: category.name })}>Add note</button>}
              {open && <button type="button" className={btnSm} onClick={() => setEditing(true)}>Edit category</button>}
              {!notebookLocked && <HeaderLock locked={!!category.locked} onToggle={() => onToggleLock(category)} />}
              {open && <button type="button" className={btnSmDanger} onClick={() => setConfirm(true)}>Delete category</button>}
            </div>
          )}
        </div>
        <StampFooter createdAt={category.createdAt} updatedAt={category.updatedAt} />
      </header>

      <div className="flex flex-wrap items-center gap-3">
        <Toggle compact label="Show disabled" checked={status === 'all'} onChange={on => setStatus(on ? 'all' : 'active')} />
        <Toggle compact label="Newest first" checked={newestFirst} onChange={setNewestFirst} />
      </div>
      {error && <p role="alert" className="text-sm text-negative">{error}</p>}
      {sorted && !sorted.length && <p className="text-sm text-muted-foreground">Nothing here yet.{open && ' Use Add date or Add note.'}</p>}

      {!!sorted?.length && (
        <EntryGrid rows={sorted} newestFirst={newestFirst} canEdit={open} hideCategory noteCols="19rem" onEdit={onEdit} onDuplicate={onDuplicate} onToggleActive={onToggleActive} onDelete={onDeleteNote} onLock={onLock}
          countdownFor={r => { const cd = countdown(r.id); return cd && cd.daysAway >= 0 ? { text: whenText(cd.daysAway), soon: cd.daysAway === 0 } : null; }} />
      )}

      {editing && <CategoryForm base={base} notebookZone={notebookZone} category={category} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); reload(); }} />}
      {confirm && (
        <ConfirmDialog title="Delete category?"
          message={`Delete the category "${category.name}"? Its dates and notes are kept, but no longer belong to a category.`}
          confirmLabel="Delete" tone="danger" busy={busy} onConfirm={remove} onCancel={() => setConfirm(false)} />
      )}
    </section>
  );
}
