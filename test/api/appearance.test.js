const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { makeContext, withCookie, BOOK } = require('./helpers');
const { createAccountStore } = require('../../server/auth/accounts');

const U = `/api/books/${BOOK}/appearance`;
const PW = 'a long passphrase here';

describe('appearance API', () => {
  let ctx; let editor; let viewer; let bare;
  beforeEach(async () => {
    ctx = await makeContext();
    const store = createAccountStore(ctx.repo.authStore);
    for (const role of ['viewer', 'editor']) await store.create({ email: `${role}@example.com`, name: role, password: PW, memberships: [{ bookId: BOOK, role }] });
    await store.create({ email: 'bare@example.com', name: 'bare', password: PW, memberships: [{ bookId: BOOK, role: 'viewer' }], resources: [] });
    const login = async e => withCookie(ctx.app, `lsid=${(await ctx.auth.login(e, PW)).sid}`);
    viewer = await login('viewer@example.com'); editor = await login('editor@example.com'); bare = await login('bare@example.com');
  });
  afterEach(async () => { await ctx.close(); });

  it('page names: an admin sets aliases, blanks and unknown pages are dropped, empty resets to defaults', async () => {
    assert.deepEqual((await ctx.api.get(U)).body.pageNames, {});
    const set = await ctx.api.put(U).send({ pageNames: { items: ' Item Vault ', diary: 'Notes', loans: '   ' } });
    assert.equal(set.status, 200);
    assert.deepEqual(set.body.pageNames, { items: 'Item Vault', diary: 'Notes' });
    assert.deepEqual((await viewer.get(U)).body.pageNames, { items: 'Item Vault', diary: 'Notes' });
    assert.equal((await ctx.api.put(U).send({ pageNames: { settings: 'X' } })).status, 400);
    assert.equal((await ctx.api.put(U).send({ pageNames: { items: 'x'.repeat(31) } })).status, 400);
    assert.equal((await editor.put(U).send({ pageNames: { items: 'Mine' } })).status, 403);
    assert.deepEqual((await ctx.api.put(U).send({ pageNames: {} })).body.pageNames, {});
    assert.equal((await ctx.api.put(U).send({ palette: 'ocean' })).body.palette, 'ocean');
  });

  it('defaults, admin sets either key or both, values persist', async () => {
    assert.deepEqual((await ctx.api.get(U)).body, { palette: 'forest', listView: 'cards', pageNames: {} });
    assert.deepEqual((await ctx.api.put(U).send({ palette: 'ocean' })).body, { palette: 'ocean', listView: 'cards', pageNames: {} });
    assert.deepEqual((await ctx.api.put(U).send({ listView: 'table' })).body, { palette: 'ocean', listView: 'table', pageNames: {} });
    assert.deepEqual((await ctx.api.put(U).send({ palette: 'blush', listView: 'cards' })).body, { palette: 'blush', listView: 'cards', pageNames: {} });
    assert.deepEqual((await viewer.get(U)).body, { palette: 'blush', listView: 'cards', pageNames: {} });
  });

  it('editor and viewer cannot change it', async () => {
    assert.equal((await editor.put(U).send({ palette: 'plum' })).status, 403);
    assert.equal((await viewer.put(U).send({ palette: 'plum' })).status, 403);
    assert.equal((await ctx.api.get(U)).body.palette, 'forest');
  });

  it('rejects invalid bodies', async () => {
    for (const body of [{ palette: 'neon' }, { listView: 'grid' }, {}, { palette: 'ocean', extra: 1 }]) {
      assert.equal((await ctx.api.put(U).send(body)).status, 400, JSON.stringify(body));
    }
  });

  it('any member reads it without page resources', async () => {
    const res = await bare.get(U);
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { palette: 'forest', listView: 'cards', pageNames: {} });
  });
});
