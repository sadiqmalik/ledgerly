// Documents (the medical reports log) with optional files in R2 (binding DOCS).
// Reads need viewer; writes need editor. Everything is scoped to the book.
const { AppError } = require('../../server/errors');
const { z, parse, isoDate, id, need, notFound } = require('./validate');

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const FILE_TYPES = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic']);

const text = max => z.string().trim().max(max);
const fields = {
  date: isoDate, title: text(300).min(1), receivedOn: isoDate.nullable(),
  doctor: text(200).nullable(), hospital: text(200).nullable(), type: text(100).nullable(), comment: text(4000).nullable(),
  projectId: id.nullable(), partyId: id.nullable()
};
const REQUIRED = new Set(['date', 'title']);
const COLS = {
  date: 'date', title: 'title', receivedOn: 'received_on', doctor: 'doctor', hospital: 'hospital', type: 'type',
  comment: 'comment', projectId: 'project_id', partyId: 'party_id'
};
const baseCreate = z.object(Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, REQUIRED.has(k) ? v : v.optional()]))).strict();
const baseUpdate = z.object(Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, v.optional()]))).strict();
const MAX_LINKS = 50;
const idList = z.array(id).max(MAX_LINKS);
const withLinks = schema => schema.extend({ entryIds: idList.optional() });
const createSchema = withLinks(baseCreate);
const updateSchema = withLinks(baseUpdate);
const linkBody = z.object({ documentIds: idList }).strict();
const listQuery = z.object({
  project: z.string().optional(), party: z.string().optional(), type: z.string().optional(),
  q: z.string().trim().max(200).optional(), from: isoDate.optional(), to: isoDate.optional()
});

const SELECT = `SELECT d.*, p.name AS project_name, a.name AS party_name
  FROM documents d LEFT JOIN projects p ON p.id = d.project_id LEFT JOIN parties a ON a.id = d.party_id`;

const mapDoc = r => ({
  id: r.id, date: r.date, receivedOn: r.received_on, doctor: r.doctor, hospital: r.hospital, type: r.type,
  title: r.title, comment: r.comment, projectId: r.project_id, projectName: r.project_name,
  partyId: r.party_id, partyName: r.party_name, hasFile: Boolean(r.r2_key),
  fileName: r.file_name, fileType: r.file_type, fileSize: r.file_size, createdAt: r.created_at, updatedAt: r.updated_at ?? null
});

const mapLinkedDoc = r => ({ id: r.id, title: r.title, date: r.date, type: r.type, hasFile: Boolean(r.r2_key), fileName: r.file_name, fileType: r.file_type });
const mapLinkedEntry = r => ({
  id: r.id, date: r.date, direction: r.direction, amount: r.amount, currency: r.currency,
  partyName: r.party_name, comment: r.comment
});
const marks = list => list.map(() => '?').join(',');

const likeEscape = s => s.replace(/[\\%_]/g, m => `\\${m}`);
const objectKey = (bookId, docId) => `docs/${bookId}/${docId}`;

