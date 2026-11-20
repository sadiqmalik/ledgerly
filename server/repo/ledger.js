// Ledger queries (D1): entries, balances, masters. All queries are scoped by book_id.
const { AppError } = require('../errors');
const { defaultCurrency } = require('../domain/locale');

const ENTRY_SELECT = `SELECT e.*, f.name AS fund_name, p.name AS party_name, c.name AS category_name,
    (SELECT COUNT(*) FROM entry_documents ed JOIN documents d ON d.id = ed.document_id WHERE ed.entry_id = e.id AND d.book_id = e.book_id) AS doc_count
  FROM entries e
  JOIN funds f ON f.id = e.fund_id
  LEFT JOIN parties p ON p.id = e.party_id
  LEFT JOIN categories c ON c.id = e.category_id`;

const mapEntry = r => ({
  id: r.id, date: r.date, fundId: r.fund_id, fundName: r.fund_name, direction: r.direction,
  amount: r.amount, quantity: r.quantity ?? 1, unitPrice: r.unit_price ?? r.amount,
  currency: r.currency, partyId: r.party_id, partyName: r.party_name,
  categoryId: r.category_id, categoryName: r.category_name, projectId: r.project_id,
  comment: r.comment, rate: r.rate, linkId: r.link_id, fxAmount: r.fx_amount, fxCurrency: r.fx_currency,
  paidDate: r.paid_date, status: r.status, exclude: Boolean(r.exclude),
  meta: r.meta ? JSON.parse(r.meta) : null, createdAt: r.created_at, updatedAt: r.updated_at,
  docCount: r.doc_count ?? 0
});

const likeEscape = s => s.replace(/[\\%_]/g, m => `\\${m}`);

const marks = list => list.map(() => '?').join(',');

// Builds the WHERE for the entries list. Every filter is an array (OR within a filter, AND across filters)
// and every value is a bound parameter. Needs the joins: entries e, funds f, parties p.
const filterSql = (bookId, f) => {
  const where = ['e.book_id = ?', 'e.deleted_at IS NULL'];
  const params = [bookId];
  const add = (sql, ...p) => { where.push(sql); params.push(...p); };
  const inList = (col, list) => add(`${col} IN (${marks(list)})`, ...list);
  // ids with the special value 'none' (is empty)
  const idList = (col, list) => {
    const ids = list.filter(v => v !== 'none');
    const none = list.length !== ids.length;
    if (!none) return inList(col, ids);
    if (!ids.length) return add(`${col} IS NULL`);
    add(`(${col} IN (${marks(ids)}) OR ${col} IS NULL)`, ...ids);
  };
  if (f.year && f.year.length) {
    add(`substr(e.date, 1, 4) IN (${marks(f.year)})`, ...f.year.map(y => String(y).padStart(4, '0')));
  }
  if (f.from) add('e.date >= ?', f.from);
  if (f.to) add('e.date <= ?', f.to);
  if (f.fund && f.fund.length) inList('e.fund_id', f.fund);
  if (f.kind && f.kind.length) inList('f.kind', f.kind);
  // Memo funds are not part of the main pool: hidden unless asked for by kind, by fund or by project
  // (a project's own page must list all its entries), so the default ledger rows, totals and openings
  // always cover the same funds (and match the dashboard).
  else if (!(f.fund && f.fund.length) && !(f.project && f.project.filter(v => v !== 'none').length)) add("f.kind <> 'memo'");
  if (f.currency && f.currency.length) inList('e.currency', f.currency);
  if (f.party && f.party.length) idList('e.party_id', f.party);
  if (f.category && f.category.length) idList('e.category_id', f.category);
  if (f.project && f.project.length) idList('e.project_id', f.project);
  if (f.direction) add('e.direction = ?', f.direction);
  if (f.status && f.status.length) inList('e.status', f.status);
  if (f.exclude !== undefined) add('e.exclude = ?', f.exclude);
  if (f.linked === 1) add('e.link_id IS NOT NULL');
  if (f.linked === 0) add('e.link_id IS NULL');
  if (f.min !== undefined) add('e.amount >= ?', f.min);
  if (f.max !== undefined) add('e.amount <= ?', f.max);
  if (f.q) {
    const like = `%${likeEscape(f.q.toLowerCase())}%`;
    add("(LOWER(e.comment) LIKE ? ESCAPE '\\' OR LOWER(p.name) LIKE ? ESCAPE '\\')", like, like);
  }
  return { where: where.join(' AND '), params };
};

