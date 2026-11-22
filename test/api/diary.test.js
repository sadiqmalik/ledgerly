const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { makeContext, withCookie, BOOK } = require('./helpers');
const { createAccountStore } = require('../../server/auth/accounts');
const R = require('../../server/auth/resources');

const PW = 'a long passphrase here';
const NB = '/api/diary/notebooks';

describe('notebooks API', () => {
  let ctx; let owner; let other; let editor; let viewer; let plain; let outsider;
  const entry = (nb, body = {}, who = owner) => who.post(`${NB}/${nb}/entries`).send({ date: '2026-02-01', title: 'Remember the deposit', ...body });

  beforeEach(async () => {
    ctx = await makeContext();
    await ctx.d1.batch([
      ctx.d1.prepare("INSERT INTO projects (id, book_id, name, kind) VALUES ('proj', ?, 'House', 'other'), ('other_proj', 'personal', 'Else', 'other')").bind(BOOK)
    ]);
    const store = createAccountStore(ctx.repo.authStore);
    const mk = (email, extra) => store.create({ email, name: email.split('@')[0], password: PW, ...extra });
    await mk('other@example.com', { isSuperAdmin: true });
    await mk('editor@example.com', { memberships: [{ bookId: BOOK, role: 'editor' }], resources: ['diary'] });
    await mk('viewer@example.com', { memberships: [{ bookId: BOOK, role: 'viewer' }], resources: ['diary'] });
    await mk('plain@example.com', { memberships: [{ bookId: BOOK, role: 'editor' }] }); // no Notebook page
    await mk('outsider@example.com', { memberships: [{ bookId: 'personal', role: 'admin' }], resources: ['diary'] });
    const login = async e => withCookie(ctx.app, `lsid=${(await ctx.auth.login(e, PW)).sid}`);
    owner = ctx.api; // the tester, a super administrator
    other = await login('other@example.com'); editor = await login('editor@example.com'); viewer = await login('viewer@example.com');
    plain = await login('plain@example.com'); outsider = await login('outsider@example.com');
  });
  afterEach(async () => { await ctx.close(); });

  const linked = async (name = 'Family') => (await owner.post(NB).send({ name, bookId: BOOK })).body;
  const unlinked = async (name = 'Mine') => (await owner.post(NB).send({ name })).body;

  it('creates notebooks linked to a ledger or to none, several per ledger, and lists them per account', async () => {
    const a = await linked('Family'); const b = await linked('Car'); const c = await unlinked('Private');
    assert.equal(a.bookId, BOOK); assert.equal(c.bookId, null);
    assert.ok(a.createdAt && a.updatedAt);
    assert.deepEqual((await owner.get(NB)).body.map(n => n.name), ['Car', 'Family', 'Private']);
    // A linked notebook follows ledger access; an unlinked one is only its owner's.
    assert.deepEqual((await editor.get(NB)).body.map(n => [n.name, n.canEdit]), [['Car', true], ['Family', true]]);
    assert.deepEqual((await viewer.get(NB)).body.map(n => [n.name, n.canEdit]), [['Car', false], ['Family', false]]);
    assert.deepEqual((await outsider.get(NB)).body, []);
    assert.deepEqual((await other.get(NB)).body.map(n => n.name), ['Car', 'Family']); // another super admin: linked ones only
    assert.equal((await other.get(`${NB}/${c.id}/entries`)).status, 404);
    assert.equal((await editor.get(`${NB}/${c.id}/entries`)).status, 404);
    // No page, no access; access codes never.
    assert.equal((await plain.get(NB)).status, 403);
    assert.equal((await ctx.anonymous.get(NB)).status, 401);
    assert.equal(R.RESOURCES.includes('diary'), true);
    assert.equal(R.CODE_RESOURCES.includes('diary'), true);
    assert.equal(R.DEFAULT_ALL_RESOURCES.includes('diary'), false);
    // Creating: an unlinked notebook only by a super admin, a linked one needs an Editor role in that ledger.
    assert.equal((await editor.post(NB).send({ name: 'x' })).status, 403);
    assert.equal((await viewer.post(NB).send({ name: 'x', bookId: BOOK })).status, 403);
    assert.equal((await outsider.post(NB).send({ name: 'x', bookId: BOOK })).status, 404);
    assert.equal((await editor.post(NB).send({ name: 'Edi', bookId: BOOK })).status, 201);
    assert.equal((await owner.post(NB).send({ name: '' })).status, 400);
    assert.equal((await owner.post(NB).send({ name: 'x', bookId: 'nope' })).status, 404);
    assert.ok(b.id);
  });

  it('view-only for a Viewer, editable for an Editor, and delete rules', async () => {
    const a = await linked();
    assert.equal((await entry(a.id, {}, viewer)).status, 403);
    assert.equal((await viewer.get(`${NB}/${a.id}/entries`)).status, 200);
    assert.equal((await viewer.put(`${NB}/${a.id}`).send({ name: 'x' })).status, 403);
    const made = await entry(a.id, { message: 'Bring the receipt', fromName: 'Ammi', projectId: 'proj', important: true }, editor);
    assert.equal(made.status, 201);
    assert.equal(made.body.projectName, 'House');
    assert.equal((await entry(a.id, { projectId: 'other_proj' }, editor)).status, 404);
    // Shared by ledger access: the owner and the viewer see the editor's entry.
    assert.deepEqual((await owner.get(`${NB}/${a.id}/entries`)).body.map(n => n.id), [made.body.id]);
    assert.equal((await viewer.put(`${NB}/${a.id}/entries/${made.body.id}`).send({ title: 'x' })).status, 403);
    assert.equal((await viewer.delete(`${NB}/${a.id}/entries/${made.body.id}`)).status, 403);
    assert.equal((await editor.put(`${NB}/${a.id}`).send({ name: 'Renamed' })).body.name, 'Renamed');
    // An editor who is not the owner cannot delete or move the notebook; the owner can.
    assert.equal((await editor.delete(`${NB}/${a.id}`)).status, 403);
    assert.equal((await editor.put(`${NB}/${a.id}`).send({ bookId: null })).status, 403);
    assert.equal((await outsider.get(`${NB}/${a.id}/entries`)).status, 404);
    assert.equal((await owner.delete(`${NB}/${a.id}`)).status, 200);
    assert.equal((await owner.get(`${NB}/${a.id}/entries`)).status, 404);
    assert.equal((await ctx.d1.prepare('SELECT COUNT(*) AS n FROM diary_notes').first()).n, 0);
  });

  it('relinking: only the owning super admin, entries follow, project links of the old ledger are dropped', async () => {
    const a = await linked();
    const made = (await entry(a.id, { projectId: 'proj' })).body;
    assert.equal((await owner.put(`${NB}/${a.id}`).send({ bookId: null })).body.bookId, null);
    assert.equal((await editor.get(`${NB}/${a.id}/entries`)).status, 404); // no longer shared
    assert.equal((await owner.get(`${NB}/${a.id}/entries`)).body[0].projectId, null);
    assert.equal((await owner.put(`${NB}/${a.id}/entries/${made.id}`).send({ projectId: 'proj' })).status, 404); // no ledger, no projects
    assert.equal((await owner.put(`${NB}/${a.id}`).send({ bookId: BOOK })).body.bookId, BOOK);
  });

  it('entries and filters: edit, disable, delete, names, search', async () => {
    const a = await linked();
    const id = (await entry(a.id, { message: 'Bring the receipt', fromName: 'Ammi', toName: 'Me', projectId: 'proj', important: true })).body.id;
    await entry(a.id, { date: '2026-03-01', title: 'Second note', fromName: 'Dad' });
    const U = `${NB}/${a.id}`;
    assert.deepEqual((await owner.get(`${U}/entries`)).body.map(n => n.title), ['Second note', 'Remember the deposit']);
    assert.deepEqual((await owner.get(`${U}/entries?project=proj`)).body.map(n => n.id), [id]);
    assert.deepEqual((await owner.get(`${U}/entries?project=none`)).body.map(n => n.title), ['Second note']);
    assert.deepEqual((await owner.get(`${U}/entries?important=1`)).body.map(n => n.id), [id]);
    assert.deepEqual((await owner.get(`${U}/entries?q=receipt`)).body.map(n => n.id), [id]);
    assert.deepEqual((await owner.get(`${U}/names`)).body, ['Ammi', 'Dad', 'Me']);
    assert.equal((await owner.put(`${U}/entries/${id}`).send({ title: 'Updated', toName: null, projectId: null })).body.title, 'Updated');
    assert.equal((await owner.put(`${U}/entries/${id}`).send({ active: false })).body.active, false);
    assert.deepEqual((await owner.get(`${U}/entries`)).body.map(n => n.title), ['Second note']);
    assert.equal((await owner.get(`${U}/entries?status=all`)).body.length, 2);
    assert.equal((await owner.get(`${U}/entries?status=weird`)).status, 400);
    assert.equal((await entry(a.id, { title: '' })).status, 400);
    assert.equal((await entry(a.id, { extra: 1 })).status, 400);
    assert.equal((await owner.delete(`${U}/entries/${id}`)).status, 200);
    assert.equal((await owner.delete(`${U}/entries/${id}`)).status, 404);
  });

  it('categories inside a notebook, important dates and upcoming', async () => {
    const nb = await linked(); const nb2 = await linked('Car');
    const U = `${NB}/${nb.id}`;
    const fam = (await owner.post(`${U}/categories`).send({ name: 'Family' })).body;
    assert.equal((await owner.post(`${U}/categories`).send({ name: 'family' })).status, 400); // unique per notebook
    assert.equal((await owner.post(`${NB}/${nb2.id}/categories`).send({ name: 'Family' })).status, 201); // same name elsewhere is fine
    assert.equal((await viewer.post(`${U}/categories`).send({ name: 'No' })).status, 403);
    assert.equal((await entry(nb2.id, { categoryId: fam.id })).status, 404); // another notebook's category
    const anniv = (await entry(nb.id, { date: '2019-03-14', title: 'Anniversary', categoryId: fam.id, kind: 'date', repeatYearly: true })).body;
    const once = (await entry(nb.id, { date: '2025-06-01', title: 'First cleaning', categoryId: fam.id, kind: 'date' })).body;
    const note = (await entry(nb.id, { title: 'Plain', categoryId: fam.id, repeatYearly: true })).body;
    assert.equal(note.repeatYearly, false);
    assert.equal(anniv.categoryName, 'Family');
    assert.deepEqual((await owner.get(`${U}/entries?category=${fam.id}&kind=date`)).body.map(n => n.id).sort(), [anniv.id, once.id].sort());
    const up = (await viewer.get(`${U}/upcoming?today=2026-03-01&days=30`)).body;
    assert.deepEqual(up.map(n => [n.title, n.nextDate, n.daysAway, n.years]), [['Anniversary', '2026-03-14', 13, 7]]);
    assert.equal((await viewer.get(`${U}/upcoming?today=2026-03-20&days=366`)).body[0].nextDate, '2027-03-14');
    assert.equal((await viewer.get(`${U}/upcoming?today=bad`)).status, 400);
    await entry(nb.id, { date: '2020-02-29', title: 'Leap', kind: 'date', repeatYearly: true });
    assert.equal((await viewer.get(`${U}/upcoming?today=2026-02-01&days=60`)).body.find(n => n.title === 'Leap').nextDate, '2026-02-28');
    const row = (await viewer.get(`${U}/categories?today=2026-03-01`)).body[0];
    assert.deepEqual([row.dateCount, row.noteCount, row.nextDate, row.nextDaysAway], [2, 1, '2026-03-14', 13]);
    assert.equal((await owner.put(`${U}/categories/${fam.id}`).send({ name: 'Kin' })).body.name, 'Kin');
    assert.equal((await owner.delete(`${U}/categories/${fam.id}`)).status, 200);
    assert.equal((await owner.delete(`${U}/categories/${fam.id}`)).status, 404);
    assert.ok((await owner.get(`${U}/entries?status=all&category=none`)).body.some(n => n.id === once.id));
  });

  it('a ledger that is deleted takes its linked notebooks with it', async () => {
    const a = await linked();
    await entry(a.id);
    await ctx.repo.books.remove(BOOK);
    assert.equal((await ctx.d1.prepare('SELECT COUNT(*) AS n FROM diary_notebooks').first()).n, 0);
    assert.equal((await ctx.d1.prepare('SELECT COUNT(*) AS n FROM diary_notes').first()).n, 0);
  });

  describe('access codes', () => {
    const codeApi = async (resources, bookIds = [BOOK]) => {
      const made = await owner.post('/api/admin/access-codes').send({ name: 'Board', bookIds, ...(resources ? { resources } : {}) });
      assert.equal(made.status, 201);
      const res = await request(ctx.app).post('/api/auth/access-code').set('cf-connecting-ip', '10.7.7.7').send({ code: made.body.accessCode.code });
      assert.equal(res.status, 200);
      return withCookie(ctx.app, res.headers['set-cookie'][0].split(';')[0]);
    };

    it('reads only the notebooks linked to its ledgers, and changes nothing', async () => {
      const fam = await linked('Family');
      const cat = (await owner.post(`${NB}/${fam.id}/categories`).send({ name: 'Cars' })).body;
      const note = (await entry(fam.id, { title: 'Insurance' })).body;
      const priv = await unlinked('Private');
      const car = (await owner.post(NB).send({ name: 'Car', bookId: 'personal' })).body;
      const code = await codeApi(['diary']);
      const list = (await code.get(NB)).body;
      assert.deepEqual(list.map(n => [n.name, n.canEdit, n.canDelete, n.canRelink]), [['Family', false, false, false]]);
      assert.equal((await code.get(`${NB}/${fam.id}/categories`)).body.length, 1);
      assert.equal((await code.get(`${NB}/${fam.id}/entries`)).body.length, 1);
      assert.equal((await code.get(`${NB}/${fam.id}/upcoming`)).status, 200);
      assert.equal((await code.get(`${NB}/${fam.id}/names`)).status, 200);
      for (const nb of [car.id, priv.id]) {
        assert.equal((await code.get(`${NB}/${nb}/entries`)).status, 404);
        assert.equal((await code.get(`${NB}/${nb}/categories`)).status, 404);
      }
      const writes = [
        ['post', NB, { name: 'x', bookId: BOOK }], ['put', `${NB}/${fam.id}`, { name: 'y' }], ['delete', `${NB}/${fam.id}`],
        ['post', `${NB}/${fam.id}/entries`, { date: '2026-02-01', title: 'z' }], ['put', `${NB}/${fam.id}/entries/${note.id}`, { title: 'z' }],
        ['delete', `${NB}/${fam.id}/entries/${note.id}`], ['post', `${NB}/${fam.id}/categories`, { name: 'New' }],
        ['put', `${NB}/${fam.id}/categories/${cat.id}`, { name: 'New' }], ['delete', `${NB}/${fam.id}/categories/${cat.id}`]
      ];
      for (const [method, url, body] of writes) assert.equal((await code[method](url).send(body)).status, 403, `${method} ${url}`);
      assert.equal((await owner.get(`${NB}/${fam.id}/entries`)).body.length, 1);
    });

    it('is refused without the Notebook page', async () => {
      await linked('Family');
      const code = await codeApi(['dashboard']);
      assert.equal((await code.get(NB)).status, 403);
    });
  });
});
