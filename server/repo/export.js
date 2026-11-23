// Full-book export (the JSON backup) and the entries CSV. Queries are scoped by book_id.
const { mapEntry } = require('./ledger');

const bool = v => Boolean(v);
const mapFund = r => ({ id: r.id, name: r.name, color: r.color, isReserved: bool(r.is_reserved), holderId: r.holder_id, currency: r.currency, kind: r.kind, archived: bool(r.archived) });
const mapHolder = r => ({ id: r.id, name: r.name, currency: r.currency, kind: r.kind, active: bool(r.active) });
const mapCategory = r => ({ id: r.id, name: r.name, parentId: r.parent_id, defaultDirection: r.default_direction });
const mapParty = r => {
  let aliases = [];
  try { aliases = r.aliases ? JSON.parse(r.aliases) : []; } catch { /* keep [] */ }
  return { id: r.id, name: r.name, relation: r.relation, aliases, archived: bool(r.archived) };
};
const mapProject = r => ({
  id: r.id, name: r.name, kind: r.kind, fundId: r.fund_id, startsOn: r.starts_on, endsOn: r.ends_on, budget: r.budget,
  metaSchema: r.meta_schema ? JSON.parse(r.meta_schema) : null, status: r.status
});
const mapClose = r => ({ year: r.year, closedAt: r.closed_at, closedBy: r.closed_by, snapshot: r.snapshot ? JSON.parse(r.snapshot) : null });
const mapDocument = r => ({
  id: r.id, projectId: r.project_id, partyId: r.party_id, date: r.date, receivedOn: r.received_on, doctor: r.doctor,
  hospital: r.hospital, type: r.type, title: r.title, comment: r.comment, hasFile: Boolean(r.r2_key),
  fileName: r.file_name, fileType: r.file_type, fileSize: r.file_size, createdAt: r.created_at, updatedAt: r.updated_at
});

const createExportRepo = (db, ledger) => {
  const all = (sql, ...p) => ledger.all(sql, ...p);

  return {
    // The whole book as one JSON-ready object. Soft-deleted entries are included with deletedAt.
    // scope: which parts the caller's pages allow ({ ledger, projects, documents, items }); omitted parts come back empty.
    async exportBook(bookId, now = new Date(), scope = { ledger: true, projects: true, documents: true, items: true }) {
      const book = await ledger.first('SELECT id, name, base_currency FROM books WHERE id = ?', bookId);
      if (!book) return null;
      const [funds, holders, categories, parties, projects, entries, closes, documents, itemLocations, items, entryDocuments] = await db.batch([
        'funds', 'holders', 'categories', 'parties', 'projects'
      ].map(t => ledger.run(`SELECT * FROM ${t} WHERE book_id = ? ORDER BY name, id`, bookId)).concat([
        ledger.run('SELECT * FROM entries WHERE book_id = ? ORDER BY date, created_at, id', bookId),
        ledger.run('SELECT * FROM year_closes WHERE book_id = ? ORDER BY year', bookId),
        ledger.run('SELECT * FROM documents WHERE book_id = ? ORDER BY date, id', bookId),
        ledger.run('SELECT * FROM item_locations WHERE book_id = ? ORDER BY name, id', bookId),
        ledger.run('SELECT * FROM items WHERE book_id = ? ORDER BY name, id', bookId),
        ledger.run('SELECT entry_id, document_id FROM entry_documents WHERE book_id = ? ORDER BY entry_id, document_id', bookId)
      ]));
      const none = [];
      const part = (allowed, rows) => (allowed ? rows : none);
      const withEntries = scope.ledger || scope.projects;
      const entryRows = entries.results.filter(r => scope.ledger || r.project_id);
      return {
        format: 'ledger-backup', version: 1, exportedAt: now.toISOString(),
        partial: !(scope.ledger && scope.projects && scope.documents && scope.items),
        book: { id: book.id, name: book.name, baseCurrency: book.base_currency },
        funds: part(withEntries, funds.results.map(mapFund)), holders: part(withEntries, holders.results.map(mapHolder)),
        categories: part(withEntries, categories.results.map(mapCategory)), parties: part(withEntries, parties.results.map(mapParty)),
        projects: part(scope.projects || scope.ledger, projects.results.map(mapProject)),
        entries: part(withEntries, entryRows.map(r => ({ ...mapEntry({ ...r, fund_name: undefined, party_name: undefined, category_name: undefined }), deletedAt: r.deleted_at }))
          .map(({ fundName, partyName, categoryName, docCount, ...e }) => e)),
        yearCloses: part(scope.ledger, closes.results.map(mapClose)), documents: part(scope.documents, documents.results.map(mapDocument)),
        itemLocations: part(scope.items, itemLocations.results.map(r => ({ id: r.id, name: r.name, place: r.place }))),
        items: part(scope.items, items.results.map(r => ({ id: r.id, name: r.name, comment: r.comment, locationId: r.location_id, owner: r.owner, updatedAt: r.updated_at }))),
        entryDocuments: part(scope.documents && withEntries, entryDocuments.results.map(r => ({ entryId: r.entry_id, documentId: r.document_id })))
      };
    },

    // Rows for the entries CSV (deleted rows left out), oldest first.
    async csvRows(bookId, year, { projectOnly = false } = {}) {
      const range = year ? ' AND e.date >= ? AND e.date <= ?' : '';
      return all(
        `SELECT e.date, f.name AS fund, e.direction, e.amount, e.currency, p.name AS party, c.name AS category,
                j.name AS project, e.comment, e.rate, e.status, e.paid_date, e.exclude,
                e.quantity, COALESCE(e.unit_price, e.amount) AS unit_price
         FROM entries e JOIN funds f ON f.id = e.fund_id
         LEFT JOIN parties p ON p.id = e.party_id LEFT JOIN categories c ON c.id = e.category_id
         LEFT JOIN projects j ON j.id = e.project_id
         WHERE e.book_id = ? AND e.deleted_at IS NULL${projectOnly ? ' AND e.project_id IS NOT NULL' : ''}${range}
         ORDER BY e.date, e.created_at, e.id`,
        ...(year ? [bookId, `${year}-01-01`, `${year}-12-31`] : [bookId]));
    }
  };
};

module.exports = { createExportRepo };
