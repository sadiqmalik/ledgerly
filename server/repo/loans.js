// Loan register queries (D1). Every query takes the register id; there is no unscoped read or write of entries,
// and the list is filtered by the register ids the caller may see.
const { loanTotals } = require('../domain/loans');

const likeEscape = s => s.replace(/[\\%_]/g, m => `\\${m}`);

const mapRegister = r => ({
  id: r.id, name: r.name, borrower: r.borrower, lender: r.lender, description: r.description ?? null,
  currency: r.currency, bookId: r.book_id ?? null, createdBy: r.created_by ?? null, createdAt: r.created_at, updatedAt: r.updated_at ?? null, settledAt: r.settled_at ?? null, settled: Boolean(r.settled_at)
});
// ledgerIds: main ledger first, then the extra ones; ledgerNames in the same order.
const withLedgers = (r, extraIds, names) => {
  const ledgerIds = [...(r.bookId ? [r.bookId] : []), ...extraIds.filter(id => id !== r.bookId)];
  return { ledgerIds, ledgerNames: ledgerIds.map(id => names[id]).filter(Boolean) };
};
const mapEntry = r => ({
  id: r.id, kind: r.kind, amount: r.amount, date: r.date, lender: r.lender ?? null, receiver: r.receiver ?? null, comment: r.comment ?? null,
  createdAt: r.created_at, updatedAt: r.updated_at
});

