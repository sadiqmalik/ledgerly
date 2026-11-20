// Loan registers and their entries. The /api/loans gate in api.js has already checked the session, the `loans`
// page and the viewer role on :r; each route adds its own minimum role. Every query is scoped by register id.
const crypto = require('crypto');
const { loanRoleFor, visibleLoanIds, canAccessLoan } = require('../../server/auth/roles');
const { loanTotals, lenderTotals } = require('../../server/domain/loans');
const { AppError, ForbiddenError, NotFoundError } = require('../../server/errors');
const { z, parse, isoDate, money } = require('./validate');
const { defaultCurrency } = require('../../server/domain/locale');

const text = max => z.string().trim().max(max);
const required = max => text(max).min(1);
const currency = z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/, 'must be a 3-letter currency code');
const kind = z.enum(['taken', 'returned']);

const registerCreate = z.object({
  name: required(120), borrower: required(120), lender: required(120),
  description: text(500).nullable().optional(), currency: currency.default(() => defaultCurrency())
}).strict();
const registerUpdate = z.object({
  name: required(120).optional(), borrower: required(120).optional(), lender: required(120).optional(),
  description: text(500).nullable().optional(), currency: currency.optional(), settled: z.boolean().optional()
}).strict();
const entryCreate = z.object({
  kind, amount: money, date: isoDate, lender: text(120).nullable().optional(), receiver: text(120).nullable().optional(), comment: text(500).nullable().optional()
}).strict();
const entryUpdate = z.object({
  kind: kind.optional(), amount: money.optional(), date: isoDate.optional(), lender: text(120).nullable().optional(),
  receiver: text(120).nullable().optional(), comment: text(500).nullable().optional()
}).strict();
const filters = z.object({
  kind: kind.optional(), from: isoDate.optional(), to: isoDate.optional(), q: text(200).optional()
});
const shareCodes = z.object({ codeIds: z.array(z.string().min(1).max(64)).max(100) }).strict();

const blank = v => (v === '' ? null : v);
const REGISTER_COLS = { name: 'name', borrower: 'borrower', lender: 'lender', description: 'description', currency: 'currency' };
const ENTRY_COLS = { kind: 'kind', amount: 'amount', date: 'date', lender: 'lender', receiver: 'receiver', comment: 'comment' };
const toCols = (data, map) => {
  const cols = {};
  for (const [k, v] of Object.entries(data)) if (v !== undefined) cols[map[k]] = k === 'description' || k === 'receiver' || k === 'comment' || k === 'lender' ? blank(v) : v;
  return cols;
};

