const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { balance, summary, opening, totals, makeTransfer, isYearClosed } = require('../../server/domain');

const funds = [
  { id: 'checking', name: 'Checking', currency: 'PKR', kind: 'general', isReserved: false },
  { id: 'special', name: 'Special', currency: 'PKR', kind: 'reserved', isReserved: true },
  { id: 'savings', name: 'Savings', currency: 'PKR', kind: 'reserved', isReserved: true },
  { id: 'emergency', name: 'Emergency', currency: 'PKR', kind: 'reserved', isReserved: true },
  { id: 'usd', name: 'USD Wallet', currency: 'USD', kind: 'general', isReserved: false }
];
const e = (date, fundId, direction, rupees, extra = {}) => ({ date, fundId, direction, amount: rupees * 100, ...extra });
const entries = [
  e('2025-12-31', 'checking', 'cr', 5324.18), e('2025-12-31', 'special', 'cr', 14500.43), e('2025-12-31', 'savings', 'cr', 12170.72),
  e('2026-01-03', 'special', 'cr', 64.77), e('2026-01-03', 'savings', 'cr', 67.96),
  e('2026-01-05', 'emergency', 'cr', 2500),
  e('2026-01-12', 'savings', 'dr', 12238.68), e('2026-01-12', 'special', 'cr', 12238.68),
  e('2026-01-02', 'checking', 'dr', 700),
  e('2026-06-26', 'usd', 'cr', 25),
  e('2026-02-01', 'checking', 'dr', 999.99, { exclude: 1 })
].map(x => ({ ...x, amount: Math.round(x.amount) }));

describe('domain rules', () => {
  it('computes the fixture balances, total and usable', () => {
    const s = summary(funds, entries, 'PKR');
    const by = Object.fromEntries(s.funds.map(f => [f.name, f.balance]));
    assert.equal(by.Savings, 0);
    assert.equal(by.Special, 2680388);
    assert.equal(by.Checking, 462418);
    assert.equal(by.Emergency, 250000);
    assert.equal(by['USD Wallet'], 2500);
    assert.equal(s.total, 3392806);
    assert.equal(s.usable, 462418);
    assert.equal(s.funds.length, 5);
  });

  it('memo funds are listed but never counted in total or usable', () => {
    const memo = { id: 'memo1', name: 'Memo: RAHAT', currency: 'PKR', kind: 'memo', isReserved: false };
    const s = summary([...funds, memo], [...entries, e('2026-03-01', 'memo1', 'cr', 99999)], 'PKR');
    const m = s.funds.find(f => f.id === 'memo1');
    assert.equal(m.kind, 'memo');
    assert.equal(m.balance, 9999900);
    assert.equal(s.total, 3392806);
    assert.equal(s.usable, 462418);
  });

  it('opening balance is the balance at the end of the previous year', () => {
    assert.equal(opening(entries, 'special', 2026), 1450043);
    assert.equal(opening(entries, 'special', 2025), 0);
  });

  it('balance respects asOf, exclude and deleted rows', () => {
    assert.equal(balance(entries, 'checking', '2026-01-01'), 532418);
    assert.equal(balance([...entries, { ...e('2026-01-04', 'checking', 'cr', 1), deletedAt: 'x' }], 'checking'), 462418);
  });

  it('totals gives cr, dr and net, skipping excluded rows', () => {
    const t = totals(entries.filter(x => x.fundId === 'checking'));
    assert.deepEqual(t, { cr: 532418, dr: 70000, net: 462418 });
  });

  it('makeTransfer pairs two legs', () => {
    const [dr, cr] = makeTransfer({ date: '2026-01-12', fromFund: funds[2], toFund: funds[1], amount: 500 });
    assert.equal(dr.direction, 'dr'); assert.equal(dr.fundId, 'savings');
    assert.equal(cr.direction, 'cr'); assert.equal(cr.fundId, 'special');
    assert.equal(dr.linkId, cr.linkId); assert.ok(dr.linkId);
    assert.equal(cr.amount, 500); assert.equal(dr.categoryId, 'cat_transfer');
  });

  it('makeTransfer validates funds and cross-currency amounts', () => {
    assert.throws(() => makeTransfer({ date: 'd', fromFund: funds[0], toFund: funds[0], amount: 1 }));
    assert.throws(() => makeTransfer({ date: 'd', fromFund: funds[0], toFund: funds[4], amount: 1000 }));
    const [dr, cr] = makeTransfer({ date: 'd', fromFund: funds[0], toFund: funds[4], amount: 28000, toAmount: 100 });
    assert.equal(dr.amount, 28000); assert.equal(cr.amount, 100);
    assert.equal(cr.currency, 'USD'); assert.equal(cr.categoryId, 'cat_conversion');
  });

  it('isYearClosed matches by year', () => {
    assert.equal(isYearClosed([2024, { year: 2025 }], '2025-03-04'), true);
    assert.equal(isYearClosed([2024], '2025-03-04'), false);
    assert.equal(isYearClosed([], '2025-03-04'), false);
  });
});
