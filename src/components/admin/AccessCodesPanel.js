import React, { useEffect, useState } from 'react';
import dataAPI from '../../services/dataAPI';
import { useBooks } from '../../hooks/BooksContext';
import { LedgerPages, pagesText } from './ResourcePicker';
import { DEFAULT_CODE_RESOURCES } from '../../auth/resources.mjs';
import { errorText, inputCls, btnPrimary, btnSecondary, btnDanger, Badge, ToggleGrid } from '../settings/ui';
import Modal from '../common/Modal';
import ConfirmDialog from '../common/ConfirmDialog';
import PromptDialog from '../common/PromptDialog';

// { bookId: [pages] } for every chosen ledger: the edited list, else the usual pages.
const explicitPages = (map = {}, bookIds = [], seed = []) => Object.fromEntries(bookIds.map(id => [id, Array.isArray(map[id]) ? map[id] : seed]));

const when = iso => (iso ? new Date(iso).toLocaleString() : '—');

// An access code lets someone view the chosen ledgers. It never allows changes. The code is shown once, on creation.
export default function AccessCodesPanel() {
  const { books } = useBooks();
  const [codes, setCodes] = useState([]);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [selected, setSelected] = useState([]);
  const [pages, setPages] = useState([...DEFAULT_CODE_RESOURCES]);
  const [bookPages, setBookPages] = useState({}); // own pages per ledger, for the code being created
  const [editing, setEditing] = useState(null); // { id, name, bookIds, pages }
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  // { kind: 'reset' | 'revoke' | 'delete', code } while a dialog is open, otherwise null.
  const [dialog, setDialog] = useState(null);
  const [resetting, setResetting] = useState(false);
  const closeDialog = () => setDialog(null);

  const load = async () => {
    try {
      setCodes(await dataAPI.listAccessCodes());
    } catch (err) {
      setError(errorText(err));
    }
  };

  useEffect(() => { load(); }, []);

  const bookName = id => books.find(b => b.id === id)?.name || id;

  const create = async e => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      setCreated(await dataAPI.createAccessCode(name, selected, code, pages, explicitPages(bookPages, selected, pages)));
      setName('');
      setCode('');
      setSelected([]);
      setBookPages({});
      setPages([...DEFAULT_CODE_RESOURCES]);
      setCreating(false);
      load();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  const reset = c => setDialog({ kind: 'reset', code: c });

  // Runs the reset; the dialog stays open (busy) until the request finishes, then closes either way.
  const submitReset = async (c, entered) => {
    setError('');
    setResetting(true);
    try {
      setCreated(await dataAPI.resetAccessCode(c.id, entered));
      load();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setResetting(false);
      closeDialog();
    }
  };

  const savePages = async () => {
    setError('');
    setBusy(true);
    try {
      await dataAPI.setAccessCodeResources(editing.id, editing.pages, explicitPages(editing.bookPages, editing.bookIds, editing.pages), editing.bookIds);
      setEditing(null);
      load();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  const revoke = async c => {
    try {
      await dataAPI.revokeAccessCode(c.id);
      if (created && created.id === c.id) setCreated(null);
      load();
    } catch (err) {
      setError(errorText(err));
    }
  };

  const restore = async c => {
    setError('');
    try {
      await dataAPI.restoreAccessCode(c.id);
      load();
    } catch (err) {
      setError(errorText(err));
    }
  };

  const remove = async c => {
    setError('');
    setDeletingId(c.id);
    try {
      await dataAPI.deleteAccessCode(c.id);
      if (created && created.id === c.id) setCreated(null);
      if (editing?.id === c.id) setEditing(null);
      await load();
    } catch (err) {
      setError(errorText(err));
      await load();
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">An access code is view only: it lets someone read the selected ledgers and pages, and never change anything.</p>
        <button type="button" className={btnPrimary} onClick={() => { setError(''); setCreating(true); }}>New access code</button>
      </div>
      {error && !creating && !editing && <div className="alert alert-error" role="alert">{error}</div>}
      {created && (
        <div className="alert alert-success" role="status">
          Access code for "{created.name}": <strong style={{ fontFamily: 'monospace', userSelect: 'all' }}>{created.code}</strong>
          <div>Copy it now. It cannot be shown again.</div>
        </div>
      )}

      <ul className="grid items-start gap-3 grid-cols-[repeat(auto-fill,minmax(min(100%,22rem),1fr))]" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        {codes.map(c => (
          <li key={c.id} className="flex h-full flex-col rounded-xl border border-border bg-card p-4">
            <p className="flex min-w-0 items-center gap-2 text-lg font-semibold text-foreground">
              <span className="min-w-0 truncate">{c.name}</span> {c.revokedAt ? <Badge>revoked</Badge> : <Badge>active</Badge>}
            </p>
            <dl className="mt-2 space-y-1 text-sm">
              <div className="flex gap-2"><dt className="w-20 shrink-0 text-muted-foreground">Ledgers</dt><dd className="min-w-0">{c.bookIds.map(bookName).join(', ') || 'None'}</dd></div>
              {!Object.keys(c.bookResources || {}).length && <div className="flex gap-2"><dt className="w-20 shrink-0 text-muted-foreground">Pages</dt><dd className="min-w-0">{pagesText(c.resources || [])}</dd></div>}
              {Object.entries(c.bookResources || {}).map(([id, list]) => (
                <div key={id} className="flex gap-2"><dt className="w-20 shrink-0 truncate text-muted-foreground" title={bookName(id)}>{bookName(id)}</dt><dd className="min-w-0">{pagesText(list)}</dd></div>
              ))}
              <div className="flex gap-2"><dt className="w-20 shrink-0 text-muted-foreground">Created</dt><dd className="min-w-0">{when(c.createdAt)} by {c.createdBy}</dd></div>
              <div className="flex gap-2"><dt className="w-20 shrink-0 text-muted-foreground">Last used</dt><dd className="min-w-0">{when(c.lastUsedAt)}</dd></div>
            </dl>
            <div className="mt-auto flex flex-wrap gap-2 pt-3">
              {!c.revokedAt && <button type="button" className={btnSecondary} onClick={() => { setError(''); setEditing({ id: c.id, name: c.name, bookIds: c.bookIds, pages: c.resources || [], bookPages: c.bookResources || {} }); }}>Edit</button>}
              {!c.revokedAt && <button type="button" className={btnSecondary} onClick={() => reset(c)}>Reset code</button>}
              {!c.revokedAt && <button type="button" className={btnDanger} onClick={() => revoke(c)}>Revoke</button>}
              {c.revokedAt && <button type="button" className={btnPrimary} onClick={() => restore(c)}>Restore</button>}
              <button type="button" className={btnDanger} disabled={deletingId === c.id} onClick={() => setDialog({ kind: 'delete', code: c })}>
                {deletingId === c.id ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </li>
        ))}
        {codes.length === 0 && <li className="text-sm text-muted-foreground">No access codes yet.</li>}
      </ul>
      {creating && (
        <Modal title="New access code" onClose={() => setCreating(false)} wide>
          <form onSubmit={create} className="space-y-4">
            {error && <p role="alert" className="text-sm text-negative">{error}</p>}
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-sm font-medium text-foreground">
                Name
                <input className={inputCls} value={name} onChange={e => setName(e.target.value)} maxLength={80} required autoFocus />
              </label>
              <label className="block text-sm font-medium text-foreground">
                Access code (optional)
                <input className={inputCls} value={code} onChange={e => setCode(e.target.value)} maxLength={64} autoComplete="off" spellCheck={false} placeholder="Leave blank to generate one" />
              </label>
            </div>
            <p className="-mt-2 text-xs text-muted-foreground">8-64 characters, case-sensitive, for example family-view-2026. It is shown once, after you create it.</p>
            <p className="text-sm font-medium text-foreground">Ledgers and pages (view only)</p>
            <LedgerPages forCode books={books} selected={selected} onSelect={setSelected} disabled={busy}
              pagesOf={id => bookPages[id] ?? pages} onPages={(id, v) => setBookPages(p => ({ ...p, [id]: v }))} />
            <div className="flex flex-wrap gap-2">
              <button type="submit" className={btnPrimary} disabled={busy || !name.trim() || selected.length === 0}>{busy ? 'Creating...' : 'Create access code'}</button>
              <button type="button" className={btnSecondary} onClick={() => setCreating(false)} disabled={busy}>Cancel</button>
            </div>
          </form>
        </Modal>
      )}
      {editing && (
        <Modal title="Edit access code" onClose={() => setEditing(null)} wide bare>
          <div className="space-y-4">
            {error && <p role="alert" className="text-sm text-negative">{error}</p>}
            <div className="flex items-start justify-between gap-3 rounded-xl border border-border bg-muted/30 px-4 py-3">
              <div className="min-w-0">
                <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Edit access code</div>
                <h3 className="mt-0.5 break-words text-xl font-semibold text-foreground" style={{ margin: 0 }}>{editing.name}</h3>
              </div>
              <button type="button" aria-label="Close" onClick={() => setEditing(null)} className="btn shrink-0 px-2 py-1">&times;</button>
            </div>
            <p className="text-sm font-medium text-foreground">Ledgers and pages (view only)</p>
            <LedgerPages forCode books={books} selected={editing.bookIds} disabled={busy}
              onSelect={next => setEditing(e => ({ ...e, bookIds: next }))}
              pagesOf={id => editing.bookPages[id] ?? editing.pages}
              onPages={(id, v) => setEditing(e => ({ ...e, bookPages: { ...e.bookPages, [id]: v } }))} />
            <div className="flex flex-wrap gap-2">
              <button type="button" className={btnPrimary} disabled={busy || editing.bookIds.length === 0} onClick={savePages}>{busy ? 'Saving...' : 'Save'}</button>
              <button type="button" className={btnSecondary} disabled={busy} onClick={() => setEditing(null)}>Cancel</button>
            </div>
          </div>
        </Modal>
      )}
      {dialog?.kind === 'reset' && (
        <PromptDialog
          title="Reset access code"
          message={`New access code for "${dialog.code.name}" (8-64 characters). Leave blank to generate a strong one. The old code stops working and anyone signed in with it is signed out immediately.`}
          label="New access code"
          placeholder="Leave blank to generate a strong code"
          confirmLabel="Reset code"
          busy={resetting}
          validate={v => (v === '' || (v.length >= 8 && v.length <= 64) ? '' : 'Access code must be 8-64 characters.')}
          onSubmit={v => submitReset(dialog.code, v)}
          onCancel={closeDialog}
        />
      )}
      {dialog?.kind === 'revoke' && (
        <ConfirmDialog
          title="Revoke access code?"
          message={`Revoke the access code "${dialog.code.name}"? Anyone signed in with it is signed out immediately.`}
          confirmLabel="Revoke"
          tone="danger"
          onConfirm={() => { const c = dialog.code; closeDialog(); revoke(c); }}
          onCancel={closeDialog}
        />
      )}
      {dialog?.kind === 'delete' && (
        <ConfirmDialog
          title="Delete access code?"
          message={`Permanently delete the access code "${dialog.code.name}"? This cannot be undone. Anyone signed in with it is signed out immediately.`}
          confirmLabel="Delete"
          tone="danger"
          onConfirm={() => { const c = dialog.code; closeDialog(); remove(c); }}
          onCancel={closeDialog}
        />
      )}
    </div>
  );
}
