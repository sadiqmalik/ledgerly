// Item tracker: items (name, comment, location, owner text, automatic updated time) and the reusable
// locations they use. Reads need viewer; writes need editor. Everything is scoped to the book.
const { ConflictError, AppError, ForbiddenError } = require('../../server/errors');
const { z, parse, id, need, notFound } = require('./validate');
const { canAccess } = require('../../server/auth/roles');
const { forBook, hasResource } = require('../../server/auth/resources');

const text = max => z.string().trim().max(max);
const itemFields = { name: text(200).min(1), comment: text(4000).nullable(), locationId: id.nullable(), owner: text(200).nullable() };
const extraIds = z.array(id).max(50);
const itemCreate = z.object({ ...itemFields, comment: itemFields.comment.optional(), locationId: itemFields.locationId.optional(), owner: itemFields.owner.optional(), extraLedgerIds: extraIds.optional() }).strict();
const itemUpdate = z.object({ ...Object.fromEntries(Object.entries(itemFields).map(([k, v]) => [k, v.optional()])), extraLedgerIds: extraIds.optional(), moveToLedgerId: id.optional() }).strict();
const locFields = { name: text(120).min(1), place: text(120).nullable() };
const locCreate = z.object({ ...locFields, place: locFields.place.optional() }).strict();
const locUpdate = z.object({ name: locFields.name.optional(), place: locFields.place.optional() }).strict();
const ITEM_COLS = { name: 'name', comment: 'comment', locationId: 'location_id', owner: 'owner' };

const blank = v => (v === '' ? null : v);

