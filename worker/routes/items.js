// Item tracker: items (name, comment, location, owner text, automatic updated time) and the reusable
// locations they use. Reads need viewer; writes need editor. Everything is scoped to the book.
const { ConflictError } = require('../../server/errors');
const { z, parse, id, need, notFound } = require('./validate');

const text = max => z.string().trim().max(max);
const itemFields = { name: text(200).min(1), comment: text(4000).nullable(), locationId: id.nullable(), owner: text(200).nullable() };
const itemCreate = z.object({ ...itemFields, comment: itemFields.comment.optional(), locationId: itemFields.locationId.optional(), owner: itemFields.owner.optional() }).strict();
const itemUpdate = z.object(Object.fromEntries(Object.entries(itemFields).map(([k, v]) => [k, v.optional()]))).strict();
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

  app.get(items, async c => c.json(await R.listItems(c.req.param('b'))));

  app.post(items, async c => {
    need(c, 'editor');
    const b = c.req.param('b');
    const d = parse(itemCreate, c.get('body'));
    d.comment = blank(d.comment);
    d.owner = blank(d.owner);
    await checkRefs(b, d);
    const newId = crypto.randomUUID();
    await R.insertItem(b, newId, d, now());
    return c.json(await R.getItem(b, newId), 201);
  });

  app.put(`${items}/:id`, async c => {
    need(c, 'editor');
    const b = c.req.param('b');
    if (!(await R.getItem(b, c.req.param('id')))) throw notFound('Item');
    const d = parse(itemUpdate, c.get('body'));
    await checkRefs(b, d);
    const cols = {};
    for (const [k, v] of Object.entries(d)) if (v !== undefined) cols[ITEM_COLS[k]] = k === 'comment' || k === 'owner' ? blank(v) : v;
    await R.updateItem(b, c.req.param('id'), cols, now());
    return c.json(await R.getItem(b, c.req.param('id')));
  });

  app.delete(`${items}/:id`, async c => {
    need(c, 'editor');
    const b = c.req.param('b');
    if (!(await R.getItem(b, c.req.param('id')))) throw notFound('Item');
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
    return c.json({ id: newId, name: d.name, place: d.place ?? null, itemCount: 0 }, 201);
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
