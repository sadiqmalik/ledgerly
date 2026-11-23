// Loan registers and their entries. The /api/loans gate in api.js has already checked the session, the `loans`
// page and the viewer role on :r; each route adds its own minimum role. Every query is scoped by register id.
const crypto = require('crypto');
const { loanRoleFor, visibleLoanIds, canAccessLoan, roleFor } = require('../../server/auth/roles');
const { loansPageOk, hasResource, forBook } = require('../../server/auth/resources');
const { loanTotals, lenderTotals } = require('../../server/domain/loans');
const { AppError, ForbiddenError, NotFoundError } = require('../../server/errors');
const { z, parse, isoDate, money } = require('./validate');
const { defaultCurrency } = require('../../server/domain/locale');

const text = max => z.string().trim().max(max);
const required = max => text(max).min(1);
const currency = z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/, 'must be a 3-letter currency code');
const kind = z.enum(['taken', 'returned']);

const extraIds = z.array(z.string().min(1).max(64)).max(50).optional();
const registerCreate = z.object({
  name: required(120), borrower: required(120), lender: required(120),
  description: text(500).nullable().optional(), currency: currency.default(() => defaultCurrency()),
  bookId: z.string().min(1).max(64).nullable().optional(), extraLedgerIds: extraIds
}).strict();
const registerUpdate = z.object({
  name: required(120).optional(), borrower: required(120).optional(), lender: required(120).optional(),
  description: text(500).nullable().optional(), currency: currency.optional(), settled: z.boolean().optional(),
  bookId: z.string().min(1).max(64).nullable().optional(), extraLedgerIds: extraIds
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
const REGISTER_COLS = { name: 'name', borrower: 'borrower', lender: 'lender', description: 'description', currency: 'currency', bookId: 'book_id' };
// A loan may only be linked to a ledger the account itself has a role in (a super administrator: any ledger).
const checkLedger = async (repo, account, bookId) => {
  if (!bookId) return;
  if (!(await repo.books.get(bookId)) || !roleFor(account, bookId)) throw new NotFoundError('Ledger not found');
};
// Extra ledgers: only with a main ledger, never the main one, each one the account may link. Returns the clean list.
const checkExtras = async (repo, account, mainId, ids) => {
  const list = [...new Set(ids || [])];
  if (list.length === 0) return [];
  if (!mainId) throw new AppError('Extra ledgers need a main ledger', 400);
  if (list.includes(mainId)) throw new AppError('The main ledger is already linked', 400);
  for (const id of list) await checkLedger(repo, account, id);
  return list;
};
const ENTRY_COLS = { kind: 'kind', amount: 'amount', date: 'date', lender: 'lender', receiver: 'receiver', comment: 'comment' };
const toCols = (data, map) => {
  const cols = {};
  for (const [k, v] of Object.entries(data)) if (v !== undefined) cols[map[k]] = k === 'description' || k === 'receiver' || k === 'comment' || k === 'lender' ? blank(v) : v;
  return cols;
};

// A register linked to a ledger can be changed only from its MAIN ledger: an Editor or Admin there who also has the Loans page there.
// Anyone reaching it through a shared-in ledger (or as a Viewer in the main one) is read-only. Unlinked registers: no extra rule.
const mainLedgerWrite = (account, bookId) => {
  if (account.isSuperAdmin || !bookId) return true;
  const role = roleFor(account, bookId);
  return (role === 'editor' || role === 'admin') && hasResource(forBook(account, bookId), 'loans');
};

const registerLoanRoutes = (app, { repo }) => {
  const R = repo.loans;
  const now = () => new Date().toISOString();
  const view = (register, account) => {
    const role = loanRoleFor(account, register.id);
    const canWrite = mainLedgerWrite(account, register.bookId) && (role === 'editor' || role === 'admin');
    const shown = { ...register, role: canWrite || role === 'viewer' || !role ? role : 'viewer', canWrite };
    if (!account.accessCode) return shown;
    // An access code is only ever told about ledgers it can open itself: the others are neither listed nor named, and a main
    // ledger it cannot open is replaced by the first it can.
    const mine = new Set((account.memberships || []).map(m => m.bookId));
    const ids = register.ledgerIds || [];
    const keep = ids.map((id, i) => ({ id, name: (register.ledgerNames || [])[i] })).filter(x => mine.has(x.id));
    return { ...shown, bookId: !register.bookId ? null : (mine.has(register.bookId) ? register.bookId : (keep[0]?.id ?? null)), ledgerIds: keep.map(x => x.id), ledgerNames: keep.map(x => x.name).filter(Boolean) };
  };

  // Who created a register, as a name: the account's name (or username) when the stored email or id still matches one.
  const withCreators = async registers => {
    if (!registers.some(r => r.createdBy)) return registers;
    const byKey = new Map();
    for (const a of await repo.authStore.accounts.list()) { byKey.set(String(a.id), a); if (a.email) byKey.set(a.email.toLowerCase(), a); }
    return registers.map(r => {
      const a = byKey.get(String(r.createdBy || '').toLowerCase()) || byKey.get(String(r.createdBy || ''));
      return { ...r, createdByName: a ? (a.name || a.username) : (String(r.createdBy || '').includes('@') ? r.createdBy : '') };
    });
  };
  const shown = async (register, account) => view((await withCreators([register]))[0], account);

  const need = (c, role) => {
    if (!canAccessLoan(c.get('account'), c.req.param('r'), role)) throw new ForbiddenError('Your account cannot do this for this loan register');
  };
  const loadRegister = async c => {
    const register = await R.getRegister(c.req.param('r'));
    if (!register) throw new NotFoundError('Loan register not found');
    return register;
  };
  // need() plus, for a write, the main-ledger rule; returns the register.
  const needWrite = async (c, role) => {
    need(c, role);
    const register = await loadRegister(c);
    if (!mainLedgerWrite(c.get('account'), register.bookId)) throw new ForbiddenError('Only an Editor or Admin of this loan\'s main ledger can change it');
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
    const register = await needWrite(c, 'editor');
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
    return c.json((await withCreators((await R.listRegisters(visibleLoanIds(account))).filter(r => loansPageOk(account, r)))).map(r => view(r, account)));
  });

  app.post('/api/loans', async c => {
    const account = c.get('account');
    if (account.accessCode) throw new ForbiddenError();
    const data = parse(registerCreate, c.get('body'));
    data.description = blank(data.description);
    await repo.currencies.assertUsable(data.currency);
    await checkLedger(repo, account, data.bookId);
    if (!mainLedgerWrite(account, data.bookId)) throw new ForbiddenError('Only an Editor or Admin of a ledger can add a loan to it');
    data.extraLedgerIds = await checkExtras(repo, account, data.bookId, data.extraLedgerIds);
    const id = crypto.randomUUID();
    await R.createRegister(id, data, account, now());
    if (!account.isSuperAdmin) await R.grantAdmin(account.id, id);
    // The session account predates the new membership, so the creator's role is stated, not derived.
    return c.json({ ...(await withCreators([await R.getRegister(id)]))[0], role: 'admin' }, 201);
  });

  app.get('/api/loans/:r', async c => {
    need(c, 'viewer');
    return c.json(await shown(await loadRegister(c), c.get('account')));
  });

  // Access codes that may view this loan (view-only). Loan admins and super administrators only.
  // The list holds active codes by name, never their secrets; `shared` holds the ids that have access now.
  app.get('/api/loans/:r/access-codes', async c => {
    const register = await needWrite(c, 'admin');
    const codes = repo.authStore.accessCodes;
    const [all, shared] = await Promise.all([codes.list(), codes.codeIdsForLoan(register.id)]);
    const active = all.filter(code => !code.revokedAt);
    const activeIds = new Set(active.map(code => code.id));
    return c.json({ codes: active.map(code => ({ id: code.id, name: code.name })), shared: shared.filter(id => activeIds.has(id)) });
  });

  app.put('/api/loans/:r/access-codes', async c => {
    const register = await needWrite(c, 'admin');
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
    const register = await needWrite(c, 'admin');
    const { settled, ...data } = parse(registerUpdate, c.get('body'));
    if (settled === true && !register.settled && register.totals.balance !== 0) {
      throw new AppError('A loan can be settled only when the remaining balance is zero', 409);
    }
    if (data.currency !== undefined && data.currency !== register.currency && register.totals.count > 0) {
      throw new AppError('Cannot change the currency of a register that has entries', 409);
    }
    if (data.currency !== undefined && data.currency !== register.currency) await repo.currencies.assertUsable(data.currency);
    if (data.bookId !== undefined) await checkLedger(repo, c.get('account'), data.bookId);
    // Moving a loan to another main ledger needs the Admin role in the ledger it leaves and in the one it joins (super admin always).
    if (data.bookId !== undefined && (data.bookId || null) !== (register.bookId || null) && !c.get('account').isSuperAdmin) {
      const account = c.get('account');
      if (register.bookId && roleFor(account, register.bookId) !== 'admin') throw new ForbiddenError('Only an Admin of the ledger this loan is in can move it');
      if (data.bookId && roleFor(account, data.bookId) !== 'admin') throw new ForbiddenError('You need the Admin role in the ledger you are moving it to');
    }
    const { extraLedgerIds, ...regData } = data;
    const mainId = data.bookId !== undefined ? (data.bookId || null) : register.bookId;
    // Extra ledgers change when they are sent, or when the main ledger changes (they then must not include it, or exist without a main).
    let extras;
    if (extraLedgerIds !== undefined) extras = await checkExtras(repo, c.get('account'), mainId, (extraLedgerIds || []).filter(id => data.bookId === undefined || id !== mainId)); // a new main ledger is dropped from the extras
    else if (data.bookId !== undefined) extras = mainId ? register.ledgerIds.filter(id => id !== register.bookId && id !== mainId) : [];
    const cols = toCols(regData, REGISTER_COLS);
    if (settled !== undefined && settled !== register.settled) cols.settled_at = settled ? now() : null;
    await R.updateRegister(register.id, cols, now());
    if (extras !== undefined) await R.setExtraLedgers(register.id, extras, now());
    return c.json(await shown(await R.getRegister(register.id), c.get('account')));
  });

  app.delete('/api/loans/:r', async c => {
    const register = await needWrite(c, 'admin');
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
    return c.json({ register: await shown(register, c.get('account')), rows, totals: loanTotals(rows), byLender: lenderTotals(all) });
  });

  app.post('/api/loans/:r/entries', async c => {
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
    const register = await openRegister(c);
    const entry = await loadEntry(c);
    const data = parse(entryUpdate, c.get('body'));
    if (data.lender !== undefined) data.lender = checkLender(register, blank(data.lender));
    await R.updateEntry(register.id, entry.id, toCols(data, ENTRY_COLS), now());
    return c.json(await R.getEntry(register.id, entry.id));
  });

  app.delete('/api/loans/:r/entries/:id', async c => {
    const register = await openRegister(c);
    const entry = await loadEntry(c);
    await R.softDeleteEntry(register.id, entry.id, now());
    return c.json({ success: true });
  });
};

module.exports = { registerLoanRoutes };
