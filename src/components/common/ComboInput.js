import React, { useMemo, useRef, useState } from 'react';

// Type to search a list, pick from the dropdown, or keep a new text value.
// items: [{ id, name, aliases? }]; value is plain text. `noun` names what a new value creates.
export default function ComboInput({ value, onChange, items, id, disabled, placeholder, noun = 'item', inputClassName, onPick, onCommit }) {
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const root = useRef(null);
  const text = value.trim();
  const exact = (() => {
    const n = text.toLowerCase();
    return n ? items.find(p => p.name.toLowerCase() === n || (p.aliases || []).some(a => a.toLowerCase() === n)) || null : null;
  })();

  const matches = useMemo(() => {
    const q = text.toLowerCase();
    const list = [...items].sort((a, b) => a.name.localeCompare(b.name));
    return (q ? list.filter(p => p.name.toLowerCase().includes(q) || (p.aliases || []).some(a => a.toLowerCase().includes(q))) : list).slice(0, 50);
  }, [items, text]);

  const pick = name => { onChange(name); setOpen(false); if (onPick) onPick(name); };
  const canCreate = text && !exact;
  const count = matches.length + (canCreate ? 1 : 0);

  const onKeyDown = e => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setHi(h => Math.min(h + 1, count - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHi(h => Math.max(h - 1, 0)); }
    else if (e.key === 'Escape' && open) { e.stopPropagation(); setOpen(false); }
    else if (e.key === 'Enter' && open) {
      e.preventDefault();
      if (hi < matches.length) pick(matches[hi].name); else { setOpen(false); if (onCommit && text) onCommit(text); }
    }
    else if (onCommit && text && (e.key === ',' || (e.key === 'Enter' && !open))) { e.preventDefault(); onCommit(text); }
  };
  const onBlur = e => {
    if (root.current?.contains(e.relatedTarget)) return;
    setOpen(false);
    // Snap to the saved spelling so "bob" does not create a duplicate of "Bob".
    if (exact && exact.name !== value) onChange(exact.name);
  };

  return (
    <div ref={root} className="relative min-w-0" onBlur={onBlur} onClick={e => e.preventDefault() /* inside a <label>: do not forward the click to the input and reopen the list */}>
      <div className="relative">
        <input id={id} className={inputClassName} role="combobox" aria-expanded={open} aria-autocomplete="list" value={value} disabled={disabled} autoComplete="off"
          placeholder={placeholder} style={{ paddingRight: '2rem', width: '100%' }} onKeyDown={onKeyDown}
          onChange={e => { onChange(e.target.value); setOpen(true); setHi(0); }} onFocus={() => setOpen(true)} />
        {!disabled && <button type="button" tabIndex={-1} aria-label="Show options" onMouseDown={e => e.preventDefault()}
          onClick={() => setOpen(o => !o)} className="absolute right-2 top-1/2 -translate-y-1/2 text-xs opacity-60" style={{ background: 'transparent', border: 0, color: 'inherit' }}>&#9662;</button>}
      </div>
      {open && !disabled && (
        <ul role="listbox" className="absolute left-0 right-0 top-full z-50 mt-1 max-h-60 overflow-y-auto rounded-lg border border-border bg-card py-1 text-sm text-card-foreground shadow-lg" style={{ listStyle: 'none' }}>
          {matches.map((p, i) => (
            <li key={p.id} role="option" aria-selected={exact?.id === p.id} onMouseDown={e => e.preventDefault()} onClick={() => pick(p.name)}
              className={`cursor-pointer px-3 py-1.5 ${i === hi ? 'bg-muted' : ''} ${exact?.id === p.id ? 'font-medium' : ''}`}>{p.name}</li>
          ))}
          {canCreate && (
            <li role="option" onMouseDown={e => e.preventDefault()} onClick={() => { setOpen(false); if (onCommit) onCommit(text); }}
              className={`cursor-pointer border-t border-border px-3 py-1.5 text-accent ${hi === matches.length ? 'bg-muted' : ''}`}>+ Create new {noun} &ldquo;{text}&rdquo;</li>
          )}
          {!matches.length && !canCreate && <li className="px-3 py-1.5 text-muted-foreground">Nothing here yet.</li>}
        </ul>
      )}
    </div>
  );
}
