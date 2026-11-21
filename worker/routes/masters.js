// CRUD for funds, holders, categories and parties.
// Reads need viewer; writes need editor (parties) or admin (funds, holders, categories).
const { AppError } = require('../../server/errors');
const { z, parse, flag, id, need, notFound } = require('./validate');
const { defaultCurrency } = require('../../server/domain/locale');

const nullableStr = z.string().max(500).nullable();
const name = z.string().trim().min(1).max(200);
const currency = z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/, 'must be a 3-letter currency code');

// col: db column; type: 'bool' | 'json' | undefined; ref: table the id must belong to.
const RESOURCES = {
  funds: {
    table: 'funds', role: 'admin', archive: 'archived', label: 'Fund',
    fields: {
      name: { col: 'name', zod: name }, color: { col: 'color', zod: nullableStr },
      isReserved: { col: 'is_reserved', zod: flag, type: 'bool' },
      holderId: { col: 'holder_id', zod: id.nullable(), ref: 'holders' }, currency: { col: 'currency', zod: currency },
      kind: { col: 'kind', zod: z.enum(['general', 'reserved', 'custodial', 'investment', 'memo']) },
      archived: { col: 'archived', zod: flag, type: 'bool' }
    },
    required: ['name'], get defaults() { return { kind: 'general', isReserved: false, currency: defaultCurrency(), archived: false }; }
  },
  holders: {
    table: 'holders', role: 'admin', archive: 'active', archiveValue: 0, label: 'Holder',
    fields: {
      name: { col: 'name', zod: name }, currency: { col: 'currency', zod: currency },
      kind: { col: 'kind', zod: z.enum(['bank', 'cash', 'wallet']) }, active: { col: 'active', zod: flag, type: 'bool' }
    },
    required: ['name', 'kind'], get defaults() { return { currency: defaultCurrency(), active: true }; }
  },
  categories: {
    table: 'categories', role: 'admin', label: 'Category',
    fields: {
      name: { col: 'name', zod: name }, parentId: { col: 'parent_id', zod: id.nullable(), ref: 'categories' },
      defaultDirection: { col: 'default_direction', zod: z.enum(['cr', 'dr']) }
    },
    required: ['name'], defaults: { defaultDirection: 'dr' }
  },
  parties: {
    table: 'parties', role: 'editor', archive: 'archived', label: 'Party',
    fields: {
      name: { col: 'name', zod: name }, relation: { col: 'relation', zod: nullableStr },
      aliases: { col: 'aliases', zod: z.array(z.string().trim().min(1).max(200)).max(50).nullable(), type: 'json' },
      archived: { col: 'archived', zod: flag, type: 'bool' }
    },
    required: ['name'], defaults: { archived: false }
  }
};

// Transfers and reports look these categories up by name.
const SYSTEM_CATEGORIES = ['transfer', 'conversion', 'opening'];
const isSystemCategory = row => SYSTEM_CATEGORIES.includes(String(row.name).trim().toLowerCase());

const toDb = (f, v) => (f.type === 'bool' ? (v ? 1 : 0) : f.type === 'json' ? (v == null ? null : JSON.stringify(v)) : v);
const fromDb = (f, v) => (f.type === 'bool' ? Boolean(v) : f.type === 'json' ? (v ? JSON.parse(v) : []) : v);

