const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { entryTotal, entryPricing } = require('../../server/domain/entryPricing');

describe('entry pricing', () => {
  it('calculates quantities in integer minor units with half-up rounding', () => {
    assert.equal(entryTotal(10, 5000), 50000);
    assert.equal(entryTotal(2, 5000), 10000);
    assert.equal(entryTotal(1.005, 100), 101);
    assert.equal(entryTotal(0.125, 100), 13);
    assert.equal(entryTotal(0.001, 500), 1);
    assert.equal(entryTotal(1e9, 10000), 1e13);
  });

  it('rejects invalid quantities, prices, zero totals and overflow', () => {
    for (const q of [0, -1, 0.0001, 1.2345, 1e9 + 1, NaN, Infinity, '2', null]) {
      assert.throws(() => entryTotal(q, 100), /quantity/);
    }
    for (const p of [0, -1, 1.5, 1e13 + 1, NaN, Infinity, '100', null]) {
      assert.throws(() => entryTotal(1, p), /unitPrice/);
    }
    assert.throws(() => entryTotal(0.001, 1), /Calculated amount/);
    assert.throws(() => entryTotal(2, 1e13), /Calculated amount/);
  });

  it('preserves amount-only clients and derives totals for partial price edits', () => {
    assert.deepEqual(entryPricing({ amount: 500 }), { quantity: 1, unitPrice: 500, amount: 500 });
    const old = { quantity: 10, unit_price: 5000, amount: 50000 };
    assert.deepEqual(entryPricing({ quantity: 2 }, old), { quantity: 2, unitPrice: 5000, amount: 10000 });
    assert.deepEqual(entryPricing({ unitPrice: 6000 }, old), { quantity: 10, unitPrice: 6000, amount: 60000 });
    assert.deepEqual(entryPricing({ comment: 'x' }, old), { quantity: 10, unitPrice: 5000, amount: 50000 });
    assert.deepEqual(entryPricing({ amount: 900 }, { quantity: 1, unit_price: 500, amount: 500 }),
      { quantity: 1, unitPrice: 900, amount: 900 });
    assert.deepEqual(entryPricing({ comment: 'legacy' }, { amount: 500 }),
      { quantity: 1, unitPrice: 500, amount: 500 });
    assert.throws(() => entryPricing({ amount: 900 }, old), /amount must equal/);
    assert.throws(() => entryPricing({ quantity: 2, unitPrice: 500, amount: 500 }), /amount must equal/);
    assert.throws(() => entryPricing({}), /unitPrice/);
  });
});
