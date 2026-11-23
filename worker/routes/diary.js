// Notebooks: several notebooks, each with categories (a person or topic) and entries (notes and important dates).
// A notebook is linked to one ledger (its main one) or to none, and can also be shared with extra ledgers (diary_notebook_ledgers);
// it opens through any ledger where the person has a role, the Notebook page and passes the notebook rules, with the highest role:
//  - linked: it follows that ledger's access. A super administrator, or an admin who has the Notebook page and a role in
//    the ledger, can open it; Viewer reads, Editor and Admin change it.
//  - not linked: only the super administrator who owns it can open it (not even another super administrator).
// Access codes never reach it. A notebook the account cannot use answers 404, so its existence is not revealed.
const { z, parse, isoDate, id, notFound, flag } = require('./validate');
const { hasResource, hasResourceAnywhere, forBook } = require('../../server/auth/resources');
const { RANK, roleFor, notebookRuleOf, notebookAllowed } = require('../../server/auth/roles');
const { ConflictError, ForbiddenError, AppError } = require('../../server/errors');

const text = max => z.string().trim().max(max);
const noteTime = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'must be HH:MM (24-hour)');
// A real IANA zone name such as 'Europe/Stockholm'; the runtime's Intl knows the list.
const isZone = v => { try { new Intl.DateTimeFormat('en', { timeZone: v }); return true; } catch { return false; } };
const zone = z.string().trim().min(1).max(64).refine(isZone, 'must be an IANA time zone, for example Europe/Stockholm');
const fields = {
  date: isoDate, time: noteTime.nullable(), timeZone: zone.nullable(), endDate: isoDate.nullable(), endTime: noteTime.nullable(), title: text(200).min(1), message: text(8000).nullable(),
  fromName: text(120).nullable(), toName: text(120).nullable(), projectId: id.nullable(),
  important: flag, active: flag, categoryId: id.nullable(), kind: z.enum(['note', 'date']), repeatYearly: flag, locked: flag
};
const COLS = {
  date: 'date', time: 'note_time', timeZone: 'time_zone', endDate: 'end_date', endTime: 'end_time', title: 'title', message: 'message', fromName: 'from_name', toName: 'to_name', projectId: 'project_id',
  important: 'important', active: 'active', categoryId: 'category_id', kind: 'kind', repeatYearly: 'repeat_yearly', locked: 'locked'
};
const createSchema = z.object({
  date: fields.date, time: fields.time.optional(), timeZone: fields.timeZone.optional(), endDate: fields.endDate.optional(), endTime: fields.endTime.optional(), title: fields.title, message: fields.message.optional(), fromName: fields.fromName.optional(),
  toName: fields.toName.optional(), projectId: fields.projectId.optional(), important: fields.important.optional(),
  categoryId: fields.categoryId.optional(), kind: fields.kind.optional(), repeatYearly: fields.repeatYearly.optional(), locked: fields.locked.optional()
}).strict();
const updateSchema = z.object(Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, v.optional()]))).strict();
const categorySchema = z.object({ name: text(80).min(1), description: text(2000).nullable().optional(), timeZone: zone.nullable().optional() }).strict();
const categoryUpdateSchema = z.object({ name: text(80).min(1).optional(), description: text(2000).nullable().optional(), timeZone: zone.nullable().optional(), locked: flag.optional() }).strict();
const extraIds = z.array(id).max(50);
const notebookSchema = z.object({ name: text(80).min(1), description: text(2000).nullable().optional(), bookId: id.nullable().optional(), extraLedgerIds: extraIds.optional(), timeZone: zone.nullable().optional() }).strict();
const notebookUpdateSchema = z.object({ name: text(80).min(1).optional(), description: text(2000).nullable().optional(), bookId: id.nullable().optional(), extraLedgerIds: extraIds.optional(), timeZone: zone.nullable().optional(), locked: flag.optional() }).strict();
const upcomingQuery = z.object({ days: z.coerce.number().int().min(1).max(366).optional(), today: isoDate.optional(), category: z.string().optional() });
const listQuery = z.object({
  project: z.string().optional(), q: z.string().trim().max(200).optional(), from: isoDate.optional(), to: isoDate.optional(),
  status: z.enum(['active', 'disabled', 'all']).optional(), important: z.enum(['1']).optional(),
  fromName: z.string().max(120).optional(), toName: z.string().max(120).optional(),
  category: z.string().optional(), kind: z.enum(['note', 'date']).optional()
});