const createLoansRepo = db => {
  const run = (sql, ...p) => db.prepare(sql).bind(...p.map(v => (v === undefined ? null : v)));
  const all = async (sql, ...p) => (await run(sql, ...p).all()).results || [];
  const first = (sql, ...p) => run(sql, ...p).first();

  const totalsOf = async registerId => {
    const rows = await all('SELECT kind, amount FROM loan_entries WHERE register_id = ? AND deleted_at IS NULL', registerId);
    return loanTotals(rows.map(r => ({ kind: r.kind, amount: r.amount })));
  };

  return {
    // ids: array of register ids the caller may see, or null for all (super admin).
    async listRegisters(ids) {
      if (ids !== null && ids.length === 0) return [];
      const where = ids === null ? '' : ` WHERE id IN (${ids.map(() => '?').join(',')})`;
      const regs = (await all(`SELECT * FROM loan_registers${where} ORDER BY LOWER(name), id`, ...(ids || []))).map(mapRegister);
      const extras = await all('SELECT l.register_id, l.book_id, b.name FROM loan_register_ledgers l LEFT JOIN books b ON b.id = l.book_id ORDER BY l.created_at, l.book_id');
      const names = Object.fromEntries((await all('SELECT id, name FROM books')).map(b => [b.id, b.name]));
      return Promise.all(regs.map(async r => ({ ...r, ...withLedgers(r, extras.filter(x => x.register_id === r.id).map(x => x.book_id), names), totals: await totalsOf(r.id) })));
    },

    async getRegister(id) {
      const r = await first('SELECT * FROM loan_registers WHERE id = ?', id);
      if (!r) return null;
      const reg = mapRegister(r);
      const extraIds = (await all('SELECT book_id FROM loan_register_ledgers WHERE register_id = ? ORDER BY created_at, book_id', id)).map(x => x.book_id);
      const names = Object.fromEntries((await all('SELECT id, name FROM books')).map(b => [b.id, b.name]));
      return { ...reg, ...withLedgers(reg, extraIds, names), totals: await totalsOf(id) };
    },

    async createRegister(id, d, createdBy, now) {
      await db.batch([
        ...(d.bookId ? (d.extraLedgerIds || []) : []).map(b => run('INSERT INTO loan_register_ledgers (register_id, book_id, created_at) VALUES (?, ?, ?)', id, b, now)),
        run('INSERT INTO loan_registers (id, name, borrower, lender, description, currency, book_id, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          id, d.name, d.borrower, d.lender, d.description ?? null, d.currency, d.bookId ?? null, createdBy.email || createdBy.id, now, now)
      ]);
    },

    // cols: { column: value } with real column names.
    async updateRegister(id, cols, now) {
      const keys = Object.keys(cols);
      await run(`UPDATE loan_registers SET ${keys.map(k => `${k} = ?`).join(', ')}${keys.length ? ', ' : ''}updated_at = ? WHERE id = ?`,
        ...keys.map(k => cols[k]), now, id).run();
    },

    // Replaces the extra ledgers of a register.
    async setExtraLedgers(id, bookIds, now) {
      await db.batch([
        run('DELETE FROM loan_register_ledgers WHERE register_id = ?', id),
        ...bookIds.map(b => run('INSERT INTO loan_register_ledgers (register_id, book_id, created_at) VALUES (?, ?, ?)', id, b, now))
      ]);
    },

    async entryCount(registerId) {
      return (await first('SELECT COUNT(*) AS n FROM loan_entries WHERE register_id = ? AND deleted_at IS NULL', registerId)).n;
    },

    // Gives the account admin on the new register (merged into its stored loan_memberships).
    async grantAdmin(accountId, registerId) {
      const row = await first('SELECT loan_memberships FROM accounts WHERE id = ?', String(accountId));
      if (!row) return;
      const current = JSON.parse(row.loan_memberships || '[]').filter(m => m.registerId !== registerId);
      await run('UPDATE accounts SET loan_memberships = ?, updated_at = ? WHERE id = ?',
        JSON.stringify([...current, { registerId, role: 'admin' }]), new Date().toISOString(), String(accountId)).run();
    },

    // Deletes the register (and any soft-deleted entries) and strips it from every account, in one batch.
    async removeRegister(id) {
      const accounts = (await all('SELECT id, loan_memberships FROM accounts')).filter(a => JSON.parse(a.loan_memberships || '[]').some(m => m.registerId === id));
      const now = new Date().toISOString();
      await db.batch([
        run('DELETE FROM loan_entries WHERE register_id = ?', id),
        run('DELETE FROM loan_registers WHERE id = ?', id),
        run('DELETE FROM loan_register_ledgers WHERE register_id = ?', id),
        run('DELETE FROM access_code_loans WHERE register_id = ?', id),
        ...accounts.map(a => run('UPDATE accounts SET loan_memberships = ?, updated_at = ? WHERE id = ?',
          JSON.stringify(JSON.parse(a.loan_memberships).filter(m => m.registerId !== id)), now, a.id))
      ]);
    },

    // f: { kind, from, to, q }. Rows by date desc then created desc.
    async listEntries(registerId, f = {}) {
      const where = ['register_id = ?', 'deleted_at IS NULL'];
      const params = [registerId];
      if (f.kind) { where.push('kind = ?'); params.push(f.kind); }
      if (f.from) { where.push('date >= ?'); params.push(f.from); }
      if (f.to) { where.push('date <= ?'); params.push(f.to); }
      if (f.q) {
        where.push("(LOWER(COALESCE(receiver, '')) LIKE ? ESCAPE '\\' OR LOWER(COALESCE(comment, '')) LIKE ? ESCAPE '\\' OR LOWER(COALESCE(lender, '')) LIKE ? ESCAPE '\\')");
        const like = `%${likeEscape(f.q.toLowerCase())}%`;
        params.push(like, like, like);
      }
      return (await all(`SELECT * FROM loan_entries WHERE ${where.join(' AND ')} ORDER BY date DESC, created_at DESC, id DESC`, ...params)).map(mapEntry);
    },

    async getEntry(registerId, id) {
      const r = await first('SELECT * FROM loan_entries WHERE id = ? AND register_id = ? AND deleted_at IS NULL', id, registerId);
      return r ? mapEntry(r) : null;
    },

    async insertEntry(registerId, id, d, createdBy, now) {
      await run(
        'INSERT INTO loan_entries (id, register_id, kind, amount, date, lender, receiver, comment, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        id, registerId, d.kind, d.amount, d.date, d.lender ?? null, d.receiver ?? null, d.comment ?? null, createdBy.email || createdBy.id, now, now).run();
    },

    // cols: { column: value } with real column names.
    async updateEntry(registerId, id, cols, now) {
      const keys = Object.keys(cols);
      await run(`UPDATE loan_entries SET ${keys.map(k => `${k} = ?`).join(', ')}${keys.length ? ', ' : ''}updated_at = ? WHERE id = ? AND register_id = ? AND deleted_at IS NULL`,
        ...keys.map(k => cols[k]), now, id, registerId).run();
    },

    async softDeleteEntry(registerId, id, now) {
      await run('UPDATE loan_entries SET deleted_at = ?, updated_at = ? WHERE id = ? AND register_id = ? AND deleted_at IS NULL', now, now, id, registerId).run();
    },

    // Whole register for backups (including soft-deleted entries). null when it no longer exists.
    async exportRegister(id, now = new Date()) {
      const reg = await first('SELECT * FROM loan_registers WHERE id = ?', id);
      if (!reg) return null;
      const entries = await all('SELECT * FROM loan_entries WHERE register_id = ? ORDER BY date, created_at, id', id);
      return { format: 'ledger-loan-backup', version: 1, exportedAt: now.toISOString(), register: reg, entries };
    },

    async listRegisterIds() {
      return (await all('SELECT id FROM loan_registers ORDER BY id')).map(r => r.id);
    }
  };
};

module.exports = { createLoansRepo };
