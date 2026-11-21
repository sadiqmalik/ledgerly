import { useEffect, useRef, useState } from 'react';
import { api } from '../../services/dataAPI';

// Shared classes, all driven by the colour tokens in src/styles/tokens.css.
export const inputCls =
  'mt-1 block w-full min-w-0 rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent';
export const btnPrimary =
  'rounded-md bg-accent px-3 py-2 text-sm font-medium text-accent-foreground disabled:opacity-50';
export const btnSecondary =
  'rounded-md border border-border bg-card px-3 py-2 text-sm font-medium text-foreground hover:bg-muted disabled:opacity-50';
export const btnDanger =
  'rounded-md border border-negative px-3 py-2 text-sm font-medium text-negative hover:bg-muted disabled:opacity-50';

export function errorText(err) {
  return err?.response?.data?.error || err?.message || 'Something went wrong';
}

// Loads a list from the Data API. `all` adds ?all=1 so archived/inactive rows are included.
export function useResource(path, { all = false } = {}) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api.get(path, { params: all ? { all: 1 } : undefined })
      .then(res => {
        if (cancelled) return;
        setData(Array.isArray(res.data) ? res.data : []);
        setError('');
      })
      .catch(err => { if (!cancelled) setError(errorText(err)); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [path, all, version]);

  return { data: data || [], error, loading, reload: () => setVersion(v => v + 1) };
}

export function Field({ label, children }) {
  return (
    <label className="block text-sm font-medium text-foreground">
      <span className="block">{label}</span>
      {children}
    </label>
  );
}

// On/off switch with a hint line. Used where a checkbox reads badly as a sentence.
export function Toggle({ label, hint, checked, onChange, disabled, compact = false }) {
  if (compact) {
    // Small inline switch for list headers: no box, label beside the switch.
    return (
      <label className={`inline-flex items-center gap-2 text-sm text-muted-foreground ${disabled ? 'opacity-60' : 'cursor-pointer'}`}>
        <input type="checkbox" role="switch" className="sr-only peer" checked={checked} disabled={disabled} onChange={e => onChange(e.target.checked)} />
        <span aria-hidden="true" className="relative h-5 w-9 shrink-0 rounded-full bg-border transition-colors peer-checked:bg-[var(--accent)] peer-focus-visible:ring-2 peer-focus-visible:ring-accent after:absolute after:left-0.5 after:top-0.5 after:size-4 after:rounded-full after:bg-white after:shadow after:transition-transform peer-checked:after:translate-x-4" />
        <span>{label}</span>
      </label>
    );
  }
  return (
    <label className={`flex items-center justify-between gap-3 rounded-lg border border-border bg-muted/30 px-3 py-2 ${disabled ? 'opacity-60' : 'cursor-pointer'}`}>
      <span className="min-w-0">
        <span className="block text-sm font-medium text-foreground">{label}</span>
        {hint && <span className="block text-xs text-muted-foreground">{hint}</span>}
      </span>
      <input type="checkbox" role="switch" className="sr-only peer" checked={checked} disabled={disabled} onChange={e => onChange(e.target.checked)} />
      <span aria-hidden="true" className="relative h-6 w-11 shrink-0 rounded-full bg-border transition-colors peer-checked:bg-[var(--accent)] peer-focus-visible:ring-2 peer-focus-visible:ring-accent after:absolute after:left-0.5 after:top-0.5 after:size-5 after:rounded-full after:bg-white after:shadow after:transition-transform peer-checked:after:translate-x-5" />
    </label>
  );
}

// Two-sided choice shown exactly like Toggle. The title and hint stay fixed and explain both states ("On: ... Off: ...").
// offValue is the value when the switch is off, onValue when it is on.
export function SideSwitch({ label, hint, offValue, onValue, value, onChange, disabled }) {
  return <Toggle label={label} hint={hint} checked={value === onValue} onChange={on => onChange(on ? onValue : offValue)} disabled={disabled} />;
}

// Debit | Credit for ledger entry forms: off = debit, on = credit.
export const dirProps = { label: 'Credit (money in)', hint: 'On: credit, money coming into the fund. Off: debit, money going out of the fund.', offValue: 'dr', onValue: 'cr' };

