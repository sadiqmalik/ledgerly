import React, { useRef } from 'react';
import { inputCls } from '../settings/ui';

// Notes are stored as plain text with light markup: **bold**, *italic*, ~~strikethrough~~ and "- " bullet lines.
// They are rendered as React elements (never as HTML), so nothing in a note can inject markup.
const INLINE = /\*\*(.+?)\*\*|~~(.+?)~~|\*(.+?)\*/s;

function inline(text, key = 'i') {
  const out = [];
  let rest = text;
  let n = 0;
  while (rest) {
    const m = INLINE.exec(rest);
    if (!m) { out.push(rest); break; }
    if (m.index) out.push(rest.slice(0, m.index));
    const k = `${key}${n++}`;
    if (m[1] !== undefined) out.push(<strong key={k}>{inline(m[1], k)}</strong>);
    else if (m[2] !== undefined) out.push(<s key={k}>{inline(m[2], k)}</s>);
    else out.push(<em key={k}>{inline(m[3], k)}</em>);
    rest = rest.slice(m.index + m[0].length);
  }
  return out;
}

export function RichText({ text, className = '' }) {
  if (!text) return null;
  const lines = text.split('\n');
  return (
    <div className={`break-words ${className}`}>
      {lines.map((line, i) => (/^- /.test(line)
        ? <div key={i} className="flex gap-2 pl-1"><span aria-hidden="true">&bull;</span><span className="min-w-0">{inline(line.slice(2), `l${i}`)}</span></div>
        : <div key={i} className="min-h-[1.25em]">{inline(line, `l${i}`)}</div>))}
    </div>
  );
}

const BTN = 'inline-flex h-8 min-w-8 items-center justify-center rounded-md border border-border bg-card px-2 text-sm text-foreground hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent';

// A textarea with a small formatting bar (bold, italic, strikethrough, bullet list) and Ctrl/Cmd+B and +I.
export function RichTextEditor({ value, onChange, rows = 5, maxLength = 8000, placeholder }) {
  const ref = useRef(null);
  const apply = (next, from, to) => {
    onChange(next);
    requestAnimationFrame(() => { const el = ref.current; if (el) { el.focus(); el.setSelectionRange(from, to); } });
  };
  const wrap = mark => {
    const el = ref.current; if (!el) return;
    const { selectionStart: a, selectionEnd: b } = el;
    const sel = value.slice(a, b);
    // Already wrapped: take the marks off again.
    if (sel.startsWith(mark) && sel.endsWith(mark) && sel.length >= mark.length * 2) {
      apply(value.slice(0, a) + sel.slice(mark.length, -mark.length) + value.slice(b), a, b - mark.length * 2);
    } else {
      apply(value.slice(0, a) + mark + sel + mark + value.slice(b), a + mark.length, b + mark.length);
    }
  };
  const bullet = () => {
    const el = ref.current; if (!el) return;
    const { selectionStart: a, selectionEnd: b } = el;
    const start = value.lastIndexOf('\n', a - 1) + 1;
    const end = b + (value.slice(b).indexOf('\n') === -1 ? value.length - b : value.slice(b).indexOf('\n'));
    const lines = value.slice(start, end).split('\n');
    const all = lines.every(l => l.startsWith('- '));
    const next = lines.map(l => (all ? l.slice(2) : (l.startsWith('- ') ? l : `- ${l}`))).join('\n');
    apply(value.slice(0, start) + next + value.slice(end), start, start + next.length);
  };
  const onKeyDown = e => {
    if (!(e.metaKey || e.ctrlKey) || e.altKey) return;
    const k = e.key.toLowerCase();
    if (k === 'b') { e.preventDefault(); wrap('**'); } else if (k === 'i') { e.preventDefault(); wrap('*'); }
  };
  return (
    <div>
      <div className="mb-1 flex flex-wrap gap-1" role="toolbar" aria-label="Text formatting">
        <button type="button" className={`${BTN} font-bold`} title="Bold (Ctrl/Cmd+B)" aria-label="Bold" onClick={() => wrap('**')}>B</button>
        <button type="button" className={`${BTN} italic`} title="Italic (Ctrl/Cmd+I)" aria-label="Italic" onClick={() => wrap('*')}>I</button>
        <button type="button" className={`${BTN} line-through`} title="Strikethrough" aria-label="Strikethrough" onClick={() => wrap('~~')}>S</button>
        <button type="button" className={BTN} title="Bullet list" aria-label="Bullet list" onClick={bullet}>&bull;</button>
      </div>
      <textarea ref={ref} rows={rows} className={`${inputCls} !mt-0`} value={value} onChange={e => onChange(e.target.value)} onKeyDown={onKeyDown} maxLength={maxLength} placeholder={placeholder} />
    </div>
  );
}
