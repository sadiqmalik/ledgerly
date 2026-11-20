import React, { useEffect, useMemo, useRef, useState } from 'react';

export const NONE = 'none';

// Closes `onClose` on an outside mousedown or Escape while `active`.
export function useDismiss(ref, active, onClose) {
  useEffect(() => {
    if (!active) return undefined;
    const onDown = e => { if (ref.current && !ref.current.contains(e.target)) onClose(); };
    const onKey = e => { if (e.key === 'Escape') { e.stopPropagation(); onClose(true); } };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [ref, active, onClose]);
}

// Filter button with a popover of checkboxes. value is an array of option values (plus NONE when noneLabel is set).
// options: [{ value, label, group? }]. Esc closes, arrows move, space toggles. A bottom sheet on phones.
export default function MultiSelect({ label, options, value, onChange, allLabel, noneLabel, searchable = true }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const root = useRef(null);
  const btn = useRef(null);
  const list = useRef(null);
  const close = refocus => { setOpen(false); setSearch(''); if (refocus === true && btn.current) btn.current.focus(); };
  useDismiss(root, open, close);
  const pop = useRef(null);

  // Move focus into the popover (the search box, else the first checkbox) and close it when focus leaves.
  useEffect(() => {
    if (!open || !pop.current) return;
    const el = pop.current.querySelector('[data-ms-search]') || pop.current.querySelector('[data-ms-item]') || pop.current.querySelector('button');
    if (el) el.focus();
  }, [open]);
  const onBlur = e => {
    const next = e.relatedTarget;
    if (next && root.current && root.current.contains(next)) return;
    if (next === null && document.activeElement && root.current?.contains(document.activeElement)) return;
    if (next === null) return; // clicking non-focusable space: the outside-mousedown handler closes it
    close();
  };

  // A value whose option has not loaded yet (or is not visible to this account) is never shown as its raw id.
  const labelOf = v => (v === NONE ? '(none)' : options.find(o => o.value === v)?.label);
  const onlyLabel = value.length === 1 ? labelOf(value[0]) : undefined;
  const summary = value.length === 0 ? allLabel : onlyLabel || `${value.length} selected`;

  const shown = useMemo(() => {
    const s = search.trim().toLowerCase();
    return options.filter(o => !s || String(o.label).toLowerCase().includes(s));
  }, [options, search]);
  const groups = useMemo(() => {
    const out = [];
    shown.forEach(o => {
      const g = o.group || '';
      let bucket = out.find(x => x.name === g);
      if (!bucket) { bucket = { name: g, items: [] }; out.push(bucket); }
      bucket.items.push(o);
    });
    return out;
  }, [shown]);

  const toggle = v => onChange(value.includes(v) ? value.filter(x => x !== v) : [...value, v]);
  const selectAll = () => {
    const add = shown.map(o => o.value);
    onChange([...new Set([...value, ...add])]);
  };

  const move = e => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    const nodes = Array.from(list.current ? list.current.querySelectorAll('[data-ms-item]') : []);
    const all = e.currentTarget.querySelector('[data-ms-search]') ? [e.currentTarget.querySelector('[data-ms-search]'), ...nodes] : nodes;
    if (!all.length) return;
    e.preventDefault();
    const i = all.indexOf(document.activeElement);
    const next = e.key === 'ArrowDown' ? Math.min(all.length - 1, i + 1) : Math.max(0, i - 1);
    all[next].focus();
  };

  const item = (v, text) => (
    <label key={v} className="flex items-center gap-2 px-3 py-2 sm:py-1.5 text-sm cursor-pointer hover:bg-muted">
      <input type="checkbox" data-ms-item className="size-4 accent-[var(--accent)]" checked={value.includes(v)} onChange={() => toggle(v)} />
      <span className="min-w-0 truncate">{text}</span>
    </label>
  );

  return (
    <div className="relative min-w-0" ref={root}>
      <button ref={btn} type="button" aria-haspopup="listbox" aria-expanded={open} aria-label={`${label}: ${summary}`}
        onClick={() => setOpen(o => !o)}
        className={`w-full min-w-0 flex items-center justify-between gap-2 rounded-md border bg-background px-3 py-2 text-sm text-left ${value.length ? 'border-accent' : 'border-border'}`}>
        <span className="truncate">{summary}</span><span aria-hidden="true" className="text-xs opacity-60">&#9662;</span>
      </button>
      {open && (
        <div ref={pop} role="group" aria-label={label} onKeyDown={move} onBlur={onBlur}
          className="fixed inset-x-0 bottom-0 z-50 max-h-[80vh] flex flex-col rounded-t-2xl border border-border bg-card text-card-foreground shadow-lg sm:absolute sm:inset-x-auto sm:bottom-auto sm:left-0 sm:top-full sm:mt-1 sm:w-64 sm:max-h-80 sm:rounded-lg">
          <div className="flex items-center justify-between px-3 pt-3 sm:hidden"><strong>{label}</strong>
            <button type="button" className="btn px-2 py-1" onClick={() => close(true)}>Done</button></div>
          {searchable && (
            <div className="p-2"><input data-ms-search type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder={`Search ${label.toLowerCase()}`} aria-label={`Search ${label}`} autoFocus /></div>
          )}
          <div className="flex gap-2 px-2 pb-2">
            <button type="button" className="btn px-2 py-1 text-xs" onClick={selectAll}>Select all</button>
            <button type="button" className="btn px-2 py-1 text-xs" onClick={() => onChange([])}>Clear</button>
          </div>
          <div ref={list} className="overflow-y-auto border-t border-border pb-2">
            {noneLabel && item(NONE, noneLabel)}
            {groups.map(g => (
              <div key={g.name || '_'}>
                {g.name && <div className="px-3 pt-2 pb-1 text-xs uppercase tracking-wide text-muted-foreground">{g.name}</div>}
                {g.items.map(o => item(o.value, o.label))}
              </div>
            ))}
            {!shown.length && <p className="px-3 py-2 text-sm text-muted-foreground">No matches.</p>}
          </div>
        </div>
      )}
    </div>
  );
}