// Strips path pieces and control characters from a client-supplied file name.
const cleanFileName = raw => {
  let name = raw || '';
  try { name = decodeURIComponent(name); } catch { /* keep the raw value */ }
  name = name.replace(/[\u0000-\u001f\u007f]/g, '').replace(/^.*[\\/]/, '').trim().slice(0, 200);
  return name || 'file';
};
// RFC 5987 value: encodeURIComponent leaves ' ( ) * alone, which are not allowed there.
const encodeRfc5987 = s => encodeURIComponent(s).replace(/['()*]/g, ch => `%${ch.charCodeAt(0).toString(16).toUpperCase()}`);

const registerDocumentRoutes = (app, { repo, env }) => {
  const L = repo.ledger;
  const url = '/api/books/:b/documents';
  const nowIso = () => new Date().toISOString();
  const get = async (b, docId) => {
    const row = await L.first(`${SELECT} WHERE d.id = ? AND d.book_id = ?`, docId, b);
    if (!row) throw notFound('Document');
    return row;
  };
  const storage = c => {
    const bucket = (c.env && c.env.DOCS) || (env && env.DOCS);
    if (!bucket) throw new AppError('file storage not configured', 503);
    return bucket;
  };
  const checkRefs = async (b, data) => {
    if (data.projectId && !(await L.inBook('projects', b, data.projectId))) throw notFound('Project');
    if (data.partyId && !(await L.inBook('parties', b, data.partyId))) throw notFound('Party');
  };

  // Linked, non-deleted entries for the given documents, in ONE query: Map(documentId -> entries[]).
  const entriesByDoc = async (b, docIds) => {
    const by = new Map(docIds.map(i => [i, []]));
    for (let i = 0; i < docIds.length; i += 80) {
      const chunk = docIds.slice(i, i + 80);
      const rows = await L.all(
        `SELECT ed.document_id, e.id, e.date, e.direction, e.amount, e.currency, e.comment, p.name AS party_name
         FROM entry_documents ed JOIN entries e ON e.id = ed.entry_id AND e.book_id = ed.book_id
         LEFT JOIN parties p ON p.id = e.party_id
         WHERE ed.book_id = ? AND e.deleted_at IS NULL AND ed.document_id IN (${marks(chunk)})
         ORDER BY e.date DESC, e.created_at DESC, e.id DESC`, b, ...chunk);
      for (const r of rows) {
        const list = by.get(r.document_id);
        if (list && list.length < MAX_LINKS) list.push(mapLinkedEntry(r));
      }
    }
    return by;
  };
  const docWithEntries = async (b, docId) => {
    const row = await get(b, docId);
    return { ...mapDoc(row), entries: (await entriesByDoc(b, [docId])).get(docId) };
  };
  const dedupe = list => [...new Set(list)];
  const checkEntries = async (b, ids) => {
    if (!ids.length) return;
    const rows = await L.all(`SELECT id FROM entries WHERE book_id = ? AND deleted_at IS NULL AND id IN (${marks(ids)})`, b, ...ids);
    if (rows.length !== ids.length) throw notFound('Entry');
  };
  const linkStmts = (b, docId, entryIds, now) => [
    L.run('DELETE FROM entry_documents WHERE document_id = ? AND book_id = ?', docId, b),
    ...entryIds.map(eid => L.run('INSERT INTO entry_documents (entry_id, document_id, book_id, created_at) VALUES (?, ?, ?, ?)', eid, docId, b, now))
  ];
  const docsForEntry = async (b, entryId) => (await L.all(
    `SELECT d.id, d.title, d.date, d.type, d.r2_key, d.file_name, d.file_type
     FROM entry_documents ed JOIN documents d ON d.id = ed.document_id AND d.book_id = ed.book_id
     JOIN entries e ON e.id = ed.entry_id AND e.book_id = ed.book_id
     WHERE ed.entry_id = ? AND ed.book_id = ? AND e.deleted_at IS NULL
     ORDER BY d.date DESC, d.created_at DESC, d.id DESC`, entryId, b)).map(mapLinkedDoc);
  const liveEntry = async (b, entryId) => {
    if (!(await L.first('SELECT id FROM entries WHERE id = ? AND book_id = ? AND deleted_at IS NULL', entryId, b))) throw notFound('Entry');
  };

  app.get(`${url}/for-entry/:entryId`, async c => {
    const b = c.req.param('b');
    await liveEntry(b, c.req.param('entryId'));
    return c.json(await docsForEntry(b, c.req.param('entryId')));
  });

  app.put(`${url}/for-entry/:entryId`, async c => {
    need(c, 'editor');
    const b = c.req.param('b');
    const entryId = c.req.param('entryId');
    await liveEntry(b, entryId);
    const documentIds = dedupe(parse(linkBody, c.get('body')).documentIds);
    if (documentIds.length) {
      const rows = await L.all(`SELECT id FROM documents WHERE book_id = ? AND id IN (${marks(documentIds)})`, b, ...documentIds);
      if (rows.length !== documentIds.length) throw notFound('Document');
    }
    const now = nowIso();
    await L.batch([
      L.run('DELETE FROM entry_documents WHERE entry_id = ? AND book_id = ?', entryId, b),
      ...documentIds.map(did => L.run('INSERT INTO entry_documents (entry_id, document_id, book_id, created_at) VALUES (?, ?, ?, ?)', entryId, did, b, now)),
      ...(documentIds.length ? [L.run(`UPDATE documents SET updated_at = ? WHERE book_id = ? AND id IN (${marks(documentIds)})`, now, b, ...documentIds)] : [])
    ]);
    return c.json(await docsForEntry(b, entryId));
  });

  app.get(url, async c => {
    const b = c.req.param('b');
    const f = parse(listQuery, c.req.query());
    const where = ['d.book_id = ?'];
    const params = [b];
    const add = (sql, ...p) => { where.push(sql); params.push(...p); };
    // project and type take several values: ids comma separated ('none' = no project), types separated by \u001f.
    if (f.project) {
      const ids = f.project.split(',').filter(Boolean).slice(0, 100);
      const real = ids.filter(x => x !== 'none');
      const parts = [];
      if (real.length) { parts.push(`d.project_id IN (${real.map(() => '?').join(',')})`); params.push(...real); }
      if (ids.includes('none')) parts.push('d.project_id IS NULL');
      if (parts.length) where.push(`(${parts.join(' OR ')})`);
    }
    if (f.party) add('d.party_id = ?', f.party);
    if (f.type) {
      const types = f.type.split('\u001f').filter(Boolean).slice(0, 100);
      if (types.length) add(`d.type IN (${types.map(() => '?').join(',')})`, ...types);
    }
    if (f.from) add('d.date >= ?', f.from);
    if (f.to) add('d.date <= ?', f.to);
    if (f.q) {
      const like = `%${likeEscape(f.q.toLowerCase())}%`;
      add(`(${['title', 'comment', 'doctor', 'hospital'].map(k => `LOWER(d.${k}) LIKE ? ESCAPE '\\'`).join(' OR ')})`, like, like, like, like);
    }
    const rows = await L.all(`${SELECT} WHERE ${where.join(' AND ')} ORDER BY d.date DESC, d.created_at DESC, d.id DESC`, ...params);
    const by = await entriesByDoc(b, rows.map(r => r.id));
    return c.json(rows.map(r => ({ ...mapDoc(r), entries: by.get(r.id) })));
  });

  app.get(`${url}/types`, async c => {
    const rows = await L.all("SELECT DISTINCT type FROM documents WHERE book_id = ? AND type IS NOT NULL AND type <> '' ORDER BY type", c.req.param('b'));
    return c.json(rows.map(r => r.type));
  });

  app.post(url, async c => {
    need(c, 'editor');
    const b = c.req.param('b');
    const { entryIds: rawIds, ...data } = parse(createSchema, c.get('body'));
    const entryIds = dedupe(rawIds || []);
    await checkRefs(b, data);
    await checkEntries(b, entryIds);
    const docId = crypto.randomUUID();
    const now = nowIso();
    const keys = Object.keys(data);
    await L.batch([
      L.run(
      `INSERT INTO documents (id, book_id, ${keys.map(k => COLS[k]).join(', ')}, created_at, updated_at) VALUES (?, ?, ${keys.map(() => '?').join(', ')}, ?, ?)`,
      docId, b, ...keys.map(k => data[k]), now, now
      ),
      ...linkStmts(b, docId, entryIds, now).slice(1)
    ]);
    return c.json(await docWithEntries(b, docId), 201);
  });

  app.put(`${url}/:id/file`, async c => {
    need(c, 'editor');
    const b = c.req.param('b');
    const bucket = storage(c);
    const doc = await get(b, c.req.param('id'));
    const contentType = (c.req.header('content-type') || '').split(';')[0].trim().toLowerCase();
    if (!FILE_TYPES.has(contentType)) throw new AppError('Unsupported file type (allowed: pdf, jpeg, png, webp, heic)', 415);
    if (Number(c.req.header('content-length') || 0) > MAX_FILE_BYTES) throw new AppError('File is too large (max 10 MB)', 413);
    const body = await c.req.arrayBuffer();
    if (body.byteLength > MAX_FILE_BYTES) throw new AppError('File is too large (max 10 MB)', 413);
    if (body.byteLength === 0) throw new AppError('File is empty', 400);
    const key = objectKey(b, doc.id);
    await bucket.put(key, body, { httpMetadata: { contentType } });
    await L.run(
      'UPDATE documents SET r2_key = ?, file_name = ?, file_type = ?, file_size = ?, updated_at = ? WHERE id = ? AND book_id = ?',
      key, cleanFileName(c.req.header('x-file-name')), contentType, body.byteLength, nowIso(), doc.id, b
    ).run();
    return c.json(await docWithEntries(b, doc.id));
  });

  app.get(`${url}/:id/file`, async c => {
    const b = c.req.param('b');
    const bucket = storage(c);
    const doc = await get(b, c.req.param('id'));
    if (!doc.r2_key) throw notFound('File');
    const obj = await bucket.get(doc.r2_key);
    if (!obj) throw notFound('File');
    return new Response(obj.body, {
      headers: {
        'Content-Type': doc.file_type || (obj.httpMetadata && obj.httpMetadata.contentType) || 'application/octet-stream',
        'Content-Disposition': `inline; filename*=UTF-8''${encodeRfc5987(doc.file_name || 'file')}`,
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff'
      }
    });
  });

  app.put(`${url}/:id`, async c => {
    need(c, 'editor');
    const b = c.req.param('b');
    const doc = await get(b, c.req.param('id'));
    const { entryIds: rawIds, ...data } = parse(updateSchema, c.get('body'));
    const entryIds = rawIds === undefined ? null : dedupe(rawIds);
    await checkRefs(b, data);
    if (entryIds) await checkEntries(b, entryIds);
    const keys = Object.keys(data).filter(k => data[k] !== undefined);
    const now = nowIso();
    const stmts = [];
    if (keys.length || entryIds) {
      stmts.push(L.run(
        `UPDATE documents SET ${[...keys.map(k => `${COLS[k]} = ?`), 'updated_at = ?'].join(', ')} WHERE id = ? AND book_id = ?`,
        ...keys.map(k => data[k]), now, doc.id, b
      ));
    }
    if (entryIds) stmts.push(...linkStmts(b, doc.id, entryIds, now));
    if (stmts.length) await L.batch(stmts);
    return c.json(await docWithEntries(b, doc.id));
  });

  app.delete(`${url}/:id`, async c => {
    need(c, 'editor');
    const b = c.req.param('b');
    const doc = await get(b, c.req.param('id'));
    if (doc.r2_key) await storage(c).delete(doc.r2_key);
    await L.batch([
      L.run('DELETE FROM entry_documents WHERE document_id = ? AND book_id = ?', doc.id, b),
      L.run('DELETE FROM documents WHERE id = ? AND book_id = ?', doc.id, b)
    ]);
    return c.json({ success: true });
  });
};

module.exports = { registerDocumentRoutes, MAX_FILE_BYTES, FILE_TYPES };
