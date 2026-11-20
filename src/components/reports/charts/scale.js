// Axis helpers. Money values are integer minor units.
export function niceTicks(min, max, count = 4) {
  if (min > 0) min = 0;
  if (max < 0) max = 0;
  if (min === max) max = min + 1;
  const raw = (max - min) / count;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / mag;
  const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10) * mag;
  const lo = Math.floor(min / step) * step;
  const hi = Math.ceil(max / step) * step;
  const ticks = [];
  for (let v = lo; v <= hi + step / 2; v += step) ticks.push(Math.round(v * 1e6) / 1e6);
  return ticks;
}

// 123456789 minor -> "1.2M" (value shown in major units).
export function compact(minor) {
  if (minor == null) return '';
  const v = minor / 100;
  const a = Math.abs(v);
  const f = (n, s) => `${(Math.round(n * 10) / 10).toString()}${s}`;
  if (a >= 1e9) return f(v / 1e9, 'B');
  if (a >= 1e6) return f(v / 1e6, 'M');
  if (a >= 1e3) return f(v / 1e3, 'k');
  return String(Math.round(v));
}
