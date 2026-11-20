const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { makeContext, withCookie, BOOK } = require('../api/helpers');
const { createAccountStore } = require('../../server/auth/accounts');
const R = require('../../server/auth/resources');

const base = `/api/books/${BOOK}`;
const PASSWORD = 'resource account passphrase';

// [method, path, resources that may use it]. Independent of the policy code so a change must be deliberate.
const LOOKUP = ['dashboard', 'ledger', 'reports', 'projects', 'settings'];
const MATRIX = [
  ['get', '/summary', ['dashboard']],
  ['get', '/entries', ['ledger']],
  ['get', '/entries?project=p1', ['ledger', 'projects']],
  ['post', '/transfers', ['ledger']],
  ['get', '/funds', LOOKUP],
  ['get', '/holders', LOOKUP],
  ['get', '/categories', LOOKUP],
  ['get', '/parties', [...LOOKUP, 'documents']],
  ['post', '/funds', ['settings']],
  ['post', '/parties', ['settings']],
  ['get', '/project-names', ['dashboard', 'ledger', 'reports', 'projects', 'documents']],
  ['get', '/projects', ['projects']],
  ['post', '/projects', ['projects']],
  ['get', '/years', ['ledger', 'projects', 'settings']],
  ['post', '/years/2020/close', ['settings']],
  ['get', '/reports/yearly', ['reports']],
  ['get', '/reports/pivot', ['reports']],
  ['get', '/reports/profit', ['dashboard', 'reports']],
  ['get', '/documents', ['documents']],
  ['get', '/documents/types', ['documents']],
  ['get', '/items', ['items']],
  ['post', '/items', ['items']],
  ['get', '/item-locations', ['items']],
  ['get', '/export?format=csv', ['settings']],
  ['get', '/members', ['settings']],
  ['put', '', ['settings']],
  ['get', '/profit', ['ledger', 'settings']],
  ['post', '/profit/preview', ['ledger']],
  ['post', '/profit/fetch-rate', ['ledger']],
  ['put', '/profit/tax', ['settings']],
  ['put', '/profit/rates/2020-01', ['ledger', 'settings']],
  ['delete', '/profit/rates/2020-01', ['settings']],
  ['put', '/appearance', ['settings']],
  ['get', '/entry-counts', ['settings']],
  ['post', '/entry-counts', []],
  ['get', '/nothing-here', []]
];

