import React from 'react';
import { quantityPriceFromEntry } from '../../utils/entryQuantityPrice.mjs';

// Shows a compact quantity × unit-price breakdown for an entry row/card.
export default function QuantityPriceText({ entry, currency, className = '' }) {
  const qp = quantityPriceFromEntry(entry);
  if (!qp.unitPrice) return null;
  return (
    <span className={`tabular-nums text-xs text-muted-foreground ${className}`}>
      {qp.quantityText} × {qp.unitPriceLabel}{currency ? <span className="ml-1">{currency}</span> : null}
    </span>
  );
}
