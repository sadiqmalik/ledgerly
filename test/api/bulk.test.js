const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { makeContext, withCookie, BOOK } = require('./helpers');
const { createAccountStore } = require('../../server/auth/accounts');

const U = `/api/books/${BOOK}`;
const PW = 'a long passphrase here';

describe('bulk entries API', () => {
  let ctx; let viewer; let editor; let projectOnly;
  const entry = (extra = {}) => ({ date: '2026-01-10', fundId: 'checking', direction: 'dr', amount: 1000, ...extra });
  const mk = async (extra, who = ctx.api) => (await who.post(`${U}/entries`).send(entry(extra))).body.id;
  const bulk = (body, who = editor) => who.post(`${U}/entries/bulk`).send(body);
  const raw = id => ctx.d1.prepare('SELECT * FROM entries WHERE id = ?').bind(id).first();
  const balance = async fundId => (await ctx.d1.prepare(
    "SELECT COALESCE(SUM(CASE direction WHEN 'cr' THEN amount ELSE -amount END),0) n FROM entries WHERE fund_id = ? AND deleted_at IS NULL"
  ).bind(fundId).first()).n;

  beforeEach(async () => {
    ctx = await makeContext();
    const f = (id, name, cur) => ctx.d1.prepare('INSERT INTO funds (id, book_id, name, is_reserved, currency, kind) VALUES (?,?,?,0,?,?)').bind(id, BOOK, name, cur, 'general');
    await ctx.d1.batch([
      f('checking', 'Checking', 'PKR'), f('special', 'Special', 'PKR'), f('usd', 'USD Wallet', 'USD'), f('old', 'Old', 'PKR'),
      ctx.d1.prepare("INSERT INTO categories (id, book_id, name, default_direction) VALUES ('cat_food', ?, 'Food', 'dr')").bind(BOOK),
      ctx.d1.prepare("INSERT INTO categories (id, book_id, name, default_direction) VALUES ('cat_x', ?, 'Other', 'dr')").bind(BOOK)
    ]);
    const store = createAccountStore(ctx.repo.authStore);
    for (const role of ['viewer', 'editor']) await store.create({ email: `${role}@example.com`, name: role, password: PW, memberships: [{ bookId: BOOK, role }] });
    await store.create({ email: 'proj@example.com', name: 'p', password: PW, memberships: [{ bookId: BOOK, role: 'editor' }], resources: ['projects'] });
    const login = async e => withCookie(ctx.app, `lsid=${(await ctx.auth.login(e, PW)).sid}`);
    viewer = await login('viewer@example.com'); editor = await login('editor@example.com'); projectOnly = await login('proj@example.com');
  });
  afterEach(async () => { await ctx.close(); });

  const mkProject = async () => (await ctx.api.post(`${U}/projects`).send({ name: 'Trip', kind: 'trip', fundId: 'checking' })).body.id;

  it('moves entries to another fund and balances change', async () => {
    const a = await mk(); const b = await mk({ amount: 500 });
    const res = await bulk({ ids: [a, b], changes: { fundId: 'special' } });
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { updated: 2, deleted: 0 });
    assert.equal(await balance('checking'), 0);
    assert.equal(await balance('special'), -1500);
    assert.equal((await raw(a)).fund_id, 'special');
  });

  it('changes category, party (creating by name), project, exclude and status', async () => {
    const pid = await mkProject();
    const a = await mk(); const b = await mk();
    assert.equal((await bulk({ ids: [a, b], changes: { categoryId: 'cat_food', partyName: 'New Shop', projectId: pid, exclude: true } })).status, 200);
    const ra = await raw(a);
    assert.equal(ra.category_id, 'cat_food'); assert.equal(ra.project_id, pid); assert.equal(ra.exclude, 1);
    assert.ok(ra.party_id);
    assert.equal((await raw(b)).party_id, ra.party_id);
    const parties = await ctx.d1.prepare("SELECT COUNT(*) n FROM parties WHERE name = 'New Shop'").first();
    assert.equal(parties.n, 1);
    await bulk({ ids: [a], changes: { partyName: 'New Shop' } });
    assert.equal((await ctx.d1.prepare("SELECT COUNT(*) n FROM parties WHERE name = 'New Shop'").first()).n, 1);
    assert.equal((await bulk({ ids: [a, b], changes: { categoryId: null, partyId: null, projectId: null, exclude: false } })).status, 200);
    const cleared = await raw(a);
    assert.equal(cleared.category_id, null); assert.equal(cleared.party_id, null); assert.equal(cleared.project_id, null); assert.equal(cleared.exclude, 0);
  });

  it('paid keeps or sets paid_date and pending clears it', async () => {
    const pending = await mk({ status: 'pending' });
    const paid = await mk({ status: 'paid', paidDate: '2026-01-20' });
    await ctx.d1.prepare('UPDATE entries SET paid_date = NULL WHERE id = ?').bind(pending).run();
    assert.equal((await bulk({ ids: [pending, paid], changes: { status: 'paid' } })).status, 200);
    assert.equal((await raw(pending)).paid_date, '2026-01-10');
    assert.equal((await raw(paid)).paid_date, '2026-01-20');
    assert.equal((await raw(paid)).status, 'paid');
    assert.equal((await bulk({ ids: [pending, paid], changes: { status: 'pending' } })).status, 200);
    for (const id of [pending, paid]) { const r = await raw(id); assert.equal(r.status, 'pending'); assert.equal(r.paid_date, null); }
  });

  it('soft-deletes several entries', async () => {
    const a = await mk(); const b = await mk(); const keep = await mk();
    const res = await bulk({ ids: [a, b], delete: true });
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { updated: 0, deleted: 2 });
    assert.ok((await raw(a)).deleted_at); assert.ok((await raw(b)).deleted_at); assert.equal((await raw(keep)).deleted_at, null);
  });

  it('rejects linked transfer legs with 409 and changes nothing', async () => {
    const a = await mk();
    const t = (await ctx.api.post(`${U}/transfers`).send({ date: '2026-01-12', fromFundId: 'checking', toFundId: 'special', amount: 100 })).body;
    const leg = t.entries[0].id;
    for (const body of [{ ids: [a, leg], changes: { exclude: true } }, { ids: [a, leg], delete: true }]) {
      const res = await bulk(body);
      assert.equal(res.status, 409);
      assert.match(res.body.error || JSON.stringify(res.body), /linked transfer legs/);
    }
    assert.equal((await raw(a)).exclude, 0); assert.equal((await raw(a)).deleted_at, null); assert.equal((await raw(leg)).deleted_at, null);
  });

  it('closed-year entry gives 423 and nothing changes', async () => {
    const open = await mk({ date: '2026-03-01' });
    const closed = await mk({ date: '2025-05-01' });
    await ctx.d1.prepare('INSERT INTO year_closes (book_id, year, closed_at, closed_by) VALUES (?,?,?,?)').bind(BOOK, 2025, 'now', 'x').run();
    assert.equal((await bulk({ ids: [open, closed], changes: { fundId: 'special' } })).status, 423);
    assert.equal((await bulk({ ids: [open, closed], delete: true })).status, 423);
    assert.equal((await raw(open)).fund_id, 'checking'); assert.equal((await raw(open)).deleted_at, null);
  });

  it('currency mismatch and archived fund give 409', async () => {
    const a = await mk(); const b = await mk();
    const res = await bulk({ ids: [a, b], changes: { fundId: 'usd' } });
    assert.equal(res.status, 409);
    assert.match(JSON.stringify(res.body), /2 entries are in another currency than USD Wallet/);
    await ctx.d1.prepare("UPDATE funds SET archived = 1 WHERE id = 'old'").run();
    assert.equal((await bulk({ ids: [a, b], changes: { fundId: 'old' } })).status, 409);
    assert.equal((await raw(a)).fund_id, 'checking');
  });

  it('unknown ids and references give 404', async () => {
    const a = await mk();
    assert.equal((await bulk({ ids: [a, 'missing'], changes: { exclude: true } })).status, 404);
    assert.equal((await raw(a)).exclude, 0);
    for (const changes of [{ fundId: 'nope' }, { categoryId: 'nope' }, { partyId: 'nope' }, { projectId: 'nope' }]) {
      assert.equal((await bulk({ ids: [a], changes })).status, 404);
    }
    await bulk({ ids: [a], delete: true });
    assert.equal((await bulk({ ids: [a], delete: true })).status, 404);
  });

  it('validates the body with 400', async () => {
    const a = await mk(); const b = await mk();
    const many = Array.from({ length: 201 }, (_, i) => `id${i}`);
    for (const body of [
      { ids: many, delete: true }, { ids: [a, a], delete: true }, { ids: [], delete: true },
      { ids: [a] }, { ids: [a], delete: true, changes: { exclude: true } }, { ids: [a], changes: {} },
      { ids: [a], delete: false }, { ids: [a], changes: { amount: 5 } }, { ids: [a, b], changes: { status: 'x' } }, { ids: [a], extra: 1, delete: true }
    ]) assert.equal((await bulk(body)).status, 400, JSON.stringify(body).slice(0, 60));
  });

  it('viewer gets 403', async () => {
    const a = await mk();
    assert.equal((await bulk({ ids: [a], delete: true }, viewer)).status, 403);
    assert.equal((await raw(a)).deleted_at, null);
  });

  it('a projects-only account may edit project entries but nothing else', async () => {
    const pid = await mkProject();
    const inProject = await mk({ projectId: pid }); const inProject2 = await mk({ projectId: pid }); const plain = await mk();
    assert.equal((await bulk({ ids: [inProject, plain], changes: { exclude: true } }, projectOnly)).status, 403);
    assert.equal((await bulk({ ids: [plain], delete: true }, projectOnly)).status, 403);
    assert.equal((await bulk({ ids: [inProject], changes: { projectId: null } }, projectOnly)).status, 403);
    assert.equal((await raw(inProject)).exclude, 0); assert.equal((await raw(inProject)).project_id, pid);
    assert.equal((await bulk({ ids: [inProject, inProject2], changes: { exclude: true } }, projectOnly)).status, 200);
    assert.equal((await raw(inProject2)).exclude, 1);
    assert.equal((await bulk({ ids: [inProject, inProject2], delete: true }, projectOnly)).status, 200);
  });
});
