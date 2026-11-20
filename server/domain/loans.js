// Loan register totals. Amounts are integer minor units; balance = taken - returned and may be negative (overpaid).
const loanTotals = rows => {
  let taken = 0;
  let returned = 0;
  let count = 0;
  for (const r of rows) {
    if (r.deletedAt) continue;
    if (r.kind === 'taken') taken += r.amount;
    else if (r.kind === 'returned') returned += r.amount;
    else continue;
    count += 1;
  }
  return { taken, returned, balance: taken - returned, count };
};

// Per-lender totals: for each lender name (null = not assigned) taken, returned and remaining. Named lenders first, A to Z.
const lenderTotals = rows => {
  const by = new Map();
  for (const r of rows) {
    if (r.deletedAt || (r.kind !== 'taken' && r.kind !== 'returned')) continue;
    const key = r.lender || null;
    const t = by.get(key) || { lender: key, taken: 0, returned: 0, balance: 0, count: 0 };
    if (r.kind === 'taken') t.taken += r.amount; else t.returned += r.amount;
    t.balance = t.taken - t.returned;
    t.count += 1;
    by.set(key, t);
  }
  return [...by.values()].sort((a, b) => (a.lender === null) - (b.lender === null) || String(a.lender).localeCompare(String(b.lender)));
};

module.exports = { loanTotals, lenderTotals };
