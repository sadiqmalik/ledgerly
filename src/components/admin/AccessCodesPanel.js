import React, { useEffect, useState } from 'react';
import dataAPI from '../../services/dataAPI';
import { useBooks } from '../../hooks/BooksContext';
import ResourcePicker, { pagesText } from './ResourcePicker';
import { DEFAULT_CODE_RESOURCES } from '../../auth/resources.mjs';
import { errorText, inputCls, btnPrimary, btnSecondary, btnDanger, Badge } from '../settings/ui';
import ConfirmDialog from '../common/ConfirmDialog';
import PromptDialog from '../common/PromptDialog';

const when = iso => (iso ? new Date(iso).toLocaleString() : '—');

// An access code lets someone view the chosen ledgers. It never allows changes. The code is shown once, on creation.
export default function AccessCodesPanel() {
  const { books } = useBooks();
  const [codes, setCodes] = useState([]);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [selected, setSelected] = useState([]);
  const [pages, setPages] = useState([...DEFAULT_CODE_RESOURCES]);
  const [editing, setEditing] = useState(null); // { id, pages }
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

  const toggle = id => setSelected(sel => (sel.includes(id) ? sel.filter(x => x !== id) : [...sel, id]));
  const bookName = id => books.find(b => b.id === id)?.name || id;

  const create = async e => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      setCreated(await dataAPI.createAccessCode(name, selected, code, pages));
      setName('');
      setCode('');
      setSelected([]);
      setPages([...DEFAULT_CODE_RESOURCES]);
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
    try {
      await dataAPI.setAccessCodeResources(editing.id, editing.pages);
      setEditing(null);
      load();
    } catch (err) {
      setError(errorText(err));
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
      <p className="text-sm text-muted-foreground">An access code lets someone view the selected ledgers. It never allows changes.</p>
      {error && <div className="alert alert-error" role="alert">{error}</div>}
      {created && (
        <div className="alert alert-success" role="status">
          Access code for "{created.name}": <strong style={{ fontFamily: 'monospace', userSelect: 'all' }}>{created.code}</strong>
          <div>Copy it now. It cannot be shown again.</div>
        </div>
      )}

      <form onSubmit={create} className="space-y-3 rounded-xl border border-border bg-card p-4">
        <label className="block text-sm font-medium text-foreground">
          Name
          <input className={inputCls} value={name} onChange={e => setName(e.target.value)} maxLength={80} required />
        </label>
        <label className="block text-sm font-medium text-foreground">
          Access code (optional)
          <input className={inputCls} value={code} onChange={e => setCode(e.target.value)} maxLength={64} autoComplete="off" spellCheck={false} placeholder="Leave blank to generate a strong code" />
          <span className="block text-xs font-normal text-muted-foreground">8-64 characters, case-sensitive, e.g. family-view-2026. Shown once.</span>
        </label>
        <fieldset className="space-y-1">
          <legend className="text-sm font-medium text-foreground">Ledgers (viewer access)</legend>
          {books.map(b => (
            <label key={b.id} className="flex items-center gap-2 text-sm text-foreground">
              <input type="checkbox" checked={selected.includes(b.id)} onChange={() => toggle(b.id)} />
              {b.name}
            </label>
          ))}
        </fieldset>
        <ResourcePicker value={pages} onChange={setPages} disabled={busy} />
        <button type="submit" className={btnPrimary} disabled={busy || !name.trim() || selected.length === 0}>Create access code</button>
      </form>

      <ul className="space-y-2" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        {codes.map(c => (
          <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-card p-3">
            <div className="min-w-0">
              <p className="truncate font-semibold text-foreground">
                {c.name} {c.revokedAt ? <Badge>revoked</Badge> : <Badge>active</Badge>}
              </p>
              <p className="text-xs text-muted-foreground">
                {c.bookIds.map(bookName).join(', ')} · pages: {pagesText(c.resources || [])} · created {when(c.createdAt)} by {c.createdBy} · last used {when(c.lastUsedAt)}
              </p>
            </div>
            {!c.revokedAt && <button type="button" className={btnSecondary} onClick={() => setEditing({ id: c.id, pages: c.resources || [] })}>Edit pages</button>}
            {editing?.id === c.id && (
              <div className="w-full space-y-2 rounded-lg bg-muted p-3">
                <ResourcePicker value={editing.pages} onChange={next => setEditing({ id: c.id, pages: next })} />
                <div className="flex gap-2">
                  <button type="button" className={btnPrimary} onClick={savePages}>Save pages</button>
                  <button type="button" className={btnSecondary} onClick={() => setEditing(null)}>Cancel</button>
                </div>
              </div>
            )}
            {!c.revokedAt && <button type="button" className={btnSecondary} onClick={() => reset(c)}>Reset code</button>}
            {!c.revokedAt && <button type="button" className={btnDanger} onClick={() => revoke(c)}>Revoke</button>}
            <button type="button" className={btnDanger} disabled={deletingId === c.id} onClick={() => setDialog({ kind: 'delete', code: c })}>
              {deletingId === c.id ? 'Deleting…' : 'Delete'}
            </button>
          </li>
        ))}
        {codes.length === 0 && <li className="text-sm text-muted-foreground">No access codes yet.</li>}
      </ul>
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
