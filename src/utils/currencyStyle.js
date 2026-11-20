// A stable accent per currency code, so wallets in different currencies (USD, SEK, ...) are easy to tell apart.
const KNOWN = { USD: 1, SEK: 2, EUR: 3, GBP: 4, AED: 5, CAD: 6 };

export const currencyIndex = code => {
  const c = String(code || '').toUpperCase();
  if (KNOWN[c]) return KNOWN[c];
  let h = 0;
  for (let i = 0; i < c.length; i += 1) h = (h * 31 + c.charCodeAt(i)) >>> 0;
  return (h % 6) + 1;
};

export const currencyColor = code => `var(--cur-${currencyIndex(code)})`;

// Style for a row or card: nothing for the base currency, else a soft tint plus a left bar.
export const currencyRowStyle = (code, base) => {
  if (!code || code === base) return undefined;
  const c = currencyColor(code);
  return { background: `color-mix(in srgb, ${c} 9%, transparent)`, boxShadow: `inset 3px 0 0 ${c}` };
};
