const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { entryTotal } = require('../../server/domain/entryPricing');
const helpers = import('../../src/utils/entryQuantityPrice.mjs');

describe('quantity and unit price input helpers', () => {
  it('matches server totals and half-up rounding across supported quantities', async () => {
    const { validateQuantityPriceInputs } = await helpers;
    for (const [quantity, unitPrice, expected] of [
      ['10', '50', 50000], ['2', '50', 10000], ['1.005', '1', 101],
      ['0.125', '1', 13], ['0.001', '5', 1], ['1000000000', '100', 1e13],
      ['2.5', '12.34', 3085], ['999999999.999', '0.01', 1000000000]
    ]) {
      const parsed = validateQuantityPriceInputs(quantity, unitPrice);
      assert.equal(parsed.error, undefined);
      assert.equal(parsed.amount, expected);
      assert.equal(parsed.amount, entryTotal(parsed.quantity, parsed.unitPrice));
    }
  });

  it('rejects invalid quantities, prices and out-of-range totals', async () => {
    const { validateQuantityPriceInputs, parseQuantityInput, parseQuantityNumber } = await helpers;
    for (const quantity of ['', '0', '-1', '1.2345', '1e3', '1000000001', '1,50']) {
      assert.equal(parseQuantityInput(quantity), null);
      assert.ok(validateQuantityPriceInputs(quantity, '50').error);
    }
    assert.equal(parseQuantityNumber(0.1 + 0.2), null);
    for (const price of ['', '0', '-1', '1.234', '100000000000.01', '1,50']) {
      assert.ok(validateQuantityPriceInputs('1', price).error);
    }
    assert.ok(validateQuantityPriceInputs('0.001', '0.01').error);
    assert.ok(validateQuantityPriceInputs('2', '100000000000').error);
    assert.equal(validateQuantityPriceInputs('1,000.5', '1,000.50').amount, 100100025);
  });

  it('initializes new and legacy entries without rewriting their total', async () => {
    const { quantityPriceFromEntry } = await helpers;
    const fresh = quantityPriceFromEntry();
    assert.equal(fresh.quantityText, '1');
    assert.equal(fresh.unitPriceText, '');
    const legacy = quantityPriceFromEntry({ amount: 12345 });
    assert.equal(legacy.quantity, 1);
    assert.equal(legacy.unitPriceText, '123.45');
    assert.equal(legacy.amount, 12345);
    const priced = quantityPriceFromEntry({ quantity: 10, unitPrice: 5000, amount: 50000 });
    assert.equal(priced.quantityText, '10');
    assert.equal(priced.unitPriceText, '50');
    assert.equal(priced.amount, 50000);
  });
});
