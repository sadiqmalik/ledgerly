// Books (one ledger per person or company) and their members.
const { visibleBookIds, roleFor } = require('../../server/auth/roles');
const { AppError, ForbiddenError, NotFoundError } = require('../../server/errors');
const { z, parse, need } = require('./validate');
const { defaultCurrency } = require('../../server/domain/locale');

const currency = z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/, 'must be a 3-letter currency code');
const name = z.string().trim().min(1).max(120);
const slugId = z.string().regex(/^[a-z0-9-]{1,40}$/, 'must be 1-40 characters: a-z, 0-9 and dashes');
const createSchema = z.object({ name, baseCurrency: currency.default(() => defaultCurrency()), id: slugId.optional() }).strict();
const updateSchema = z.object({ name: name.optional(), baseCurrency: currency.optional() }).strict();

const activeSchema = z.object({ active: z.boolean() }).strict();

const slugify = text => text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40).replace(/-+$/, '');

const registerBookRoutes = (app, { repo, accountAdmin }) => {
  const view = (b, account) => ({
    id: b.id, name: b.name, baseCurrency: b.base_currency, createdAt: b.created_at, active: b.active !== 0, role: roleFor(account, b.id)
  });

  const requireSuperAdmin = c => { if (!c.get('account').isSuperAdmin) throw new ForbiddenError('Only a super administrator can do this'); };
  const loadBook = async c => {
    const book = await repo.books.get(c.req.param('b'));
    if (!book) throw new NotFoundError('Book not found');
    return book;
  };

  app.get('/api/books', async c => {
    const account = c.get('account');
    const all = await repo.listBooks();
    const visible = visibleBookIds(account);
    const books = visible === null ? all : all.filter(b => b.active !== 0 && visible.includes(b.id));
    return c.json(books.map(b => view(b, account)));
  });

  app.post('/api/books', async c => {
    requireSuperAdmin(c);
    const data = parse(createSchema, c.get('body'));
    const id = data.id || slugify(data.name);
    if (!id) parse(slugId, id);
    if (await repo.books.get(id)) throw new AppError('A book with this id already exists', 409);
    await repo.currencies.assertUsable(data.baseCurrency);
    const createdAt = new Date().toISOString();
    try {
      await repo.books.create({ id, name: data.name, baseCurrency: data.baseCurrency, createdAt });
    } catch (error) {
      if (/UNIQUE/i.test(String(error && error.message))) throw new AppError('A book with this id already exists', 409);
      throw error;
    }
    return c.json(view(await repo.books.get(id), c.get('account')), 201);
  });

  app.put('/api/books/:b', async c => {
    need(c, 'admin');
    const book = await loadBook(c);
    const data = parse(updateSchema, c.get('body'));
    if (data.baseCurrency !== undefined && data.baseCurrency !== book.base_currency && (await repo.books.counts(book.id)).entries > 0) {
      throw new AppError('Cannot change the base currency of a book that has entries', 409);
    }
    if (data.baseCurrency !== undefined && data.baseCurrency !== book.base_currency) await repo.currencies.assertUsable(data.baseCurrency);
    await repo.books.update(book.id, data);
    return c.json(view(await repo.books.get(book.id), c.get('account')));
  });

  app.put('/api/books/:b/active', async c => {
    const data = parse(activeSchema, c.get('body'));
    if (data.active) requireSuperAdmin(c); else need(c, 'admin');
    const book = await loadBook(c);
    await repo.books.setActive(book.id, data.active);
    return c.json(view(await repo.books.get(book.id), c.get('account')));
  });

  app.delete('/api/books/:b', async c => {
    requireSuperAdmin(c);
    const book = await loadBook(c);
    if (book.active !== 0) throw new AppError('Deactivate the ledger first, then delete it permanently.', 409);
    const counts = await repo.books.counts(book.id);
    if (counts.entries > 0 || counts.documents > 0) {
      throw new AppError('Cannot delete a book that has entries or documents', 409, counts);
    }
    await repo.books.remove(book.id);
    return c.json({ success: true });
  });

  app.get('/api/books/:b/members', async c => {
    need(c, 'admin');
    const book = await loadBook(c);
    return c.json(await accountAdmin.bookMembers(book.id));
  });

  app.post('/api/books/:b/members', async c => {
    need(c, 'admin');
    const book = await loadBook(c);
    return c.json(await accountAdmin.addBookMember(c.get('account'), book.id, c.get('body')), 201);
  });

  app.put('/api/books/:b/members/:accountId', async c => {
    need(c, 'admin');
    const book = await loadBook(c);
    const result = await accountAdmin.setBookRole(c.get('account'), c.req.param('accountId'), book.id, c.get('body'));
    return c.json(result || { success: true });
  });
};

module.exports = { registerBookRoutes };
