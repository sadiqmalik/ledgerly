// Projects, reports and year close. Reads need viewer; project writes need editor; year close/reopen need admin.
const { AppError, ValidationError } = require('../../server/errors');
const { MAX_MINOR, z, parse, isoDate, id, need, notFound, assertOpen } = require('./validate');

const name = z.string().trim().min(1).max(200);
const budget = z.number().int('must be an integer in minor units').safe('too large').min(0).max(MAX_MINOR, 'too large');
const metaSchema = z.array(z.object({ key: z.string().min(1).max(100), label: z.string().max(200) }).strict()).nullable();
const projectFields = {
  name, kind: z.string().trim().toLowerCase().min(1).max(40), fundId: id.nullable(),
  startsOn: isoDate.nullable(), endsOn: isoDate.nullable(), budget: budget.nullable(), metaSchema,
  status: z.enum(['open', 'closed'])
};
const createProject = z.object({
  name, kind: projectFields.kind, fundId: projectFields.fundId,
  startsOn: projectFields.startsOn.optional(), endsOn: projectFields.endsOn.optional(),
  budget: projectFields.budget.optional(), metaSchema: metaSchema.optional()
}).strict();
// moveEntries: also move the project's existing entries (not linked transfer legs) to the project's fund.
const updateProject = z.object({ ...Object.fromEntries(Object.entries(projectFields).map(([k, v]) => [k, v.optional()])), moveEntries: z.boolean().optional() }).strict();

const year4 = z.string().regex(/^\d{4}$/, 'must be a 4-digit year').transform(Number);
const pivotQuery = z.object({
  rows: z.enum(['category', 'party', 'project', 'fund']).default('category'),
  direction: z.enum(['dr', 'cr', 'net']).default('dr'),
  from: year4.optional(), to: year4.optional(),
  memo: z.enum(['0', '1']).default('1').transform(v => v === '1')
});
const allFlag = z.object({ all: z.string().optional() });