const registerMasterRoutes = (app, { repo }) => {
  const L = repo.ledger;

  for (const [path, r] of Object.entries(RESOURCES)) {
    const keys = Object.keys(r.fields);
    const shape = Object.fromEntries(keys.map(k => [k, r.fields[k].zod.optional()]));
    const schema = z.object(shape).strict();
    const map = row => ({ id: row.id, ...Object.fromEntries(keys.map(k => [k, fromDb(r.fields[k], row[r.fields[k].col])])), createdAt: row.created_at ?? null, updatedAt: row.updated_at ?? null });
    const url = `/api/books/:b/${path}`;

    const checkRefs = async (b, data) => {
      for (const k of keys) {
        const f = r.fields[k];
        if (f.ref && data[k] && !(await L.inBook(f.ref, b, data[k]))) throw notFound(f.ref.slice(0, -1).replace(/^./, ch => ch.toUpperCase()));
      }
    };

    app.get(url, async c => {
      const b = c.req.param('b');
      const withArchived = c.req.query('all') === '1';
      const hide = r.archive && !withArchived ? ` AND ${r.archive} = ${r.archiveValue === 0 ? 1 : 0}` : '';
      if (path === 'funds') {
        const rows = await L.all(
          `SELECT f.*, COALESCE((SELECT SUM(CASE WHEN e.direction = 'cr' THEN e.amount ELSE -e.amount END)
             FROM entries e WHERE e.fund_id = f.id AND e.book_id = f.book_id AND e.deleted_at IS NULL AND e.exclude = 0), 0) AS balance
           FROM funds f WHERE f.book_id = ?${hide.replace('archived', 'f.archived')} ORDER BY f.name`, b);
        return c.json(rows.map(row => ({ ...map(row), balance: row.balance })));
      }
      const rows = await L.all(`SELECT * FROM ${r.table} WHERE book_id = ?${hide} ORDER BY name`, b);
      return c.json(rows.map(map));
    });

    // A fund that still holds money cannot be archived: its balance would drop out of the total.
    // Memo funds are tracked only and never count in the total, so they can be archived with a balance.
    const assertFundEmpty = async (b, fundId, kind) => {
      if (kind === 'memo') return;
      const row = await L.first(
        `SELECT COALESCE(SUM(CASE WHEN direction = 'cr' THEN amount ELSE -amount END), 0) AS bal
         FROM entries WHERE book_id = ? AND fund_id = ? AND deleted_at IS NULL AND exclude = 0`, b, fundId);
      if (row && row.bal !== 0) throw new AppError('Fund still has a balance; move it to another fund before archiving', 409);
    };

    app.post(url, async c => {
      need(c, r.role);
      const b = c.req.param('b');
      const data = parse(schema, c.get('body'));
      for (const k of r.required) if (data[k] === undefined) parse(z.object({ [k]: r.fields[k].zod }), {});
      await checkRefs(b, data);
      if (r.fields.currency && data.currency !== undefined) await repo.currencies.assertUsable(data.currency);
      const merged = { ...r.defaults, ...data };
      if (r.fields.currency && data.currency === undefined) merged.currency = await L.baseCurrency(b);
      if (path === 'funds' && data.isReserved === undefined && merged.kind === 'reserved') merged.isReserved = true;
      const cols = keys.filter(k => merged[k] !== undefined);
      const newId = crypto.randomUUID();
      try {
        await L.run(
          `INSERT INTO ${r.table} (id, book_id, ${cols.map(k => r.fields[k].col).join(', ')}) VALUES (?, ?, ${cols.map(() => '?').join(', ')})`,
          newId, b, ...cols.map(k => toDb(r.fields[k], merged[k]))
        ).run();
      } catch (error) { L.uniqueToConflict(error); }
      return c.json(map(await L.inBook(r.table, b, newId)), 201);
    });

    app.put(`${url}/:id`, async c => {
      need(c, r.role);
      const b = c.req.param('b');
      const existing = await L.inBook(r.table, b, c.req.param('id'));
      if (!existing) throw notFound(r.label);
      const data = parse(schema, c.get('body'));
      await checkRefs(b, data);
      if (r.fields.currency && data.currency !== undefined && data.currency !== existing.currency) await repo.currencies.assertUsable(data.currency);
      if (path === 'funds' && data.currency && data.currency !== existing.currency) {
        const used = await L.first('SELECT 1 AS x FROM entries WHERE fund_id = ? AND book_id = ? LIMIT 1', existing.id, b);
        if (used) throw new AppError('Cannot change the currency of a fund that has entries', 409);
      }
      if (path === 'funds' && data.archived === true && !existing.archived) await assertFundEmpty(b, existing.id, existing.kind);
      if (path === 'categories' && data.parentId === existing.id) throw new AppError('A category cannot be its own parent', 400);
      if (path === 'categories' && data.parentId) {
        // Walk up from the new parent; reaching this category would make a cycle.
        const seen = new Set();
        for (let cur = data.parentId; cur && !seen.has(cur);) {
          if (cur === existing.id) throw new AppError('That parent would create a cycle', 400);
          seen.add(cur);
          cur = (await L.inBook('categories', b, cur))?.parent_id;
        }
      }
      if (path === 'categories' && isSystemCategory(existing) && data.name !== undefined
        && data.name.trim().toLowerCase() !== String(existing.name).trim().toLowerCase()) throw new AppError('System category', 409);
      const cols = keys.filter(k => data[k] !== undefined);
      if (cols.length) {
        try {
          await L.run(
            `UPDATE ${r.table} SET ${cols.map(k => `${r.fields[k].col} = ?`).join(', ')} WHERE id = ? AND book_id = ?`,
            ...cols.map(k => toDb(r.fields[k], data[k])), existing.id, b
          ).run();
        } catch (error) { L.uniqueToConflict(error); }
      }
      return c.json(map(await L.inBook(r.table, b, existing.id)));
    });

    app.delete(`${url}/:id`, async c => {
      need(c, r.role);
      const b = c.req.param('b');
      const existing = await L.inBook(r.table, b, c.req.param('id'));
      if (!existing) throw notFound(r.label);
      if (path === 'categories') {
        if (isSystemCategory(existing)) throw new AppError('System category', 409);
        const used = await L.first('SELECT 1 AS x FROM entries WHERE category_id = ? AND book_id = ? AND deleted_at IS NULL LIMIT 1', existing.id, b);
        if (used) throw new AppError('Category is used by entries', 409);
        await L.batch([
          L.run('UPDATE categories SET parent_id = NULL WHERE parent_id = ? AND book_id = ?', existing.id, b),
          L.run('DELETE FROM categories WHERE id = ? AND book_id = ?', existing.id, b)
        ]);
      } else {
        if (path === 'funds') await assertFundEmpty(b, existing.id, existing.kind);
        await L.run(`UPDATE ${r.table} SET ${r.archive} = ? WHERE id = ? AND book_id = ?`, r.archiveValue ?? 1, existing.id, b).run();
      }
      return c.json({ success: true });
    });
  }
};

module.exports = { registerMasterRoutes };
