// Shared zod helpers and role/lock guards for the ledger routes.
const { z } = require('zod');
const { ValidationError, ForbiddenError, NotFoundError, AppError } = require('../../server/errors');
const { canAccess } = require('../../server/auth/roles');
const { isYearClosed } = require('../../server/domain');
const { MAX_MINOR } = require('../../server/domain/entryPricing');

const parse = (schema, data) => {
  const r = schema.safeParse(data);
  if (!r.success) {
    throw new ValidationError(r.error.issues[0] ? `${r.error.issues[0].path.join('.') || 'body'}: ${r.error.issues[0].message}` : 'Invalid input', {
      details: r.error.issues.map(i => ({ path: i.path.join('.'), message: i.message }))
    });
  }
  return r.data;
};

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'must be YYYY-MM-DD').refine(s => {
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}, 'not a real date').refine(s => s >= '1900-01-01' && s <= '2100-12-31', 'year must be between 1900 and 2100');
const money = z.number({ invalid_type_error: 'must be an integer in minor units' }).int('must be an integer in minor units').safe('too large').positive('must be > 0').max(MAX_MINOR, 'too large');
const flag = z.union([z.boolean(), z.literal(0), z.literal(1)]).transform(v => Boolean(v));
const id = z.string().min(1).max(100);

const need = (c, role) => {
  if (!canAccess(c.get('account'), c.req.param('b'), role)) throw new ForbiddenError();
};

const notFound = what => new NotFoundError(`${what} not found`);
const yearClosed = () => new AppError('year closed', 423);

const assertOpen = async (repo, bookId, ...dates) => {
  const years = await repo.ledger.closedYears(bookId);
  if (dates.some(d => d && isYearClosed(years, d))) throw yearClosed();
};

module.exports = { MAX_MINOR, z, parse, isoDate, money, flag, id, need, notFound, assertOpen };