const registerLoanRoutes = (app, { repo }) => {
  const R = repo.loans;
  const now = () => new Date().toISOString();
  const view = (register, account) => ({ ...register, role: loanRoleFor(account, register.id) });

  const need = (c, role) => {
    if (!canAccessLoan(c.get('account'), c.req.param('r'), role)) throw new ForbiddenError('Your account cannot do this for this loan register');
  };
  const loadRegister = async c => {
    const register = await R.getRegister(c.req.param('r'));
    if (!register) throw new NotFoundError('Loan register not found');
    return register;
  };
  // An entry's lender must be one of the names in the register's lender field ("A & B"). Returns the register's spelling.
  const checkLender = (register, lender) => {
    if (lender == null || lender === '') return null;
    const names = String(register.lender).split(/\s*&\s*/).map(n => n.trim()).filter(Boolean);
    const hit = names.find(n => n.toLowerCase() === String(lender).trim().toLowerCase());
    if (!hit) throw new AppError(`Lender must be one of: ${names.join(', ')}`, 400);
    return hit;
  };
  const openRegister = async c => {
    const register = await loadRegister(c);
    if (register.settled) throw new AppError('This loan is settled. Reopen it to change its entries.', 409);
    return register;
  };
  const loadEntry = async c => {
    const entry = await R.getEntry(c.req.param('r'), c.req.param('id'));
    if (!entry) throw new NotFoundError('Entry not found');
    return entry;
  };

  app.get('/api/loans', async c => {
    const account = c.get('account');
    return c.json((await R.listRegisters(visibleLoanIds(account))).map(r => view(r, account)));
  });

  app.post('/api/loans', async c => {
    const account = c.get('account');
    if (account.accessCode) throw new ForbiddenError();
    const data = parse(registerCreate, c.get('body'));
    data.description = blank(data.description);
    await repo.currencies.assertUsable(data.currency);
    const id = crypto.randomUUID();
    await R.createRegister(id, data, account, now());
    if (!account.isSuperAdmin) await R.grantAdmin(account.id, id);
    // The session account predates the new membership, so the creator's role is stated, not derived.
    return c.json({ ...(await R.getRegister(id)), role: 'admin' }, 201);
  });

  app.get('/api/loans/:r', async c => {
    need(c, 'viewer');
    return c.json(view(await loadRegister(c), c.get('account')));
  });

  // Access codes that may view this loan (view-only). Loan admins and super administrators only.
  // The list holds active codes by name, never their secrets; `shared` holds the ids that have access now.
  app.get('/api/loans/:r/access-codes', async c => {
    need(c, 'admin');
    const register = await loadRegister(c);
    const codes = repo.authStore.accessCodes;
    const [all, shared] = await Promise.all([codes.list(), codes.codeIdsForLoan(register.id)]);
    const active = all.filter(code => !code.revokedAt);
    const activeIds = new Set(active.map(code => code.id));
    return c.json({ codes: active.map(code => ({ id: code.id, name: code.name })), shared: shared.filter(id => activeIds.has(id)) });
  });

  app.put('/api/loans/:r/access-codes', async c => {
    need(c, 'admin');
    const register = await loadRegister(c);
    const { codeIds } = parse(shareCodes, c.get('body'));
    const wanted = [...new Set(codeIds)];
    const codes = repo.authStore.accessCodes;
    const activeIds = new Set((await codes.list()).filter(code => !code.revokedAt).map(code => code.id));
    const unknown = wanted.filter(id => !activeIds.has(id));
    if (unknown.length) throw new AppError('Choose active access codes only', 400);
    const at = now();
    await codes.setLoanCodes(register.id, wanted, at);
    const actor = c.get('account');
    await repo.authStore.log.insert({
      actor: { id: actor.id, email: actor.email }, action: 'loan-codes', target: `loan:${register.id}`,
      detail: { name: register.name, codeIds: wanted }, at
    });
    return c.json({ shared: wanted });
  });

  app.put('/api/loans/:r', async c => {
    need(c, 'admin');
    const register = await loadRegister(c);
    const { settled, ...data } = parse(registerUpdate, c.get('body'));
    if (settled === true && !register.settled && register.totals.balance !== 0) {
      throw new AppError('A loan can be settled only when the remaining balance is zero', 409);
    }
    if (data.currency !== undefined && data.currency !== register.currency && register.totals.count > 0) {
      throw new AppError('Cannot change the currency of a register that has entries', 409);
    }
    if (data.currency !== undefined && data.currency !== register.currency) await repo.currencies.assertUsable(data.currency);
    const cols = toCols(data, REGISTER_COLS);
    if (settled !== undefined && settled !== register.settled) cols.settled_at = settled ? now() : null;
    await R.updateRegister(register.id, cols, now());
    return c.json(view(await R.getRegister(register.id), c.get('account')));
  });

  app.delete('/api/loans/:r', async c => {
    need(c, 'admin');
    const register = await loadRegister(c);
    if (await R.entryCount(register.id) > 0) throw new AppError('Cannot delete a register that has entries', 409);
    await R.removeRegister(register.id);
    return c.json({ success: true });
  });

  app.get('/api/loans/:r/entries', async c => {
    need(c, 'viewer');
    const register = await loadRegister(c);
    const f = parse(filters, c.req.query());
    const rows = await R.listEntries(register.id, f);
    const filtered = Boolean(f.kind || f.from || f.to || f.q);
    const all = filtered ? await R.listEntries(register.id) : rows;
    return c.json({ register: view(register, c.get('account')), rows, totals: loanTotals(rows), byLender: lenderTotals(all) });
  });

  app.post('/api/loans/:r/entries', async c => {
    need(c, 'editor');
    const register = await openRegister(c);
    const data = parse(entryCreate, c.get('body'));
    data.receiver = blank(data.receiver);
    data.lender = checkLender(register, blank(data.lender));
    data.comment = blank(data.comment);
    const id = crypto.randomUUID();
    await R.insertEntry(register.id, id, data, c.get('account'), now());
    return c.json(await R.getEntry(register.id, id), 201);
  });

  app.put('/api/loans/:r/entries/:id', async c => {
    need(c, 'editor');
    const register = await openRegister(c);
    const entry = await loadEntry(c);
    const data = parse(entryUpdate, c.get('body'));
    if (data.lender !== undefined) data.lender = checkLender(register, blank(data.lender));
    await R.updateEntry(register.id, entry.id, toCols(data, ENTRY_COLS), now());
    return c.json(await R.getEntry(register.id, entry.id));
  });

  app.delete('/api/loans/:r/entries/:id', async c => {
    need(c, 'editor');
    const register = await openRegister(c);
    const entry = await loadEntry(c);
    await R.softDeleteEntry(register.id, entry.id, now());
    return c.json({ success: true });
  });
};

module.exports = { registerLoanRoutes };
