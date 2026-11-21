// Ledger-wide appearance shared by all members. Any member reads it; only a book admin changes it.
const { PALETTES, LIST_VIEWS, PAGE_KEYS } = require('../../server/repo/appearance');
const { z, parse, need } = require('./validate');

const schema = z.object({
  palette: z.enum(PALETTES).optional(), listView: z.enum(LIST_VIEWS).optional(),
  pageNames: z.record(z.enum(PAGE_KEYS), z.string().trim().max(30)).optional()
}).strict()
  .refine(v => v.palette !== undefined || v.listView !== undefined || v.pageNames !== undefined, 'palette, listView or pageNames is required');

const registerAppearanceRoutes = (app, { repo }) => {
  const base = '/api/books/:b/appearance';
  app.get(base, async c => c.json(await repo.appearance.get(c.req.param('b'))));
  app.put(base, async c => {
    need(c, 'admin');
    const patch = parse(schema, c.get('body'));
    await repo.appearance.set(c.req.param('b'), patch);
    return c.json(await repo.appearance.get(c.req.param('b')));
  });
};

module.exports = { registerAppearanceRoutes };
