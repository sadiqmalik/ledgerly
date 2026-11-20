import React, { useState } from 'react';
import ComboInput from './ComboInput';

export const NAME_SEP = ' & ';
export const splitNames = value => String(value || '').split(/\s*&\s*/).map(n => n.trim()).filter(Boolean);

// Several names in one field. Each chosen or typed name becomes a chip; the value is the names joined with " & ",
// so it stays a plain text value everywhere else (display, API, backups). Pick from the list, or type a name and
// press Enter or comma. A name left in the box when focus moves away is added too.
export default function NamesInput({ value, onChange, items, inputClassName, placeholder, noun = 'name', disabled }) {
  const names = splitNames(value);
  const [draft, setDraft] = useState('');
  const save = list => onChange(list.join(NAME_SEP));
  const add = text => {
    const incoming = String(text || '').split(/\s*[&,]\s*/).map(n => n.trim()).filter(Boolean);
    const next = [...names];
    for (const n of incoming) {
      const known = items.find(i => i.name.toLowerCase() === n.toLowerCase());
      const name = known ? known.name : n;
      if (!next.some(x => x.toLowerCase() === name.toLowerCase())) next.push(name);
    }
    save(next);
    setDraft('');
  };
  const remove = i => save(names.filter((_, k) => k !== i));
  const onBlur = e => {
    if (e.currentTarget.contains(e.relatedTarget)) return;
    if (draft.trim()) add(draft);
  };
  return (
    // This sits inside a <label> (Field). A click in a label is forwarded to its first button, which would be a chip's
    // remove button, so a click on a suggestion would remove a chip. Cancel that forwarding; real clicks still run.
    <div onBlur={onBlur} onClick={e => e.preventDefault()}>
      {names.length > 0 && (
        <ul className="mb-1 flex flex-wrap gap-1.5" aria-label="Chosen names">
          {names.map((n, i) => (
            <li key={n} className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-0.5 text-sm text-foreground">
              <span>{n}</span>
              {!disabled && <button type="button" aria-label={`Remove ${n}`} onClick={() => remove(i)}
                className="rounded-full px-1 text-muted-foreground hover:text-foreground" style={{ background: 'transparent', border: 0 }}>&times;</button>}
            </li>
          ))}
        </ul>
      )}
      <ComboInput value={draft} onChange={setDraft} items={items.filter(i => !names.some(n => n.toLowerCase() === i.name.toLowerCase()))}
        inputClassName={inputClassName} placeholder={names.length ? 'Add another name' : placeholder} noun={noun} disabled={disabled}
        onPick={add} onCommit={add} />
    </div>
  );
}
