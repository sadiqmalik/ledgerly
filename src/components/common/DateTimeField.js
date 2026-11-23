import React from 'react';

// Date and time in ONE bordered box. showTime={false} gives a date-only box with the same look.
// The time is optional: empty means date only, and a small x clears it. The time part wraps under the date
// when there is no room. The date input always carries min and max so a year cannot run past four digits.
const part = '!m-0 !w-auto min-w-0 !border-0 !bg-transparent !px-1.5 !py-1 !text-sm text-foreground focus:!outline-none focus:!ring-0 disabled:opacity-50';

export default function DateTimeField({
  label, date, time, onDate, onTime, min = '1900-01-01', max = '9999-12-31',
  required, disabled, showTime = true, id, 'aria-label': ariaLabel
}) {
  const box = (
    <div className="mt-1 flex flex-wrap items-center rounded-md sm:flex-nowrap border border-border bg-background focus-within:ring-2 focus-within:ring-accent">
      <input id={id} type="date" min={min} max={max} required={required} disabled={disabled} aria-label={ariaLabel || label}
        className={`${part} flex-1 basis-28`} value={date || ''} onChange={e => onDate && onDate(e.target.value)} />
      {showTime && (
        <div className="flex flex-1 basis-24 items-center border-l border-border">
          <input type="time" disabled={disabled} aria-label={`${ariaLabel || label || 'Date'} time (optional)`}
            className={`${part} flex-1`} value={time || ''} onChange={e => onTime && onTime(e.target.value)} />
          {time && !disabled && (
            <button type="button" onClick={() => onTime && onTime('')} aria-label="Clear the time"
              className="mr-1 rounded px-1.5 text-base leading-none text-muted-foreground hover:bg-muted hover:text-foreground">×</button>
          )}
        </div>
      )}
    </div>
  );
  if (!label) return box;
  return (
    <div className="block text-sm font-medium text-foreground">
      <span className="block">{label}</span>
      {box}
    </div>
  );
}
