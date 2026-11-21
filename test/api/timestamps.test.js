const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { makeContext, BOOK } = require('./helpers');

const U = `/api/books/${BOOK}`;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

// Design rule: every table has created_at and updated_at, filled by the database itself (migration 0022 triggers).
describe('created_at and updated_at on every table', () => {
  let ctx;
  beforeEach(async () => { ctx = await makeContext(); });
  afterEach(async () => { await ctx.close(); });
  const row = (sql, ...p) => ctx.d1.prepare(sql).bind(...p).first();

  it('the trigger fills both on insert and refreshes updated_at on update, for each retrofitted table', async () => {
    const t = ctx.d1.prepare.bind(ctx.d1);
    await ctx.d1.batch([
      t("INSERT INTO holders (id, book_id, name, currency, kind) VALUES ('h_ts', ?, 'TS cash', 'PKR', 'cash')").bind(BOOK),
      t("INSERT INTO categories (id, book_id, name, default_direction) VALUES ('c_ts', ?, 'TS cat', 'dr')").bind(BOOK),
      t("INSERT INTO parties (id, book_id, name) VALUES ('p_ts', ?, 'TS person')").bind(BOOK),
      t("INSERT INTO item_locations (id, book_id, name) VALUES ('l_ts', ?, 'Shelf')").bind(BOOK)
    ]);
    for (const [table, id] of [['holders', 'h_ts'], ['categories', 'c_ts'], ['parties', 'p_ts'], ['item_locations', 'l_ts']]) {
      const made = await row(`SELECT created_at, updated_at FROM ${table} WHERE id = ?`, id);
      assert.match(made.created_at, ISO, table);
      assert.match(made.updated_at, ISO, table);
    }
    // An update that does not touch updated_at refreshes it; created_at never changes.
    await ctx.d1.prepare("UPDATE categories SET created_at = '2020-01-01T00:00:00.000Z', updated_at = '2020-01-01T00:00:00.000Z' WHERE id = 'c_ts'").run();
    await ctx.d1.prepare("UPDATE categories SET name = 'Renamed' WHERE id = 'c_ts'").run();
    const after = await row("SELECT created_at, updated_at FROM categories WHERE id = 'c_ts'");
    assert.equal(after.created_at, '2020-01-01T00:00:00.000Z');
    assert.notEqual(after.updated_at, '2020-01-01T00:00:00.000Z');
    // A statement that sets updated_at itself is respected.
    await ctx.d1.prepare("UPDATE categories SET name = 'Again', updated_at = '2021-02-03T04:05:06.000Z' WHERE id = 'c_ts'").run();
    assert.equal((await row("SELECT updated_at FROM categories WHERE id = 'c_ts'")).updated_at, '2021-02-03T04:05:06.000Z');
  });

  it('the API returns createdAt and updatedAt for funds, accounts, categories, people, items and projects', async () => {
    const fund = await ctx.api.post(`${U}/funds`).send({ name: 'TS fund', kind: 'general', currency: 'PKR' });
    assert.equal(fund.status, 201);
    assert.match(fund.body.createdAt, ISO);
    assert.match(fund.body.updatedAt, ISO);
    const list = (await ctx.api.get(`${U}/funds`)).body;
    assert.match(list.find(f => f.name === 'TS fund').createdAt, ISO);
    const cat = await ctx.api.post(`${U}/categories`).send({ name: 'TS cat 2' });
    assert.match(cat.body.createdAt, ISO);
    const person = await ctx.api.post(`${U}/parties`).send({ name: 'TS person 2' });
    assert.match(person.body.createdAt, ISO);
    const loc = await ctx.api.post(`${U}/item-locations`).send({ name: 'TS shelf' });
    assert.match(loc.body.createdAt, ISO);
    const item = await ctx.api.post(`${U}/items`).send({ name: 'TS item' });
    assert.match(item.body.createdAt, ISO);
    assert.match(item.body.updatedAt, ISO);
    const project = await ctx.api.post(`${U}/projects`).send({ name: 'TS project', kind: 'trip', fundId: fund.body.id });
    assert.equal(project.status, 201);
    assert.match(project.body.createdAt, ISO);
    const books = (await ctx.api.get('/api/books')).body;
    assert.ok(books.find(b => b.id === BOOK).createdAt);
  });
});
