const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { makeContext, withCookie, BOOK } = require('./helpers');
const { createAccountStore } = require('../../server/auth/accounts');

const U = `/api/books/${BOOK}/timezone`;
const PW = 'a long passphrase here';

describe('application time zone API', () => {
  let ctx; let editor; let viewer; let bare; let adminNoSettings;
  beforeEach(async () => {
    ctx = await makeContext();
    const store = createAccountStore(ctx.repo.authStore);
    for (const role of ['viewer', 'editor']) await store.create({ email: `${role}@example.com`, name: role, password: PW, memberships: [{ bookId: BOOK, role }] });
    await store.create({ email: 'bare@example.com', name: 'bare', password: PW, memberships: [{ bookId: BOOK, role: 'viewer' }], resources: [] });
    await store.create({ email: 'noset@example.com', name: 'noset', password: PW, memberships: [{ bookId: BOOK, role: 'admin', resources: ['ledger'] }] });
    const login = async e => withCookie(ctx.app, `lsid=${(await ctx.auth.login(e, PW)).sid}`);
    viewer = await login('viewer@example.com'); editor = await login('editor@example.com'); bare = await login('bare@example.com'); adminNoSettings = await login('noset@example.com');
  });
  afterEach(async () => { await ctx.close(); });

  it('is unset by default, an admin sets and clears it, members read it', async () => {
    assert.deepEqual((await ctx.api.get(U)).body, { timeZone: null });
    assert.deepEqual((await ctx.api.put(U).send({ timeZone: 'Europe/Stockholm' })).body, { timeZone: 'Europe/Stockholm' });
    assert.deepEqual((await viewer.get(U)).body, { timeZone: 'Europe/Stockholm' });
    assert.deepEqual((await bare.get(U)).body, { timeZone: 'Europe/Stockholm' });
    assert.deepEqual((await ctx.api.put(U).send({ timeZone: null })).body, { timeZone: null });
  });

  it('only an admin with the Settings page writes; bad zones are refused', async () => {
    assert.equal((await editor.put(U).send({ timeZone: 'Asia/Karachi' })).status, 403);
    assert.equal((await viewer.put(U).send({ timeZone: 'Asia/Karachi' })).status, 403);
    assert.equal((await adminNoSettings.put(U).send({ timeZone: 'Asia/Karachi' })).status, 403);
    for (const body of [{ timeZone: 'Mars/Base' }, { timeZone: '' }, {}, { timeZone: 'UTC', x: 1 }]) assert.equal((await ctx.api.put(U).send(body)).status, 400, JSON.stringify(body));
    assert.deepEqual((await ctx.api.get(U)).body, { timeZone: null });
  });
});
