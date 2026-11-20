// Managed currency list (D1). Other tables keep storing the 3-letter code.
const { ValidationError } = require('../errors');

const map = r => ({ code: r.code, name: r.name, alias: r.alias ?? null, active: r.active !== 0 });

const createCurrenciesRepo = db => {
  const run = (sql, ...p) => db.prepare(sql).bind(...p.map(v => (v === undefined ? null : v)));
  const first = (sql, ...p) => run(sql, ...p).first();

  return {
    async list() {
      return ((await run('SELECT * FROM currencies ORDER BY code').all()).results || []).map(map);
    },

    async get(code) {
      const r = await first('SELECT * FROM currencies WHERE code = ?', code);
      return r ? map(r) : null;
    },

    async create({ code, name, alias }, now) {
      await run('INSERT INTO currencies (code, name, alias, active, created_at, updated_at) VALUES (?, ?, ?, 1, ?, ?)', code, name, alias ?? null, now, now).run();
    },

    // cols: { name, alias, active } with real column names; active as 0/1.
    async update(code, cols, now) {
      const keys = Object.keys(cols);
      await run(`UPDATE currencies SET ${keys.map(k => `${k} = ?`).join(', ')}${keys.length ? ', ' : ''}updated_at = ? WHERE code = ?`,
        ...keys.map(k => cols[k]), now, code).run();
    },

    async remove(code) {
      await run('DELETE FROM currencies WHERE code = ?', code).run();
    },

    // Throws a 400 unless the code exists and is switched on. Call it when a record is created or its currency changes.
    async assertUsable(code) {
      const r = await first('SELECT active FROM currencies WHERE code = ?', code);
      if (!r || r.active === 0) throw new ValidationError(`Unknown or disabled currency ${code}. Add or enable it under Admin, Currencies.`);
    },

    // What still uses the code: { books, funds, accounts, loans, entries } (counts). Soft-deleted entries count too.
    async usage(code) {
      const n = async (sql, ...p) => (await first(sql, ...p)).n;
      const u = {
        books: await n('SELECT COUNT(*) AS n FROM books WHERE base_currency = ?', code),
        funds: await n('SELECT COUNT(*) AS n FROM funds WHERE currency = ?', code),
        accounts: await n('SELECT COUNT(*) AS n FROM holders WHERE currency = ?', code),
        loans: await n('SELECT COUNT(*) AS n FROM loan_registers WHERE currency = ?', code),
        entries: await n('SELECT COUNT(*) AS n FROM entries WHERE currency = ? OR fx_currency = ?', code, code)
      };
      return { ...u, total: u.books + u.funds + u.accounts + u.loans + u.entries };
    }
  };
};

module.exports = { createCurrenciesRepo };