// A group of on/off switches laid out as tiles that wrap to the width (never one full-width row each).
// options: [{ value, label, hint? }]; value: the array of switched-on values; onChange gets the new array in option order.
export function ToggleGrid({ legend, options, value, onChange, disabled, minWidth = 12 }) {
  const flip = key => onChange(options.map(o => o.value).filter(v => (v === key ? !value.includes(key) : value.includes(v))));
  return (
    <fieldset className="m-0 min-w-0 space-y-2 border-0 p-0" disabled={disabled}>
      {legend && <legend className="mb-1 text-sm font-medium text-foreground">{legend}</legend>}
      <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(auto-fill, minmax(min(100%, ${minWidth}rem), 1fr))` }}>
        {options.map(o => <Toggle key={o.value} label={o.label} hint={o.hint} checked={value.includes(o.value)} onChange={() => flip(o.value)} disabled={disabled} />)}
      </div>
    </fieldset>
  );
}

// Two switches for a filter with two sides, shown together in one box (for example Credit and Debit). Both on means
// no filter (value ''). Switching one off leaves only the other side (value = that side), even when it was the only
// one left on (it then swaps to the other side), so both are never off. Switching one on again shows both.
export function EitherSwitches({ label, value, onChange, options, labelBelow = false }) {
  const [[a, aText], [b, bText]] = options;
  const aOn = value !== b;
  const bOn = value !== a;
  return (
    <div role="group" aria-label={label} className="flex min-w-0 flex-col gap-1 text-xs text-muted-foreground">
      {!labelBelow && <span>{label}</span>}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border border-border bg-muted/30 px-3 py-1.5">
        <Toggle compact label={aText} checked={aOn} onChange={on => onChange(on ? '' : b)} />
        <Toggle compact label={bText} checked={bOn} onChange={on => onChange(on ? '' : a)} />
      </div>
      {labelBelow && <span className="text-center">{label}</span>}
    </div>
  );
}

export function Check({ label, checked, onChange, disabled }) {
  return (
    <label className="flex items-center gap-2 text-sm text-foreground">
      <input
        type="checkbox"
        className="size-4 accent-[var(--accent)]"
        checked={checked}
        disabled={disabled}
        onChange={e => onChange(e.target.checked)}
      />
      <span>{label}</span>
    </label>
  );
}

// Pill switch (like the Settings tabs): one option is selected, click another to filter. options: [[key, label, count?]].
// A segmented toggle (radio group): one soft track, the chosen option raised like a pill. Arrow keys move the choice.
// options: [[key, text, optionalCount], ...]
export function Segmented({ label, value, onChange, options }) {
  const group = useRef(null);
  const move = (index, step) => {
    const at = (index + step + options.length) % options.length;
    onChange(options[at][0]);
    const target = group.current ? group.current.querySelectorAll('[role="radio"]')[at] : null;
    if (target) target.focus();
  };
  return (
    <div ref={group} role="radiogroup" aria-label={label} className="inline-flex items-center gap-0.5 rounded-lg bg-muted p-0.5">
      {options.map(([key, text, count], index) => {
        const on = value === key;
        return (
          <button key={key} type="button" role="radio" aria-checked={on} tabIndex={on ? 0 : -1} onClick={() => onChange(key)}
            onKeyDown={e => {
              if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); move(index, 1); }
              else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); move(index, -1); }
            }}
            className={`whitespace-nowrap rounded-md px-3 py-1 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent ${on ? 'bg-card font-medium text-foreground shadow-sm ring-1 ring-border' : 'text-muted-foreground hover:text-foreground'}`}>
            {text}{count != null && <span className={`ml-1.5 text-xs tabular-nums ${on ? 'text-muted-foreground' : 'opacity-60'}`}>{count}</span>}
          </button>
        );
      })}
    </div>
  );
}

export function Badge({ children }) {
  return (
    <span className="ml-2 inline-block rounded bg-muted px-1.5 py-0.5 align-middle text-xs text-muted-foreground">
      {children}
    </span>
  );
}

// Entry counts per record for the Funds/Accounts/Categories/People lists. Reloads whenever `busy` goes false
// (the list finished loading). A failed request just hides the counts.
export function useEntryCounts(bookId, key, busy) {
  const [counts, setCounts] = useState(null);
  useEffect(() => {
    if (busy || !key) return undefined;
    let cancelled = false;
    api.get(`/books/${bookId}/entry-counts`)
      .then(res => { if (!cancelled) setCounts(res.data?.[key] || {}); })
      .catch(() => { if (!cancelled) setCounts(null); });
    return () => { cancelled = true; };
  }, [bookId, key, busy]);
  return counts;
}

// "100 entries" link to the ledger (or plain text without ledger access); "No entries" when zero.
export function EntryCount({ n, href, noun = 'entries', name }) {
  const word = n === 1 && noun === 'entries' ? 'entry' : noun;
  if (!n) return <span className="text-xs tabular-nums text-muted-foreground">No {noun}</span>;
  const text = `${n} ${word}`;
  if (!href) return <span className="text-xs tabular-nums text-muted-foreground">{text}</span>;
  return (
    <a href={href} onClick={e => e.stopPropagation()} aria-label={`View ${text} for ${name} in the ledger`}
      className="whitespace-nowrap rounded-full px-2 py-0.5 text-xs tabular-nums text-muted-foreground hover:bg-accent/15 hover:text-accent focus-visible:text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
      {text}
    </a>
  );
}
