const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { makeContext, withCookie, BOOK } = require('./helpers');
const { createAccountStore } = require('../../server/auth/accounts');

const U = `/api/books/${BOOK}/entry-counts`;
const PW = 'a long passphrase here';

describe('entry counts API', () => {
  let ctx; let viewer; let bare;
  beforeEach(async () => {
    ctx = await makeContext();
    const d1 = ctx.d1;
    const entry = (id, fund, party, cat, extra = {}) => d1.prepare(
      'INSERT INTO entries (id, book_id, date, fund_id, direction, amount, party_id, category_id, exclude, link_id, created_by, created_at, updated_at, deleted_at, currency) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)'
    ).bind(id, extra.book || BOOK, '2025-03-01', fund, 'dr', 100, party, cat, extra.exclude || 0, extra.link || null, 't', 'n', 'n', extra.deleted || null, 'PKR');
    await d1.batch([
      d1.prepare("INSERT INTO holders (id, book_id, name, kind) VALUES ('h1', ?, 'Bank', 'bank'), ('h2', ?, 'Cash', 'cash')").bind(BOOK, BOOK),
      d1.prepare("INSERT INTO funds (id, book_id, name, holder_id, kind) VALUES ('f1', ?, 'F1', 'h1', 'general'), ('f2', ?, 'F2', 'h1', 'general'), ('f3', ?, 'F3', 'h2', 'general'), ('f4', ?, 'F4', NULL, 'general')").bind(BOOK, BOOK, BOOK, BOOK),
      d1.prepare("INSERT INTO parties (id, book_id, name) VALUES ('p1', ?, 'P1'), ('p2', ?, 'P2')").bind(BOOK, BOOK),
      d1.prepare("INSERT INTO categories (id, book_id, name, default_direction) VALUES ('c1', ?, 'C1', 'dr')").bind(BOOK),
      entry('e1', 'f1', 'p1', 'c1'),
      entry('e2', 'f1', 'p1', null, { exclude: 1 }),
      entry('e3', 'f2', null, 'c1', { link: 'L' }),
      entry('e4', 'f3', 'p2', 'c1', { link: 'L' }),
      entry('e5', 'f4', null, null),
      entry('gone', 'f1', 'p1', 'c1', { deleted: '2025-04-01' })
    ]);
    const store = createAccountStore(ctx.repo.authStore);
    await store.create({ email: 'viewer@example.com', name: 'v', password: PW, memberships: [{ bookId: BOOK, role: 'viewer' }], resources: ['settings'] });
    await store.create({ email: 'bare@example.com', name: 'b', password: PW, memberships: [{ bookId: BOOK, role: 'viewer' }], resources: ['ledger'] });
    const login = async e => withCookie(ctx.app, `lsid=${(await ctx.auth.login(e, PW)).sid}`);
    viewer = await login('viewer@example.com'); bare = await login('bare@example.com');
  });
  afterEach(async () => { await ctx.close(); });

  it('counts live entries per fund, holder, party and category', async () => {
    const res = await ctx.api.get(U);
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, {
      funds: { f1: 2, f2: 1, f3: 1, f4: 1 },
      holders: { h1: 3, h2: 1 },
      parties: { p1: 2, p2: 1 },
      categories: { c1: 3 }
    });
  });

  it('a viewer with the settings resource can read it', async () => {
    const res = await viewer.get(U);
    assert.equal(res.status, 200);
    assert.equal(res.body.funds.f1, 2);
  });

  it('an account without the settings resource is refused', async () => {
    assert.equal((await bare.get(U)).status, 403);
  });
});
