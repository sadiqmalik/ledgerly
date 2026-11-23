const crypto = require('crypto');
const { ValidationError } = require('../../errors');
const { RESOURCES } = require('../resources');

// Cloudflare D1 storage for accounts, sessions, books and the account log.
// Plain-object shapes for accounts, sessions and books. Dates are ISO text in D1 and Date objects here.
const DUPLICATE_EMAIL = 'An account with this email already exists';

const isDuplicate = error => /UNIQUE constraint failed/i.test(String((error && error.message) || ''));
// D1 rejects undefined as a bind value.
const bindable = value => (value === undefined ? null : value);
const newId = () => crypto.randomBytes(12).toString('hex');
const toDate = text => (text === null || text === undefined ? null : new Date(text));
const iso = value => (value instanceof Date ? value.toISOString() : value);

// Account fields that may be updated, mapped to their columns. memberships is stored as JSON.
const ACCOUNT_COLUMNS = {
  email: 'email',
  name: 'name',
  passwordHash: 'password_hash',
  isSuperAdmin: 'is_super_admin',
  memberships: 'memberships',
  loanMemberships: 'loan_memberships',
  resources: 'resources',
  disabled: 'disabled',
  failedLogins: 'failed_logins',
  lockedUntil: 'locked_until',
  lastLoginAt: 'last_login_at',
  createdAt: 'created_at',
  updatedAt: 'updated_at'
};

// Stored resources must be a JSON array of known keys. NULL is allowed only where the caller says so (an
// account with no list yet); anything malformed throws instead of widening access.
const parseResources = (text, { nullable }) => {
  if (text === null || text === undefined) {
    if (nullable) return null;
    throw new Error('Stored resources are missing');
  }
  let value;
  try { value = JSON.parse(text); } catch { throw new Error('Stored resources are not valid JSON'); }
  if (!Array.isArray(value) || value.some(key => !RESOURCES.includes(key))) throw new Error('Stored resources are invalid');
  return value;
};

const toAccount = row => ({
  id: row.id,
  email: row.email,
  name: row.name,
  passwordHash: row.password_hash,
  isSuperAdmin: row.is_super_admin === 1,
  memberships: JSON.parse(row.memberships || '[]'),
  loanMemberships: JSON.parse(row.loan_memberships || '[]'),
  resources: parseResources(row.resources, { nullable: true }),
  disabled: row.disabled === 1,
  failedLogins: row.failed_logins || 0,
  lockedUntil: row.locked_until ?? null,
  lastLoginAt: row.last_login_at ?? null,
  createdAt: row.created_at ?? null,
  updatedAt: row.updated_at ?? null
});

const toSession = row => ({
  id: row.id,
  accountId: row.account_id,
  createdAt: toDate(row.created_at),
  lastSeenAt: toDate(row.last_seen_at),
  expiresAt: toDate(row.expires_at),
  absoluteExpiresAt: toDate(row.absolute_expires_at),
  accessCodeId: row.access_code_id ?? null
});

const parseBookResources = text => {
  if (!text) return {};
  try {
    const v = JSON.parse(text);
    if (!v || typeof v !== 'object' || Array.isArray(v)) return {};
    return Object.fromEntries(Object.entries(v).filter(([, list]) => Array.isArray(list) && list.every(key => RESOURCES.includes(key))));
  } catch { return {}; }
};

const toAccessCode = row => ({
  id: row.id,
  name: row.name,
  codeHash: row.code_hash,
  bookIds: JSON.parse(row.book_ids || '[]'),
  resources: parseResources(row.resources, { nullable: false }),
  bookResources: parseBookResources(row.book_resources),
  createdBy: row.created_by,
  createdAt: row.created_at,
  revokedAt: row.revoked_at ?? null,
  lastUsedAt: row.last_used_at ?? null
});

