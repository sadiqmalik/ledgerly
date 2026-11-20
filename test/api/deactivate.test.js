const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { makeContext, withCookie, BOOK } = require('./helpers');
const { createAccountStore } = require('../../server/auth/accounts');

const PW = 'a long passphrase here';

describe('deactivating a ledger', () => {
  let ctx; let store;
  const make = async (email, role) => {
    await store.create({ email, name: email.split('@')[0], password: PW, memberships: [{ bookId: BOOK, role }] });
    return withCookie(ctx.app, `lsid=${(await ctx.auth.login(email, PW)).sid}`);
  };
  const url = `/api/books/${BOOK}/active`;

  beforeEach(async () => { ctx = await makeContext(); store = createAccountStore(ctx.repo.authStore); });
  afterEach(async () => { await ctx.close(); });

  it('lets a book admin deactivate (idempotent) and only editors/viewers are refused', async () => {
    const admin = await make('a@example.com', 'admin');
    const editor = await make('e@example.com', 'editor');
    const viewer = await make('v@example.com', 'viewer');
    assert.equal((await editor.put(url).send({ active: false })).status, 403);
    assert.equal((await viewer.put(url).send({ active: false })).status, 403);
    const res = await admin.put(url).send({ active: false });
    assert.equal(res.status, 200);
    assert.equal(res.body.active, false);
    assert.equal(res.body.id, BOOK);
    assert.equal((await ctx.api.put(url).send({ active: false })).body.active, false);
  });

  it('hides it from members, answers 423, and only a super admin reactivates', async () => {
    const admin = await make('a@example.com', 'admin');
    const viewer = await make('v@example.com', 'viewer');
    assert.equal((await viewer.get(`/api/books/${BOOK}/entries`)).status, 200);
    await admin.put(url).send({ active: false });
    assert.deepEqual((await viewer.get('/api/books')).body, []);
    const locked = await viewer.get(`/api/books/${BOOK}/entries`);
    assert.equal(locked.status, 423);
    assert.equal(locked.body.error, 'This ledger is deactivated. A super administrator can reactivate it.');
    assert.equal((await admin.put(url).send({ active: true })).status, 423);
    assert.equal((await ctx.api.get(`/api/books/${BOOK}/entries`)).status, 200);
    const all = (await ctx.api.get('/api/books')).body;
    assert.equal(all.find(b => b.id === BOOK).active, false);
    assert.equal(all.find(b => b.id === 'personal').active, true);
    const res = await ctx.api.put(url).send({ active: true });
    assert.equal(res.status, 200);
    assert.equal(res.body.active, true);
    assert.equal((await viewer.get(`/api/books/${BOOK}/entries`)).status, 200);
    assert.deepEqual((await viewer.get('/api/books')).body.map(b => [b.id, b.active]), [[BOOK, true]]);
  });

  it('refuses an ordinary admin reactivating an active book and validates the body', async () => {
    const admin = await make('a@example.com', 'admin');
    assert.equal((await admin.put(url).send({ active: true })).status, 403);
    assert.equal((await ctx.api.put(url).send({})).status, 400);
    assert.equal((await ctx.api.put(url).send({ active: 'no' })).status, 400);
    assert.equal((await ctx.api.put(url).send({ active: false, extra: 1 })).status, 400);
    assert.equal((await ctx.api.put('/api/books/nope/active').send({ active: false })).status, 404);
  });

  it('deletes a book permanently only when deactivated and empty', async () => {
    await ctx.api.post('/api/books').send({ name: 'Temp' });
    const del = () => ctx.api.delete('/api/books/temp');
    const active = await del();
    assert.equal(active.status, 409);
    assert.equal(active.body.error, 'Deactivate the ledger first, then delete it permanently.');
    await ctx.api.put('/api/books/temp/active').send({ active: false });
    await ctx.d1.prepare("INSERT INTO documents (id, book_id, title) VALUES ('d1', 'temp', 'Doc')").run();
    assert.equal((await del()).status, 409);
    await ctx.d1.prepare("DELETE FROM documents WHERE id = 'd1'").run();
    assert.equal((await del()).status, 200);
    assert.equal((await ctx.d1.prepare("SELECT COUNT(*) AS n FROM books WHERE id = 'temp'").first()).n, 0);
    assert.equal((await del()).status, 404);
  });
});
