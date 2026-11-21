// Ledger-wide appearance (palette, list view), shared by every member of a book. Stored in book_settings.
const PALETTES = Object.freeze(['forest', 'ocean', 'indigo', 'plum', 'rose', 'terracotta', 'slate', 'sky', 'mint', 'lavender', 'coral', 'sunshine', 'blush']);
const LIST_VIEWS = Object.freeze(['cards', 'table']);
const DEFAULTS = Object.freeze({ palette: 'forest', listView: 'cards' });
const KEYS = Object.freeze({ palette: 'appearance.palette', listView: 'appearance.listView', pageNames: 'appearance.pageNames' });
// Pages whose sidebar and title name can be changed (an alias). The default names live in src/utils/pageNames.js.
const PAGE_KEYS = Object.freeze(['ledger', 'projects', 'loans', 'reports', 'documents', 'diary', 'items']);

const createAppearanceRepo = db => {
  const run = (sql, ...p) => db.prepare(sql).bind(...p);
  return {
    async get(bookId) {
      const { results } = await run('SELECT key, value FROM book_settings WHERE book_id = ? AND key IN (?, ?, ?)', bookId, KEYS.palette, KEYS.listView, KEYS.pageNames).all();
      const map = Object.fromEntries(results.map(r => [r.key, r.value]));
      const palette = PALETTES.includes(map[KEYS.palette]) ? map[KEYS.palette] : DEFAULTS.palette;
      const listView = LIST_VIEWS.includes(map[KEYS.listView]) ? map[KEYS.listView] : DEFAULTS.listView;
      let pageNames = {};
      try {
        const raw = JSON.parse(map[KEYS.pageNames] || '{}');
        pageNames = Object.fromEntries(Object.entries(raw).filter(([k, v]) => PAGE_KEYS.includes(k) && typeof v === 'string' && v.trim()));
      } catch { pageNames = {}; }
      return { palette, listView, pageNames };
    },
    async set(bookId, patch) {
      // pageNames replaces the whole map; blank names are dropped, so an empty map means "all defaults".
      const value = k => (k === 'pageNames'
        ? JSON.stringify(Object.fromEntries(Object.entries(patch.pageNames).filter(([key, v]) => PAGE_KEYS.includes(key) && v.trim()).map(([key, v]) => [key, v.trim()])))
        : patch[k]);
      const stmts = Object.keys(KEYS).filter(k => patch[k] !== undefined).map(k => run(
        'INSERT INTO book_settings (book_id, key, value) VALUES (?, ?, ?) ON CONFLICT (book_id, key) DO UPDATE SET value = excluded.value',
        bookId, KEYS[k], value(k)));
      if (stmts.length) await db.batch(stmts);
    }
  };
};

module.exports = { createAppearanceRepo, PALETTES, LIST_VIEWS, DEFAULTS, PAGE_KEYS };
