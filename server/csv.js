// Entries CSV: RFC 4180 quoting, decimal amounts, UTF-8 BOM (so Excel reads non-ASCII text correctly).
const COLUMNS = ['date', 'fund', 'direction', 'amount', 'currency', 'party', 'category', 'project', 'comment', 'rate', 'status', 'paid_date', 'exclude', 'quantity', 'unit_price'];

// Text cells starting with = + - @ tab or CR are prefixed with ' so spreadsheets do not run them as formulas.
const cell = (v, { text = true } = {}) => {
  if (v == null) return '';
  let s = String(v);
  if (text && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

// Integer minor units -> "10326.29" (two decimals), no float arithmetic.
const decimal = minor => {
  const n = Math.abs(Math.trunc(minor));
  return `${minor < 0 ? '-' : ''}${Math.floor(n / 100)}.${String(n % 100).padStart(2, '0')}`;
};

const entriesCsv = rows => {
  const lines = [COLUMNS.join(',')];
  for (const r of rows) {
    lines.push([r.date, r.fund, r.direction, decimal(r.amount), r.currency, r.party, r.category, r.project, r.comment, r.rate,
      r.status, r.paid_date, r.exclude ? 1 : 0, r.quantity ?? 1, decimal(r.unit_price ?? r.amount)]
      .map((v, i) => cell(v, { text: !['amount', 'quantity', 'unit_price'].includes(COLUMNS[i]) })).join(','));
  }
  return `﻿${lines.join('\r\n')}\r\n`;
};

module.exports = { entriesCsv, decimal, cell, COLUMNS };
