import React from 'react';
import { useCurrencies } from '../../hooks/CurrencyContext';
import Select from './Select';

// Pick a currency from the managed list of active currencies. The current value is always listed,
// even when it was switched off or is unknown, so editing an old record does not lose it.
export default function CurrencySelect({ value, onChange, id, className = '', required = true, disabled = false, 'aria-label': ariaLabel }) {
  const { active, currencies } = useCurrencies();
  const opts = [...active];
  if (value && !opts.some(c => c.code === value)) {
    const known = currencies.find(c => c.code === value);
    opts.unshift(known ? { ...known, name: `${known.name} (off)` } : { code: value, name: 'not in the list', alias: null });
  }
  const text = c => `${c.code}, ${c.name}${c.alias ? ` (${c.alias})` : ''}`;
  return (
    <Select id={id} className={className} value={value || ''} disabled={disabled} required={required}
      aria-label={ariaLabel} onChange={e => onChange(e.target.value)}>
      {!value && <option value="" disabled>Select currency</option>}
      {opts.map(c => <option key={c.code} value={c.code}>{text(c)}</option>)}
    </Select>
  );
}
