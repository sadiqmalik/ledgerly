// Item tracker queries: items and reusable locations, always scoped by book_id.
const mapLocation = r => ({ id: r.id, name: r.name, place: r.place, itemCount: r.item_count ?? 0, createdAt: r.created_at ?? null, updatedAt: r.updated_at ?? null });
const mapItem = r => ({
  id: r.id, name: r.name, comment: r.comment, locationId: r.location_id, locationName: r.location_name,
  place: r.place, owner: r.owner, createdAt: r.created_at ?? null, updatedAt: r.updated_at ?? null
});

const ITEM_SELECT = `SELECT i.*, l.name AS location_name, l.place AS place
  FROM items i LEFT JOIN item_locations l ON l.id = i.location_id AND l.book_id = i.book_id`;

const createItemsRepo = ledger => ({
  mapItem, mapLocation,

  async listItems(bookId) {
    return (await ledger.all(`${ITEM_SELECT} WHERE i.book_id = ? ORDER BY LOWER(i.name), i.id`, bookId)).map(mapItem);
  },
  async getItem(bookId, id) {
    const r = await ledger.first(`${ITEM_SELECT} WHERE i.id = ? AND i.book_id = ?`, id, bookId);
    return r ? mapItem(r) : null;
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
});

module.exports = { createItemsRepo };
