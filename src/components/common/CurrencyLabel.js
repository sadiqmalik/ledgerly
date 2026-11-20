import React from 'react';
import { useCurrencies } from '../../hooks/CurrencyContext';

// A currency shown as its alias when one is set, else its code.
export default function CurrencyLabel({ code }) {
  const { label } = useCurrencies();
  return <>{label(code)}</>;
}
