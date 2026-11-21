import React, { useEffect, useMemo, useRef, useState } from 'react';

// A styled single-choice drop-down that replaces the browser's native <select>, in the same look as MultiSelect: a
// button showing the choice and a popover list (a bottom sheet on phones) with a check mark on the chosen row, keyboard
// support (arrows, Enter, Esc, type to jump) and a search box once the list is long. It takes the same <option> and
// <optgroup> children and calls onChange({ target: { value } }) so existing handlers keep working.
const textOf = node => React.Children.toArray(node).map(n => (typeof n === 'string' || typeof n === 'number' ? String(n) : textOf(n.props?.children))).join('');

function collect(children, group, out) {
  React.Children.forEach(children, child => {
    if (!React.isValidElement(child)) return;
    if (child.type === React.Fragment) collect(child.props.children, group, out);
    else if (child.type === 'optgroup') collect(child.props.children, child.props.label, out);
    else if (child.type === 'option') {
      const label = textOf(child.props.children);
      out.push({ value: child.props.value !== undefined ? String(child.props.value) : label, label, disabled: Boolean(child.props.disabled), group });
    }
  });
  return out;
}

const SEARCH_AFTER = 8;
const DEFAULT_CLS = 'w-full min-w-0 rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent';

export default function Select({ value, onChange, children, className, disabled, id, 'aria-label': ariaLabel, name, title, style }) {
  const options = useMemo(() => collect(children, '', []), [children]);
  const current = options.find(o => o.value === String(value ?? ''));
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [pos, setPos] = useState(null);
  const btn = useRef(null);
  const pop = useRef(null);
  const list = useRef(null);
  const typed = useRef({ text: '', at: 0 });
  const searchable = options.length > SEARCH_AFTER;

  const close = refocus => { setOpen(false); setSearch(''); if (refocus && btn.current) btn.current.focus(); };
  const pick = o => { if (o.disabled) return; if (o.value !== String(value ?? '')) onChange({ target: { value: o.value, name } }); close(true); };

  // Place the popover under the button (above when there is no room); recalculated while open.
  useEffect(() => {
    if (!open) return undefined;
    const place = () => {
      if (!btn.current) return;
      const r = btn.current.getBoundingClientRect();
      const below = window.innerHeight - r.bottom - 8;
      const up = below < 200 && r.top > below;
      const max = Math.max(160, Math.min(320, up ? r.top - 8 : below));
      setPos({ left: r.left, width: Math.max(r.width, 180), maxHeight: max, ...(up ? { bottom: window.innerHeight - r.top + 4 } : { top: r.bottom + 4 }) });
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => { window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true); };
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = e => { if (!pop.current?.contains(e.target) && !btn.current?.contains(e.target)) close(); };
    const onKey = e => { if (e.key === 'Escape') { e.stopPropagation(); close(true); } };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey, true);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey, true); };
  }, [open]);

  // Focus the search box, else the chosen (or first) row.
  useEffect(() => {
    if (!open || !pop.current) return;
    const el = pop.current.querySelector('[data-sel-search]') || pop.current.querySelector('[aria-selected="true"]') || pop.current.querySelector('[data-sel-item]');
    if (el) el.focus();
  }, [open, pos !== null]); // eslint-disable-line react-hooks/exhaustive-deps

  const shown = useMemo(() => {
    const s = search.trim().toLowerCase();
    return options.filter(o => !s || o.label.toLowerCase().includes(s));
  }, [options, search]);
  const groups = useMemo(() => {
    const out = [];
    shown.forEach(o => {
      let b = out.find(x => x.name === o.group);
      if (!b) { b = { name: o.group, items: [] }; out.push(b); }
      b.items.push(o);
    });
    return out;
  }, [shown]);

  const onListKey = e => {
    const nodes = Array.from(pop.current.querySelectorAll('[data-sel-item]:not([aria-disabled="true"])'));
    const search = pop.current.querySelector('[data-sel-search]');
    const all = search ? [search, ...nodes] : nodes;
    const i = all.indexOf(document.activeElement);
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      all[e.key === 'ArrowDown' ? Math.min(all.length - 1, i + 1) : Math.max(0, i - 1)]?.focus();
    } else if (e.key === 'Home' || e.key === 'End') {
      e.preventDefault();
      nodes[e.key === 'Home' ? 0 : nodes.length - 1]?.focus();
    } else if (!searchable && e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
      // Type to jump to the next row starting with the typed letters.
      const now = Date.now();
      typed.current = { text: (now - typed.current.at < 700 ? typed.current.text : '') + e.key.toLowerCase(), at: now };
      nodes.find(n => n.textContent.trim().toLowerCase().startsWith(typed.current.text))?.focus();
    }
  };

  const row = o => {
    const on = o.value === String(value ?? '');
    return (
      <button key={o.value} type="button" role="option" aria-selected={on} aria-disabled={o.disabled || undefined} data-sel-item
        onClick={() => pick(o)}
        className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm sm:py-1.5 ${o.disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer hover:bg-muted focus:bg-muted focus:outline-none'} ${on ? 'font-medium text-foreground' : 'text-foreground'}`}
        style={{ background: 'transparent', border: 0, borderRadius: 0 }}>
        <span className="min-w-0 truncate">{o.label || ' '}</span>
        {on && <span aria-hidden="true" className="shrink-0 text-accent">&#10003;</span>}
      </button>
    );
  };

  return (
    <>
      <button ref={btn} id={id} type="button" aria-haspopup="listbox" aria-expanded={open} aria-label={ariaLabel} title={title} disabled={disabled} style={style}
        onClick={() => setOpen(o => !o)}
        onKeyDown={e => { if (!open && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) { e.preventDefault(); setOpen(true); } }}
        className={`flex items-center justify-between gap-2 text-left disabled:opacity-60 ${className || DEFAULT_CLS}`}>
        <span className={`min-w-0 truncate ${current ? '' : 'text-muted-foreground'}`}>{current ? current.label || ' ' : (options[0]?.label ?? '')}</span>
        <span aria-hidden="true" className="shrink-0 text-xs opacity-60">&#9662;</span>
      </button>
      {open && (
        <div ref={pop} onKeyDown={onListKey}
          className="fixed inset-x-0 bottom-0 z-[70] flex max-h-[80vh] flex-col rounded-t-2xl border border-border bg-card text-card-foreground shadow-lg sm:inset-x-auto sm:bottom-auto sm:rounded-lg"
          style={pos && window.innerWidth >= 640 ? { left: pos.left, width: pos.width, maxHeight: pos.maxHeight, top: pos.top, bottom: pos.bottom } : undefined}>
          <div className="flex items-center justify-between px-3 pt-3 sm:hidden">
            <strong>{ariaLabel || 'Choose'}</strong>
            <button type="button" className="btn px-2 py-1" onClick={() => close(true)}>Done</button>
          </div>
          {searchable && (
            <div className="p-2"><input data-sel-search type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search" aria-label="Search" /></div>
          )}
          <div ref={list} role="listbox" aria-label={ariaLabel} className="overflow-y-auto py-1">
            {groups.map(g => (
              <div key={g.name || '_'}>
                {g.name && <div className="px-3 pb-1 pt-2 text-xs uppercase tracking-wide text-muted-foreground">{g.name}</div>}
                {g.items.map(row)}
              </div>
            ))}
            {!shown.length && <p className="px-3 py-2 text-sm text-muted-foreground">No matches.</p>}
          </div>
        </div>
      )}
    </>
  );
}
