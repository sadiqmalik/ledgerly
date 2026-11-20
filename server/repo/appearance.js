// Ledger-wide appearance (palette, list view), shared by every member of a book. Stored in book_settings.
const PALETTES = Object.freeze(['forest', 'ocean', 'indigo', 'plum', 'rose', 'terracotta', 'slate', 'sky', 'mint', 'lavender', 'coral', 'sunshine', 'blush']);
const LIST_VIEWS = Object.freeze(['cards', 'table']);
const DEFAULTS = Object.freeze({ palette: 'forest', listView: 'cards' });
const KEYS = Object.freeze({ palette: 'appearance.palette', listView: 'appearance.listView' });

const createAppearanceRepo = db => {
  const run = (sql, ...p) => db.prepare(sql).bind(...p);
  return {
    async get(bookId) {
      const { results } = await run('SELECT key, value FROM book_settings WHERE book_id = ? AND key IN (?, ?)', bookId, KEYS.palette, KEYS.listView).all();
      const map = Object.fromEntries(results.map(r => [r.key, r.value]));
      const palette = PALETTES.includes(map[KEYS.palette]) ? map[KEYS.palette] : DEFAULTS.palette;
      const listView = LIST_VIEWS.includes(map[KEYS.listView]) ? map[KEYS.listView] : DEFAULTS.listView;
      return { palette, listView };
    },
    async set(bookId, patch) {
      const stmts = Object.keys(KEYS).filter(k => patch[k] !== undefined).map(k => run(
        'INSERT INTO book_settings (book_id, key, value) VALUES (?, ?, ?) ON CONFLICT (book_id, key) DO UPDATE SET value = excluded.value',
        bookId, KEYS[k], patch[k]));
      if (stmts.length) await db.batch(stmts);
    }
  };
};

module.exports = { createAppearanceRepo, PALETTES, LIST_VIEWS, DEFAULTS };
