// The ledger's application time zone. Any member reads it; only a book admin with the Settings page changes it.
const { isZone } = require('../../server/repo/timezone');
const { z, parse, need } = require('./validate');

const schema = z.object({ timeZone: z.string().trim().min(1).max(64).refine(isZone, 'must be an IANA time zone, for example Europe/Stockholm').nullable() }).strict();

const registerTimeZoneRoutes = (app, { repo }) => {
  const base = '/api/books/:b/timezone';
  app.get(base, async c => c.json(await repo.timeZone.get(c.req.param('b'))));
  app.put(base, async c => {
    need(c, 'admin');
    const { timeZone } = parse(schema, c.get('body'));
    await repo.timeZone.set(c.req.param('b'), timeZone);
    return c.json(await repo.timeZone.get(c.req.param('b')));
  });
};

module.exports = { registerTimeZoneRoutes };
