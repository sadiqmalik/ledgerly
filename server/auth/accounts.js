const { AuthError, RateLimitedError, ValidationError } = require('../errors');
const password = require('./password');

const MIN_PASSWORD_LENGTH = 12;
const LOCK_AFTER_FAILURES = 5;
const LOCK_MINUTES = 15;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const normalizeEmail = email => String(email || '').trim().toLowerCase();

const validatePassword = pw => {
  if (typeof pw !== 'string' || pw.length < MIN_PASSWORD_LENGTH) {
    throw new ValidationError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
  }
};

const hashPassword = pw => {
  validatePassword(pw);
  return password.hashPassword(pw);
};

// Used when the email is unknown, so unknown and known accounts take similar time to check.
// Made on first use: Workers forbid random values (the salt) at module load.
let dummyHashPromise;
const dummyHash = () => (dummyHashPromise ??= password.hashPassword('timing-equaliser-not-a-password'));

// store: the D1 storage object from stores/d1.js (repo.authStore).
const createAccountStore = store => {
  const accounts = store.accounts;

  const publicAccount = ({ passwordHash, failedLogins, lockedUntil, ...rest }) => rest;

  const findByEmail = email => accounts.findByEmail(normalizeEmail(email));

  return {
    async create({ email, name, password: pw, isSuperAdmin = false, memberships = [], loanMemberships = [], resources = null }) {
      const normalized = normalizeEmail(email);
      if (!EMAIL_PATTERN.test(normalized)) throw new ValidationError('A valid email address is required');
      if (!String(name || '').trim()) throw new ValidationError('Name is required');
      const passwordHash = await hashPassword(pw);
      const now = new Date().toISOString();
      const account = await accounts.insert({
        email: normalized,
        name: String(name).trim(),
        passwordHash,
        isSuperAdmin: Boolean(isSuperAdmin),
        memberships,
        loanMemberships,
        resources,
        disabled: false,
        failedLogins: 0,
        lockedUntil: null,
        lastLoginAt: null,
        createdAt: now,
        updatedAt: now
      });
      return publicAccount(account);
    },

    findByEmail,

    // Checks the password and applies the lockout rules. Returns the public account on success.
    async authenticate(email, pw) {
      const account = await findByEmail(email);
      const now = new Date();
      if (!account || account.disabled) {
        await password.verifyPassword(await dummyHash(),String(pw || ''));
        throw new AuthError();
      }
      if (account.lockedUntil && new Date(account.lockedUntil) > now) {
        throw new RateLimitedError();
      }
      const ok = await password.verifyPassword(account.passwordHash, String(pw || ''));
      if (!ok) {
        const lockUntil = new Date(now.getTime() + LOCK_MINUTES * 60 * 1000).toISOString();
        const after = await accounts.recordFailedLogin(account.id, LOCK_AFTER_FAILURES, lockUntil, now.toISOString());
        if (after && after.lockedUntil && new Date(after.lockedUntil) > now) throw new RateLimitedError();
        throw new AuthError();
      }
      const update = { failedLogins: 0, lockedUntil: null, lastLoginAt: now.toISOString() };
      await accounts.update(account.id, update);
      return publicAccount({ ...account, ...update });
    },

    // Sets a new password, clears any lockout, and signs the account out everywhere.
    async resetPassword(email, pw) {
      const account = await findByEmail(email);
      if (!account) throw new ValidationError('No account with that email');
      const passwordHash = await hashPassword(pw);
      await accounts.update(account.id, { passwordHash, failedLogins: 0, lockedUntil: null, updatedAt: new Date().toISOString() });
      await store.sessions.deleteByAccount(account.id);
      return publicAccount({ ...account, passwordHash });
    },

    async count() {
      return accounts.count();
    }
  };
};

module.exports = { createAccountStore, hashPassword, normalizeEmail, MIN_PASSWORD_LENGTH, LOCK_AFTER_FAILURES };