describe('page resources', () => {
  let ctx;
  beforeEach(async () => { ctx = await makeContext(); });
  afterEach(async () => { await ctx.close(); });

  const userWith = async (resources, email = 'user@example.com') => {
    await createAccountStore(ctx.repo.authStore).create({
      email, name: 'User', password: PASSWORD, memberships: [{ bookId: BOOK, role: 'admin' }], resources
    });
    return withCookie(ctx.app, `lsid=${(await ctx.auth.login(email, PASSWORD)).sid}`);
  };
  const codeWith = async resources => {
    const res = await ctx.api.post('/api/admin/access-codes').send({ name: 'Board', bookIds: [BOOK], ...(resources ? { resources } : {}) });
    assert.equal(res.status, 201);
    const signed = await request(ctx.app).post('/api/auth/access-code').set('cf-connecting-ip', '10.9.9.9').send({ code: res.body.accessCode.code });
    assert.equal(signed.status, 200);
    return { created: res.body.accessCode, api: withCookie(ctx.app, signed.headers['set-cookie'][0].split(';')[0]), signed: signed.body.account };
  };
  const call = (api, [method, path]) => {
    const req = api[method](`${base}${path}`);
    return ['post', 'put'].includes(method) ? req.send({}) : req;
  };

  const assertMatrix = async (api, have) => {
    for (const row of MATRIX) {
      const res = await call(api, row);
      const allowed = row[2].some(key => have.includes(key));
      const forbidden = res.status === 403 && /cannot use that page/.test(res.body.error || '');
      assert.equal(forbidden, !allowed, `${row[0].toUpperCase()} ${row[1]} with [${have}] -> ${res.status}`);
    }
  };

  it('a regular user with one resource reaches only that resource (book admin role does not widen it)', async () => {
    for (const key of R.RESOURCES) await assertMatrix(await userWith([key], `${key}@example.com`), [key]);
  });

  it('a default access code reaches only dashboard, ledger, reports and items', async () => {
    const { api, signed, created } = await codeWith();
    assert.deepEqual(signed.resources, R.DEFAULT_CODE_RESOURCES);
    assert.deepEqual(created.resources, ['dashboard', 'ledger', 'reports', 'items']);
    await assertMatrix(api, R.DEFAULT_CODE_RESOURCES);
    assert.equal((await api.get(`${base}/summary`)).status, 200);
    assert.equal((await api.get(`${base}/items`)).status, 200);
  });

  it('every single-resource access code is limited to it, and codes stay viewers', async () => {
    for (const key of R.RESOURCES) {
      const { api } = await codeWith([key]);
      await assertMatrix(api, [key]);
    }
  });

  it('explicit empty lists mean no pages', async () => {
    const { api, signed } = await codeWith([]);
    assert.deepEqual(signed.resources, []);
    await assertMatrix(api, []);
    const me = await api.get('/api/auth/me');
    assert.deepEqual(me.body.account.resources, []);
    assert.equal((await api.get('/api/books')).status, 200);
  });

  it('keeps a restricted page list when replacing an access code', async () => {
    const { api, created } = await codeWith(['items']);
    const reset = await ctx.api.post(`/api/admin/access-codes/${created.id}/reset`).send({});
    assert.equal(reset.status, 200);
    assert.deepEqual(reset.body.accessCode.resources, ['items']);
    assert.equal((await api.get(`${base}/items`)).status, 401);
    const login = await request(ctx.app).post('/api/auth/access-code').send({ code: reset.body.accessCode.code });
    assert.equal(login.status, 200);
    assert.deepEqual(login.body.account.resources, ['items']);
    const visitor = withCookie(ctx.app, login.headers['set-cookie'][0].split(';')[0]);
    assert.equal((await visitor.get(`${base}/items`)).status, 200);
    assert.equal((await visitor.get(`${base}/summary`)).status, 403);
  });

  it('regular accounts without a list keep full access; super admins always have every page', async () => {
    const full = await userWith(undefined, 'full@example.com');
    await assertMatrix(full, R.RESOURCES);
    const me = await full.get('/api/auth/me');
    assert.deepEqual(me.body.account.resources, R.RESOURCES);
    const list = await ctx.api.get('/api/admin/accounts');
    assert.equal(list.body.accounts.find(a => a.email === 'full@example.com').resourcesSet, false);

    const superId = list.body.accounts.find(a => a.isSuperAdmin).id;
    assert.equal((await ctx.api.put(`/api/admin/accounts/${superId}/resources`).send({ resources: [] })).status, 200);
    assert.deepEqual((await ctx.api.get('/api/auth/me')).body.account.resources, R.RESOURCES);
    assert.equal((await ctx.api.get(`${base}/projects`)).status, 200);
  });

  it('superadmin updates a user and a code live, with audit and validation', async () => {
    const user = await userWith(['items'], 'live@example.com');
    const id = (await ctx.api.get('/api/admin/accounts')).body.accounts.find(a => a.email === 'live@example.com').id;
    assert.equal((await user.get(`${base}/projects`)).status, 403);
    const res = await ctx.api.put(`/api/admin/accounts/${id}/resources`).send({ resources: ['projects', 'items'] });
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.account.resources, ['items', 'projects']);
    assert.equal((await user.get(`${base}/projects`)).status, 200);
    assert.equal((await ctx.api.put(`/api/admin/accounts/${id}/resources`).send({ resources: null })).body.account.resourcesSet, false);
    assert.equal((await ctx.api.put(`/api/admin/accounts/${id}/resources`).send({ resources: ['bogus'] })).status, 400);
    assert.equal((await user.put(`/api/admin/accounts/${id}/resources`).send({ resources: [] })).status, 403);
    assert.ok((await ctx.repo.authStore.log.list()).some(e => e.action === 'resources' && e.target === 'live@example.com'));

    const { api, created } = await codeWith();
    assert.equal((await api.get(`${base}/documents`)).status, 403);
    const edited = await ctx.api.put(`/api/admin/access-codes/${created.id}/resources`).send({ resources: ['documents'] });
    assert.deepEqual(edited.body.accessCode.resources, ['documents']);
    assert.equal((await api.get(`${base}/documents`)).status, 200);
    assert.equal((await api.get(`${base}/summary`)).status, 403);
    assert.equal((await api.get('/api/auth/me')).body.account.resources.join(), 'documents');
    assert.equal((await ctx.api.put(`/api/admin/access-codes/${created.id}/resources`).send({ resources: ['x'] })).status, 400);
    assert.ok((await ctx.repo.authStore.log.list()).some(e => e.action === 'code-resources'));

    await ctx.api.post(`/api/admin/access-codes/${created.id}/revoke`).send({});
    assert.equal((await ctx.api.put(`/api/admin/access-codes/${created.id}/resources`).send({ resources: [] })).status, 400);
  });

  it('a project-only account can change only project entries; a book admin cannot change resources', async () => {
    const user = await userWith(['projects']);
    assert.equal((await user.post(`${base}/entries`).send({})).status, 403);
    const withProject = await user.post(`${base}/entries`).send({ projectId: 'missing' });
    assert.notEqual(withProject.status, 403);
    assert.equal((await user.put(`${base}/members/someone`).send({ role: 'viewer' })).status, 403);

    const full = await userWith(undefined, 'bookadmin@example.com');
    assert.equal((await full.put('/api/admin/accounts/1/resources').send({ resources: [] })).status, 403);
  });

  it('a project-only account cannot read unfiltered, unprojected or mixed entries', async () => {
    const user = await userWith(['projects']);
    for (const q of ['', '?project=,%20,', '?project=%20', '?project=none', '?project=p1,none', '?project=none,p1']) {
      assert.equal((await user.get(`${base}/entries${q}`)).status, 403, q || '(none)');
    }
    assert.equal((await user.get(`${base}/entries?project=p1`)).status, 200);
    assert.equal((await ctx.api.get(`${base}/entries?project=none`)).status, 200);
  });

  it('a project-only account cannot change linked transfer legs', async () => {
    const fund = async name => (await ctx.api.post(`${base}/funds`).send({ name, kind: 'general' })).body.id;
    const [a, b] = [await fund('A'), await fund('B')];
    const project = (await ctx.api.post(`${base}/projects`).send({ name: 'P', kind: 'trip', fundId: null })).body.id;
    const t = await ctx.api.post(`${base}/transfers`).send({ date: '2024-01-02', fromFundId: a, toFundId: b, amount: 100 });
    assert.equal(t.status, 201, JSON.stringify(t.body));
    const leg = t.body.entries[0];
    await ctx.d1.prepare('UPDATE entries SET project_id = ? WHERE id = ? AND book_id = ?')
      .bind(project, leg.id, BOOK).run();
    assert.equal((await ctx.repo.ledger.getEntryRaw(BOOK, leg.id)).project_id, project);
    const user = await userWith(['projects']);
    assert.equal((await user.put(`${base}/entries/${leg.id}`).send({ comment: 'x' })).status, 403);
    assert.equal((await user.delete(`${base}/entries/${leg.id}`)).status, 403);
    assert.equal((await ctx.api.get(`${base}/entries?pageSize=5`)).body.count, 2);
  });

  it('projectNames carries no financial data', async () => {
    const created = await ctx.api.post(`${base}/projects`).send({ name: 'Trip', kind: 'trip', fundId: null });
    assert.equal(created.status, 201);
    const { api } = await codeWith();
    const names = await api.get(`${base}/project-names`);
    // Only id, name, kind and open/closed status: no budgets, totals or fund ids.
    assert.deepEqual(names.body, [{ id: created.body.id, name: 'Trip', kind: 'trip', status: 'open' }]);
  });
});