const registerItemRoutes = (app, { repo }) => {
  const R = repo.items;
  const items = '/api/books/:b/items';
  const locs = '/api/books/:b/item-locations';
  const now = () => new Date().toISOString();

  // The location must belong to this same book.
  const checkRefs = async (b, d) => {
    if (d.locationId && !(await R.getLocation(b, d.locationId))) throw notFound('Location');
  };
  const checkName = async (b, name, selfId) => {
    const dup = await R.locationByName(b, name);
    if (dup && dup.id !== selfId) throw new ConflictError('A location with this name already exists');
  };

  // May this account link an item to ledger `x`? Editor there and the Item Vault page there (a super admin: always).
  const mayLink = (account, x) => account.isSuperAdmin || (canAccess(account, x, 'editor') && hasResource(forBook(account, x), 'items'));
  // The extra ledgers to store: the requested ones (each must be linkable and exist), plus any existing link the person cannot manage.
  const resolveExtras = async (c, main, requested, existing = []) => {
    const account = c.get('account');
    const want = [...new Set(requested)];
    if (want.includes(main)) throw new AppError('The main ledger is already shown; pick other ledgers', 400);
    for (const x of want) if (!mayLink(account, x)) throw new ForbiddenError('You need the Editor role and the Item Vault page in each ledger you add');
    const found = await R.bookIdsExisting(want);
    if (found.length !== want.length) throw notFound('Ledger');
    return [...existing.filter(x => !mayLink(account, x) && !want.includes(x)), ...want];
  };

  app.get(items, async c => c.json((await R.listItems(c.req.param('b'))).map(i => R.forAccessCode(i, c.get('account')))));

  app.post(items, async c => {
    need(c, 'editor');
    const b = c.req.param('b');
    const d = parse(itemCreate, c.get('body'));
    d.comment = blank(d.comment);
    d.owner = blank(d.owner);
    await checkRefs(b, d);
    const newId = crypto.randomUUID();
    const extras = d.extraLedgerIds ? await resolveExtras(c, b, d.extraLedgerIds) : [];
    delete d.extraLedgerIds;
    await R.insertItem(b, newId, d, now());
    if (extras.length) await R.setExtraLedgers(newId, extras, now());
    return c.json(await R.getItem(b, newId), 201);
  });

  app.put(`${items}/:id`, async c => {
    need(c, 'editor');
    const b = c.req.param('b');
    const cur = await R.getItem(b, c.req.param('id'));
    if (!cur) throw notFound('Item');
    const isMain = cur.mainLedgerId === b;
    if (!isMain) throw new AppError(`This item is shared from ${cur.sharedFrom}. Edit it there.`, 409);
    const d = parse(itemUpdate, c.get('body'));
    if (!isMain && d.locationId !== undefined && d.locationId !== cur.locationId) throw new AppError("Change the location in the item's main ledger", 409);
    if (!isMain && d.extraLedgerIds !== undefined) throw new AppError("Change the ledgers in the item's main ledger", 409);
    const target = d.moveToLedgerId;
    if (target !== undefined) {
      if (!isMain) throw new AppError("Move the item from its main ledger (it is shared into this one)", 409);
      if (target === b) throw new AppError('The item is already in this ledger', 400);
      const acct = c.get('account');
      if (!acct.isSuperAdmin && !(canAccess(acct, b, 'admin') && canAccess(acct, target, 'admin') && hasResource(forBook(acct, target), 'items'))) throw new ForbiddenError('Moving an item needs the Admin role in both ledgers and the Item Vault page in the new one');
      if (!(await R.bookIdsExisting([target])).length) throw notFound('Ledger');
    }
    const locBook = target !== undefined ? target : b;
    if (isMain) await checkRefs(locBook, d);
    const wasExtras = cur.ledgerIds.slice(1).filter(x => x !== target);
    let extras = null;
    if (d.extraLedgerIds !== undefined) extras = await resolveExtras(c, target !== undefined ? target : b, d.extraLedgerIds.filter(x => x !== target), wasExtras);
    else if (target !== undefined) extras = wasExtras;
    delete d.extraLedgerIds;
    delete d.moveToLedgerId;
    if (!isMain) delete d.locationId;
    const cols = {};
    for (const [k, v] of Object.entries(d)) if (v !== undefined) cols[ITEM_COLS[k]] = k === 'comment' || k === 'owner' ? blank(v) : v;
    if (target !== undefined) { cols.book_id = target; cols.location_id = d.locationId || null; }
    await R.updateItem(cur.mainLedgerId, c.req.param('id'), cols, now());
    if (extras) await R.setExtraLedgers(c.req.param('id'), extras, now());
    return c.json(await R.getItem(target !== undefined ? target : b, c.req.param('id')));
  });

  app.delete(`${items}/:id`, async c => {
    need(c, 'editor');
    const b = c.req.param('b');
    const cur = await R.getItem(b, c.req.param('id'));
    if (!cur) throw notFound('Item');
    if (cur.mainLedgerId !== b) throw new AppError(`This item is shared from ${cur.sharedFrom}. Edit it there.`, 409);
    await R.deleteItem(b, c.req.param('id'));
    return c.json({ success: true });
  });

  app.get(locs, async c => c.json(await R.listLocations(c.req.param('b'))));

  app.post(locs, async c => {
    need(c, 'editor');
    const b = c.req.param('b');
    const d = parse(locCreate, c.get('body'));
    d.place = blank(d.place);
    await checkName(b, d.name);
    const newId = crypto.randomUUID();
    await R.insertLocation(b, newId, d);
    return c.json(await R.getLocation(b, newId), 201);
  });

  app.put(`${locs}/:id`, async c => {
    need(c, 'editor');
    const b = c.req.param('b');
    if (!(await R.getLocation(b, c.req.param('id')))) throw notFound('Location');
    const d = parse(locUpdate, c.get('body'));
    if (d.name !== undefined) await checkName(b, d.name, c.req.param('id'));
    const cols = {};
    if (d.name !== undefined) cols.name = d.name;
    if (d.place !== undefined) cols.place = blank(d.place);
    await R.updateLocation(b, c.req.param('id'), cols);
    return c.json((await R.listLocations(b)).find(l => l.id === c.req.param('id')));
  });

  app.delete(`${locs}/:id`, async c => {
    need(c, 'editor');
    const b = c.req.param('b');
    if (!(await R.getLocation(b, c.req.param('id')))) throw notFound('Location');
    if (await R.locationInUse(b, c.req.param('id'))) throw new ConflictError('Location is used by items; move or delete them first');
    await R.deleteLocation(b, c.req.param('id'));
    return c.json({ success: true });
  });
};

module.exports = { registerItemRoutes };