const ORDER = {
  date_desc: 'e.date DESC, e.created_at DESC, e.id DESC',
  date_asc: 'e.date ASC, e.created_at ASC, e.id ASC',
  amount_desc: 'e.amount DESC, e.date DESC, e.id DESC',
  amount_asc: 'e.amount ASC, e.date DESC, e.id DESC'
};

// The day the period starts: 1 Jan of the earliest selected year, or `from` (the later one when both are set).
const periodStart = f => {
  const starts = [];
  if (f.year && f.year.length) starts.push(`${Math.min(...f.year)}-01-01`);
  if (f.from) starts.push(f.from);
  return starts.length ? starts.sort().pop() : null;
};

// closing = opening + net only holds for one continuous period with no row-level filter the openings ignore.
// Returns a short reason when it does not hold, else null.
const closingProblem = f => {
  const ignored = ['party', 'category', 'project', 'status', 'direction', 'exclude', 'linked', 'min', 'max', 'q']
    .filter(k => (Array.isArray(f[k]) ? f[k].length : f[k] !== undefined && f[k] !== ''));
  if (ignored.length) return `the ${ignored.join(', ')} filter${ignored.length > 1 ? 's' : ''} narrow the rows but not the opening balance`;
  if (!f.from && !f.to && f.year && f.year.length > 1) {
    const years = [...f.year].sort((a, b) => a - b);
    if (years.some((y, i) => i > 0 && y !== years[i - 1] + 1)) return 'the selected years are not consecutive';
  }
  return null;
};

const uniqueToConflict = error => {
  if (/UNIQUE/i.test(String(error && (error.message || error)))) throw new AppError('Name already exists', 409);
  throw error;
};

