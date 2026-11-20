// Pure domain rules (balances, usable, transfer pairing, year lock). No I/O.
// Entries here are camelCase objects: { id?, date, fundId, direction, amount, exclude?, deletedAt? }.
// Amounts are integers in minor units.

const counts = e => !e.exclude && !e.deletedAt;

// Σ cr − Σ dr for one fund, date <= asOf (when given), excluded and deleted rows ignored.
const balance = (entries, fundId, asOf) => {
  let sum = 0;
  for (const e of entries) {
    if (e.fundId !== fundId || !counts(e)) continue;
    if (asOf && e.date > asOf) continue;
    sum += e.direction === 'cr' ? e.amount : -e.amount;
  }
  return sum;
};

// total = base-currency funds only; usable = total minus the reserved ones. Foreign funds are listed, never summed.
// Memo funds (kind 'memo') are tracked but never counted in total or usable; they are returned flagged by kind.
const summary = (funds, entries, baseCurrency, asOf) => {
  const list = funds.map(f => ({
    id: f.id, name: f.name, currency: f.currency, kind: f.kind,
    isReserved: Boolean(f.isReserved), holderId: f.holderId ?? null,
    balance: balance(entries, f.id, asOf)
  }));
  const base = list.filter(f => f.currency === baseCurrency && f.kind !== 'memo');
  const total = base.reduce((s, f) => s + f.balance, 0);
  const reserved = base.filter(f => f.isReserved).reduce((s, f) => s + f.balance, 0);
  return { total, usable: total - reserved, funds: list };
};

const opening = (entries, fundId, year) => balance(entries, fundId, `${year - 1}-12-31`);

// Filtered subtotal: excluded and deleted rows do not count.
const totals = entries => {
  let cr = 0;
  let dr = 0;
  for (const e of entries) {
    if (!counts(e)) continue;
    if (e.direction === 'cr') cr += e.amount; else dr += e.amount;
  }
  return { cr, dr, net: cr - dr };
};

const DEFAULT_CATEGORIES = { transfer: 'cat_transfer', conversion: 'cat_conversion' };

// Two legs sharing a link_id: dr on fromFund, cr on toFund. fromFund/toFund: { id, currency }.
const makeTransfer = ({ date, fromFund, toFund, amount, toAmount, comment = null }, categories = DEFAULT_CATEGORIES) => {
  if (!fromFund || !toFund || fromFund.id === toFund.id) throw new Error('The two funds must differ');
  if (!Number.isInteger(amount) || amount <= 0) throw new Error('amount must be a positive integer');
  const cross = fromFund.currency !== toFund.currency;
  if (cross && toAmount == null) throw new Error('toAmount is required when the currencies differ');
  const credit = toAmount ?? amount;
  if (!Number.isInteger(credit) || credit <= 0) throw new Error('toAmount must be a positive integer');
  if (!cross && credit !== amount) throw new Error('toAmount must equal amount for the same currency');
  const linkId = globalThis.crypto.randomUUID();
  const categoryId = cross ? categories.conversion : categories.transfer;
  const leg = (fund, direction, amt, other, otherAmt) => ({
    date, fundId: fund.id, direction, amount: amt, currency: fund.currency, categoryId, comment, linkId,
    fxAmount: cross ? otherAmt : null, fxCurrency: cross ? other.currency : null
  });
  return [leg(fromFund, 'dr', amount, toFund, credit), leg(toFund, 'cr', credit, fromFund, amount)];
};

// yearCloses: array of years (numbers) or rows { year }.
const isYearClosed = (yearCloses, date) => {
  const year = Number(String(date).slice(0, 4));
  return (yearCloses || []).some(y => Number(typeof y === 'object' ? y.year : y) === year);
};

module.exports = { balance, summary, opening, totals, makeTransfer, isYearClosed };
