import React from 'react';
import { formatMoney } from '../../utils/money';
import { useLedger } from '../../hooks/LedgerContext';
import { useCurrencies } from '../../hooks/CurrencyContext';

// Money in minor units. tone: 'cr' (green), 'dr' (red) or none. The currency code always shows, as a small muted suffix.
// Without `currency` it falls back to the current book's base currency; `hideCurrency` is for very tight spots only.
export default function Amount({ minor, currency, tone, className = '', hideCurrency = false }) {
  const ctx = useLedger();
  const { label } = useCurrencies();
  if (minor == null) return null;
  const color = tone === 'cr' ? 'text-positive' : tone === 'dr' ? 'text-negative' : '';
  const code = currency || ctx?.book?.baseCurrency;
  return (
    <span className={`tabular-nums whitespace-nowrap ${color} ${className}`}>
      {formatMoney(minor)}
      {!hideCurrency && code && <span className="ml-1 text-[0.7em] font-normal text-muted-foreground">{label(code)}</span>}
    </span>
  );
}
