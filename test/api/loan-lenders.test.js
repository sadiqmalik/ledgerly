const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { makeContext } = require('./helpers');
const { lenderTotals } = require('../../server/domain/loans');

describe('loan lenders (per-person totals)', () => {
  let ctx; let reg;
  before(async () => {
    ctx = await makeContext();
    reg = (await ctx.api.post('/api/loans').send({ name: 'House', borrower: 'Jordan', lender: 'Sam & Alex' }).expect(201)).body;
  });
  after(async () => { await ctx.close(); });
  const add = body => ctx.api.post(`/api/loans/${reg.id}/entries`).send({ date: '2026-04-01', ...body });

  it('groups totals by lender, with a not-assigned row', async () => {
    await add({ kind: 'taken', amount: 200000000, lender: 'Sam' }).expect(201);
    await add({ kind: 'taken', amount: 100000000, lender: 'alex' }).expect(201);
    await add({ kind: 'returned', amount: 50000000, lender: 'Sam' }).expect(201);
    await add({ kind: 'taken', amount: 100, comment: 'old style, no lender' }).expect(201);
    const res = (await ctx.api.get(`/api/loans/${reg.id}/entries`).expect(200)).body;
    const by = Object.fromEntries(res.byLender.map(l => [l.lender, l]));
    assert.deepEqual([by.Sam.taken, by.Sam.returned, by.Sam.balance], [200000000, 50000000, 150000000]);
    assert.deepEqual([by.Alex.taken, by.Alex.returned, by.Alex.balance], [100000000, 0, 100000000]);
    assert.equal(by.null.taken, 100);
    assert.equal(res.byLender[res.byLender.length - 1].lender, null);
  });

  it('keeps per-lender totals when the list is filtered', async () => {
    const res = (await ctx.api.get(`/api/loans/${reg.id}/entries?kind=returned`).expect(200)).body;
    assert.equal(res.rows.length, 1);
    assert.equal(res.byLender.find(l => l.lender === 'Alex').taken, 100000000);
  });

  it('rejects a lender that is not on the register, and clears one with null', async () => {
    assert.equal((await add({ kind: 'taken', amount: 5, lender: 'Stranger' })).status, 400);
    const e = (await add({ kind: 'taken', amount: 7, lender: 'Sam' }).expect(201)).body;
    const cleared = (await ctx.api.put(`/api/loans/${reg.id}/entries/${e.id}`).send({ lender: null }).expect(200)).body;
    assert.equal(cleared.lender, null);
    assert.equal((await ctx.api.put(`/api/loans/${reg.id}/entries/${e.id}`).send({ lender: 'Nope' })).status, 400);
  });

  it('computes totals in the domain helper', () => {
    const t = lenderTotals([
      { kind: 'taken', amount: 10, lender: 'B' }, { kind: 'returned', amount: 15, lender: 'B' },
      { kind: 'taken', amount: 5, lender: null }, { kind: 'taken', amount: 99, lender: 'A', deletedAt: 'x' }
    ]);
    assert.deepEqual(t.map(x => x.lender), ['B', null]);
    assert.equal(t[0].balance, -5);
  });
});
