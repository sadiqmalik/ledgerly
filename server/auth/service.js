const crypto = require('crypto');
const { createAccountStore } = require('./accounts');
const { createAccessCodeService } = require('./accessCodes');
const { AuthError } = require('../errors');
const { effectiveResources } = require('./resources');

const COOKIE = 'lsid';

// Only a hash of the session id is stored, so a leaked database cannot be used to sign in.
const hashSid = sid => crypto.createHash('sha256').update(sid).digest('hex');

const publicAccount = account => ({
  id: String(account.id),
  email: account.email,
  name: account.name,
  isSuperAdmin: Boolean(account.isSuperAdmin),
  memberships: account.memberships || [],
  loanMemberships: account.loanMemberships || [],
  resources: effectiveResources(account),
  ...(account.accessCode ? { accessCode: true } : {})
});

// store: the D1 storage object from stores/d1.js (repo.authStore).
const createAuthService = (store, { idleMinutes = 720, absoluteDays = 7, cookieSecure = true } = {}) => {
  const accounts = createAccountStore(store);
  const accessCodes = createAccessCodeService(store);
  const sessions = store.sessions;
  const idleMs = idleMinutes * 60 * 1000;
  const absoluteMs = absoluteDays * 24 * 60 * 60 * 1000;

  const readCookie = header => {
    const part = (header || '').split(';').map(p => p.trim()).find(p => p.startsWith(`${COOKIE}=`));
    return part ? part.slice(COOKIE.length + 1) : null;
  };

  const setCookie = (sid, maxAgeSeconds) => [
    `${COOKIE}=${sid}`,
    'Path=/api',
    'HttpOnly',
    'SameSite=Strict',
    `Max-Age=${maxAgeSeconds}`,
    ...(cookieSecure ? ['Secure'] : [])
  ].join('; ');

  const createSession = async (accountId, accessCodeId = null) => {
    const sid = crypto.randomBytes(32).toString('base64url');
    const now = new Date();
    await sessions.insert({
      id: hashSid(sid),
      accountId: String(accountId),
      createdAt: now,
      lastSeenAt: now,
      expiresAt: new Date(now.getTime() + idleMs),
      absoluteExpiresAt: new Date(now.getTime() + absoluteMs),
      accessCodeId
    });
    return sid;
  };

  // Returns the signed-in account, or null. Each valid use slides the idle expiry forward,
  // but never past the absolute expiry.
  const resolve = async sid => {
    if (!sid) return null;
    const id = hashSid(sid);
    const session = await sessions.find(id);
    if (!session) return null;
    const now = new Date();
    if (session.expiresAt <= now || session.absoluteExpiresAt <= now) {
      await sessions.delete(id);
      return null;
    }
    let account;
    if (session.accessCodeId) {
      account = await accessCodes.resolve(session.accessCodeId);
      if (!account) {
        await sessions.delete(id);
        return null;
      }
    } else {
      account = await store.accounts.findById(session.accountId);
      if (!account || account.disabled) {
        await sessions.delete(id);
        return null;
      }
    }
    const expiresAt = new Date(Math.min(now.getTime() + idleMs, session.absoluteExpiresAt.getTime()));
    await sessions.update(id, { lastSeenAt: now, expiresAt });
    return publicAccount(account);
  };

  return {
    store,
    accounts,
    accessCodes,
    idleSeconds: Math.floor(idleMs / 1000),
    setCookie,
    clearCookie: () => setCookie('', 0),
    readCookie,
    createSession,

    async login(email, password) {
      const account = await accounts.authenticate(email, password);
      const sid = await createSession(account.id);
      return { sid, account: publicAccount(account) };
    },

    async loginWithCode(code, clientId) {
      const saved = await accessCodes.authenticate(code, clientId);
      const principal = accessCodes.principalFor(saved, await store.accessCodes.loanIds(saved.id));
      const sid = await createSession(principal.id, saved.id);
      // A revoke or reset can land between the check and the insert; do not hand out a session for a code that
      // is revoked or whose secret changed. A reset after this check deletes the session atomically.
      const latest = await store.accessCodes.findById(saved.id);
      if (!latest || latest.revokedAt || latest.codeHash !== saved.codeHash) {
        await sessions.delete(hashSid(sid));
        throw new AuthError('Invalid access code');
      }
      return { sid, account: publicAccount(principal) };
    },

    fromRequest: req => resolve(readCookie(req.headers.cookie)),

    async signOutAccount(accountId) {
      await sessions.deleteByAccount(accountId);
    },

    async logout(sid) {
      if (sid) await sessions.delete(hashSid(sid));
    }
  };
};

module.exports = { createAuthService, publicAccount, COOKIE };
