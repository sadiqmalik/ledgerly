const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { makeContext, withCookie, BOOK } = require('./helpers');
const { createAccountStore } = require('../../server/auth/accounts');

const PASS = 'loan test account passphrase';
const body = (over = {}) => ({ name: 'Car loan', borrower: 'Ali', lender: 'Bilal', ...over });
const entry = (over = {}) => ({ kind: 'taken', amount: 100000, date: '2026-03-01', receiver: 'Ali', comment: 'first', ...over });

describe('loan registers', () => {
  let ctx; let regA; let regB; let entryA; let entryB;
  const users = {};
  const actors = {};

  // Makes an account with the given loan memberships / pages and returns a cookie-bound client.
  const makeUser = async (key, { loanMemberships = [], resources = null, isSuperAdmin = false } = {}) => {
    const account = await createAccountStore(ctx.repo.authStore).create({
      email: `${key}@example.com`, name: key, password: PASS, loanMemberships, resources, isSuperAdmin
    });
    const { sid } = await ctx.auth.login(`${key}@example.com`, PASS);
    users[key] = account;
    actors[key] = withCookie(ctx.app, `lsid=${sid}`);
  };

  before(async () => {
    ctx = await makeContext();
    regA = (await ctx.api.post('/api/loans').send(body({ name: 'A' })).expect(201)).body;
    regB = (await ctx.api.post('/api/loans').send(body({ name: 'B' })).expect(201)).body;
    entryA = (await ctx.api.post(`/api/loans/${regA.id}/entries`).send(entry()).expect(201)).body;
    entryB = (await ctx.api.post(`/api/loans/${regB.id}/entries`).send(entry()).expect(201)).body;
    const m = (registerId, role) => [{ registerId, role }];
    await makeUser('viewer', { loanMemberships: m(regA.id, 'viewer') });
    await makeUser('editor', { loanMemberships: m(regA.id, 'editor') });
    await makeUser('admin', { loanMemberships: m(regA.id, 'admin') });
    await makeUser('other', { loanMemberships: m(regB.id, 'admin') });
    await makeUser('nopage', { loanMemberships: m(regA.id, 'admin'), resources: ['ledger'] });
    await makeUser('plain', {});
  });
  after(async () => { await ctx.close(); });

  it('creates registers, makes the creator admin and totals correctly', async () => {
    const res = await actors.plain.post('/api/loans').send(body({ name: 'Mine', description: 'x', currency: 'usd' })).expect(201);
    assert.equal(res.body.role, 'admin');
    assert.equal(res.body.currency, 'USD');
    assert.deepEqual(res.body.totals, { taken: 0, returned: 0, balance: 0, count: 0 });
    const me = await actors.plain.get('/api/auth/me').expect(200);
    assert.ok(me.body.account.loanMemberships.some(m => m.registerId === res.body.id && m.role === 'admin'));
    await actors.plain.get(`/api/loans/${res.body.id}`).expect(200);
    await actors.plain.delete(`/api/loans/${res.body.id}`).expect(200);
    await actors.plain.get(`/api/loans/${res.body.id}`).expect(403);
    const after = await actors.plain.get('/api/auth/me');
    assert.deepEqual(after.body.account.loanMemberships, []);
  });

  it('a loan can be linked to a ledger, relinked or unlinked; unknown ledgers are refused; a deleted ledger unlinks it', async () => {
    const made = (await ctx.api.post('/api/loans').send(body({ name: 'Linked', bookId: BOOK })).expect(201)).body;
    assert.equal(made.bookId, BOOK);
    assert.equal(regA.bookId, null); // loans made without a ledger stay unlinked
    assert.equal((await ctx.api.post('/api/loans').send(body({ name: 'X', bookId: 'nope' }))).status, 404);
    assert.equal((await ctx.api.put(`/api/loans/${made.id}`).send({ bookId: null })).body.bookId, null);
    assert.equal((await ctx.api.put(`/api/loans/${made.id}`).send({ bookId: BOOK })).body.bookId, BOOK);
    assert.equal((await ctx.api.put(`/api/loans/${made.id}`).send({ bookId: 'nope' })).status, 404);
    await ctx.repo.books.create({ id: 'tmp_loan_book', name: 'Temp', baseCurrency: 'PKR', createdAt: new Date().toISOString() });
    await ctx.api.put(`/api/loans/${made.id}`).send({ bookId: 'tmp_loan_book' }).expect(200);
    await ctx.repo.books.remove('tmp_loan_book');
    assert.equal((await ctx.api.get(`/api/loans/${made.id}/entries`)).body.register.bookId, null);
  });

  it('moving the main ledger drops it from the extra ledgers and keeps the old one only when chosen', async () => {
    await ctx.repo.books.create({ id: 'tmp_move_book', name: 'Move', baseCurrency: 'PKR', createdAt: new Date().toISOString() });
    const made = (await ctx.api.post('/api/loans').send(body({ name: 'Mover', bookId: BOOK, extraLedgerIds: ['tmp_move_book'] })).expect(201)).body;
    const moved = (await ctx.api.put(`/api/loans/${made.id}`).send({ bookId: 'tmp_move_book', extraLedgerIds: ['tmp_move_book'] }).expect(200)).body;
    assert.equal(moved.bookId, 'tmp_move_book');
    assert.deepEqual(moved.ledgerIds, ['tmp_move_book']);
    const kept = (await ctx.api.put(`/api/loans/${made.id}`).send({ bookId: BOOK, extraLedgerIds: ['tmp_move_book'] }).expect(200)).body;
    assert.deepEqual(kept.ledgerIds, [BOOK, 'tmp_move_book']);
    await ctx.repo.books.remove('tmp_move_book');
  });

  it('validates registers and entries', async () => {
    await ctx.api.post('/api/loans').send(body({ name: '' })).expect(400);
    await ctx.api.post('/api/loans').send(body({ currency: 'PK' })).expect(400);
    await ctx.api.post('/api/loans').send({ ...body(), extra: 1 }).expect(400);
    const u = `/api/loans/${regA.id}/entries`;
    await ctx.api.post(u).send(entry({ kind: 'gift' })).expect(400);
    await ctx.api.post(u).send(entry({ amount: 0 })).expect(400);
    await ctx.api.post(u).send(entry({ amount: 1.5 })).expect(400);
    await ctx.api.post(u).send(entry({ amount: 10000000000001 })).expect(400);
    await ctx.api.post(u).send(entry({ date: '2026-02-30' })).expect(400);
    await ctx.api.post(u).send(entry({ receiver: 'x'.repeat(121) })).expect(400);
    await ctx.api.post(u).send(entry({ comment: 'x'.repeat(501) })).expect(400);
    await ctx.api.get(`${u}?kind=bad`).expect(400);
    await ctx.api.get(`${u}?from=2026-13-01`).expect(400);
  });

  it('computes totals with filters, negative balance and soft delete', async () => {
    const reg = (await ctx.api.post('/api/loans').send(body({ name: 'Totals' })).expect(201)).body;
    const u = `/api/loans/${reg.id}/entries`;
    await ctx.api.post(u).send(entry({ amount: 1000, date: '2026-01-01', receiver: 'Zed', comment: 'a_b' })).expect(201);
    const second = (await ctx.api.post(u).send(entry({ kind: 'returned', amount: 2500, date: '2026-02-01', receiver: 'Bilal', comment: null })).expect(201)).body;
    const third = (await ctx.api.post(u).send(entry({ amount: 300, date: '2026-02-01' })).expect(201)).body;
    let res = (await ctx.api.get(u).expect(200)).body;
    assert.deepEqual(res.register.totals, { taken: 1300, returned: 2500, balance: -1200, count: 3 });
    assert.deepEqual(res.totals, res.register.totals);
    assert.equal(res.rows[0].date, '2026-02-01');
    assert.equal(res.rows[0].id, third.id); // same date: newest created first
    res = (await ctx.api.get(`${u}?kind=returned`).expect(200)).body;
    assert.deepEqual(res.totals, { taken: 0, returned: 2500, balance: -2500, count: 1 });
    assert.equal(res.register.totals.count, 3);
    res = (await ctx.api.get(`${u}?from=2026-01-15&to=2026-12-31`).expect(200)).body;
    assert.equal(res.rows.length, 2);
    res = (await ctx.api.get(`${u}?q=a_b`).expect(200)).body;
    assert.equal(res.rows.length, 1);
    res = (await ctx.api.get(`${u}?q=a%25b`).expect(200)).body;
    assert.equal(res.rows.length, 0);
    const upd = (await ctx.api.put(`${u}/${second.id}`).send({ amount: 100, comment: '' }).expect(200)).body;
    assert.equal(upd.amount, 100);
    assert.equal(upd.comment, null);
    await ctx.api.delete(`${u}/${second.id}`).expect(200);
    await ctx.api.delete(`${u}/${second.id}`).expect(404);
    res = (await ctx.api.get(u).expect(200)).body;
    assert.deepEqual(res.register.totals, { taken: 1300, returned: 0, balance: 1300, count: 2 });
    const raw = await ctx.d1.prepare('SELECT deleted_at FROM loan_entries WHERE id = ?').bind(second.id).first();
    assert.ok(raw.deleted_at);
  });

  it('locks currency once entries exist, and blocks delete while entries exist', async () => {
    await ctx.api.put(`/api/loans/${regA.id}`).send({ currency: 'USD' }).expect(409);
    await ctx.api.put(`/api/loans/${regA.id}`).send({ currency: 'PKR', name: 'A2', description: 'd' }).expect(200);
    await ctx.api.delete(`/api/loans/${regA.id}`).expect(409);
    const empty = (await ctx.api.post('/api/loans').send(body()).expect(201)).body;
    const changed = await ctx.api.put(`/api/loans/${empty.id}`).send({ currency: 'EUR' }).expect(200);
    assert.equal(changed.body.currency, 'EUR');
    await makeUser('stripme', { loanMemberships: [{ registerId: empty.id, role: 'viewer' }] });
    await ctx.api.delete(`/api/loans/${empty.id}`).expect(200);
    const accounts = (await ctx.api.get('/api/admin/accounts')).body.accounts;
    assert.deepEqual(accounts.find(a => a.email === 'stripme@example.com').loanMemberships, []);
    await ctx.api.get(`/api/loans/${empty.id}`).expect(404);
  });

  it('lists only the registers the account may see', async () => {
    const ids = async who => (await who.get('/api/loans').expect(200)).body.map(r => r.id);
    assert.ok((await ids(ctx.api)).includes(regA.id) && (await ids(ctx.api)).includes(regB.id));
    assert.deepEqual(await ids(actors.viewer), [regA.id]);
    assert.deepEqual(await ids(actors.other), [regB.id]);
    assert.deepEqual(await ids(actors.plain), []);
  });

  // The authorization matrix. Each case: [who, expected status per endpoint].
  const endpoints = () => [
    ['list', c => c.get('/api/loans'), 'page'],
    ['create', c => c.post('/api/loans').send(body()), 'page'],
    ['get', c => c.get(`/api/loans/${regA.id}`), 'viewer'],
    ['update', c => c.put(`/api/loans/${regA.id}`).send({ name: 'A' }), 'admin'],
    ['entries', c => c.get(`/api/loans/${regA.id}/entries`), 'viewer'],
    ['add', c => c.post(`/api/loans/${regA.id}/entries`).send(entry()), 'editor'],
    ['edit', c => c.put(`/api/loans/${regA.id}/entries/${entryA.id}`).send({ comment: 'c' }), 'editor'],
    ['delete-entry-probe', c => c.delete(`/api/loans/${regA.id}/entries/does-not-exist`), 'editor'],
    ['delete-register-probe', c => c.delete(`/api/loans/does-not-exist`), 'admin-missing']
  ];
  const RANKS = { none: 0, viewer: 1, editor: 2, admin: 3 };
  const allowed = (level, need) => RANKS[level] >= RANKS[need];

  it('rejects every endpoint with no session', async () => {
    const anon = request(ctx.app);
    for (const [name, call] of endpoints()) {
      const res = await call({ get: u => anon.get(u), post: u => anon.post(u), put: u => anon.put(u), delete: u => anon.delete(u) });
      assert.equal(res.status, 401, name);
    }
  });

  it('rejects an account without the loans page', async () => {
    for (const [name, call] of endpoints()) assert.equal((await call(actors.nopage)).status, 403, name);
  });

  it('rejects an account that only has another register', async () => {
    for (const [name, call, need] of endpoints()) {
      if (need === 'page') continue;
      assert.equal((await call(actors.other)).status, 403, name);
    }
  });

  it('applies viewer, editor and admin minimums', async () => {
    for (const who of ['viewer', 'editor']) {
      const level = who;
      for (const [name, call, need] of endpoints()) {
        if (need === 'page' || need === 'admin-missing') continue;
        const status = (await call(actors[who])).status;
        if (!allowed(level, need)) assert.equal(status, 403, `${who} ${name}`);
        else assert.notEqual(status, 403, `${who} ${name}`);
      }
    }
    // Editor's delete probe passes the role check and then 404s; viewer's is 403.
    assert.equal((await actors.editor.delete(`/api/loans/${regA.id}/entries/nope`)).status, 404);
    assert.equal((await actors.viewer.delete(`/api/loans/${regA.id}/entries/nope`)).status, 403);
    // Register edit and delete are admin only.
    assert.equal((await actors.editor.put(`/api/loans/${regA.id}`).send({ name: 'x' })).status, 403);
    assert.equal((await actors.editor.delete(`/api/loans/${regA.id}`)).status, 403);
    assert.equal((await actors.admin.put(`/api/loans/${regA.id}`).send({ name: 'A2' })).status, 200);
    assert.equal((await actors.admin.delete(`/api/loans/${regA.id}`)).status, 409); // has entries, but allowed
    assert.equal((await actors.admin.put(`/api/loans/${regB.id}`).send({ name: 'x' })).status, 403);
    // Read-only viewer cannot write, can read.
    assert.equal((await actors.viewer.post(`/api/loans/${regA.id}/entries`).send(entry())).status, 403);
    assert.equal((await actors.viewer.get(`/api/loans/${regA.id}/entries`)).status, 200);
    assert.equal((await actors.editor.post(`/api/loans/${regA.id}/entries`).send(entry())).status, 201);
  });

  it('does not reveal whether a register exists to a member of nothing, and 404s for a super admin', async () => {
    assert.equal((await actors.plain.get('/api/loans/does-not-exist')).status, 403);
    assert.equal((await actors.plain.get(`/api/loans/${regA.id}`)).status, 403);
    assert.equal((await ctx.api.get('/api/loans/does-not-exist')).status, 404);
    assert.equal((await ctx.api.get('/api/loans/does-not-exist/entries')).status, 404);
    assert.equal((await ctx.api.post('/api/loans/does-not-exist/entries').send(entry())).status, 404);
    assert.equal((await ctx.api.put('/api/loans/does-not-exist').send({ name: 'x' })).status, 404);
    assert.equal((await ctx.api.delete('/api/loans/does-not-exist')).status, 404);
  });

  it('lets a super admin use everything', async () => {
    for (const path of [`/api/loans/${regA.id}`, `/api/loans/${regB.id}/entries`]) assert.equal((await ctx.api.get(path)).status, 200);
    assert.equal((await ctx.api.put(`/api/loans/${regB.id}/entries/${entryB.id}`).send({ comment: 'su' })).status, 200);
  });

  it('never touches an entry through the wrong register id', async () => {
    // entryB belongs to B. admin of A, and super admin addressing A, must get 404 and change nothing.
    for (const who of [actors.admin, ctx.api]) {
      assert.equal((await who.put(`/api/loans/${regA.id}/entries/${entryB.id}`).send({ comment: 'hacked' })).status, 404);
      assert.equal((await who.delete(`/api/loans/${regA.id}/entries/${entryB.id}`)).status, 404);
    }
    // A user with a role on A only cannot reach B at all, even with B's entry id.
    assert.equal((await actors.admin.put(`/api/loans/${regB.id}/entries/${entryB.id}`).send({ comment: 'hacked' })).status, 403);
    assert.equal((await actors.admin.delete(`/api/loans/${regB.id}/entries/${entryB.id}`)).status, 403);
    const row = await ctx.d1.prepare('SELECT comment, deleted_at FROM loan_entries WHERE id = ?').bind(entryB.id).first();
    assert.notEqual(row.comment, 'hacked');
    assert.equal(row.deleted_at, null);
  });

  it('keeps access codes and the books API unaffected', async () => {
    assert.equal((await ctx.api.get('/api/books')).status, 200);
    assert.equal((await ctx.api.get('/api/books/family/summary')).status, 200);
    assert.equal((await actors.nopage.get('/api/books/family/summary')).status, 403);
  });
});

