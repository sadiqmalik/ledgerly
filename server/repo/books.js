// Book management (D1): create with defaults, update, delete, counts.
const crypto = require('crypto');
const { DEFAULT_CATEGORIES, DEFAULT_FUND, DEFAULT_HOLDER } = require('../domain/defaults');

// Tables that hold a book's rows (entries last: only soft-deleted ones can remain when a delete is allowed).
const BOOK_TABLES = ['diary_notes', 'diary_categories', 'diary_notebooks', 'entry_documents', 'entries', 'documents', 'items', 'item_locations', 'year_closes', 'profit_rates', 'book_settings', 'projects', 'parties', 'categories', 'funds', 'holders'];

const createBooksRepo = (db, authStore) => {
  const run = (sql, ...p) => db.prepare(sql).bind(...p);
  const first = (sql, ...p) => run(sql, ...p).first();

  return {
    async get(id) {
      return first('SELECT id, name, base_currency, created_at, updated_at, active FROM books WHERE id = ?', id);
    },

    async setActive(id, active) {
      await run('UPDATE books SET active = ? WHERE id = ?', active ? 1 : 0, id).run();
    },

    async counts(id) {
      const [e, d] = await Promise.all([
        first('SELECT COUNT(*) AS n FROM entries WHERE book_id = ? AND deleted_at IS NULL', id),
        first('SELECT COUNT(*) AS n FROM documents WHERE book_id = ?', id)
      ]);
      return { entries: e.n, documents: d.n };
    },

    // One batch: the book, its default categories, one fund and one holder.
    async create({ id, name, baseCurrency, createdAt }) {
      const uid = () => crypto.randomUUID();
      await db.batch([
        run('INSERT INTO books (id, name, base_currency, created_at) VALUES (?, ?, ?, ?)', id, name, baseCurrency, createdAt),
        ...DEFAULT_CATEGORIES.map(c => run(
          'INSERT INTO categories (id, book_id, name, parent_id, default_direction) VALUES (?, ?, ?, NULL, ?)',
          uid(), id, c.name, c.defaultDirection)),
        run('INSERT INTO funds (id, book_id, name, is_reserved, holder_id, currency, kind, archived) VALUES (?, ?, ?, ?, NULL, ?, ?, 0)',
          uid(), id, DEFAULT_FUND.name, DEFAULT_FUND.isReserved ? 1 : 0, baseCurrency, DEFAULT_FUND.kind),
        run('INSERT INTO holders (id, book_id, name, currency, kind, active) VALUES (?, ?, ?, ?, ?, 1)',
          uid(), id, DEFAULT_HOLDER.name, baseCurrency, DEFAULT_HOLDER.kind)
      ]);
    },

    async update(id, { name, baseCurrency }) {
      const sets = []; const vals = [];
      if (name !== undefined) { sets.push('name = ?'); vals.push(name); }
      if (baseCurrency !== undefined) { sets.push('base_currency = ?'); vals.push(baseCurrency); }
      if (sets.length) await run(`UPDATE books SET ${sets.join(', ')} WHERE id = ?`, ...vals, id).run();
    },

    // Deletes every row of the book and strips it from every account's memberships, in one batch.
    async remove(id) {
      const accounts = (await authStore.accounts.list()).filter(a => a.memberships.some(m => m.bookId === id));
      await db.batch([
        ...BOOK_TABLES.map(t => run(`DELETE FROM ${t} WHERE book_id = ?`, id)),
        run('UPDATE loan_registers SET book_id = NULL WHERE book_id = ?', id), // loans survive a deleted ledger, unlinked
        run('DELETE FROM books WHERE id = ?', id),
        ...accounts.map(a => run('UPDATE accounts SET memberships = ?, updated_at = ? WHERE id = ?',
          JSON.stringify(a.memberships.filter(m => m.bookId !== id)), new Date().toISOString(), a.id))
      ]);
    }
  };
};

module.exports = { createBooksRepo };
