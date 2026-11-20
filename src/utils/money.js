// Money is always an integer in minor units (paisa / cents / öre) in the API and the database.
// These helpers are the only place that converts to and from what people see and type.

// 1032629 → "10,326.29"; 1000000 → "10,000" (decimals only when there are any).
export function formatMoney(minor, { currency, decimals } = {}) {
  if (minor == null || Number.isNaN(minor)) return '';
  const neg = minor < 0;
  const abs = Math.abs(minor);
  const whole = Math.floor(abs / 100);
  const frac = abs % 100;
  const showFrac = decimals === true || (decimals !== false && frac !== 0);
  let s = whole.toLocaleString('en-US');
  if (showFrac) s += '.' + String(frac).padStart(2, '0');
  if (currency) s = `${s} ${currency}`;
  return neg ? `-${s}` : s;
}

// "10,326.29" | "10326.29" | "10326" → 1032629. Returns null for anything that isn't a positive amount.
export function parseMoney(text) {
  if (text == null) return null;
  const raw = String(text).replace(/\s/g, '');
  // Commas are thousands separators only ("1,50" is invalid, not 150).
  if (raw.includes(',') && !/^\d{1,3}(,\d{3})+(\.\d{1,2})?$/.test(raw)) return null;
  const clean = raw.replace(/,/g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(clean)) return null;
  const [w, f = ''] = clean.split('.');
  const minor = Number(w) * 100 + Number((f + '00').slice(0, 2));
  return minor > 0 ? minor : null;
}
