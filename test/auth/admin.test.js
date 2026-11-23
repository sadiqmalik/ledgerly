const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { makeContext, withCookie, BOOK, TESTER } = require('../api/helpers');
const { createAccountStore } = require('../../server/auth/accounts');

const PASSWORD = 'editor account passphrase';
const NEW_PASSWORD = 'a different new passphrase';

describe('account administration', () => {
  let ctx;
  let editor;
  let editorId;

  beforeEach(async () => {
    ctx = await makeContext();
    const created = await createAccountStore(ctx.repo.authStore).create({
      email: 'editor@example.com', name: 'Editor', password: PASSWORD, memberships: [{ bookId: BOOK, role: 'editor' }]
    });
    editorId = created.id;
    editor = withCookie(ctx.app, `lsid=${(await ctx.auth.login('editor@example.com', PASSWORD)).sid}`);
  });

  afterEach(async () => { await ctx.close(); });

  const events = async () => ctx.repo.authStore.log.list();

  it('edits an admin\'s name, username and email, and refuses clashes', async () => {
    const a = (await ctx.api.post('/api/admin/accounts').send({ username: 'amy', name: 'Amy', password: NEW_PASSWORD })).body.account;
    const b = (await ctx.api.post('/api/admin/accounts').send({ username: 'bob', email: 'bob@example.com', name: 'Bob', password: NEW_PASSWORD })).body.account;
    const ok = await ctx.api.put(`/api/admin/accounts/${a.id}/profile`).send({ name: 'Amy Z', username: 'Amy.Z', email: 'Amy@Example.com' });
    assert.equal(ok.status, 200);
    assert.deepEqual([ok.body.account.name, ok.body.account.username, ok.body.account.email], ['Amy Z', 'amy.z', 'amy@example.com']);
    assert.equal((await ctx.api.put(`/api/admin/accounts/${a.id}/profile`).send({ username: 'bob' })).status, 400);
    assert.equal((await ctx.api.put(`/api/admin/accounts/${a.id}/profile`).send({ email: 'bob@example.com' })).status, 400);
    assert.equal((await ctx.api.put(`/api/admin/accounts/${a.id}/profile`).send({ username: 'a b' })).status, 400);
    assert.equal((await ctx.api.put(`/api/admin/accounts/${a.id}/profile`).send({})).status, 400);
    assert.equal((await ctx.api.put(`/api/admin/accounts/${b.id}/profile`).send({ email: null })).body.account.email, '');
    assert.equal((await editor.put(`/api/admin/accounts/${a.id}/profile`).send({ name: 'x' })).status, 403);
  });

  it('admin types: a super admin is created without specific access, and the type can be changed', async () => {
    const made = await ctx.api.post('/api/admin/accounts').send({
      email: 'boss@example.com', name: 'Boss', password: NEW_PASSWORD, isSuperAdmin: true,
      memberships: [{ bookId: BOOK, role: 'viewer' }], resources: ['items']
    });
    assert.equal(made.status, 201);
    assert.equal(made.body.account.isSuperAdmin, true);
    assert.deepEqual(made.body.account.memberships, []); // super admins get no specific access
    assert.equal(made.body.account.resourcesSet, false);
    const bossId = made.body.account.id;
    // A normal admin cannot change types; a super admin cannot change their own.
    assert.equal((await editor.put(`/api/admin/accounts/${bossId}/type`).send({ isSuperAdmin: false })).status, 403);
    const me = (await ctx.api.get('/api/auth/me')).body.account.id;
    assert.equal((await ctx.api.put(`/api/admin/accounts/${me}/type`).send({ isSuperAdmin: false })).status, 409);
    // Demote the new one (another super admin remains), then promote the editor.
    const demoted = await ctx.api.put(`/api/admin/accounts/${bossId}/type`).send({ isSuperAdmin: false });
    assert.equal(demoted.status, 200);
    assert.equal(demoted.body.account.isSuperAdmin, false);
    const promoted = await ctx.api.put(`/api/admin/accounts/${editorId}/type`).send({ isSuperAdmin: true });
    assert.equal(promoted.body.account.isSuperAdmin, true);
    assert.equal((await ctx.api.put(`/api/admin/accounts/${editorId}/type`).send({ isSuperAdmin: 'yes' })).status, 400);
  });

  it('only super administrators can manage accounts', async () => {
    assert.equal((await editor.get('/api/admin/accounts')).status, 403);
    assert.equal((await editor.post('/api/admin/accounts').send({ email: 'x@example.com', name: 'X', password: NEW_PASSWORD })).status, 403);
    assert.equal((await ctx.api.get('/api/admin/accounts')).status, 200);
  });

  it('lists accounts without password hashes', async () => {
    const res = await ctx.api.get('/api/admin/accounts');
    assert.equal(res.body.accounts.length, 2);
    assert.ok(!JSON.stringify(res.body).includes('pbkdf2'));
  });

  it('creates an account that can sign in straight away', async () => {
    const res = await ctx.api.post('/api/admin/accounts').send({
      email: 'New@Example.com', name: 'New', password: NEW_PASSWORD, memberships: [{ bookId: BOOK, role: 'viewer' }]
    });
    assert.equal(res.status, 201);
    const login = await ctx.anonymous.post('/api/auth/login').send({ email: 'new@example.com', password: NEW_PASSWORD });
    assert.equal(login.status, 200);
    assert.deepEqual(login.body.account.memberships, [{ bookId: BOOK, role: 'viewer' }]);
  });

  it('refuses unknown books and bad roles', async () => {
    const unknown = await ctx.api.post('/api/admin/accounts').send({
      email: 'a@example.com', name: 'A', password: NEW_PASSWORD, memberships: [{ bookId: 'nowhere', role: 'viewer' }]
    });
    assert.equal(unknown.status, 400);
    assert.match(unknown.body.error, /Unknown book: nowhere/);
    const badRole = await ctx.api.post('/api/admin/accounts').send({
      email: 'b@example.com', name: 'B', password: NEW_PASSWORD, memberships: [{ bookId: BOOK, role: 'owner' }]
    });
    assert.equal(badRole.status, 400);
  });

  it('a membership change takes effect on the very next request', async () => {
    assert.equal((await editor.get('/api/books')).body.length, 1);
    await ctx.api.put(`/api/admin/accounts/${editorId}/memberships`).send({ memberships: [] }).expect(200);
    assert.equal((await editor.get('/api/books')).body.length, 0, 'removed at once');
  });

  it('disabling an account signs it out and blocks sign-in', async () => {
    await ctx.api.put(`/api/admin/accounts/${editorId}/status`).send({ disabled: true }).expect(200);
    assert.equal((await editor.get('/api/auth/me')).status, 401);
    assert.equal((await ctx.anonymous.post('/api/auth/login').send({ email: 'editor@example.com', password: PASSWORD })).status, 401);
  });

  it('you cannot disable or delete your own account', async () => {
    const me = (await ctx.api.get('/api/auth/me')).body.account;
    assert.equal((await ctx.api.put(`/api/admin/accounts/${me.id}/status`).send({ disabled: true })).status, 400);
    assert.equal((await ctx.api.delete(`/api/admin/accounts/${me.id}`)).status, 400);
  });

  it('resetting a password signs the account out and changes the password', async () => {
    await ctx.api.post(`/api/admin/accounts/${editorId}/password`).send({ password: NEW_PASSWORD }).expect(200);
    assert.equal((await editor.get('/api/auth/me')).status, 401);
    assert.equal((await ctx.anonymous.post('/api/auth/login').send({ email: 'editor@example.com', password: NEW_PASSWORD })).status, 200);
  });

  it('deletes an account, signs it out and records every change in the account log', async () => {
    await ctx.api.delete(`/api/admin/accounts/${editorId}`).expect(200);
    assert.equal((await editor.get('/api/auth/me')).status, 401);
    assert.equal((await ctx.api.delete(`/api/admin/accounts/${editorId}`)).status, 404);
    const log = await events();
    assert.ok(log.some(e => e.action === 'delete' && e.target === 'editor@example.com' && e.actor.email === TESTER.email));
  });

  describe('loan memberships', () => {
    const makeRegister = async () => (await ctx.api.post('/api/loans').send({ name: 'R', borrower: 'B', lender: 'L' }).expect(201)).body.id;

    it('are super admin only, validated, and exposed in the account view and /me', async () => {
      const id = await makeRegister();
      const url = `/api/admin/accounts/${editorId}/loan-memberships`;
      assert.equal((await editor.put(url).send({ loanMemberships: [{ registerId: id, role: 'viewer' }] })).status, 403);
      assert.equal((await ctx.api.put(url).send({ loanMemberships: [{ registerId: 'nowhere', role: 'viewer' }] })).status, 400);
      assert.equal((await ctx.api.put(url).send({ loanMemberships: [{ registerId: id, role: 'owner' }] })).status, 400);
      assert.equal((await ctx.api.put(url).send({})).status, 400);
      assert.equal((await ctx.api.put('/api/admin/accounts/nope/loan-memberships').send({ loanMemberships: [] })).status, 404);
      const res = await ctx.api.put(url).send({ loanMemberships: [{ registerId: id, role: 'editor' }] }).expect(200);
      assert.deepEqual(res.body.account.loanMemberships, [{ registerId: id, role: 'editor' }]);
      assert.deepEqual((await editor.get('/api/auth/me')).body.account.loanMemberships, [{ registerId: id, role: 'editor' }]);
      assert.equal((await editor.get(`/api/loans/${id}`)).status, 200, 'effective on the next request');
      assert.ok((await events()).some(e => e.action === 'loan-memberships'));
      await ctx.api.put(url).send({ loanMemberships: [] }).expect(200);
      assert.equal((await editor.get(`/api/loans/${id}`)).status, 403);
    });

    it('can be set when creating an account', async () => {
      const id = await makeRegister();
      const res = await ctx.api.post('/api/admin/accounts').send({
        email: 'loan@example.com', name: 'Loan', password: NEW_PASSWORD, loanMemberships: [{ registerId: id, role: 'viewer' }]
      });
      assert.equal(res.status, 201);
      assert.deepEqual(res.body.account.loanMemberships, [{ registerId: id, role: 'viewer' }]);
      const bad = await ctx.api.post('/api/admin/accounts').send({
        email: 'loan2@example.com', name: 'Loan', password: NEW_PASSWORD, loanMemberships: [{ registerId: 'nowhere', role: 'viewer' }]
      });
      assert.equal(bad.status, 400);
      const plain = await ctx.api.post('/api/admin/accounts').send({ email: 'loan3@example.com', name: 'L', password: NEW_PASSWORD });
      assert.deepEqual(plain.body.account.loanMemberships, []);
    });
  });
});
