const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { makeContext, withCookie, BOOK } = require('./helpers');
const { createAccountStore } = require('../../server/auth/accounts');
const { DEFAULT_CATEGORIES } = require('../../server/domain/defaults');

const PW = 'a long passphrase here';

describe('books and members', () => {
  let ctx; let store; let accounts;
  const login = async email => withCookie(ctx.app, `lsid=${(await ctx.auth.login(email, PW)).sid}`);
  const make = async (email, memberships) => { accounts[email] = await store.create({ email, name: email.split('@')[0], password: PW, memberships }); return login(email); };
  const count = async (table, book) => (await ctx.d1.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE book_id = ?`).bind(book).first()).n;
  const memberships = async email => JSON.parse((await ctx.d1.prepare('SELECT memberships FROM accounts WHERE email = ?').bind(email).first()).memberships);

  beforeEach(async () => {
    ctx = await makeContext();
    store = createAccountStore(ctx.repo.authStore);
    accounts = {};
  });
  afterEach(async () => { await ctx.close(); });

  it('creates a book with seeded defaults, a slug id and role/createdAt in the list', async () => {
    const res = await ctx.api.post('/api/books').send({ name: 'Acme Trading Co.!', baseCurrency: 'usd' });
    assert.equal(res.status, 201);
    assert.equal(res.body.id, 'acme-trading-co');
    assert.equal(res.body.baseCurrency, 'USD');
    assert.equal(res.body.role, 'admin');
    assert.ok(res.body.createdAt);
    assert.equal(DEFAULT_CATEGORIES.length, 20);
    assert.equal(await count('categories', 'acme-trading-co'), 20);
    const funds = await ctx.api.get('/api/books/acme-trading-co/funds');
    assert.deepEqual(funds.body.map(f => [f.name, f.kind, f.currency]), [['General', 'general', 'USD']]);
    const holders = await ctx.api.get('/api/books/acme-trading-co/holders');
    assert.deepEqual(holders.body.map(h => [h.name, h.kind, h.currency]), [['Cash', 'cash', 'USD']]);
    const cats = (await ctx.api.get('/api/books/acme-trading-co/categories')).body.map(c => c.name);
    for (const name of ['Transfer', 'Conversion', 'Family support', 'Cash withdrawal', 'Charity']) assert.ok(cats.includes(name), name);
    const list = (await ctx.api.get('/api/books')).body;
    const mine = list.find(b => b.id === 'acme-trading-co');
    assert.equal(mine.role, 'admin');
    assert.equal(mine.createdAt, res.body.createdAt);
    assert.equal((await ctx.api.post('/api/books').send({ name: 'x', id: 'Bad Id' })).status, 400);
    assert.equal((await ctx.api.post('/api/books').send({ name: 'Custom', id: 'my-id' })).body.id, 'my-id');
  });

  it('defaults the base currency to PKR and returns 409 for a duplicate id', async () => {
    assert.equal((await ctx.api.post('/api/books').send({ name: 'Zed' })).body.baseCurrency, 'PKR');
    assert.equal((await ctx.api.post('/api/books').send({ name: 'Zed' })).status, 409);
    assert.equal((await ctx.api.post('/api/books').send({ name: 'Another', id: BOOK })).status, 409);
  });

  it('only super admins create or delete books', async () => {
    const admin = await make('badmin@example.com', [{ bookId: BOOK, role: 'admin' }]);
    assert.equal((await admin.post('/api/books').send({ name: 'Nope' })).status, 403);
    assert.equal((await admin.delete(`/api/books/personal`)).status, 403);
    assert.equal((await admin.delete(`/api/books/${BOOK}`)).status, 403);
    const list = (await admin.get('/api/books')).body;
    assert.deepEqual(list.map(b => [b.id, b.role]), [[BOOK, 'admin']]);
  });

  it('renames a book; book admins may, editors may not; baseCurrency is 409 with entries', async () => {
    const admin = await make('badmin@example.com', [{ bookId: BOOK, role: 'admin' }]);
    const editor = await make('ed@example.com', [{ bookId: BOOK, role: 'editor' }]);
    const r = await admin.put(`/api/books/${BOOK}`).send({ name: 'Renamed' });
    assert.equal(r.status, 200);
    assert.equal(r.body.name, 'Renamed');
    assert.equal((await editor.put(`/api/books/${BOOK}`).send({ name: 'x' })).status, 403);
    assert.equal((await admin.put(`/api/books/personal`).send({ name: 'x' })).status, 403);
    assert.equal((await ctx.api.put(`/api/books/nope`).send({ name: 'x' })).status, 404);
    assert.equal((await admin.put(`/api/books/${BOOK}`).send({ baseCurrency: 'USD' })).body.baseCurrency, 'USD');
    await ctx.d1.batch([
      ctx.d1.prepare("INSERT INTO funds (id, book_id, name, currency, kind) VALUES ('f1', ?, 'F', 'USD', 'general')").bind(BOOK),
      ctx.d1.prepare("INSERT INTO entries (id, book_id, date, fund_id, direction, amount, currency, created_by, created_at, updated_at) VALUES ('e1', ?, '2026-01-01', 'f1', 'cr', 5, 'USD', 'x', 'n', 'n')").bind(BOOK)
    ]);
    const blocked = await admin.put(`/api/books/${BOOK}`).send({ baseCurrency: 'PKR' });
    assert.equal(blocked.status, 409);
    assert.equal((await admin.put(`/api/books/${BOOK}`).send({ baseCurrency: 'USD', name: 'Same' })).status, 200);
  });

  it('deletes a book with its entries and documents once the name is confirmed', async () => {
    await ctx.api.post('/api/books').send({ name: 'Temp' });
    const member = await make('m@example.com', [{ bookId: 'temp', role: 'editor' }, { bookId: BOOK, role: 'viewer' }]);
    await ctx.d1.batch([
      ctx.d1.prepare("INSERT INTO entries (id, book_id, date, fund_id, direction, amount, currency, created_by, created_at, updated_at) VALUES ('t1','temp','2026-01-01','x','cr',5,'PKR','x','n','n')"),
      ctx.d1.prepare("INSERT INTO year_closes (book_id, year, closed_at, closed_by) VALUES ('temp', 2020, 'n', 'x')"),
      ctx.d1.prepare("INSERT INTO documents (id, book_id, title) VALUES ('d1', 'temp', 'Doc')")
    ]);
    assert.equal((await member.delete('/api/books/temp?confirm=Temp')).status, 403);
    assert.equal((await ctx.api.delete('/api/books/temp')).status, 400);
    assert.equal((await ctx.api.delete('/api/books/temp?confirm=temp')).status, 400);
    const res = await ctx.api.delete('/api/books/temp?confirm=Temp');
    assert.equal(res.status, 200);
    for (const t of ['funds', 'holders', 'categories', 'parties', 'projects', 'year_closes', 'documents', 'entries']) assert.equal(await count(t, 'temp'), 0, t);
    assert.equal((await ctx.d1.prepare("SELECT COUNT(*) AS n FROM books WHERE id = 'temp'").first()).n, 0);
    assert.deepEqual(await memberships('m@example.com'), [{ bookId: BOOK, role: 'viewer' }]);
    assert.equal((await member.get('/api/books/temp/summary')).status, 403);
    assert.equal((await ctx.api.delete('/api/books/temp')).status, 404);
    assert.equal(await count('categories', BOOK), 0, 'other books are left alone');
  });

  it('lists, adds, changes and removes members', async () => {
    const admin = await make('badmin@example.com', [{ bookId: BOOK, role: 'admin' }]);
    await make('viewer@example.com', []);
    const viewer = await login('viewer@example.com');
    assert.equal((await viewer.get(`/api/books/${BOOK}/members`)).status, 403);

    let list = (await admin.get(`/api/books/${BOOK}/members`)).body;
    assert.deepEqual(list.map(m => [m.email, m.role, m.isSuperAdmin, m.disabled]), [['badmin@example.com', 'admin', false, false]]);
    assert.deepEqual(Object.keys(list[0]).sort(), ['accountId', 'disabled', 'email', 'isSuperAdmin', 'name', 'role', 'username']);

    assert.equal((await admin.post(`/api/books/${BOOK}/members`).send({ email: 'nobody@example.com', role: 'viewer' })).status, 404);
    assert.equal((await admin.post(`/api/books/${BOOK}/members`).send({ email: 'viewer@example.com', role: 'owner' })).status, 400);
    const added = await admin.post(`/api/books/${BOOK}/members`).send({ email: ' Viewer@Example.com ', role: 'viewer' });
    assert.equal(added.status, 201);
    assert.equal(added.body.role, 'viewer');
    assert.equal(added.body.accountId, accounts['viewer@example.com'].id);
    assert.equal((await admin.post(`/api/books/${BOOK}/members`).send({ email: 'viewer@example.com', role: 'editor' })).status, 409);
    assert.equal((await viewer.get(`/api/books/${BOOK}/summary`)).status, 200);

    const id = accounts['viewer@example.com'].id;
    const changed = await admin.put(`/api/books/${BOOK}/members/${id}`).send({ role: 'editor' });
    assert.equal(changed.status, 200);
    assert.equal(changed.body.role, 'editor');
    assert.deepEqual(await memberships('viewer@example.com'), [{ bookId: BOOK, role: 'editor' }]);
    assert.equal((await admin.put(`/api/books/${BOOK}/members/${id}`).send({ role: 'bogus' })).status, 400);
    assert.equal((await admin.put(`/api/books/${BOOK}/members/nope`).send({ role: 'viewer' })).status, 404);

    assert.equal((await admin.put(`/api/books/${BOOK}/members/${id}`).send({ role: null })).status, 200);
    assert.deepEqual(await memberships('viewer@example.com'), []);
    assert.equal((await viewer.get(`/api/books/${BOOK}/summary`)).status, 403);
    assert.equal((await admin.put(`/api/books/${BOOK}/members/${id}`).send({ role: null })).status, 404);
    list = (await admin.get(`/api/books/${BOOK}/members`)).body;
    assert.equal(list.length, 1);
  });

  it('returns 409 when a book admin changes their own role', async () => {
    const admin = await make('badmin@example.com', [{ bookId: BOOK, role: 'admin' }]);
    const id = accounts['badmin@example.com'].id;
    assert.equal((await admin.put(`/api/books/${BOOK}/members/${id}`).send({ role: 'viewer' })).status, 409);
    assert.equal((await admin.put(`/api/books/${BOOK}/members/${id}`).send({ role: null })).status, 409);
    assert.deepEqual(await memberships('badmin@example.com'), [{ bookId: BOOK, role: 'admin' }]);
  });

  it('isolates books: an editor of one book gets 403 on another', async () => {
    const editor = await make('ed@example.com', [{ bookId: BOOK, role: 'editor' }]);
    for (const path of ['summary', 'entries', 'funds', 'members']) assert.equal((await editor.get(`/api/books/personal/${path}`)).status, 403, path);
    assert.equal((await editor.post('/api/books/personal/entries').send({ date: '2026-01-01', fundId: 'x', direction: 'cr', amount: 1 })).status, 403);
    assert.equal((await editor.put('/api/books/personal').send({ name: 'x' })).status, 403);
    assert.equal((await editor.get(`/api/books/${BOOK}/summary`)).status, 200);
    assert.equal((await editor.get(`/api/books/${BOOK}/members`)).status, 403);
  });
});
