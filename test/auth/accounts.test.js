const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { createAccountStore, LOCK_AFTER_FAILURES } = require('../../server/auth/accounts');
const { makeContext } = require('../api/helpers');

const PASSWORD = 'correct horse battery staple';

describe('accounts (D1)', () => {
  let ctx;
  let store;

  beforeEach(async () => {
    ctx = await makeContext();
    store = createAccountStore(ctx.repo.authStore);
  });

  afterEach(async () => {
    await ctx.close();
  });

  const storedRow = email => ctx.d1.prepare('SELECT * FROM accounts WHERE email = ?').bind(email).first();

  it('stores a PBKDF2 hash, never the password', async () => {
    await store.create({ email: 'Admin@Example.com ', name: 'Admin', password: PASSWORD, isSuperAdmin: true });
    const stored = await storedRow('admin@example.com');
    assert.ok(stored, 'email is normalised to lower case');
    assert.ok(stored.password_hash.startsWith('pbkdf2$100000$'));
    assert.ok(!JSON.stringify(stored).includes(PASSWORD));
  });

  it('never returns the hash or lockout fields', async () => {
    const account = await store.create({ email: 'a@example.com', name: 'A', password: PASSWORD });
    assert.equal(account.passwordHash, undefined);
    assert.equal(account.failedLogins, undefined);
    assert.equal(account.lockedUntil, undefined);
  });

  it('a wrong password fails against a PBKDF2 hash', async () => {
    await store.create({ email: 'a@example.com', name: 'A', password: PASSWORD });
    const wrong = await store.authenticate('a@example.com', 'correct horse battery stapl').catch(e => e);
    assert.equal(wrong.status, 401);
  });

  it('a legacy argon2 hash never signs in and is left as it is (the account needs a password reset)', async () => {
    const now = new Date().toISOString();
    const legacyHash = '$argon2id$v=19$m=65536,t=3,p=4$c2FsdHNhbHRzYWx0$aGFzaGhhc2hoYXNoaGFzaGhhc2hoYXNo';
    await ctx.repo.authStore.accounts.insert({
      email: 'legacy@example.com', name: 'Legacy', passwordHash: legacyHash, isSuperAdmin: false, memberships: [],
      disabled: false, failedLogins: 0, lockedUntil: null, lastLoginAt: null, createdAt: now, updatedAt: now
    });
    const refused = await store.authenticate('legacy@example.com', PASSWORD).catch(e => e);
    assert.equal(refused.status, 401);
    assert.equal((await storedRow('legacy@example.com')).password_hash, legacyHash);
  });

  it('accepts the right password and records the login', async () => {
    await store.create({ email: 'a@example.com', name: 'A', password: PASSWORD });
    const account = await store.authenticate('a@example.com', PASSWORD);
    assert.equal(account.email, 'a@example.com');
    const stored = await store.findByEmail('a@example.com');
    assert.ok(stored.lastLoginAt);
    assert.equal(stored.failedLogins, 0);
  });

  it('gives the same generic error for a wrong password and an unknown email', async () => {
    await store.create({ email: 'a@example.com', name: 'A', password: PASSWORD });
    const wrong = await store.authenticate('a@example.com', 'not the password at all').catch(e => e);
    const unknown = await store.authenticate('nobody@example.com', PASSWORD).catch(e => e);
    assert.equal(wrong.status, 401);
    assert.equal(unknown.status, 401);
    assert.equal(wrong.message, unknown.message);
  });

  it('locks the account after repeated failures, even with the right password', async () => {
    await store.create({ email: 'a@example.com', name: 'A', password: PASSWORD });
    for (let i = 0; i < LOCK_AFTER_FAILURES; i++) {
      await store.authenticate('a@example.com', 'wrong-wrong-wrong').catch(() => {});
    }
    const locked = await store.authenticate('a@example.com', PASSWORD).catch(e => e);
    assert.equal(locked.status, 429);
    const stored = await store.findByEmail('a@example.com');
    assert.ok(new Date(stored.lockedUntil) > new Date());
  });

  it('a password reset clears the lockout and sets the new password', async () => {
    await store.create({ email: 'a@example.com', name: 'A', password: PASSWORD });
    for (let i = 0; i < LOCK_AFTER_FAILURES; i++) {
      await store.authenticate('a@example.com', 'wrong-wrong-wrong').catch(() => {});
    }
    await store.resetPassword('a@example.com', 'a brand new passphrase');
    const account = await store.authenticate('a@example.com', 'a brand new passphrase');
    assert.equal(account.email, 'a@example.com');
  });

  it('a disabled account cannot sign in', async () => {
    await store.create({ email: 'a@example.com', name: 'A', password: PASSWORD });
    await ctx.d1.prepare('UPDATE accounts SET disabled = 1 WHERE email = ?').bind('a@example.com').run();
    const result = await store.authenticate('a@example.com', PASSWORD).catch(e => e);
    assert.equal(result.status, 401);
  });

  it('refuses short passwords and duplicate emails', async () => {
    const short = await store.create({ email: 'a@example.com', name: 'A', password: 'short' }).catch(e => e);
    assert.equal(short.status, 400);
    await store.create({ email: 'a@example.com', name: 'A', password: PASSWORD });
    const dup = await store.create({ email: 'A@example.com', name: 'B', password: PASSWORD }).catch(e => e);
    assert.equal(dup.status, 400);
    assert.match(dup.message, /already exists/);
  });

  it('the unique email index is in place', async () => {
    const indexes = (await ctx.d1.prepare("PRAGMA index_list('accounts')").all()).results;
    const unique = indexes.filter(i => i.unique === 1);
    const emailIndex = await Promise.all(unique.map(async i => (await ctx.d1.prepare(`PRAGMA index_info('${i.name}')`).all()).results));
    assert.ok(emailIndex.some(cols => cols.length === 1 && cols[0].name === 'email'));
  });

  it('expired sessions can be found by their expiry index', async () => {
    const indexes = (await ctx.d1.prepare("PRAGMA index_list('sessions')").all()).results;
    assert.ok(indexes.some(i => i.name === 'sessions_expires_at'));
  });
});
