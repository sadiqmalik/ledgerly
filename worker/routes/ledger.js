// Summary, entries and transfers. Reads need viewer, writes need editor (checked per route).
const { summary } = require('../../server/domain');
const { makeTransfer } = require('../../server/domain');
const { entryPricing, validQuantity } = require('../../server/domain/entryPricing');
const { AppError, ForbiddenError, ValidationError } = require('../../server/errors');
const { hasResource, forBook } = require('../../server/auth/resources');
const { MAX_MINOR, z, parse, isoDate, money, flag, id, need, notFound, assertOpen } = require('./validate');

// A comma-separated list (OR within a filter). Empty means "not set".
const csv = item => z.preprocess(v => {
  if (typeof v !== 'string') return v;
  const list = v.split(',').map(x => x.trim()).filter(Boolean);
  return list.length ? list : undefined;
}, z.array(item).min(1).max(50).optional());
const idItem = z.string().min(1).max(100);
const yearItem = z.string().regex(/^\d{4}$/, 'must be a 4-digit year').transform(Number);
const zeroOne = z.enum(['0', '1']).transform(Number);
const listQuery = z.object({
  year: csv(yearItem),
  from: isoDate.optional(),
  to: isoDate.optional(),
  fund: csv(idItem), party: csv(idItem), category: csv(idItem), project: csv(idItem),
  kind: csv(z.enum(['general', 'reserved', 'custodial', 'investment', 'memo'])),
  currency: csv(z.string().toUpperCase().regex(/^[A-Z]{3}$/, 'must be a 3-letter currency code')),
  status: csv(z.enum(['paid', 'pending'])),
  direction: z.enum(['cr', 'dr']).optional(),
  exclude: zeroOne.optional(), linked: zeroOne.optional(), opening: zeroOne.optional(),
  min: z.coerce.number().int().safe().min(0).max(MAX_MINOR).optional(), max: z.coerce.number().int().safe().min(0).max(MAX_MINOR).optional(),
  sort: z.enum(['date_desc', 'date_asc', 'amount_desc', 'amount_asc']).default('date_desc'),
  q: z.string().trim().max(200).optional(),
  page: z.coerce.number().int().safe().min(1).max(100000).default(1),
  pageSize: z.coerce.number().int().safe().min(1).max(500).default(100)
}).superRefine((q, ctx) => {
  // D1 allows 100 bound parameters per statement: keep all list values together well under it.
  const n = ['year', 'fund', 'party', 'category', 'project', 'kind', 'currency', 'status'].reduce((s, k) => s + (q[k] ? q[k].length : 0), 0);
  if (n > 85) ctx.addIssue({ code: 'custom', message: 'too many filter values (85 at most in total)' });
});

const fields = {
  date: isoDate, fundId: id, direction: z.enum(['cr', 'dr']), amount: money,
  quantity: z.number().refine(validQuantity, 'must be positive with at most 3 decimal places (maximum 1000000000)'),
  unitPrice: money,
  partyId: id.nullable(), partyName: z.string().trim().min(1).max(200),
  categoryId: id.nullable(), projectId: id.nullable(),
  comment: z.string().max(2000).nullable(), rate: z.number().finite().nullable(),
  paidDate: isoDate.nullable(), status: z.enum(['paid', 'pending']), exclude: flag,
  meta: z.record(z.any()).nullable()
};
const createSchema = z.object({ ...fields, amount: fields.amount.optional(), quantity: fields.quantity.optional(), unitPrice: fields.unitPrice.optional(),
  partyId: fields.partyId.optional(), partyName: fields.partyName.optional(),
  categoryId: fields.categoryId.optional(), projectId: fields.projectId.optional(), comment: fields.comment.optional(),
  rate: fields.rate.optional(), paidDate: fields.paidDate.optional(), status: fields.status.optional(),
  exclude: fields.exclude.optional(), meta: fields.meta.optional() }).strict();
const updateSchema = z.object(Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, v.optional()]))).strict();
const bulkSchema = z.object({
  ids: z.array(id).min(1).max(200).refine(a => new Set(a).size === a.length, 'ids must be distinct'),
  delete: z.literal(true).optional(),
  changes: z.object({
    fundId: id, categoryId: id.nullable(), partyId: id.nullable(), partyName: fields.partyName,
    projectId: id.nullable(), exclude: flag, status: fields.status
  }).partial().strict().refine(o => Object.keys(o).length > 0, 'changes must not be empty').optional()
}).strict().refine(o => (o.delete === true) !== (o.changes !== undefined), 'send exactly one of delete or changes');
const refundSchema = z.object({ date: isoDate }).strict();
const transferSchema = z.object({
  date: isoDate, fromFundId: id, toFundId: id, amount: money, toAmount: money.optional(),
  comment: z.string().max(2000).nullable().optional()
}).strict();

