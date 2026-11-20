// Number of live entries per fund, holder (account), party and category, across all years. Used by Settings
// to show how much each master record is used. Soft-deleted entries are ignored; transfer legs and excluded
// entries count like any other row. Zero counts are omitted.
const createEntryCountsRepo = db => {
  const toMap = rows => Object.fromEntries(rows.map(r => [r.id, r.n]));
  const group = (column, bookId) => db.prepare(
    `SELECT ${column} AS id, COUNT(*) AS n FROM entries WHERE book_id = ? AND deleted_at IS NULL AND ${column} IS NOT NULL GROUP BY ${column}`
  ).bind(bookId);
  return {
    async get(bookId) {
      const holders = db.prepare(
        `SELECT f.holder_id AS id, COUNT(*) AS n FROM entries e JOIN funds f ON f.id = e.fund_id AND f.book_id = e.book_id
         WHERE e.book_id = ? AND e.deleted_at IS NULL AND f.holder_id IS NOT NULL GROUP BY f.holder_id`
      ).bind(bookId);
      const [funds, hold, parties, categories] = await db.batch([group('fund_id', bookId), holders, group('party_id', bookId), group('category_id', bookId)]);
      return { funds: toMap(funds.results), holders: toMap(hold.results), parties: toMap(parties.results), categories: toMap(categories.results) };
    }
  };
};

module.exports = { createEntryCountsRepo };
