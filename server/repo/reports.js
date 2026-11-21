// Projects, reports and year-close queries (D1). All aggregation is done in SQL; all queries are scoped by book_id.
const SKIP_CATS = "('transfer','conversion','opening')";
const notSkipped = alias => `(${alias}.category_id IS NULL OR ${alias}.category_id NOT IN
  (SELECT id FROM categories WHERE book_id = ${alias}.book_id AND LOWER(name) IN ${SKIP_CATS}))`;

const mapProject = r => ({
  id: r.id, name: r.name, kind: r.kind, fundId: r.fund_id, fundName: r.fund_name ?? null,
  startsOn: r.starts_on, endsOn: r.ends_on, budget: r.budget,
  status: r.status, metaSchema: r.meta_schema ? JSON.parse(r.meta_schema) : null,
  createdAt: r.created_at ?? null, updatedAt: r.updated_at ?? null
});

const PROJECT_SELECT = 'SELECT p.*, f.name AS fund_name FROM projects p LEFT JOIN funds f ON f.id = p.fund_id';

const PIVOT_ROWS = {
  category: { key: 'e.category_id', join: 'LEFT JOIN categories x ON x.id = e.category_id', name: 'x.name' },
  party: { key: 'e.party_id', join: 'LEFT JOIN parties x ON x.id = e.party_id', name: 'x.name' },
  project: { key: 'e.project_id', join: 'LEFT JOIN projects x ON x.id = e.project_id', name: 'x.name' },
  fund: { key: 'e.fund_id', join: 'JOIN funds x ON x.id = e.fund_id', name: 'x.name' }
};

