const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { makeContext, withCookie, BOOK } = require('./helpers');
const { createAccountStore } = require('../../server/auth/accounts');

const PASS = 'loan share test passphrase';
const entry = { kind: 'taken', amount: 100000, date: '2026-03-01', receiver: 'Ali', comment: 'first' };

describe('loans shared with access codes', () => {
  let ctx; let regA; let regB; let code; let codeApi; let ip = 0;

  const loan = async name => (await ctx.api.post('/api/loans').send({ name, borrower: 'Ali', lender: 'Bilal' }).expect(201)).body;
  const makeCode = async (name, resources = ['dashboard', 'loans']) =>
    (await ctx.api.post('/api/admin/access-codes').send({ name, bookIds: [BOOK], resources }).expect(201)).body.accessCode;
  const signIn = async secret => {
    const res = await request(ctx.app).post('/api/auth/access-code').set('cf-connecting-ip', `10.1.0.${++ip}`).send({ code: secret }).expect(200);
    return withCookie(ctx.app, res.headers['set-cookie'][0].split(';')[0]);
  };
  const share = (registerId, codeIds) => ctx.api.put(`/api/loans/${registerId}/access-codes`).send({ codeIds });
  const links = async (column, id) => (await ctx.d1.prepare(`SELECT COUNT(*) AS n FROM access_code_loans WHERE ${column} = ?`).bind(id).first()).n;

  before(async () => {
    ctx = await makeContext();
    regA = await loan('A');
    regB = await loan('B');
    await ctx.api.post(`/api/loans/${regA.id}/entries`).send(entry).expect(201);
    code = await makeCode('Board');
    codeApi = await signIn(code.code);
  });
  after(async () => { await ctx.close(); });

  it('a code with the Loans page sees no loan until one is shared with it', async () => {
    assert.deepEqual((await codeApi.get('/api/loans').expect(200)).body, []);
    assert.equal((await codeApi.get(`/api/loans/${regA.id}`)).status, 403);
    assert.equal((await codeApi.get(`/api/loans/${regA.id}/entries`)).status, 403);
  });

  it('a code owned by an admin inherits the loans that admin may use', async () => {
    const owner = (await ctx.api.post('/api/admin/accounts').send({
      username: 'loanowner', name: 'Loan Owner', password: PASS,
      memberships: [{ bookId: BOOK, role: 'editor', resources: ['dashboard', 'loans'] }],
      loanMemberships: [{ registerId: regB.id, role: 'editor' }]
    }).expect(201)).body.account;
    const owned = (await ctx.api.post('/api/admin/access-codes').send({ name: 'Owned', bookIds: [BOOK], accountId: owner.id }).expect(201)).body.accessCode;
    const api = await signIn(owned.code);
    const list = (await api.get('/api/loans').expect(200)).body;
    assert.deepEqual(list.map(r => [r.id, r.role]), [[regB.id, 'viewer']]); // the owner's loan, view only; not regA
    assert.equal((await api.get(`/api/loans/${regA.id}`)).status, 403);
    assert.equal((await api.post(`/api/loans/${regB.id}/entries`).send(entry)).status, 403);
    await ctx.api.delete(`/api/admin/accounts/${owner.id}`).expect(200); // takes its code with it, so later tests see the same codes
  });

  it('sharing a loan makes it readable, and only readable', async () => {
    const res = await share(regA.id, [code.id]);
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.shared, [code.id]);

    const list = (await codeApi.get('/api/loans').expect(200)).body;
    assert.deepEqual(list.map(r => [r.id, r.role]), [[regA.id, 'viewer']]);
    assert.equal((await codeApi.get(`/api/loans/${regA.id}`)).status, 200);
    assert.equal((await codeApi.get(`/api/loans/${regA.id}/entries`).expect(200)).body.rows.length, 1);

    // Other loans stay hidden, and nothing can be created or changed.
    assert.equal((await codeApi.get(`/api/loans/${regB.id}`)).status, 403);
    assert.equal((await codeApi.post('/api/loans').send({ name: 'X', borrower: 'a', lender: 'b' })).status, 403);
    assert.equal((await codeApi.post(`/api/loans/${regA.id}/entries`).send(entry)).status, 403);
    assert.equal((await codeApi.put(`/api/loans/${regA.id}`).send({ name: 'Renamed' })).status, 403);
    assert.equal((await codeApi.delete(`/api/loans/${regA.id}`)).status, 403);
    assert.equal((await codeApi.get(`/api/loans/${regA.id}/access-codes`)).status, 403);
    assert.equal((await codeApi.put(`/api/loans/${regA.id}/access-codes`).send({ codeIds: [] })).status, 403);
  });

  it('a new sign-in with the code also carries the shared loan', async () => {
    const res = await request(ctx.app).post('/api/auth/access-code').set('cf-connecting-ip', `10.1.0.${++ip}`).send({ code: code.code }).expect(200);
    assert.deepEqual(res.body.account.loanMemberships, [{ registerId: regA.id, role: 'viewer' }]);
  });

  it('lists the active codes and which of them have access', async () => {
    const res = await ctx.api.get(`/api/loans/${regA.id}/access-codes`).expect(200);
    assert.deepEqual(res.body.codes.map(c => c.name), ['Board']);
    assert.deepEqual(Object.keys(res.body.codes[0]).sort(), ['id', 'name']);
    assert.deepEqual(res.body.shared, [code.id]);
    assert.equal((await ctx.api.get('/api/loans/nope/access-codes')).status, 404);
  });

  it('shares with active codes only', async () => {
    assert.equal((await share(regA.id, ['no-such-code'])).status, 400);
    const old = await makeCode('Old');
    await ctx.api.post(`/api/admin/access-codes/${old.id}/revoke`).expect(200);
    assert.equal((await share(regA.id, [old.id])).status, 400);
    // The refused calls left the earlier sharing in place.
    assert.deepEqual((await ctx.api.get(`/api/loans/${regA.id}/access-codes`).expect(200)).body.shared, [code.id]);
  });

  it('a code without the Loans page gets nothing even when a loan is shared with it', async () => {
    const narrow = await makeCode('Narrow', ['dashboard']);
    await share(regB.id, [narrow.id]).expect(200);
    const api = await signIn(narrow.code);
    assert.equal((await api.get('/api/loans')).status, 403);
    assert.equal((await api.get(`/api/loans/${regB.id}`)).status, 403);
  });

  it('a loan admin who is not a super administrator can share their own loan only', async () => {
    await createAccountStore(ctx.repo.authStore).create({
      email: 'loanadmin@example.com', name: 'Loan admin', password: PASS,
      loanMemberships: [{ registerId: regA.id, role: 'admin' }, { registerId: regB.id, role: 'editor' }]
    });
    const { sid } = await ctx.auth.login('loanadmin@example.com', PASS);
    const api = withCookie(ctx.app, `lsid=${sid}`);
    assert.equal((await api.get(`/api/loans/${regA.id}/access-codes`)).status, 200);
    assert.equal((await api.put(`/api/loans/${regA.id}/access-codes`).send({ codeIds: [code.id] })).status, 200);
    assert.equal((await api.put(`/api/loans/${regB.id}/access-codes`).send({ codeIds: [] })).status, 403);
  });

  it('removing the sharing takes the access away at once', async () => {
    assert.equal((await share(regA.id, [])).status, 200);
    assert.deepEqual((await codeApi.get('/api/loans').expect(200)).body, []);
    assert.equal((await codeApi.get(`/api/loans/${regA.id}`)).status, 403);
  });

  it('the shares are written to the audit log', async () => {
    const log = await ctx.repo.authStore.log.list();
    const shares = log.filter(e => e.action === 'loan-codes' && e.target === `loan:${regA.id}`);
    assert.ok(shares.length >= 2);
    assert.ok(!JSON.stringify(shares).includes(code.code), 'the code secret is never logged');
  });

  it('deleting a loan, revoking a code or deleting a code removes the links', async () => {
    const third = await makeCode('Third');
    const fourth = await makeCode('Fourth');
    const doomed = await loan('Doomed');
    await share(doomed.id, [third.id, fourth.id]).expect(200);
    assert.equal(await links('register_id', doomed.id), 2);

    await ctx.api.delete(`/api/loans/${doomed.id}`).expect(200);
    assert.equal(await links('register_id', doomed.id), 0);

    await share(regA.id, [third.id, fourth.id]).expect(200);
    await ctx.api.post(`/api/admin/access-codes/${third.id}/revoke`).expect(200);
    assert.equal(await links('code_id', third.id), 0);
    await ctx.api.delete(`/api/admin/access-codes/${fourth.id}`).expect(200);
    assert.equal(await links('code_id', fourth.id), 0);
  });
  it('names only ledgers the code can open', async () => {
    await ctx.d1.prepare("INSERT INTO books (id, name, created_at) VALUES ('vault', 'Vault', ?)").bind(new Date().toISOString()).run();
    const a = (await ctx.api.post('/api/loans').send({ name: 'Main A', borrower: 'Ali', lender: 'Bilal', bookId: BOOK, extraLedgerIds: ['personal'] }).expect(201)).body;
    const c = (await ctx.api.post('/api/loans').send({ name: 'Main C', borrower: 'Ali', lender: 'Bilal', bookId: 'vault', extraLedgerIds: [BOOK] }).expect(201)).body;
    const made = (await ctx.api.post('/api/admin/access-codes').send({ name: 'Two', bookIds: [BOOK, 'personal'], resources: ['dashboard', 'loans'] }).expect(201)).body.accessCode;
    await share(a.id, [made.id]).expect(200);
    await share(c.id, [made.id]).expect(200);
    assert.deepEqual((await ctx.api.get('/api/loans').expect(200)).body.find(r => r.id === c.id).ledgerNames, ['Vault', 'Family']);
    const api = await signIn(made.code);
    const list = (await api.get('/api/loans').expect(200)).body;
    const la = list.find(r => r.id === a.id); const lc = list.find(r => r.id === c.id);
    assert.deepEqual(la.ledgerIds, [BOOK, 'personal']); assert.equal(la.bookId, BOOK);
    assert.deepEqual(lc.ledgerIds, [BOOK]); assert.deepEqual(lc.ledgerNames, ['Family']); assert.equal(lc.bookId, BOOK);
    assert.ok(!JSON.stringify(list).toLowerCase().includes('vault'));
    for (const r of [a, c]) {
      const entries = await api.get(`/api/loans/${r.id}/entries`).expect(200);
      assert.ok(!JSON.stringify(entries.body).toLowerCase().includes('vault'));
    }
  });
});
