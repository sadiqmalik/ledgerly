import React, { useState } from 'react';
import { api } from '../../services/dataAPI';
import Modal from '../common/Modal';
import { errorMessage } from '../common/format';
import { inputCls, btnPrimary, btnSecondary, Field } from '../settings/ui';

// Create (category null) or rename a diary category. The description is the category's main note.
export default function CategoryForm({ base, category, onClose, onSaved }) {
  const [f, setF] = useState({ name: category?.name || '', description: category?.description || '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submit = async e => {
    e.preventDefault();
    if (!f.name.trim()) { setError('Enter a name.'); return; }
    const body = { name: f.name.trim(), description: f.description.trim() || null };
    setBusy(true);
    try {
      const r = category
        ? await api.put(`${base}/categories/${category.id}`, body)
        : await api.post(`${base}/categories`, body);
      onSaved(r.data);
    } catch (err) { setError(errorMessage(err)); setBusy(false); }
  };
  return (
    <Modal title={category ? 'Edit category' : 'New category'} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        {error && <p role="alert" className="text-sm text-negative">{error}</p>}
        <Field label="Name"><input className={inputCls} value={f.name} onChange={e => setF(s => ({ ...s, name: e.target.value }))} required maxLength={80} autoFocus placeholder="A person or a topic, for example Car" /></Field>
        <Field label="Main note (optional)"><textarea rows={4} className={inputCls} value={f.description} onChange={e => setF(s => ({ ...s, description: e.target.value }))} maxLength={2000} placeholder="Shown at the top of the category" /></Field>
        <div className="flex gap-2">
          <button type="submit" className={btnPrimary} disabled={busy}>{busy ? 'Saving...' : 'Save'}</button>
          <button type="button" className={btnSecondary} onClick={onClose} disabled={busy}>Cancel</button>
        </div>
      </form>
    </Modal>
  );
}
