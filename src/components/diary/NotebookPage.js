import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../services/dataAPI';
import ConfirmDialog from '../common/ConfirmDialog';
import MultiSelect from '../common/MultiSelect';
import { errorMessage, todayISO } from '../common/format';
import { btnDanger, btnPrimary, btnSecondary, Field, Toggle } from '../settings/ui';
import NoteForm from './NoteForm';
import NoteCard from './NoteCard';
import CategoryForm from './CategoryForm';
import CategoryPage from './CategoryPage';
import Upcoming from './Upcoming';
import NotebookForm from './NotebookForm';
import { StampFooter } from '../common/Stamp';
import SharedBadge from '../common/SharedBadge';
import { whenText, CalendarIcon, stampText } from './shared';
import usePageName from '../../utils/pageNames';

// The Notebook (internally called diary) is private: only a super administrator opens it and each sees only their own notes (the server enforces
// this; the page is hidden from everyone else). Two views: Categories (a person or topic with its dates and notes) and
// All entries (a filterable list). /diary/<id> opens one category.
// A malformed %-escape in a typed URL must not crash the page; it is then just an unknown category.
const safeDecode = s => { try { return decodeURIComponent(s); } catch { return s; } };

export default function NotebookPage({ nbId, catId, notebook, reloadNotebooks }) {
  const pageName = usePageName();
  const base = `/diary/notebooks/${nbId}`;
  const canEdit = notebook.canEdit;
  const [n, setN] = useState(0);
  const reload = useCallback(() => setN(x => x + 1), []);
  const [error, setError] = useState('');
  const [projects, setProjects] = useState([]);
  const [names, setNames] = useState([]);
  const [categories, setCategories] = useState(null);
  const [upcoming, setUpcoming] = useState([]);
  const [view, setView] = useState(null); // 'all' (the plain list) by default; the Group by category switch turns on the category cards
  const [rows, setRows] = useState(null);
  const [filt, setFilt] = useState({ category: [], project: [], q: '', from: '', to: '', status: 'active', important: false, kind: 'all' });
  const [form, setForm] = useState(null); // null | { note?, copyOf?, preset? }
  const [creatingCategory, setCreatingCategory] = useState(false);
  const [editingNotebook, setEditingNotebook] = useState(false);
  const [deletingNotebook, setDeletingNotebook] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [pendingDelete, setPendingDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => { if (notebook.bookId) api.get(`/books/${notebook.bookId}/project-names`).then(r => setProjects(r.data)).catch(() => {}); }, [notebook.bookId]);
  useEffect(() => { api.get(`${base}/names`).then(r => setNames(r.data)).catch(() => {}); }, [base, n]);
  useEffect(() => {
    let off = false;
    // The countdowns use the browser's date, not the server's (UTC) date.
    const today = todayISO();
    api.get(`${base}/categories`, { params: { today } }).then(r => { if (!off) setCategories(r.data); }).catch(e => { if (!off) { setCategories([]); setError(errorMessage(e)); } });
    api.get(`${base}/upcoming`, { params: { days: 30, today } }).then(r => { if (!off) setUpcoming(r.data); }).catch(() => {});
    return () => { off = true; };
  }, [base, n]);
  useEffect(() => { if (categories && view === null) setView('all'); }, [categories, view]);

  const listParams = useMemo(() => Object.fromEntries(Object.entries({
    status: filt.status, q: filt.q, from: filt.from, to: filt.to, project: filt.project.join(','), category: filt.category.join(','),
    important: filt.important ? '1' : '', kind: filt.kind === 'all' ? '' : filt.kind
  }).filter(([, v]) => v)), [filt]);
  useEffect(() => {
    if (catId || view !== 'all') return undefined;
    let off = false;
    const t = setTimeout(() => {
      api.get(`${base}/entries`, { params: listParams })
        .then(r => { if (!off) { setRows(r.data); setError(''); } })
        .catch(e => { if (!off) setError(errorMessage(e)); });
    }, filt.q ? 250 : 0);
    return () => { off = true; clearTimeout(t); };
  }, [base, listParams, filt.q, n, view, catId]);

  const projOpts = useMemo(() => projects.map(p => ({ value: p.id, label: p.name })), [projects]);
  const catOpts = useMemo(() => (categories || []).map(c => ({ value: c.id, label: c.name })), [categories]);
  const setF = k => e => setFilt(s => ({ ...s, [k]: e.target.value }));
  const toggleActive = useCallback(async note => {
    try { await api.put(`${base}/entries/${note.id}`, { active: !note.active }); reload(); } catch (e) { setError(errorMessage(e)); }
  }, [base, reload]);
  const remove = async note => {
    setDeleting(true);
    try { await api.delete(`${base}/entries/${note.id}`); reload(); setError(''); } catch (e) { setError(errorMessage(e)); }
    setDeleting(false); setPendingDelete(null);
  };
  const openNote = note => setForm({ note });
  const copyNote = note => setForm({ copyOf: note });
  const addTo = preset => setForm({ preset });
  const catList = categories || [];

  const category = catId ? catList.find(c => c.id === catId) : null;
  const modals = (
    <>
      {form && (
        <NoteForm base={base} note={form.note || null} copyOf={form.copyOf} preset={form.preset} projects={projects} categories={catList} names={names}
          canEdit={canEdit} onClose={() => setForm(null)} onSaved={() => { reload(); setForm(null); }} />
      )}
      {creatingCategory && (
        <CategoryForm base={base} onClose={() => setCreatingCategory(false)}
          onSaved={c => { setCreatingCategory(false); reload(); if (c?.id) window.location.hash = `#/diary/${nbId}/${c.id}`; }} />
      )}
      {deletingNotebook && (
        <ConfirmDialog title="Delete notebook?"
          message={`Delete "${notebook.name}" with all its categories and entries? This cannot be undone.`}
          confirmLabel="Delete" tone="danger" busy={deleteBusy}
          onConfirm={async () => {
            setDeleteBusy(true);
            try { await api.delete(`/diary/notebooks/${notebook.id}`); reloadNotebooks(); window.location.hash = '#/diary'; }
            catch (err) { setError(errorMessage(err)); setDeletingNotebook(false); setDeleteBusy(false); }
          }}
          onCancel={() => setDeletingNotebook(false)} />
      )}
      {pendingDelete && (
        <ConfirmDialog title="Delete entry?"
          message={`Delete "${pendingDelete.title}" for good? To keep it but hide it, use Disable instead.`}
          confirmLabel="Delete" tone="danger" busy={deleting} onConfirm={() => remove(pendingDelete)} onCancel={() => setPendingDelete(null)} />
      )}
    </>
  );

  if (catId) {
    if (!categories) return <p className="p-4 text-sm text-muted-foreground" role="status">Loading...</p>;
    if (!category) {
      return (
        <section className="space-y-3">
          <p role="alert" className="text-sm text-negative">{error || 'That category does not exist.'}</p>
          <a href={`#/diary/${nbId}`} className="text-sm underline">Back to the notebook</a>
        </section>
      );
    }
    return (
      <>
        <CategoryPage key={category.id} base={base} nbId={nbId} category={category} canEdit={canEdit} n={n} reload={reload} upcoming={upcoming}
          onAdd={addTo} onEdit={openNote} onDuplicate={copyNote} onToggleActive={toggleActive} onDeleteNote={setPendingDelete} />
        {modals}
      </>
    );
  }

  return (
    <section className="min-w-0 space-y-4">
      <a href="#/diary" className="text-sm text-muted-foreground underline">&larr; All {pageName('diary').toLowerCase()}s</a>
      <header className="rounded-xl border border-border bg-card p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="flex flex-wrap items-center gap-2 break-words text-xl font-semibold text-foreground">{notebook.name}{notebook.bookName && <SharedBadge kind="notebook" ledgerNames={notebook.ledgerNames} />}</h2>
            {notebook.description && <p className="mt-1 max-w-prose whitespace-pre-wrap break-words text-sm">{notebook.description}</p>}
            <p className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
              {!notebook.bookName && <span className="rounded-full border border-accent/60 bg-accent/10 px-2 py-0.5 font-semibold text-accent" title="Not linked to a ledger: only you can see it">&#128274; Private, not linked to a ledger: only you can see it</span>}
              {!canEdit && <span className="rounded-full bg-muted px-2 py-0.5">View only</span>}
            </p>
          </div>
          {canEdit && (
            <div className="flex flex-wrap gap-2">
              <button type="button" className={btnSecondary} onClick={() => setCreatingCategory(true)}>New category</button>
              <button type="button" className={btnPrimary} onClick={() => addTo({})}>New entry</button>
              <button type="button" className={btnSecondary} onClick={() => setEditingNotebook(true)}>Edit notebook</button>
              {notebook.canDelete && <button type="button" className={btnDanger} onClick={() => setDeletingNotebook(true)}>Delete notebook</button>}
            </div>
          )}
        </div>
        <StampFooter createdAt={notebook.createdAt} updatedAt={notebook.updatedAt} />
      </header>
      {error && <p role="alert" className="text-sm text-negative">{error}</p>}
      <Upcoming items={upcoming} onOpen={openNote} />
      <Toggle compact label="Group by category" checked={(view || 'all') === 'categories'} onChange={on => setView(on ? 'categories' : 'all')} />

      {view === 'categories' && (
        <>
          {categories && !categories.length && <p className="text-sm text-muted-foreground">No categories yet. Use New category, for example a person or Car.</p>}
          {!!categories?.length && (
            <div className="grid items-stretch gap-3 grid-cols-[repeat(auto-fill,minmax(min(100%,17rem),1fr))]">
              {categories.map(c => (
                <a key={c.id} href={`#/diary/${nbId}/${c.id}`} className="flex h-full flex-col rounded-xl border border-border bg-card p-4 no-underline text-foreground hover:bg-muted/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
                  <h2 className="min-w-0 truncate text-lg font-semibold">{c.name}</h2>
                  {c.description && <p className="mt-1 line-clamp-3 whitespace-pre-wrap break-words text-sm text-muted-foreground">{c.description}</p>}
                  <p className="mt-2 text-xs text-muted-foreground">{c.dateCount} {c.dateCount === 1 ? 'date' : 'dates'} · {c.noteCount} {c.noteCount === 1 ? 'note' : 'notes'}</p>
                  {c.nextDate && (
                    <p className="mt-2 flex items-center gap-1 text-xs font-medium text-accent"><CalendarIcon />Next: {c.nextDate} ({whenText(c.nextDaysAway)})</p>
                  )}
                  <StampFooter createdAt={c.createdAt} updatedAt={c.updatedAt} />
                </a>
              ))}
            </div>
          )}
        </>
      )}

      {view === 'all' && (
        <>
          <div className="grid grid-cols-2 items-end gap-2 md:grid-cols-[repeat(5,minmax(0,1fr))]">
            <Field label="Search"><input type="search" className="mt-1 w-full min-w-0" placeholder="Title, message or name" value={filt.q} onChange={setF('q')} /></Field>
            <Field label="Category"><MultiSelect label="Category" allLabel="All categories" noneLabel="(none)" options={catOpts} value={filt.category} onChange={v => setFilt(s => ({ ...s, category: v }))} /></Field>
            <Field label="Project"><MultiSelect label="Project" allLabel="All projects" noneLabel="(none)" options={projOpts} value={filt.project} onChange={v => setFilt(s => ({ ...s, project: v }))} /></Field>
            <Field label="From"><input type="date" min="1900-01-01" max="9999-12-31" className="mt-1 w-full min-w-0" value={filt.from} onChange={setF('from')} /></Field>
            <Field label="To"><input type="date" min="1900-01-01" max="9999-12-31" className="mt-1 w-full min-w-0" value={filt.to} onChange={setF('to')} /></Field>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Toggle compact label="Show disabled" checked={filt.status === 'all'} onChange={on => setFilt(s => ({ ...s, status: on ? 'all' : 'active' }))} />
            <Toggle compact label="Dates only" checked={filt.kind === 'date'} onChange={on => setFilt(s => ({ ...s, kind: on ? 'date' : 'all' }))} />
            <Toggle compact label="Starred only" checked={filt.important} onChange={v => setFilt(s => ({ ...s, important: v }))} />
          </div>
          {rows && !rows.length && <p className="text-sm text-muted-foreground">No entries{filt.status === 'active' ? '' : ' here'}. Use New entry to add one.</p>}
          {!!rows?.length && (
            <div className="grid items-stretch gap-3 grid-cols-[repeat(auto-fill,minmax(min(100%,20rem),1fr))]">
              {rows.map(note => (
                <NoteCard key={note.id} note={note} canEdit={canEdit} onEdit={openNote} onDuplicate={copyNote} onToggleActive={toggleActive} onDelete={setPendingDelete} />
              ))}
            </div>
          )}
        </>
      )}
      {modals}
      {editingNotebook && (
        <NotebookForm notebook={notebook} onClose={() => setEditingNotebook(false)}
          onSaved={() => { setEditingNotebook(false); reloadNotebooks(); }}
          onDeleted={() => { reloadNotebooks(); window.location.hash = '#/diary'; }} />
      )}
    </section>
  );
}
