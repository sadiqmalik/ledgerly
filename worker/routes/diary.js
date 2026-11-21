// Notebooks: several notebooks, each with categories (a person or topic) and entries (notes and important dates).
// A notebook is linked to one ledger or to none:
//  - linked: it follows that ledger's access. A super administrator, or an admin who has the Notebook page and a role in
//    the ledger, can open it; Viewer reads, Editor and Admin change it.
//  - not linked: only the super administrator who owns it can open it (not even another super administrator).
// Access codes never reach it. A notebook the account cannot use answers 404, so its existence is not revealed.
const { z, parse, isoDate, id, notFound, flag } = require('./validate');
const { hasResource } = require('../../server/auth/resources');
const { RANK, roleFor } = require('../../server/auth/roles');
const { ConflictError, ForbiddenError, AppError } = require('../../server/errors');

const text = max => z.string().trim().max(max);
const fields = {
  date: isoDate, title: text(200).min(1), message: text(8000).nullable(),
  fromName: text(120).nullable(), toName: text(120).nullable(), projectId: id.nullable(),
  important: flag, active: flag, categoryId: id.nullable(), kind: z.enum(['note', 'date']), repeatYearly: flag
};
const COLS = {
  date: 'date', title: 'title', message: 'message', fromName: 'from_name', toName: 'to_name', projectId: 'project_id',
  important: 'important', active: 'active', categoryId: 'category_id', kind: 'kind', repeatYearly: 'repeat_yearly'
};
const createSchema = z.object({
  date: fields.date, title: fields.title, message: fields.message.optional(), fromName: fields.fromName.optional(),
  toName: fields.toName.optional(), projectId: fields.projectId.optional(), important: fields.important.optional(),
  categoryId: fields.categoryId.optional(), kind: fields.kind.optional(), repeatYearly: fields.repeatYearly.optional()
}).strict();
const updateSchema = z.object(Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, v.optional()]))).strict();
const categorySchema = z.object({ name: text(80).min(1), description: text(2000).nullable().optional() }).strict();
const categoryUpdateSchema = z.object({ name: text(80).min(1).optional(), description: text(2000).nullable().optional() }).strict();
const notebookSchema = z.object({ name: text(80).min(1), description: text(2000).nullable().optional(), bookId: id.nullable().optional() }).strict();
const notebookUpdateSchema = z.object({ name: text(80).min(1).optional(), description: text(2000).nullable().optional(), bookId: id.nullable().optional() }).strict();
const upcomingQuery = z.object({ days: z.coerce.number().int().min(1).max(366).optional(), today: isoDate.optional(), category: z.string().optional() });
const listQuery = z.object({
  project: z.string().optional(), q: z.string().trim().max(200).optional(), from: isoDate.optional(), to: isoDate.optional(),
  status: z.enum(['active', 'disabled', 'all']).optional(), important: z.enum(['1']).optional(),
  fromName: z.string().max(120).optional(), toName: z.string().max(120).optional(),
  category: z.string().optional(), kind: z.enum(['note', 'date']).optional()
});

const likeEscape = s => s.replace(/[\\%_]/g, m => `\\${m}`);
const map = r => ({
  id: r.id, notebookId: r.notebook_id, date: r.date, title: r.title, message: r.message, fromName: r.from_name, toName: r.to_name,
  projectId: r.project_id, projectName: r.project_name, categoryId: r.category_id, categoryName: r.category_name,
  kind: r.kind, repeatYearly: r.repeat_yearly === 1, important: r.important === 1, active: r.active === 1,
  createdAt: r.created_at, updatedAt: r.updated_at
});
const SELECT = `SELECT n.*, p.name AS project_name, c.name AS category_name FROM diary_notes n
  LEFT JOIN projects p ON p.id = n.project_id AND p.book_id = n.book_id LEFT JOIN diary_categories c ON c.id = n.category_id`;

// The next time a dated entry comes round on or after today (YYYY-MM-DD strings): a yearly one repeats on its month
// and day (29 February falls on 28 February in other years), a one-off is its own date or nothing.
const isLeap = y => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
const nextOccurrence = (date, yearly, today) => {
  if (date >= today) return date;
  if (!yearly) return null;
  const [, m, d] = date.split('-');
  const fit = y => (m === '02' && d === '29' && !isLeap(y) ? `${y}-02-28` : `${y}-${m}-${d}`);
  const year = Number(today.slice(0, 4));
  const here = fit(year);
  return here >= today ? here : fit(year + 1);
};
const daysBetween = (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);
const isoToday = () => new Date().toISOString().slice(0, 10);