const createLedgerRepo = db => {
  const run = (sql, ...p) => db.prepare(sql).bind(...p);
  const all = async (sql, ...p) => (await run(sql, ...p).all()).results;
  const first = (sql, ...p) => run(sql, ...p).first();

  const insertEntryStmt = (bookId, e) => run(
    `INSERT INTO entries (id, book_id, date, fund_id, direction, amount, currency, party_id, category_id, project_id,
       comment, rate, link_id, fx_amount, fx_currency, paid_date, status, exclude, meta, created_by, created_at, updated_at, quantity, unit_price)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    e.id, bookId, e.date, e.fundId, e.direction, e.amount, e.currency, e.partyId ?? null, e.categoryId ?? null,
    e.projectId ?? null, e.comment ?? null, e.rate ?? null, e.linkId ?? null, e.fxAmount ?? null, e.fxCurrency ?? null,
    e.paidDate ?? null, e.status ?? 'paid', e.exclude ? 1 : 0,
    e.meta == null ? null : JSON.stringify(e.meta), e.createdBy, e.createdAt, e.updatedAt, e.quantity ?? 1, e.unitPrice ?? null
  );

  const COLS = {
    date: 'date', fundId: 'fund_id', direction: 'direction', amount: 'amount', currency: 'currency',
    quantity: 'quantity', unitPrice: 'unit_price',
    partyId: 'party_id', categoryId: 'category_id', projectId: 'project_id', comment: 'comment', rate: 'rate',
    paidDate: 'paid_date', status: 'status', exclude: 'exclude', meta: 'meta', updatedAt: 'updated_at'
  };
  const updateEntryStmt = (bookId, id, changes) => {
    const keys = Object.keys(changes).filter(k => COLS[k]);
    const val = k => (k === 'exclude' ? (changes[k] ? 1 : 0) : k === 'meta' ? (changes[k] == null ? null : JSON.stringify(changes[k])) : changes[k]);
    return run(
      `UPDATE entries SET ${keys.map(k => `${COLS[k]} = ?`).join(', ')} WHERE id = ? AND book_id = ? AND deleted_at IS NULL`,
      ...keys.map(val), id, bookId
    );
  };

  return {
    run, all, first,
    mapEntry,
    insertEntryStmt,
    updateEntryStmt,

    batch: stmts => db.batch(stmts),

    async baseCurrency(bookId) {
      const row = await first('SELECT base_currency FROM books WHERE id = ?', bookId);
      return row ? row.base_currency : defaultCurrency();
    },

    async closedYears(bookId) {
      return (await all('SELECT year FROM year_closes WHERE book_id = ?', bookId)).map(r => r.year);
    },

    // Existence checks scoped to the book. table is a fixed internal name.
    async inBook(table, bookId, id) {
      if (!id) return null;
      return first(`SELECT * FROM ${table} WHERE id = ? AND book_id = ?`, id, bookId);
    },

    async findPartyByName(bookId, name) {
      const n = name.trim().toLowerCase();
      return first(
        `SELECT * FROM parties WHERE book_id = ? AND (LOWER(name) = ? OR EXISTS
           (SELECT 1 FROM json_each(CASE WHEN json_valid(parties.aliases) THEN parties.aliases ELSE '[]' END) WHERE LOWER(value) = ?))
         ORDER BY archived, name LIMIT 1`, bookId, n, n);
    },

    async categoryIdByName(bookId, name) {
      const row = await first('SELECT id FROM categories WHERE book_id = ? AND LOWER(name) = ?', bookId, name.toLowerCase());
      return row ? row.id : null;
    },

    async getEntryRaw(bookId, id) {
      return first('SELECT * FROM entries WHERE id = ? AND book_id = ? AND deleted_at IS NULL', id, bookId);
    },

    async getEntries(bookId, ids) {
      if (!ids.length) return [];
      const rows = [];
      for (let i = 0; i < ids.length; i += 50) {
        const chunk = ids.slice(i, i + 50);
        rows.push(...await all(
          `${ENTRY_SELECT} WHERE e.book_id = ? AND e.deleted_at IS NULL AND e.id IN (${marks(chunk)})`, bookId, ...chunk));
      }
      const by = new Map(rows.map(r => [r.id, mapEntry(r)]));
      return ids.map(i => by.get(i)).filter(Boolean);
    },

    async linkedLeg(bookId, linkId, exceptId) {
      return first('SELECT * FROM entries WHERE book_id = ? AND link_id = ? AND id <> ? AND deleted_at IS NULL', bookId, linkId, exceptId);
    },

    softDeleteStmt: (bookId, id, now) =>
      run('UPDATE entries SET deleted_at = ?, updated_at = ? WHERE id = ? AND book_id = ? AND deleted_at IS NULL', now, now, id, bookId),

    // Balance per fund before `start` (non-zero only), for funds matching the fund/kind/currency filters.
    // Memo funds are left out unless the kind filter includes memo or the fund filter names funds.
    async openings(bookId, f, start) {
      if (!start) return [];
      const where = ['f.book_id = ?', 'e.deleted_at IS NULL', 'e.exclude = 0', 'e.date < ?'];
      const params = [bookId, start];
      if (f.fund && f.fund.length) { where.push(`f.id IN (${marks(f.fund)})`); params.push(...f.fund); }
      if (f.kind && f.kind.length) { where.push(`f.kind IN (${marks(f.kind)})`); params.push(...f.kind); }
      else if (!(f.fund && f.fund.length)) where.push("f.kind <> 'memo'");
      if (f.currency && f.currency.length) { where.push(`f.currency IN (${marks(f.currency)})`); params.push(...f.currency); }
      const rows = await all(
        `SELECT f.id AS fund_id, f.name AS fund_name, f.currency AS currency,
                SUM(CASE WHEN e.direction = 'cr' THEN e.amount ELSE -e.amount END) AS bal
         FROM funds f JOIN entries e ON e.fund_id = f.id AND e.book_id = f.book_id
         WHERE ${where.join(' AND ')} GROUP BY f.id, f.name, f.currency HAVING bal <> 0 ORDER BY f.name`, ...params);
      // (alias is "bal", not "amount": in HAVING, SQLite would resolve "amount" to the e.amount column)
      return rows.map(r => ({ fundId: r.fund_id, fundName: r.fund_name, currency: r.currency, amount: r.bal }));
    },

    async listEntries(bookId, f) {
      const { where, params } = filterSql(bookId, f);
      const join = 'FROM entries e JOIN funds f ON f.id = e.fund_id LEFT JOIN parties p ON p.id = e.party_id';
      const order = ORDER[f.sort] || ORDER.date_desc;
      const [rows, tot, cnt] = await db.batch([
        run(`${ENTRY_SELECT} WHERE ${where} ORDER BY ${order} LIMIT ? OFFSET ?`,
          ...params, f.pageSize, (f.page - 1) * f.pageSize),
        run(`SELECT e.currency AS currency,
                    COALESCE(SUM(CASE WHEN e.direction = 'cr' THEN e.amount END), 0) AS cr,
                    COALESCE(SUM(CASE WHEN e.direction = 'dr' THEN e.amount END), 0) AS dr
             ${join} WHERE ${where} AND e.exclude = 0 GROUP BY e.currency`, ...params),
        run(`SELECT COUNT(*) AS n ${join} WHERE ${where}`, ...params)
      ]);
      // Never add different currencies together: totals is in the base currency (or the only
      // currency present), and totalsByCurrency has one entry per currency.
      const totalsByCurrency = {};
      for (const t of tot.results) totalsByCurrency[t.currency] = { cr: t.cr, dr: t.dr, net: t.cr - t.dr };
      let openings;
      let closingNote;
      if (f.opening) {
        const problem = closingProblem(f);
        if (problem) closingNote = `Closing not shown: ${problem}.`;
        openings = await this.openings(bookId, f, periodStart(f));
        for (const o of openings) totalsByCurrency[o.currency] ??= { cr: 0, dr: 0, net: 0 };
        for (const [cur, t] of Object.entries(totalsByCurrency)) {
          t.opening = openings.filter(o => o.currency === cur).reduce((s, o) => s + o.amount, 0);
          t.closing = problem ? null : t.opening + t.net;
        }
      }
      const base = await this.baseCurrency(bookId);
      const only = Object.keys(totalsByCurrency);
      const empty = f.opening ? { cr: 0, dr: 0, net: 0, opening: 0, closing: closingNote ? null : 0 } : { cr: 0, dr: 0, net: 0 };
      const t = totalsByCurrency[base] || (only.length === 1 ? totalsByCurrency[only[0]] : empty);
      if (closingNote) {
        t.closingNote = closingNote;
        for (const x of Object.values(totalsByCurrency)) x.closingNote = closingNote;
      }
      return {
        rows: rows.results.map(mapEntry),
        totals: t, totalsByCurrency,
        ...(f.opening ? { openings } : {}),
        page: f.page, pageSize: f.pageSize, count: cnt.results[0].n
      };
    },

    // Per fund and direction sums as pseudo-entries the domain can add up.
    async aggregateEntries(bookId, asOf) {
      const rows = await all(
        `SELECT fund_id, direction, SUM(amount) AS amount FROM entries
         WHERE book_id = ? AND deleted_at IS NULL AND exclude = 0 ${asOf ? 'AND date <= ?' : ''}
         GROUP BY fund_id, direction`, ...(asOf ? [bookId, asOf] : [bookId]));
      return rows.map(r => ({ fundId: r.fund_id, direction: r.direction, amount: r.amount, date: '' }));
    },

    async summaryFunds(bookId) {
      const rows = await all('SELECT * FROM funds WHERE book_id = ? AND archived = 0 ORDER BY name', bookId);
      return rows.map(f => ({ id: f.id, name: f.name, currency: f.currency, kind: f.kind, isReserved: Boolean(f.is_reserved), holderId: f.holder_id }));
    },

    async yearTotals(bookId, year, asOf, currency) {
      const row = await first(
        `SELECT COALESCE(SUM(CASE WHEN e.direction = 'cr' THEN e.amount END), 0) AS cr,
                COALESCE(SUM(CASE WHEN e.direction = 'dr' THEN e.amount END), 0) AS dr
         FROM entries e JOIN funds f ON f.id = e.fund_id
         WHERE e.book_id = ? AND e.deleted_at IS NULL AND e.exclude = 0 AND e.currency = ? AND f.kind <> 'memo'
           AND e.date >= ? AND e.date <= ?`, bookId, currency, `${year}-01-01`, asOf && asOf.slice(0, 4) === String(year) ? asOf : `${year}-12-31`);
      return { cr: row.cr, dr: row.dr };
    },

    async recentEntries(bookId, n) {
      return (await all(`${ENTRY_SELECT} WHERE e.book_id = ? AND e.deleted_at IS NULL ORDER BY e.date DESC, e.created_at DESC, e.id DESC LIMIT ?`, bookId, n)).map(mapEntry);
    },

    uniqueToConflict
  };
};

module.exports = { createLedgerRepo, uniqueToConflict, mapEntry };
