const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { makeContext, withCookie, BOOK, TESTER } = require('../api/helpers');
const { createAuthService } = require('../../server/auth/service');
const { createAccountStore } = require('../../server/auth/accounts');
const { IP_MAX_FAILURES } = require('../../server/auth/accessCodes');

const base = `/api/books/${BOOK}`;

describe('access codes', () => {
  let ctx;
  beforeEach(async () => { ctx = await makeContext(); });
  afterEach(async () => { await ctx.close(); });

  const createCode = async (bookIds = [BOOK], name = 'Board') => {
    const res = await ctx.api.post('/api/admin/access-codes').send({ name, bookIds });
    assert.equal(res.status, 201);
    return res.body.accessCode;
  };
  const signIn = (code, ip = '10.0.0.1') =>
    request(ctx.app).post('/api/auth/access-code').set('cf-connecting-ip', ip).send({ code });
  const cookieOf = res => withCookie(ctx.app, res.headers['set-cookie'][0].split(';')[0]);

  it('can be given the Notebook page (opt-in), and a code without it is refused on notebooks', async () => {
    const mk = async resources => {
      const made = await ctx.api.post('/api/admin/access-codes').send({ name: 'Board', bookIds: [BOOK], ...(resources ? { resources } : {}) });
      assert.equal(made.status, 201);
      assert.equal(made.body.accessCode.resources.includes('diary'), !!resources);
      return cookieOf(await signIn(made.body.accessCode.code, resources ? '10.0.0.2' : '10.0.0.3'));
    };
    assert.equal((await (await mk(['diary'])).get('/api/diary/notebooks')).status, 200);
    assert.equal((await (await mk()).get('/api/diary/notebooks')).status, 403);
  });

  it('can give a ledger its own pages instead of the global ones', async () => {
    const made = await ctx.api.post('/api/admin/access-codes').send({
      name: 'Split', bookIds: [BOOK], resources: ['ledger'], bookResources: { [BOOK]: ['items'], other: ['documents'] }
    });
    assert.equal(made.status, 201);
    assert.deepEqual(made.body.accessCode.bookResources, { [BOOK]: ['items'] }); // unknown ledgers are dropped
    const api = cookieOf(await signIn(made.body.accessCode.code, '10.0.0.7'));
    assert.equal((await api.get(`${base}/items`)).status, 200);
    assert.equal((await api.get(`${base}/entries`)).status, 403);
    const changed = await ctx.api.put(`/api/admin/access-codes/${made.body.accessCode.id}/resources`).send({ resources: ['ledger'], bookResources: {} });
    assert.equal(changed.status, 200);
    assert.equal((await api.get(`${base}/entries`)).status, 200);
    assert.equal((await api.get(`${base}/items`)).status, 403);
  });

  it('can change which ledgers a code opens', async () => {
    const code = await createCode([BOOK]);
    const api = cookieOf(await signIn(code.code, '10.0.0.8'));
    const changed = await ctx.api.put(`/api/admin/access-codes/${code.id}/resources`).send({ resources: code.resources, bookIds: ['personal'] });
    assert.equal(changed.status, 200);
    assert.deepEqual(changed.body.accessCode.bookIds, ['personal']);
    assert.equal((await api.get(`${base}/items`)).status, 403);
    assert.equal((await api.get('/api/books/personal/items')).status, 200);
    const bad = await ctx.api.put(`/api/admin/access-codes/${code.id}/resources`).send({ resources: code.resources, bookIds: ['nope'] });
    assert.equal(bad.status, 400);
  });

  it('signs in with a code and gets viewer access to the named book only', async () => {
    const created = await createCode();
    const res = await signIn(created.code);
    assert.equal(res.status, 200);
    assert.equal(res.body.account.accessCode, true);
    assert.equal(res.body.account.isSuperAdmin, false);
    assert.deepEqual(res.body.account.memberships, [{ bookId: BOOK, role: 'viewer' }]);
    assert.match(res.headers['set-cookie'][0], /HttpOnly/);
    const api = cookieOf(res);
    assert.equal((await api.get(`${base}/summary`)).status, 200);
    assert.equal((await api.get('/api/books/personal/summary')).status, 403);
    const books = await api.get('/api/books');
    assert.deepEqual(books.body.map(b => b.id), [BOOK]);
    assert.equal(books.body[0].role, 'viewer');
  });

  it('generates a strong code when none is given, and matches it exactly', async () => {
    const created = await createCode();
    assert.match(created.code, /^[A-Z2-9]{5}(-[A-Z2-9]{5}){3}$/);
    assert.equal((await signIn(created.code.toLowerCase(), '10.3.3.3')).status, 401);
    assert.equal((await signIn(` ${created.code} `, '10.3.3.4')).status, 200);
  });

  it('signs in with an admin-chosen simple code, case-sensitive and not rewritten', async () => {
    const res = await ctx.api.post('/api/admin/access-codes').send({ name: 'Family', bookIds: [BOOK], code: ' family-view-2026 ' });
    assert.equal(res.status, 201);
    assert.equal(res.body.accessCode.code, 'family-view-2026');
    assert.equal((await signIn('family-view-2026')).status, 200);
    assert.equal((await signIn('FAMILY-VIEW-2026', '10.4.4.4')).status, 401);
    assert.equal((await signIn('familyview2026', '10.4.4.4')).status, 401);
    const list = JSON.stringify((await ctx.api.get('/api/admin/access-codes')).body);
    assert.ok(!list.includes('family-view-2026'));
    const rows = JSON.stringify(await ctx.d1.prepare('SELECT * FROM access_codes').all());
    assert.ok(!rows.includes('family-view-2026'));
    const log = JSON.stringify(await ctx.d1.prepare('SELECT * FROM account_log').all());
    assert.ok(!log.includes('family-view-2026'));
  });

  it('rejects a duplicate code (even after revoking) and out-of-range custom codes', async () => {
    const first = await ctx.api.post('/api/admin/access-codes').send({ name: 'A', bookIds: [BOOK], code: 'family-view-2026' });
    assert.equal(first.status, 201);
    const dup = await ctx.api.post('/api/admin/access-codes').send({ name: 'B', bookIds: [BOOK], code: 'family-view-2026' });
    assert.equal(dup.status, 400);
    assert.match(dup.body.error, /already in use/);
    await ctx.api.post(`/api/admin/access-codes/${first.body.accessCode.id}/revoke`).send({});
    assert.equal((await ctx.api.post('/api/admin/access-codes').send({ name: 'C', bookIds: [BOOK], code: 'family-view-2026' })).status, 400);
    for (const code of ['short', 'x'.repeat(65), 'bad\ncode-123']) {
      assert.equal((await ctx.api.post('/api/admin/access-codes').send({ name: 'D', bookIds: [BOOK], code })).status, 400);
    }
  });

  it('never allows writes, admin routes or password changes', async () => {
    const api = cookieOf(await signIn((await createCode()).code));
    assert.equal((await api.post(`${base}/entries`).send({})).status, 403);
    assert.equal((await api.put(`${base}`).send({ name: 'x' })).status, 403);
    assert.equal((await api.delete(`${base}`)).status, 403);
    assert.equal((await api.get(`${base}/members`)).status, 403);
    assert.equal((await api.get(`${base}/export?format=json`)).status, 403);
    assert.equal((await api.post('/api/books').send({ name: 'New' })).status, 403);
    assert.equal((await api.get('/api/admin/accounts')).status, 403);
    assert.equal((await api.get('/api/admin/access-codes')).status, 403);
    assert.equal((await api.post('/api/admin/access-codes').send({ name: 'x', bookIds: [BOOK] })).status, 403);
    assert.equal((await api.post('/api/auth/password').send({ current: 'a', new: 'b' })).status, 403);
  });

  it('lists codes without ever exposing the code or its hash, and stores only a hash', async () => {
    const created = await createCode();
    const list = await ctx.api.get('/api/admin/access-codes');
    assert.equal(list.status, 200);
    assert.equal(list.body.accessCodes.length, 1);
    assert.equal(list.body.accessCodes[0].name, 'Board');
    assert.equal(list.body.accessCodes[0].createdBy, TESTER.email);
    const text = JSON.stringify(list.body);
    assert.ok(!text.includes(created.code.replace(/-/g, '')) && !text.includes(created.code));
    assert.ok(!/hash/i.test(text));
    const row = await ctx.d1.prepare('SELECT * FROM access_codes').first();
    assert.ok(!JSON.stringify(row).includes(created.code.replace(/-/g, '')));
    assert.match(row.code_hash, /^[0-9a-f]{64}$/);
  });

  it('validates creation: name, books that exist, at least one', async () => {
    assert.equal((await ctx.api.post('/api/admin/access-codes').send({ name: '', bookIds: [BOOK] })).status, 400);
    assert.equal((await ctx.api.post('/api/admin/access-codes').send({ name: 'x', bookIds: [] })).status, 400);
    assert.equal((await ctx.api.post('/api/admin/access-codes').send({ name: 'x', bookIds: ['nope'] })).status, 400);
  });

  it('revoking signs the session out immediately and refuses the code afterwards', async () => {
    const created = await createCode();
    const api = cookieOf(await signIn(created.code));
    assert.equal((await api.get(`${base}/summary`)).status, 200);
    const revoked = await ctx.api.post(`/api/admin/access-codes/${created.id}/revoke`).send({});
    assert.equal(revoked.status, 200);
    assert.ok(revoked.body.accessCode.revokedAt);
    assert.equal((await api.get(`${base}/summary`)).status, 401);
    assert.equal((await signIn(created.code, '10.0.0.2')).status, 401);
    assert.equal((await ctx.api.post('/api/admin/access-codes/missing/revoke').send({})).status, 404);
  });

  it('restores a revoked code so the same code works again', async () => {
    const created = await createCode();
    assert.equal((await ctx.api.post(`/api/admin/access-codes/${created.id}/restore`).send({})).status, 400); // not revoked
    await ctx.api.post(`/api/admin/access-codes/${created.id}/revoke`).send({});
    assert.equal((await signIn(created.code, '10.0.0.3')).status, 401);
    const restored = await ctx.api.post(`/api/admin/access-codes/${created.id}/restore`).send({});
    assert.equal(restored.status, 200);
    assert.equal(restored.body.accessCode.revokedAt, null);
    assert.equal((await cookieOf(await signIn(created.code, '10.0.0.4')).get(`${base}/summary`)).status, 200);
    assert.equal((await ctx.api.post('/api/admin/access-codes/missing/restore').send({})).status, 404);
  });

  it('deletes an active code permanently: signs out its session, refuses the code, keeps the audit trail', async () => {
    const created = await createCode();
    const other = await createCode([BOOK], 'Other');
    const api = cookieOf(await signIn(created.code));
    const otherApi = cookieOf(await signIn(other.code, '10.0.0.3'));
    const res = await ctx.api.delete(`/api/admin/access-codes/${created.id}`);
    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.deepEqual(res.body.deleted, { id: created.id });
    assert.equal((await api.get(`${base}/entries`)).status, 401);
    assert.equal((await otherApi.get(`${base}/summary`)).status, 200);
    assert.equal((await signIn(created.code, '10.0.0.2')).status, 401);
    const list = (await ctx.api.get('/api/admin/access-codes')).body.accessCodes;
    assert.deepEqual(list.map(c => c.id), [other.id]);
    const stored = await ctx.d1.prepare('SELECT id FROM access_codes WHERE id = ?').bind(created.id).all();
    assert.equal(stored.results.length, 0);
    const sessions = await ctx.d1.prepare('SELECT id FROM sessions WHERE access_code_id = ?').bind(created.id).all();
    assert.equal(sessions.results.length, 0);
    const log = (await ctx.d1.prepare('SELECT * FROM account_log WHERE target = ? ORDER BY at').bind(`code:${created.id}`).all()).results;
    const entry = log.find(r => r.action === 'delete-access-code');
    assert.ok(entry);
    assert.ok(log.some(r => r.action === 'create-access-code'));
    assert.equal(JSON.parse(entry.detail).name, 'Board');
    assert.ok(!JSON.stringify(log).includes(created.code));
  });

  it('deletes a revoked code and answers 404 for a missing or already deleted one', async () => {
    const created = await createCode();
    await ctx.api.post(`/api/admin/access-codes/${created.id}/revoke`).send({});
    assert.equal((await ctx.api.delete(`/api/admin/access-codes/${created.id}`)).status, 200);
    assert.equal((await ctx.api.get('/api/admin/access-codes')).body.accessCodes.length, 0);
    assert.equal((await ctx.api.delete(`/api/admin/access-codes/${created.id}`)).status, 404);
    assert.equal((await ctx.api.delete('/api/admin/access-codes/missing')).status, 404);
  });

  it('only a super administrator may delete a code', async () => {
    const created = await createCode();
    const url = `/api/admin/access-codes/${created.id}`;
    assert.equal((await request(ctx.app).delete(url)).status, 401);
    assert.equal((await cookieOf(await signIn(created.code)).delete(url)).status, 403);
    await createAccountStore(ctx.repo.authStore).create({ email: 'plain@example.com', name: 'Plain', password: 'plain user passphrase 1', isSuperAdmin: false });
    const { sid } = await ctx.auth.login('plain@example.com', 'plain user passphrase 1');
    assert.equal((await withCookie(ctx.app, `lsid=${sid}`).delete(url)).status, 403);
    assert.equal((await ctx.api.get('/api/admin/access-codes')).body.accessCodes.length, 1);
  });

  it('throttles repeated wrong guesses per client, even for the right code', async () => {
    const created = await createCode();
    for (let i = 0; i < IP_MAX_FAILURES; i += 1) {
      assert.equal((await signIn('AAAAA-AAAAA-AAAAA-AAAAA', '10.9.9.9')).status, 401);
    }
    assert.equal((await signIn(created.code, '10.9.9.9')).status, 429);
    assert.equal((await signIn(created.code, '10.1.1.1')).status, 200);
  });

  it('counts parallel wrong guesses atomically and the lock persists across service instances', async () => {
    const created = await createCode();
    const results = await Promise.all(Array.from({ length: IP_MAX_FAILURES + 4 }, () => signIn('AAAAA-AAAAA-AAAAA-AAAAA', '10.7.7.7')));
    assert.ok(results.every(r => r.status === 401 || r.status === 429));
    const row = await ctx.d1.prepare('SELECT failures, locked_until FROM access_code_attempts WHERE failures >= ? AND locked_until IS NOT NULL').bind(IP_MAX_FAILURES).first();
    assert.ok(row, 'the failures were all counted and the lock was set');
    assert.equal((await signIn(created.code, '10.7.7.7')).status, 429);
    const fresh = createAuthService(ctx.repo.authStore, { cookieSecure: false });
    await assert.rejects(() => fresh.loginWithCode(created.code, '10.7.7.7'), error => error.status === 429);
    assert.equal((await signIn(created.code, '10.7.7.8')).status, 200);
  });

  it('rejects malformed input as an invalid code', async () => {
    assert.equal((await signIn('short', '10.2.2.2')).status, 401);
    assert.equal((await signIn({ a: 1 }, '10.2.2.2')).status, 401);
    assert.equal((await signIn('x'.repeat(500), '10.2.2.2')).status, 401);
  });

  it('leaves email and password sign-in unchanged', async () => {
    const res = await ctx.anonymous.post('/api/auth/login').send({ email: TESTER.email, password: TESTER.password });
    assert.equal(res.status, 200);
    assert.equal(res.body.account.accessCode, undefined);
    await createAccountStore(ctx.repo.authStore).create({ email: 'v@example.com', name: 'V', password: 'viewer passphrase 123' });
    assert.equal((await ctx.anonymous.post('/api/auth/login').send({ email: 'v@example.com', password: 'bad bad bad bad' })).status, 401);
  });

  it('requires a super administrator to manage codes', async () => {
    assert.equal((await ctx.anonymous.get('/api/admin/access-codes')).status, 401);
  });

  it('resets a code: old code and sessions end, new code is viewer-only with the same name and scope', async () => {
    const created = await createCode();
    const oldApi = cookieOf(await signIn(created.code));
    assert.equal((await oldApi.get(`${base}/summary`)).status, 200);
    const res = await ctx.api.post(`/api/admin/access-codes/${created.id}/reset`).send({ code: ' replaced-code-2026 ' });
    assert.equal(res.status, 200);
    assert.equal(res.body.accessCode.code, 'replaced-code-2026');
    assert.equal(res.body.accessCode.id, created.id);
    assert.equal(res.body.accessCode.name, 'Board');
    assert.deepEqual(res.body.accessCode.bookIds, created.bookIds);
    assert.equal(res.body.accessCode.revokedAt, null);
    assert.equal((await oldApi.get(`${base}/summary`)).status, 401);
    assert.equal((await signIn(created.code, '10.5.5.5')).status, 401);
    const fresh = await signIn('replaced-code-2026', '10.5.5.6');
    assert.equal(fresh.status, 200);
    assert.equal(fresh.body.account.isSuperAdmin, false);
    assert.deepEqual(fresh.body.account.memberships, [{ bookId: BOOK, role: 'viewer' }]);
    const api = cookieOf(fresh);
    assert.equal((await api.get(`${base}/summary`)).status, 200);
    assert.equal((await api.get('/api/books/personal/summary')).status, 403);
    assert.equal((await api.post(`${base}/entries`).send({})).status, 403);
    const list = await ctx.api.get('/api/admin/access-codes');
    assert.equal(list.body.accessCodes.length, 1);
    assert.ok(!JSON.stringify(list.body).includes('replaced-code-2026') && !/hash/i.test(JSON.stringify(list.body)));
    const stored = JSON.stringify([await ctx.d1.prepare('SELECT * FROM access_codes').all(), await ctx.d1.prepare('SELECT * FROM account_log').all()]);
    assert.ok(!stored.includes('replaced-code-2026') && !stored.includes(created.code));
    assert.match(stored, /reset-access-code/);
  });

  it('reset generates a strong code when blank and rejects invalid, duplicate, same, revoked and missing', async () => {
    const a = await createCode();
    const other = await ctx.api.post('/api/admin/access-codes').send({ name: 'Other', bookIds: [BOOK], code: 'other-code-2026' });
    const url = id => `/api/admin/access-codes/${id}/reset`;
    const generated = await ctx.api.post(url(a.id)).send({});
    assert.equal(generated.status, 200);
    assert.match(generated.body.accessCode.code, /^[A-Z2-9]{5}(-[A-Z2-9]{5}){3}$/);
    assert.equal((await signIn(a.code, '10.6.6.1')).status, 401);
    assert.equal((await signIn(generated.body.accessCode.code, '10.6.6.2')).status, 200);
    for (const code of ['short', 'x'.repeat(65), 'bad\ncode-123']) {
      assert.equal((await ctx.api.post(url(a.id)).send({ code })).status, 400);
    }
    const dup = await ctx.api.post(url(a.id)).send({ code: 'other-code-2026' });
    assert.equal(dup.status, 400);
    assert.match(dup.body.error, /already in use/);
    const same = await ctx.api.post(url(a.id)).send({ code: generated.body.accessCode.code });
    assert.equal(same.status, 400);
    assert.equal((await signIn(generated.body.accessCode.code, '10.6.6.3')).status, 200);
    assert.equal((await signIn('other-code-2026', '10.6.6.4')).status, 200);
    await ctx.api.post(`/api/admin/access-codes/${other.body.accessCode.id}/revoke`).send({});
    const revoked = await ctx.api.post(url(other.body.accessCode.id)).send({ code: 'brand-new-code-1' });
    assert.equal(revoked.status, 400);
    assert.match(revoked.body.error, /revoked/);
    assert.equal((await signIn('brand-new-code-1', '10.6.6.5')).status, 401);
    assert.equal((await ctx.api.post(url('missing')).send({})).status, 404);
  });

  it('refuses a login whose code is reset between authentication and session creation', async () => {
    const created = await createCode();
    const service = createAuthService(ctx.repo.authStore, { cookieSecure: false });
    const store = ctx.repo.authStore;
    const insert = store.sessions.insert;
    store.sessions.insert = async session => {
      store.sessions.insert = insert;
      await insert.call(store.sessions, session);
      const reset = await ctx.api.post(`/api/admin/access-codes/${created.id}/reset`).send({ code: 'raced-code-2026' });
      assert.equal(reset.status, 200);
    };
    try {
      await assert.rejects(() => service.loginWithCode(created.code, '10.8.8.8'), error => error.status === 401);
    } finally {
      store.sessions.insert = insert;
    }
    assert.equal((await ctx.d1.prepare('SELECT COUNT(*) AS n FROM sessions WHERE access_code_id = ?').bind(created.id).first()).n, 0);
    assert.equal((await signIn('raced-code-2026', '10.8.8.9')).status, 200);
  });

  it('refuses a login whose session was created before a reset landed, leaving no session', async () => {
    const created = await createCode();
    const service = createAuthService(ctx.repo.authStore, { cookieSecure: false });
    const store = ctx.repo.authStore;
    const findById = store.accessCodes.findById;
    store.accessCodes.findById = async id => {
      store.accessCodes.findById = findById;
      const reset = await ctx.api.post(`/api/admin/access-codes/${created.id}/reset`).send({ code: 'raced-code-2027' });
      assert.equal(reset.status, 200);
      return findById.call(store.accessCodes, id);
    };
    try {
      await assert.rejects(() => service.loginWithCode(created.code, '10.8.8.10'), error => error.status === 401);
    } finally {
      store.accessCodes.findById = findById;
    }
    assert.equal((await ctx.d1.prepare('SELECT COUNT(*) AS n FROM sessions WHERE access_code_id = ?').bind(created.id).first()).n, 0);
  });

  it('only a super administrator can reset a code', async () => {
    const created = await createCode();
    assert.equal((await ctx.anonymous.post(`/api/admin/access-codes/${created.id}/reset`).send({})).status, 401);
    const viewer = cookieOf(await signIn(created.code));
    assert.equal((await viewer.post(`/api/admin/access-codes/${created.id}/reset`).send({})).status, 403);
    assert.equal((await signIn(created.code, '10.7.7.7')).status, 200);
  });
});
