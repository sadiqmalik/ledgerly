import PartyChip from '../common/PartyChip';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../services/dataAPI';
import { useLedger } from '../../hooks/LedgerContext';
import Modal from '../common/Modal';
import ConfirmDialog from '../common/ConfirmDialog';
import PartyInput from '../common/PartyInput';
import ComboInput from '../common/ComboInput';
import Amount from '../common/Amount';
import EntryPicker, { EntryChips } from './EntryPicker';
import { errorMessage, findParty, todayISO } from '../common/format';
import MultiSelect from '../common/MultiSelect';
import { inputCls, btnPrimary, btnSecondary, btnDanger, Field } from '../settings/ui';
import Select from '../common/Select';
import FilePicker from '../common/FilePicker';
import { StampFooter } from '../common/Stamp';

const MAX_BYTES = 10 * 1024 * 1024;

const sizeText = n => {
  if (n == null) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
};

const uploadError = err => {
  const s = err?.response?.status;
  if (s === 413) return 'File is too large (max 10 MB).';
  if (s === 415) return 'Unsupported file: PDF or image only (PDF, JPEG, PNG, WebP, HEIC).';
  return errorMessage(err);
};

// ComboInput items from plain strings.
const asItems = list => list.map(name => ({ id: name.toLowerCase(), name }));
const distinct = (rows, key) => [...new Map(rows.map(r => r[key]).filter(Boolean).map(v => [v.trim().toLowerCase(), v.trim()])).values()];

