const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { makeContext, withCookie, BOOK } = require('./helpers');
const { createAccountStore } = require('../../server/auth/accounts');

const U = `/api/books/${BOOK}`;

describe('document links API', () => {
  let ctx; let viewer; let editor; let noDocs;
  const doc = async (title, extra = {}, who = editor) => (await who.post(`${U}/documents`).send({ date: '2026-01-10', title, ...extra })).body;
  const link = (entryId, documentIds, who = editor) => who.put(`${U}/documents/for-entry/${entryId}`).send({ documentIds });
  const insertEntry = (id, { book = BOOK, date = '2026-01-05', deleted = null } = {}) => ctx.d1.prepare(
    "INSERT INTO entries (id, book_id, date, fund_id, direction, amount, currency, comment, created_by, created_at, updated_at, deleted_at) VALUES (?, ?, ?, 'f1', 'dr', 500, 'PKR', ?, 'x', 'n', 'n', ?)"
  ).bind(id, book, date, `comment ${id}`, deleted).run();

  beforeEach(async () => {
    ctx = await makeContext();
    await ctx.d1.prepare("INSERT INTO funds (id, book_id, name, currency, kind) VALUES ('f1', ?, 'F', 'PKR', 'general')").bind(BOOK).run();
    await ctx.d1.prepare("INSERT INTO funds (id, book_id, name, currency, kind) VALUES ('f2', 'personal', 'F', 'PKR', 'general')").run();
    const store = createAccountStore(ctx.repo.authStore);
    await store.create({ email: 'viewer@example.com', name: 'v', password: 'a long passphrase here', memberships: [{ bookId: BOOK, role: 'viewer' }] });
    await store.create({ email: 'editor@example.com', name: 'e', password: 'a long passphrase here', memberships: [{ bookId: BOOK, role: 'editor' }] });
    await store.create({ email: 'nodocs@example.com', name: 'n', password: 'a long passphrase here', memberships: [{ bookId: BOOK, role: 'editor' }], resources: ['ledger'] });
    const login = async e => withCookie(ctx.app, `lsid=${(await ctx.auth.login(e, 'a long passphrase here')).sid}`);
    viewer = await login('viewer@example.com');
    editor = await login('editor@example.com');
    noDocs = await login('nodocs@example.com');
  });
  afterEach(async () => { await ctx.close(); });

  it('links, replaces and unlinks; many to many; docCount', async () => {
    await insertEntry('e1'); await insertEntry('e2');
    const a = await doc('A'); const b = await doc('B');
    const r = await link('e1', [a.id, b.id, a.id]);
    assert.equal(r.status, 200);
    assert.deepEqual(r.body.map(d => d.title).sort(), ['A', 'B']);
    assert.deepEqual(Object.keys(r.body[0]).sort(), ['date', 'fileName', 'fileType', 'hasFile', 'id', 'title', 'type']);
    await link('e2', [a.id]);
    const list = (await viewer.get(`${U}/documents`)).body;
    const byTitle = Object.fromEntries(list.map(d => [d.title, d.entries.map(e => e.id)]));
    assert.deepEqual(byTitle.A.sort(), ['e1', 'e2']);
    assert.deepEqual(byTitle.B, ['e1']);
    assert.deepEqual(Object.keys(list[0].entries[0]).sort(), ['amount', 'comment', 'currency', 'date', 'direction', 'id', 'partyName']);
    const counts = Object.fromEntries((await viewer.get(`${U}/entries`)).body.rows.map(e => [e.id, e.docCount]));
    assert.deepEqual(counts, { e1: 2, e2: 1 });
    assert.deepEqual((await link('e1', [b.id])).body.map(d => d.title), ['B']);
    assert.deepEqual((await viewer.get(`${U}/documents/for-entry/e1`)).body.map(d => d.title), ['B']);
    assert.deepEqual((await link('e1', [])).body, []);
    assert.equal((await viewer.get(`${U}/documents/for-entry/e1`)).body.length, 0);
  });

  it('checks the book, roles and the documents page gate', async () => {
    await insertEntry('e1'); await insertEntry('x1', { book: 'personal' });
    const a = await doc('A');
    await ctx.d1.prepare("INSERT INTO documents (id, book_id, date, title, created_at, updated_at) VALUES ('od', 'personal', '2026-01-01', 'O', 'n', 'n')").run();
    assert.equal((await link('x1', [a.id])).status, 404);
    assert.equal((await link('e1', ['od'])).status, 404);
    assert.equal((await link('e1', ['nope'])).status, 404);
    assert.equal((await viewer.get(`${U}/documents/for-entry/x1`)).status, 404);
    assert.equal((await link('e1', [a.id], viewer)).status, 403);
    assert.equal((await viewer.get(`${U}/documents/for-entry/e1`)).status, 200);
    assert.equal((await noDocs.get(`${U}/documents/for-entry/e1`)).status, 403);
    assert.equal((await link('e1', [a.id], noDocs)).status, 403);
    assert.equal((await noDocs.get(`${U}/entries`)).status, 200);
    assert.equal((await link('e1', Array.from({ length: 51 }, (_, i) => `d${i}`))).status, 400);
    assert.equal((await editor.post(`${U}/documents`).send({ date: '2026-01-10', title: 'T', entryIds: ['x1'] })).status, 404);
  });

  it('hides soft-deleted entries and removes links with the document', async () => {
    await insertEntry('e1'); await insertEntry('e2');
    const a = await doc('A', { entryIds: ['e1', 'e2'] });
    assert.deepEqual(a.entries.map(e => e.id).sort(), ['e1', 'e2']);
    await ctx.d1.prepare("UPDATE entries SET deleted_at = 'n' WHERE id = 'e2'").run();
    assert.deepEqual((await viewer.get(`${U}/documents`)).body[0].entries.map(e => e.id), ['e1']);
    assert.equal((await viewer.get(`${U}/documents/for-entry/e2`)).status, 404);
    assert.equal((await link('e2', [a.id])).status, 404);
    assert.equal((await editor.put(`${U}/documents/${a.id}`).send({ entryIds: ['e2'] })).status, 404);
    assert.equal((await editor.delete(`${U}/documents/${a.id}`)).status, 200);
    const n = await ctx.d1.prepare('SELECT COUNT(*) AS n FROM entry_documents').first();
    assert.equal(n.n, 0);
    assert.equal((await viewer.get(`${U}/entries`)).body.rows[0].docCount, 0);
  });

  it('entryIds on create and update; omitted leaves links unchanged', async () => {
    await insertEntry('e1'); await insertEntry('e2');
    const a = await doc('A', { entryIds: ['e1'] });
    assert.deepEqual(a.entries.map(e => e.id), ['e1']);
    const t = await editor.put(`${U}/documents/${a.id}`).send({ title: 'A2' });
    assert.deepEqual(t.body.entries.map(e => e.id), ['e1']);
    const r = await editor.put(`${U}/documents/${a.id}`).send({ entryIds: ['e2', 'e2'] });
    assert.equal(r.body.title, 'A2');
    assert.deepEqual(r.body.entries.map(e => e.id), ['e2']);
    assert.equal((await editor.put(`${U}/documents/${a.id}`).send({ entryIds: [] })).body.entries.length, 0);
    assert.equal((await editor.put(`${U}/documents/${a.id}`).send({ entryIds: Array.from({ length: 51 }, (_, i) => `e${i}`) })).status, 400);
  });

  it('links on closed years and appears in the export without leaking docCount', async () => {
    await insertEntry('e1', { date: '2020-03-01' });
    await ctx.d1.prepare("INSERT INTO year_closes (book_id, year, closed_at, closed_by) VALUES (?, 2020, 'n', 'x')").bind(BOOK).run();
    const a = await doc('A');
    assert.equal((await link('e1', [a.id])).status, 200);
    await insertEntry('e2', { deleted: 'n' });
    await ctx.d1.prepare("INSERT INTO entry_documents (entry_id, document_id, book_id, created_at) VALUES ('e2', ?, ?, 'n')").bind(a.id, BOOK).run();
    const ex = (await ctx.api.get(`${U}/export?format=json`)).body;
    assert.deepEqual(ex.entryDocuments, [{ entryId: 'e1', documentId: a.id }, { entryId: 'e2', documentId: a.id }]);
    assert.ok(ex.entries.every(e => !('docCount' in e)));
  });
});
