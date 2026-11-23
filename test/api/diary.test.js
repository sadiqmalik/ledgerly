const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { makeContext, withCookie, BOOK } = require('./helpers');
const { createAccountStore } = require('../../server/auth/accounts');
const R = require('../../server/auth/resources');

const PW = 'a long passphrase here';
const NB = '/api/diary/notebooks';

describe('notebooks API', () => {
  let ctx; let owner; let other; let editor; let viewer; let plain; let outsider;
  const entry = (nb, body = {}, who = owner) => who.post(`${NB}/${nb}/entries`).send({ date: '2026-02-01', title: 'Remember the deposit', ...body });

  beforeEach(async () => {
    ctx = await makeContext();
    await ctx.d1.batch([
      ctx.d1.prepare("INSERT INTO projects (id, book_id, name, kind) VALUES ('proj', ?, 'House', 'other'), ('other_proj', 'personal', 'Else', 'other')").bind(BOOK)
    ]);
    const store = createAccountStore(ctx.repo.authStore);
    const mk = (email, extra) => store.create({ email, name: email.split('@')[0], password: PW, ...extra });
    await mk('other@example.com', { isSuperAdmin: true });
    await mk('editor@example.com', { memberships: [{ bookId: BOOK, role: 'editor' }], resources: ['diary'] });
    await mk('viewer@example.com', { memberships: [{ bookId: BOOK, role: 'viewer' }], resources: ['diary'] });
    await mk('plain@example.com', { memberships: [{ bookId: BOOK, role: 'editor' }] }); // no Notebook page
    await mk('outsider@example.com', { memberships: [{ bookId: 'personal', role: 'admin' }], resources: ['diary'] });
    const login = async e => withCookie(ctx.app, `lsid=${(await ctx.auth.login(e, PW)).sid}`);
    owner = ctx.api; // the tester, a super administrator
    other = await login('other@example.com'); editor = await login('editor@example.com'); viewer = await login('viewer@example.com');
    plain = await login('plain@example.com'); outsider = await login('outsider@example.com');
  });
  afterEach(async () => { await ctx.close(); });

  const linked = async (name = 'Family') => (await owner.post(NB).send({ name, bookId: BOOK })).body;
  const unlinked = async (name = 'Mine') => (await owner.post(NB).send({ name })).body;

  it('creates notebooks linked to a ledger or to none, several per ledger, and lists them per account', async () => {
    const a = await linked('Family'); const b = await linked('Car'); const c = await unlinked('Private');
    assert.equal(a.bookId, BOOK); assert.equal(c.bookId, null);
    assert.ok(a.createdAt && a.updatedAt);
    assert.deepEqual((await owner.get(NB)).body.map(n => n.name), ['Car', 'Family', 'Private']);
    // A linked notebook follows ledger access; an unlinked one is only its owner's.
    assert.deepEqual((await editor.get(NB)).body.map(n => [n.name, n.canEdit]), [['Car', true], ['Family', true]]);
    assert.deepEqual((await viewer.get(NB)).body.map(n => [n.name, n.canEdit]), [['Car', false], ['Family', false]]);
    assert.deepEqual((await outsider.get(NB)).body, []);
    assert.deepEqual((await other.get(NB)).body.map(n => n.name), ['Car', 'Family']); // another super admin: linked ones only
    assert.equal((await other.get(`${NB}/${c.id}/entries`)).status, 404);
    assert.equal((await editor.get(`${NB}/${c.id}/entries`)).status, 404);
    // No page, no access; access codes never.
    assert.equal((await plain.get(NB)).status, 403);
    assert.equal((await ctx.anonymous.get(NB)).status, 401);
    assert.equal(R.RESOURCES.includes('diary'), true);
    assert.equal(R.CODE_RESOURCES.includes('diary'), true);
    assert.equal(R.DEFAULT_ALL_RESOURCES.includes('diary'), false);
    // Creating: an unlinked notebook only by a super admin, a linked one needs an Editor role in that ledger.
    assert.equal((await editor.post(NB).send({ name: 'x' })).status, 403);
    assert.equal((await viewer.post(NB).send({ name: 'x', bookId: BOOK })).status, 403);
    assert.equal((await outsider.post(NB).send({ name: 'x', bookId: BOOK })).status, 404);
    assert.equal((await editor.post(NB).send({ name: 'Edi', bookId: BOOK })).status, 201);
    assert.equal((await owner.post(NB).send({ name: '' })).status, 400);
    assert.equal((await owner.post(NB).send({ name: 'x', bookId: 'nope' })).status, 404);
    assert.ok(b.id);
  });

  it('view-only for a Viewer, editable for an Editor, and delete rules', async () => {
    const a = await linked();
    assert.equal((await entry(a.id, {}, viewer)).status, 403);
    assert.equal((await viewer.get(`${NB}/${a.id}/entries`)).status, 200);
    assert.equal((await viewer.put(`${NB}/${a.id}`).send({ name: 'x' })).status, 403);
    const made = await entry(a.id, { message: 'Bring the receipt', fromName: 'Ammi', projectId: 'proj', important: true }, editor);
    assert.equal(made.status, 201);
    assert.equal(made.body.projectName, 'House');
    assert.equal((await entry(a.id, { projectId: 'other_proj' }, editor)).status, 404);
    // Shared by ledger access: the owner and the viewer see the editor's entry.
    assert.deepEqual((await owner.get(`${NB}/${a.id}/entries`)).body.map(n => n.id), [made.body.id]);
    assert.equal((await viewer.put(`${NB}/${a.id}/entries/${made.body.id}`).send({ title: 'x' })).status, 403);
    assert.equal((await viewer.delete(`${NB}/${a.id}/entries/${made.body.id}`)).status, 403);
    assert.equal((await editor.put(`${NB}/${a.id}`).send({ name: 'Renamed' })).body.name, 'Renamed');
    // An editor who is not the owner cannot delete or move the notebook; the owner can.
    assert.equal((await editor.delete(`${NB}/${a.id}`)).status, 403);
    assert.equal((await editor.put(`${NB}/${a.id}`).send({ bookId: null })).status, 403);
    assert.equal((await outsider.get(`${NB}/${a.id}/entries`)).status, 404);
    assert.equal((await owner.delete(`${NB}/${a.id}`)).status, 200);
    assert.equal((await owner.get(`${NB}/${a.id}/entries`)).status, 404);
    assert.equal((await ctx.d1.prepare('SELECT COUNT(*) AS n FROM diary_notes').first()).n, 0);
  });

  it('relinking: only the owning super admin, entries follow, project links of the old ledger are dropped', async () => {
    const a = await linked();
    const made = (await entry(a.id, { projectId: 'proj' })).body;
    assert.equal((await owner.put(`${NB}/${a.id}`).send({ bookId: null })).body.bookId, null);
    assert.equal((await editor.get(`${NB}/${a.id}/entries`)).status, 404); // no longer shared
    assert.equal((await owner.get(`${NB}/${a.id}/entries`)).body[0].projectId, null);
    assert.equal((await owner.put(`${NB}/${a.id}/entries/${made.id}`).send({ projectId: 'proj' })).status, 404); // no ledger, no projects
    assert.equal((await owner.put(`${NB}/${a.id}`).send({ bookId: BOOK })).body.bookId, BOOK);
  });

  it('lists entries latest first: date, then time (none last), then created', async () => {
    const nb = (await linked('Sorted')).id;
    const E = `${NB}/${nb}/entries`;
    const mk = async (title, date, time) => (await entry(nb, { title, date, ...(time ? { time } : {}) })).body;
    await mk('old-9', '2026-01-01', '09:00');
    await mk('new-none', '2026-03-01');
    await mk('new-0800', '2026-03-01', '08:00');
    await mk('new-2000', '2026-03-01', '20:00');
    await mk('tie-first', '2026-02-01', '10:00');
    await mk('tie-second', '2026-02-01', '10:00');
    const titles = (await owner.get(E)).body.map(n => n.title);
    assert.deepEqual(titles, ['new-2000', 'new-0800', 'new-none', 'tie-second', 'tie-first', 'old-9']);
  });

  it('entries carry an optional time of day: validation, update, ordering, yearly repeat', async () => {
    const nb = (await linked('Timed')).id;
    const E = `${NB}/${nb}/entries`;
    const a = await entry(nb, { time: '14:30', title: 'Late' });
    assert.equal(a.status, 201); assert.equal(a.body.time, '14:30');
    for (const bad of ['24:00', '9:5', 'abc', '12:60']) assert.equal((await entry(nb, { time: bad })).status, 400, bad);
    // Old entries without a time still list, with time null; latest first: by time descending within a day, no time last.
    await ctx.d1.prepare("INSERT INTO diary_notes (id, book_id, notebook_id, date, title, kind, created_by, created_at, updated_at) VALUES ('old', ?, ?, '2026-02-01', 'Old', 'note', 'x', 't', 't')").bind(BOOK, nb).run();
    await entry(nb, { time: '08:15', title: 'Early' });
    await entry(nb, { title: 'No time' });
    const list = (await owner.get(E)).body;
    // 2026-02-01 holds only 'old' (no time); other entries use today's date, so order by (date desc, time desc, none last).
    const key = n => [n.date, n.time ? '1' + n.time : '0'].join('|');
    const keys = list.map(key);
    assert.deepEqual(keys, [...keys].sort().reverse());
    assert.equal(list.find(n => n.id === 'old').time, null);
    // Update and clear.
    assert.equal((await owner.put(`${E}/${a.body.id}`).send({ time: '09:00' })).body.time, '09:00');
    assert.equal((await owner.put(`${E}/${a.body.id}`).send({ time: null })).body.time, null);
    assert.equal((await owner.put(`${E}/${a.body.id}`).send({ time: '7:00' })).status, 400);
    // A yearly date keeps its time in the upcoming list, sorted by time within a day.
    await entry(nb, { kind: 'date', date: '2020-03-10', title: 'Anniversary', repeatYearly: true, time: '18:00' });
    await entry(nb, { kind: 'date', date: '2020-03-10', title: 'Breakfast', repeatYearly: true, time: '07:30' });
    const up = (await owner.get(`${NB}/${nb}/upcoming?today=2026-03-09&days=5`)).body;
    assert.deepEqual(up.map(n => [n.title, n.time, n.daysAway]), [['Breakfast', '07:30', 1], ['Anniversary', '18:00', 1]]);
  });

  it('an entry can carry an IANA time zone: validated, returned, kept by copies and yearly repeats, cleared with null', async () => {
    const nb = (await linked('Zones')).id;
    const E = `${NB}/${nb}/entries`;
    assert.equal((await entry(nb, { date: '2026-01-12', time: '14:30', timeZone: 'Mars/Base' })).status, 400);
    assert.equal((await entry(nb, { date: '2026-01-12', time: '14:30', timeZone: '' })).status, 400);
    assert.equal((await entry(nb, { date: '2026-01-12' })).body.timeZone, null);
    const made = await entry(nb, { date: '2026-01-12', time: '14:30', timeZone: 'Europe/Stockholm' });
    assert.equal(made.status, 201);
    assert.equal(made.body.timeZone, 'Europe/Stockholm');
    const copy = await entry(nb, { date: '2026-02-02', time: '14:30', timeZone: made.body.timeZone });
    assert.equal(copy.body.timeZone, 'Europe/Stockholm');
    assert.equal((await owner.put(`${E}/${made.body.id}`).send({ timeZone: 'nope' })).status, 400);
    assert.equal((await owner.put(`${E}/${made.body.id}`).send({ timeZone: 'Asia/Karachi' })).body.timeZone, 'Asia/Karachi');
    await entry(nb, { kind: 'date', date: '2020-03-10', time: '09:00', timeZone: 'America/New_York', title: 'Call', repeatYearly: true });
    const up = (await owner.get(`${NB}/${nb}/upcoming?today=2026-03-09&days=5`)).body;
    assert.equal(up[0].timeZone, 'America/New_York');
    assert.equal((await owner.put(`${E}/${made.body.id}`).send({ timeZone: null })).body.timeZone, null);
  });

  it('time zones inherit: entry > category > notebook, null inherits, bad zone 400, locks block a zone change', async () => {
    assert.equal((await owner.post(NB).send({ name: 'Bad', bookId: BOOK, timeZone: 'Mars/Base' })).status, 400);
    const nbk = (await owner.post(NB).send({ name: 'Inherit', bookId: BOOK, timeZone: 'Asia/Karachi' })).body;
    assert.equal(nbk.timeZone, 'Asia/Karachi');
    const C = `${NB}/${nbk.id}/categories`;
    const E = `${NB}/${nbk.id}/entries`;
    assert.equal((await owner.post(C).send({ name: 'Bad', timeZone: 'nope' })).status, 400);
    const cat = (await owner.post(C).send({ name: 'Trips', timeZone: 'Europe/Stockholm' })).body;
    const plain = (await owner.post(C).send({ name: 'Plain' })).body;
    assert.equal(cat.timeZone, 'Europe/Stockholm'); assert.equal(plain.timeZone, null);
    const own = (await entry(nbk.id, { time: '10:00', timeZone: 'America/New_York', categoryId: cat.id })).body;
    const viaCat = (await entry(nbk.id, { time: '10:00', categoryId: cat.id })).body;
    const viaNb = (await entry(nbk.id, { time: '10:00', categoryId: plain.id })).body;
    assert.deepEqual([own.resolvedTimeZone, own.timeZoneFrom], ['America/New_York', 'entry']);
    assert.deepEqual([viaCat.timeZone, viaCat.resolvedTimeZone, viaCat.timeZoneFrom], [null, 'Europe/Stockholm', 'category']);
    assert.deepEqual([viaNb.resolvedTimeZone, viaNb.timeZoneFrom], ['Asia/Karachi', 'notebook']);
    // Changing the category zone changes the inheriting entries; null inherits again.
    assert.equal((await owner.put(`${C}/${cat.id}`).send({ timeZone: 'Asia/Tokyo' })).body.timeZone, 'Asia/Tokyo');
    assert.equal((await owner.get(E)).body.find(n => n.id === viaCat.id).resolvedTimeZone, 'Asia/Tokyo');
    assert.equal((await owner.put(`${C}/${cat.id}`).send({ timeZone: null })).body.timeZone, null);
    assert.deepEqual([(await owner.get(E)).body.find(n => n.id === viaCat.id).timeZoneFrom], ['notebook']);
    assert.equal((await owner.put(`${NB}/${nbk.id}`).send({ timeZone: null })).body.timeZone, null);
    const none = (await owner.get(E)).body.find(n => n.id === viaCat.id);
    assert.deepEqual([none.resolvedTimeZone, none.timeZoneFrom], [null, null]);
    assert.equal((await owner.put(`${NB}/${nbk.id}`).send({ timeZone: 'bad' })).status, 400);
    // Locks.
    assert.equal((await owner.put(`${C}/${cat.id}`).send({ locked: true })).status, 200);
    assert.equal((await owner.put(`${C}/${cat.id}`).send({ timeZone: 'UTC' })).status, 409);
    await owner.put(`${C}/${cat.id}`).send({ locked: false });
    assert.equal((await owner.put(`${NB}/${nbk.id}`).send({ locked: true })).status, 200);
    assert.equal((await owner.put(`${NB}/${nbk.id}`).send({ timeZone: 'UTC' })).status, 409);
    assert.equal((await owner.put(`${NB}/${nbk.id}`).send({ locked: false })).body.timeZone, null);
  });

  it('entries can end later: end rules, clearing and shifted yearly end', async () => {
    const nb = (await linked('Span')).id;
    const E = `${NB}/${nb}/entries`;
    const bad = { date: '2026-01-12', time: '14:30' };
    assert.equal((await entry(nb, { ...bad, endDate: '2026-01-11' })).status, 400);
    assert.equal((await entry(nb, { ...bad, endTime: '14:00' })).status, 400); // same day, earlier
    assert.equal((await entry(nb, { ...bad, endDate: '2026-01-12', endTime: '14:29' })).status, 400);
    assert.equal((await entry(nb, { ...bad, endTime: '9:00' })).status, 400);
    const same = await entry(nb, { ...bad, endTime: '16:00' }); // end time only: the start day
    assert.equal(same.status, 201);
    assert.deepEqual([same.body.endDate, same.body.endTime], ['2026-01-12', '16:00']);
    assert.equal((await entry(nb, { ...bad, endTime: '14:30' })).status, 201); // equal is fine
    const multi = await entry(nb, { date: '2026-01-12', endDate: '2026-01-14' }); // dates only
    assert.deepEqual([multi.body.endDate, multi.body.endTime, multi.body.time], ['2026-01-14', null, null]);
    assert.deepEqual([(await entry(nb, {})).body.endDate, (await entry(nb, {})).body.endTime], [null, null]);
    // Update checks against the stored values, and null clears.
    assert.equal((await owner.put(`${E}/${multi.body.id}`).send({ date: '2026-01-20' })).status, 400);
    assert.equal((await owner.put(`${E}/${multi.body.id}`).send({ endDate: '2026-01-15', endTime: '10:00' })).status, 200);
    const cleared = (await owner.put(`${E}/${multi.body.id}`).send({ endDate: null, endTime: null })).body;
    assert.deepEqual([cleared.endDate, cleared.endTime], [null, null]);
    // A copy is just a new entry carrying the same fields.
    const copy = await entry(nb, { date: '2026-02-02', time: '14:30', endDate: '2026-02-03', endTime: '09:00' });
    assert.deepEqual([copy.body.time, copy.body.endDate, copy.body.endTime], ['14:30', '2026-02-03', '09:00']);
    // Yearly: the next occurrence's end is shifted by the same number of days.
    await entry(nb, { kind: 'date', date: '2020-03-10', endDate: '2020-03-12', title: 'Trip', repeatYearly: true });
    const up = (await owner.get(`${NB}/${nb}/upcoming?today=2026-03-09&days=5`)).body;
    assert.deepEqual([up[0].nextDate, up[0].nextEndDate, up[0].endDate], ['2026-03-10', '2026-03-12', '2020-03-12']);
  });

  it('entries and filters: edit, disable, delete, names, search', async () => {
    const a = await linked();
    const id = (await entry(a.id, { message: 'Bring the receipt', fromName: 'Ammi', toName: 'Me', projectId: 'proj', important: true })).body.id;
    await entry(a.id, { date: '2026-03-01', title: 'Second note', fromName: 'Dad' });
    const U = `${NB}/${a.id}`;
    assert.deepEqual((await owner.get(`${U}/entries`)).body.map(n => n.title), ['Second note', 'Remember the deposit']);
    assert.deepEqual((await owner.get(`${U}/entries?project=proj`)).body.map(n => n.id), [id]);
    assert.deepEqual((await owner.get(`${U}/entries?project=none`)).body.map(n => n.title), ['Second note']);
    assert.deepEqual((await owner.get(`${U}/entries?important=1`)).body.map(n => n.id), [id]);
    assert.deepEqual((await owner.get(`${U}/entries?q=receipt`)).body.map(n => n.id), [id]);
    assert.deepEqual((await owner.get(`${U}/names`)).body, ['Ammi', 'Dad', 'Me']);
    assert.equal((await owner.put(`${U}/entries/${id}`).send({ title: 'Updated', toName: null, projectId: null })).body.title, 'Updated');
    assert.equal((await owner.put(`${U}/entries/${id}`).send({ active: false })).body.active, false);
    assert.deepEqual((await owner.get(`${U}/entries`)).body.map(n => n.title), ['Second note']);
    assert.equal((await owner.get(`${U}/entries?status=all`)).body.length, 2);
    assert.equal((await owner.get(`${U}/entries?status=weird`)).status, 400);
    assert.equal((await entry(a.id, { title: '' })).status, 400);
    assert.equal((await entry(a.id, { extra: 1 })).status, 400);
    assert.equal((await owner.delete(`${U}/entries/${id}`)).status, 200);
    assert.equal((await owner.delete(`${U}/entries/${id}`)).status, 404);
  });

  it('a locked entry cannot be edited, disabled or deleted until unlocked; only editors lock', async () => {
    const a = await linked('Family');
    const U = `${NB}/${a.id}/entries`;
    const made = await entry(a.id, { title: 'Keep' }, editor);
    assert.equal(made.body.locked, false);
    const id = made.body.id;
    assert.equal((await viewer.put(`${U}/${id}`).send({ locked: true })).status, 403);
    const lockedRes = await editor.put(`${U}/${id}`).send({ locked: true });
    assert.equal(lockedRes.status, 200); assert.equal(lockedRes.body.locked, true);
    for (const res of [await editor.put(`${U}/${id}`).send({ title: 'No' }), await editor.put(`${U}/${id}`).send({ active: false }), await editor.put(`${U}/${id}`).send({ locked: false, title: 'No' }), await editor.delete(`${U}/${id}`)]) {
      assert.equal(res.status, 409); assert.equal(res.body.error, 'This entry is locked. Unlock it first.');
    }
    assert.equal((await viewer.put(`${U}/${id}`).send({ locked: false })).status, 403);
    assert.equal((await owner.get(U)).body.find(n => n.id === id).title, 'Keep');
    assert.equal((await editor.put(`${U}/${id}`).send({ locked: false })).body.locked, false);
    assert.equal((await editor.put(`${U}/${id}`).send({ title: 'Yes' })).body.title, 'Yes');
    // A copy of a locked entry is unlocked (create without locked), and an entry can be created locked.
    assert.equal((await entry(a.id, { title: 'Copy' }, editor)).body.locked, false);
    assert.equal((await entry(a.id, { title: 'Born', locked: true }, editor)).body.locked, true);
    assert.equal((await editor.delete(`${U}/${id}`)).status, 200);
  });

  it('a locked notebook or category is read only until unlocked; only editors lock', async () => {
    const nb = await linked('Family');
    const cat = (await owner.post(`${NB}/${nb.id}/categories`).send({ name: 'Mum' })).body;
    const other = (await owner.post(`${NB}/${nb.id}/categories`).send({ name: 'Dad' })).body;
    assert.equal(cat.locked, false);
    const inCat = (await entry(nb.id, { categoryId: cat.id })).body;
    const free = (await entry(nb.id, { title: 'Loose' })).body;
    assert.equal(inCat.effectiveLocked, false);
    // Category lock: viewer refused, editor allowed.
    assert.equal((await viewer.put(`${NB}/${nb.id}/categories/${cat.id}`).send({ locked: true })).status, 403);
    assert.equal((await editor.put(`${NB}/${nb.id}/categories/${cat.id}`).send({ locked: true })).body.locked, true);
    const e = (await owner.get(`${NB}/${nb.id}/entries`)).body;
    assert.equal(e.find(x => x.id === inCat.id).effectiveLocked, true);
    assert.equal(e.find(x => x.id === inCat.id).locked, false);
    assert.equal(e.find(x => x.id === free.id).effectiveLocked, false);
    const CAT = 'This category is locked. Unlock it first.';
    for (const res of [
      await owner.put(`${NB}/${nb.id}/entries/${inCat.id}`).send({ title: 'x' }),
      await owner.put(`${NB}/${nb.id}/entries/${inCat.id}`).send({ active: false }),
      await owner.delete(`${NB}/${nb.id}/entries/${inCat.id}`),
      await entry(nb.id, { categoryId: cat.id }),
      await owner.put(`${NB}/${nb.id}/entries/${free.id}`).send({ categoryId: cat.id }), // moving in
      await owner.put(`${NB}/${nb.id}/entries/${inCat.id}`).send({ categoryId: other.id }), // moving out
      await owner.put(`${NB}/${nb.id}/categories/${cat.id}`).send({ name: 'Renamed' }),
      await owner.delete(`${NB}/${nb.id}/categories/${cat.id}`)
    ]) { assert.equal(res.status, 409); assert.equal(res.body.error, CAT); }
    assert.equal((await owner.put(`${NB}/${nb.id}/entries/${free.id}`).send({ title: 'Other category is fine' })).status, 200);
    assert.equal((await owner.put(`${NB}/${nb.id}/categories/${cat.id}`).send({ locked: false })).body.locked, false);
    assert.equal((await owner.put(`${NB}/${nb.id}/entries/${inCat.id}`).send({ title: 'Edited' })).status, 200);

    // Notebook lock.
    assert.equal((await viewer.put(`${NB}/${nb.id}`).send({ locked: true })).status, 403);
    const locked = (await editor.put(`${NB}/${nb.id}`).send({ locked: true })).body;
    assert.equal(locked.locked, true);
    assert.equal((await owner.get(NB)).body.find(n => n.id === nb.id).locked, true);
    assert.equal((await owner.get(`${NB}/${nb.id}/entries`)).body.every(x => x.effectiveLocked), true);
    const NBL = 'This notebook is locked. Unlock it first.';
    for (const res of [
      await entry(nb.id),
      await owner.put(`${NB}/${nb.id}/entries/${free.id}`).send({ title: 'x' }),
      await owner.put(`${NB}/${nb.id}/entries/${free.id}`).send({ active: false }),
      await owner.delete(`${NB}/${nb.id}/entries/${free.id}`),
      await owner.post(`${NB}/${nb.id}/categories`).send({ name: 'New' }),
      await owner.put(`${NB}/${nb.id}/categories/${cat.id}`).send({ locked: true }),
      await owner.delete(`${NB}/${nb.id}/categories/${cat.id}`),
      await owner.put(`${NB}/${nb.id}`).send({ name: 'Renamed' }),
      await owner.put(`${NB}/${nb.id}`).send({ extraLedgerIds: ['personal'] }),
      await owner.delete(`${NB}/${nb.id}`)
    ]) { assert.equal(res.status, 409); assert.equal(res.body.error, NBL); }
    assert.equal((await owner.get(`${NB}/${nb.id}/entries`)).status, 200);
    assert.equal((await owner.put(`${NB}/${nb.id}`).send({ locked: false })).body.locked, false);
    assert.equal((await entry(nb.id)).status, 201);
    assert.equal((await owner.delete(`${NB}/${nb.id}`)).status, 200);
  });

  it('categories inside a notebook, important dates and upcoming', async () => {
    const nb = await linked(); const nb2 = await linked('Car');
    const U = `${NB}/${nb.id}`;
    const fam = (await owner.post(`${U}/categories`).send({ name: 'Family' })).body;
    assert.equal((await owner.post(`${U}/categories`).send({ name: 'family' })).status, 400); // unique per notebook
    assert.equal((await owner.post(`${NB}/${nb2.id}/categories`).send({ name: 'Family' })).status, 201); // same name elsewhere is fine
    assert.equal((await viewer.post(`${U}/categories`).send({ name: 'No' })).status, 403);
    assert.equal((await entry(nb2.id, { categoryId: fam.id })).status, 404); // another notebook's category
    const anniv = (await entry(nb.id, { date: '2019-03-14', title: 'Anniversary', categoryId: fam.id, kind: 'date', repeatYearly: true })).body;
    const once = (await entry(nb.id, { date: '2025-06-01', title: 'First cleaning', categoryId: fam.id, kind: 'date' })).body;
    const note = (await entry(nb.id, { title: 'Plain', categoryId: fam.id, repeatYearly: true })).body;
    assert.equal(note.repeatYearly, false);
    assert.equal(anniv.categoryName, 'Family');
    assert.deepEqual((await owner.get(`${U}/entries?category=${fam.id}&kind=date`)).body.map(n => n.id).sort(), [anniv.id, once.id].sort());
    const up = (await viewer.get(`${U}/upcoming?today=2026-03-01&days=30`)).body;
    assert.deepEqual(up.map(n => [n.title, n.nextDate, n.daysAway, n.years]), [['Anniversary', '2026-03-14', 13, 7]]);
    assert.equal((await viewer.get(`${U}/upcoming?today=2026-03-20&days=366`)).body[0].nextDate, '2027-03-14');
    assert.equal((await viewer.get(`${U}/upcoming?today=bad`)).status, 400);
    await entry(nb.id, { date: '2020-02-29', title: 'Leap', kind: 'date', repeatYearly: true });
    assert.equal((await viewer.get(`${U}/upcoming?today=2026-02-01&days=60`)).body.find(n => n.title === 'Leap').nextDate, '2026-02-28');
    const row = (await viewer.get(`${U}/categories?today=2026-03-01`)).body[0];
    assert.deepEqual([row.dateCount, row.noteCount, row.nextDate, row.nextDaysAway], [2, 1, '2026-03-14', 13]);
    assert.equal((await owner.put(`${U}/categories/${fam.id}`).send({ name: 'Kin' })).body.name, 'Kin');
    assert.equal((await owner.delete(`${U}/categories/${fam.id}`)).status, 200);
    assert.equal((await owner.delete(`${U}/categories/${fam.id}`)).status, 404);
    assert.ok((await owner.get(`${U}/entries?status=all&category=none`)).body.some(n => n.id === once.id));
  });

  it('a ledger that is deleted takes its linked notebooks with it', async () => {
    const a = await linked();
    await entry(a.id);
    await ctx.repo.books.remove(BOOK);
    assert.equal((await ctx.d1.prepare('SELECT COUNT(*) AS n FROM diary_notebooks').first()).n, 0);
    assert.equal((await ctx.d1.prepare('SELECT COUNT(*) AS n FROM diary_notes').first()).n, 0);
  });

  describe('shared with more ledgers', () => {
    const mk = async (email, memberships, extra = {}) => {
      await createAccountStore(ctx.repo.authStore).create({ email, name: email.split('@')[0], password: PW, memberships, resources: ['diary'], ...extra });
      return withCookie(ctx.app, `lsid=${(await ctx.auth.login(email, PW)).sid}`);
    };
    const share = async (name = 'Family', extraLedgerIds = ['personal']) => (await owner.post(NB).send({ name, bookId: BOOK, extraLedgerIds })).body;
    const links = async () => (await ctx.d1.prepare('SELECT notebook_id, book_id FROM diary_notebook_ledgers').all()).results;

    it('moving: super admin, or Admin in both the current and the target ledger (with the page); extras follow; old members lose access', async () => {
      const mine = (await editor.post(NB).send({ name: 'Mine', bookId: BOOK })).body;
      assert.equal(mine.canRelink, false); // the creator, as an Editor, cannot move it
      const e = (await entry(mine.id, {}, editor)).body;
      assert.equal((await editor.put(`${NB}/${mine.id}`).send({ bookId: 'personal' })).status, 403);
      const adminSrc = await mk('src@example.com', [{ bookId: BOOK, role: 'admin' }, { bookId: 'personal', role: 'editor' }]);
      assert.equal((await adminSrc.put(`${NB}/${mine.id}`).send({ bookId: 'personal' })).status, 403); // Admin only in the source
      assert.equal((await adminSrc.put(`${NB}/${mine.id}`).send({ bookId: null })).status, 403);
      const adminDst = await mk('dst@example.com', [{ bookId: BOOK, role: 'editor' }, { bookId: 'personal', role: 'admin' }]);
      assert.equal((await adminDst.put(`${NB}/${mine.id}`).send({ bookId: 'personal' })).status, 403); // Admin only in the target
      const nopage = await mk('nopg@example.com', [{ bookId: BOOK, role: 'admin' }, { bookId: 'personal', role: 'admin', resources: ['ledger'] }]);
      assert.equal((await nopage.put(`${NB}/${mine.id}`).send({ bookId: 'personal' })).status, 404); // no Notebook page in the target
      const both = await mk('both2@example.com', [{ bookId: BOOK, role: 'admin' }, { bookId: 'personal', role: 'admin' }]);
      const bm = (await both.post(NB).send({ name: 'B', bookId: BOOK, extraLedgerIds: ['personal'] })).body;
      assert.equal(bm.canRelink, true);
      const moved = (await both.put(`${NB}/${bm.id}`).send({ bookId: 'personal' })).body;
      assert.deepEqual([moved.bookId, moved.ledgerIds], ['personal', ['personal']]);
      assert.equal((await entry(bm.id, {}, both)).status, 201);
      assert.equal((await editor.get(`${NB}/${bm.id}/entries`)).status, 404); // old ledger members lose access
      const keep = (await both.post(NB).send({ name: 'K', bookId: BOOK })).body;
      assert.deepEqual((await both.put(`${NB}/${keep.id}`).send({ bookId: 'personal', extraLedgerIds: [BOOK] })).body.ledgerIds, ['personal', BOOK]);
      assert.equal((await both.put(`${NB}/${mine.id}`).send({ bookId: 'personal' })).body.bookId, 'personal');
      assert.equal((await owner.put(`${NB}/${mine.id}`).send({ bookId: BOOK })).body.bookId, BOOK); // super admin always
      assert.equal((await owner.get(`${NB}/${mine.id}/entries`)).body[0].id, e.id);
    });

    it('default is unchanged: one ledger, no links', async () => {
      const a = await linked();
      assert.deepEqual([a.ledgerIds, a.ledgerNames], [[BOOK], ['Family']]);
      assert.deepEqual(await links(), []);
      assert.deepEqual((await outsider.get(NB)).body, []);
    });

    it('opens through an extra ledger only with a role, the page, and an active ledger; reading is highest-wins, writing needs the main ledger', async () => {
      const a = await share();
      assert.deepEqual([a.ledgerIds, a.ledgerNames, a.bookId], [[BOOK, 'personal'], ['Family', 'Personal'], BOOK]);
      // outsider is Admin in the extra ledger and has the page there.
      const list = (await outsider.get(NB)).body;
      assert.deepEqual(list.map(n => [n.name, n.canEdit, n.canDelete, n.canRelink]), [['Family', false, false, false]]);
      assert.equal(list[0].mainLedgerId, BOOK);
      // Admin only in a shared-in ledger: view only, every write answers 403.
      const denied = await entry(a.id, {}, outsider);
      assert.equal(denied.status, 403);
      assert.match(denied.body.error || denied.body.message || '', /view only/);
      assert.equal((await outsider.put(`${NB}/${a.id}`).send({ name: 'X' })).status, 403);
      assert.equal((await outsider.put(`${NB}/${a.id}`).send({ extraLedgerIds: [] })).status, 403);
      assert.equal((await outsider.delete(`${NB}/${a.id}`)).status, 403);
      assert.equal((await outsider.get(`${NB}/${a.id}/entries`)).status, 200);
      assert.equal((await outsider.get(`${NB}/${a.id}/names`)).status, 200);
      // Viewer in the main ledger, Editor in the extra one: reads, cannot write.
      const both = await mk('both@example.com', [{ bookId: BOOK, role: 'viewer' }, { bookId: 'personal', role: 'editor' }]);
      assert.deepEqual((await both.get(NB)).body.map(n => [n.canEdit, n.canDelete]), [[false, false]]);
      assert.equal((await entry(a.id, {}, both)).status, 403);
      assert.equal((await both.get(`${NB}/${a.id}/entries`)).status, 200);
      // Editor in the main ledger, Viewer in the extra one: still edits.
      const mainEd = await mk('mained@example.com', [{ bookId: BOOK, role: 'editor' }, { bookId: 'personal', role: 'viewer' }]);
      assert.deepEqual((await mainEd.get(NB)).body.map(n => n.canEdit), [true]);
      assert.equal((await entry(a.id, {}, mainEd)).status, 201);
      // Editor only in the extra ledger (no role in the main one): reads, cannot write.
      const extraEd = await mk('extraed@example.com', [{ bookId: 'personal', role: 'editor' }]);
      assert.deepEqual((await extraEd.get(NB)).body.map(n => n.canEdit), [false]);
      assert.equal((await entry(a.id, {}, extraEd)).status, 403);
      // No page in the extra ledger: not through it, still through the main one.
      const nopage = await mk('nopage@example.com', [{ bookId: BOOK, role: 'viewer', resources: ['diary'] }, { bookId: 'personal', role: 'admin', resources: ['ledger'] }]);
      assert.deepEqual((await nopage.get(NB)).body.map(n => n.canEdit), [false]);
      const onlyExtra = await mk('onlyextra@example.com', [{ bookId: 'personal', role: 'admin', resources: ['ledger'] }, { bookId: BOOK, role: 'viewer', resources: ['ledger'] }], { resources: ['diary'] });
      assert.deepEqual((await onlyExtra.get(NB)).body, []);
      assert.equal((await onlyExtra.get(`${NB}/${a.id}/entries`)).status, 404);
      // Deactivated extra ledger: the main one still works, and an extra-only person is held back.
      await ctx.d1.prepare("UPDATE books SET active = 0 WHERE id = 'personal'").run();
      assert.equal((await outsider.get(`${NB}/${a.id}/entries`)).status, 423);
      assert.equal((await viewer.get(`${NB}/${a.id}/entries`)).status, 200);
    });

    it('the notebook rule applies per ledger', async () => {
      const a = await share();
      const b = await share('Car');
      const p = await mk('rules@example.com', [{ bookId: BOOK, role: 'editor', notebooksExcluded: [a.id] }, { bookId: 'personal', role: 'viewer' }]);
      // Excluded in the main ledger, but open through the extra one as a viewer.
      assert.deepEqual((await p.get(NB)).body.map(n => [n.name, n.canEdit]), [['Car', true], ['Family', false]]);
      const q = await mk('rules2@example.com', [{ bookId: BOOK, role: 'editor', notebooksExcluded: [a.id] }, { bookId: 'personal', role: 'viewer', notebooksExcluded: [a.id] }]);
      assert.deepEqual((await q.get(NB)).body.map(n => n.name), ['Car']);
      assert.equal((await q.get(`${NB}/${a.id}/entries`)).status, 404);
      assert.ok(b.id);
    });

    it('add and remove extras, with who may', async () => {
      const a = await linked();
      assert.deepEqual((await owner.put(`${NB}/${a.id}`).send({ extraLedgerIds: ['personal'] })).body.ledgerIds, [BOOK, 'personal']);
      assert.deepEqual((await owner.put(`${NB}/${a.id}`).send({ name: 'Renamed' })).body.ledgerIds, [BOOK, 'personal']); // kept
      assert.equal((await owner.put(`${NB}/${a.id}`).send({ extraLedgerIds: [BOOK] })).status, 400);
      assert.equal((await owner.put(`${NB}/${a.id}`).send({ extraLedgerIds: ['nope'] })).status, 404);
      // An Editor of the main ledger who is not the owner may not change the sharing.
      assert.equal((await editor.put(`${NB}/${a.id}`).send({ extraLedgerIds: [] })).status, 403);
      assert.equal((await editor.put(`${NB}/${a.id}`).send({ name: 'Edited' })).status, 200);
      // The owner Editor needs the Editor role in each added ledger.
      const mine = (await editor.post(NB).send({ name: 'Mine', bookId: BOOK })).body;
      assert.equal((await editor.put(`${NB}/${mine.id}`).send({ extraLedgerIds: ['personal'] })).status, 404); // no role there
      assert.equal((await editor.post(NB).send({ name: 'x', bookId: BOOK, extraLedgerIds: ['personal'] })).status, 404);
      // The main ledger's Admin may.
      const admin = await mk('admin@example.com', [{ bookId: BOOK, role: 'admin' }, { bookId: 'personal', role: 'editor' }]);
      assert.deepEqual((await admin.put(`${NB}/${a.id}`).send({ extraLedgerIds: [] })).body.ledgerIds, [BOOK]);
      assert.deepEqual(await links(), []);
      // Private notebooks cannot be shared; relinking drops the new main from the extras and unlinking drops all.
      assert.equal((await owner.post(NB).send({ name: 'P', extraLedgerIds: ['personal'] })).status, 400);
      await owner.put(`${NB}/${a.id}`).send({ extraLedgerIds: ['personal'] });
      assert.deepEqual((await owner.put(`${NB}/${a.id}`).send({ bookId: 'personal' })).body.ledgerIds, ['personal']);
      await owner.put(`${NB}/${a.id}`).send({ extraLedgerIds: [BOOK] });
      assert.deepEqual((await owner.put(`${NB}/${a.id}`).send({ bookId: null })).body.ledgerIds, []);
      assert.deepEqual(await links(), []);
      assert.equal((await owner.post(NB).send({ name: 'Many', bookId: BOOK, extraLedgerIds: Array.from({ length: 51 }, (_, i) => `l${i}`) })).status, 400);
    });

    it('ledger-notebooks lists notebooks shared into the ledger; deleting cleans links', async () => {
      const a = await share(); await linked('Other');
      assert.deepEqual((await owner.get('/api/diary/ledger-notebooks?bookId=personal')).body.map(n => n.name), ['Family']);
      assert.deepEqual((await outsider.get('/api/diary/ledger-notebooks?bookId=personal')).body.map(n => n.name), ['Family']);
      assert.equal((await outsider.delete(`${NB}/${a.id}`)).status, 403); // Admin only through the extra ledger: view only
      assert.equal((await owner.delete(`${NB}/${a.id}`)).status, 200);
      assert.deepEqual(await links(), []);
      const b = await share('Again');
      await ctx.repo.books.remove('personal');
      assert.deepEqual(await links(), []);
      assert.ok(b.id);
    });

    it('access codes read through an extra ledger, never write', async () => {
      const a = await share();
      const made = await owner.post('/api/admin/access-codes').send({ name: 'Board', bookIds: ['personal'], resources: ['diary'] });
      const res = await request(ctx.app).post('/api/auth/access-code').set('cf-connecting-ip', '10.7.7.8').send({ code: made.body.accessCode.code });
      const code = withCookie(ctx.app, res.headers['set-cookie'][0].split(';')[0]);
      assert.deepEqual((await code.get(NB)).body.map(n => [n.name, n.canEdit]), [['Family', false]]);
      assert.equal((await code.get(`${NB}/${a.id}/entries`)).status, 200);
      assert.equal((await code.post(`${NB}/${a.id}/entries`).send({ date: '2026-02-01', title: 'z' })).status, 403);
      assert.equal((await code.put(`${NB}/${a.id}`).send({ extraLedgerIds: [] })).status, 403);
    });
  });

  describe('access codes', () => {
    const codeApi = async (resources, bookIds = [BOOK]) => {
      const made = await owner.post('/api/admin/access-codes').send({ name: 'Board', bookIds, ...(resources ? { resources } : {}) });
      assert.equal(made.status, 201);
      const res = await request(ctx.app).post('/api/auth/access-code').set('cf-connecting-ip', '10.7.7.7').send({ code: made.body.accessCode.code });
      assert.equal(res.status, 200);
      return withCookie(ctx.app, res.headers['set-cookie'][0].split(';')[0]);
    };

    it('reads only the notebooks linked to its ledgers, and changes nothing', async () => {
      const fam = await linked('Family');
      const cat = (await owner.post(`${NB}/${fam.id}/categories`).send({ name: 'Cars' })).body;
      const note = (await entry(fam.id, { title: 'Insurance' })).body;
      const priv = await unlinked('Private');
      const car = (await owner.post(NB).send({ name: 'Car', bookId: 'personal' })).body;
      const code = await codeApi(['diary']);
      const list = (await code.get(NB)).body;
      assert.deepEqual(list.map(n => [n.name, n.canEdit, n.canDelete, n.canRelink]), [['Family', false, false, false]]);
      assert.equal((await code.get(`${NB}/${fam.id}/categories`)).body.length, 1);
      assert.equal((await code.get(`${NB}/${fam.id}/entries`)).body.length, 1);
      assert.equal((await code.get(`${NB}/${fam.id}/upcoming`)).status, 200);
      assert.equal((await code.get(`${NB}/${fam.id}/names`)).status, 200);
      for (const nb of [car.id, priv.id]) {
        assert.equal((await code.get(`${NB}/${nb}/entries`)).status, 404);
        assert.equal((await code.get(`${NB}/${nb}/categories`)).status, 404);
      }
      const writes = [
        ['post', NB, { name: 'x', bookId: BOOK }], ['put', `${NB}/${fam.id}`, { name: 'y' }], ['delete', `${NB}/${fam.id}`],
        ['post', `${NB}/${fam.id}/entries`, { date: '2026-02-01', title: 'z' }], ['put', `${NB}/${fam.id}/entries/${note.id}`, { title: 'z' }],
        ['delete', `${NB}/${fam.id}/entries/${note.id}`], ['post', `${NB}/${fam.id}/categories`, { name: 'New' }],
        ['put', `${NB}/${fam.id}/categories/${cat.id}`, { name: 'New' }], ['delete', `${NB}/${fam.id}/categories/${cat.id}`]
      ];
      for (const [method, url, body] of writes) assert.equal((await code[method](url).send(body)).status, 403, `${method} ${url}`);
      assert.equal((await owner.get(`${NB}/${fam.id}/entries`)).body.length, 1);
    });

    it('names only ledgers the code can open, and still lets it read shared notebooks', async () => {
      await ctx.d1.prepare("INSERT INTO books (id, name, created_at) VALUES ('vault', 'Vault', ?)").bind(new Date().toISOString()).run();
      const both = (await owner.post(NB).send({ name: 'Main A', bookId: BOOK, extraLedgerIds: ['personal'] })).body; // main A shared into B
      const hidden = (await owner.post(NB).send({ name: 'Main C', bookId: 'vault', extraLedgerIds: [BOOK] })).body; // main C (not openable) shared into A
      await owner.post(`${NB}/${hidden.id}/entries`).send({ date: '2026-02-01', title: 'Note in C' }).expect(201);
      assert.deepEqual((await owner.get(NB)).body.find(n => n.id === hidden.id).ledgerNames, ['Vault', 'Family']);
      const code = await codeApi(['diary'], [BOOK, 'personal']);
      const list = (await code.get(NB)).body;
      const a = list.find(n => n.id === both.id); const c = list.find(n => n.id === hidden.id);
      assert.deepEqual(a.ledgerIds, [BOOK, 'personal']); assert.equal(a.bookId, BOOK);
      assert.deepEqual(c.ledgerIds, [BOOK]); assert.deepEqual(c.ledgerNames, ['Family']);
      assert.equal(c.bookId, BOOK); assert.equal(c.bookName, 'Family');
      assert.ok(!JSON.stringify(list).toLowerCase().includes('vault'));
      const entries = await code.get(`${NB}/${hidden.id}/entries`);
      assert.equal(entries.status, 200); assert.equal(entries.body.length, 1);
      assert.ok(!JSON.stringify(entries.body).toLowerCase().includes('vault'));
    });

    it('is refused without the Notebook page', async () => {
      await linked('Family');
      const code = await codeApi(['dashboard']);
      assert.equal((await code.get(NB)).status, 403);
    });
  });
});