const assertActive = fund => {
  if (fund.archived) throw new AppError('Fund is archived', 409);
};

const registerLedgerRoutes = (app, { repo }) => {
  const L = repo.ledger;
  const base = '/api/books/:b';
  const nowIso = () => new Date().toISOString();

  // Verifies optional references live in this book (404 otherwise).
  // A closed project takes no new entries and no moved-in entries; an entry already in it may keep it
  // (oldProjectId) so its other fields stay editable. Reopen the project to assign entries to it.
  const checkRefs = async (b, body, oldProjectId = null) => {
    if (body.categoryId && !(await L.inBook('categories', b, body.categoryId))) throw notFound('Category');
    if (body.projectId) {
      const project = await L.inBook('projects', b, body.projectId);
      if (!project) throw notFound('Project');
      if (project.status === 'closed' && body.projectId !== oldProjectId) {
        throw new AppError('This project is closed. Reopen it on the Projects page to assign entries to it.', 409);
      }
    }
  };

  // Resolves partyId / partyName to { partyId, stmt } where stmt creates a new party.
  const resolveParty = async (b, body) => {
    if (body.partyId) {
      if (!(await L.inBook('parties', b, body.partyId))) throw notFound('Party');
      return { partyId: body.partyId };
    }
    if (body.partyName) {
      const found = await L.findPartyByName(b, body.partyName);
      if (found) return { partyId: found.id };
      const pid = crypto.randomUUID();
      return { partyId: pid, stmt: L.run('INSERT INTO parties (id, book_id, name, archived) VALUES (?, ?, ?, 0)', pid, b, body.partyName.trim()) };
    }
    return { partyId: body.partyId };
  };

  app.get(`${base}/summary`, async c => {
    const b = c.req.param('b');
    const asOf = c.req.query('asOf');
    if (asOf) parse(isoDate, asOf);
    const [funds, agg, currency] = await Promise.all([L.summaryFunds(b), L.aggregateEntries(b, asOf), L.baseCurrency(b)]);
    const result = summary(funds, agg, currency, asOf);
    const year = Number((asOf || new Date().toISOString().slice(0, 10)).slice(0, 4));
    const [yt, recent] = await Promise.all([L.yearTotals(b, year, asOf, currency), L.recentEntries(b, 10)]);
    return c.json({ ...result, year: yt, recent });
  });

  app.get(`${base}/entries`, async c => {
    const f = parse(listQuery, c.req.query());
    // Without the Ledger page, only an explicit list of real project ids may be read.
    if (!hasResource(forBook(c.get('account'), c.req.param('b')), 'ledger') && (!f.project || f.project.length === 0 || f.project.includes('none'))) {
      throw new ForbiddenError('This account cannot use that page');
    }
    return c.json(await L.listEntries(c.req.param('b'), f));
  });

  // Without the Ledger page, the Projects page may only change entries that belong to a project.
  // Linked transfer legs are never touched without it: the other leg may be outside any project.
  const projectOnly = (c, projectId, linked = false) => {
    if (!hasResource(forBook(c.get('account'), c.req.param('b')), 'ledger') && (!projectId || linked)) throw new ForbiddenError('This account cannot use that page');
  };

  app.post(`${base}/entries`, async c => {
    need(c, 'editor');
    const b = c.req.param('b');
    projectOnly(c, (c.get('body') || {}).projectId);
    const body = parse(createSchema, c.get('body'));
    const pricing = entryPricing(body);
    const fund = await L.inBook('funds', b, body.fundId);
    if (!fund) throw notFound('Fund');
    assertActive(fund);
    await checkRefs(b, body);
    await assertOpen(repo, b, body.date);
    const party = await resolveParty(b, body);
    const now = nowIso();
    const entry = {
      ...body, ...pricing, id: crypto.randomUUID(), currency: fund.currency, partyId: party.partyId ?? null,
      createdBy: c.get('account').id, createdAt: now, updatedAt: now
    };
    try {
      await L.batch([...(party.stmt ? [party.stmt] : []), L.insertEntryStmt(b, entry)]);
    } catch (error) { L.uniqueToConflict(error); }
    return c.json((await L.getEntries(b, [entry.id]))[0], 201);
  });

  // Several entries at once: validated first, then written in one batch (all or nothing).
  app.post(`${base}/entries/bulk`, async c => {
    need(c, 'editor');
    const b = c.req.param('b');
    const { ids, delete: del, changes } = parse(bulkSchema, c.get('body'));
    const olds = [];
    for (const i of ids) {
      const old = await L.getEntryRaw(b, i);
      if (!old) throw notFound('Entry');
      olds.push(old);
    }
    const ch = changes || {};
    let party = {};
    let fund = null;
    if (!del) {
      if (ch.fundId !== undefined) {
        fund = await L.inBook('funds', b, ch.fundId);
        if (!fund) throw notFound('Fund');
      }
      if (ch.categoryId || ch.projectId) {
        // A closed project only keeps entries already in it.
        const outside = ch.projectId ? olds.some(o => o.project_id !== ch.projectId) : true;
        await checkRefs(b, { categoryId: ch.categoryId, projectId: outside ? ch.projectId : null });
      }
      if (ch.partyId !== undefined || ch.partyName !== undefined) party = await resolveParty(b, ch);
    }
    if (!hasResource(forBook(c.get('account'), c.req.param('b')), 'ledger')) {
      for (const o of olds) projectOnly(c, o.project_id);
      if (ch.projectId === null) projectOnly(c, null);
    }
    const linked = olds.filter(o => o.link_id).length;
    if (linked) throw new AppError(`${linked} linked transfer legs cannot be changed in bulk`, 409);
    if (fund) {
      if (olds.some(o => o.fund_id !== fund.id)) assertActive(fund);
      const wrong = olds.filter(o => o.currency !== fund.currency).length;
      if (wrong) throw new AppError(`${wrong} entries are in another currency than ${fund.name}`, 409);
    }
    await assertOpen(repo, b, ...olds.map(o => o.date));
    const now = nowIso();
    if (del) {
      await L.batch(olds.map(o => L.softDeleteStmt(b, o.id, now)));
      return c.json({ updated: 0, deleted: olds.length });
    }
    const common = { updatedAt: now };
    for (const k of ['fundId', 'categoryId', 'projectId', 'exclude']) if (ch[k] !== undefined) common[k] = ch[k];
    if (fund) common.currency = fund.currency;
    if (ch.partyId !== undefined || ch.partyName !== undefined) common.partyId = party.partyId ?? null;
    if (ch.status !== undefined) common.status = ch.status;
    const stmts = olds.map(o => {
      const one = { ...common };
      if (ch.status === 'paid') one.paidDate = o.paid_date || o.date;
      if (ch.status === 'pending') one.paidDate = null;
      return L.updateEntryStmt(b, o.id, one);
    });
    try {
      await L.batch([...(party.stmt ? [party.stmt] : []), ...stmts]);
    } catch (error) { L.uniqueToConflict(error); }
    return c.json({ updated: olds.length, deleted: 0 });
  });

  app.put(`${base}/entries/:id`, async c => {
    need(c, 'editor');
    const b = c.req.param('b');
    const body = parse(updateSchema, c.get('body'));
    const old = await L.getEntryRaw(b, c.req.param('id'));
    if (!old) throw notFound('Entry');
    projectOnly(c, old.project_id, Boolean(old.link_id));
    if (body.projectId === null) projectOnly(c, null);
    await assertOpen(repo, b, old.date, body.date);
    const now = nowIso();

    if (old.link_id) {
      const other = await L.linkedLeg(b, old.link_id, old.id);
      if (!other) throw new AppError('delete and recreate', 409, {});
      const cross = other.currency !== old.currency;
      const touchesFund = body.fundId !== undefined && body.fundId !== old.fund_id;
      const touchesDir = body.direction !== undefined && body.direction !== old.direction;
      const touchesAmount = body.amount !== undefined && body.amount !== old.amount;
      const allowed = ['date', 'comment', 'amount', 'fundId', 'direction'];
      const otherKeys = Object.keys(body).filter(k => !allowed.includes(k));
      if (touchesFund || touchesDir || (touchesAmount && cross) || otherKeys.length) {
        throw new AppError('delete and recreate', 409);
      }
      const shared = {};
      if (body.date !== undefined) shared.date = body.date;
      if (body.comment !== undefined) shared.comment = body.comment;
      if (touchesAmount) shared.amount = body.amount;
      const stmts = [old.id, other.id].map(i => L.updateEntryStmt(b, i, { ...shared, updatedAt: now }));
      await L.batch(stmts);
      return c.json((await L.getEntries(b, [old.id]))[0]);
    }

    const changes = { ...body, ...entryPricing(body, old) };
    delete changes.partyName;
    let stmt = null;
    if (body.partyName !== undefined || body.partyId !== undefined) {
      const party = await resolveParty(b, body);
      changes.partyId = party.partyId ?? null;
      stmt = party.stmt || null;
    }
    if (body.fundId !== undefined) {
      const fund = await L.inBook('funds', b, body.fundId);
      if (!fund) throw notFound('Fund');
      if (body.fundId !== old.fund_id) assertActive(fund);
      changes.currency = fund.currency;
    }
    await checkRefs(b, body, old.project_id);
    changes.updatedAt = now;
    try {
      await L.batch([...(stmt ? [stmt] : []), L.updateEntryStmt(b, old.id, changes)]);
    } catch (error) { L.uniqueToConflict(error); }
    return c.json((await L.getEntries(b, [old.id]))[0]);
  });

  app.delete(`${base}/entries/:id`, async c => {
    need(c, 'editor');
    const b = c.req.param('b');
    const old = await L.getEntryRaw(b, c.req.param('id'));
    if (!old) throw notFound('Entry');
    projectOnly(c, old.project_id, Boolean(old.link_id));
    await assertOpen(repo, b, old.date);
    const other = old.link_id ? await L.linkedLeg(b, old.link_id, old.id) : null;
    if (other) await assertOpen(repo, b, other.date);
    const now = nowIso();
    await L.batch([old.id, ...(other ? [other.id] : [])].map(i => L.softDeleteStmt(b, i, now)));
    return c.json({ success: true, deleted: other ? [old.id, other.id] : [old.id] });
  });

  // Balances an ordinary entry with an independent opposite-direction copy; the original stays untouched.
  app.post(`${base}/entries/:id/refund`, async c => {
    need(c, 'editor');
    const b = c.req.param('b');
    const { date } = parse(refundSchema, c.get('body'));
    const src = await L.getEntryRaw(b, c.req.param('id'));
    if (!src) throw notFound('Entry');
    projectOnly(c, src.project_id, Boolean(src.link_id));
    if (src.link_id) throw new AppError('Transfer legs cannot be refunded; delete and recreate the transfer', 409);
    const fund = await L.inBook('funds', b, src.fund_id);
    if (!fund) throw notFound('Fund');
    assertActive(fund);
    await assertOpen(repo, b, src.date, date);
    const now = nowIso();
    const paid = src.status === 'paid';
    const entry = {
      id: crypto.randomUUID(), date, fundId: src.fund_id, direction: src.direction === 'cr' ? 'dr' : 'cr',
      amount: src.amount, quantity: src.quantity ?? 1, unitPrice: src.unit_price ?? src.amount, currency: src.currency,
      partyId: src.party_id, categoryId: src.category_id, projectId: src.project_id, comment: src.comment,
      rate: src.rate, status: src.status, paidDate: paid ? date : null, exclude: Boolean(src.exclude),
      meta: src.meta ? JSON.parse(src.meta) : null, createdBy: c.get('account').id, createdAt: now, updatedAt: now
    };
    await L.batch([L.insertEntryStmt(b, entry)]);
    return c.json((await L.getEntries(b, [entry.id]))[0], 201);
  });

  app.post(`${base}/transfers`, async c => {
    need(c, 'editor');
    const b = c.req.param('b');
    const body = parse(transferSchema, c.get('body'));
    if (body.fromFundId === body.toFundId) throw new ValidationError('fromFundId and toFundId must differ');
    const [from, to] = await Promise.all([L.inBook('funds', b, body.fromFundId), L.inBook('funds', b, body.toFundId)]);
    if (!from) throw notFound('Fund');
    if (!to) throw notFound('Fund');
    assertActive(from);
    assertActive(to);
    const cross = from.currency !== to.currency;
    if (cross && body.toAmount == null) throw new ValidationError('toAmount is required when the currencies differ');
    if (!cross && body.toAmount != null && body.toAmount !== body.amount) throw new ValidationError('toAmount must equal amount for the same currency');
    await assertOpen(repo, b, body.date);
    const categories = {
      transfer: await L.categoryIdByName(b, 'Transfer'),
      conversion: await L.categoryIdByName(b, 'Conversion')
    };
    const legs = makeTransfer({
      date: body.date, fromFund: { id: from.id, currency: from.currency }, toFund: { id: to.id, currency: to.currency },
      amount: body.amount, toAmount: body.toAmount, comment: body.comment ?? null
    }, categories);
    const now = nowIso();
    const entries = legs.map(l => ({ ...l, id: crypto.randomUUID(), createdBy: c.get('account').id, createdAt: now, updatedAt: now }));
    await L.batch(entries.map(e => L.insertEntryStmt(b, e)));
    return c.json({ linkId: legs[0].linkId, entries: await L.getEntries(b, entries.map(e => e.id)) }, 201);
  });
};

module.exports = { registerLedgerRoutes };
