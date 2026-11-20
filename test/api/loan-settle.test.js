const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { makeContext } = require('./helpers');

describe('loan settled status', () => {
  let ctx; let reg;
  before(async () => {
    ctx = await makeContext();
    reg = (await ctx.api.post('/api/loans').send({ name: 'Car', borrower: 'Ali', lender: 'Bilal' }).expect(201)).body;
  });
  after(async () => { await ctx.close(); });

  it('starts active', () => {
    assert.equal(reg.settled, false);
    assert.equal(reg.settledAt, null);
  });

  it('refuses to settle while a balance remains', async () => {
    const e = (await ctx.api.post(`/api/loans/${reg.id}/entries`).send({ kind: 'taken', amount: 1000, date: '2026-03-01' }).expect(201)).body;
    const res = await ctx.api.put(`/api/loans/${reg.id}`).send({ settled: true });
    assert.equal(res.status, 409);
    await ctx.api.post(`/api/loans/${reg.id}/entries`).send({ kind: 'returned', amount: 1000, date: '2026-03-02' }).expect(201);
    assert.ok(e.id);
  });

  it('settles at zero balance, then makes entries read only', async () => {
    const done = (await ctx.api.put(`/api/loans/${reg.id}`).send({ settled: true }).expect(200)).body;
    assert.equal(done.settled, true);
    assert.ok(done.settledAt);
    const listed = (await ctx.api.get('/api/loans').expect(200)).body.find(r => r.id === reg.id);
    assert.equal(listed.settled, true);
    assert.equal((await ctx.api.post(`/api/loans/${reg.id}/entries`).send({ kind: 'taken', amount: 5, date: '2026-03-03' })).status, 409);
    const rows = (await ctx.api.get(`/api/loans/${reg.id}/entries`).expect(200)).body.rows;
    assert.equal((await ctx.api.put(`/api/loans/${reg.id}/entries/${rows[0].id}`).send({ comment: 'x' })).status, 409);
    assert.equal((await ctx.api.delete(`/api/loans/${reg.id}/entries/${rows[0].id}`)).status, 409);
    assert.equal((await ctx.api.get(`/api/loans/${reg.id}/entries`)).status, 200);
  });

  it('reopens and accepts entries again', async () => {
    const open = (await ctx.api.put(`/api/loans/${reg.id}`).send({ settled: false }).expect(200)).body;
    assert.equal(open.settled, false);
    assert.equal(open.settledAt, null);
    await ctx.api.post(`/api/loans/${reg.id}/entries`).send({ kind: 'taken', amount: 5, date: '2026-03-03' }).expect(201);
  });
});
