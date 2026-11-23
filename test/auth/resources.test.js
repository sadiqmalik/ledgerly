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
  ['get', '/project-names', ['dashboard', 'ledger', 'reports', 'projects', 'documents', 'diary']],
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
  ['get', '/export?format=csv', ['ledger', 'projects', 'documents', 'items']],
  ['get', '/members', ['settings']],
  ['put', '', ['settings']],
  ['get', '/profit', ['ledger', 'settings']],
  ['post', '/profit/preview', ['ledger']],
  ['post', '/profit/fetch-rate', ['ledger']],
  ['put', '/profit/tax', ['settings']],
  ['put', '/profit/rates/2020-01', ['ledger', 'settings']],
  ['delete', '/profit/rates/2020-01', ['settings']],
  ['put', '/appearance', ['settings']],
  ['put', '/timezone', ['settings']],
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

  // Strict policy audit: pages are per ledger, and a ledger the account has no role in is closed completely.
  const callAt = (api, bookId, [method, path]) => {
    const req = api[method](`/api/books/${bookId}${path}`);
    return ['post', 'put'].includes(method) ? req.send({}) : req;
  };
  const assertMatrixAt = async (api, bookId, have) => {
    for (const row of MATRIX) {
      const res = await callAt(api, bookId, row);
      const allowed = row[2].some(key => have.includes(key));
      const forbidden = res.status === 403 && /cannot use that page/.test(res.body.error || '');
      assert.equal(forbidden, !allowed, `${bookId}: ${row[0].toUpperCase()} ${row[1]} with [${have}] -> ${res.status}`);
    }
  };

  it('with different pages in two ledgers, each ledger gives exactly its own pages and a third ledger gives nothing', async () => {
    await ctx.d1.prepare("INSERT INTO books (id, name, created_at) VALUES ('third', 'Third', 'now')").run();
    for (const [first, second] of [[['items'], ['ledger']], [['dashboard', 'reports'], ['documents']], [['ledger', 'projects'], ['items', 'documents']]]) {
      const email = `multi-${first.join('')}@example.com`;
      await createAccountStore(ctx.repo.authStore).create({
        email, name: 'Multi', password: PASSWORD,
        memberships: [{ bookId: BOOK, role: 'admin', resources: first }, { bookId: 'personal', role: 'admin', resources: second }]
      });
      const api = withCookie(ctx.app, `lsid=${(await ctx.auth.login(email, PASSWORD)).sid}`);
      await assertMatrixAt(api, BOOK, first.filter(k => k !== 'settings'));
      await assertMatrixAt(api, 'personal', second.filter(k => k !== 'settings'));
      for (const row of MATRIX) assert.equal((await callAt(api, 'third', row)).status, 403, `third: ${row[0]} ${row[1]}`); // no role there
    }
  });

  it('an access code owned by an admin never reaches a page the admin lacks, nor a ledger the admin is not in', async () => {
    const owner = (await ctx.api.post('/api/admin/accounts').send({
      username: 'strict', name: 'Strict', password: PASSWORD, memberships: [{ bookId: BOOK, role: 'admin', resources: ['items', 'settings'] }]
    })).body.account;
    // A code asking for more pages than the owner has, and for a ledger the owner is not in, is capped or refused.
    const bad = await ctx.api.post('/api/admin/access-codes').send({ name: 'Wide', bookIds: ['personal'], accountId: owner.id });
    assert.equal(bad.status, 400);
    const made = await ctx.api.post('/api/admin/access-codes').send({ name: 'Wide', bookIds: [BOOK], accountId: owner.id, bookResources: { [BOOK]: ['items', 'ledger', 'documents', 'settings'] } });
    assert.equal(made.status, 201);
    const signed = await request(ctx.app).post('/api/auth/access-code').set('cf-connecting-ip', '10.9.9.8').send({ code: made.body.accessCode.code });
    const api = withCookie(ctx.app, signed.headers['set-cookie'][0].split(';')[0]);
    await assertMatrixAt(api, BOOK, ['items']); // not ledger, documents or settings
    for (const row of MATRIX) assert.equal((await callAt(api, 'personal', row)).status, 403, `personal: ${row[0]} ${row[1]}`);
  });

  const loginAs = async (username, memberships, loanMemberships = []) => {
    const res = await ctx.api.post('/api/admin/accounts').send({ username, name: username, password: PASSWORD, memberships, loanMemberships });
    assert.equal(res.status, 201);
    return withCookie(ctx.app, `lsid=${(await ctx.auth.login(username, PASSWORD)).sid}`);
  };

  it('a loan linked to a ledger needs the Loans page in that ledger, an unlinked one needs it anywhere', async () => {
    const linked = (await ctx.api.post('/api/loans').send({ name: 'Linked', borrower: 'A', lender: 'B', bookId: BOOK })).body;
    const free = (await ctx.api.post('/api/loans').send({ name: 'Free', borrower: 'A', lender: 'B' })).body;
    const loans = [{ registerId: linked.id, role: 'viewer' }, { registerId: free.id, role: 'viewer' }];
    const off = await loginAs('loansoff', [{ bookId: BOOK, role: 'editor', resources: ['dashboard'] }], loans);
    assert.deepEqual((await off.get('/api/loans')).body.map(r => r.name), ['Free']);
    assert.equal((await off.get(`/api/loans/${linked.id}`)).status, 403);
    assert.equal((await off.get(`/api/loans/${linked.id}/entries`)).status, 403);
    assert.equal((await off.get(`/api/loans/${free.id}`)).status, 200);
    const on = await loginAs('loanson', [{ bookId: BOOK, role: 'editor', resources: ['dashboard', 'loans'] }], loans);
    assert.deepEqual((await on.get('/api/loans')).body.map(r => r.name).sort(), ['Free', 'Linked']);
    assert.equal((await on.get(`/api/loans/${linked.id}`)).status, 200);
  });

  it('a loan shared with a second ledger opens when any linked ledger gives the Loans page', async () => {
    const shared = (await ctx.api.post('/api/loans').send({ name: 'Shared', borrower: 'A', lender: 'B', bookId: BOOK, extraLedgerIds: ['personal'] })).body;
    assert.deepEqual(shared.ledgerIds, [BOOK, 'personal']);
    assert.deepEqual(shared.ledgerNames, ['Family', 'Personal']);
    const loans = [{ registerId: shared.id, role: 'viewer' }];
    const memberships = (mainPages, extraPages) => [{ bookId: BOOK, role: 'editor', resources: mainPages }, { bookId: 'personal', role: 'editor', resources: extraPages }];
    const onlyExtra = await loginAs('extraonly', memberships(['dashboard'], ['dashboard', 'loans']), loans);
    assert.deepEqual((await onlyExtra.get('/api/loans')).body.map(r => r.name), ['Shared']);
    assert.equal((await onlyExtra.get(`/api/loans/${shared.id}`)).status, 200);
    const none = await loginAs('nolinked', memberships(['dashboard'], ['dashboard']), loans);
    assert.equal((await none.get('/api/loans')).status === 200 ? (await none.get('/api/loans')).body.length : 0, 0);
    assert.equal((await none.get(`/api/loans/${shared.id}`)).status, 403);
    // Validation and cleanup.
    assert.equal((await ctx.api.put(`/api/loans/${shared.id}`).send({ extraLedgerIds: [BOOK] })).status, 400);
    assert.equal((await ctx.api.post('/api/loans').send({ name: 'X', borrower: 'A', lender: 'B', extraLedgerIds: ['personal'] })).status, 400);
    assert.equal((await ctx.api.put(`/api/loans/${shared.id}`).send({ extraLedgerIds: [] })).body.ledgerIds.length, 1);
    await ctx.api.put(`/api/loans/${shared.id}`).send({ extraLedgerIds: ['personal'] }).expect(200);
    await ctx.api.delete(`/api/loans/${shared.id}`).expect(200);
    assert.equal((await ctx.d1.prepare('SELECT COUNT(*) AS n FROM loan_register_ledgers WHERE register_id = ?').bind(shared.id).first()).n, 0);
  });

  it('moving a loan to another main ledger needs the Admin role in both ledgers (super admin always)', async () => {
    const reg = (await ctx.api.post('/api/loans').send({ name: 'Mover', borrower: 'A', lender: 'B', bookId: BOOK })).body;
    const loans = [{ registerId: reg.id, role: 'admin' }];
    const editor = await loginAs('mveditor', [{ bookId: BOOK, role: 'editor', resources: ['loans'] }, { bookId: 'personal', role: 'admin', resources: ['loans'] }], loans);
    assert.equal((await editor.put(`/api/loans/${reg.id}`).send({ bookId: 'personal' })).status, 403); // only Editor in the source
    const target = await loginAs('mvtarget', [{ bookId: BOOK, role: 'admin', resources: ['loans'] }, { bookId: 'personal', role: 'editor', resources: ['loans'] }], loans);
    assert.equal((await target.put(`/api/loans/${reg.id}`).send({ bookId: 'personal' })).status, 403); // only Editor in the target
    const both = await loginAs('mvboth', [{ bookId: BOOK, role: 'admin', resources: ['loans'] }, { bookId: 'personal', role: 'admin', resources: ['loans'] }], loans);
    assert.equal((await both.put(`/api/loans/${reg.id}`).send({ bookId: 'personal' })).status, 200);
    assert.equal((await ctx.api.put(`/api/loans/${reg.id}`).send({ bookId: BOOK })).status, 200); // a super admin can always
    assert.equal((await both.put(`/api/loans/${reg.id}`).send({ name: 'Renamed' })).status, 200); // other edits are unchanged
  });

  it('a loan shows who created it, by name', async () => {
    const mine = (await ctx.api.post('/api/loans').send({ name: 'Who', borrower: 'A', lender: 'B' })).body;
    assert.equal(mine.createdByName, 'Tester');
    assert.equal((await ctx.api.get('/api/loans')).body.find(r => r.id === mine.id).createdByName, 'Tester');
    assert.equal((await ctx.api.get(`/api/loans/${mine.id}`)).body.createdByName, 'Tester');
  });

  it('the Notebook: needs the page in that ledger, never lets a notebook into a ledger without it, and codes only read', async () => {
    // Notebook page on in the first ledger only.
    const api = await loginAs('writer', [{ bookId: BOOK, role: 'editor', resources: ['diary'] }, { bookId: 'personal', role: 'editor', resources: ['ledger'] }]);
    assert.equal((await api.post('/api/diary/notebooks').send({ name: 'Wrong', bookId: 'personal' })).status, 404);
    const made = await api.post('/api/diary/notebooks').send({ name: 'Mine', bookId: BOOK });
    assert.equal(made.status, 201);
    // Someone without the page anywhere is refused outright; with it only in another ledger the notebook stays closed.
    const none = await loginAs('nopage', [{ bookId: BOOK, role: 'admin', resources: ['ledger'] }]);
    assert.equal((await none.get('/api/diary/notebooks')).status, 403);
    const other = await loginAs('otherledger', [{ bookId: BOOK, role: 'admin', resources: ['ledger'] }, { bookId: 'personal', role: 'admin', resources: ['diary'] }]);
    assert.deepEqual((await other.get('/api/diary/notebooks')).body.map(n => n.name), []);
    assert.equal((await other.get(`/api/diary/notebooks/${made.body.id}/entries`)).status, 404);
    // A viewer with the page can read but not write; an owned code with the page reads, one without is refused.
    const viewer = await loginAs('nbviewer', [{ bookId: BOOK, role: 'viewer', resources: ['diary'] }]);
    assert.equal((await viewer.get(`/api/diary/notebooks/${made.body.id}/entries`)).status, 200);
    assert.equal((await viewer.post(`/api/diary/notebooks/${made.body.id}/entries`).send({ title: 'x' })).status, 403);
    const owner = (await ctx.api.post('/api/admin/accounts').send({ username: 'nbowner', name: 'o', password: PASSWORD, memberships: [{ bookId: BOOK, role: 'admin', resources: ['diary', 'ledger'] }] })).body.account;
    const withNb = (await ctx.api.post('/api/admin/access-codes').send({ name: 'Has', bookIds: [BOOK], accountId: owner.id })).body.accessCode;
    const without = (await ctx.api.post('/api/admin/access-codes').send({ name: 'Not', bookIds: [BOOK], accountId: owner.id, bookResources: { [BOOK]: ['ledger'] } })).body.accessCode;
    const sign = async (code, ip) => withCookie(ctx.app, (await request(ctx.app).post('/api/auth/access-code').set('cf-connecting-ip', ip).send({ code })).headers['set-cookie'][0].split(';')[0]);
    const reader = await sign(withNb.code, '10.8.8.1');
    assert.equal((await reader.get(`/api/diary/notebooks/${made.body.id}/entries`)).status, 200);
    assert.equal((await reader.post(`/api/diary/notebooks/${made.body.id}/entries`).send({ title: 'x' })).status, 403);
    assert.equal((await reader.delete(`/api/diary/notebooks/${made.body.id}`)).status, 403);
    const blocked = await sign(without.code, '10.8.8.2');
    assert.equal((await blocked.get('/api/diary/notebooks')).status, 403);
    assert.equal((await blocked.get(`/api/diary/notebooks/${made.body.id}/entries`)).status, 403);
  });

  it('Notebook: an admin can be left out of some notebooks, and a code inherits that and can narrow further', async () => {
    const nb = async name => (await ctx.api.post('/api/diary/notebooks').send({ name, bookId: BOOK })).body;
    const [a, b, c] = [await nb('Alpha'), await nb('Beta'), await nb('Gamma')];
    const names = async api => (await api.get('/api/diary/notebooks')).body.map(n => n.name).sort();
    // Admin left out of Beta.
    const made = await ctx.api.post('/api/admin/accounts').send({
      username: 'nbadmin', name: 'N', password: PASSWORD,
      memberships: [{ bookId: BOOK, role: 'editor', resources: ['diary', 'ledger'], notebooksExcluded: [b.id] }]
    });
    assert.equal(made.status, 201);
    const admin = withCookie(ctx.app, `lsid=${(await ctx.auth.login('nbadmin', PASSWORD)).sid}`);
    assert.deepEqual(await names(admin), ['Alpha', 'Gamma']);
    assert.equal((await admin.get(`/api/diary/notebooks/${b.id}/entries`)).status, 404);
    assert.equal((await admin.put(`/api/diary/notebooks/${b.id}`).send({ name: 'x' })).status, 404);
    assert.equal((await admin.get(`/api/diary/notebooks/${a.id}/entries`)).status, 200);
    const sign = async (code, ip) => withCookie(ctx.app, (await request(ctx.app).post('/api/auth/access-code').set('cf-connecting-ip', ip).send({ code })).headers['set-cookie'][0].split(';')[0]);
    // A code inherits the admin's exclusion ...
    const inherit = (await ctx.api.post('/api/admin/access-codes').send({ name: 'Inherit', bookIds: [BOOK], accountId: made.body.account.id })).body.accessCode;
    assert.deepEqual(await names(await sign(inherit.code, '10.7.7.1')), ['Alpha', 'Gamma']);
    // ... and can also be limited to one notebook ("only"), or leave one more out ("exclude").
    const only = await ctx.api.post('/api/admin/access-codes').send({ name: 'Only', bookIds: [BOOK], accountId: made.body.account.id, notebookRules: { [BOOK]: { only: [a.id, b.id] } } });
    assert.equal(only.status, 201);
    assert.deepEqual(await names(await sign(only.body.accessCode.code, '10.7.7.2')), ['Alpha']); // Beta is left out by the admin
    const less = (await ctx.api.post('/api/admin/access-codes').send({ name: 'Less', bookIds: [BOOK], accountId: made.body.account.id, notebookRules: { [BOOK]: { exclude: [a.id] } } })).body.accessCode;
    assert.deepEqual(await names(await sign(less.code, '10.7.7.3')), ['Gamma']);
    // Rules survive in the code view and can be changed; an empty rule means no limit.
    const edited = await ctx.api.put(`/api/admin/access-codes/${less.id}/resources`).send({ resources: ['diary'], notebookRules: { [BOOK]: { exclude: [] } } });
    assert.equal(edited.status, 200);
    assert.deepEqual(edited.body.accessCode.notebookRules, {});
    assert.deepEqual(await names(await sign(less.code, '10.7.7.4')), ['Alpha', 'Gamma']);
    // A super administrator is never limited; the admin screens can list a ledger's notebooks (names only).
    assert.equal((await ctx.api.get('/api/diary/notebooks')).body.length >= 3, true);
    assert.deepEqual((await ctx.api.get(`/api/diary/ledger-notebooks?bookId=${BOOK}`)).body.map(n => n.name), ['Alpha', 'Beta', 'Gamma']);
    assert.equal((await admin.get(`/api/diary/ledger-notebooks?bookId=${BOOK}`)).status, 403); // an editor cannot
    void c;
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
    for (const key of R.CODE_RESOURCES) {
      const { api } = await codeWith([key]);
      await assertMatrix(api, [key]);
    }
  });

  it('an access code never gets the Settings page, even when asked for every page', async () => {
    assert.equal(R.CODE_RESOURCES.includes('settings'), false);
    const { api, signed } = await codeWith(R.RESOURCES);
    assert.deepEqual(signed.resources, R.CODE_RESOURCES);
    assert.equal((await api.get(`${base}/members`)).status, 403);
    assert.equal((await api.get(`${base}/export?format=csv`)).status, 403);
    assert.equal((await api.put(base).send({ name: 'x' })).status, 403);
    assert.equal((await api.post(`${base}/funds`).send({ name: 'x', currency: 'PKR' })).status, 403);
    assert.equal((await api.get(`${base}/entries`)).status, 200);
    assert.equal((await api.post(`${base}/entries`).send({})).status, 403); // view only: never a write
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
    await assertMatrix(full, R.DEFAULT_ALL_RESOURCES);
    const me = await full.get('/api/auth/me');
    assert.deepEqual(me.body.account.resources, R.DEFAULT_ALL_RESOURCES);
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
    assert.deepEqual(ui.CODE_RESOURCES, R.CODE_RESOURCES);
    assert.deepEqual(ui.DEFAULT_ALL_RESOURCES, R.DEFAULT_ALL_RESOURCES);
    assert.deepEqual(ui.DEFAULT_CODE_RESOURCES, R.DEFAULT_CODE_RESOURCES);
    assert.deepEqual(ui.LOOKUP_READERS, R.LOOKUP_READERS);
    assert.deepEqual(ui.PARTY_READERS, R.PARTY_READERS);
    assert.deepEqual(ui.PROJECT_NAME_READERS, R.PROJECT_NAME_READERS);
    assert.ok(Object.isFrozen(R.DEFAULT_CODE_RESOURCES));
  });

  it('treats a corrupt resource value as no pages, never full access', () => {
    assert.deepEqual(R.effectiveResources({ resources: 'all' }), []);
    assert.deepEqual(R.effectiveResources({ accessCode: true, resources: {} }), []);
    assert.deepEqual(R.effectiveResources({ resources: null }), R.DEFAULT_ALL_RESOURCES);
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

  it('opens the Notebook (diary routes) only for super administrators and admins it was switched on for', async () => {
    const { decideRoute, routeResource } = await import('../../src/auth/resources.mjs');
    const full = { resources: ['dashboard', 'ledger', 'documents'] }; // no Notebook page
    const code = { accessCode: true, resources: R.DEFAULT_CODE_RESOURCES };
    const root = { isSuperAdmin: true, resources: [] };
    const chosen = { resources: ['diary'] };
    for (const route of ['/diary', '/diary/abc', '/diary/abc/def']) {
      assert.equal(routeResource(route), 'diary', route);
      assert.deepEqual(decideRoute(route, root), { allowed: true }, route);
      assert.deepEqual(decideRoute(route, chosen), { allowed: true }, route);
      for (const who of [full, code]) assert.equal(decideRoute(route, who).allowed, false, route);
    }
    for (const route of ['/diary/', '/diary/a/b/c', '/diaryx']) assert.equal(decideRoute(route, root).allowed, false, route);
    // Opt-in: "every page" for a regular account never includes the Notebook; an access code may have it (read only, see diary.test.js).
    assert.equal(R.effectiveResources({ resources: null }).includes('diary'), false);
    assert.equal(R.effectiveResources({ accessCode: true, resources: ['diary', 'items'] }).includes('diary'), true);
    assert.equal(R.effectiveResources({ accessCode: true }).includes('diary'), false); // opt-in
    assert.equal(R.DEFAULT_CODE_RESOURCES.includes('diary'), false);
    assert.equal(R.effectiveResources({ isSuperAdmin: true }).includes('diary'), true);
    assert.deepEqual(R.requiredResources('GET', '/diary', {}), []); // not under a book any more: /api/diary checks itself
  });
});

describe('forBook', () => {
  const account = { memberships: [{ bookId: 'a', role: 'viewer', resources: ['items'] }, { bookId: 'b', role: 'viewer' }], resources: ['ledger'] };
  it('uses a ledger\'s own pages there and the global pages elsewhere', () => {
    assert.deepEqual(R.effectiveResources(R.forBook(account, 'a')), ['items']);
    assert.deepEqual(R.effectiveResources(R.forBook(account, 'b')), ['ledger']);
    assert.equal(R.hasResourceAnywhere(account, 'items'), true);
    assert.equal(R.hasResourceAnywhere(account, 'documents'), false);
  });
  it('never narrows a super administrator', () => {
    const sa = { isSuperAdmin: true, memberships: [{ bookId: 'a', role: 'admin', resources: [] }] };
    assert.equal(R.forBook(sa, 'a'), sa);
  });
});