const registerReportRoutes = (app, { repo }) => {
  const L = repo.ledger;
  const R = repo.reports;
  const base = '/api/books/:b';

  const checkFund = async (b, fundId) => {
    if (fundId && !(await L.inBook('funds', b, fundId))) throw notFound('Fund');
  };
  const checkDates = (starts, ends) => {
    if (starts && ends && ends < starts) throw new ValidationError('endsOn must not be before startsOn');
  };

  // ---- Projects
  // Id, name and kind only: lets the ledger, documents and reports label projects without project financials.
  app.get(`${base}/project-names`, async c => c.json(await R.projectNames(c.req.param('b'))));

  app.get(`${base}/projects`, async c => {
    const b = c.req.param('b');
    const q = parse(allFlag, c.req.query());
    const all = q.all === '1' || q.all === 'true';
    return c.json(await R.listProjects(b, all, await L.baseCurrency(b)));
  });

  app.get(`${base}/projects/:id`, async c => {
    const b = c.req.param('b');
    const p = await R.getProject(b, c.req.param('id'), await L.baseCurrency(b));
    if (!p) throw notFound('Project');
    return c.json(p);
  });

  app.post(`${base}/projects`, async c => {
    need(c, 'editor');
    const b = c.req.param('b');
    const body = parse(createProject, c.get('body'));
    await checkFund(b, body.fundId);
    checkDates(body.startsOn, body.endsOn);
    const pid = crypto.randomUUID();
    await L.batch([R.insertProjectStmt(b, { ...body, id: pid })]);
    return c.json(await R.getProject(b, pid, await L.baseCurrency(b)), 201);
  });

  app.put(`${base}/projects/:id`, async c => {
    need(c, 'editor');
    const b = c.req.param('b');
    const pid = c.req.param('id');
    const { moveEntries, ...body } = parse(updateProject, c.get('body'));
    const old = await L.inBook('projects', b, pid);
    if (!old) throw notFound('Project');
    await checkFund(b, body.fundId);
    checkDates(body.startsOn !== undefined ? body.startsOn : old.starts_on, body.endsOn !== undefined ? body.endsOn : old.ends_on);
    const stmts = Object.keys(body).length ? [R.updateProjectStmt(b, pid, body)] : [];
    let moved = 0;
    if (moveEntries) {
      const target = body.fundId !== undefined ? body.fundId : old.fund_id;
      const fund = target ? await L.inBook('funds', b, target) : null;
      if (!fund) throw new ValidationError('Choose a fund for the project first');
      if (fund.archived) throw new AppError('Fund is archived', 409);
      const rows = (await L.run('SELECT id, date, currency FROM entries WHERE book_id = ? AND project_id = ? AND deleted_at IS NULL AND link_id IS NULL AND fund_id <> ?', b, pid, target).all()).results;
      const wrong = rows.filter(r => r.currency !== fund.currency).length;
      if (wrong) throw new AppError(`${wrong} ${wrong === 1 ? 'entry is' : 'entries are'} in another currency than ${fund.name} and cannot be moved`, 409, { count: wrong });
      await assertOpen(repo, b, ...rows.map(r => r.date));
      moved = rows.length;
      if (moved) stmts.push(L.run('UPDATE entries SET fund_id = ?, updated_at = ? WHERE book_id = ? AND project_id = ? AND deleted_at IS NULL AND link_id IS NULL AND fund_id <> ?', target, new Date().toISOString(), b, pid, target));
    }
    if (stmts.length) await L.batch(stmts);
    const project = await R.getProject(b, pid, await L.baseCurrency(b));
    return c.json(moveEntries ? { ...project, movedEntries: moved } : project);
  });

  app.delete(`${base}/projects/:id`, async c => {
    need(c, 'editor');
    const b = c.req.param('b');
    const pid = c.req.param('id');
    if (!(await L.inBook('projects', b, pid))) throw notFound('Project');
    if ((await R.projectEntryCount(b, pid)) > 0) throw new AppError('Project has entries', 409);
    await L.batch([R.deleteProjectStmt(b, pid)]);
    return c.json({ success: true });
  });

  // ---- Reports
  app.get(`${base}/reports/yearly`, async c => {
    const b = c.req.param('b');
    const currency = await L.baseCurrency(b);
    const [{ funds, rows }, first] = await Promise.all([R.yearlyMovements(b, currency), R.firstEntryYear(b)]);
    const thisYear = new Date().getUTCFullYear();
    if (first === null) return c.json({ years: [] });
    const move = new Map(rows.map(r => [`${r.fund_id}|${r.y}`, r]));
    const used = new Set(rows.map(r => r.fund_id));
    const list = funds.filter(f => !f.archived || used.has(f.id));
    const running = new Map(list.map(f => [f.id, 0]));
    // Balance before the first listed year (entries dated earlier than `first` do not exist in base funds).
    const years = [];
    for (let y = first; y <= Math.max(thisYear, rows.reduce((m, r) => Math.max(m, r.y), 0)); y++) {
      const total = { opening: 0, cr: 0, dr: 0, closing: 0 };
      const fl = list.map(f => {
        const m = move.get(`${f.id}|${y}`) || { cr: 0, dr: 0 };
        const opening = running.get(f.id);
        const closing = opening + m.cr - m.dr;
        running.set(f.id, closing);
        if (f.kind !== 'memo') { total.opening += opening; total.cr += m.cr; total.dr += m.dr; total.closing += closing; }
        return { fundId: f.id, name: f.name, kind: f.kind, opening, cr: m.cr, dr: m.dr, closing };
      });
      years.push({ year: y, funds: fl, total });
    }
    return c.json({ years });
  });

  app.get(`${base}/reports/pivot`, async c => {
    const b = c.req.param('b');
    const q = parse(pivotQuery, c.req.query());
    if (q.from && q.to && q.to < q.from) throw new ValidationError('to must not be before from');
    const data = await R.pivot(b, q, await L.baseCurrency(b));
    const columns = [...new Set(data.map(r => r.year))].sort();
    const byId = new Map();
    const totals = Object.fromEntries(columns.map(y => [y, 0]));
    let grandTotal = 0;
    for (const r of data) {
      const key = r.id ?? '\u0000none';
      if (!byId.has(key)) byId.set(key, { id: r.id ?? null, name: r.id == null ? '(none)' : (r.name ?? r.id), values: {}, total: 0 });
      const row = byId.get(key);
      row.values[r.year] = r.amount;
      row.total += r.amount;
      totals[r.year] += r.amount;
      grandTotal += r.amount;
    }
    const rows = [...byId.values()].sort((x, y) => Math.abs(y.total) - Math.abs(x.total) || x.name.localeCompare(y.name));
    return c.json({ columns, rows, totals, grandTotal });
  });

  app.get(`${base}/reports/profit`, async c => {
    const b = c.req.param('b');
    const fund = c.req.query('fund');
    const rows = await R.profit(b, await L.baseCurrency(b), fund || null);
    return c.json({ rows: rows.map(r => ({ ...r, rate: r.rate ?? null })) });
  });

  // ---- Years
  const yearParam = c => parse(year4, c.req.param('y'));

  app.get(`${base}/years`, async c => {
    const b = c.req.param('b');
    const [closes, years] = await Promise.all([R.yearCloseRows(b), R.entryYears(b)]);
    const by = new Map(closes.map(r => [r.year, r]));
    const all = [...new Set([...years, ...by.keys()])].sort((x, y) => y - x);
    return c.json(all.map(year => {
      const r = by.get(year);
      return { year, closed: Boolean(r), closedAt: r ? r.closed_at : null, closedBy: r ? r.closed_by : null, snapshot: r && r.snapshot ? JSON.parse(r.snapshot) : null };
    }));
  });

  app.post(`${base}/years/:y/close`, async c => {
    need(c, 'admin');
    const b = c.req.param('b');
    const year = yearParam(c);
    if (await R.yearClose(b, year)) throw new AppError('Year already closed', 409);
    const { balances } = await R.snapshotAt(b, year);
    try {
      await L.batch([R.insertYearCloseStmt(b, year, new Date().toISOString(), c.get('account').id, balances)]);
    } catch (error) {
      if (/UNIQUE|PRIMARY/i.test(String(error && (error.message || error)))) throw new AppError('Year already closed', 409);
      throw error;
    }
    return c.json({ year, snapshot: balances }, 201);
  });

  app.post(`${base}/years/:y/reopen`, async c => {
    need(c, 'admin');
    const b = c.req.param('b');
    const year = yearParam(c);
    if (!(await R.yearClose(b, year))) throw notFound('Closed year');
    await L.batch([R.deleteYearCloseStmt(b, year)]);
    return c.json({ success: true, year });
  });

  app.get(`${base}/years/:y/check`, async c => {
    const b = c.req.param('b');
    const year = yearParam(c);
    const close = await R.yearClose(b, year);
    if (!close) throw notFound('Closed year');
    const snap = close.snapshot ? JSON.parse(close.snapshot) : {};
    const { funds, balances } = await R.snapshotAt(b, year);
    const names = new Map(funds.map(f => [f.id, f.name]));
    const diffs = [];
    for (const fid of new Set([...Object.keys(snap), ...Object.keys(balances)])) {
      const s = snap[fid] || 0;
      const now = balances[fid] || 0;
      if (s !== now) diffs.push({ fundId: fid, name: names.get(fid) ?? fid, snapshot: s, now });
    }
    return c.json({ ok: diffs.length === 0, diffs });
  });
};

module.exports = { registerReportRoutes };
