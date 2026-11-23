import React, { useState } from 'react';
import { api } from '../../services/dataAPI';
import { useAuth } from '../../auth/AuthContext';
import { useBooks } from '../../hooks/BooksContext';
import Modal from '../common/Modal';
import Select from '../common/Select';
import MultiSelect from '../common/MultiSelect';
import ConfirmDialog from '../common/ConfirmDialog';
import { errorMessage } from '../common/format';
import { inputCls, btnPrimary, btnSecondary, btnDanger, Field } from '../settings/ui';

// Create (notebook null) or edit a notebook. It can be linked to one ledger, which then decides who can use it (the
// ledger's members with the Notebook page; Viewer reads, Editor and Admin change), or to none, which keeps it private to
// you (super administrators only).
export default function NotebookForm({ notebook, onClose, onSaved, onDeleted }) {
  const { account } = useAuth();
  const { books, book: openBook } = useBooks();
  const isSuper = Boolean(account?.isSuperAdmin);
  const choices = books.filter(b => b.active !== false && (isSuper || ['editor', 'admin'].includes(b.role)));
  const [f, setF] = useState({ name: notebook?.name || '', description: notebook?.description || '', extra: (notebook?.ledgerIds || []).slice(1), bookId: notebook ? (notebook.bookId || '') : (choices.find(b => b.id === openBook?.id)?.id || (isSuper ? '' : (choices[0]?.id || ''))) });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [confirm, setConfirm] = useState(false);
  const canLink = !notebook || notebook.canRelink;
  // Only the owner or an Admin of the main ledger changes who a notebook is shared with (the server checks too).
  // A ledger the notebook is only shared into is view only: the server sends canEdit/canShare false there.
  const viewOnly = Boolean(notebook) && !notebook.canEdit;
  const canShare = !notebook || (notebook.canShare ?? (notebook.isOwner || isSuper || books.find(b => b.id === notebook.bookId)?.role === 'admin'));
  const extraOptions = choices.filter(b => b.id !== f.bookId).map(b => ({ value: b.id, label: b.name }));
  // Keep ledgers already shared that this person cannot list (they are left alone by the server).
  const extraValue = f.extra.filter(x => x !== f.bookId && extraOptions.some(o => o.value === x));

  const submit = async e => {
    e.preventDefault();
    if (!f.name.trim()) { setError('Enter a name.'); return; }
    if (!f.bookId && !isSuper) { setError('Choose a ledger.'); return; }
    setBusy(true);
    try {
      const body = { name: f.name.trim(), description: f.description.trim() || null, ...(canLink ? { bookId: f.bookId || null } : {}), ...(canShare && f.bookId ? { extraLedgerIds: f.extra.filter(x => x !== f.bookId) } : {}) };
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
          <Select className={inputCls} value={f.bookId} onChange={e => setF(s => ({ ...s, bookId: e.target.value, extra: s.extra.filter(x => x !== e.target.value) }))} disabled={!canLink || viewOnly || busy} aria-label="Linked ledger">
            {isSuper && <option value="">No ledger (only I can see it)</option>}
            {choices.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </Select>
        </Field>
        {f.bookId && canShare && (
          <Field label="Also share with">
            <fieldset disabled={viewOnly} className={viewOnly ? 'pointer-events-none opacity-60' : ''}><MultiSelect label="Also share with" options={extraOptions} value={extraValue} onChange={v => setF(s => ({ ...s, extra: [...v, ...s.extra.filter(x => !extraOptions.some(o => o.value === x))] }))} allLabel="No other ledger" /></fieldset>
          </Field>
        )}
        <p className="text-xs text-muted-foreground">
          {f.bookId
            ? 'Everyone who has this ledger and the Notebook page can open it: a Viewer reads, an Editor or Admin changes it. Several notebooks can share one ledger.'
            : 'Not linked: no other admin can see it, not even another super administrator.'}
          {!canLink && ' Only a super administrator or an Admin of its ledger (who is also Admin of the new one) can move it.'}
        </p>
        {notebook && canLink && f.bookId !== (notebook.bookId || '') && <p className="text-xs text-muted-foreground">Moving a notebook takes it out of the old ledger (its entries' project links are cleared).</p>}
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
