const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { makeContext, withCookie, BOOK } = require('./helpers');
const { createAccountStore } = require('../../server/auth/accounts');

const PASS = 'currency test account passphrase';

describe('currencies', () => {
  let ctx; let plain;

  before(async () => {
    ctx = await makeContext();
    await createAccountStore(ctx.repo.authStore).create({ email: 'plain@example.com', name: 'plain', password: PASS, isSuperAdmin: false });
    const { sid } = await ctx.auth.login('plain@example.com', PASS);
    plain = withCookie(ctx.app, `lsid=${sid}`);
  });
  after(async () => { await ctx.close(); });

  const off = async code => ctx.api.put(`/api/currencies/${code}`).send({ active: false }).expect(200);
  const on = async code => ctx.api.put(`/api/currencies/${code}`).send({ active: true }).expect(200);

  it('lists the standard currencies for any signed-in account, sorted', async () => {
    const res = await plain.get('/api/currencies').expect(200);
    const codes = res.body.map(c => c.code);
    assert.ok(codes.includes('PKR') && codes.includes('SEK') && codes.includes('SGD'));
    assert.deepEqual(codes, [...codes].sort());
    assert.deepEqual(Object.keys(res.body[0]).sort(), ['active', 'alias', 'code', 'name']);
    assert.equal(res.body[0].active, true);
  });

  it('refuses a signed-out reader', async () => {
    await ctx.anonymous.get('/api/currencies').expect(401);
  });

  it('refuses writes from a non super administrator', async () => {
    await plain.post('/api/currencies').send({ code: 'ZAR', name: 'Rand' }).expect(403);
    await plain.put('/api/currencies/USD').send({ name: 'x' }).expect(403);
    await plain.delete('/api/currencies/USD').expect(403);
  });

  it('seeds codes already in use when the migration runs', async () => {
    const sql = require('fs').readFileSync(require('path').join(__dirname, '../../migrations/0014_currencies.sql'), 'utf8');
    const apply = async () => {
      const statements = sql.replace(/^--.*$/gm, '').split(';').map(x => x.trim()).filter(Boolean);
      for (const st of statements) await ctx.d1.prepare(st).run();
    };
    await ctx.d1.prepare('DROP TABLE currencies').run();
    await ctx.d1.prepare("INSERT INTO holders (id, book_id, name, currency, kind, active) VALUES ('h-zar', ?, 'Zar', 'ZAR', 'cash', 1)").bind(BOOK).run();
    await apply();
    const rows = (await ctx.api.get('/api/currencies').expect(200)).body;
    const zar = rows.find(c => c.code === 'ZAR');
    assert.deepEqual(zar, { code: 'ZAR', name: 'ZAR', alias: null, active: true });
    assert.equal(rows.length, 23);
    // idempotent
    await apply();
    assert.equal((await ctx.api.get('/api/currencies').expect(200)).body.length, 23);
    await ctx.d1.prepare("DELETE FROM holders WHERE id = 'h-zar'").run();
  });

  it('creates, rejects duplicates and bad codes', async () => {
    const res = await ctx.api.post('/api/currencies').send({ code: 'thb', name: ' Thai baht ', alias: ' ฿ ' }).expect(201);
    assert.deepEqual(res.body, { code: 'THB', name: 'Thai baht', alias: '฿', active: true });
    await ctx.api.post('/api/currencies').send({ code: 'THB', name: 'Again' }).expect(409);
    await ctx.api.post('/api/currencies').send({ code: 'TH', name: 'x' }).expect(400);
    await ctx.api.post('/api/currencies').send({ code: 'THB1', name: 'x' }).expect(400);
    await ctx.api.post('/api/currencies').send({ code: 'XXX', name: '' }).expect(400);
    await ctx.api.post('/api/currencies').send({ code: 'XXX', name: 'x', alias: '123456789' }).expect(400);
  });

  it('updates name, alias and active; clears the alias', async () => {
    let res = await ctx.api.put('/api/currencies/SEK').send({ name: 'Krona', alias: 'kr' }).expect(200);
    assert.equal(res.body.name, 'Krona');
    assert.equal(res.body.alias, 'kr');
    res = await ctx.api.put('/api/currencies/SEK').send({ alias: '' }).expect(200);
    assert.equal(res.body.alias, null);
    await ctx.api.put('/api/currencies/SEK').send({ alias: 'kr' }).expect(200);
    res = await ctx.api.put('/api/currencies/SEK').send({ alias: null }).expect(200);
    assert.equal(res.body.alias, null);
    res = await off('SEK');
    assert.equal(res.body.active, false);
    await on('SEK');
    await ctx.api.put('/api/currencies/SEK').send({ code: 'XXX' }).expect(400);
    await ctx.api.put('/api/currencies/QQQ').send({ name: 'x' }).expect(404);
  });

  it('deletes an unused currency and refuses one in use', async () => {
    await ctx.api.post('/api/currencies').send({ code: 'ISK', name: 'Icelandic krona' }).expect(201);
    await ctx.api.delete('/api/currencies/ISK').expect(200);
    await ctx.api.delete('/api/currencies/ISK').expect(404);

    // base currency of the seeded books (PKR) is in use
    const res = await ctx.api.delete('/api/currencies/PKR').expect(409);
    assert.ok(res.body.usage.books >= 1);

    await ctx.api.post('/api/currencies').send({ code: 'NZD', name: 'NZ dollar' }).expect(201);
    const fund = (await ctx.api.post(`/api/books/${BOOK}/funds`).send({ name: 'NZ fund', currency: 'NZD' }).expect(201)).body;
    assert.equal((await ctx.api.delete('/api/currencies/NZD').expect(409)).body.usage.funds, 1);
    await ctx.d1.prepare('DELETE FROM funds WHERE id = ?').bind(fund.id).run();
    await ctx.api.delete('/api/currencies/NZD').expect(200);

    await ctx.api.post('/api/currencies').send({ code: 'HKD', name: 'HK dollar' }).expect(201);
    const reg = (await ctx.api.post('/api/loans').send({ name: 'L', borrower: 'a', lender: 'b', currency: 'HKD' }).expect(201)).body;
    assert.equal((await ctx.api.delete('/api/currencies/HKD').expect(409)).body.usage.loans, 1);
    await ctx.api.delete(`/api/loans/${reg.id}`).expect(200);
    await ctx.api.delete('/api/currencies/HKD').expect(200);

    await ctx.api.post('/api/currencies').send({ code: 'CZK', name: 'Koruna' }).expect(201);
    const f = (await ctx.api.post(`/api/books/${BOOK}/funds`).send({ name: 'PK fund', currency: 'PKR' }).expect(201)).body;
    const now = new Date().toISOString();
    await ctx.d1.prepare(
      "INSERT INTO entries (id, book_id, date, fund_id, direction, amount, currency, fx_currency, created_by, created_at, updated_at) VALUES ('e-fx', ?, '2026-01-01', ?, 'cr', 100, 'PKR', 'CZK', 't', ?, ?)"
    ).bind(BOOK, f.id, now, now).run();
    assert.equal((await ctx.api.delete('/api/currencies/CZK').expect(409)).body.usage.entries, 1);
    await ctx.d1.prepare("DELETE FROM entries WHERE id = 'e-fx'").run();
    await ctx.api.delete('/api/currencies/CZK').expect(200);
  });

  describe('create and change endpoints', () => {
    before(async () => {
      await ctx.api.post('/api/currencies').send({ code: 'EGP', name: 'Egyptian pound' }).expect(201);
    });
    const bad = /Unknown or disabled currency/;

    it('books', async () => {
      let res = await ctx.api.post('/api/books').send({ name: 'Zed', baseCurrency: 'QQQ' }).expect(400);
      assert.match(res.body.error, bad);
      await ctx.api.post('/api/books').send({ name: 'Egypt', baseCurrency: 'EGP' }).expect(201);
      await off('EGP');
      res = await ctx.api.post('/api/books').send({ name: 'Egypt2', baseCurrency: 'EGP' }).expect(400);
      assert.match(res.body.error, bad);
      // unchanged old code stays editable, a new unknown one does not
      await ctx.api.put('/api/books/egypt').send({ name: 'Egypt renamed', baseCurrency: 'EGP' }).expect(200);
      await ctx.api.put(`/api/books/${BOOK}`).send({ baseCurrency: 'QQQ' }).expect(400);
      await ctx.api.put(`/api/books/${BOOK}`).send({ baseCurrency: 'EGP' }).expect(400);
      await on('EGP');
    });

    for (const path of ['funds', 'holders']) {
      it(path, async () => {
        const url = `/api/books/${BOOK}/${path}`;
        const make = over => ({ name: `${path} ${Math.random()}`, kind: path === 'holders' ? 'bank' : 'general', ...over });
        let res = await ctx.api.post(url).send(make({ currency: 'QQQ' })).expect(400);
        assert.match(res.body.error, bad);
        const row = (await ctx.api.post(url).send(make({ currency: 'EGP' })).expect(201)).body;
        await off('EGP');
        await ctx.api.post(url).send(make({ currency: 'EGP' })).expect(400);
        await ctx.api.post(url).send(make()).expect(201);
        await ctx.api.put(`${url}/${row.id}`).send({ name: 'renamed', currency: 'EGP' }).expect(200);
        await ctx.api.put(`${url}/${row.id}`).send({ currency: 'QQQ' }).expect(400);
        await ctx.api.put(`${url}/${row.id}`).send({ currency: 'USD' }).expect(200);
        await ctx.api.put(`${url}/${row.id}`).send({ currency: 'EGP' }).expect(400);
        await on('EGP');
      });
    }

    it('loan registers', async () => {
      let res = await ctx.api.post('/api/loans').send({ name: 'x', borrower: 'a', lender: 'b', currency: 'QQQ' }).expect(400);
      assert.match(res.body.error, bad);
      const reg = (await ctx.api.post('/api/loans').send({ name: 'eg', borrower: 'a', lender: 'b', currency: 'EGP' }).expect(201)).body;
      await off('EGP');
      await ctx.api.post('/api/loans').send({ name: 'x', borrower: 'a', lender: 'b', currency: 'EGP' }).expect(400);
      await ctx.api.put(`/api/loans/${reg.id}`).send({ name: 'eg2', currency: 'EGP' }).expect(200);
      res = await ctx.api.put(`/api/loans/${reg.id}`).send({ currency: 'QQQ' }).expect(400);
      assert.match(res.body.error, bad);
      await on('EGP');
    });

    it('filters and reads never validate the currency', async () => {
      await ctx.api.get(`/api/books/${BOOK}/entries?currency=QQQ`).expect(200);
      await request(ctx.app).get('/api/currencies').expect(401);
    });
  });
});
