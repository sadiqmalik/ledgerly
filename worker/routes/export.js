// GET /export?format=json (ledger Admin) or format=csv&year= (editor or Admin). Only for people who can change data, and
// only the parts their pages in this ledger show: Ledger (entries and the lists they use), Projects (project entries),
// Documents, Item Vault.
const { z, parse, need, notFound } = require('./validate');
const { hasResource, forBook } = require('../../server/auth/resources');
const { ForbiddenError } = require('../../server/errors');
const { entriesCsv } = require('../../server/csv');

const query = z.object({
  format: z.enum(['json', 'csv']),
  year: z.coerce.number().int().min(1900).max(2999).optional()
});
const fileName = s => s.replace(/[^A-Za-z0-9._-]/g, '_');

const registerExportRoutes = (app, { repo }) => {
  app.get('/api/books/:b/export', async c => {
    const b = c.req.param('b');
    const q = parse(query, c.req.query());
    const pages = forBook(c.get('account'), b);
    const scope = { ledger: hasResource(pages, 'ledger'), projects: hasResource(pages, 'projects'), documents: hasResource(pages, 'documents'), items: hasResource(pages, 'items') };
    if (q.format === 'json') {
      need(c, 'admin');
      const now = new Date();
      const data = await repo.exportRepo.exportBook(b, now, scope);
      if (!data) throw notFound('Book');
      return new Response(JSON.stringify(data), {
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Content-Disposition': `attachment; filename="ledger-${fileName(b)}-${now.toISOString().slice(0, 10)}.json"`,
          'Cache-Control': 'no-store'
        }
      });
    }
    need(c, 'editor');
    if (!scope.ledger && !scope.projects) throw new ForbiddenError('This account cannot export entries');
    const csv = entriesCsv(await repo.exportRepo.csvRows(b, q.year, { projectOnly: !scope.ledger }));
    return new Response(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="ledger-${fileName(b)}-${q.year || 'all'}.csv"`,
        'Cache-Control': 'no-store'
      }
    });
  });
};

module.exports = { registerExportRoutes };
