const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { makeContext, withCookie, BOOK } = require('./helpers');
const { createAccountStore } = require('../../server/auth/accounts');

const U = `/api/books/${BOOK}`;
const seed = async d1 => {
  const f = (id, name, cur, kind, res, book = BOOK) =>
    d1.prepare('INSERT INTO funds (id, book_id, name, is_reserved, currency, kind) VALUES (?,?,?,?,?,?)').bind(id, book, name, res, cur, kind);
  const cat = (id, name, dir, book = BOOK) =>
    d1.prepare('INSERT INTO categories (id, book_id, name, default_direction) VALUES (?,?,?,?)').bind(id, book, name, dir);
  await d1.batch([
    f('checking', 'Checking', 'PKR', 'general', 0), f('special', 'Special', 'PKR', 'reserved', 1), f('usd', 'USD Wallet', 'USD', 'general', 0),
    f('other_fund', 'Elsewhere', 'PKR', 'general', 0, 'personal'),
    cat('cat_transfer', 'Transfer', 'dr'), cat('cat_conversion', 'Conversion', 'dr'), cat('cat_food', 'Food', 'dr'),
    cat('other_cat', 'Food', 'dr', 'personal')
  ]);
};

describe('ledger data API', () => {
  let ctx; let viewer; let editor;
  const entry = (extra = {}) => ({ date: '2026-01-10', fundId: 'checking', direction: 'dr', amount: 1000, ...extra });
  const post = async (body, who = ctx.api) => who.post(`${U}/entries`).send(body);

  beforeEach(async () => {
    ctx = await makeContext();
    await seed(ctx.d1);
    const store = createAccountStore(ctx.repo.authStore);
    for (const role of ['viewer', 'editor']) {
      await store.create({ email: `${role}@example.com`, name: role, password: 'a long passphrase here', memberships: [{ bookId: BOOK, role }] });
    }
    const login = async e => withCookie(ctx.app, `lsid=${(await ctx.auth.login(e, 'a long passphrase here')).sid}`);
    viewer = await login('viewer@example.com');
    editor = await login('editor@example.com');
  });
  afterEach(async () => { await ctx.close(); });

  it('creates, reads, updates and soft-deletes an entry with role checks', async () => {
    assert.equal((await post(entry(), viewer)).status, 403);
    const res = await post(entry({ comment: 'Lunch', categoryId: 'cat_food' }), editor);
    assert.equal(res.status, 201);
    assert.equal(res.body.currency, 'PKR');
    assert.equal(res.body.fundName, 'Checking');
    assert.equal(res.body.categoryName, 'Food');
    assert.equal(res.body.exclude, false);
    assert.equal((await viewer.get(`${U}/entries`)).body.count, 1);
    assert.equal((await viewer.put(`${U}/entries/${res.body.id}`).send({ amount: 5 })).status, 403);
    const upd = await editor.put(`${U}/entries/${res.body.id}`).send({ amount: 2500, comment: 'Dinner' });
    assert.equal(upd.status, 200);
    assert.equal(upd.body.amount, 2500);
    assert.equal(upd.body.comment, 'Dinner');
    assert.equal((await viewer.delete(`${U}/entries/${res.body.id}`)).status, 403);
    assert.equal((await editor.delete(`${U}/entries/${res.body.id}`)).status, 200);
    assert.equal((await viewer.get(`${U}/entries`)).body.count, 0);
    assert.equal((await editor.delete(`${U}/entries/${res.body.id}`)).status, 404);
  });

  it('rejects bad amounts and dates', async () => {
    for (const amount of [0, -5, 10.5, '100', null]) assert.equal((await post(entry({ amount }))).status, 400);
    assert.equal((await post(entry({ date: '2026-02-30' }))).status, 400);
    assert.equal((await post(entry({ direction: 'x' }))).status, 400);
    const res = await post(entry({ amount: 1.5 }));
    assert.equal(typeof res.body.error, 'string');
  });

  it('moves an entry into a project and back out without changing the totals', async () => {
    const project = await ctx.api.post(`${U}/projects`).send({ name: 'Fix-up', kind: 'other', fundId: 'checking' });
    const created = await post(entry({ amount: 12345, comment: 'Posted in the ledger by mistake' }), editor);
    assert.equal(created.status, 201);
    assert.equal(created.body.projectId, null);
    const url = `${U}/entries/${created.body.id}`;
    const totals = async () => (await ctx.api.get(`${U}/entries?year=2026`)).body.totals;
    const before = await totals();

    const moved = await editor.put(url).send({ projectId: project.body.id });
    assert.equal(moved.status, 200);
    assert.equal(moved.body.projectId, project.body.id);
    assert.deepEqual(await totals(), before);
    assert.equal((await ctx.api.get(`${U}/entries?project=${project.body.id}`)).body.count, 1);

    assert.equal((await editor.put(url).send({ projectId: 'no_such_project' })).status, 404);
    assert.equal((await viewer.put(url).send({ projectId: null })).status, 403);

    const out = await editor.put(url).send({ projectId: null });
    assert.equal(out.status, 200);
    assert.equal(out.body.projectId, null);
    assert.deepEqual(await totals(), before);
  });

  it('a closed project takes no new or moved-in entries until it is reopened', async () => {
    const project = await ctx.api.post(`${U}/projects`).send({ name: 'Finished trip', kind: 'trip', fundId: 'checking' });
    const pid = project.body.id;
    const inside = await post(entry({ projectId: pid, comment: 'before closing' }), editor);
    const stray = await post(entry({ comment: 'posted in the ledger by mistake' }), editor);
    assert.equal(inside.status, 201);
    assert.equal((await ctx.api.put(`${U}/projects/${pid}`).send({ status: 'closed' })).status, 200);

    const names = (await ctx.api.get(`${U}/project-names`)).body;
    assert.equal(names.find(p => p.id === pid).status, 'closed');

    // New entries and moved-in entries are refused with a clear message.
    const created = await post(entry({ projectId: pid }), editor);
    assert.equal(created.status, 409);
    assert.match(created.body.error, /closed/i);
    const moved = await editor.put(`${U}/entries/${stray.body.id}`).send({ projectId: pid });
    assert.equal(moved.status, 409);
    assert.equal((await editor.get(`${U}/entries?project=${pid}`)).body.count, 1);

    // An entry already in the closed project can still be edited (its project is unchanged) or taken out.
    const edited = await editor.put(`${U}/entries/${inside.body.id}`).send({ comment: 'tidied', projectId: pid });
    assert.equal(edited.status, 200);
    assert.equal((await editor.put(`${U}/entries/${inside.body.id}`).send({ projectId: null })).status, 200);

    // Reopen the project and the assignment works again.
    assert.equal((await ctx.api.put(`${U}/projects/${pid}`).send({ status: 'open' })).status, 200);
    assert.equal((await editor.put(`${U}/entries/${stray.body.id}`).send({ projectId: pid })).status, 200);
  });

  it('re-assigning projects in a re-opened closed year leaves balances and the year check intact', async () => {
    const project = await ctx.api.post(`${U}/projects`).send({ name: 'Fix-up 2', kind: 'other', fundId: 'checking' });
    const created = await post(entry({ amount: 5000 }), editor);
    const url = `${U}/entries/${created.body.id}`;
    const balances = async () => (await ctx.api.get(`${U}/entries?year=2026`)).body.totals;
    const before = await balances();

    assert.equal((await ctx.api.post(`${U}/years/2026/close`)).status, 201);
    const locked = await editor.put(url).send({ projectId: project.body.id });
    assert.equal(locked.status, 423); // closed years stay locked until an admin reopens them

    assert.equal((await ctx.api.post(`${U}/years/2026/reopen`)).status, 200);
    assert.equal((await editor.put(url).send({ projectId: project.body.id })).status, 200);
    assert.equal((await ctx.api.post(`${U}/years/2026/close`)).status, 201);

    assert.deepEqual(await balances(), before);
    const check = await ctx.api.get(`${U}/years/2026/check`);
    assert.equal(check.status, 200);
    assert.equal(check.body.ok, true);
    assert.deepEqual(check.body.diffs, []);
  });

  it('calculates and persists quantities, project totals, partial edits and exports', async () => {
    const project = await ctx.api.post(`${U}/projects`).send({ name: 'Travel', kind: 'trip', fundId: 'checking' });
    assert.equal(project.status, 201);
    const created = await post({
      date: '2026-03-10', fundId: 'checking', direction: 'dr', quantity: 10, unitPrice: 5000,
      projectId: project.body.id, comment: 'Tickets', status: 'pending'
    }, editor);
    assert.equal(created.status, 201);
    assert.equal(created.body.quantity, 10);
    assert.equal(created.body.unitPrice, 5000);
    assert.equal(created.body.amount, 50000);
    const url = `${U}/entries/${created.body.id}`;
    assert.equal((await viewer.put(url).send({ quantity: 2 })).status, 403);
    let updated = await editor.put(url).send({ quantity: 2 });
    assert.equal(updated.status, 200);
    assert.equal(updated.body.amount, 10000);
    updated = await editor.put(url).send({ unitPrice: 6000 });
    assert.equal(updated.status, 200);
    assert.equal(updated.body.amount, 12000);
    const comment = await editor.put(url).send({ comment: 'Two tickets' });
    assert.equal(comment.body.quantity, 2);
    assert.equal(comment.body.unitPrice, 6000);
    assert.equal(comment.body.amount, 12000);
    assert.equal((await editor.put(url).send({ amount: 900 })).status, 400);
    const list = (await viewer.get(`${U}/entries`)).body;
    assert.equal(list.rows[0].quantity, 2);
    assert.equal(list.rows[0].unitPrice, 6000);
    assert.equal(list.totals.dr, 12000);
    assert.equal((await viewer.get(`${U}/summary`)).body.total, -12000);
    const detail = (await viewer.get(`${U}/projects/${project.body.id}`)).body;
    assert.equal(detail.totals.spent, 12000);
    assert.equal(detail.totals.pending, 12000);
    const backup = (await ctx.api.get(`${U}/export?format=json`)).body;
    assert.equal(backup.entries[0].quantity, 2);
    assert.equal(backup.entries[0].unitPrice, 6000);
    await ctx.d1.prepare('INSERT INTO year_closes (book_id, year, closed_at, closed_by) VALUES (?,?,?,?)')
      .bind(BOOK, 2026, 'now', 'x').run();
    assert.equal((await editor.put(url).send({ quantity: 3 })).status, 423);
  });

  it('validates pricing and keeps legacy entries and linked transfers compatible', async () => {
    await ctx.d1.prepare(
      "INSERT INTO entries (id, book_id, date, fund_id, direction, amount, currency, created_by, created_at, updated_at) VALUES ('imported',?,'2026-01-01','checking','dr',750,'PKR','x','n','n')"
    ).bind(BOOK).run();
    const imported = (await viewer.get(`${U}/entries`)).body.rows[0];
    assert.equal(imported.quantity, 1);
    assert.equal(imported.unitPrice, 750);
    const importedEdit = await editor.put(`${U}/entries/imported`).send({ quantity: 2 });
    assert.equal(importedEdit.status, 200);
    assert.equal(importedEdit.body.amount, 1500);
    const legacy = await post(entry());
    assert.equal(legacy.body.quantity, 1);
    assert.equal(legacy.body.unitPrice, 1000);
    const changed = await editor.put(`${U}/entries/${legacy.body.id}`).send({ amount: 2500 });
    assert.equal(changed.body.unitPrice, 2500);
    for (const pricing of [
      { quantity: 0, unitPrice: 100 }, { quantity: -2, unitPrice: 100 },
      { quantity: 1.2345, unitPrice: 100 }, { quantity: '2', unitPrice: 100 },
      { quantity: null, unitPrice: 100 }, { quantity: 2, unitPrice: null },
      { quantity: 2, unitPrice: 1.5 }, { quantity: 2, unitPrice: 0 },
      { quantity: 2, unitPrice: 1e13 }, { quantity: 0.001, unitPrice: 1 },
      { quantity: 2, unitPrice: 100, amount: 100 }
    ]) {
      assert.equal((await post({ date: '2026-03-10', fundId: 'checking', direction: 'dr', ...pricing })).status, 400);
    }
    const fractional = await post({ date: '2026-03-10', fundId: 'checking', direction: 'dr', quantity: 1.005, unitPrice: 100 });
    assert.equal(fractional.status, 201);
    assert.equal(fractional.body.amount, 101);
    const transfer = await editor.post(`${U}/transfers`).send({
      date: '2026-03-10', fromFundId: 'special', toFundId: 'checking', amount: 5000
    });
    const legUrl = `${U}/entries/${transfer.body.entries[0].id}`;
    assert.equal((await editor.put(legUrl).send({ quantity: 2 })).status, 409);
    assert.equal((await editor.put(legUrl).send({ unitPrice: 100 })).status, 409);
    assert.equal((await editor.put(legUrl).send({ amount: 6000 })).body.unitPrice, 6000);
  });

  it('filters, searches, paginates and totals across all pages', async () => {
    for (let i = 1; i <= 7; i++) {
      await post(entry({ date: `2026-01-0${i}`, amount: i * 100, direction: i % 2 ? 'cr' : 'dr', comment: i === 3 ? 'Special 100%' : 'row' }));
    }
    await post(entry({ date: '2025-06-01', amount: 999, direction: 'cr', fundId: 'special', partyName: 'Dana' }));
    await post(entry({ date: '2026-01-04', amount: 50000, exclude: true }));
    const all = (await ctx.api.get(`${U}/entries?year=2026&pageSize=3&page=2`)).body;
    assert.equal(all.rows.length, 3);
    assert.equal(all.count, 8);
    assert.equal(all.page, 2);
    // cr: 100+300+500+700 = 1600, dr: 200+400+600 = 1200, excluded 50000 ignored.
    assert.deepEqual(all.totals, { cr: 1600, dr: 1200, net: 400 });
    assert.ok(all.rows[0].date >= all.rows[2].date);
    const page1 = (await ctx.api.get(`${U}/entries?year=2026&pageSize=3`)).body;
    assert.equal(page1.rows[0].date, '2026-01-07');
    assert.deepEqual(page1.totals, all.totals);
    assert.deepEqual((await ctx.api.get(`${U}/entries?fund=special`)).body.totals, { cr: 999, dr: 0, net: 999 });
    assert.equal((await ctx.api.get(`${U}/entries?from=2026-01-03&to=2026-01-05`)).body.count, 4);
    assert.equal((await ctx.api.get(`${U}/entries?q=100%25`)).body.count, 1);
    assert.equal((await ctx.api.get(`${U}/entries?q=DANA`)).body.count, 1);
    assert.equal((await ctx.api.get(`${U}/entries?party=nobody`)).body.count, 0);
  });

  it('auto-creates a party by name, reusing names and aliases case-insensitively', async () => {
    const a = (await post(entry({ partyName: 'Savings' }))).body;
    assert.equal(a.partyName, 'Savings');
    const b = (await post(entry({ partyName: ' savings ' }))).body;
    assert.equal(b.partyId, a.partyId);
    await ctx.api.put(`${U}/parties/${a.partyId}`).send({ aliases: ['SAVINGS Jee'] });
    const c = (await post(entry({ partyName: 'savings jee' }))).body;
    assert.equal(c.partyId, a.partyId);
    const parties = (await ctx.api.get(`${U}/parties`)).body;
    assert.equal(parties.length, 1);
    assert.deepEqual(parties[0].aliases, ['SAVINGS Jee']);
  });

  it('creates a transfer, refuses to change its fund, and deletes both legs', async () => {
    const res = await editor.post(`${U}/transfers`).send({ date: '2026-01-12', fromFundId: 'special', toFundId: 'checking', amount: 5000, comment: 'move' });
    assert.equal(res.status, 201);
    const [dr, cr] = res.body.entries;
    assert.equal(dr.direction, 'dr'); assert.equal(cr.direction, 'cr');
    assert.equal(dr.linkId, res.body.linkId); assert.equal(cr.categoryName, 'Transfer');
    assert.equal((await viewer.post(`${U}/transfers`).send({ date: '2026-01-12', fromFundId: 'special', toFundId: 'checking', amount: 1 })).status, 403);

    const fund = await editor.put(`${U}/entries/${dr.id}`).send({ fundId: 'usd' });
    assert.equal(fund.status, 409); // another currency would turn it into a conversion
    assert.match(fund.body.error, /same currency/);
    assert.equal((await editor.put(`${U}/entries/${dr.id}`).send({ fundId: 'checking' })).status, 409); // the other leg is there
    assert.equal((await editor.put(`${U}/entries/${dr.id}`).send({ direction: 'cr' })).status, 409);
    const amount = await editor.put(`${U}/entries/${dr.id}`).send({ amount: 7000, date: '2026-01-13', comment: 'x' });
    assert.equal(amount.status, 200);
    const legs = (await ctx.api.get(`${U}/entries`)).body.rows;
    assert.deepEqual(legs.map(l => [l.amount, l.date, l.comment]), [[7000, '2026-01-13', 'x'], [7000, '2026-01-13', 'x']]);

    assert.equal((await editor.delete(`${U}/entries/${cr.id}`)).status, 200);
    assert.equal((await ctx.api.get(`${U}/entries`)).body.count, 0);
  });

  it('edits a transfer as a pair: party, project and excluded go to both legs, the fund moves one leg', async () => {
    await ctx.d1.batch([
      ctx.d1.prepare('INSERT INTO funds (id, book_id, name, is_reserved, currency, kind) VALUES (?,?,?,?,?,?)').bind('savings', BOOK, 'Savings', 0, 'PKR', 'general'),
      ctx.d1.prepare("INSERT INTO projects (id, book_id, name, kind, status, created_at) VALUES ('p1', ?, 'Roof', 'general', 'open', 'now')").bind(BOOK)
    ]);
    const res = await editor.post(`${U}/transfers`).send({ date: '2026-01-12', fromFundId: 'special', toFundId: 'checking', amount: 5000 });
    const [dr, cr] = res.body.entries;
    const put = await editor.put(`${U}/entries/${cr.id}`).send({ partyName: 'Dana', projectId: 'p1', exclude: true, fundId: 'savings' });
    assert.equal(put.status, 200);
    const rows = (await ctx.api.get(`${U}/entries?pageSize=10`)).body.rows.filter(r => r.linkId === res.body.linkId);
    assert.equal(rows.length, 2);
    for (const r of rows) {
      assert.equal(r.partyName, 'Dana'); assert.equal(r.projectId, 'p1'); assert.equal(Boolean(r.exclude), true);
    }
    assert.equal(rows.find(r => r.id === cr.id).fundId, 'savings');
    assert.equal(rows.find(r => r.id === dr.id).fundId, 'special'); // the other leg keeps its fund
    assert.equal((await editor.put(`${U}/entries/${cr.id}`).send({ projectId: 'missing' })).status, 404);
    assert.equal((await viewer.put(`${U}/entries/${cr.id}`).send({ comment: 'x' })).status, 403);
  });

  it('handles cross-currency transfers', async () => {
    const bad = await ctx.api.post(`${U}/transfers`).send({ date: '2026-01-12', fromFundId: 'checking', toFundId: 'usd', amount: 28000 });
    assert.equal(bad.status, 400);
    assert.equal((await ctx.api.post(`${U}/transfers`).send({ date: '2026-01-12', fromFundId: 'checking', toFundId: 'checking', amount: 1 })).status, 400);
    const ok = await ctx.api.post(`${U}/transfers`).send({ date: '2026-01-12', fromFundId: 'checking', toFundId: 'usd', amount: 28000, toAmount: 100 });
    assert.equal(ok.status, 201);
    const [dr, cr] = ok.body.entries;
    assert.equal(cr.amount, 100); assert.equal(cr.currency, 'USD'); assert.equal(cr.categoryName, 'Conversion');
    // A conversion's amount is edited per leg: only this leg changes.
    assert.equal((await ctx.api.put(`${U}/entries/${dr.id}`).send({ amount: 30000 })).status, 200);
    const rows = (await ctx.api.get(`${U}/entries`)).body.rows;
    assert.deepEqual(rows.filter(r => r.linkId === ok.body.linkId).map(r => [r.currency, r.amount]).sort(), [['PKR', 30000], ['USD', 100]]);
    assert.equal((await ctx.api.put(`${U}/entries/${dr.id}`).send({ comment: 'ok' })).status, 200);
  });

  it('locks closed years with 423', async () => {
    const created = (await post(entry({ date: '2025-05-05' }))).body;
    await ctx.d1.prepare('INSERT INTO year_closes (book_id, year, closed_at, closed_by) VALUES (?,?,?,?)').bind(BOOK, 2025, 'now', 'x').run();
    const locked = await post(entry({ date: '2025-12-31' }));
    assert.equal(locked.status, 423);
    assert.equal(locked.body.error, 'year closed');
    assert.equal((await editor.put(`${U}/entries/${created.id}`).send({ amount: 1 })).status, 423);
    assert.equal((await editor.delete(`${U}/entries/${created.id}`)).status, 423);
    const open = (await post(entry({ date: '2026-02-02' }))).body;
    assert.equal((await editor.put(`${U}/entries/${open.id}`).send({ date: '2025-02-02' })).status, 423);
    assert.equal((await ctx.api.post(`${U}/transfers`).send({ date: '2025-02-02', fromFundId: 'special', toFundId: 'checking', amount: 1 })).status, 423);
    assert.equal((await post(entry({ date: '2026-02-03' }))).status, 201);
  });

  it('returns 404 for ids from another book', async () => {
    assert.equal((await post(entry({ fundId: 'other_fund' }))).status, 404);
    assert.equal((await post(entry({ categoryId: 'other_cat' }))).status, 404);
    assert.equal((await ctx.api.post(`${U}/transfers`).send({ date: '2026-01-01', fromFundId: 'checking', toFundId: 'other_fund', amount: 1 })).status, 404);
    await ctx.d1.prepare(
      "INSERT INTO entries (id, book_id, date, fund_id, direction, amount, currency, created_by, created_at, updated_at) VALUES ('foreign','personal','2026-01-01','other_fund','cr',5,'PKR','x','n','n')"
    ).run();
    assert.equal((await ctx.api.put(`${U}/entries/foreign`).send({ amount: 9 })).status, 404);
    assert.equal((await ctx.api.delete(`${U}/entries/foreign`)).status, 404);
    assert.equal((await ctx.api.put(`${U}/funds/other_fund`).send({ name: 'x' })).status, 404);
    assert.equal((await ctx.api.get(`${U}/entries`)).body.count, 0);
  });

  it('summarises balances, usable and the year', async () => {
    await post(entry({ date: '2025-12-31', fundId: 'checking', direction: 'cr', amount: 500000 }));
    await post(entry({ date: '2026-01-02', fundId: 'checking', direction: 'dr', amount: 70000 }));
    await post(entry({ date: '2026-01-03', fundId: 'special', direction: 'cr', amount: 200000 }));
    await post(entry({ date: '2026-02-01', fundId: 'usd', direction: 'cr', amount: 2500 }));
    await post(entry({ date: '2026-02-02', fundId: 'checking', direction: 'dr', amount: 99999, exclude: true }));
    const s = (await viewer.get(`${U}/summary`)).body;
    assert.equal(s.total, 630000);
    assert.equal(s.usable, 430000);
    assert.equal(s.funds.find(f => f.id === 'usd').balance, 2500);
    assert.deepEqual(s.year, { cr: 200000, dr: 70000 });
    assert.equal(s.recent.length, 5);
    const early = (await viewer.get(`${U}/summary?asOf=2025-12-31`)).body;
    assert.equal(early.total, 500000);
    assert.equal(early.usable, 500000);
    assert.equal((await viewer.get(`${U}/summary?asOf=bad`)).status, 400);
  });

  it('manages funds, holders, categories and parties with role checks', async () => {
    assert.equal((await editor.post(`${U}/funds`).send({ name: 'Medical' })).status, 403);
    const fund = await ctx.api.post(`${U}/funds`).send({ name: 'Medical', kind: 'reserved' });
    assert.equal(fund.status, 201);
    assert.equal(fund.body.isReserved, true);
    assert.equal((await ctx.api.post(`${U}/funds`).send({ name: 'medical2', kind: 'nope' })).status, 400);
    assert.equal((await ctx.api.post(`${U}/funds`).send({ name: 'Medical' })).status, 409);
    await post(entry({ fundId: fund.body.id, direction: 'cr', amount: 700 }));
    const list = (await viewer.get(`${U}/funds`)).body;
    assert.equal(list.find(f => f.name === 'Medical').balance, 700);
    assert.equal((await ctx.api.put(`${U}/funds/${fund.body.id}`).send({ currency: 'USD' })).status, 409);
    // A fund that still holds money cannot be archived (its balance would drop out of the total).
    assert.equal((await ctx.api.delete(`${U}/funds/${fund.body.id}`)).status, 409);
    assert.equal((await ctx.api.put(`${U}/funds/${fund.body.id}`).send({ archived: true })).status, 409);
    await post(entry({ fundId: fund.body.id, direction: 'dr', amount: 700 }));
    assert.equal((await ctx.api.delete(`${U}/funds/${fund.body.id}`)).status, 200);
    assert.equal((await viewer.get(`${U}/funds`)).body.find(f => f.id === fund.body.id), undefined);
    assert.ok((await viewer.get(`${U}/funds?all=1`)).body.find(f => f.id === fund.body.id));
    // Memo funds never count in the total, so they can be archived while holding a balance.
    const memo = await ctx.api.post(`${U}/funds`).send({ name: 'Custody memo', kind: 'memo' });
    assert.equal(memo.status, 201);
    await post(entry({ fundId: memo.body.id, direction: 'cr', amount: 900 }));
    assert.equal((await ctx.api.put(`${U}/funds/${memo.body.id}`).send({ archived: true })).status, 200);
    assert.equal((await viewer.get(`${U}/funds`)).body.find(f => f.id === memo.body.id), undefined);

    const holder = await ctx.api.post(`${U}/holders`).send({ name: 'Bank A', kind: 'bank' });
    assert.equal(holder.status, 201);
    await ctx.api.delete(`${U}/holders/${holder.body.id}`);
    assert.equal((await viewer.get(`${U}/holders`)).body.length, 0);

    const party = await editor.post(`${U}/parties`).send({ name: 'Bob' });
    assert.equal(party.status, 201);
    assert.equal((await editor.delete(`${U}/parties/${party.body.id}`)).status, 200);
    assert.equal((await viewer.get(`${U}/parties`)).body.length, 0);

    const used = (await post(entry({ categoryId: 'cat_food' }))).body;
    assert.equal(used.categoryName, 'Food');
    assert.equal((await ctx.api.delete(`${U}/categories/cat_food`)).status, 409);
    const cat = await ctx.api.post(`${U}/categories`).send({ name: 'Hobbies', defaultDirection: 'dr' });
    assert.equal(cat.status, 201);
    assert.equal((await editor.delete(`${U}/categories/${cat.body.id}`)).status, 403);
    assert.equal((await ctx.api.delete(`${U}/categories/${cat.body.id}`)).status, 200);
  });

  describe('refund / balance', () => {
    const refund = (id, body = { date: '2026-02-01' }, who = editor) => who.post(`${U}/entries/${id}/refund`).send(body);
    const mkProject = async () => (await ctx.api.post(`${U}/projects`).send({ name: 'Travel', kind: 'trip', fundId: 'checking' })).body.id;
    const raw = async id => (await ctx.d1.prepare('SELECT * FROM entries WHERE id = ?').bind(id).all()).results[0];

    it('creates an independent opposite entry that nets to zero and leaves the source untouched', async () => {
      const projectId = await mkProject();
      const src = (await post(entry({
        amount: undefined, quantity: 2.125, unitPrice: 1501, projectId, partyName: 'Shop', categoryId: 'cat_food', comment: 'Tickets',
        rate: 1.5, exclude: false, status: 'paid', paidDate: '2026-01-11', meta: { a: 1 }
      }), editor)).body;
      const before = await raw(src.id);
      const res = await refund(src.id, { date: src.date });
      assert.equal(res.status, 201);
      const r = res.body;
      assert.notEqual(r.id, src.id);
      assert.equal(r.direction, 'cr');
      for (const k of ['amount', 'quantity', 'unitPrice', 'fundId', 'currency', 'partyId', 'categoryId', 'projectId', 'comment', 'rate', 'exclude', 'meta', 'status']) {
        assert.deepEqual(r[k], src[k], k);
      }
      assert.equal(r.date, src.date);
      assert.equal(r.paidDate, src.date);
      assert.equal(r.linkId, null);
      assert.deepEqual(await raw(src.id), before);
      const s = (await viewer.get(`${U}/summary`)).body;
      assert.equal(s.total, 0);
      assert.equal(s.funds.find(f => f.id === 'checking').balance, 0);
      const detail = (await ctx.api.get(`${U}/projects/${projectId}`)).body;
      assert.equal(detail.totals.spent, 0);
      assert.equal(detail.totals.paid, 0);
      const edited = await editor.put(`${U}/entries/${r.id}`).send({ date: '2026-02-01', comment: 'edited' });
      assert.equal(edited.status, 200);
      assert.equal(edited.body.date, '2026-02-01');
      assert.equal(edited.body.comment, 'edited');
      assert.deepEqual(await raw(src.id), before);
      assert.equal((await refund(src.id)).status, 201);
      assert.equal((await editor.delete(`${U}/entries/${r.id}`)).status, 200);
    });

    it('refunds credits as debits, keeps pending unpaid and supports legacy entries', async () => {
      const cr = (await post(entry({ direction: 'cr', status: 'pending' }), editor)).body;
      const res = await refund(cr.id);
      assert.equal(res.body.direction, 'dr');
      assert.equal(res.body.status, 'pending');
      assert.equal(res.body.paidDate, null);
      await ctx.d1.prepare(
        "INSERT INTO entries (id, book_id, date, fund_id, direction, amount, currency, created_by, created_at, updated_at) VALUES ('legacy',?,'2026-01-01','checking','dr',750,'PKR','x','n','n')"
      ).bind(BOOK).run();
      const l = (await refund('legacy')).body;
      assert.deepEqual([l.amount, l.quantity, l.unitPrice, l.direction], [750, 1, 750, 'cr']);
      assert.equal((await raw(l.id)).unit_price, 750);
    });

    it('enforces roles, scoped book, projects-only access and date validation', async () => {
      const projectId = await mkProject();
      const inProject = (await post(entry({ projectId }), editor)).body;
      const plain = (await post(entry(), editor)).body;
      assert.equal((await refund(plain.id, undefined, viewer)).status, 403);
      assert.equal((await ctx.api.post(`/api/books/personal/entries/${plain.id}/refund`).send({ date: '2026-02-01' })).status, 404);
      for (const body of [{}, { date: 'x' }, { date: '2026-02-30' }, { date: '2026-02-01', amount: 1 }]) {
        assert.equal((await refund(plain.id, body)).status, 400);
      }
      const store = createAccountStore(ctx.repo.authStore);
      await store.create({ email: 'proj@example.com', name: 'p', password: 'a long passphrase here', memberships: [{ bookId: BOOK, role: 'editor' }], resources: ['projects'] });
      const po = await withCookie(ctx.app, `lsid=${(await ctx.auth.login('proj@example.com', 'a long passphrase here')).sid}`);
      assert.equal((await refund(plain.id, undefined, po)).status, 403);
      assert.equal((await refund(inProject.id, undefined, po)).status, 201);
    });

    it('rejects deleted, missing, archived-fund, linked and closed-year sources', async () => {
      const e = (await post(entry(), editor)).body;
      assert.equal((await refund('missing')).status, 404);
      await editor.delete(`${U}/entries/${e.id}`);
      assert.equal((await refund(e.id)).status, 404);

      const arch = (await post(entry({ fundId: 'special' }), editor)).body;
      await ctx.d1.prepare("UPDATE funds SET archived = 1 WHERE id = 'special'").run();
      assert.equal((await refund(arch.id)).status, 409);

      const t = (await editor.post(`${U}/transfers`).send({ date: '2026-01-12', fromFundId: 'checking', toFundId: 'usd', amount: 100, toAmount: 1 })).body;
      for (const leg of t.entries) assert.equal((await refund(leg.id)).status, 409);
      assert.equal((await ctx.d1.prepare('SELECT COUNT(*) n FROM entries').first()).n, 4);

      const open = (await post(entry({ date: '2026-03-01' }), editor)).body;
      await ctx.d1.prepare('INSERT INTO year_closes (book_id, year, closed_at, closed_by) VALUES (?,?,?,?)').bind(BOOK, 2025, 'now', 'x').run();
      assert.equal((await refund(open.id, { date: '2025-12-31' })).status, 423);
      await ctx.d1.prepare(
        "INSERT INTO entries (id, book_id, date, fund_id, direction, amount, currency, created_by, created_at, updated_at) VALUES ('old',?,'2025-05-01','checking','dr',5,'PKR','x','n','n')"
      ).bind(BOOK).run();
      assert.equal((await refund('old', { date: '2026-03-02' })).status, 423);
    });
  });
});
