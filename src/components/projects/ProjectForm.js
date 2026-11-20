import React, { useMemo, useState } from 'react';
import Modal from '../common/Modal';
import { api } from '../../services/dataAPI';
import { errorMessage } from '../common/format';
import { formatMoney, parseMoney } from '../../utils/money';
import MoneyInput from '../common/MoneyInput';
import { Field, Check, inputCls, btnPrimary, btnSecondary } from '../settings/ui';
import ComboInput from '../common/ComboInput';
import { KINDS, metaPrefill } from './shared';

// Create (project == null) or edit a project.
export default function ProjectForm({ bookId, project, funds, kinds = [], onClose, onSaved }) {
  const editing = !!project;
  const kindItems = useMemo(() => [...new Set([...KINDS, ...kinds, project?.kind].filter(Boolean))].map(k => ({ id: k, name: k })), [kinds, project]);
  const [f, setF] = useState(() => ({
    name: project?.name || '',
    kind: project?.kind || 'trip',
    fundId: project?.fundId || '',
    startsOn: project?.startsOn || '',
    endsOn: project?.endsOn || '',
    budget: project?.budget ? formatMoney(project.budget).replace(/,/g, '') : '',
    metaSchema: project?.metaSchema?.length ? project.metaSchema : metaPrefill('trip'),
  }));
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [moveEntries, setMoveEntries] = useState(true); // only offered when an existing project's fund changes
  const fundChanged = editing && f.fundId && f.fundId !== (project.fundId || '');
  const set = (k, v) => setF(s => ({ ...s, [k]: v }));
  const setRow = (i, k, v) => setF(s => ({ ...s, metaSchema: s.metaSchema.map((r, j) => (j === i ? { ...r, [k]: v } : r)) }));

  const changeKind = kind => setF(s => ({
    ...s, kind,
    metaSchema: !editing && s.metaSchema.every(r => ['hospital', 'doctor', 'payer'].includes(r.key)) ? metaPrefill(kind.trim().toLowerCase()) : s.metaSchema,
  }));

  const submit = async e => {
    e.preventDefault();
    if (!f.name.trim()) return setErr('Name is required.');
    if (!f.kind.trim()) return setErr('Kind is required.');
    if (!f.fundId) return setErr('Choose a fund.');
    let budget = null;
    if (f.budget.trim()) {
      budget = parseMoney(f.budget);
      if (budget == null) return setErr('Budget must be a positive amount.');
    }
    if (f.startsOn && f.endsOn && f.endsOn < f.startsOn) return setErr('End date is before the start date.');
    const metaSchema = f.metaSchema
      .map(r => ({ key: r.key.trim(), label: (r.label || r.key).trim() }))
      .filter(r => r.key);
    const body = {
      name: f.name.trim(), kind: f.kind.trim().toLowerCase(), fundId: f.fundId,
      startsOn: f.startsOn || null, endsOn: f.endsOn || null, budget, metaSchema,
    };
    setBusy(true); setErr('');
    try {
      if (editing) await api.put(`/books/${bookId}/projects/${project.id}`, { ...body, ...(fundChanged && moveEntries ? { moveEntries: true } : {}) });
      else await api.post(`/books/${bookId}/projects`, body);
      onSaved();
    } catch (ex) { setErr(errorMessage(ex)); setBusy(false); }
  };

  return (
    <Modal title={editing ? 'Edit project' : 'New project'} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <Field label="Name"><input className={inputCls} value={f.name} onChange={e => set('name', e.target.value)} autoFocus /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Kind">
            <ComboInput value={f.kind} onChange={changeKind} items={kindItems} placeholder="Trip, medical, ..." noun="kind" />
          </Field>
          <Field label="Fund">
            <select className={inputCls} value={f.fundId} onChange={e => set('fundId', e.target.value)}>
              <option value="">Choose...</option>
              {funds.filter(x => !x.archived).map(x => <option key={x.id} value={x.id}>{x.name}</option>)}
            </select>
          </Field>
          <Field label="Starts"><input type="date" min="1900-01-01" max="9999-12-31" className={inputCls} value={f.startsOn} onChange={e => set('startsOn', e.target.value)} /></Field>
          <Field label="Ends"><input type="date" min="1900-01-01" max="9999-12-31" className={inputCls} value={f.endsOn} onChange={e => set('endsOn', e.target.value)} /></Field>
        </div>
        {fundChanged && (
          <div className="rounded-lg border border-border bg-muted/40 p-3">
            <Check label="Also move this project's existing entries to the new fund" checked={moveEntries} onChange={setMoveEntries} />
            <p className="mt-1 text-xs text-muted-foreground">Off keeps the existing entries in their current funds; only new entries use the new fund. Entries in a closed year or in another currency block the move.</p>
          </div>
        )}
        <Field label="Budget (optional)"><MoneyInput className={inputCls} value={f.budget} onChange={v => set('budget', v)} /></Field>
        <div>
          <div className="text-sm font-medium text-foreground">Extra fields</div>
          {f.metaSchema.map((r, i) => (
            <div key={i} className="mt-1 flex gap-2">
              <input aria-label="Key" placeholder="key" className={inputCls} value={r.key} onChange={e => setRow(i, 'key', e.target.value)} />
              <input aria-label="Label" placeholder="Label" className={inputCls} value={r.label} onChange={e => setRow(i, 'label', e.target.value)} />
              <button type="button" aria-label="Remove field" className={btnSecondary}
                onClick={() => set('metaSchema', f.metaSchema.filter((_, j) => j !== i))}>&times;</button>
            </div>
          ))}
          <button type="button" className={`${btnSecondary} mt-2`} onClick={() => set('metaSchema', [...f.metaSchema, { key: '', label: '' }])}>Add field</button>
        </div>
        {err && <p role="alert" className="text-sm text-negative">{err}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" className={btnSecondary} onClick={onClose}>Cancel</button>
          <button type="submit" className={btnPrimary} disabled={busy}>{editing ? 'Save' : 'Create'}</button>
        </div>
      </form>
    </Modal>
  );
}
