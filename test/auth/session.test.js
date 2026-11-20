const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const { makeContext, withCookie, BOOK, TESTER } = require('../api/helpers');
const { createAccountStore } = require('../../server/auth/accounts');
const { createAuthService } = require('../../server/auth/service');
const { canAccess } = require('../../server/auth/roles');

const PASSWORD = 'viewer and editor passphrase';

describe('sign-in and sessions', () => {
  let ctx;
  beforeEach(async () => { ctx = await makeContext(); });
  afterEach(async () => { await ctx.close(); });

  it('refuses requests without a session with 401', async () => {
    const res = await ctx.anonymous.get('/api/books');
    assert.equal(res.status, 401);
    assert.equal(res.body.error, 'Not signed in');
  });

  it('keeps health and the sign-in routes public', async () => {
    const health = await ctx.anonymous.get('/api/health');
    assert.equal(health.status, 200);
    assert.equal(health.body.ok, true);
    const bad = await ctx.anonymous.post('/api/auth/login').send({ email: TESTER.email, password: 'wrong wrong wrong' });
    assert.equal(bad.status, 401);
  });

  it('signs in, returns the account, and sets a hardened cookie', async () => {
    const res = await ctx.anonymous.post('/api/auth/login').send({ email: TESTER.email, password: TESTER.password });
    assert.equal(res.status, 200);
    assert.equal(res.body.account.email, TESTER.email);
    assert.equal(res.body.account.passwordHash, undefined);
    const cookie = res.headers['set-cookie'][0];
    assert.match(cookie, /^lsid=/);
    assert.match(cookie, /HttpOnly/);
    assert.match(cookie, /SameSite=Strict/);
    assert.match(cookie, /Path=\/api/);
  });

  it('marks the cookie Secure when cookies are secure (production default)', () => {
    const secure = createAuthService(ctx.repo.authStore, { cookieSecure: true });
    assert.match(secure.setCookie('abc', 60), /Secure/);
  });

  it('a logout ends the session immediately', async () => {
    const login = await ctx.anonymous.post('/api/auth/login').send({ email: TESTER.email, password: TESTER.password });
    const api = withCookie(ctx.app, login.headers['set-cookie'][0].split(';')[0]);
    assert.equal((await api.get('/api/auth/me')).status, 200);
    await api.post('/api/auth/logout').expect(200);
    assert.equal((await api.get('/api/auth/me')).status, 401);
  });

  it('an expired session is refused', async () => {
    const { sid } = await ctx.auth.login(TESTER.email, TESTER.password);
    const id = crypto.createHash('sha256').update(sid).digest('hex');
    await ctx.d1.prepare('UPDATE sessions SET expires_at = ? WHERE id = ?').bind(new Date(Date.now() - 1000).toISOString(), id).run();
    assert.equal((await withCookie(ctx.app, `lsid=${sid}`).get('/api/auth/me')).status, 401);
  });

  it('a disabled account loses its sessions', async () => {
    await createAccountStore(ctx.repo.authStore).create({ email: 'temp@example.com', name: 'Temp', password: PASSWORD });
    const { sid } = await ctx.auth.login('temp@example.com', PASSWORD);
    await ctx.d1.prepare('UPDATE accounts SET disabled = 1 WHERE email = ?').bind('temp@example.com').run();
    assert.equal((await withCookie(ctx.app, `lsid=${sid}`).get('/api/auth/me')).status, 401);
  });

  it('locks sign-in after repeated wrong passwords', async () => {
    for (let i = 0; i < 5; i++) {
      await ctx.anonymous.post('/api/auth/login').send({ email: TESTER.email, password: 'wrong wrong wrong' });
    }
    const locked = await ctx.anonymous.post('/api/auth/login').send({ email: TESTER.email, password: TESTER.password });
    assert.equal(locked.status, 429);
  });

  it('changing the password signs out the other sessions', async () => {
    const { sid: otherSid } = await ctx.auth.login(TESTER.email, TESTER.password);
    const res = await ctx.api.post('/api/auth/password').send({ current: TESTER.password, new: 'a new tester passphrase' });
    assert.equal(res.status, 200);
    assert.equal((await withCookie(ctx.app, `lsid=${otherSid}`).get('/api/auth/me')).status, 401);
    assert.equal((await ctx.api.get('/api/auth/me')).status, 401, 'the old session is gone too');
  });

  it('a wrong current password is refused when changing it', async () => {
    const res = await ctx.api.post('/api/auth/password').send({ current: 'not the current one', new: 'a new tester passphrase' });
    assert.equal(res.status, 401);
  });

  it('refuses a write from a foreign origin', async () => {
    const res = await ctx.api.post('/api/auth/logout').set('Origin', 'https://evil.example').send({});
    assert.equal(res.status, 403);
  });
});

describe('roles per book and GET /api/books', () => {
  let ctx;
  let viewer;
  let otherBookEditor;

  const signIn = async email => withCookie(ctx.app, `lsid=${(await ctx.auth.login(email, PASSWORD)).sid}`);

  beforeEach(async () => {
    ctx = await makeContext();
    const accounts = createAccountStore(ctx.repo.authStore);
    await accounts.create({ email: 'viewer@example.com', name: 'Viewer', password: PASSWORD, memberships: [{ bookId: BOOK, role: 'viewer' }] });
    await accounts.create({ email: 'other@example.com', name: 'Other', password: PASSWORD, memberships: [{ bookId: 'personal', role: 'editor' }] });
    viewer = await signIn('viewer@example.com');
    otherBookEditor = await signIn('other@example.com');
  });

  afterEach(async () => { await ctx.close(); });

  it('a member sees only their own books', async () => {
    const res = await viewer.get('/api/books');
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.map(b => b.id), [BOOK]);
  });

  it('a super administrator sees every book', async () => {
    const ids = (await ctx.api.get('/api/books')).body.map(b => b.id);
    assert.ok(ids.includes(BOOK) && ids.includes('personal'));
  });

  it('book routes are refused for a book the account is not a member of', async () => {
    assert.equal((await otherBookEditor.get(`/api/books/${BOOK}/summary`)).status, 403);
    assert.notEqual((await viewer.get(`/api/books/${BOOK}/summary`)).status, 403, 'allowed (the route itself is a later module)');
  });

  it('the role check function agrees with the matrix', () => {
    const account = { isSuperAdmin: false, memberships: [{ bookId: BOOK, role: 'editor' }] };
    assert.equal(canAccess(account, BOOK, 'viewer'), true);
    assert.equal(canAccess(account, BOOK, 'editor'), true);
    assert.equal(canAccess(account, BOOK, 'admin'), false);
    assert.equal(canAccess(account, 'personal', 'viewer'), false);
    assert.equal(canAccess({ isSuperAdmin: true, memberships: [] }, 'personal', 'admin'), true);
  });
});
