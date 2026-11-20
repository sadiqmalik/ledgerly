import React, { forwardRef } from 'react';
import { formatMoney, parseMoney } from '../../utils/money';

// Amount box: shows 1,500.50 when you leave it and plain 1500.50 while you type. The value stays text, so every
// caller keeps using parseMoney (it accepts thousands commas). Text that is not a valid amount is never rewritten.
const MoneyInput = forwardRef(function MoneyInput({ value, onChange, onFocus, onBlur, ...rest }, ref) {
  const text = value == null ? '' : String(value);
  const handleFocus = e => {
    if (parseMoney(text) != null && text.includes(',')) onChange(text.replace(/,/g, ''));
    if (onFocus) onFocus(e);
  };
  const handleBlur = e => {
    const minor = parseMoney(text);
    if (minor != null) {
      const pretty = formatMoney(minor);
      if (pretty !== text) onChange(pretty);
    }
    if (onBlur) onBlur(e);
  };
  return <input inputMode="decimal" {...rest} ref={ref} value={text} onChange={e => onChange(e.target.value)} onFocus={handleFocus} onBlur={handleBlur} />;
});

export default MoneyInput;
