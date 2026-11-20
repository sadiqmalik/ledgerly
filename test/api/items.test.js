const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { makeContext, withCookie, BOOK } = require('./helpers');
const { createAccountStore } = require('../../server/auth/accounts');

const U = `/api/books/${BOOK}`;

describe('item tracker API', () => {
  let ctx; let app; let viewer; let editor;

  beforeEach(async () => {
    ctx = await makeContext();
    app = ctx.app;
    await ctx.d1.batch([
      ctx.d1.prepare("INSERT INTO item_locations (id, book_id, name, place) VALUES ('foreign_loc', 'personal', 'Shed', 'UK')")
    ]);
    const store = createAccountStore(ctx.repo.authStore);
    for (const role of ['viewer', 'editor']) {
      await store.create({ email: `${role}@example.com`, name: role, password: 'a long passphrase here', memberships: [{ bookId: BOOK, role }] });
    }
    const login = async e => withCookie(app, `lsid=${(await ctx.auth.login(e, 'a long passphrase here')).sid}`);
    viewer = await login('viewer@example.com');
    editor = await login('editor@example.com');
  });
  afterEach(async () => { await ctx.close(); });

  it('manages locations and items with role checks, joined names and updated time', async () => {
    assert.equal((await viewer.post(`${U}/item-locations`).send({ name: 'Garage' })).status, 403);
    const loc = await editor.post(`${U}/item-locations`).send({ name: 'Garage', place: 'Pakistan' });
    assert.equal(loc.status, 201);
    assert.equal((await editor.post(`${U}/item-locations`).send({ name: 'garage' })).status, 400);

    assert.equal((await viewer.post(`${U}/items`).send({ name: 'Drill' })).status, 403);
    const created = await editor.post(`${U}/items`).send({ name: 'Drill', comment: 'cordless', locationId: loc.body.id, owner: 'Relative' });
    assert.equal(created.status, 201);
    assert.equal(created.body.locationName, 'Garage');
    assert.equal(created.body.place, 'Pakistan');
    assert.equal(created.body.owner, 'Relative');
    assert.ok(created.body.updatedAt);

    await ctx.d1.prepare("UPDATE items SET updated_at = '2000-01-01T00:00:00.000Z' WHERE id = ?").bind(created.body.id).run();
    const upd = await editor.put(`${U}/items/${created.body.id}`).send({ comment: '' });
    assert.equal(upd.status, 200);
    assert.equal(upd.body.comment, null);
    assert.equal(upd.body.name, 'Drill');
    assert.ok(upd.body.updatedAt > '2000-01-01');

    const list = await viewer.get(`${U}/items`);
    assert.equal(list.status, 200);
    assert.deepEqual(list.body.map(i => i.name), ['Drill']);
    assert.equal((await viewer.get(`${U}/item-locations`)).body[0].itemCount, 1);
    assert.equal((await viewer.put(`${U}/items/${created.body.id}`).send({ name: 'Changed' })).status, 403);
    assert.equal((await viewer.put(`${U}/item-locations/${loc.body.id}`).send({ place: 'Changed' })).status, 403);
    assert.equal((await viewer.delete(`${U}/item-locations/${loc.body.id}`)).status, 403);

    const renamed = await editor.put(`${U}/item-locations/${loc.body.id}`).send({ name: 'Workshop', place: 'Sweden' });
    assert.equal(renamed.status, 200);
    const moved = (await viewer.get(`${U}/items`)).body[0];
    assert.equal(moved.locationName, 'Workshop');
    assert.equal(moved.place, 'Sweden');

    assert.equal((await editor.delete(`${U}/item-locations/${loc.body.id}`)).status, 400);
    assert.equal((await viewer.delete(`${U}/items/${created.body.id}`)).status, 403);
    assert.equal((await editor.delete(`${U}/items/${created.body.id}`)).status, 200);
    assert.equal((await editor.delete(`${U}/item-locations/${loc.body.id}`)).status, 200);
    assert.deepEqual((await viewer.get(`${U}/items`)).body, []);
  });

  it('rejects locations from another book and unknown fields', async () => {
    assert.equal((await editor.post(`${U}/items`).send({ name: 'X', locationId: 'foreign_loc' })).status, 404);
    assert.equal((await editor.post(`${U}/items`).send({ name: '' })).status, 400);
    assert.equal((await editor.post(`${U}/items`).send({ name: 'X', bookId: 'personal' })).status, 400);
    const ok = await editor.post(`${U}/items`).send({ name: 'X' });
    assert.equal((await editor.put(`${U}/items/${ok.body.id}`).send({ locationId: 'foreign_loc' })).status, 404);
    assert.equal((await editor.put(`${U}/item-locations/foreign_loc`).send({ name: 'Y' })).status, 404);
    assert.equal((await editor.put(`/api/books/personal/items/${ok.body.id}`).send({ name: 'Z' })).status, 403);
    assert.equal((await viewer.get('/api/books/personal/items')).status, 403);
    assert.equal((await viewer.get('/api/books/personal/item-locations')).status, 403);
    assert.equal((await request(app).get(`${U}/items`)).status, 401);
  });

  it('includes items and locations in the backup export', async () => {
    const loc = await editor.post(`${U}/item-locations`).send({ name: 'Attic' });
    await editor.post(`${U}/items`).send({ name: 'Box', locationId: loc.body.id });
    const data = await request(app).get(`${U}/export?format=json`).set('Cookie', ctx.cookie);
    assert.equal(data.status, 200);
    assert.equal(data.body.items[0].name, 'Box');
    assert.equal(data.body.itemLocations[0].name, 'Attic');
  });

  it('lets an access-code visitor read the tracker but never change it', async () => {
    const loc = await editor.post(`${U}/item-locations`).send({ name: 'Closet', place: 'Home' });
    const item = await editor.post(`${U}/items`).send({ name: 'Suitcase', locationId: loc.body.id });
    const created = await ctx.api.post('/api/admin/access-codes').send({
      name: 'Tracker visitor', bookIds: [BOOK], code: 'tracker-visitor-2026'
    });
    assert.equal(created.status, 201);
    const login = await request(app).post('/api/auth/access-code').send({ code: created.body.accessCode.code });
    assert.equal(login.status, 200);
    const visitor = withCookie(app, login.headers['set-cookie'][0].split(';')[0]);
    assert.equal((await visitor.get(`${U}/items`)).body[0].name, 'Suitcase');
    assert.equal((await visitor.get(`${U}/item-locations`)).body[0].name, 'Closet');
    assert.equal((await visitor.post(`${U}/items`).send({ name: 'Other' })).status, 403);
    assert.equal((await visitor.put(`${U}/items/${item.body.id}`).send({ owner: 'Other' })).status, 403);
    assert.equal((await visitor.delete(`${U}/items/${item.body.id}`)).status, 403);
    assert.equal((await visitor.post(`${U}/item-locations`).send({ name: 'Other' })).status, 403);
    assert.equal((await visitor.put(`${U}/item-locations/${loc.body.id}`).send({ place: 'Other' })).status, 403);
    assert.equal((await visitor.delete(`${U}/item-locations/${loc.body.id}`)).status, 403);
    assert.equal((await visitor.get('/api/books/personal/items')).status, 403);
  });
});
