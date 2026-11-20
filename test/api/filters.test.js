const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { makeContext, BOOK } = require('./helpers');

const U = `/api/books/${BOOK}`;
let n = 0;

describe('entries filters and carry-forward openings', () => {
  let ctx;
  const q = async params => (await ctx.api.get(`${U}/entries?${params}`));
  const ok = async params => { const r = await q(params); assert.equal(r.status, 200, JSON.stringify(r.body)); return r.body; };

  beforeEach(async () => {
    ctx = await makeContext();
    const d = ctx.d1;
    const fund = (id, cur, kind) => d.prepare('INSERT INTO funds (id, book_id, name, is_reserved, currency, kind) VALUES (?,?,?,?,?,?)').bind(id, BOOK, id, kind === 'reserved' ? 1 : 0, cur, kind);
    const ent = (date, fundId, dir, amount, x = {}) => {
      n += 1;
      const cur = { usd: 'USD' }[fundId] || 'PKR';
      return d.prepare(
        `INSERT INTO entries (id, book_id, date, fund_id, direction, amount, currency, party_id, category_id, comment, status, exclude, link_id, created_by, created_at, updated_at, deleted_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
      ).bind(`e${n}`, BOOK, date, fundId, dir, amount, cur, x.party ?? null, x.cat ?? null, x.comment ?? null, x.status ?? 'paid',
        x.exclude ?? 0, x.link ?? null, 'u', `2026-01-01T00:00:${String(n).padStart(2, '0')}Z`, 'n', x.deleted ?? null);
    };
    await d.batch([
      fund('checking', 'PKR', 'general'), fund('special', 'PKR', 'reserved'), fund('usd', 'USD', 'general'), fund('memo', 'PKR', 'memo'),
      d.prepare("INSERT INTO parties (id, book_id, name) VALUES ('p1', ?, 'Ali')").bind(BOOK),
      d.prepare("INSERT INTO categories (id, book_id, name, default_direction) VALUES ('c1', ?, 'Food', 'dr')").bind(BOOK),
      d.prepare("INSERT INTO categories (id, book_id, name, default_direction) VALUES ('c2', ?, 'Gift', 'dr')").bind(BOOK),
      ent('2024-03-01', 'checking', 'cr', 10000), ent('2024-06-01', 'checking', 'dr', 3000, { party: 'p1', cat: 'c1' }),
      ent('2024-07-01', 'special', 'cr', 5000), ent('2024-08-01', 'memo', 'cr', 777), ent('2024-09-01', 'usd', 'cr', 100),
      ent('2024-10-01', 'checking', 'cr', 999, { exclude: 1 }), ent('2024-11-01', 'checking', 'cr', 555, { deleted: 'x' }),
      ent('2025-02-01', 'checking', 'dr', 1000, { cat: 'c2' }), ent('2025-05-01', 'special', 'dr', 500, { party: 'p1', status: 'pending' }),
      ent('2025-12-31', 'usd', 'dr', 40, { link: 'L1' }), ent('2025-12-31', 'checking', 'cr', 2000, { comment: 'Salary' }),
      ent('2026-01-10', 'checking', 'dr', 200, { cat: 'c1' }), ent('2026-02-10', 'special', 'cr', 300, { party: 'p1' }),
      ent('2026-03-10', 'memo', 'dr', 50)
    ]);
  });
  afterEach(async () => { await ctx.close(); });

  it('keeps single values and the response shape', async () => {
    const b = await ok('year=2025');
    assert.deepEqual(Object.keys(b).sort(), ['count', 'page', 'pageSize', 'rows', 'totals', 'totalsByCurrency']);
    assert.equal(b.count, 4);
    assert.deepEqual(b.totals, { cr: 2000, dr: 1500, net: 500 });
    assert.equal((await ok('fund=checking')).count, 7 - 1);
    assert.equal((await ok('')).rows[0].date, '2026-02-10');
    assert.deepEqual([(await ok('')).rows.filter(r => r.fundId === 'memo').length, (await ok('kind=memo')).rows.filter(r => r.fundId === 'memo').length], [0, 2]);
  });
  it('lists a memo-fund project\'s entries when that project is selected', async () => {
    await ctx.d1.batch([
      ctx.d1.prepare("INSERT INTO projects (id, book_id, name, kind, fund_id, status) VALUES ('pm', ?, 'Memo project', 'medical', 'memo', 'open')").bind(BOOK),
      ctx.d1.prepare("UPDATE entries SET project_id = 'pm' WHERE fund_id = 'memo'")
    ]);
    const b = await ok('project=pm');
    assert.equal(b.count, 2);
    assert.deepEqual(b.totals, { cr: 777, dr: 50, net: 727 });
    assert.equal((await ok('project=none&year=2024')).rows.some(r => r.fundId === 'memo'), false);
  });

  it('filters by several years and funds, and by kind and currency', async () => {
    assert.equal((await ok('year=2024,2026')).count, 7);
    assert.equal((await ok('year=2025,2026&fund=checking,special')).count, 5);
    assert.equal((await ok('kind=reserved,memo')).count, 5);
    assert.equal((await ok('kind=memo')).count, 2);
    assert.equal((await ok('currency=USD')).count, 2);
    assert.equal((await ok('currency=usd,PKR&kind=general')).count, 8);
    assert.equal((await q('year=24')).status, 400);
    assert.equal((await q('kind=bogus')).status, 400);
    assert.equal((await q('sort=nope')).status, 400);
    assert.equal((await q('direction=up')).status, 400);
  });

  it('supports none for party and category, direction, status, exclude, linked and amount range', async () => {
    assert.equal((await ok('party=none&year=2024')).count, 4);
    assert.equal((await ok('party=p1,none&year=2026')).count, 2);
    assert.equal((await ok('party=p1')).count, 3);
    assert.equal((await ok('category=none&year=2025')).count, 3);
    assert.equal((await ok('category=c1,c2')).count, 3);
    assert.equal((await ok('direction=cr&year=2024')).count, 4);
    assert.equal((await ok('status=pending')).count, 1);
    assert.equal((await ok('status=paid,pending&year=2025')).count, 4);
    assert.equal((await ok('exclude=1')).count, 1);
    assert.equal((await ok('exclude=0&year=2024')).count, 4);
    assert.equal((await ok('linked=1')).count, 1);
    assert.equal((await ok('linked=0&year=2025')).count, 3);
    assert.equal((await ok('min=1000&max=3000&year=2024,2025')).count, 3);
    assert.equal((await ok('q=salary')).count, 1);
    assert.equal((await ok('from=2025-05-01&to=2026-01-31')).count, 4);
    assert.equal((await ok('year=2024,2025&from=2025-01-01')).count, 4);
  });

  it('sorts by date and amount', async () => {
    const dates = async s => (await ok(`sort=${s}`)).rows.map(r => r.date);
    const asc = await dates('date_asc');
    assert.deepEqual(asc, [...asc].sort());
    assert.deepEqual(await dates('date_desc'), [...asc].reverse());
    const amounts = async s => (await ok(`sort=${s}`)).rows.map(r => r.amount);
    const desc = await amounts('amount_desc');
    assert.deepEqual(desc, [...desc].sort((a, b) => b - a));
    const up = await amounts('amount_asc');
    assert.deepEqual(up, [...up].sort((a, b) => a - b));
    assert.equal(desc[0], 10000);
  });

  it('totals match the rows across pages', async () => {
    const all = await ok('year=2024,2025,2026&pageSize=500');
    const sum = (rows, dir, cur) => rows.filter(r => !r.exclude && r.direction === dir && r.currency === cur).reduce((s, r) => s + r.amount, 0);
    const seen = [];
    for (let page = 1; page <= 4; page += 1) {
      const p = await ok(`year=2024,2025,2026&pageSize=4&page=${page}&sort=amount_desc`);
      assert.equal(p.count, all.count);
      assert.deepEqual(p.totalsByCurrency, all.totalsByCurrency);
      seen.push(...p.rows);
    }
    assert.equal(seen.length, all.count);
    assert.equal(new Set(seen.map(r => r.id)).size, all.count);
    for (const cur of ['PKR', 'USD']) {
      assert.equal(all.totalsByCurrency[cur].cr, sum(seen, 'cr', cur));
      assert.equal(all.totalsByCurrency[cur].dr, sum(seen, 'dr', cur));
    }
    assert.equal(all.totals.cr, all.totalsByCurrency.PKR.cr);
  });

  it('computes the opening for a single year, excluding memo funds', async () => {
    const b = await ok('year=2025&opening=1&currency=PKR');
    // 2024 PKR non-memo: checking 10000-3000 = 7000 (excluded and deleted rows ignored), special 5000
    assert.deepEqual(b.openings.map(o => [o.fundId, o.fundName, o.currency, o.amount]), [['checking', 'checking', 'PKR', 7000], ['special', 'special', 'PKR', 5000]]);
    assert.equal(b.totals.opening, 12000);
    assert.equal(b.totals.closing, 12000 + b.totals.net);
    assert.equal(b.totalsByCurrency.PKR.closing, 12000 + 500);
  });

  it('uses the earliest year for multi-year, and from', async () => {
    const m = await ok('year=2026,2025&opening=1&currency=PKR');
    assert.equal(m.totals.opening, 12000);
    const f = await ok('opening=1&currency=PKR&from=2026-01-01');
    // end of 2025: checking 7000-1000+2000 = 8000, special 5000-500 = 4500
    assert.deepEqual(f.openings.map(o => o.amount), [8000, 4500]);
    assert.equal(f.totals.opening, 12500);
    assert.equal(f.totals.net, 300 - 200); // the memo debit is hidden by default, so the entries totals leave it out
    assert.equal(f.totals.closing, 12600);
  });

  it('has no opening without a period, and no opening fields without opening=1', async () => {
    const b = await ok('opening=1&currency=PKR');
    assert.deepEqual(b.openings, []);
    assert.equal(b.totals.opening, 0);
    assert.equal(b.totals.closing, b.totals.net);
    const plain = await ok('year=2025');
    assert.equal(plain.openings, undefined);
    assert.equal(plain.totals.opening, undefined);
    assert.equal(plain.totalsByCurrency.PKR.closing, undefined);
  });

  it('includes memo funds only when asked', async () => {
    const none = await ok('year=2026&opening=1');
    assert.ok(!none.openings.some(o => o.fundId === 'memo'));
    const kind = await ok('year=2026&opening=1&kind=memo');
    assert.deepEqual(kind.openings.map(o => [o.fundId, o.amount]), [['memo', 777]]);
    const named = await ok('year=2026&opening=1&fund=memo,special');
    assert.deepEqual(named.openings.map(o => o.fundId), ['memo', 'special']);
    const both = await ok('year=2026&opening=1&kind=memo,general');
    assert.ok(both.openings.some(o => o.fundId === 'memo') && both.openings.some(o => o.fundId === 'checking'));
    assert.ok(!both.openings.some(o => o.fundId === 'special'));
  });

  it('gives opening and closing per currency', async () => {
    const b = await ok('year=2026&opening=1');
    // usd: 100 - 40 = 60 at the start of 2026, nothing in 2026
    assert.equal(b.totalsByCurrency.USD.opening, 60);
    assert.equal(b.totalsByCurrency.USD.closing, 60);
    assert.deepEqual([b.totalsByCurrency.USD.cr, b.totalsByCurrency.USD.dr], [0, 0]);
    assert.equal(b.totalsByCurrency.PKR.opening, 12500 + 0);
    assert.equal(b.totalsByCurrency.PKR.closing, 12500 + 100);
    assert.equal(b.totals.opening, b.totalsByCurrency.PKR.opening);
    const onlyUsd = await ok('year=2026&opening=1&currency=USD');
    assert.deepEqual(Object.keys(onlyUsd.totalsByCurrency), ['USD']);
  });
});
