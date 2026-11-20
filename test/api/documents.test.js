const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { makeContext, withCookie, BOOK } = require('./helpers');
const { createAccountStore } = require('../../server/auth/accounts');

const U = `/api/books/${BOOK}`;
const PDF = Buffer.from('%PDF-1.4 test file bytes');

describe('documents API', () => {
  let ctx; let viewer; let editor;
  const create = (body, who = editor) => who.post(`${U}/documents`).send({ date: '2026-01-10', title: 'Blood test', ...body });
  const upload = (docId, body, type = 'application/pdf', name = 'Report 1.pdf', who = editor) =>
    who.put(`${U}/documents/${docId}/file`).set('Content-Type', type).set('X-File-Name', encodeURIComponent(name)).send(body);

  beforeEach(async () => {
    ctx = await makeContext();
    await ctx.d1.batch([
      ctx.d1.prepare("INSERT INTO parties (id, book_id, name) VALUES ('relative', ?, 'Relative'), ('other_party', 'personal', 'Elsewhere')").bind(BOOK),
      ctx.d1.prepare("INSERT INTO projects (id, book_id, name, kind) VALUES ('proj', ?, 'Relative medical 2026', 'medical'), ('other_proj', 'personal', 'Else', 'other')").bind(BOOK)
    ]);
    const store = createAccountStore(ctx.repo.authStore);
    for (const role of ['viewer', 'editor']) {
      await store.create({ email: `${role}@example.com`, name: role, password: 'a long passphrase here', memberships: [{ bookId: BOOK, role }] });
    }
    const login = async e => withCookie(ctx.app, `lsid=${(await ctx.auth.login(e, 'a long passphrase here')).sid}`);
    viewer = await login('viewer@example.com');
    editor = await login('editor@example.com');
  });
  afterEach(async () => { await ctx.close(); });

  it('creates, lists, filters, updates and deletes with role checks', async () => {
    assert.equal((await create({}, viewer)).status, 403);
    const res = await create({ doctor: 'Dr Khan', hospital: 'City Hospital', type: 'Lab', comment: 'fasting', projectId: 'proj', partyId: 'relative' });
    assert.equal(res.status, 201);
    assert.equal(res.body.projectName, 'Relative medical 2026');
    assert.equal(res.body.partyName, 'Relative');
    assert.equal(res.body.hasFile, false);
    assert.ok(res.body.createdAt);
    await create({ date: '2026-03-01', title: 'X-ray', type: 'Imaging' });

    const list = await viewer.get(`${U}/documents`);
    assert.equal(list.status, 200);
    assert.deepEqual(list.body.map(d => d.title), ['X-ray', 'Blood test']);
    assert.deepEqual((await viewer.get(`${U}/documents?type=Lab`)).body.map(d => d.title), ['Blood test']);
    assert.deepEqual((await viewer.get(`${U}/documents?q=khan`)).body.map(d => d.title), ['Blood test']);
    assert.deepEqual((await viewer.get(`${U}/documents?q=city`)).body.map(d => d.title), ['Blood test']);
    assert.deepEqual((await viewer.get(`${U}/documents?project=proj`)).body.length, 1);
    const types2 = encodeURIComponent('Lab\u001fImaging');
    assert.deepEqual((await viewer.get(`${U}/documents?type=${types2}`)).body.length, 2);
    assert.deepEqual((await viewer.get(`${U}/documents?project=proj,none`)).body.length, 2);
    assert.deepEqual((await viewer.get(`${U}/documents?project=none`)).body.map(d => d.title), ['X-ray']);
    assert.deepEqual((await viewer.get(`${U}/documents?from=2026-02-01`)).body.map(d => d.title), ['X-ray']);
    assert.deepEqual((await viewer.get(`${U}/documents/types`)).body, ['Imaging', 'Lab']);

    assert.equal((await viewer.put(`${U}/documents/${res.body.id}`).send({ title: 'Nope' })).status, 403);
    const upd = await editor.put(`${U}/documents/${res.body.id}`).send({ title: 'Blood test 2', doctor: null });
    assert.equal(upd.status, 200);
    assert.equal(upd.body.title, 'Blood test 2');
    assert.equal(upd.body.doctor, null);
    assert.equal(upd.body.hospital, 'City Hospital');
    assert.equal((await editor.put(`${U}/documents/${res.body.id}`).send({ title: '' })).status, 400);

    assert.equal((await viewer.delete(`${U}/documents/${res.body.id}`)).status, 403);
    assert.equal((await editor.delete(`${U}/documents/${res.body.id}`)).status, 200);
    assert.equal((await editor.delete(`${U}/documents/${res.body.id}`)).status, 404);
  });

  it('validates input and scopes references to the book', async () => {
    assert.equal((await editor.post(`${U}/documents`).send({ title: 'No date' })).status, 400);
    assert.equal((await create({ date: '2026-13-40' })).status, 400);
    assert.equal((await create({ projectId: 'other_proj' })).status, 404);
    assert.equal((await create({ partyId: 'other_party' })).status, 404);
  });

  it('returns 404 for documents of another book', async () => {
    await ctx.d1.prepare("INSERT INTO documents (id, book_id, title, date, r2_key) VALUES ('foreign', 'personal', 'T', '2026-01-01', 'docs/personal/foreign')").run();
    assert.equal((await viewer.get(`${U}/documents`)).body.length, 0);
    assert.equal((await editor.put(`${U}/documents/foreign`).send({ title: 'x' })).status, 404);
    assert.equal((await upload('foreign', PDF)).status, 404);
    assert.equal((await viewer.get(`${U}/documents/foreign/file`)).status, 404);
    assert.equal((await editor.delete(`${U}/documents/foreign`)).status, 404);
  });

  it('uploads, downloads, replaces and deletes a file', async () => {
    const doc = (await create({})).body;
    assert.equal((await viewer.get(`${U}/documents/${doc.id}/file`)).status, 404);
    assert.equal((await upload(doc.id, PDF, 'application/pdf', 'x.pdf', viewer)).status, 403);

    const up = await upload(doc.id, PDF, 'application/pdf', 'Rapport årlig (1).pdf');
    assert.equal(up.status, 200);
    assert.equal(up.body.hasFile, true);
    assert.equal(up.body.fileName, 'Rapport årlig (1).pdf');
    assert.equal(up.body.fileType, 'application/pdf');
    assert.equal(up.body.fileSize, PDF.length);
    assert.ok(ctx.docs.store.has(`docs/${BOOK}/${doc.id}`));
    assert.equal(ctx.docs.store.get(`docs/${BOOK}/${doc.id}`).httpMetadata.contentType, 'application/pdf');

    const down = await viewer.get(`${U}/documents/${doc.id}/file`).buffer(true).parse((res, cb) => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => cb(null, Buffer.concat(chunks)));
    });
    assert.equal(down.status, 200);
    assert.equal(down.headers['content-type'], 'application/pdf');
    assert.match(down.headers['content-disposition'], /^inline; filename\*=UTF-8''Rapport%20%C3%A5rlig%20%281%29\.pdf$/);
    assert.deepEqual(down.body, PDF);
    assert.equal((await viewer.get(`${U}/documents`)).body[0].hasFile, true);

    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
    const re = await upload(doc.id, png, 'image/png', 'scan.png');
    assert.equal(re.body.fileType, 'image/png');
    assert.equal(re.body.fileSize, 4);

    assert.equal((await editor.delete(`${U}/documents/${doc.id}`)).status, 200);
    assert.equal(ctx.docs.store.size, 0);
  });

  it('rejects files that are too large (413) or of the wrong type (415)', async () => {
    const doc = (await create({})).body;
    const big = Buffer.alloc(10 * 1024 * 1024 + 1, 1);
    assert.equal((await upload(doc.id, big)).status, 413);
    assert.equal((await upload(doc.id, Buffer.alloc(10 * 1024 * 1024, 1))).status, 200);
    assert.equal((await upload(doc.id, Buffer.from('MZ'), 'application/zip')).status, 415);
    assert.equal((await upload(doc.id, Buffer.from('hi'), 'text/html')).status, 415);
    assert.equal((await upload(doc.id, Buffer.alloc(0))).status, 400);
  });
});

describe('documents API without file storage', () => {
  it('answers 503 on file endpoints when DOCS is not bound', async () => {
    const ctx = await makeContext({ docs: false });
    try {
      const doc = (await ctx.api.post(`${U}/documents`).send({ date: '2026-01-10', title: 'T' })).body;
      const up = await ctx.api.put(`${U}/documents/${doc.id}/file`).set('Content-Type', 'application/pdf').send(PDF);
      assert.equal(up.status, 503);
      assert.equal(up.body.error, 'file storage not configured');
      assert.equal((await ctx.api.get(`${U}/documents/${doc.id}/file`)).status, 503);
      assert.equal((await ctx.api.delete(`${U}/documents/${doc.id}`)).status, 200);
    } finally { await ctx.close(); }
  });
});