const LOCKED = 'This entry is locked. Unlock it first.';
const NB_LOCKED = 'This notebook is locked. Unlock it first.';
const CAT_LOCKED = 'This category is locked. Unlock it first.';
const likeEscape = s => s.replace(/[\\%_]/g, m => `\\${m}`);
// Own zone, else the category's, else the notebook's; null when none is set (the client then uses the application zone).
const resolveZone = r => {
  const [zone, from] = r.time_zone ? [r.time_zone, 'entry'] : r.category_time_zone ? [r.category_time_zone, 'category'] : r.notebook_time_zone ? [r.notebook_time_zone, 'notebook'] : [null, null];
  return { resolvedTimeZone: zone, timeZoneFrom: from };
};
const map = r => ({
  id: r.id, notebookId: r.notebook_id, date: r.date, time: r.note_time || null, timeZone: r.time_zone || null, ...resolveZone(r), endDate: r.end_date || (r.end_time ? r.date : null), endTime: r.end_time || null, title: r.title, message: r.message, fromName: r.from_name, toName: r.to_name,
  projectId: r.project_id, projectName: r.project_name, categoryId: r.category_id, categoryName: r.category_name,
  kind: r.kind, repeatYearly: r.repeat_yearly === 1, important: r.important === 1, active: r.active === 1, locked: r.locked === 1,
  effectiveLocked: r.locked === 1 || r.category_locked === 1 || r.notebook_locked === 1,
  createdAt: r.created_at, updatedAt: r.updated_at
});
// The end must not be before the start: compare the date, then the time (when both have one); equal is fine. An end
// time without an end date is on the start day.
const checkSpan = ({ date, time, endDate, endTime }) => {
  const end = endDate || (endTime ? date : null);
  if (!end) return;
  if (end < date || (end === date && time && endTime && endTime < time)) throw new AppError('The end cannot be before the start', 400);
};
const addDays = (d, n) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
// Ordering stays by the stored date, then the wall-clock time, whatever each entry's time zone is (zones are not converted here).
const SELECT = `SELECT n.*, p.name AS project_name, c.name AS category_name, c.locked AS category_locked, nbk.locked AS notebook_locked, c.time_zone AS category_time_zone, nbk.time_zone AS notebook_time_zone FROM diary_notes n
  LEFT JOIN projects p ON p.id = n.project_id AND p.book_id = n.book_id LEFT JOIN diary_categories c ON c.id = n.category_id LEFT JOIN diary_notebooks nbk ON nbk.id = n.notebook_id`;

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

  // The signed-in account, or a refusal. Needs the Notebook page unless a super administrator. An access code may only
  // read (GET), and only notebooks linked to its ledgers (rights() finds no role for private ones).
  const who = c => {
    const account = c.get('account');
    if (!account || !account.id) throw new ForbiddenError('The Notebook is private');
    if (account.accessCode && c.req.method !== 'GET') throw new ForbiddenError('Access codes are view only');
    if (!account.isSuperAdmin && !hasResourceAnywhere(account, 'diary')) throw new ForbiddenError('This account cannot use the Notebook');
    return account;
  };
  // The extra ledgers each notebook is shared with (main ledger not included), and every ledger's name and state.
  const loadShares = async () => {
    const extras = new Map();
    for (const row of await L.all('SELECT notebook_id, book_id FROM diary_notebook_ledgers ORDER BY created_at, book_id')) {
      extras.set(row.notebook_id, [...(extras.get(row.notebook_id) || []), row.book_id]);
    }
    const books = new Map((await L.all('SELECT id, name, active FROM books')).map(b => [b.id, b]));
    return { extras, books };
  };
  // Whether this account may open the notebook through one ledger: a role there, the Notebook page there and the notebook rules there.
  const roleThrough = (account, nb, bookId) => {
    const role = roleFor(account, bookId);
    if (!role || (!account.isSuperAdmin && !hasResource(forBook(account, bookId), 'diary'))) return null;
    // A notebook the account was left out of (excluded, or not in the code's "only" list) stays closed; the notebook's own creator keeps theirs.
    if (nb.owner_id !== account.id && !notebookAllowed(notebookRuleOf(account, bookId), nb.id)) return null;
    return role;
  };
  // What this account may do with a notebook row, or null when it may not open it at all. It can open it through any of the
  // notebook's ledgers (main or extra) that passes every check; the role is the highest of those. `inactive` is true when
  // every ledger it comes through is deactivated (a super administrator is never held back).
  const rights = (account, nb, shares) => {
    if (!nb.book_id) return account.isSuperAdmin && nb.owner_id === account.id ? { canEdit: true, isOwner: true, canDelete: true, canRelink: true, canShare: true } : null;
    const granted = [nb.book_id, ...((shares && shares.extras.get(nb.id)) || [])]
      .map(bookId => ({ bookId, role: roleThrough(account, nb, bookId) })).filter(g => g.role);
    if (!granted.length) return null;
    const isLive = g => account.isSuperAdmin || !shares || !shares.books.get(g.bookId) || shares.books.get(g.bookId).active !== 0;
    const live = granted.filter(isLive);
    const pool = live.length ? live : granted;
    if (account.accessCode) return { canEdit: false, isOwner: false, canDelete: false, canRelink: false, canShare: false, inactive: !live.length };
    // Writing needs the MAIN ledger itself (Editor+, Notebook page, not left out); a ledger it is only shared into is view only.
    const main = granted.find(g => g.bookId === nb.book_id);
    const mainRole = main && isLive(main) ? main.role : null;
    const canEdit = !!mainRole && RANK[mainRole] >= RANK.editor;
    const isOwner = nb.owner_id === account.id;
    const mainAdmin = mainRole === 'admin';
    return { canEdit, isOwner, canDelete: canEdit && (isOwner || mainAdmin), canRelink: canEdit && (account.isSuperAdmin || mainAdmin), canShare: canEdit && (account.isSuperAdmin || isOwner || mainAdmin), inactive: !live.length };
  };
  const view = (nb, r, counts = {}, shares, account) => {
    const extra = (shares && shares.extras.get(nb.id)) || [];
    const ids = nb.book_id ? [nb.book_id, ...extra] : [];
    if (account && account.accessCode && nb.book_id) {
      // An access code is only told about ledgers it can open itself; a main ledger it cannot open is replaced by the first it can.
      const mine = new Set((account.memberships || []).map(m => m.bookId));
      const nameOf = x => (x === nb.book_id ? nb.book_name : shares?.books.get(x)?.name) ?? null;
      const keep = ids.filter(x => mine.has(x));
      const main = mine.has(nb.book_id) ? nb.book_id : (keep[0] ?? null);
      return {
        id: nb.id, name: nb.name, description: nb.description, timeZone: nb.time_zone || null, bookId: main, mainLedgerId: main, bookName: main ? nameOf(main) : null,
        ledgerIds: keep, ledgerNames: keep.map(x => nameOf(x) ?? x),
        canEdit: r.canEdit, canDelete: r.canDelete, canRelink: r.canRelink, canShare: !!r.canShare, isOwner: r.isOwner, locked: nb.locked === 1, createdAt: nb.created_at, updatedAt: nb.updated_at,
        noteCount: counts.note || 0, dateCount: counts.date || 0, categoryCount: counts.categories || 0
      };
    }
    return {
      id: nb.id, name: nb.name, description: nb.description, timeZone: nb.time_zone || null, bookId: nb.book_id, mainLedgerId: nb.book_id, bookName: nb.book_name ?? null,
      ledgerIds: ids, ledgerNames: ids.map((x, i) => (i === 0 ? nb.book_name : shares?.books.get(x)?.name) ?? x),
      canEdit: r.canEdit, canDelete: r.canDelete, canRelink: r.canRelink, canShare: !!r.canShare, isOwner: r.isOwner, locked: nb.locked === 1, createdAt: nb.created_at, updatedAt: nb.updated_at,
      noteCount: counts.note || 0, dateCount: counts.date || 0, categoryCount: counts.categories || 0
    };
  };
  // Loads notebook :n and checks the caller may open it (and change it when edit is true).
  const open = async (c, { edit = false } = {}) => {
    const account = who(c);
    const nb = await L.first(`${NB_SELECT} WHERE n.id = ?`, c.req.param('n'));
    const shares = nb && await loadShares();
    const r = nb && rights(account, nb, shares);
    if (!r) throw notFound('Notebook');
    if (r.inactive) throw new AppError('This ledger is deactivated. A super administrator can reactivate it.', 423);
    if (edit && !r.canEdit) throw new ForbiddenError('This notebook is view only for your account');
    return { account, nb, r, shares };
  };
  const checkBookWrite = async (account, bookId) => {
    if (!bookId) return;
    const book = await repo.books.get(bookId);
    const role = book && roleFor(account, bookId);
    if (!role) throw notFound('Ledger');
    if (RANK[role] < RANK.editor) throw new ForbiddenError('You need the Editor role in that ledger');
    // The Notebook page must also be on in that ledger: a notebook is never put into a ledger the account may not open it in.
    if (!account.isSuperAdmin && !hasResource(forBook(account, bookId), 'diary')) throw notFound('Ledger');
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
  // A locked notebook refuses every write inside it; a locked category refuses writes to it and to its entries.
  const guardNotebook = nb => { if (nb.locked === 1) throw new AppError(NB_LOCKED, 409); };
  const guardCategory = async (nbId, ...cids) => {
    for (const cid of new Set(cids.filter(Boolean))) {
      const cat = await getCategory(nbId, cid);
      if (cat && cat.locked === 1) throw new AppError(CAT_LOCKED, 409);
    }
  };
  const onlyLocked = data => Object.keys(data).every(k => k === 'locked');
  const mapCategory = (r, stats = {}) => ({ id: r.id, name: r.name, description: r.description, timeZone: r.time_zone || null, locked: r.locked === 1, createdAt: r.created_at, updatedAt: r.updated_at, noteCount: 0, dateCount: 0, nextDate: null, nextDaysAway: null, ...stats });
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
    const shares = await loadShares();
    const mine = all.map(nb => ({ nb, r: rights(account, nb, shares) })).filter(x => x.r);
    const counts = new Map();
    for (const row of await L.all('SELECT notebook_id, kind, COUNT(*) AS n FROM diary_notes WHERE active = 1 GROUP BY notebook_id, kind')) {
      counts.set(row.notebook_id, { ...(counts.get(row.notebook_id) || {}), [row.kind]: row.n });
    }
    for (const row of await L.all('SELECT notebook_id, COUNT(*) AS n FROM diary_categories GROUP BY notebook_id')) {
      counts.set(row.notebook_id, { ...(counts.get(row.notebook_id) || {}), categories: row.n });
    }
    return c.json(mine.map(({ nb, r }) => view(nb, r, counts.get(nb.id), shares, account)));
  });

  // For the Admin screens: the notebooks linked to one ledger, so a super administrator (or that ledger's Admin, for the ones
  // they may open themselves) can leave some out for an admin or an access code. Names only.
  app.get('/api/diary/ledger-notebooks', async c => {
    const account = c.get('account');
    const bookId = String(c.req.query('bookId') || '');
    if (!account || account.accessCode || !bookId || (!account.isSuperAdmin && roleFor(account, bookId) !== 'admin')) throw new ForbiddenError('Only an Admin of this ledger can list its notebooks');
    const shares = await loadShares();
    const rows = await L.all(`${NB_SELECT} WHERE n.book_id = ? OR n.id IN (SELECT notebook_id FROM diary_notebook_ledgers WHERE book_id = ?) ORDER BY LOWER(n.name), n.id`, bookId, bookId);
    return c.json(rows.filter(nb => account.isSuperAdmin || rights(account, nb, shares)).map(nb => ({ id: nb.id, name: nb.name })));
  });

  // The extra ledgers asked for: not the main one, no repeats, each one the account may put a notebook into.
  const cleanExtras = async (account, mainId, wanted, already = []) => {
    const list = [...new Set(wanted)];
    if (list.length && !mainId) throw new AppError('A notebook with no ledger cannot be shared with other ledgers', 400);
    if (list.includes(mainId)) throw new AppError('The linked ledger is already the main one', 400);
    for (const x of list.filter(y => !already.includes(y))) await checkBookWrite(account, x);
    // Ledgers the account cannot see are not removed by it.
    for (const x of already.filter(y => !list.includes(y))) if (!roleFor(account, x)) throw new ForbiddenError('You cannot remove a ledger you do not have');
    return list;
  };
  const extraRows = (nbId, list, at) => list.map(x => L.run('INSERT INTO diary_notebook_ledgers (notebook_id, book_id, created_at) VALUES (?, ?, ?)', nbId, x, at));

  app.post(root, async c => {
    const account = who(c);
    const data = parse(notebookSchema, c.get('body'));
    if (!data.bookId && !account.isSuperAdmin) throw new ForbiddenError('Only a super administrator can keep a notebook that is not linked to a ledger');
    await checkBookWrite(account, data.bookId);
    const extras = await cleanExtras(account, data.bookId || null, data.extraLedgerIds || []);
    const nid = crypto.randomUUID();
    const at = now();
    await repo.ledger.batch([
      L.run('INSERT INTO diary_notebooks (id, owner_id, book_id, name, description, time_zone, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        nid, account.id, data.bookId || null, data.name, data.description || null, data.timeZone || null, at, at),
      ...extraRows(nid, extras, at)
    ]);
    const nb = await L.first(`${NB_SELECT} WHERE n.id = ?`, nid);
    const shares = await loadShares();
    return c.json(view(nb, rights(account, nb, shares), {}, shares, account), 201);
  });

  app.put(`${root}/:n`, async c => {
    const { account, nb, r, shares } = await open(c, { edit: true });
    const data = parse(notebookUpdateSchema, c.get('body'));
    if (nb.locked === 1 && !onlyLocked(data)) throw new AppError(NB_LOCKED, 409);
    let bookId = nb.book_id;
    if (data.bookId !== undefined && (data.bookId || null) !== nb.book_id) {
      if (!r.canRelink) throw new ForbiddenError('Only a super administrator or an Admin of its ledger can move it to another ledger');
      if (!data.bookId && !account.isSuperAdmin) throw new ForbiddenError('Only a super administrator can keep a notebook that is not linked to a ledger');
      await checkBookWrite(account, data.bookId);
      if (!account.isSuperAdmin && roleFor(account, data.bookId) !== 'admin') throw new ForbiddenError('You need the Admin role in the ledger you move it to');
      bookId = data.bookId || null;
    }
    // Sharing: the current extras stay unless asked otherwise; a new main ledger drops out of them, and no main ledger means none.
    const current = shares.extras.get(nb.id) || [];
    let extras = bookId ? current.filter(x => x !== bookId) : [];
    if (data.extraLedgerIds !== undefined) {
      extras = [...new Set(data.extraLedgerIds)];
      const changed = extras.length !== current.length || extras.some(x => !current.includes(x));
      if (changed && !r.canShare) {
        throw new ForbiddenError('Only the notebook owner or an Admin of its ledger can change the ledgers it is shared with');
      }
      extras = changed ? await cleanExtras(account, bookId, extras, current) : extras;
    }
    const extrasChanged = extras.length !== current.length || extras.some((x, i) => x !== current[i]);
    const at = now();
    await repo.ledger.batch([
      L.run('UPDATE diary_notebooks SET name = ?, description = ?, book_id = ?, time_zone = ?, locked = ?, updated_at = ? WHERE id = ?',
        data.name ?? nb.name, data.description === undefined ? nb.description : (data.description || null), bookId, data.timeZone === undefined ? nb.time_zone : (data.timeZone || null), data.locked === undefined ? nb.locked : (data.locked ? 1 : 0), at, nb.id),
      // Entries keep the notebook's ledger (a notebook with no ledger uses an empty one), and lose project links of the old one.
      L.run('UPDATE diary_notes SET book_id = ? WHERE notebook_id = ?', bookId || '', nb.id),
      ...(bookId !== nb.book_id ? [L.run('UPDATE diary_notes SET project_id = NULL WHERE notebook_id = ?', nb.id)] : []),
      ...(extrasChanged ? [L.run('DELETE FROM diary_notebook_ledgers WHERE notebook_id = ?', nb.id), ...extraRows(nb.id, extras, at)] : [])
    ]);
    const next = await L.first(`${NB_SELECT} WHERE n.id = ?`, nb.id);
    const fresh = await loadShares();
    return c.json(view(next, rights(account, next, fresh), {}, fresh, account));
  });

  // Deleting a notebook removes its categories and entries too.
  app.delete(`${root}/:n`, async c => {
    const { nb, r } = await open(c, { edit: true });
    if (!r.canDelete) throw new ForbiddenError('Only the notebook owner or a ledger admin can delete it');
    guardNotebook(nb);
    await repo.ledger.batch([
      L.run('DELETE FROM diary_notes WHERE notebook_id = ?', nb.id),
      L.run('DELETE FROM diary_categories WHERE notebook_id = ?', nb.id),
      L.run('DELETE FROM diary_notebook_ledgers WHERE notebook_id = ?', nb.id),
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
    // Latest first: date, then time of day (an entry without a time sorts last on its day), then creation. The client never re-sorts.
    const rows = await L.all(`${SELECT} WHERE ${where.join(' AND ')} ORDER BY n.date DESC, (n.note_time IS NULL OR n.note_time = '') ASC, n.note_time DESC, n.created_at DESC, n.id DESC`, ...params);
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
      if (away <= days) out.push({ ...map(r), nextDate: next, nextEndDate: map(r).endDate ? addDays(next, daysBetween(r.date, map(r).endDate)) : null, daysAway: away, years: r.repeat_yearly === 1 ? Number(next.slice(0, 4)) - Number(r.date.slice(0, 4)) : null });
    }
    // Upcoming is a countdown: deliberately ascending by next occurrence (soonest first), unlike the newest-first lists.
    out.sort((x, y) => x.nextDate.localeCompare(y.nextDate) || (x.time || '').localeCompare(y.time || '') || x.title.localeCompare(y.title));
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
    guardNotebook(nb);
    const data = parse(createSchema, c.get('body'));
    await guardCategory(nb.id, data.categoryId);
    await checkProject(nb, data.projectId);
    await checkCategory(nb.id, data.categoryId);
    checkSpan(data);
    const kind = data.kind || 'note';
    const eid = crypto.randomUUID();
    const at = now();
    await L.run(
      `INSERT INTO diary_notes (id, book_id, notebook_id, date, note_time, time_zone, end_date, end_time, title, message, from_name, to_name, project_id, category_id, kind, repeat_yearly, important, active, locked, created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?)`,
      eid, nb.book_id || '', nb.id, data.date, data.time || null, data.timeZone || null, data.endDate || null, data.endTime || null, data.title, data.message || null, data.fromName || null, data.toName || null,
      data.projectId || null, data.categoryId || null, kind, kind === 'date' && data.repeatYearly ? 1 : 0,
      data.important ? 1 : 0, data.locked ? 1 : 0, account.id, at, at).run();
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
    const row = await getEntry(nb, eid);
    const data = parse(updateSchema, c.get('body'));
    const has = k => data[k] !== undefined;
    guardNotebook(nb);
    await guardCategory(nb.id, row.category_id, data.categoryId);
    if (row.locked === 1 && Object.keys(data).some(k => k !== 'locked')) throw new AppError(LOCKED, 409);
    checkSpan({
      date: data.date || row.date, time: has('time') ? data.time : row.note_time,
      endDate: has('endDate') ? data.endDate : row.end_date, endTime: has('endTime') ? data.endTime : row.end_time
    });
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
    guardNotebook(nb);
    const entry = await getEntry(nb, c.req.param('id'));
    await guardCategory(nb.id, entry.category_id);
    if (entry.locked === 1) throw new AppError(LOCKED, 409);
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
    guardNotebook(nb);
    const data = parse(categorySchema, c.get('body'));
    await checkCategoryName(nb.id, data.name);
    const cid = crypto.randomUUID();
    const at = now();
    await L.run('INSERT INTO diary_categories (id, book_id, owner_id, notebook_id, name, description, time_zone, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      cid, nb.book_id || '', nb.owner_id, nb.id, data.name, data.description || null, data.timeZone || null, at, at).run();
    return c.json(mapCategory(await getCategory(nb.id, cid)), 201);
  });

  app.put(`${root}/:n/categories/:cid`, async c => {
    const { nb } = await open(c, { edit: true });
    const cid = c.req.param('cid');
    const row = await getCategory(nb.id, cid);
    if (!row) throw notFound('Category');
    const data = parse(categoryUpdateSchema, c.get('body'));
    guardNotebook(nb);
    if (row.locked === 1 && !onlyLocked(data)) throw new AppError(CAT_LOCKED, 409);
    if (data.name) await checkCategoryName(nb.id, data.name, cid);
    await L.run('UPDATE diary_categories SET name = ?, description = ?, time_zone = ?, locked = ?, updated_at = ? WHERE id = ? AND notebook_id = ?',
      data.name ?? row.name, data.description === undefined ? row.description : (data.description || null), data.timeZone === undefined ? row.time_zone : (data.timeZone || null), data.locked === undefined ? row.locked : (data.locked ? 1 : 0), now(), cid, nb.id).run();
    return c.json(mapCategory(await getCategory(nb.id, cid)));
  });

  // Deleting a category keeps its entries; they just have no category afterwards.
  app.delete(`${root}/:n/categories/:cid`, async c => {
    const { nb } = await open(c, { edit: true });
    const cid = c.req.param('cid');
    const cat = await getCategory(nb.id, cid);
    if (!cat) throw notFound('Category');
    guardNotebook(nb);
    if (cat.locked === 1) throw new AppError(CAT_LOCKED, 409);
    await repo.ledger.batch([
      L.run('UPDATE diary_notes SET category_id = NULL, updated_at = ? WHERE notebook_id = ? AND category_id = ?', now(), nb.id, cid),
      L.run('DELETE FROM diary_categories WHERE id = ? AND notebook_id = ?', cid, nb.id)
    ]);
    return c.json({ success: true });
  });
};

module.exports = { registerDiaryRoutes };
