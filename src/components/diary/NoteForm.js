import React, { useRef, useState } from 'react';
import { api } from '../../services/dataAPI';
import Modal from '../common/Modal';
import ComboInput from '../common/ComboInput';
import { errorMessage, todayISO } from '../common/format';
import { RichTextEditor } from './RichText';
import { inputCls, btnPrimary, btnSecondary, Field, Toggle } from '../settings/ui';
import { asItems } from './shared';
import Select from '../common/Select';

// Create (note null) or edit a diary entry. copyOf pre-fills a duplicate (dated today); presets pre-fill a new
// one (for example the category and type when adding from a category page).
// A note is a plain note (message, from, for); an important date is a dated event with a small note that can
// repeat every year. The category box takes an existing category or a new name, created on save.
export default function NoteForm({ base, note, copyOf, preset, projects, categories, names, onClose, onSaved }) {
  const src = note || copyOf;
  const [f, setF] = useState(() => ({
    kind: src?.kind || preset?.kind || 'note',
    date: note?.date || todayISO(), title: src?.title || '', message: src?.message || '',
    fromName: src?.fromName || '', toName: src?.toName || '', projectId: src?.projectId || '',
    category: src ? (src.categoryName || '') : (preset?.categoryName || ''),
    repeatYearly: Boolean(src?.repeatYearly), important: Boolean(src?.important)
  }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  // A category created by an earlier save attempt whose note then failed: reused on the next try instead of being
  // created again (which the server would refuse as a duplicate).
  const made = useRef(null);
  const set = k => e => setF(s => ({ ...s, [k]: e.target.value }));
  const isDate = f.kind === 'date';

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
        kind: f.kind, date: f.date, title: f.title.trim(), message: f.message.trim() || null,
        fromName: f.fromName.trim() || null, toName: f.toName.trim() || null,
        projectId: f.projectId || null, categoryId, important: f.important, repeatYearly: isDate && f.repeatYearly
      };
      if (note) await api.put(`${base}/entries/${note.id}`, body);
      else await api.post(`${base}/entries`, body);
      onSaved();
    } catch (err) { setError(errorMessage(err)); setBusy(false); }
  };

  const verb = note ? 'Edit' : copyOf ? 'Duplicate' : 'New';
  return (
    <Modal title={`${verb} ${isDate ? 'important date' : 'note'}`} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        {error && <p role="alert" className="text-sm text-negative">{error}</p>}
        <div className="grid grid-cols-2 gap-2">
          <Toggle label="Important date" hint="A day to remember, with a countdown." checked={isDate} onChange={() => setF(s => ({ ...s, kind: s.kind === 'date' ? 'note' : 'date' }))} disabled={busy} />
          <Toggle label="Starred" hint="Marks it with a star." checked={f.important} onChange={() => setF(s => ({ ...s, important: !s.important }))} disabled={busy} />
        </div>
        <Field label="Category (a person or a topic)">
          <ComboInput value={f.category} onChange={v => setF(s => ({ ...s, category: v }))} items={categories.map(c => ({ id: c.id, name: c.name }))} inputClassName={inputCls} placeholder="Pick or type, for example Car" noun="category" />
        </Field>
        <Field label="Date"><input type="date" min="1900-01-01" max="9999-12-31" required className={inputCls} value={f.date} onChange={set('date')} /></Field>
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
        <div className="flex gap-2">
          <button type="submit" className={btnPrimary} disabled={busy}>{busy ? 'Saving...' : 'Save'}</button>
          <button type="button" className={btnSecondary} onClick={onClose} disabled={busy}>Cancel</button>
        </div>
      </form>
    </Modal>
  );
}
