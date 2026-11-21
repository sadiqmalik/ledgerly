import React, { useRef, useState } from 'react';

const sizeText = n => (n < 1024 ? `${n} B` : n < 1024 * 1024 ? `${Math.round(n / 1024)} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`);

// A nicer file chooser than the browser's "Choose file" box: a dashed drop area with a button, the chosen file's name
// and size, and a Remove link. onChange gets the File (or null). accept is the same string as <input accept>.
export default function FilePicker({ file, onChange, accept, disabled, hint = 'Drop a file here or choose one', id }) {
  const input = useRef(null);
  const [over, setOver] = useState(false);
  const take = f => { if (f) onChange(f); };
  return (
    <div
      onDragOver={e => { if (!disabled) { e.preventDefault(); setOver(true); } }}
      onDragLeave={() => setOver(false)}
      onDrop={e => { e.preventDefault(); setOver(false); if (!disabled) take(e.dataTransfer.files?.[0]); }}
      className={`flex flex-wrap items-center gap-3 rounded-lg border border-dashed px-3 py-3 text-sm ${over ? 'border-accent bg-accent/10' : 'border-border bg-muted/30'} ${disabled ? 'opacity-60' : ''}`}>
      <input ref={input} id={id} type="file" accept={accept} disabled={disabled} className="sr-only"
        onChange={e => { take(e.target.files?.[0] || null); e.target.value = ''; }} />
      <button type="button" className="btn" disabled={disabled} onClick={() => input.current && input.current.click()}>
        <span aria-hidden="true" className="mr-1">&#128206;</span>{file ? 'Choose another file' : 'Choose file'}
      </button>
      {file ? (
        <span className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2">
          <span className="min-w-0 truncate font-medium text-foreground">{file.name}</span>
          <span className="text-xs text-muted-foreground">{sizeText(file.size)}</span>
          <button type="button" className="text-xs text-muted-foreground underline" disabled={disabled} onClick={() => onChange(null)}>Remove</button>
        </span>
      ) : (
        <span className="min-w-0 flex-1 text-muted-foreground">{hint}</span>
      )}
    </div>
  );
}
