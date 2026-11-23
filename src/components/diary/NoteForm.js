import React, { useRef, useState } from 'react';
import { api } from '../../services/dataAPI';
import Modal from '../common/Modal';
import ComboInput from '../common/ComboInput';
import { errorMessage } from '../common/format';
import { RichText, RichTextEditor } from './RichText';
import { inputCls, btnPrimary, btnSecondary, btnDanger, Field, Toggle } from '../settings/ui';
import { asItems, spanText, EntryMarks, ZoneLine, NowLine, useAppZone, inheritedFrom, fromText, ZoneSelect, ColorPicker } from './shared';
import { nowInZone } from '../../utils/timeZones';

const niceStart = n => spanText({ date: n.date, time: n.time });
const niceEnd = n => (n.endDate || n.endTime ? spanText({ date: n.endDate || n.date, time: n.endTime }) : '');
import Select from '../common/Select';
import RecordView, { TagPills } from '../common/RecordView';
import DateTimeField from '../common/DateTimeField';

// Create (note null) or edit a diary entry. copyOf pre-fills a duplicate (dated today); presets pre-fill a new
// one (for example the category and type when adding from a category page).
// A note is a plain note (message, from, for); an important date is a dated event with a small note that can
// repeat every year. The category box takes an existing category or a new name, created on save.
export default function NoteForm({ base, note, copyOf, preset, projects, categories, names, canEdit = true, notebookLocked = false, notebookZone = null, onClose, onSaved, onDuplicate, onToggleActive, onDelete, onLock }) {
  const src = note || copyOf;
  const appZone = useAppZone();
  const [f, setF] = useState(() => ({
    kind: src?.kind || preset?.kind || 'note',
    date: note?.date || nowInZone(appZone).date, time: src?.time || '', timeZone: src?.timeZone || '', endDate: src?.endDate || '', endTime: src?.endTime || '', title: src?.title || '', message: src?.message || '',
    fromName: src?.fromName || '', toName: src?.toName || '', projectId: src?.projectId || '',
    category: src ? (src.categoryName || '') : (preset?.categoryName || ''),
    repeatYearly: Boolean(src?.repeatYearly), important: Boolean(src?.important), locked: Boolean(note?.locked), color: src?.color || ''
  }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  // A category created by an earlier save attempt whose note then failed: reused on the next try instead of being
  // created again (which the server would refuse as a duplicate).
  const made = useRef(null);
  const set = k => e => setF(s => ({ ...s, [k]: e.target.value }));
  const isDate = f.kind === 'date';
  // A new entry starts on its category's zone, else the notebook's, else the application zone; only an explicit pick is stored.
  const catKey = s => s.trim().replace(/\s+/g, ' ').toLocaleLowerCase();
  const pickedCat = f.category.trim() ? categories.find(c => catKey(c.name) === catKey(f.category)) : null;
  const inherited = inheritedFrom([[pickedCat?.timeZone, 'category'], [notebookZone, 'notebook']], appZone);
  const entryZone = f.timeZone || inherited.zone;

  const submit = async e => {
    e.preventDefault();
    setError('');
    if (!f.title.trim()) { setError('Enter a title.'); return; }
    setBusy(true);
    try {
      // Category: an existing name maps to its id; a new name is created first.
      let categoryId = null;
      const key = s => s.trim().replace(/\s+/g, ' ').toLocaleLowerCase();
      const name = f.category.trim();
      if (name) {
        const hit = [...categories, ...(made.current ? [made.current] : [])].find(c => key(c.name) === key(name));
        if (hit) categoryId = hit.id;
        else {
          made.current = (await api.post(`${base}/categories`, { name })).data;
          categoryId = made.current.id;
        }
      }
      const body = {
        kind: f.kind, date: f.date, time: f.time || null, timeZone: (f.time || f.endTime) && f.timeZone ? f.timeZone : null, endDate: f.endDate || null, endTime: f.endTime || null, title: f.title.trim(), message: f.message.trim() || null,
        fromName: f.fromName.trim() || null, toName: f.toName.trim() || null,
        projectId: f.projectId || null, categoryId, important: f.important, repeatYearly: isDate && f.repeatYearly, locked: f.locked, color: f.color || null
      };
      if (note) await api.put(`${base}/entries/${note.id}`, body);
      else await api.post(`${base}/entries`, body);
      onSaved();
    } catch (err) { setError(errorMessage(err)); setBusy(false); }
  };

  if (note && (!canEdit || note.effectiveLocked)) {
    const project = projects.find(p => p.id === note.projectId)?.name;
    return (
      <RecordView title={`${note.important ? '\u2605 ' : ''}${note.title}`} titleSuffix={<EntryMarks note={note} />} onClose={onClose}
        actions={canEdit && onLock && note.locked ? <button type="button" className={btnSecondary} onClick={() => onLock(note)}>Unlock</button> : null}
        tags={[          note.effectiveLocked && (note.locked ? 'Locked' : notebookLocked ? 'Locked \u00b7 notebook' : 'Locked \u00b7 category'), note.categoryName]}
        rows={[
          { label: 'Start', value: niceStart(note) },
          { label: 'End', value: niceEnd(note) },
          { label: 'Status', value: note.active === false ? 'Disabled' : '' },
          { label: 'From', value: note.fromName },
          { label: 'For', value: note.toName },
          { label: 'Project', value: project },
        ]}>
        {note.message && (
          <div className="rounded-lg border border-border bg-muted/30 px-3 py-2">
            <div className="text-xs text-muted-foreground">{note.kind === 'date' ? 'Small note' : 'Message'}</div>
            <RichText text={note.message} className="text-sm" />
          </div>
        )}
        <ZoneLine note={note} appZone={appZone} divider />
      </RecordView>
    );
  }

  const heading = `${f.important ? '\u2605 ' : ''}${note ? (note.title || f.title) : `New ${isDate ? 'date' : 'note'}`}`;
  return (
    <Modal title={heading} onClose={onClose} bare>
      <form onSubmit={submit} className="space-y-3">
        <div className="flex items-start justify-between gap-3 rounded-xl border border-border bg-muted/30 px-4 py-3">
          <div className="min-w-0">
            <h3 className="break-words text-xl font-semibold text-foreground" style={{ margin: 0 }}>{heading} <EntryMarks note={{ kind: f.kind, repeatYearly: isDate && f.repeatYearly }} /></h3>
            <TagPills tags={[f.locked && 'Locked', f.category.trim()]} />
          </div>
          <button type="button" aria-label="Close" onClick={onClose} className="btn shrink-0 px-2 py-1">&times;</button>
        </div>
        {error && <p role="alert" className="text-sm text-negative">{error}</p>}
        <div className="grid grid-cols-2 gap-2">
          <Toggle label="Important date" hint="A day to remember, with a countdown." checked={isDate} onChange={() => setF(s => ({ ...s, kind: s.kind === 'date' ? 'note' : 'date' }))} disabled={busy} />
          <Toggle label="Starred" hint="Marks it with a star." checked={f.important} onChange={() => setF(s => ({ ...s, important: !s.important }))} disabled={busy} />
        </div>
        <Field label="Colour"><ColorPicker value={f.color} onChange={v => setF(s => ({ ...s, color: v }))} disabled={busy} /></Field>
        <Field label="Category (a person or a topic)">
          <ComboInput value={f.category} onChange={v => setF(s => ({ ...s, category: v }))} items={categories.map(c => ({ id: c.id, name: c.name }))} inputClassName={inputCls} placeholder="Pick or type, for example Car" noun="category" />
        </Field>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,13.5rem),1fr))] gap-2">
          <DateTimeField label="Start" required date={f.date} time={f.time} onDate={v => setF(s => ({ ...s, date: v }))} onTime={v => setF(s => ({ ...s, time: v }))} />
          <DateTimeField label="End (optional)" min={f.date || '1900-01-01'} date={f.endDate} time={f.endTime} onDate={v => setF(s => ({ ...s, endDate: v }))} onTime={v => setF(s => ({ ...s, endTime: v }))} />
        </div>
        {(f.time || f.endTime) && (
          <div className="space-y-1">
            <Field label="Time zone">
              <ZoneSelect value={f.timeZone} onChange={v => setF(s => ({ ...s, timeZone: v }))} inherited={inherited} disabled={busy} />
            </Field>
            <NowLine zone={entryZone} compact />
            <ZoneLine note={{ ...f, time: f.time || f.endTime, resolvedTimeZone: entryZone }} appZone={appZone} />
          </div>
        )}
        <Field label={isDate ? 'What is the date for?' : 'Title'}><input className={inputCls} value={f.title} onChange={set('title')} required maxLength={200} placeholder={isDate ? 'Anniversary, first cleaning, bought the car' : 'What is this about?'} /></Field>
        <Field label={isDate ? 'Small note' : 'Message'}><RichTextEditor rows={isDate ? 3 : 5} value={f.message} onChange={v => setF(s => ({ ...s, message: v }))} placeholder={isDate ? 'Anything worth remembering about it' : 'The note, thought or message to remember'} /></Field>
 
        {isDate && (
          <Toggle label="Repeats every year" checked={f.repeatYearly} onChange={() => setF(s => ({ ...s, repeatYearly: !s.repeatYearly }))} disabled={busy}
            hint="On: for anniversaries and birthdays. It shows under Upcoming every year, counting down to the day." />
        )}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="From (optional)"><ComboInput value={f.fromName} onChange={v => setF(s => ({ ...s, fromName: v }))} items={asItems(names)} inputClassName={inputCls} placeholder="Pick or type a name" noun="name" /></Field>
          <Field label="For (optional)"><ComboInput value={f.toName} onChange={v => setF(s => ({ ...s, toName: v }))} items={asItems(names)} inputClassName={inputCls} placeholder="Pick or type a name" noun="name" /></Field>
        </div>
        <Field label="Project (optional)">
          <Select className={inputCls} value={f.projectId} onChange={set('projectId')}>
            <option value="">(none, this ledger only)</option>
            {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </Select>
        </Field>
        <Toggle compact label="Lock this entry" checked={f.locked} onChange={() => setF(s => ({ ...s, locked: !s.locked }))} disabled={busy} />
        {note && f.locked && <p className="text-xs text-muted-foreground">While locked it cannot be edited, duplicated, disabled or deleted. Save to lock it.</p>}
        <div className="flex gap-2">
          <button type="submit" className={btnPrimary} disabled={busy}>{busy ? 'Saving...' : 'Save'}</button>
          <button type="button" className={btnSecondary} onClick={onClose} disabled={busy}>Cancel</button>
          {note && onDuplicate && (
            <span className="ml-auto flex flex-wrap gap-2">
              <button type="button" className={btnSecondary} onClick={() => onDuplicate(note)} disabled={busy || note.locked}>Duplicate</button>
              <button type="button" className={btnSecondary} onClick={() => onToggleActive(note)} disabled={busy || note.locked}>{note.active ? 'Disable' : 'Enable'}</button>
              <button type="button" className={btnDanger} onClick={() => onDelete(note)} disabled={busy || note.locked}>Delete</button>
            </span>
          )}
        </div>
      </form>
    </Modal>
  );
}