const registerDiaryRoutes = (app, { repo }) => {
  const root = '/api/diary/notebooks';
  const L = repo.ledger;
  const now = () => new Date().toISOString();
  const NB_SELECT = 'SELECT n.*, b.name AS book_name FROM diary_notebooks n LEFT JOIN books b ON b.id = n.book_id';

  // The signed-in account, or a refusal. Needs the Notebook page unless a super administrator; never an access code.
  const who = c => {
    const account = c.get('account');
    if (!account || !account.id || account.accessCode) throw new ForbiddenError('The Notebook is private');
    if (!account.isSuperAdmin && !hasResource(account, 'diary')) throw new ForbiddenError('This account cannot use the Notebook');
    return account;
  };
  // What this account may do with a notebook row, or null when it may not open it at all.
  const rights = (account, nb) => {
    if (!nb.book_id) return account.isSuperAdmin && nb.owner_id === account.id ? { canEdit: true, isOwner: true, canDelete: true, canRelink: true } : null;
    const role = roleFor(account, nb.book_id);
    if (!role) return null;
    const isOwner = nb.owner_id === account.id;
    return { canEdit: RANK[role] >= RANK.editor, isOwner, canDelete: isOwner || role === 'admin', canRelink: account.isSuperAdmin && isOwner };
  };
  const view = (nb, r, counts = {}) => ({
    id: nb.id, name: nb.name, description: nb.description, bookId: nb.book_id, bookName: nb.book_name ?? null,
    canEdit: r.canEdit, canDelete: r.canDelete, canRelink: r.canRelink, isOwner: r.isOwner, createdAt: nb.created_at, updatedAt: nb.updated_at,
    noteCount: counts.note || 0, dateCount: counts.date || 0, categoryCount: counts.categories || 0
  });
  // Loads notebook :n and checks the caller may open it (and change it when edit is true).
  const open = async (c, { edit = false } = {}) => {
    const account = who(c);
    const nb = await L.first(`${NB_SELECT} WHERE n.id = ?`, c.req.param('n'));
    const r = nb && rights(account, nb);
    if (!r) throw notFound('Notebook');
    if (nb.book_id && !account.isSuperAdmin) {
      const book = await repo.books.get(nb.book_id);
      if (book && book.active === 0) throw new AppError('This ledger is deactivated. A super administrator can reactivate it.', 423);
    }
    if (edit && !r.canEdit) throw new ForbiddenError('This notebook is view only for your account');
    return { account, nb, r };
  };
  const checkBookWrite = async (account, bookId) => {
    if (!bookId) return;
    const book = await repo.books.get(bookId);
    const role = book && roleFor(account, bookId);
    if (!role) throw notFound('Ledger');
    if (RANK[role] < RANK.editor) throw new ForbiddenError('You need the Editor role in that ledger');
  };
  const checkProject = async (nb, projectId) => {
    if (!projectId) return;
    if (!nb.book_id || !(await L.inBook('projects', nb.book_id, projectId))) throw notFound('Project');
  };
  const getCategory = (nbId, cid) => L.first('SELECT * FROM diary_categories WHERE id = ? AND notebook_id = ?', cid, nbId);
  const checkCategory = async (nbId, cid) => { if (cid && !(await getCategory(nbId, cid))) throw notFound('Category'); };
  const checkCategoryName = async (nbId, name, selfId) => {
    const dup = await L.first('SELECT id FROM diary_categories WHERE notebook_id = ? AND LOWER(name) = ?', nbId, name.toLowerCase());
    if (dup && dup.id !== selfId) throw new ConflictError('A category with this name already exists');
  };
  const mapCategory = (r, stats = {}) => ({ id: r.id, name: r.name, description: r.description, createdAt: r.created_at, updatedAt: r.updated_at, noteCount: 0, dateCount: 0, nextDate: null, nextDaysAway: null, ...stats });
  const idFilter = (raw, column, where, params) => {
    const ids = raw.split(',').filter(Boolean).slice(0, 100);
    const real = ids.filter(x => x !== 'none');
    const parts = [];
    if (real.length) { parts.push(`${column} IN (${real.map(() => '?').join(',')})`); params.push(...real); }
    if (ids.includes('none')) parts.push(`${column} IS NULL`);
    if (parts.length) where.push(`(${parts.join(' OR ')})`);
  };

  // ---- Notebooks ----
  app.get(root, async c => {
    const account = who(c);
    const all = await L.all(`${NB_SELECT} ORDER BY LOWER(n.name), n.id`);
    const mine = all.map(nb => ({ nb, r: rights(account, nb) })).filter(x => x.r);
    const counts = new Map();
    for (const row of await L.all('SELECT notebook_id, kind, COUNT(*) AS n FROM diary_notes WHERE active = 1 GROUP BY notebook_id, kind')) {
      counts.set(row.notebook_id, { ...(counts.get(row.notebook_id) || {}), [row.kind]: row.n });
    }
    for (const row of await L.all('SELECT notebook_id, COUNT(*) AS n FROM diary_categories GROUP BY notebook_id')) {
      counts.set(row.notebook_id, { ...(counts.get(row.notebook_id) || {}), categories: row.n });
    }
    return c.json(mine.map(({ nb, r }) => view(nb, r, counts.get(nb.id))));
  });

  app.post(root, async c => {
    const account = who(c);
    const data = parse(notebookSchema, c.get('body'));
    if (!data.bookId && !account.isSuperAdmin) throw new ForbiddenError('Only a super administrator can keep a notebook that is not linked to a ledger');
    await checkBookWrite(account, data.bookId);
    const nid = crypto.randomUUID();
    const at = now();
    await L.run('INSERT INTO diary_notebooks (id, owner_id, book_id, name, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      nid, account.id, data.bookId || null, data.name, data.description || null, at, at).run();
    const nb = await L.first(`${NB_SELECT} WHERE n.id = ?`, nid);
    return c.json(view(nb, rights(account, nb)), 201);
  });

  app.put(`${root}/:n`, async c => {
    const { account, nb, r } = await open(c, { edit: true });
    const data = parse(notebookUpdateSchema, c.get('body'));
    let bookId = nb.book_id;
    if (data.bookId !== undefined && (data.bookId || null) !== nb.book_id) {
      if (!r.canRelink) throw new ForbiddenError('Only the super administrator who owns this notebook can change its ledger');
      await checkBookWrite(account, data.bookId);
      bookId = data.bookId || null;
    }
    const at = now();
    await repo.ledger.batch([
      L.run('UPDATE diary_notebooks SET name = ?, description = ?, book_id = ?, updated_at = ? WHERE id = ?',
        data.name ?? nb.name, data.description === undefined ? nb.description : (data.description || null), bookId, at, nb.id),
      // Entries keep the notebook's ledger (a notebook with no ledger uses an empty one), and lose project links of the old one.
      L.run('UPDATE diary_notes SET book_id = ? WHERE notebook_id = ?', bookId || '', nb.id),
      ...(bookId !== nb.book_id ? [L.run('UPDATE diary_notes SET project_id = NULL WHERE notebook_id = ?', nb.id)] : [])
    ]);
    const next = await L.first(`${NB_SELECT} WHERE n.id = ?`, nb.id);
    return c.json(view(next, rights(account, next)));
  });

  // Deleting a notebook removes its categories and entries too.
  app.delete(`${root}/:n`, async c => {
    const { nb, r } = await open(c, { edit: true });
    if (!r.canDelete) throw new ForbiddenError('Only the notebook owner or a ledger admin can delete it');
    await repo.ledger.batch([
      L.run('DELETE FROM diary_notes WHERE notebook_id = ?', nb.id),
      L.run('DELETE FROM diary_categories WHERE notebook_id = ?', nb.id),
      L.run('DELETE FROM diary_notebooks WHERE id = ?', nb.id)
    ]);
    return c.json({ success: true });
  });

  // ---- Entries ----
  app.get(`${root}/:n/entries`, async c => {
    const { nb } = await open(c);
    const f = parse(listQuery, c.req.query());
    const where = ['n.notebook_id = ?'];
    const params = [nb.id];
    const add = (sql, ...p) => { where.push(sql); params.push(...p); };
    const status = f.status || 'active';
    if (status === 'active') add('n.active = 1');
    else if (status === 'disabled') add('n.active = 0');
    if (f.important) add('n.important = 1');
    if (f.project) idFilter(f.project, 'n.project_id', where, params);
    if (f.category) idFilter(f.category, 'n.category_id', where, params);
    if (f.kind) add('n.kind = ?', f.kind);
    if (f.fromName) add('LOWER(n.from_name) = ?', f.fromName.toLowerCase());
    if (f.toName) add('LOWER(n.to_name) = ?', f.toName.toLowerCase());
    if (f.from) add('n.date >= ?', f.from);
    if (f.to) add('n.date <= ?', f.to);
    if (f.q) {
      const like = `%${likeEscape(f.q.toLowerCase())}%`;
      add(`(${['title', 'message', 'from_name', 'to_name'].map(k => `LOWER(n.${k}) LIKE ? ESCAPE '\\'`).join(' OR ')})`, like, like, like, like);
    }
    const rows = await L.all(`${SELECT} WHERE ${where.join(' AND ')} ORDER BY n.date DESC, n.created_at DESC, n.id DESC`, ...params);
    return c.json(rows.map(map));
  });

  // Active important dates coming up within `days` (default 30), soonest first. today defaults to the server date.
  app.get(`${root}/:n/upcoming`, async c => {
    const { nb } = await open(c);
    const q = parse(upcomingQuery, c.req.query());
    const today = q.today || isoToday();
    const days = q.days || 30;
    const where = ['n.notebook_id = ?', 'n.active = 1', "n.kind = 'date'"];
    const params = [nb.id];
    if (q.category) idFilter(q.category, 'n.category_id', where, params);
    const out = [];
    for (const r of await L.all(`${SELECT} WHERE ${where.join(' AND ')}`, ...params)) {
      const next = nextOccurrence(r.date, r.repeat_yearly === 1, today);
      if (!next) continue;
      const away = daysBetween(today, next);
      if (away <= days) out.push({ ...map(r), nextDate: next, daysAway: away, years: r.repeat_yearly === 1 ? Number(next.slice(0, 4)) - Number(r.date.slice(0, 4)) : null });
    }
    out.sort((x, y) => x.nextDate.localeCompare(y.nextDate) || x.title.localeCompare(y.title));
    return c.json(out);
  });

  // Names already used as From or For in this notebook, for the suggestion lists.
  app.get(`${root}/:n/names`, async c => {
    const { nb } = await open(c);
    const rows = await L.all(
      `SELECT from_name AS name FROM diary_notes WHERE notebook_id = ? AND from_name IS NOT NULL AND from_name <> ''
       UNION SELECT to_name FROM diary_notes WHERE notebook_id = ? AND to_name IS NOT NULL AND to_name <> '' ORDER BY 1`, nb.id, nb.id);
    return c.json(rows.map(r => r.name));
  });

  app.post(`${root}/:n/entries`, async c => {
    const { account, nb } = await open(c, { edit: true });
    const data = parse(createSchema, c.get('body'));
    await checkProject(nb, data.projectId);
    await checkCategory(nb.id, data.categoryId);
    const kind = data.kind || 'note';
    const eid = crypto.randomUUID();
    const at = now();
    await L.run(
      `INSERT INTO diary_notes (id, book_id, notebook_id, date, title, message, from_name, to_name, project_id, category_id, kind, repeat_yearly, important, active, created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`,
      eid, nb.book_id || '', nb.id, data.date, data.title, data.message || null, data.fromName || null, data.toName || null,
      data.projectId || null, data.categoryId || null, kind, kind === 'date' && data.repeatYearly ? 1 : 0,
      data.important ? 1 : 0, account.id, at, at).run();
    return c.json(map(await L.first(`${SELECT} WHERE n.id = ?`, eid)), 201);
  });

  const getEntry = async (nb, eid) => {
    const row = await L.first(`${SELECT} WHERE n.id = ? AND n.notebook_id = ?`, eid, nb.id);
    if (!row) throw notFound('Entry');
    return row;
  };

  app.put(`${root}/:n/entries/:id`, async c => {
    const { nb } = await open(c, { edit: true });
    const eid = c.req.param('id');
    await getEntry(nb, eid);
    const data = parse(updateSchema, c.get('body'));
    await checkProject(nb, data.projectId);
    await checkCategory(nb.id, data.categoryId);
    const keys = Object.keys(data);
    if (keys.length) {
      await L.run(`UPDATE diary_notes SET ${keys.map(k => `${COLS[k]} = ?`).join(', ')}, updated_at = ? WHERE id = ? AND notebook_id = ?`,
        ...keys.map(k => (typeof data[k] === 'boolean' ? (data[k] ? 1 : 0) : (data[k] === '' ? null : data[k]))), now(), eid, nb.id).run();
      // Only an important date can repeat.
      await L.run("UPDATE diary_notes SET repeat_yearly = 0 WHERE id = ? AND notebook_id = ? AND kind <> 'date'", eid, nb.id).run();
    }
    return c.json(map(await getEntry(nb, eid)));
  });

  app.delete(`${root}/:n/entries/:id`, async c => {
    const { nb } = await open(c, { edit: true });
    await getEntry(nb, c.req.param('id'));
    await L.run('DELETE FROM diary_notes WHERE id = ? AND notebook_id = ?', c.req.param('id'), nb.id).run();
    return c.json({ success: true });
  });

  // ---- Categories (inside a notebook) ----
  app.get(`${root}/:n/categories`, async c => {
    const { nb } = await open(c);
    const today = parse(upcomingQuery, c.req.query()).today || isoToday();
    const cats = await L.all('SELECT * FROM diary_categories WHERE notebook_id = ? ORDER BY LOWER(name), id', nb.id);
    const notes = await L.all('SELECT category_id, kind, date, repeat_yearly FROM diary_notes WHERE notebook_id = ? AND active = 1 AND category_id IS NOT NULL', nb.id);
    const stats = new Map(cats.map(x => [x.id, { noteCount: 0, dateCount: 0, nextDate: null, nextDaysAway: null }]));
    for (const n of notes) {
      const st = stats.get(n.category_id);
      if (!st) continue;
      if (n.kind === 'date') {
        st.dateCount += 1;
        const next = nextOccurrence(n.date, n.repeat_yearly === 1, today);
        if (next && (!st.nextDate || next < st.nextDate)) { st.nextDate = next; st.nextDaysAway = daysBetween(today, next); }
      } else st.noteCount += 1;
    }
    return c.json(cats.map(x => mapCategory(x, stats.get(x.id))));
  });

  app.post(`${root}/:n/categories`, async c => {
    const { nb } = await open(c, { edit: true });
    const data = parse(categorySchema, c.get('body'));
    await checkCategoryName(nb.id, data.name);
    const cid = crypto.randomUUID();
    const at = now();
    await L.run('INSERT INTO diary_categories (id, book_id, owner_id, notebook_id, name, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      cid, nb.book_id || '', nb.owner_id, nb.id, data.name, data.description || null, at, at).run();
    return c.json(mapCategory(await getCategory(nb.id, cid)), 201);
  });

  app.put(`${root}/:n/categories/:cid`, async c => {
    const { nb } = await open(c, { edit: true });
    const cid = c.req.param('cid');
    const row = await getCategory(nb.id, cid);
    if (!row) throw notFound('Category');
    const data = parse(categoryUpdateSchema, c.get('body'));
    if (data.name) await checkCategoryName(nb.id, data.name, cid);
    await L.run('UPDATE diary_categories SET name = ?, description = ?, updated_at = ? WHERE id = ? AND notebook_id = ?',
      data.name ?? row.name, data.description === undefined ? row.description : (data.description || null), now(), cid, nb.id).run();
    return c.json(mapCategory(await getCategory(nb.id, cid)));
  });

  // Deleting a category keeps its entries; they just have no category afterwards.
  app.delete(`${root}/:n/categories/:cid`, async c => {
    const { nb } = await open(c, { edit: true });
    const cid = c.req.param('cid');
    if (!(await getCategory(nb.id, cid))) throw notFound('Category');
    await repo.ledger.batch([
      L.run('UPDATE diary_notes SET category_id = NULL, updated_at = ? WHERE notebook_id = ? AND category_id = ?', now(), nb.id, cid),
      L.run('DELETE FROM diary_categories WHERE id = ? AND notebook_id = ?', cid, nb.id)
    ]);
    return c.json({ success: true });
  });
};

module.exports = { registerDiaryRoutes };
