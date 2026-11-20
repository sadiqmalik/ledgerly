// GET /export?format=json (admin) or format=csv&year= (viewer).
const { z, parse, need, notFound } = require('./validate');
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
    if (q.format === 'json') {
      need(c, 'admin');
      const now = new Date();
      const data = await repo.exportRepo.exportBook(b, now);
      if (!data) throw notFound('Book');
      return new Response(JSON.stringify(data), {
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Content-Disposition': `attachment; filename="ledger-${fileName(b)}-${now.toISOString().slice(0, 10)}.json"`,
          'Cache-Control': 'no-store'
        }
      });
    }
    const csv = entriesCsv(await repo.exportRepo.csvRows(b, q.year));
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
