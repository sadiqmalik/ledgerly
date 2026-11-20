const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { makeContext, withCookie, BOOK } = require('./helpers');
const { createAccountStore } = require('../../server/auth/accounts');

const U = `/api/books/${BOOK}`;
const PW = 'a long passphrase here';

describe('projects, reports and years API', () => {
  let ctx; let editor; let viewer;
  const seed = async d1 => {
    const f = (id, name, cur, kind) => d1.prepare('INSERT INTO funds (id, book_id, name, is_reserved, currency, kind) VALUES (?,?,?,0,?,?)').bind(id, BOOK, name, cur, kind);
    const cat = (id, name) => d1.prepare('INSERT INTO categories (id, book_id, name, default_direction) VALUES (?,?,?,?)').bind(id, BOOK, name, 'dr');
    await d1.batch([
      f('checking', 'Checking', 'PKR', 'general'), f('special', 'Special', 'PKR', 'reserved'), f('memo1', 'Memo One', 'PKR', 'memo'),
      f('usd', 'USD Wallet', 'USD', 'general'),
      cat('cat_transfer', 'Transfer'), cat('cat_conversion', 'Conversion'), cat('cat_food', 'Food'), cat('cat_travel', 'Travel'), cat('cat_profit', 'Profit')
    ]);
  };
  const entry = (extra = {}) => ({ date: '2025-03-01', fundId: 'checking', direction: 'dr', amount: 1000, ...extra });
  const add = async (body, who = ctx.api) => {
    const r = await who.post(`${U}/entries`).send(entry(body));
    assert.equal(r.status, 201, JSON.stringify(r.body));
    return r.body;
  };

  beforeEach(async () => {
    ctx = await makeContext();
    await seed(ctx.d1);
    const store = createAccountStore(ctx.repo.authStore);
    for (const role of ['viewer', 'editor']) {
      await store.create({ email: `${role}@example.com`, name: role, password: PW, memberships: [{ bookId: BOOK, role }] });
    }
    const login = async e => withCookie(ctx.app, `lsid=${(await ctx.auth.login(e, PW)).sid}`);
    viewer = await login('viewer@example.com');
    editor = await login('editor@example.com');
  });
  afterEach(async () => { await ctx.close(); });

  it('projects: CRUD, totals, metaKeys, delete guard and roles', async () => {
    assert.equal((await viewer.post(`${U}/projects`).send({ name: 'Trip', kind: 'trip', fundId: 'checking' })).status, 403);
    assert.equal((await editor.post(`${U}/projects`).send({ name: 'Trip', kind: 'trip', fundId: 'nope' })).status, 404);
    const created = await editor.post(`${U}/projects`).send({ name: 'Trip', kind: 'trip', fundId: 'checking', budget: 50000 });
    assert.equal(created.status, 201);
    assert.equal(created.body.fundName, 'Checking');
    assert.deepEqual(created.body.totals, { spent: 0, out: 0, in: 0, paid: 0, pending: 0, excluded: 0, exOut: 0, exIn: 0, exPaid: 0, exPending: 0, count: 0 });
    const pid = created.body.id;
    const custom = await editor.post(`${U}/projects`).send({ name: 'Hajj', kind: '  Pilgrimage ', fundId: null });
    assert.equal(custom.status, 201);
    assert.equal(custom.body.kind, 'pilgrimage');
    assert.equal((await editor.delete(`${U}/projects/${custom.body.id}`)).status, 200);
    assert.equal((await editor.post(`${U}/projects`).send({ name: 'Bad', kind: '   ', fundId: null })).status, 400);
    const empty = await editor.post(`${U}/projects`).send({ name: 'Empty', kind: 'other', fundId: null });
    assert.equal((await editor.delete(`${U}/projects/${empty.body.id}`)).status, 200);

    await add({ projectId: pid, amount: 3000, categoryId: 'cat_travel', meta: { hotel: 'X', nights: 2 } });
    await add({ projectId: pid, amount: 2000, status: 'pending', categoryId: 'cat_travel', meta: { hotel: 'Y' } });
    await add({ projectId: pid, amount: 500, categoryId: 'cat_food', meta: { meal: 'lunch' } });
    await add({ projectId: pid, amount: 700, exclude: true });
    await add({ projectId: pid, amount: 100, direction: 'cr' });

    const one = (await viewer.get(`${U}/projects/${pid}`)).body;
    assert.deepEqual(one.totals, { spent: 5400, out: 5500, in: 100, paid: 3400, pending: 2000, excluded: 700, exOut: 700, exIn: 0, exPaid: 700, exPending: 0, count: 5 });
    assert.deepEqual(one.byCategory.find(c => c.name === 'Travel'), { categoryId: 'cat_travel', name: 'Travel', amount: 5000, out: 5000, in: 0, exOut: 0, exIn: 0 });
    assert.equal(one.byCategory.find(c => c.categoryId === null).name, '(none)');
    assert.deepEqual(one.metaKeys, ['hotel', 'meal', 'nights']);
    assert.deepEqual((await viewer.get(`${U}/projects`)).body[0].totals, one.totals);

    const upd = await editor.put(`${U}/projects/${pid}`).send({ metaSchema: [{ key: 'hotel', label: 'Hotel' }] });
    assert.equal(upd.status, 200);
    assert.deepEqual(upd.body.metaKeys, ['hotel']);
    assert.deepEqual(upd.body.metaSchema, [{ key: 'hotel', label: 'Hotel' }]);
    assert.equal((await editor.put(`${U}/projects/${pid}`).send({ status: 'closed' })).body.status, 'closed');
    assert.equal((await viewer.get(`${U}/projects`)).body.length, 0);
    assert.equal((await viewer.get(`${U}/projects?all=1`)).body.length, 1);
    assert.equal((await editor.delete(`${U}/projects/${pid}`)).status, 409);
    assert.equal((await viewer.get(`${U}/projects/missing`)).status, 404);
  });

  it('yearly report: continuity across years, transfers counted, memo fund left out of total', async () => {
    await add({ date: '2024-06-01', fundId: 'checking', direction: 'cr', amount: 10000 });
    await add({ date: '2024-07-01', fundId: 'memo1', direction: 'cr', amount: 777 });
    await add({ date: '2024-08-01', fundId: 'checking', amount: 1000, exclude: true });
    const tr = await ctx.api.post(`${U}/transfers`).send({ date: '2024-09-01', fromFundId: 'checking', toFundId: 'special', amount: 4000 });
    assert.equal(tr.status, 201);
    await add({ date: '2025-02-01', fundId: 'checking', direction: 'dr', amount: 500 });
    await add({ date: '2025-02-02', fundId: 'special', direction: 'cr', amount: 200 });
    await add({ date: '2025-02-03', fundId: 'usd', direction: 'cr', amount: 99999 });

    const res = await viewer.get(`${U}/reports/yearly`);
    assert.equal(res.status, 200);
    const [y24, y25] = res.body.years;
    assert.equal(y24.year, 2024);
    assert.equal(res.body.years.at(-1).year, new Date().getFullYear());
    const fund = (y, id) => y.funds.find(f => f.fundId === id);
    assert.deepEqual(fund(y24, 'checking'), { fundId: 'checking', name: 'Checking', kind: 'general', opening: 0, cr: 10000, dr: 4000, closing: 6000 });
    assert.equal(fund(y24, 'special').closing, 4000);
    assert.equal(fund(y24, 'memo1').closing, 777);
    assert.equal(fund(y24, 'usd'), undefined);
    assert.deepEqual(y24.total, { opening: 0, cr: 14000, dr: 4000, closing: 10000 });
    assert.equal(fund(y25, 'checking').opening, 6000);
    assert.equal(fund(y25, 'checking').closing, 5500);
    assert.equal(fund(y25, 'memo1').opening, 777);
    assert.deepEqual(y25.total, { opening: 10000, cr: 200, dr: 500, closing: 9700 });
  });

  it('pivot by category (dr) across two years, with (none) and skipped categories', async () => {
    await add({ date: '2024-05-01', amount: 1000, categoryId: 'cat_food' });
    await add({ date: '2025-05-01', amount: 2000, categoryId: 'cat_food' });
    await add({ date: '2025-06-01', amount: 300 });
    await add({ date: '2025-06-02', amount: 50, categoryId: 'cat_food', exclude: true });
    await add({ date: '2025-06-03', fundId: 'memo1', amount: 40, categoryId: 'cat_travel' });
    await add({ date: '2025-06-04', fundId: 'usd', amount: 9999, categoryId: 'cat_food' });
    await ctx.api.post(`${U}/transfers`).send({ date: '2025-07-01', fromFundId: 'checking', toFundId: 'special', amount: 5000 });

    const res = (await viewer.get(`${U}/reports/pivot?rows=category&direction=dr`)).body;
    assert.deepEqual(res.columns, ['2024', '2025']);
    const food = res.rows.find(r => r.id === 'cat_food');
    assert.deepEqual(food.values, { 2024: 1000, 2025: 2000 });
    assert.equal(food.total, 3000);
    const none = res.rows.find(r => r.id === null);
    assert.equal(none.name, '(none)');
    assert.deepEqual(none.values, { 2025: 300 });
    assert.equal(res.rows.find(r => r.name === 'Transfer'), undefined);
    assert.deepEqual(res.totals, { 2024: 1000, 2025: 2340 });
    assert.equal(res.grandTotal, 3340);

    const noMemo = (await viewer.get(`${U}/reports/pivot?rows=category&memo=0`)).body;
    assert.equal(noMemo.grandTotal, 3300);
    const byFund = (await viewer.get(`${U}/reports/pivot?rows=fund&direction=net&from=2025&to=2025`)).body;
    assert.deepEqual(byFund.columns, ['2025']);
    assert.equal((await viewer.get(`${U}/reports/pivot?rows=bogus`)).status, 400);
  });

  it('profit report: monthly amount and average rate', async () => {
    await add({ date: '2025-01-05', fundId: 'special', direction: 'cr', amount: 1000, categoryId: 'cat_profit', rate: 10 });
    await add({ date: '2025-01-20', fundId: 'special', direction: 'cr', amount: 500, categoryId: 'cat_profit', rate: 20 });
    await add({ date: '2025-01-21', fundId: 'special', direction: 'cr', amount: 100, categoryId: 'cat_profit' });
    await add({ date: '2025-02-05', fundId: 'checking', direction: 'cr', amount: 700, categoryId: 'cat_profit' });
    await add({ date: '2025-02-06', fundId: 'checking', direction: 'cr', amount: 5, categoryId: 'cat_food' });
    const { rows } = (await viewer.get(`${U}/reports/profit`)).body;
    assert.deepEqual(rows, [
      { month: '2025-01', fundId: 'special', fundName: 'Special', amount: 1600, rate: 15 },
      { month: '2025-02', fundId: 'checking', fundName: 'Checking', amount: 700, rate: null }
    ]);
    assert.equal((await viewer.get(`${U}/reports/profit?fund=checking`)).body.rows.length, 1);
  });

  it('year close: 423 on write, check, reopen; admin only', async () => {
    await add({ date: '2024-06-01', fundId: 'checking', direction: 'cr', amount: 10000 });
    await add({ date: '2024-06-02', fundId: 'usd', direction: 'cr', amount: 300 });
    await add({ date: '2025-06-01', fundId: 'checking', direction: 'cr', amount: 1 });
    assert.equal((await editor.post(`${U}/years/2024/close`)).status, 403);
    assert.equal((await ctx.api.post(`${U}/years/2024/reopen`)).status, 404);

    const closed = await ctx.api.post(`${U}/years/2024/close`);
    assert.equal(closed.status, 201);
    assert.equal(closed.body.year, 2024);
    assert.equal(closed.body.snapshot.checking, 10000);
    assert.equal(closed.body.snapshot.usd, 300);
    assert.equal(closed.body.snapshot.special, 0);
    assert.equal((await ctx.api.post(`${U}/years/2024/close`)).status, 409);

    const list = (await viewer.get(`${U}/years`)).body;
    assert.deepEqual(list.map(y => y.year), [2025, 2024]);
    assert.equal(list[1].closed, true);
    assert.ok(list[1].closedAt && list[1].closedBy);
    assert.equal(list[0].closed, false);

    assert.equal((await editor.post(`${U}/entries`).send(entry({ date: '2024-12-31' }))).status, 423);
    assert.equal((await viewer.get(`${U}/years/2024/check`)).body.ok, true);
    // A back-dated entry in an open year does not touch 2024 balances.
    await add({ date: '2025-01-01', fundId: 'checking', direction: 'dr', amount: 50 });
    assert.deepEqual((await viewer.get(`${U}/years/2024/check`)).body, { ok: true, diffs: [] });

    // Tamper underneath the lock to prove the check reports diffs.
    await ctx.d1.prepare("UPDATE entries SET amount = 9000 WHERE fund_id = 'checking' AND date = '2024-06-01'").run();
    const bad = (await viewer.get(`${U}/years/2024/check`)).body;
    assert.equal(bad.ok, false);
    assert.deepEqual(bad.diffs, [{ fundId: 'checking', name: 'Checking', snapshot: 10000, now: 9000 }]);

    assert.equal((await editor.post(`${U}/years/2024/reopen`)).status, 403);
    assert.equal((await ctx.api.post(`${U}/years/2024/reopen`)).status, 200);
    assert.equal((await editor.post(`${U}/entries`).send(entry({ date: '2024-12-31' }))).status, 201);
  });

  it('projects: changing the fund can move the existing entries (not linked legs); guards for currency, closed year, role', async () => {
    await ctx.d1.prepare("INSERT INTO funds (id, book_id, name, is_reserved, currency, kind) VALUES ('umrah', ?, 'Umrah', 0, 'PKR', 'general')").bind(BOOK).run();
    const pid = (await editor.post(`${U}/projects`).send({ name: 'Umrah trip', kind: 'trip', fundId: 'checking' })).body.id;
    const e1 = await add({ projectId: pid, amount: 1000 });
    const e2 = await add({ projectId: pid, amount: 2000, fundId: 'special' });
    const other = await add({ amount: 300 }); // not in the project
    const fundOf = async id => (await ctx.api.get(`${U}/entries?pageSize=50`)).body.rows.find(r => r.id === id).fundId;

    // Changing the fund alone leaves the entries where they are.
    assert.equal((await editor.put(`${U}/projects/${pid}`).send({ fundId: 'umrah' })).status, 200);
    assert.equal(await fundOf(e1.id), 'checking');
    // The role check still applies.
    assert.equal((await viewer.put(`${U}/projects/${pid}`).send({ moveEntries: true })).status, 403);
    // moveEntries alone moves the strays to the project's current fund.
    const moved = await editor.put(`${U}/projects/${pid}`).send({ moveEntries: true });
    assert.equal(moved.status, 200);
    assert.equal(moved.body.movedEntries, 2);
    assert.equal(await fundOf(e1.id), 'umrah');
    assert.equal(await fundOf(e2.id), 'umrah');
    assert.equal(await fundOf(other.id), 'checking');
    assert.equal((await editor.put(`${U}/projects/${pid}`).send({ moveEntries: true })).body.movedEntries, 0);

    // Fund and move in one request.
    const back = await editor.put(`${U}/projects/${pid}`).send({ fundId: 'special', moveEntries: true });
    assert.equal(back.body.movedEntries, 2);
    assert.equal(await fundOf(e1.id), 'special');

    // A different currency blocks the move (409), nothing changes.
    const usdEntry = await add({ projectId: pid, amount: 500, fundId: 'usd' });
    const blocked = await editor.put(`${U}/projects/${pid}`).send({ moveEntries: true });
    assert.equal(blocked.status, 409);
    assert.match(blocked.body.error, /another currency/);
    assert.equal(await fundOf(e1.id), 'special');
    await editor.delete(`${U}/entries/${usdEntry.id}`);

    // A closed year blocks it (423).
    await ctx.d1.prepare("INSERT INTO year_closes (book_id, year, closed_at, closed_by) VALUES (?, 2025, 'x', 'x')").bind(BOOK).run();
    assert.equal((await editor.put(`${U}/projects/${pid}`).send({ fundId: 'umrah', moveEntries: true })).status, 423);
  });

  it('entries: a project entry can change its party, or clear it', async () => {
    await ctx.d1.prepare("INSERT INTO parties (id, book_id, name, archived) VALUES ('p1', ?, 'Hotel Co', 0)").bind(BOOK).run();
    const pid = (await editor.post(`${U}/projects`).send({ name: 'Trip', kind: 'trip', fundId: 'checking' })).body.id;
    const e = await add({ projectId: pid, amount: 1000 });
    const set = await editor.put(`${U}/entries/${e.id}`).send({ partyId: 'p1' });
    assert.equal(set.body.partyName, 'Hotel Co');
    const named = await editor.put(`${U}/entries/${e.id}`).send({ partyName: 'Taxi Man' });
    assert.equal(named.body.partyName, 'Taxi Man');
    const cleared = await editor.put(`${U}/entries/${e.id}`).send({ partyId: null });
    assert.equal(cleared.body.partyId, null);
  });
});