const createD1AuthStore = db => {
  const prep = (sql, ...args) => db.prepare(sql).bind(...args.map(bindable));
  const rows = async (sql, ...args) => (await prep(sql, ...args).all()).results || [];
  const one = (sql, ...args) => prep(sql, ...args).first();

  return {
    driver: 'd1',

    // Removes sessions past their idle or absolute expiry. Returns how many were removed.
    async purgeExpiredSessions(now) {
      const at = iso(now);
      const result = await prep('DELETE FROM sessions WHERE expires_at < ? OR absolute_expires_at < ?', at, at).run();
      const old = new Date(new Date(at).getTime() - 24 * 60 * 60 * 1000).toISOString();
      await prep('DELETE FROM access_code_attempts WHERE window_started < ? AND (locked_until IS NULL OR locked_until < ?)', old, old).run();
      return (result.meta && result.meta.changes) || 0;
    },

    accounts: {
      async insert(account) {
        const id = newId();
        try {
          await prep(
            `INSERT INTO accounts (id, email, name, password_hash, is_super_admin, memberships, resources, disabled,
              failed_logins, locked_until, last_login_at, created_at, updated_at, loan_memberships)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            id, account.email, account.name, account.passwordHash, account.isSuperAdmin ? 1 : 0,
            JSON.stringify(account.memberships || []), Array.isArray(account.resources) ? JSON.stringify(account.resources) : null,
            account.disabled ? 1 : 0, account.failedLogins || 0,
            account.lockedUntil ?? null, account.lastLoginAt ?? null, account.createdAt, account.updatedAt ?? null,
            JSON.stringify(account.loanMemberships || [])
          ).run();
        } catch (error) {
          if (isDuplicate(error)) throw new ValidationError(DUPLICATE_EMAIL);
          throw error;
        }
        return { ...account, id };
      },

      async findById(id) {
        const row = await one('SELECT * FROM accounts WHERE id = ?', String(id));
        return row ? toAccount(row) : null;
      },

      async findByEmail(email) {
        const row = await one('SELECT * FROM accounts WHERE email = ?', email);
        return row ? toAccount(row) : null;
      },

      async update(id, fields) {
        const keys = Object.keys(fields);
        if (keys.length === 0) return;
        const assignments = keys.map(key => {
          if (!ACCOUNT_COLUMNS[key]) throw new Error(`Unknown account field: ${key}`);
          return `${ACCOUNT_COLUMNS[key]} = ?`;
        });
        const values = keys.map(key => {
          if (key === 'memberships' || key === 'loanMemberships') return JSON.stringify(fields[key]);
          if (key === 'resources') return Array.isArray(fields[key]) ? JSON.stringify(fields[key]) : null;
          if (key === 'isSuperAdmin' || key === 'disabled') return fields[key] ? 1 : 0;
          return fields[key];
        });
        await prep(`UPDATE accounts SET ${assignments.join(', ')} WHERE id = ?`, ...values, String(id)).run();
      },

      // Atomic failed-login increment: parallel bad logins cannot lose a count. Returns { failedLogins, lockedUntil }.
      async recordFailedLogin(id, lockAfter, lockUntil, now) {
        const row = await one(
          `UPDATE accounts SET failed_logins = failed_logins + 1, updated_at = ?,
             locked_until = CASE WHEN failed_logins + 1 >= ? THEN ? ELSE locked_until END
           WHERE id = ? RETURNING failed_logins, locked_until`, now, lockAfter, lockUntil, String(id));
        return row ? { failedLogins: row.failed_logins, lockedUntil: row.locked_until ?? null } : null;
      },

      async delete(id) {
        await prep('DELETE FROM accounts WHERE id = ?', String(id)).run();
      },

      async list() {
        return (await rows('SELECT * FROM accounts ORDER BY email')).map(toAccount);
      },

      async count() {
        const row = await one('SELECT COUNT(*) AS n FROM accounts');
        return row ? row.n : 0;
      }
    },

    sessions: {
      async insert({ id, accountId, createdAt, lastSeenAt, expiresAt, absoluteExpiresAt, accessCodeId }) {
        await prep(
          'INSERT INTO sessions (id, account_id, created_at, last_seen_at, expires_at, absolute_expires_at, access_code_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
          id, String(accountId), iso(createdAt), iso(lastSeenAt), iso(expiresAt), iso(absoluteExpiresAt), accessCodeId ?? null
        ).run();
      },

      async find(id) {
        const row = await one('SELECT * FROM sessions WHERE id = ?', id);
        return row ? toSession(row) : null;
      },

      async update(id, { lastSeenAt, expiresAt }) {
        await prep(
          'UPDATE sessions SET last_seen_at = ?, expires_at = ? WHERE id = ?',
          iso(lastSeenAt), iso(expiresAt), id
        ).run();
      },

      async delete(id) {
        await prep('DELETE FROM sessions WHERE id = ?', id).run();
      },

      async deleteByAccount(accountId) {
        await prep('DELETE FROM sessions WHERE account_id = ?', String(accountId)).run();
      },

      async deleteByAccessCode(accessCodeId) {
        await prep('DELETE FROM sessions WHERE access_code_id = ?', String(accessCodeId)).run();
      }
    },

    accessCodes: {
      async insert({ name, codeHash, bookIds, resources, bookResources = {}, createdBy, createdAt }) {
        const id = newId();
        await prep(
          'INSERT INTO access_codes (id, name, code_hash, book_ids, resources, book_resources, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
          id, name, codeHash, JSON.stringify(bookIds), JSON.stringify(resources), JSON.stringify(bookResources), createdBy, createdAt
        ).run();
        return { id, name, codeHash, bookIds, resources, bookResources, createdBy, createdAt, revokedAt: null, lastUsedAt: null };
      },

      async findById(id) {
        const row = await one('SELECT * FROM access_codes WHERE id = ?', String(id));
        return row ? toAccessCode(row) : null;
      },

      async findByHash(codeHash) {
        const row = await one('SELECT * FROM access_codes WHERE code_hash = ?', codeHash);
        return row ? toAccessCode(row) : null;
      },

      async list() {
        return (await rows('SELECT * FROM access_codes ORDER BY created_at DESC, id')).map(toAccessCode);
      },

      async revoke(id, at) {
        await db.batch([
          prep('UPDATE access_codes SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL', at, String(id)),
          prep('DELETE FROM access_code_loans WHERE code_id = ?', String(id))
        ]);
      },

      // Brings a revoked code back (its secret is unchanged). Loans shared with it before the revoke stay unshared.
      async restore(id) {
        await prep('UPDATE access_codes SET revoked_at = NULL WHERE id = ?', String(id)).run();
      },

      // Loan registers shared with a code (view-only), and the codes a register is shared with.
      async loanIds(codeId) {
        return (await rows('SELECT register_id FROM access_code_loans WHERE code_id = ? ORDER BY register_id', String(codeId))).map(r => r.register_id);
      },
      async codeIdsForLoan(registerId) {
        return (await rows('SELECT code_id FROM access_code_loans WHERE register_id = ? ORDER BY code_id', String(registerId))).map(r => r.code_id);
      },
      // Replaces the set of codes a register is shared with, in one batch.
      async setLoanCodes(registerId, codeIds, at) {
        await db.batch([
          prep('DELETE FROM access_code_loans WHERE register_id = ?', String(registerId)),
          ...codeIds.map(codeId => prep('INSERT INTO access_code_loans (code_id, register_id, created_at) VALUES (?, ?, ?)', String(codeId), String(registerId), at))
        ]);
      },

      // Only an active code can change its secret. The sessions started with the old secret end in the same
      // batch. Returns how many code rows changed.
      async replaceHash(id, codeHash) {
        const [result] = await db.batch([
          prep('UPDATE access_codes SET code_hash = ? WHERE id = ? AND revoked_at IS NULL', codeHash, String(id)),
          prep('DELETE FROM sessions WHERE access_code_id = ?', String(id))
        ]);
        return (result.meta && result.meta.changes) || 0;
      },

      // Permanently removes a code and the sessions started with it in one batch. Returns how many code rows went.
      async remove(id) {
        const [, , result] = await db.batch([
          prep('DELETE FROM sessions WHERE access_code_id = ?', String(id)),
          prep('DELETE FROM access_code_loans WHERE code_id = ?', String(id)),
          prep('DELETE FROM access_codes WHERE id = ?', String(id))
        ]);
        return (result.meta && result.meta.changes) || 0;
      },

      async setResources(id, resources, bookResources = {}, bookIds) {
        if (bookIds) {
          await prep('UPDATE access_codes SET resources = ?, book_resources = ?, book_ids = ? WHERE id = ?', JSON.stringify(resources), JSON.stringify(bookResources), JSON.stringify(bookIds), String(id)).run();
          return;
        }
        await prep('UPDATE access_codes SET resources = ?, book_resources = ? WHERE id = ?', JSON.stringify(resources), JSON.stringify(bookResources), String(id)).run();
      },

      async touch(id, at) {
        await prep('UPDATE access_codes SET last_used_at = ? WHERE id = ?', at, String(id)).run();
      }
    },

    // Failed access-code guesses, per throttle key.
    attempts: {
      async get(key) {
        const row = await one('SELECT * FROM access_code_attempts WHERE key = ?', key);
        return row ? { failures: row.failures, windowStarted: row.window_started, lockedUntil: row.locked_until ?? null } : null;
      },

      // One atomic upsert: counts the failure, restarts an expired window or lock, and sets the lock at max.
      // An active lock is left untouched, so guesses already in flight cannot shorten or extend it.
      async recordFailure(key, { max, windowMs, lockMs, now }) {
        const at = iso(now);
        const cutoff = new Date(now.getTime() - windowMs).toISOString();
        const lockUntil = new Date(now.getTime() + lockMs).toISOString();
        const locked = 'locked_until IS NOT NULL AND locked_until > ?1';
        const stale = '(locked_until IS NOT NULL AND locked_until <= ?1) OR window_started < ?2';
        const next = `(CASE WHEN ${stale} THEN 1 ELSE failures + 1 END)`;
        await prep(
          `INSERT INTO access_code_attempts (key, failures, window_started, locked_until)
             VALUES (?5, 1, ?1, CASE WHEN 1 >= ?3 THEN ?4 ELSE NULL END)
           ON CONFLICT(key) DO UPDATE SET
             failures = CASE WHEN ${locked} THEN failures ELSE ${next} END,
             window_started = CASE WHEN ${locked} THEN window_started WHEN ${stale} THEN ?1 ELSE window_started END,
             locked_until = CASE WHEN ${locked} THEN locked_until WHEN ${next} >= ?3 THEN ?4 ELSE NULL END`,
          at, cutoff, max, lockUntil, key
        ).run();
      },

      async clear(key) {
        await prep('DELETE FROM access_code_attempts WHERE key = ?', key).run();
      }
    },

    books: {
      async list() {
        return rows('SELECT id, name, base_currency, created_at, updated_at, active FROM books ORDER BY name');
      },

      async existingIds(ids) {
        if (ids.length === 0) return [];
        const found = [];
        for (let i = 0; i < ids.length; i += 50) {
          const chunk = ids.slice(i, i + 50);
          const marks = chunk.map(() => '?').join(', ');
          found.push(...(await rows(`SELECT id FROM books WHERE id IN (${marks})`, ...chunk)).map(r => r.id));
        }
        return found;
      }
    },

    loanRegisters: {
      async existingIds(ids) {
        if (ids.length === 0) return [];
        const found = [];
        for (let i = 0; i < ids.length; i += 50) {
          const chunk = ids.slice(i, i + 50);
          const marks = chunk.map(() => '?').join(', ');
          found.push(...(await rows(`SELECT id FROM loan_registers WHERE id IN (${marks})`, ...chunk)).map(r => r.id));
        }
        return found;
      }
    },

    log: {
      async insert({ actor, action, target, detail, at }) {
        await prep(
          'INSERT INTO account_log (id, actor, action, target, detail, at) VALUES (?, ?, ?, ?, ?, ?)',
          newId(), JSON.stringify(actor), action, target, JSON.stringify(detail || {}), at
        ).run();
      },

      async list({ target } = {}) {
        const found = target === undefined
          ? await rows('SELECT * FROM account_log ORDER BY at')
          : await rows('SELECT * FROM account_log WHERE target = ? ORDER BY at', target);
        return found.map(row => ({
          id: row.id,
          actor: JSON.parse(row.actor),
          action: row.action,
          target: row.target,
          detail: JSON.parse(row.detail),
          at: row.at
        }));
      }
    }
  };
};

module.exports = { createD1AuthStore };