describe('stored resources', () => {
  let ctx;
  beforeEach(async () => { ctx = await makeContext(); });
  afterEach(async () => { await ctx.close(); });

  it('rejects malformed stored lists instead of granting access', async () => {
    const store = ctx.repo.authStore;
    const made = await createAccountStore(store).create({ email: 'bad@example.com', name: 'Bad', password: PASSWORD });
    for (const bad of ['not json', '{"a":1}', '"all"', '["bogus"]']) {
      await ctx.d1.prepare('UPDATE accounts SET resources = ? WHERE id = ?').bind(bad, made.id).run();
      await assert.rejects(() => store.accounts.findById(made.id), /resources/i, bad);
    }
    await ctx.d1.prepare('UPDATE accounts SET resources = NULL WHERE id = ?').bind(made.id).run();
    assert.equal((await store.accounts.findById(made.id)).resources, null);

    const code = await store.accessCodes.insert({ name: 'c', codeHash: 'h', bookIds: [BOOK], resources: [], createdBy: 'x', createdAt: new Date().toISOString() });
    await ctx.d1.prepare('UPDATE access_codes SET resources = ? WHERE id = ?').bind('oops', code.id).run();
    await assert.rejects(() => store.accessCodes.findById(code.id), /resources/i);
  });
});

describe('resource helpers', () => {
  it('keeps the frontend mirror in step with the server lists', async () => {
    const ui = await import('../../src/auth/resources.mjs');
    assert.deepEqual(ui.RESOURCES, R.RESOURCES);
    assert.deepEqual(ui.DEFAULT_CODE_RESOURCES, R.DEFAULT_CODE_RESOURCES);
    assert.deepEqual(ui.LOOKUP_READERS, R.LOOKUP_READERS);
    assert.deepEqual(ui.PARTY_READERS, R.PARTY_READERS);
    assert.deepEqual(ui.PROJECT_NAME_READERS, R.PROJECT_NAME_READERS);
    assert.ok(Object.isFrozen(R.DEFAULT_CODE_RESOURCES));
  });

  it('treats a corrupt resource value as no pages, never full access', () => {
    assert.deepEqual(R.effectiveResources({ resources: 'all' }), []);
    assert.deepEqual(R.effectiveResources({ accessCode: true, resources: {} }), []);
    assert.deepEqual(R.effectiveResources({ resources: null }), R.RESOURCES);
  });

  it('decides routes for single-page and no-page accounts', async () => {
    const { decideRoute, firstAllowed, hasResource } = await import('../../src/auth/resources.mjs');
    const code = { accessCode: true, resources: R.DEFAULT_CODE_RESOURCES };
    assert.deepEqual(decideRoute('/ledger', code), { allowed: true });
    assert.deepEqual(decideRoute('/', code), { allowed: true });
    for (const route of ['/settings', '/projects', '/projects/abc', '/documents', '/admin']) {
      assert.deepEqual(decideRoute(route, code), { allowed: false, redirect: '/', none: false }, route);
    }
    const itemsOnly = { resources: ['items'] };
    assert.deepEqual(decideRoute('/', itemsOnly), { allowed: false, redirect: '/items', none: false });
    assert.deepEqual(decideRoute('/unknown', itemsOnly), { allowed: false, redirect: '/items', none: false });
    assert.deepEqual(decideRoute('/items', itemsOnly), { allowed: true });
    const only = { resources: ['items'] };
    for (const route of ['/items/unknown', '/items/', '/ledger/x', '/reports/a/b', '/projects/a/b', '/admin/x', '/nope']) {
      assert.equal(decideRoute(route, only).allowed, false, route);
      assert.equal(decideRoute(route, { isSuperAdmin: true }).allowed, false, route);
    }
    assert.equal(decideRoute('/projects/abc', { resources: ['projects'] }).allowed, true);
    assert.equal(decideRoute('/projects/abc/edit', { resources: ['projects'] }).allowed, false);
    const none = { resources: [] };
    assert.deepEqual(decideRoute('/', none), { allowed: false, redirect: null, none: true });
    assert.equal(firstAllowed(none), null);
    const root = { isSuperAdmin: true, resources: [] };
    assert.equal(hasResource(root, 'settings'), true);
    assert.deepEqual(decideRoute('/admin', root), { allowed: true });
  });
});
