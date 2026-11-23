const { AuthError, RateLimitedError, ValidationError } = require('../errors');
const password = require('./password');

const MIN_PASSWORD_LENGTH = 6;
const LOCK_AFTER_FAILURES = 5;
const LOCK_MINUTES = 15;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const normalizeEmail = email => String(email || '').trim().toLowerCase();
const USERNAME_PATTERN = /^[a-z0-9][a-z0-9._-]{1,39}$/;
const normalizeUsername = name => String(name || '').trim().toLowerCase();
// A username made from an email's part before the "@" (used when none is given).
const usernameFromEmail = email => {
  const base = normalizeEmail(email).split('@')[0].replace(/[^a-z0-9._-]+/g, '-').replace(/^[^a-z0-9]+/, '').slice(0, 36);
  return base.length >= 2 ? base : 'user';
};

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
  // A login is an email (it contains "@", which a username never does) or a username.
  const findByLogin = login => {
    const value = String(login || '').trim().toLowerCase();
    return value.includes('@') ? accounts.findByEmail(value) : accounts.findByUsername(value);
  };

  return {
    async create({ username, email, name, password: pw, isSuperAdmin = false, memberships = [], loanMemberships = [], resources = null }) {
      const normalized = normalizeEmail(email);
      if (normalized && !EMAIL_PATTERN.test(normalized)) throw new ValidationError('A valid email address is required');
      if (!normalized && !String(username || '').trim()) throw new ValidationError('A username or an email is required');
      let uname = normalizeUsername(username);
      if (uname) {
        if (!USERNAME_PATTERN.test(uname)) throw new ValidationError('Username: 2-40 letters, digits, dots, dashes or underscores, starting with a letter or digit');
        if (await accounts.findByUsername(uname)) throw new ValidationError('That username is already taken');
      } else {
        // No username given: take the email's local part, numbered when it is taken.
        const base = usernameFromEmail(normalized);
        uname = base;
        for (let n = 2; await accounts.findByUsername(uname); n += 1) uname = `${base.slice(0, 36)}${n}`;
      }
      if (!String(name || '').trim()) throw new ValidationError('Name is required');
      const passwordHash = await hashPassword(pw);
      const now = new Date().toISOString();
      const account = await accounts.insert({
        username: uname,
        email: normalized || null,
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
    findByLogin,

    // Checks the password and applies the lockout rules. Returns the public account on success.
    async authenticate(login, pw) {
      const account = await findByLogin(login);
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
    async resetPassword(login, pw) {
      const account = await findByLogin(login);
      if (!account) throw new ValidationError('No account with that username or email');
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

module.exports = { EMAIL_PATTERN, createAccountStore, hashPassword, normalizeEmail, normalizeUsername, USERNAME_PATTERN, MIN_PASSWORD_LENGTH, LOCK_AFTER_FAILURES };
