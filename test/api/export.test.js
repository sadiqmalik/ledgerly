const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { makeContext, withCookie, BOOK } = require('./helpers');
const { createAccountStore } = require('../../server/auth/accounts');
const { entriesCsv, decimal } = require('../../server/csv');

const U = `/api/books/${BOOK}`;
const rawText = (req) => req.buffer(true).parse((res, cb) => {
  const chunks = [];
  res.on('data', c => chunks.push(c));
  res.on('end', () => cb(null, Buffer.concat(chunks)));
});

describe('export API', () => {
  let ctx; let viewer; let editor;
  beforeEach(async () => {
    ctx = await makeContext();
    const ins = (sql, ...p) => ctx.d1.prepare(sql).bind(...p);
    await ctx.d1.batch([
      ins("INSERT INTO funds (id, book_id, name, currency, kind) VALUES ('checking', ?, 'Checking', 'PKR', 'general')", BOOK),
      ins("INSERT INTO parties (id, book_id, name) VALUES ('relative', ?, 'Relative')", BOOK),
      ins("INSERT INTO categories (id, book_id, name, default_direction) VALUES ('food', ?, 'Food', 'dr')", BOOK),
      ins("INSERT INTO projects (id, book_id, name, kind) VALUES ('proj', ?, 'Trip', 'trip')", BOOK),
      ins("INSERT INTO documents (id, book_id, title, date) VALUES ('d1', ?, 'Report', '2026-01-01')", BOOK)
    ]);
    const store = createAccountStore(ctx.repo.authStore);
    for (const role of ['viewer', 'editor']) {
      await store.create({ email: `${role}@example.com`, name: role, password: 'a long passphrase here', memberships: [{ bookId: BOOK, role }] });
    }
    const login = async e => withCookie(ctx.app, `lsid=${(await ctx.auth.login(e, 'a long passphrase here')).sid}`);
    viewer = await login('viewer@example.com');
    editor = await login('editor@example.com');
    const e = body => ctx.api.post(`${U}/entries`).send({ fundId: 'checking', direction: 'dr', ...body });
    await e({ date: '2025-12-31', amount: 1032629, comment: 'Plain, with comma', partyId: 'relative', categoryId: 'food', projectId: 'proj' });
    await e({ date: '2026-02-01', amount: 500, comment: 'He said "hi"\nsecond line' });
    const gone = await e({ date: '2026-02-02', amount: 700, comment: 'deleted one' });
    await ctx.api.delete(`${U}/entries/${gone.body.id}`);
  });
  afterEach(async () => { await ctx.close(); });

  it('exports the whole book as JSON for admins only', async () => {
    assert.equal((await viewer.get(`${U}/export?format=json`)).status, 403);
    assert.equal((await editor.get(`${U}/export?format=json`)).status, 403);
    const res = await ctx.api.get(`${U}/export?format=json`);
    assert.equal(res.status, 200);
    assert.match(res.headers['content-disposition'], /^attachment; filename="ledger-family-\d{4}-\d{2}-\d{2}\.json"$/);
    const d = res.body;
    assert.equal(d.format, 'ledger-backup');
    assert.equal(d.version, 1);
    assert.ok(d.exportedAt);
    assert.deepEqual(d.book, { id: BOOK, name: 'Family', baseCurrency: 'PKR' });
    for (const k of ['funds', 'holders', 'categories', 'parties', 'projects', 'entries', 'yearCloses', 'documents']) assert.ok(Array.isArray(d[k]), k);
    assert.equal(d.funds.length, 1);
    assert.equal(d.documents[0].title, 'Report');
    assert.equal(d.entries.length, 3);
    assert.equal(d.entries.filter(e => e.deletedAt).length, 1);
    assert.equal(d.entries.find(e => e.amount === 1032629).projectId, 'proj');
  });

  it('exports only what the account\'s pages in the ledger show', async () => {
    const store = createAccountStore(ctx.repo.authStore);
    const make = async (name, role, resources) => {
      await store.create({ email: `${name}@example.com`, name, password: 'a long passphrase here', memberships: [{ bookId: BOOK, role, resources }] });
      return withCookie(ctx.app, `lsid=${(await ctx.auth.login(`${name}@example.com`, 'a long passphrase here')).sid}`);
    };
    // A ledger Admin with only the Items page gets a JSON export without entries, documents or lists.
    const itemsOnly = await make('itemsonly', 'admin', ['items']);
    const json = (await itemsOnly.get(`${U}/export?format=json`)).body;
    assert.equal(json.partial, true);
    for (const k of ['entries', 'funds', 'documents', 'projects', 'parties']) assert.deepEqual(json[k], [], k);
    assert.equal((await itemsOnly.get(`${U}/export?format=csv`)).status, 403); // no entries page
    // Projects only: just the project entries, in JSON and CSV.
    const projOnly = await make('projonly', 'admin', ['projects']);
    const pj = (await projOnly.get(`${U}/export?format=json`)).body;
    assert.equal(pj.entries.length, 1);
    assert.equal(pj.entries[0].projectId, 'proj');
    assert.deepEqual(pj.documents, []);
    const csv = (await rawText(projOnly.get(`${U}/export?format=csv`))).body.toString('utf8');
    assert.match(csv, /Plain, with comma/);
    assert.doesNotMatch(csv, /second line/);
    // The full set for an account with every page.
    assert.equal((await ctx.api.get(`${U}/export?format=json`)).body.partial, false);
    // An editor with the Documents page only cannot export entries.
    const docsOnly = await make('docsonly', 'editor', ['documents']);
    assert.equal((await docsOnly.get(`${U}/export?format=csv`)).status, 403);
  });

  it('exports entries as CSV for editors (not viewers) with quoting, BOM and decimal amounts', async () => {
    assert.equal((await viewer.get(`${U}/export?format=csv`)).status, 403);
    const res = await rawText(editor.get(`${U}/export?format=csv`));
    assert.equal(res.status, 200);
    assert.match(res.headers['content-type'], /^text\/csv/);
    assert.equal(res.headers['content-disposition'], 'attachment; filename="ledger-family-all.csv"');
    const body = res.body.toString('utf8');
    assert.equal(body.charCodeAt(0), 0xfeff);
    assert.equal(body.split('\r\n')[0], '﻿date,fund,direction,amount,currency,party,category,project,comment,rate,status,paid_date,exclude,quantity,unit_price');
    assert.ok(body.includes('2025-12-31,Checking,dr,10326.29,PKR,Relative,Food,Trip,"Plain, with comma",,paid,,0'));
    assert.ok(body.includes('"He said ""hi""\nsecond line"'));
    assert.ok(!body.includes('deleted one'));

    const y = await rawText(editor.get(`${U}/export?format=csv&year=2026`));
    assert.equal(y.headers['content-disposition'], 'attachment; filename="ledger-family-2026.csv"');
    const text = y.body.toString('utf8');
    assert.ok(!text.includes('Plain, with comma'));
    assert.ok(text.includes('5.00'));
  });

  it('rejects an unknown format', async () => {
    assert.equal((await editor.get(`${U}/export?format=xml`)).status, 400);
    assert.equal((await editor.get(`${U}/export`)).status, 400);
  });

  it('exports stored quantities and unit prices through CSV and JSON', async () => {
    const created = await ctx.api.post(`${U}/entries`).send({
      date: '2026-03-01', fundId: 'checking', direction: 'dr', quantity: 10, unitPrice: 5000
    });
    assert.equal(created.status, 201);
    const csv = (await rawText(editor.get(`${U}/export?format=csv&year=2026`))).body.toString('utf8');
    assert.ok(csv.includes('2026-03-01,Checking,dr,500.00,PKR'));
    assert.ok(csv.includes(',10,50.00\r\n'));
    const entries = (await ctx.api.get(`${U}/export?format=json`)).body.entries;
    const row = entries.find(e => e.id === created.body.id);
    assert.equal(row.quantity, 10);
    assert.equal(row.unitPrice, 5000);
    assert.equal(row.amount, 50000);
  });
});

describe('csv helpers', () => {
  it('formats decimals from minor units', () => {
    assert.equal(decimal(1032629), '10326.29');
    assert.equal(decimal(5), '0.05');
    assert.equal(decimal(100), '1.00');
  });
  it('quotes commas, quotes and newlines', () => {
    const csv = entriesCsv([{ date: '2026-01-01', fund: 'A,B', direction: 'cr', amount: 100, currency: 'PKR', comment: 'x"y', exclude: 1 }]);
    assert.ok(csv.includes('"A,B"'));
    assert.ok(csv.includes('"x""y"'));
    assert.ok(csv.endsWith(',1,1,1.00\r\n'));
  });
  it('exports quantity and unit price without changing the total amount', () => {
    const csv = entriesCsv([{ date: '2026-01-01', fund: 'Travel', direction: 'dr', amount: 50000, currency: 'PKR', quantity: 10, unit_price: 5000 }]);
    assert.ok(csv.includes('Travel,dr,500.00,PKR'));
    assert.ok(csv.endsWith(',0,10,50.00\r\n'));
  });
});
