// The ledger's application time zone (an IANA name), shared by every member of a book. Stored in book_settings.
// No value means "not set": the client then uses the browser's time zone.
const KEY = 'timeZone';
const isZone = v => { try { new Intl.DateTimeFormat('en', { timeZone: v }); return true; } catch { return false; } };

const createTimeZoneRepo = db => {
  const run = (sql, ...p) => db.prepare(sql).bind(...p);
  return {
    async get(bookId) {
      const row = await run('SELECT value FROM book_settings WHERE book_id = ? AND key = ?', bookId, KEY).first();
      return { timeZone: row && row.value ? row.value : null };
    },
    async set(bookId, timeZone) {
      if (timeZone === null) { await run('DELETE FROM book_settings WHERE book_id = ? AND key = ?', bookId, KEY).run(); return; }
      await run('INSERT INTO book_settings (book_id, key, value) VALUES (?, ?, ?) ON CONFLICT (book_id, key) DO UPDATE SET value = excluded.value', bookId, KEY, timeZone).run();
    }
  };
};

module.exports = { createTimeZoneRepo, isZone };
