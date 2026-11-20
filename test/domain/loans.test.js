const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { loanTotals } = require('../../server/domain/loans');

describe('loanTotals', () => {
  it('sums taken and returned in minor units', () => {
    assert.deepEqual(loanTotals([{ kind: 'taken', amount: 1000 }, { kind: 'taken', amount: 500 }, { kind: 'returned', amount: 400 }]),
      { taken: 1500, returned: 400, balance: 1100, count: 3 });
  });
  it('lets the balance go negative and ignores deleted rows', () => {
    const t = loanTotals([{ kind: 'taken', amount: 100 }, { kind: 'returned', amount: 250 }, { kind: 'taken', amount: 999, deletedAt: 'x' }]);
    assert.deepEqual(t, { taken: 100, returned: 250, balance: -150, count: 2 });
  });
  it('is zero for no rows', () => {
    assert.deepEqual(loanTotals([]), { taken: 0, returned: 0, balance: 0, count: 0 });
  });
});
