// Ids of entries that cancel each other: opposite direction with the same fund, amount, category, project and comment.
export function refundedIds(rows) {
  const groups = new Map();
  for (const e of rows || []) {
    if (e.linkId) continue;
    const k = [e.fundId, e.amount, e.categoryId || '', e.projectId || '', e.comment || ''].join('|');
    if (!groups.has(k)) groups.set(k, { dr: [], cr: [] });
    groups.get(k)[e.direction]?.push(e.id);
  }
  const ids = new Set();
  for (const g of groups.values()) {
    const n = Math.min(g.dr.length, g.cr.length);
    g.dr.slice(0, n).forEach(i => ids.add(i));
    g.cr.slice(0, n).forEach(i => ids.add(i));
  }
  return ids;
}