function DocForm({ bookId, doc, copyOf, projects, parties, types, doctors, hospitals, onClose, onSaved }) {
  // A duplicate pre-fills everything except the file and receives today's date; Save creates a new record.
  const src = doc || copyOf;
  const [f, setF] = useState(() => ({
    date: doc?.date || todayISO(),
    receivedOn: doc?.receivedOn || '',
    title: src?.title || '',
    type: src?.type || '',
    doctor: src?.doctor || '',
    hospital: src?.hospital || '',
    projectId: src?.projectId || '',
    comment: src?.comment || ''
  }));
  const [person, setPerson] = useState(src?.partyName || '');
  const [entries, setEntries] = useState(() => src?.entries || []);
  const [file, setFile] = useState(null);
  // Set once the record is created, so a retry after a failed upload only PUTs (never POSTs a duplicate).
  const [createdId, setCreatedId] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = k => e => setF(s => ({ ...s, [k]: e.target.value }));
  const party = person.trim() ? findParty(parties, person) : null;

  const submit = async e => {
    e.preventDefault();
    setError('');
    if (!f.title.trim()) { setError('Enter a title.'); return; }
    if (file && file.size > MAX_BYTES) { setError('File is too large (max 10 MB).'); return; }
    const body = {
      date: f.date, title: f.title.trim(), receivedOn: f.receivedOn || null,
      type: f.type.trim() || null, doctor: f.doctor.trim() || null, hospital: f.hospital.trim() || null,
      comment: f.comment.trim() || null, projectId: f.projectId || null,
      partyId: party ? party.id : null
    };
    const ids = entries.map(x => x.id);
    const before = (doc?.entries || []).map(x => x.id);
    if (!doc || ids.length !== before.length || ids.some(x => !before.includes(x))) body.entryIds = ids;
    setBusy(true);
    let id = doc?.id || createdId;
    try {
      if (id) await api.put(`/books/${bookId}/documents/${id}`, body);
      else { id = (await api.post(`/books/${bookId}/documents`, body)).data.id; setCreatedId(id); }
    } catch (err) { setError(errorMessage(err)); setBusy(false); return; }
    if (file) {
      try {
        await api.put(`/books/${bookId}/documents/${id}/file`, file, {
          headers: { 'Content-Type': file.type || 'application/octet-stream', 'X-File-Name': encodeURIComponent(file.name) }
        });
      } catch (err) {
        // The record is saved; only the upload failed.
        setError(`Saved, but the file was not uploaded. ${uploadError(err)}`);
        setBusy(false);
        onSaved(false);
        return;
      }
    }
    onSaved(true);
  };

  return (
    <Modal title={doc || createdId ? 'Edit document' : copyOf ? 'Duplicate document' : 'Add document'} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        {error && <p role="alert" className="text-sm text-negative">{error}</p>}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Date"><input type="date" min="1900-01-01" max="9999-12-31" required className={inputCls} value={f.date} onChange={set('date')} /></Field>
          <Field label="Received on"><input type="date" min="1900-01-01" max="9999-12-31" className={inputCls} value={f.receivedOn} onChange={set('receivedOn')} /></Field>
        </div>
        <Field label="Title"><input className={inputCls} value={f.title} onChange={set('title')} required /></Field>
        <Field label="Type">
          <ComboInput value={f.type} onChange={v => setF(s => ({ ...s, type: v }))} items={asItems(types)} inputClassName={inputCls} placeholder="Report, Prescription..." noun="type" />
        </Field>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Doctor"><ComboInput value={f.doctor} onChange={v => setF(s => ({ ...s, doctor: v }))} items={asItems(doctors)} inputClassName={inputCls} placeholder="Pick or type a name" noun="doctor" /></Field>
          <Field label="Hospital"><ComboInput value={f.hospital} onChange={v => setF(s => ({ ...s, hospital: v }))} items={asItems(hospitals)} inputClassName={inputCls} placeholder="Pick or type a name" noun="hospital" /></Field>
        </div>
        <Field label="Project">
          <Select className={inputCls} value={f.projectId} onChange={set('projectId')}>
            <option value="">(none)</option>
            {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </Select>
        </Field>
        <div className="text-sm font-medium text-foreground">
          <label htmlFor="doc-person">Person</label>
          <div className="mt-1 [&_input]:block [&_input]:w-full [&_input]:rounded-md [&_input]:border [&_input]:border-border [&_input]:bg-background [&_input]:px-3 [&_input]:py-2 [&_input]:text-sm">
            <PartyInput id="doc-person" value={person} onChange={setPerson} parties={parties} />
          </div>
          {person.trim() && !party && (
            <p className="mt-1 text-xs text-muted-foreground">No matching person: the document will be saved without one. Add them in Settings, People.</p>
          )}
        </div>
        <div className="text-sm font-medium text-foreground">
          <span id="doc-entries-label">Entries</span>
          <div className="mt-1 space-y-2" aria-labelledby="doc-entries-label">
            <EntryChips entries={entries} onRemove={id => setEntries(l => l.filter(x => x.id !== id))} />
            {entries.length < 50 && <EntryPicker bookId={bookId} excludeIds={entries.map(x => x.id)} onPick={e => setEntries(l => [...l, e])} />}
          </div>
        </div>
        <Field label="Comment"><textarea rows={2} className={inputCls} value={f.comment} onChange={set('comment')} /></Field>
        <Field label={doc?.hasFile ? 'Replace file (PDF or image, max 10 MB)' : 'File (PDF or image, max 10 MB)'}>
          <FilePicker file={file} onChange={setFile} accept="application/pdf,image/*,.heic" disabled={busy} hint="PDF or image. Drop a file here or choose one" />
        </Field>
        {doc?.hasFile && !file && <p className="text-xs text-muted-foreground">Current file: {doc.fileName} ({sizeText(doc.fileSize)})</p>}
        <div className="flex flex-wrap items-center gap-2">
          <button type="submit" className={btnPrimary} disabled={busy}>{busy ? (file ? 'Saving and uploading...' : 'Saving...') : 'Save'}</button>
          <button type="button" className={btnSecondary} onClick={onClose} disabled={busy}>Cancel</button>
          {busy && file && <span className="inline-block size-4 animate-spin rounded-full border-2 border-border border-t-accent" role="status" aria-label="Uploading" />}
        </div>
      </form>
    </Modal>
  );
}

export default function Documents() {
  const { book, canEdit, parties, can } = useLedger();
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');
  const [projects, setProjects] = useState([]);
  const [types, setTypes] = useState([]);
  const [every, setEvery] = useState([]); // unfiltered list, for doctor and hospital suggestions
  const [filt, setFilt] = useState({ project: [], type: [], q: '', from: '', to: '' });
  const [editing, setEditing] = useState(null); // null | {} (new) | doc
  const [pendingDelete, setPendingDelete] = useState(null); // doc awaiting confirmation, else null
  const [deleting, setDeleting] = useState(false);
  const [n, setN] = useState(0);
  const base = `/books/${book.id}`;

  useEffect(() => {
    api.get(`${base}/project-names`).then(r => setProjects(r.data)).catch(() => {});
  }, [base]);
  useEffect(() => {
    api.get(`${base}/documents/types`).then(r => setTypes(r.data)).catch(() => {});
    api.get(`${base}/documents`).then(r => setEvery(Array.isArray(r.data) ? r.data : [])).catch(() => {});
  }, [base, n]);
  useEffect(() => {
    let off = false;
    const params = Object.fromEntries(Object.entries({ ...filt, project: filt.project.join(','), type: filt.type.join('\u001f') }).filter(([, v]) => v));
    const t = setTimeout(() => {
      api.get(`${base}/documents`, { params })
        .then(r => { if (!off) { setRows(r.data); setError(''); } })
        .catch(e => { if (!off) setError(errorMessage(e)); });
    }, filt.q ? 250 : 0);
    return () => { off = true; clearTimeout(t); };
  }, [base, filt, n]);

  const setF = k => e => setFilt(s => ({ ...s, [k]: e.target.value }));
  const projOpts = useMemo(() => projects.map(p => ({ value: p.id, label: p.name })), [projects]);
  const typeOpts = useMemo(() => types.map(t => ({ value: t, label: t })), [types]);
  const fileUrl = d => `/api${base}/documents/${d.id}/file`;
  const remove = useCallback(async d => {
    setDeleting(true);
    try { await api.delete(`${base}/documents/${d.id}`); setN(x => x + 1); } catch (e) { setError(errorMessage(e)); }
    setDeleting(false);
  }, [base]);

  const projLink = d => d.projectId
    ? !can('projects') ? <span>{d.projectName || 'Project'}</span> : <a href={`#/projects/${d.projectId}`} className="text-accent underline">{d.projectName || 'Project'}</a> : null;
  const fileLink = d => d.hasFile
    ? <a href={fileUrl(d)} target="_blank" rel="noreferrer" className="inline-flex max-w-full items-center gap-1 text-accent underline">
        <span aria-hidden="true">&#128206;</span><span className="truncate">{d.fileName}</span><span className="shrink-0 text-xs text-muted-foreground">({sizeText(d.fileSize)})</span>
      </a> : null;

  return (
    <section className="min-w-0 space-y-4">
      <div className="grid grid-cols-2 items-end gap-2 md:grid-cols-[repeat(5,minmax(0,1fr))_auto]">
        <Field label="Project"><MultiSelect label="Project" allLabel="All projects" noneLabel="(none)" options={projOpts} value={filt.project} onChange={v => setFilt(s => ({ ...s, project: v }))} /></Field>
        <Field label="Type"><MultiSelect label="Type" allLabel="All types" options={typeOpts} value={filt.type} onChange={v => setFilt(s => ({ ...s, type: v }))} /></Field>
        <Field label="Search"><input type="search" className="mt-1 w-full min-w-0" placeholder="Title or note" value={filt.q} onChange={setF('q')} /></Field>
        <Field label="From"><input type="date" min="1900-01-01" max="9999-12-31" className="mt-1 w-full min-w-0" value={filt.from} onChange={setF('from')} /></Field>
        <Field label="To"><input type="date" min="1900-01-01" max="9999-12-31" className="mt-1 w-full min-w-0" value={filt.to} onChange={setF('to')} /></Field>
        {canEdit && <button type="button" className={`${btnPrimary} col-span-2 md:col-span-1 md:py-[0.55rem]`} onClick={() => setEditing({})}>Add document</button>}
      </div>
      {error && <p role="alert" className="text-sm text-negative">{error}</p>}
      {rows && !rows.length && <p className="text-sm text-muted-foreground">No documents.</p>}

      {!!rows?.length && (
        <div className="grid items-stretch gap-3 grid-cols-[repeat(auto-fill,minmax(min(100%,20rem),1fr))]">
          {rows.map(d => (
            <div key={d.id} role={canEdit ? 'button' : undefined} tabIndex={canEdit ? 0 : undefined}
              onClick={canEdit ? () => setEditing(d) : undefined}
              onKeyDown={canEdit ? e => { if ((e.key === 'Enter' || e.key === ' ') && e.target === e.currentTarget) { e.preventDefault(); setEditing(d); } } : undefined}
              className={`flex h-full min-w-0 flex-col rounded-xl border border-border bg-card p-4 text-sm text-foreground ${canEdit ? 'cursor-pointer hover:bg-muted/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent' : ''}`}>
              <div className="flex items-start justify-between gap-2">
                <h2 className="min-w-0 break-words text-lg font-semibold">{d.title}</h2>
                {d.type && <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">{d.type}</span>}
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">{d.date}{d.receivedOn ? ` · received ${d.receivedOn}` : ''}</p>
              {(d.doctor || d.hospital) && <p className="mt-1 text-sm text-muted-foreground">{[d.doctor, d.hospital].filter(Boolean).join(' \u00B7 ')}</p>}
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground" onClick={e => e.stopPropagation()}>
                {d.partyName && <PartyChip partyId={d.partyId} name={d.partyName} />}
                {projLink(d) && <span>{projLink(d)}</span>}
              </div>
              {d.comment && <p className="mt-2 whitespace-pre-wrap break-words text-muted-foreground">{d.comment}</p>}
              {!!d.entries?.length && (
                <div className="mt-2 flex min-w-0 flex-wrap gap-1.5 text-xs" onClick={e => e.stopPropagation()}>
                  {d.entries.map(e => (
                    <a key={e.id} href={`#/ledger?year=all&from=${e.date}&to=${e.date}`} title="Show in the ledger"
                      className="inline-flex max-w-full items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-muted-foreground hover:underline">
                      <span className="truncate">{e.date}{e.partyName ? ` ${e.partyName}` : ''}</span>
                      <Amount minor={e.amount} currency={e.currency} tone={e.direction} />
                    </a>
                  ))}
                </div>
              )}
              <div className="mt-auto flex flex-wrap items-center gap-2 pt-3" onClick={e => e.stopPropagation()} onKeyDown={e => e.stopPropagation()}>
                {fileLink(d) && <div className="min-w-0 max-w-full text-xs">{fileLink(d)}</div>}
                {canEdit && (
                  <span className="ml-auto flex items-center gap-2">
                    <button type="button" className={`${btnSecondary} !px-2 !py-1 text-xs`} onClick={() => setEditing({ copy: d })}>Duplicate</button>
                    <button type="button" className={`${btnDanger} !px-2 !py-1 text-xs`} onClick={() => setPendingDelete(d)}>Delete</button>
                  </span>
                )}
              </div>
              <StampFooter createdAt={d.createdAt} updatedAt={d.updatedAt} />
            </div>
          ))}
        </div>
      )}

      {editing && (
        <DocForm bookId={book.id} doc={editing.id ? editing : null} copyOf={editing.copy} projects={projects} parties={parties} types={types}
          doctors={distinct(every, 'doctor')} hospitals={distinct(every, 'hospital')}
          onClose={() => setEditing(null)}
          onSaved={ok => { setN(x => x + 1); if (ok) setEditing(null); }} />
      )}
      {pendingDelete && (
        <ConfirmDialog
          title="Delete document?"
          message={`Delete "${pendingDelete.title}"${pendingDelete.hasFile ? ' and its file' : ''}?`}
          confirmLabel="Delete"
          tone="danger"
          busy={deleting}
          onConfirm={async () => { await remove(pendingDelete); setPendingDelete(null); }}
          onCancel={() => setPendingDelete(null)}
        />
      )}
    </section>
  );
}
