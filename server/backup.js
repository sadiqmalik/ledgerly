// Nightly job logic, kept free of Worker globals so it can be tested with a fake R2 ({put, list, delete}).
const KEEP_BACKUPS = 30;
const BACKUP_EVERY_DAYS = 10;
const DAY_MS = 86400000;

// Whole days between two YYYY-MM-DD strings (UTC calendar days).
const daysBetween = (from, to) => (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS;

// Lists every key under a prefix (R2 returns at most 1000 per call).
const listAll = async (bucket, prefix) => {
  const keys = [];
  let cursor;
  do {
    const page = await bucket.list({ prefix, cursor });
    keys.push(...page.objects.map(o => o.key));
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
  return keys;
};

// Keeps the newest `keep` files of one book. Names are YYYY-MM-DD.json, so they sort by date.
const pruneBackups = async (bucket, bookId, keep = KEEP_BACKUPS, root = 'backups') => {
  const keys = (await listAll(bucket, `${root}/${bookId}/`)).sort();
  const stale = keys.slice(0, Math.max(0, keys.length - keep));
  for (const key of stale) await bucket.delete(key);
  return stale.length;
};

// repo needs: listBooks(), exportRepo.exportBook(id, now), authStore.purgeExpiredSessions(now).
// The cron runs daily; a book is only backed up when its newest file is at least `everyDays` old.
// One book failing is recorded and the others still run; the sessions purge always runs.
const runNightly = async ({ repo, bucket, now = new Date(), keep = KEEP_BACKUPS, everyDays = BACKUP_EVERY_DAYS, log = console.log }) => {
  const day = now.toISOString().slice(0, 10);
  const errors = [];
  let backedUp = 0;
  let pruned = 0;
  let purged = 0;
  const books = await repo.listBooks();
  for (const book of books) {
    try {
      const keys = (await listAll(bucket, `backups/${book.id}/`)).sort();
      const newest = keys.length ? keys[keys.length - 1].split('/').pop().slice(0, 10) : null;
      if (!newest || daysBetween(newest, day) >= everyDays) {
        const data = await repo.exportRepo.exportBook(book.id, now);
        if (data) { // null when the book was deleted while the job ran
          await bucket.put(`backups/${book.id}/${day}.json`, JSON.stringify(data), { httpMetadata: { contentType: 'application/json' } });
          backedUp += 1;
        }
      }
      pruned += await pruneBackups(bucket, book.id, keep);
    } catch (error) {
      errors.push(`${book.id}: ${error.message}`);
    }
  }
  // Loan registers: same interval and keep rule, under loans/<registerId>/.
  let registers = 0;
  try {
    const ids = repo.loans ? await repo.loans.listRegisterIds() : [];
    registers = ids.length;
    for (const id of ids) {
      try {
        const keys = (await listAll(bucket, `loans/${id}/`)).sort();
        const newest = keys.length ? keys[keys.length - 1].split('/').pop().slice(0, 10) : null;
        if (!newest || daysBetween(newest, day) >= everyDays) {
          const data = await repo.loans.exportRegister(id, now);
          if (data) {
            await bucket.put(`loans/${id}/${day}.json`, JSON.stringify(data), { httpMetadata: { contentType: 'application/json' } });
            backedUp += 1;
          }
        }
        pruned += await pruneBackups(bucket, id, keep, 'loans');
      } catch (error) {
        errors.push(`loans/${id}: ${error.message}`);
      }
    }
  } catch (error) {
    errors.push(`loans: ${error.message}`);
  }
  try {
    purged = await repo.authStore.purgeExpiredSessions(now);
  } catch (error) {
    errors.push(`sessions: ${error.message}`);
  }
  log(`nightly ${day}: backed up ${backedUp}/${books.length + registers} books and loan registers (every ${everyDays} days), pruned ${pruned} files, purged ${purged} sessions, ${errors.length ? `errors: ${errors.join('; ')}` : 'no errors'}`);
  if (errors.length) throw new Error(`Nightly job failed for ${errors.length} item(s): ${errors.join('; ')}`);
  return { day, backedUp, pruned, purged };
};

module.exports = { runNightly, pruneBackups, listAll, KEEP_BACKUPS };
