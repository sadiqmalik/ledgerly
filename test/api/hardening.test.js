const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { makeContext, makeFakeR2, BOOK } = require('./helpers');
const { createAccountStore, LOCK_AFTER_FAILURES } = require('../../server/auth/accounts');
const { entriesCsv } = require('../../server/csv');
const { runNightly } = require('../../server/backup');

const U = `/api/books/${BOOK}`;

describe('backend hardening', () => {
  let ctx;
  beforeEach(async () => {
    ctx = await makeContext();
    const d = ctx.d1;
    const fund = (id, cur, archived = 0) => d.prepare('INSERT INTO funds (id, book_id, name, is_reserved, currency, kind, archived) VALUES (?,?,?,?,?,?,?)').bind(id, BOOK, id, 0, cur, 'general', archived);
    const cat = (id, name) => d.prepare('INSERT INTO categories (id, book_id, name, default_direction) VALUES (?,?,?,?)').bind(id, BOOK, name, 'dr');
    await d.batch([fund('a', 'PKR'), fund('b', 'PKR'), fund('old', 'PKR', 1),
      cat('cat_transfer', 'Transfer'), cat('cat_conversion', 'Conversion'), cat('cat_opening', 'Opening'),
      cat('c1', 'Food'), cat('c2', 'Gift'), cat('c3', 'Misc')]);
  });
  afterEach(async () => { await ctx.close(); });
  const post = body => ctx.api.post(`${U}/entries`).send(body);
  const entry = x => ({ date: '2026-01-10', fundId: 'a', direction: 'dr', amount: 1000, ...x });

  it('1: parallel wrong passwords all count and lock the account', async () => {
    const store = createAccountStore(ctx.repo.authStore);
    await store.create({ email: 'p@example.com', name: 'P', password: 'a long passphrase here' });
    await Promise.all(Array.from({ length: LOCK_AFTER_FAILURES }, () => store.authenticate('p@example.com', 'wrong-wrong-wrong').catch(() => {})));
    const row = await ctx.d1.prepare("SELECT failed_logins, locked_until FROM accounts WHERE email = 'p@example.com'").first();
    assert.equal(row.failed_logins, LOCK_AFTER_FAILURES);
    assert.ok(new Date(row.locked_until) > new Date());
    assert.equal((await store.authenticate('p@example.com', 'a long passphrase here').catch(e => e)).status, 429);
  });

  it('2: archived funds are refused for entries, fund changes and transfers', async () => {
    const r = await post(entry({ fundId: 'old' }));
    assert.equal(r.status, 409);
    assert.equal(r.body.error, 'Fund is archived');
    const ok = await post(entry());
    assert.equal(ok.status, 201);
    assert.equal((await ctx.api.put(`${U}/entries/${ok.body.id}`).send({ fundId: 'old' })).status, 409);
    assert.equal((await ctx.api.put(`${U}/entries/${ok.body.id}`).send({ amount: 5 })).status, 200);
    const t = await ctx.api.post(`${U}/transfers`).send({ date: '2026-01-10', fromFundId: 'a', toFundId: 'old', amount: 10 });
    assert.equal(t.status, 409);
  });

  it('3: amounts and paging are bounded', async () => {
    assert.equal((await post(entry({ amount: 1e13 }))).status, 201);
    assert.equal((await post(entry({ amount: 1e13 + 1 }))).status, 400);
    assert.equal((await post(entry({ amount: 2 ** 60 }))).status, 400);
    assert.equal((await ctx.api.get(`${U}/entries?max=20000000000000`)).status, 400);
    assert.equal((await ctx.api.get(`${U}/entries?page=100001`)).status, 400);
    assert.equal((await ctx.api.get(`${U}/entries?page=100000`)).status, 200);
    assert.equal((await ctx.api.post(`${U}/projects`).send({ name: 'P', kind: 'trip', fundId: null, budget: 1e13 + 1 })).status, 400);
  });

  it('4: funds and holders default to the book base currency', async () => {
    await ctx.d1.prepare("UPDATE books SET base_currency = 'GBP' WHERE id = ?").bind(BOOK).run();
    assert.equal((await ctx.api.post(`${U}/funds`).send({ name: 'F' })).body.currency, 'GBP');
    assert.equal((await ctx.api.post(`${U}/holders`).send({ name: 'H', kind: 'bank' })).body.currency, 'GBP');
    assert.equal((await ctx.api.post(`${U}/funds`).send({ name: 'F2', currency: 'usd' })).body.currency, 'USD');
  });

  it('5: CSV text cells are neutralised, the amount column is not', () => {
    const csv = entriesCsv([{ date: '2026-01-01', fund: '=cmd', direction: 'dr', amount: 100, currency: 'PKR', party: '@x', category: '-1', project: '+1', comment: '\tz', rate: null, status: 'paid', paid_date: null, exclude: 0 }]);
    assert.match(csv, /2026-01-01,'=cmd,dr,1\.00,PKR,'@x,'-1,'\+1,'\tz,/);
  });

  it('6: dates outside 1900-2100 are rejected', async () => {
    assert.equal((await post(entry({ date: '1899-12-31' }))).status, 400);
    assert.equal((await post(entry({ date: '2101-01-01' }))).status, 400);
    assert.equal((await post(entry({ date: '2100-12-31' }))).status, 201);
  });

  it('7: closing is null with a note for gaps and row filters, shown otherwise', async () => {
    await post(entry({ date: '2024-05-01', direction: 'cr', amount: 5000 }));
    const get = async q => (await ctx.api.get(`${U}/entries?opening=1&${q}`)).body;
    const gap = await get('year=2026,2024');
    assert.equal(gap.totals.closing, null);
    assert.match(gap.totals.closingNote, /^Closing not shown: /);
    assert.equal(gap.totals.opening, 0);
    assert.equal(gap.totalsByCurrency.PKR.closing, null);
    const gapFrom = await get('year=2026,2024&from=2026-01-01');
    assert.equal(gapFrom.totals.closing, 5000 + gapFrom.totals.net);
    const filtered = await get('year=2026&status=paid');
    assert.equal(filtered.totals.closing, null);
    assert.ok(Array.isArray(filtered.openings));
    const fine = await get('year=2024,2025,2026');
    assert.equal(fine.totals.closingNote, undefined);
    assert.equal(fine.totals.closing, fine.totals.opening + fine.totals.net);
  });

  it('8: comma lists over 50 values are rejected, project totals work with many projects', async () => {
    const ids = Array.from({ length: 51 }, (_, i) => `f${i}`).join(',');
    assert.equal((await ctx.api.get(`${U}/entries?fund=${ids}`)).status, 400);
    assert.equal((await ctx.api.get(`${U}/entries?fund=${ids.split(',').slice(0, 50).join(',')}`)).status, 200);
    const stmts = Array.from({ length: 150 }, (_, i) => ctx.d1.prepare("INSERT INTO projects (id, book_id, name, kind) VALUES (?, ?, ?, 'trip')").bind(`pr${i}`, BOOK, `P${i}`));
    await ctx.d1.batch(stmts);
    const res = await ctx.api.get(`${U}/projects`);
    assert.equal(res.status, 200);
    assert.equal(res.body.length, 150);
  });

  it('9: soft-deleted entries do not block deleting a category or project', async () => {
    const p = await ctx.api.post(`${U}/projects`).send({ name: 'Trip', kind: 'trip', fundId: null });
    const e = await post(entry({ categoryId: 'c3', projectId: p.body.id }));
    assert.equal((await ctx.api.delete(`${U}/categories/c3`)).status, 409);
    assert.equal((await ctx.api.delete(`${U}/projects/${p.body.id}`)).status, 409);
    assert.equal((await ctx.api.delete(`${U}/entries/${e.body.id}`)).status, 200);
    assert.equal((await ctx.api.delete(`${U}/categories/c3`)).status, 200);
    assert.equal((await ctx.api.delete(`${U}/projects/${p.body.id}`)).status, 200);
  });

  it('10: system categories are protected and parent cycles refused', async () => {
    for (const id of ['cat_transfer', 'cat_conversion', 'cat_opening']) {
      const del = await ctx.api.delete(`${U}/categories/${id}`);
      assert.equal(del.status, 409);
      assert.equal(del.body.error, 'System category');
      assert.equal((await ctx.api.put(`${U}/categories/${id}`).send({ name: 'Other name' })).status, 409);
    }
    assert.equal((await ctx.api.put(`${U}/categories/c1`).send({ name: 'Groceries' })).status, 200);
    assert.equal((await ctx.api.put(`${U}/categories/c2`).send({ parentId: 'c1' })).status, 200);
    assert.equal((await ctx.api.put(`${U}/categories/c3`).send({ parentId: 'c2' })).status, 200);
    assert.equal((await ctx.api.put(`${U}/categories/c1`).send({ parentId: 'c3' })).status, 400);
  });

  it('11: the nightly job skips a book whose export is null', async () => {
    const bucket = makeFakeR2();
    const repo = { listBooks: async () => [{ id: 'gone' }, { id: 'here' }], exportRepo: { exportBook: async id => (id === 'gone' ? null : { x: 1 }) },
      authStore: { purgeExpiredSessions: async () => 0 } };
    const out = await runNightly({ repo, bucket, now: new Date('2026-04-05T02:00:00Z'), log: () => {} });
    assert.equal(out.backedUp, 1);
    assert.ok(!bucket.store.has('backups/gone/2026-04-05.json'));
    assert.ok(bucket.store.has('backups/here/2026-04-05.json'));
  });
});
