// Item tracker queries: items and reusable locations, always scoped by book_id.
const mapLocation = r => ({ id: r.id, name: r.name, place: r.place, itemCount: r.item_count ?? 0, createdAt: r.created_at ?? null, updatedAt: r.updated_at ?? null });
// One item as seen from `viewBook`: ledgerIds lists the main ledger first, then the extra ones it is shared with.
const mapItem = (r, view = {}) => {
  const extras = view.extras || [];
  const names = view.names || {};
  const ledgerIds = [r.book_id, ...extras];
  const main = view.viewBook === undefined || view.viewBook === r.book_id;
  return {
    id: r.id, name: r.name, comment: r.comment, locationId: r.location_id, locationName: r.location_name,
    place: r.place, owner: r.owner, createdAt: r.created_at ?? null, updatedAt: r.updated_at ?? null,
    mainLedgerId: r.book_id, ledgerIds, ledgerNames: ledgerIds.map(x => names[x] || x),
    sharedFrom: main ? null : (names[r.book_id] || r.book_id)
  };
};

// The location is joined by id alone: a shared item shows its main ledger's location in every ledger.
const ITEM_SELECT = `SELECT i.*, l.name AS location_name, l.place AS place
  FROM items i LEFT JOIN item_locations l ON l.id = i.location_id`;
// An item is reachable through its main ledger or a ledger it is shared with.
const REACH = '(i.book_id = ? OR EXISTS (SELECT 1 FROM item_ledgers x WHERE x.item_id = i.id AND x.book_id = ?))';

// What an access-code session may see of an item: only ledgers the code can itself open are ever listed or named. The main
// ledger shown is the real one if the code can open it, else the first of the item's ledgers it can open; "from" only when the
// real main ledger is one it can open.
const forAccessCode = (item, account) => {
  if (!account || !account.accessCode) return item;
  const mine = new Set((account.memberships || []).map(m => m.bookId));
  const keep = item.ledgerIds.map((id, i) => ({ id, name: item.ledgerNames[i] })).filter(x => mine.has(x.id));
  const mainOpen = mine.has(item.mainLedgerId);
  return { ...item, mainLedgerId: mainOpen ? item.mainLedgerId : (keep[0]?.id ?? null), ledgerIds: keep.map(x => x.id), ledgerNames: keep.map(x => x.name), sharedFrom: mainOpen ? item.sharedFrom : null };
};

const createItemsRepo = ledger => {
  const decorate = async (rows, viewBook) => {
    if (!rows.length) return [];
    const ids = rows.map(r => r.id);
    const links = new Map();
    for (let n = 0; n < ids.length; n += 50) {
      const part = ids.slice(n, n + 50);
      const got = await ledger.all(`SELECT item_id, book_id FROM item_ledgers WHERE item_id IN (${part.map(() => '?').join(',')}) ORDER BY created_at, book_id`, ...part);
      for (const g of got) links.set(g.item_id, [...(links.get(g.item_id) || []), g.book_id]);
    }
    const names = Object.fromEntries((await ledger.all('SELECT id, name FROM books')).map(b => [b.id, b.name]));
    return rows.map(r => mapItem(r, { viewBook, extras: links.get(r.id) || [], names }));
  };
  return {
  mapItem, mapLocation, forAccessCode,

  async listItems(bookId) {
    return decorate(await ledger.all(`${ITEM_SELECT} WHERE ${REACH} ORDER BY LOWER(i.name), i.id`, bookId, bookId), bookId);
  },
  async getItem(bookId, id) {
    const r = await ledger.first(`${ITEM_SELECT} WHERE i.id = ? AND ${REACH}`, id, bookId, bookId);
    return r ? (await decorate([r], bookId))[0] : null;
  },
  async bookIdsExisting(ids) {
    if (!ids.length) return [];
    return (await ledger.all(`SELECT id FROM books WHERE id IN (${ids.map(() => '?').join(',')})`, ...ids)).map(r => r.id);
  },
  // Replaces the extra ledgers of an item (the main ledger is never stored here).
  async setExtraLedgers(itemId, bookIds, now) {
    await ledger.run('DELETE FROM item_ledgers WHERE item_id = ?', itemId).run();
    for (const b of bookIds) await ledger.run('INSERT INTO item_ledgers (item_id, book_id, created_at) VALUES (?, ?, ?)', itemId, b, now).run();
  },
  async insertItem(bookId, id, d, now) {
    await ledger.run(
      'INSERT INTO items (id, book_id, name, comment, location_id, owner, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      id, bookId, d.name, d.comment ?? null, d.locationId ?? null, d.owner ?? null, now).run();
  },
  // cols: { column: value } using real column names; always bumps updated_at.
  async updateItem(bookId, id, cols, now) {
    const keys = Object.keys(cols);
    await ledger.run(`UPDATE items SET ${keys.map(k => `${k} = ?`).join(', ')}${keys.length ? ', ' : ''}updated_at = ? WHERE id = ? AND book_id = ?`,
      ...keys.map(k => cols[k]), now, id, bookId).run();
  },
  async deleteItem(bookId, id) {
    await ledger.run('DELETE FROM item_ledgers WHERE item_id = ?', id).run();
    await ledger.run('DELETE FROM items WHERE id = ? AND book_id = ?', id, bookId).run();
  },

  async listLocations(bookId) {
    return (await ledger.all(
      `SELECT l.*, (SELECT COUNT(*) FROM items i WHERE i.location_id = l.id AND i.book_id = l.book_id) AS item_count
       FROM item_locations l WHERE l.book_id = ? ORDER BY LOWER(l.name), l.id`, bookId)).map(mapLocation);
  },
  async locationByName(bookId, name) {
    return ledger.first('SELECT * FROM item_locations WHERE book_id = ? AND LOWER(name) = LOWER(?)', bookId, name);
  },
  async getLocation(bookId, id) {
    const r = await ledger.first('SELECT * FROM item_locations WHERE id = ? AND book_id = ?', id, bookId);
    return r ? mapLocation(r) : null;
  },
  async insertLocation(bookId, id, d) {
    await ledger.run('INSERT INTO item_locations (id, book_id, name, place) VALUES (?, ?, ?, ?)', id, bookId, d.name, d.place ?? null).run();
  },
  async updateLocation(bookId, id, cols) {
    const keys = Object.keys(cols);
    if (!keys.length) return;
    await ledger.run(`UPDATE item_locations SET ${keys.map(k => `${k} = ?`).join(', ')} WHERE id = ? AND book_id = ?`,
      ...keys.map(k => cols[k]), id, bookId).run();
  },
  async locationInUse(bookId, id) {
    return (await ledger.first('SELECT COUNT(*) AS n FROM items WHERE book_id = ? AND location_id = ?', bookId, id)).n;
  },
  async deleteLocation(bookId, id) {
    await ledger.run('DELETE FROM item_locations WHERE id = ? AND book_id = ?', id, bookId).run();
  }
  };
};

module.exports = { createItemsRepo };
