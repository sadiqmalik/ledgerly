// The managed currency list. Any signed-in account reads it; only a super administrator changes it.
const { AppError, ForbiddenError, NotFoundError } = require('../../server/errors');
const { z, parse, flag } = require('./validate');

const code = z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/, 'must be a 3-letter currency code');
const name = z.string().trim().min(1).max(80);
const alias = z.string().trim().max(8).nullable();
const createSchema = z.object({ code, name, alias: alias.optional() }).strict();
const updateSchema = z.object({ name: name.optional(), alias: alias.optional(), active: flag.optional() }).strict();

const registerCurrencyRoutes = (app, { repo }) => {
  const R = repo.currencies;
  const superAdmin = c => { if (!c.get('account').isSuperAdmin) throw new ForbiddenError('Only a super administrator can do this'); };
  const codeOf = c => String(c.req.param('code') || '').trim().toUpperCase();
  const load = async c => {
    const row = await R.get(codeOf(c));
    if (!row) throw new NotFoundError('Currency not found');
    return row;
  };

  app.get('/api/currencies', async c => c.json(await R.list()));

  app.post('/api/currencies', async c => {
    superAdmin(c);
    const data = parse(createSchema, c.get('body'));
    if (await R.get(data.code)) throw new AppError(`Currency ${data.code} already exists`, 409);
    await R.create({ code: data.code, name: data.name, alias: data.alias || null }, new Date().toISOString());
    return c.json(await R.get(data.code), 201);
  });

  app.put('/api/currencies/:code', async c => {
    superAdmin(c);
    const row = await load(c);
    const data = parse(updateSchema, c.get('body'));
    const cols = {};
    if (data.name !== undefined) cols.name = data.name;
    if (data.alias !== undefined) cols.alias = data.alias || null;
    if (data.active !== undefined) cols.active = data.active ? 1 : 0;
    if (Object.keys(cols).length) await R.update(row.code, cols, new Date().toISOString());
    return c.json(await R.get(row.code));
  });

  app.delete('/api/currencies/:code', async c => {
    superAdmin(c);
    const row = await load(c);
    const usage = await R.usage(row.code);
    if (usage.total > 0) {
      const parts = ['books', 'funds', 'accounts', 'loans', 'entries'].filter(k => usage[k] > 0).map(k => `${usage[k]} ${k}`);
      throw new AppError(`Cannot delete ${row.code}: it is used by ${parts.join(', ')}`, 409, { usage });
    }
    await R.remove(row.code);
    return c.json({ success: true });
  });
};

module.exports = { registerCurrencyRoutes };
