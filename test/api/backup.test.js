const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { makeFakeR2, makeContext } = require('./helpers');
const { runNightly, pruneBackups } = require('../../server/backup');

describe('nightly backup', () => {
  it('keeps the newest 30 backups per book', async () => {
    const bucket = makeFakeR2();
    for (let d = 1; d <= 40; d++) await bucket.put(`backups/family/2026-01-${String(d).padStart(2, '0')}.json`, '{}');
    for (let d = 1; d <= 3; d++) await bucket.put(`backups/personal/2026-01-0${d}.json`, '{}');
    assert.equal(await pruneBackups(bucket, 'family', 30), 10);
    const left = (await bucket.list({ prefix: 'backups/family/' })).objects.map(o => o.key);
    assert.equal(left.length, 30);
    assert.equal(left[0], 'backups/family/2026-01-11.json');
    assert.equal((await bucket.list({ prefix: 'backups/personal/' })).objects.length, 3);
  });

  it('prunes across list pages', async () => {
    const bucket = makeFakeR2();
    const origList = bucket.list;
    bucket.list = ({ prefix, cursor }) => origList({ prefix, cursor, limit: 7 });
    for (let d = 1; d <= 35; d++) await bucket.put(`backups/family/2026-02-${String(d).padStart(2, '0')}.json`, '{}');
    assert.equal(await pruneBackups(bucket, 'family', 30), 5);
    assert.equal((await origList({ prefix: 'backups/family/' })).objects.length, 30);
  });

  it('writes one file per book and purges expired sessions', async () => {
    const ctx = await makeContext();
    try {
      await ctx.d1.prepare("INSERT INTO sessions (id, account_id, created_at, last_seen_at, expires_at, absolute_expires_at) VALUES ('old', 'x', '2020-01-01T00:00:00.000Z', '2020-01-01T00:00:00.000Z', '2020-01-02T00:00:00.000Z', '2020-01-08T00:00:00.000Z')").run();
      const bucket = makeFakeR2();
      for (let d = 1; d <= 30; d++) await bucket.put(`backups/family/2026-01-${String(d).padStart(2, '0')}.json`, '{}');
      const out = await runNightly({ repo: ctx.repo, bucket, now: new Date('2026-04-05T02:00:00Z'), log: () => {} });
      assert.equal(out.day, '2026-04-05');
      assert.equal(out.backedUp, 2);
      assert.equal(out.pruned, 1);
      assert.ok(out.purged >= 1);
      assert.ok(bucket.store.has('backups/personal/2026-04-05.json'));
      const saved = JSON.parse(new TextDecoder().decode(bucket.store.get('backups/family/2026-04-05.json').bytes));
      assert.equal(saved.format, 'ledger-backup');
      assert.equal(saved.book.id, 'family');
      assert.ok(!bucket.store.has('backups/family/2026-01-01.json'));
      assert.equal((await ctx.d1.prepare("SELECT COUNT(*) AS n FROM sessions WHERE id = 'old'").first()).n, 0);
    } finally { await ctx.close(); }
  });

  it('backs up a book only when its newest backup is 10 or more days old', async () => {
    const repo = {
      listBooks: async () => [{ id: 'family' }],
      exportRepo: { exportBook: async id => ({ format: 'ledger-backup', book: { id } }) },
      authStore: { purgeExpiredSessions: async () => 0 }
    };
    const bucket = makeFakeR2();
    await bucket.put('backups/family/2026-04-01.json', '{}');
    const nineDays = await runNightly({ repo, bucket, now: new Date('2026-04-10T02:00:00Z'), log: () => {} });
    assert.equal(nineDays.backedUp, 0);
    assert.ok(!bucket.store.has('backups/family/2026-04-10.json'));
    const tenDays = await runNightly({ repo, bucket, now: new Date('2026-04-11T02:00:00Z'), log: () => {} });
    assert.equal(tenDays.backedUp, 1);
    assert.ok(bucket.store.has('backups/family/2026-04-11.json'));
  });

  it('keeps going when one book fails, then reports it', async () => {
    const bucket = makeFakeR2();
    const repo = {
      listBooks: async () => [{ id: 'a' }, { id: 'b' }],
      exportRepo: { exportBook: async id => { if (id === 'a') throw new Error('boom'); return { id }; } },
      authStore: { purgeExpiredSessions: async () => 0 }
    };
    await assert.rejects(runNightly({ repo, bucket, log: () => {} }), /a: boom/);
    assert.ok([...bucket.store.keys()].some(k => k.startsWith('backups/b/')));
  });

  it('backs up loan registers under loans/<id>/ on the same interval and keeps 30', async () => {
    const ctx = await makeContext();
    try {
      const reg = (await ctx.api.post('/api/loans').send({ name: 'R', borrower: 'B', lender: 'L' }).expect(201)).body;
      await ctx.api.post(`/api/loans/${reg.id}/entries`).send({ kind: 'taken', amount: 500, date: '2026-04-01' }).expect(201);
      const bucket = makeFakeR2();
      const out = await runNightly({ repo: ctx.repo, bucket, now: new Date('2026-04-05T02:00:00Z'), log: () => {} });
      assert.equal(out.backedUp, 3);
      const saved = JSON.parse(new TextDecoder().decode(bucket.store.get(`loans/${reg.id}/2026-04-05.json`).bytes));
      assert.equal(saved.register.id, reg.id);
      assert.equal(saved.entries.length, 1);
      assert.equal(saved.entries[0].amount, 500);
      const early = await runNightly({ repo: ctx.repo, bucket, now: new Date('2026-04-14T02:00:00Z'), log: () => {} });
      assert.equal(early.backedUp, 0);
      assert.ok(!bucket.store.has(`loans/${reg.id}/2026-04-14.json`));
      const due = await runNightly({ repo: ctx.repo, bucket, now: new Date('2026-04-15T02:00:00Z'), log: () => {} });
      assert.equal(due.backedUp, 3);
      for (let d = 1; d <= 40; d++) await bucket.put(`loans/${reg.id}/2025-01-${String(d).padStart(2, '0')}.json`, '{}');
      await runNightly({ repo: ctx.repo, bucket, now: new Date('2026-05-30T02:00:00Z'), log: () => {} });
      assert.equal((await bucket.list({ prefix: `loans/${reg.id}/` })).objects.length, 30);
    } finally { await ctx.close(); }
  });
});