describe('loan writes follow the main ledger', () => {
  let ctx; let linked; let unlinked;
  const actors = {};
  const mk = async (key, memberships, role = 'editor', registerId = null) => {
    await createAccountStore(ctx.repo.authStore).create({
      email: `${key}@example.com`, name: key, password: PASS, memberships,
      loanMemberships: registerId ? [{ registerId, role }] : []
    });
    const { sid } = await ctx.auth.login(`${key}@example.com`, PASS);
    actors[key] = withCookie(ctx.app, `lsid=${sid}`);
  };
  before(async () => {
    ctx = await makeContext();
    await ctx.repo.books.create({ id: 'main_book', name: 'Main', baseCurrency: 'PKR', createdAt: new Date().toISOString() });
    await ctx.repo.books.create({ id: 'shared_book', name: 'Shared', baseCurrency: 'PKR', createdAt: new Date().toISOString() });
    linked = (await ctx.api.post('/api/loans').send(body({ name: 'Linked', bookId: 'main_book', extraLedgerIds: ['shared_book'] })).expect(201)).body;
    unlinked = (await ctx.api.post('/api/loans').send(body({ name: 'Unlinked' })).expect(201)).body;
    await mk('sharedonly', [{ bookId: 'shared_book', role: 'admin' }], 'admin', linked.id);
    await mk('mainviewer', [{ bookId: 'main_book', role: 'viewer' }], 'admin', linked.id);
    await mk('maineditor', [{ bookId: 'main_book', role: 'editor' }], 'editor', linked.id);
    await mk('nounlinked', [], 'editor', unlinked.id);
  });
  after(async () => { await ctx.close(); });

  it('a loan editor who only reaches it through a shared-in ledger is read-only', async () => {
    const a = actors.sharedonly;
    const read = await a.get(`/api/loans/${linked.id}/entries`).expect(200);
    assert.equal(read.body.register.role, 'viewer');
    assert.equal(read.body.register.canWrite, false);
    assert.equal((await a.post(`/api/loans/${linked.id}/entries`).send(entry())).status, 403);
    assert.equal((await a.put(`/api/loans/${linked.id}`).send({ name: 'X' })).status, 403);
    assert.equal((await a.put(`/api/loans/${linked.id}`).send({ extraLedgerIds: [] })).status, 403);
    assert.equal((await a.delete(`/api/loans/${linked.id}`)).status, 403);
    assert.equal((await a.put(`/api/loans/${linked.id}/access-codes`).send({ codeIds: [] })).status, 403);
  });

  it('a Viewer in the main ledger is read-only too', async () => {
    const a = actors.mainviewer;
    assert.equal((await a.get(`/api/loans/${linked.id}`).expect(200)).body.role, 'viewer');
    assert.equal((await a.post(`/api/loans/${linked.id}/entries`).send(entry())).status, 403);
  });

  it('an Editor in the main ledger with the loan editor role can write entries', async () => {
    const a = actors.maineditor;
    assert.equal((await a.get(`/api/loans/${linked.id}`).expect(200)).body.role, 'editor');
    await a.post(`/api/loans/${linked.id}/entries`).send(entry()).expect(201);
  });

  it('an unlinked loan keeps the plain loan-role rules', async () => {
    const a = actors.nounlinked;
    assert.equal((await a.get(`/api/loans/${unlinked.id}`).expect(200)).body.canWrite, true);
    await a.post(`/api/loans/${unlinked.id}/entries`).send(entry()).expect(201);
  });
});
