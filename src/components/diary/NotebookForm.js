import React, { useState } from 'react';
import { api } from '../../services/dataAPI';
import { useAuth } from '../../auth/AuthContext';
import { useBooks } from '../../hooks/BooksContext';
import Modal from '../common/Modal';
import Select from '../common/Select';
import ConfirmDialog from '../common/ConfirmDialog';
import { errorMessage } from '../common/format';
import { inputCls, btnPrimary, btnSecondary, btnDanger, Field } from '../settings/ui';

// Create (notebook null) or edit a notebook. It can be linked to one ledger, which then decides who can use it (the
// ledger's members with the Notebook page; Viewer reads, Editor and Admin change), or to none, which keeps it private to
// you (super administrators only).
export default function NotebookForm({ notebook, onClose, onSaved, onDeleted }) {
  const { account } = useAuth();
  const { books } = useBooks();
  const isSuper = Boolean(account?.isSuperAdmin);
  const choices = books.filter(b => b.active !== false && (isSuper || ['editor', 'admin'].includes(b.role)));
  const [f, setF] = useState({ name: notebook?.name || '', description: notebook?.description || '', bookId: notebook ? (notebook.bookId || '') : (isSuper ? '' : (choices[0]?.id || '')) });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [confirm, setConfirm] = useState(false);
  const canLink = !notebook || notebook.canRelink;

  const submit = async e => {
    e.preventDefault();
    if (!f.name.trim()) { setError('Enter a name.'); return; }
    if (!f.bookId && !isSuper) { setError('Choose a ledger.'); return; }
    setBusy(true);
    try {
      const body = { name: f.name.trim(), description: f.description.trim() || null, ...(canLink ? { bookId: f.bookId || null } : {}) };
      const r = notebook ? await api.put(`/diary/notebooks/${notebook.id}`, body) : await api.post('/diary/notebooks', body);
      onSaved(r.data);
    } catch (err) { setError(errorMessage(err)); setBusy(false); }
  };
  const remove = async () => {
    setBusy(true);
    try { await api.delete(`/diary/notebooks/${notebook.id}`); onDeleted(); } catch (err) { setError(errorMessage(err)); setConfirm(false); setBusy(false); }
  };

  return (
    <Modal title={notebook ? 'Edit notebook' : 'New notebook'} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        {error && <p role="alert" className="text-sm text-negative">{error}</p>}
        <Field label="Name"><input className={inputCls} value={f.name} onChange={e => setF(s => ({ ...s, name: e.target.value }))} required maxLength={80} autoFocus placeholder="For example Family or Car" /></Field>
        <Field label="Description (optional)"><textarea rows={3} className={inputCls} value={f.description} onChange={e => setF(s => ({ ...s, description: e.target.value }))} maxLength={2000} /></Field>
        <Field label="Linked ledger">
          <Select className={inputCls} value={f.bookId} onChange={e => setF(s => ({ ...s, bookId: e.target.value }))} disabled={!canLink || busy} aria-label="Linked ledger">
            {isSuper && <option value="">No ledger (only I can see it)</option>}
            {choices.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </Select>
        </Field>
        <p className="text-xs text-muted-foreground">
          {f.bookId
            ? 'Everyone who has this ledger and the Notebook page can open it: a Viewer reads, an Editor or Admin changes it. Several notebooks can share one ledger.'
            : 'Not linked: no other admin can see it, not even another super administrator.'}
          {!canLink && ' Only the super administrator who owns this notebook can change its ledger.'}
        </p>
        <div className="flex flex-wrap gap-2">
          <button type="submit" className={btnPrimary} disabled={busy}>{busy ? 'Saving...' : 'Save'}</button>
          <button type="button" className={btnSecondary} onClick={onClose} disabled={busy}>Cancel</button>
          {notebook?.canDelete && <button type="button" className={`${btnDanger} sm:ml-auto`} onClick={() => setConfirm(true)} disabled={busy}>Delete notebook</button>}
        </div>
      </form>
      {confirm && (
        <ConfirmDialog title="Delete notebook?" message={`Delete "${notebook.name}" with all its categories and entries? This cannot be undone.`}
          confirmLabel="Delete" tone="danger" busy={busy} onConfirm={remove} onCancel={() => setConfirm(false)} />
      )}
    </Modal>
  );
}