const createReportsRepo = (db, ledger) => {
  const { run, all, first } = ledger;

  const projectTotals = async (bookId, ids, currency) => {
    const totals = new Map(ids.map(i => [i, { spent: 0, out: 0, in: 0, paid: 0, pending: 0, excluded: 0, exOut: 0, exIn: 0, exPaid: 0, exPending: 0, count: 0 }]));
    if (!ids.length) return totals;
    // One GROUP BY over the book (no id list, so D1's 100-parameter limit cannot be hit).
    const rows = await all(
      `SELECT project_id,
         COUNT(*) AS n,
         COALESCE(SUM(CASE WHEN currency = ? AND exclude = 1 THEN amount END), 0) AS excluded,
         COALESCE(SUM(CASE WHEN currency = ? AND exclude = 0 THEN CASE direction WHEN 'dr' THEN amount ELSE -amount END END), 0) AS spent,
         COALESCE(SUM(CASE WHEN currency = ? AND exclude = 0 AND direction = 'dr' THEN amount END), 0) AS out_amt,
         COALESCE(SUM(CASE WHEN currency = ? AND exclude = 0 AND direction = 'cr' THEN amount END), 0) AS in_amt,
         COALESCE(SUM(CASE WHEN currency = ? AND exclude = 0 AND status = 'paid' THEN CASE direction WHEN 'dr' THEN amount ELSE -amount END END), 0) AS paid,
         COALESCE(SUM(CASE WHEN currency = ? AND exclude = 0 AND status = 'pending' THEN CASE direction WHEN 'dr' THEN amount ELSE -amount END END), 0) AS pending,
         COALESCE(SUM(CASE WHEN currency = ? AND exclude = 1 AND direction = 'dr' THEN amount END), 0) AS ex_out,
         COALESCE(SUM(CASE WHEN currency = ? AND exclude = 1 AND direction = 'cr' THEN amount END), 0) AS ex_in,
         COALESCE(SUM(CASE WHEN currency = ? AND exclude = 1 AND status = 'paid' THEN CASE direction WHEN 'dr' THEN amount ELSE -amount END END), 0) AS ex_paid,
         COALESCE(SUM(CASE WHEN currency = ? AND exclude = 1 AND status = 'pending' THEN CASE direction WHEN 'dr' THEN amount ELSE -amount END END), 0) AS ex_pending
       FROM entries WHERE book_id = ? AND deleted_at IS NULL AND project_id IS NOT NULL
       GROUP BY project_id`, currency, currency, currency, currency, currency, currency, currency, currency, currency, currency, bookId);
    for (const r of rows) {
      if (totals.has(r.project_id)) Object.assign(totals.get(r.project_id), { spent: r.spent, out: r.out_amt, in: r.in_amt, paid: r.paid, pending: r.pending, excluded: r.excluded, exOut: r.ex_out, exIn: r.ex_in, exPaid: r.ex_paid, exPending: r.ex_pending, count: r.n });
    }
    return totals;
  };

  // Balance of every fund (any currency) as of a date: Σcr − Σdr, excluded and deleted rows left out.
  const balancesAt = async (bookId, asOf) => {
    const rows = await all(
      `SELECT fund_id, SUM(CASE direction WHEN 'cr' THEN amount ELSE -amount END) AS bal FROM entries
       WHERE book_id = ? AND deleted_at IS NULL AND exclude = 0 AND date <= ? GROUP BY fund_id`, bookId, asOf);
    return new Map(rows.map(r => [r.fund_id, r.bal]));
  };

  return {
    async projectNames(bookId) {
      return all('SELECT id, name, kind, status FROM projects WHERE book_id = ? ORDER BY name', bookId);
    },

    async listProjects(bookId, all_, currency) {
      const rows = await all(`${PROJECT_SELECT} WHERE p.book_id = ? ${all_ ? '' : "AND p.status = 'open'"} ORDER BY p.name`, bookId);
      const totals = await projectTotals(bookId, rows.map(r => r.id), currency);
      return rows.map(r => ({ ...mapProject(r), totals: totals.get(r.id) }));
    },

    async getProject(bookId, id, currency) {
      const row = await first(`${PROJECT_SELECT} WHERE p.book_id = ? AND p.id = ?`, bookId, id);
      if (!row) return null;
      const project = mapProject(row);
      const totals = (await projectTotals(bookId, [id], currency)).get(id);
      const byCategory = (await all(
        `SELECT e.category_id AS categoryId, c.name AS name,
           SUM(CASE WHEN e.exclude = 0 THEN CASE e.direction WHEN 'dr' THEN e.amount ELSE -e.amount END ELSE 0 END) AS amount,
           SUM(CASE WHEN e.exclude = 0 AND e.direction = 'dr' THEN e.amount ELSE 0 END) AS out,
           SUM(CASE WHEN e.exclude = 0 AND e.direction = 'cr' THEN e.amount ELSE 0 END) AS "in",
           SUM(CASE WHEN e.exclude = 1 AND e.direction = 'dr' THEN e.amount ELSE 0 END) AS exOut,
           SUM(CASE WHEN e.exclude = 1 AND e.direction = 'cr' THEN e.amount ELSE 0 END) AS exIn
         FROM entries e LEFT JOIN categories c ON c.id = e.category_id
         WHERE e.book_id = ? AND e.project_id = ? AND e.deleted_at IS NULL AND e.currency = ?
         GROUP BY e.category_id ORDER BY amount DESC, name`, bookId, id, currency)).map(r => ({ ...r, name: r.name ?? '(none)' }));
      let metaKeys;
      if (Array.isArray(project.metaSchema) && project.metaSchema.length) {
        metaKeys = project.metaSchema.map(m => m.key);
      } else {
        metaKeys = (await all(
          `SELECT DISTINCT j.key AS key FROM entries e, json_each(e.meta) j
           WHERE e.book_id = ? AND e.project_id = ? AND e.deleted_at IS NULL AND e.meta IS NOT NULL AND json_valid(e.meta)
             AND json_type(e.meta) = 'object' ORDER BY j.key`, bookId, id)).map(r => r.key);
      }
      return { ...project, totals, byCategory, metaKeys };
    },

    insertProjectStmt: (bookId, p) => run(
      `INSERT INTO projects (id, book_id, name, kind, fund_id, starts_on, ends_on, budget, meta_schema, status)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
      p.id, bookId, p.name, p.kind, p.fundId ?? null, p.startsOn ?? null, p.endsOn ?? null, p.budget ?? null,
      p.metaSchema == null ? null : JSON.stringify(p.metaSchema), p.status || 'open'),

    updateProjectStmt: (bookId, id, c) => {
      const cols = { name: 'name', kind: 'kind', fundId: 'fund_id', startsOn: 'starts_on', endsOn: 'ends_on', budget: 'budget', metaSchema: 'meta_schema', status: 'status' };
      const keys = Object.keys(c).filter(k => cols[k]);
      return run(`UPDATE projects SET ${keys.map(k => `${cols[k]} = ?`).join(', ')} WHERE id = ? AND book_id = ?`,
        ...keys.map(k => (k === 'metaSchema' ? (c[k] == null ? null : JSON.stringify(c[k])) : c[k])), id, bookId);
    },

    async projectEntryCount(bookId, id) {
      return (await first('SELECT COUNT(*) AS n FROM entries WHERE book_id = ? AND project_id = ? AND deleted_at IS NULL', bookId, id)).n;
    },
    deleteProjectStmt: (bookId, id) => run('DELETE FROM projects WHERE id = ? AND book_id = ?', id, bookId),

    // Per fund and year movements (base-currency funds, excluded/deleted rows left out, transfers counted).
    async yearlyMovements(bookId, currency) {
      const funds = await all(
        'SELECT id, name, kind, archived FROM funds WHERE book_id = ? AND currency = ? ORDER BY name', bookId, currency);
      const rows = await all(
        `SELECT e.fund_id, CAST(substr(e.date, 1, 4) AS INTEGER) AS y,
           COALESCE(SUM(CASE WHEN e.direction = 'cr' THEN e.amount END), 0) AS cr,
           COALESCE(SUM(CASE WHEN e.direction = 'dr' THEN e.amount END), 0) AS dr
         FROM entries e JOIN funds f ON f.id = e.fund_id
         WHERE e.book_id = ? AND e.deleted_at IS NULL AND e.exclude = 0 AND f.currency = ?
         GROUP BY e.fund_id, y`, bookId, currency);
      return { funds, rows };
    },

    // Pivot: one row per group, one cell per year. `net` = cr − dr.
    async pivot(bookId, { rows: by, direction, from, to, memo }, currency) {
      const spec = PIVOT_ROWS[by];
      const dirSql = direction === 'dr' ? "e.direction = 'dr'" : direction === 'cr' ? "e.direction = 'cr'" : '1 = 1';
      const amount = direction === 'net' ? "CASE e.direction WHEN 'cr' THEN e.amount ELSE -e.amount END" : 'e.amount';
      const where = ['e.book_id = ?', 'e.deleted_at IS NULL', 'e.exclude = 0', 'e.currency = ?', dirSql, notSkipped('e')];
      const params = [bookId, currency];
      if (from) { where.push('e.date >= ?'); params.push(`${from}-01-01`); }
      if (to) { where.push('e.date <= ?'); params.push(`${to}-12-31`); }
      if (!memo) where.push("e.fund_id NOT IN (SELECT id FROM funds WHERE book_id = e.book_id AND kind = 'memo')");
      return all(
        `SELECT ${spec.key} AS id, ${spec.name} AS name, substr(e.date, 1, 4) AS year, SUM(${amount}) AS amount
         FROM entries e ${spec.join} WHERE ${where.join(' AND ')}
         GROUP BY ${spec.key}, year`, ...params);
    },

    async profit(bookId, currency, fundId) {
      return all(
        `SELECT substr(e.date, 1, 7) AS month, e.fund_id AS fundId, f.name AS fundName,
           SUM(CASE e.direction WHEN 'cr' THEN e.amount ELSE -e.amount END) AS amount, AVG(e.rate) AS rate
         FROM entries e JOIN funds f ON f.id = e.fund_id JOIN categories c ON c.id = e.category_id
         WHERE e.book_id = ? AND e.deleted_at IS NULL AND e.exclude = 0 AND e.currency = ? AND LOWER(c.name) = 'profit'
           ${fundId ? 'AND e.fund_id = ?' : ''}
         GROUP BY month, e.fund_id ORDER BY month, f.name`, bookId, currency, ...(fundId ? [fundId] : []));
    },

    async firstEntryYear(bookId) {
      const r = await first("SELECT MIN(substr(date, 1, 4)) AS y FROM entries WHERE book_id = ? AND deleted_at IS NULL", bookId);
      return r && r.y ? Number(r.y) : null;
    },

    async entryYears(bookId) {
      return (await all(
        "SELECT DISTINCT CAST(substr(date, 1, 4) AS INTEGER) AS y FROM entries WHERE book_id = ? AND deleted_at IS NULL", bookId)).map(r => r.y);
    },

    async yearCloseRows(bookId) {
      return all('SELECT * FROM year_closes WHERE book_id = ?', bookId);
    },
    async yearClose(bookId, year) {
      return first('SELECT * FROM year_closes WHERE book_id = ? AND year = ?', bookId, year);
    },

    // Every fund (any currency) with its balance at year end.
    async snapshotAt(bookId, year) {
      const [funds, bal] = await Promise.all([
        all('SELECT id, name FROM funds WHERE book_id = ?', bookId), balancesAt(bookId, `${year}-12-31`)]);
      return { funds, balances: Object.fromEntries(funds.map(f => [f.id, bal.get(f.id) || 0])) };
    },

    insertYearCloseStmt: (bookId, year, at, by, snapshot) => run(
      'INSERT INTO year_closes (book_id, year, closed_at, closed_by, snapshot) VALUES (?,?,?,?,?)',
      bookId, year, at, by, JSON.stringify(snapshot)),
    deleteYearCloseStmt: (bookId, year) => run('DELETE FROM year_closes WHERE book_id = ? AND year = ?', bookId, year)
  };
};

module.exports = { createReportsRepo };
