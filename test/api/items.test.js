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

  describe('items shared with more ledgers', () => {
    const P = '/api/books/personal';
    const mk = async (email, memberships) => {
      await createAccountStore(ctx.repo.authStore).create({ email, name: email, password: 'a long passphrase here', memberships });
      return withCookie(app, `lsid=${(await ctx.auth.login(email, 'a long passphrase here')).sid}`);
    };

    it('names only ledgers an access code can open', async () => {
      await ctx.d1.prepare("INSERT INTO books (id, name, created_at) VALUES ('vault', 'Vault', ?)").bind(new Date().toISOString()).run();
      const a = await ctx.api.post(`${U}/items`).send({ name: 'Main A', extraLedgerIds: ['personal'] });
      const c = await ctx.api.post('/api/books/vault/items').send({ name: 'Main C', extraLedgerIds: [BOOK] });
      assert.equal(a.status, 201); assert.equal(c.status, 201);
      const made = await ctx.api.post('/api/admin/access-codes').send({ name: 'Board', bookIds: [BOOK, 'personal'], resources: ['items'] });
      const res = await request(app).post('/api/auth/access-code').set('cf-connecting-ip', '10.7.9.9').send({ code: made.body.accessCode.code });
      const code = withCookie(app, res.headers['set-cookie'][0].split(';')[0]);
      const inA = (await code.get(`${U}/items`)).body;
      assert.deepEqual(inA.map(x => x.name).sort(), ['Main A', 'Main C']);
      const ia = inA.find(x => x.name === 'Main A'); const ic = inA.find(x => x.name === 'Main C');
      assert.deepEqual(ia.ledgerIds, [BOOK, 'personal']); assert.equal(ia.mainLedgerId, BOOK);
      assert.deepEqual(ic.ledgerIds, [BOOK]); assert.deepEqual(ic.ledgerNames, ['Family']);
      assert.equal(ic.mainLedgerId, BOOK); assert.equal(ic.sharedFrom, null);
      assert.ok(!JSON.stringify(inA).toLowerCase().includes('vault'));
      assert.deepEqual((await code.get('/api/books/personal/items')).body.map(x => x.name), ['Main A']);
      assert.equal((await ctx.api.get(`${U}/items`)).body.find(x => x.name === 'Main C').sharedFrom, 'Vault'); // normal account unchanged
    });

    it('lists, and refuses every edit and delete through the second ledger', async () => {
      const both = await mk('both@example.com', [{ bookId: BOOK, role: 'editor' }, { bookId: 'personal', role: 'editor' }]);
      const loc = await both.post(`${U}/item-locations`).send({ name: 'Garage', place: 'UK' });
      const own = await both.post(`${U}/items`).send({ name: 'Plain' });
      assert.deepEqual(own.body.ledgerIds, [BOOK]);
      assert.equal(own.body.sharedFrom, null);
      assert.deepEqual((await both.get(`${P}/items`)).body, []);

      const it = await both.post(`${U}/items`).send({ name: 'Ladder', locationId: loc.body.id, extraLedgerIds: ['personal'] });
      assert.equal(it.status, 201);
      assert.deepEqual(it.body.ledgerIds, [BOOK, 'personal']);
      assert.equal(it.body.mainLedgerId, BOOK);
      assert.deepEqual(it.body.ledgerNames, ['Family', 'Personal']);
      const there = (await both.get(`${P}/items`)).body;
      assert.deepEqual(there.map(x => x.name), ['Ladder']);
      assert.equal(there[0].sharedFrom, 'Family');
      assert.equal(there[0].locationName, 'Garage');

      const ed = await both.put(`${P}/items/${it.body.id}`).send({ name: 'Big ladder', comment: 'blue', owner: 'Me' });
      assert.equal(ed.status, 409);
      assert.match(ed.body.error, /shared from Family\. Edit it there/);
      assert.equal((await both.get(`${U}/items`)).body.find(x => x.id === it.body.id).name, 'Ladder');
      assert.equal((await both.put(`${P}/items/${it.body.id}`).send({ locationId: null })).status, 409);
      assert.equal((await both.put(`${P}/items/${it.body.id}`).send({ extraLedgerIds: [] })).status, 409);
      assert.equal((await both.delete(`${P}/items/${it.body.id}`)).status, 409);
      assert.equal((await both.get(`${P}/items`)).body.length, 1);

      // Remove the share, then add it back; deleting in the main ledger cleans the link rows.
      assert.equal((await both.put(`${U}/items/${it.body.id}`).send({ extraLedgerIds: [] })).body.ledgerIds.length, 1);
      assert.deepEqual((await both.get(`${P}/items`)).body, []);
      assert.equal((await both.put(`${U}/items/${it.body.id}`).send({ extraLedgerIds: ['personal'] })).status, 200);
      assert.equal((await both.put(`${U}/items/${it.body.id}`).send({ extraLedgerIds: [BOOK] })).status, 400);
      assert.equal((await both.delete(`${U}/items/${it.body.id}`)).status, 200);
      assert.equal((await ctx.d1.prepare('SELECT COUNT(*) AS n FROM item_ledgers').first()).n, 0);
      assert.deepEqual((await both.get(`${P}/items`)).body, []);
    });

    it('moves an item to another ledger from its main ledger only', async () => {
      const both = await mk('mv@example.com', [{ bookId: BOOK, role: 'admin' }, { bookId: 'personal', role: 'admin' }]);
      const locA = await both.post(`${U}/item-locations`).send({ name: 'Garage' });
      const locB = (await both.post(`${P}/item-locations`).send({ name: 'Flat' }));
      const it = await both.post(`${U}/items`).send({ name: 'Bike', locationId: locA.body.id, extraLedgerIds: ['personal'] });
      assert.equal((await both.put(`${U}/items/${it.body.id}`).send({ moveToLedgerId: BOOK })).status, 400);
      assert.equal((await both.put(`${P}/items/${it.body.id}`).send({ moveToLedgerId: BOOK })).status, 409);
      // A location of the old ledger is refused for the target.
      assert.equal((await both.put(`${U}/items/${it.body.id}`).send({ moveToLedgerId: 'personal', locationId: locA.body.id })).status, 404);
      const moved = await both.put(`${U}/items/${it.body.id}`).send({ moveToLedgerId: 'personal' });
      assert.equal(moved.status, 200);
      assert.equal(moved.body.mainLedgerId, 'personal');
      assert.equal(moved.body.locationId, null);
      assert.deepEqual(moved.body.ledgerIds, ['personal']);
      assert.deepEqual((await both.get(`${U}/items`)).body.map(x => x.id).filter(x => x === it.body.id), []);
      assert.equal((await both.put(`${U}/items/${it.body.id}`).send({ name: 'X' })).status, 404);

      // Move back, keeping the old ledger as an extra and choosing a location in the target.
      const loc2 = await both.post(`${U}/item-locations`).send({ name: 'Shed' });
      const back = await both.put(`${P}/items/${it.body.id}`).send({ moveToLedgerId: BOOK, locationId: loc2.body.id, extraLedgerIds: ['personal'] });
      assert.equal(back.status, 200);
      assert.equal(back.body.locationId, loc2.body.id);
      assert.deepEqual(back.body.ledgerIds, [BOOK, 'personal']);
      assert.equal(locB.status, 201);
    });

    it('refuses a move without the role or the page in the target', async () => {
      const noPage = await mk('mv2@example.com', [{ bookId: BOOK, role: 'admin' }, { bookId: 'personal', role: 'admin', resources: ['ledger'] }]);
      const viewerThere = await mk('mv3@example.com', [{ bookId: BOOK, role: 'admin' }, { bookId: 'personal', role: 'editor' }]);
      const viewerHere = await mk('mv4@example.com', [{ bookId: BOOK, role: 'editor' }, { bookId: 'personal', role: 'admin' }]);
      const editors = await mk('mv5@example.com', [{ bookId: BOOK, role: 'editor' }, { bookId: 'personal', role: 'editor' }]);
      const it = await editor.post(`${U}/items`).send({ name: 'Box' });
      assert.equal((await noPage.put(`${U}/items/${it.body.id}`).send({ moveToLedgerId: 'personal' })).status, 403);
      assert.equal((await viewerThere.put(`${U}/items/${it.body.id}`).send({ moveToLedgerId: 'personal' })).status, 403);
      assert.equal((await viewerHere.put(`${U}/items/${it.body.id}`).send({ moveToLedgerId: 'personal' })).status, 403);
      assert.equal((await editors.put(`${U}/items/${it.body.id}`).send({ moveToLedgerId: 'personal' })).status, 403);
      assert.equal((await editor.get(`${U}/items`)).body.length, 1);
      assert.equal((await ctx.api.put(`${U}/items/${it.body.id}`).send({ moveToLedgerId: 'personal' })).status, 200);
    });

    it('needs the role and the Item Vault page in the other ledger, and viewers cannot edit', async () => {
      const noPage = await mk('nopage@example.com', [{ bookId: BOOK, role: 'editor' }, { bookId: 'personal', role: 'editor', resources: ['ledger'] }]);
      assert.equal((await noPage.post(`${U}/items`).send({ name: 'A', extraLedgerIds: ['personal'] })).status, 403);
      const viewerElsewhere = await mk('ve@example.com', [{ bookId: BOOK, role: 'editor' }, { bookId: 'personal', role: 'viewer' }]);
      assert.equal((await viewerElsewhere.post(`${U}/items`).send({ name: 'A', extraLedgerIds: ['personal'] })).status, 403);
      assert.equal((await editor.post(`${U}/items`).send({ name: 'A', extraLedgerIds: ['nope'] })).status, 403);

      const both = await mk('both2@example.com', [{ bookId: BOOK, role: 'editor' }, { bookId: 'personal', role: 'editor' }]);
      const it = await both.post(`${U}/items`).send({ name: 'Shared', extraLedgerIds: ['personal'] });
      const viewerBoth = await mk('vb@example.com', [{ bookId: BOOK, role: 'viewer' }, { bookId: 'personal', role: 'viewer' }]);
      assert.equal((await viewerBoth.get(`${P}/items`)).body[0].name, 'Shared');
      assert.equal((await viewerBoth.put(`${P}/items/${it.body.id}`).send({ name: 'X' })).status, 403);
      assert.equal((await viewerBoth.put(`${U}/items/${it.body.id}`).send({ name: 'X' })).status, 403);
      // A person with no Item Vault page in the second ledger does not see the shared item there.
      const noVault = await mk('nv@example.com', [{ bookId: 'personal', role: 'editor', resources: ['ledger'] }]);
      assert.equal((await noVault.get(`${P}/items`)).status, 403);
      // Not reachable through an unrelated ledger id.
      assert.equal((await both.put(`/api/books/zzz/items/${it.body.id}`).send({ name: 'X' })).status, 403);
    });
  });
});
