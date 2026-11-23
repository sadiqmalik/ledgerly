const crypto = require('crypto');
const { z } = require('zod');
const { DEFAULT_CODE_RESOURCES, RESOURCES, normalizeCodeResources: normalizeResources } = require('./resources');
const { AuthError, ConflictError, NotFoundError, RateLimitedError, ValidationError } = require('../errors');

// Access codes: named, revocable, viewer-only sign-in for chosen books.
// The code is shown once on creation; only its SHA-256 is stored. Admins may choose a simple code or
// leave it blank for a generated one (100 random bits). Guessing is throttled below.
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 32 symbols, no 0/O/1/I
const CODE_LENGTH = 20;
const GROUP = 5;

const IP_MAX_FAILURES = 8;
const GLOBAL_MAX_FAILURES = 200;
const WINDOW_MS = 15 * 60 * 1000;
const IP_LOCK_MS = 15 * 60 * 1000;
const GLOBAL_LOCK_MS = 5 * 60 * 1000;
const GLOBAL_KEY = 'all';

const generateCode = () => {
  const bytes = crypto.randomBytes(CODE_LENGTH);
  const chars = Array.from(bytes, b => ALPHABET[b % ALPHABET.length]);
  const groups = [];
  for (let i = 0; i < CODE_LENGTH; i += GROUP) groups.push(chars.slice(i, i + GROUP).join(''));
  return groups.join('-');
};

// Codes are exact and case-sensitive: only surrounding whitespace is trimmed. Returns null when the
// value cannot be a code (not text, wrong length, or control characters).
const MIN_LENGTH = 8;
const MAX_LENGTH = 64;
const normalizeCode = input => {
  if (typeof input !== 'string') return null;
  const clean = input.trim();
  return clean.length >= MIN_LENGTH && clean.length <= MAX_LENGTH && !/[\u0000-\u001f\u007f]/.test(clean) ? clean : null;
};

const hashCode = normalized => crypto.createHash('sha256').update(`access-code:${normalized}`).digest('hex');
const hashKey = value => crypto.createHash('sha256').update(String(value)).digest('hex').slice(0, 32);

const createSchema = z.object({
  name: z.string().trim().min(1).max(80),
  code: z.string().max(200).optional(),
  bookIds: z.array(z.string().min(1).max(64)).min(1).max(50),
  resources: z.array(z.enum(RESOURCES)).max(RESOURCES.length).optional(),
  bookResources: z.record(z.string().min(1).max(64), z.array(z.enum(RESOURCES)).max(RESOURCES.length)).optional()
});

const resourcesSchema = z.object({
  resources: z.array(z.enum(RESOURCES)).max(RESOURCES.length),
  bookResources: z.record(z.string().min(1).max(64), z.array(z.enum(RESOURCES)).max(RESOURCES.length)).optional(),
  bookIds: z.array(z.string().min(1).max(64)).min(1).max(50).optional()
}).strict();

// Only the code's own books keep a page list; each is normalised like the global one (no Settings for a code).
const cleanBookResources = (map, bookIds) => Object.fromEntries(
  Object.entries(map || {}).filter(([id]) => bookIds.includes(id)).map(([id, list]) => [id, normalizeResources(list)])
);

const parse = (schema, body) => {
  const result = schema.safeParse(body || {});
  if (!result.success) {
    const issue = result.error.issues[0];
    throw new ValidationError(`${issue.path.join('.') || 'request'}: ${issue.message}`);
  }
  return result.data;
};

// A blank code means: generate a strong random one. Otherwise the typed code must be valid.
const resolveCode = raw => {
  const custom = (raw || '').trim();
  if (custom && !normalizeCode(custom)) {
    throw new ValidationError(`code: must be ${MIN_LENGTH}-${MAX_LENGTH} characters without control characters`);
  }
  return { custom, code: custom || generateCode() };
};

const IN_USE = 'That access code is already in use. Choose another.';
const isUnique = error => /UNIQUE constraint failed/i.test(String((error && error.message) || ''));

const resetSchema = z.object({ code: z.string().max(200).optional() });

// The signed-in principal for a code session. Viewer role only, never super admin.
// loanIds: the loan registers shared with the code; each becomes a view-only loan membership.
const principalFor = (code, loanIds = []) => ({
  id: `code:${code.id}`,
  email: '',
  name: code.name,
  isSuperAdmin: false,
  accessCode: true,
  resources: normalizeResources(code.resources),
  memberships: code.bookIds.map(bookId => ({ bookId, role: 'viewer', ...(code.bookResources?.[bookId] ? { resources: normalizeResources(code.bookResources[bookId]) } : {}) })),
  loanMemberships: loanIds.map(registerId => ({ registerId, role: 'viewer' }))
});

const toView = code => ({
  id: code.id,
  name: code.name,
  bookIds: code.bookIds,
  resources: normalizeResources(code.resources),
  bookResources: cleanBookResources(code.bookResources, code.bookIds),
  createdBy: code.createdBy,
  createdAt: code.createdAt,
  lastUsedAt: code.lastUsedAt,
  revokedAt: code.revokedAt
});

// store: the D1 storage object from stores/d1.js (repo.authStore).
const scopeDetail = code => ({ bookIds: code.bookIds });

// When every ledger has its own page list the code's global list is their union (it only matters before a ledger opens).
const derivedPages = (bookIds, bookResources) => (bookIds.every(id => Array.isArray(bookResources[id]))
  ? normalizeResources(bookIds.flatMap(id => bookResources[id])) : undefined);

const createAccessCodeService = store => {
  const bump = (key, max, lockMs, now) => store.attempts.recordFailure(key, { max, windowMs: WINDOW_MS, lockMs, now });

  const isLocked = async (key, now) => {
    const row = await store.attempts.get(key);
    return Boolean(row && row.lockedUntil && new Date(row.lockedUntil) > now);
  };

  return {
    principalFor,

    // Returns the stored code for a valid, active code. clientId is the caller's address, used only for throttling.
    async authenticate(input, clientId) {
      const now = new Date();
      const ipKey = `ip:${hashKey(clientId || 'unknown')}`;
      if (await isLocked(ipKey, now) || await isLocked(GLOBAL_KEY, now)) throw new RateLimitedError();
      const normalized = normalizeCode(input);
      const code = normalized ? await store.accessCodes.findByHash(hashCode(normalized)) : null;
      if (!code || code.revokedAt) {
        await bump(ipKey, IP_MAX_FAILURES, IP_LOCK_MS, now);
        await bump(GLOBAL_KEY, GLOBAL_MAX_FAILURES, GLOBAL_LOCK_MS, now);
        throw new AuthError('Invalid access code');
      }
      await store.attempts.clear(ipKey);
      await store.accessCodes.touch(code.id, now.toISOString());
      return code;
    },

    // The principal for a session's code, or null when the code is gone or revoked.
    async resolve(codeId) {
      const code = await store.accessCodes.findById(codeId);
      return code && !code.revokedAt ? principalFor(code, await store.accessCodes.loanIds(code.id)) : null;
    },

    async list() {
      return (await store.accessCodes.list()).map(toView);
    },

    // Returns the view plus the code (as entered, or generated), which is not stored and cannot be shown again.
    async create(actor, body) {
      const data = parse(createSchema, body);
      const bookIds = [...new Set(data.bookIds)];
      const known = new Set(await store.books.existingIds(bookIds));
      const missing = bookIds.filter(id => !known.has(id));
      if (missing.length > 0) throw new ValidationError(`Unknown book: ${missing.join(', ')}`);
      const bookResources = cleanBookResources(data.bookResources, bookIds);
      const resources = derivedPages(bookIds, bookResources) ?? normalizeResources(data.resources === undefined ? DEFAULT_CODE_RESOURCES : data.resources);
      const { custom, code } = resolveCode(data.code);
      const codeHash = hashCode(normalizeCode(code));
      const inUse = new ValidationError(IN_USE);
      if (await store.accessCodes.findByHash(codeHash)) throw inUse;
      const now = new Date().toISOString();
      let saved;
      try {
        saved = await store.accessCodes.insert({
          name: data.name, codeHash, bookIds, resources, bookResources, createdBy: actor.email, createdAt: now
        });
      } catch (error) {
        if (isUnique(error)) throw inUse;
        throw error;
      }
      await store.log.insert({
        actor: { id: actor.id, email: actor.email }, action: 'create-access-code', target: `code:${saved.id}`,
        detail: { name: data.name, bookIds, resources, custom: Boolean(custom) }, at: now
      });
      return { ...toView(saved), code };
    },

    // Replaces an active code's secret, keeping its name and scopes. The new code is returned once. Every session
    // started with the old code ends at once and the old code stops working.
    async reset(actor, id, body) {
      const data = parse(resetSchema, body);
      const existing = await store.accessCodes.findById(id);
      if (!existing) throw new NotFoundError('Access code not found');
      if (existing.revokedAt) throw new ConflictError('A revoked access code cannot be reset. Create a new one.');
      const { custom, code } = resolveCode(data.code);
      const codeHash = hashCode(normalizeCode(code));
      const owner = await store.accessCodes.findByHash(codeHash);
      if (owner && owner.id === existing.id) throw new ValidationError('The new access code must differ from the current one.');
      if (owner) throw new ValidationError(IN_USE);
      let changed;
      try {
        changed = await store.accessCodes.replaceHash(existing.id, codeHash);
      } catch (error) {
        if (isUnique(error)) throw new ValidationError(IN_USE);
        throw error;
      }
      if (!changed) throw new ConflictError('A revoked access code cannot be reset. Create a new one.');
      const now = new Date().toISOString();
      await store.log.insert({
        actor: { id: actor.id, email: actor.email }, action: 'reset-access-code', target: `code:${existing.id}`,
        detail: { name: existing.name, custom: Boolean(custom) }, at: now
      });
      return { ...toView(await store.accessCodes.findById(existing.id)), code };
    },

    // Changes the pages an active code may use. Open sessions pick it up on their next request.
    async setResources(actor, id, body) {
      const data = parse(resourcesSchema, body);
      const existing = await store.accessCodes.findById(id);
      if (!existing) throw new NotFoundError('Access code not found');
      if (existing.revokedAt) throw new ConflictError('A revoked access code cannot be edited. Create a new one.');
      const bookIds = data.bookIds ? [...new Set(data.bookIds)] : existing.bookIds;
      const bookResources = cleanBookResources(data.bookResources, bookIds);
      const resources = derivedPages(bookIds, bookResources) ?? normalizeResources(data.resources);
      if (data.bookIds) {
        const known = new Set(await store.books.existingIds(bookIds));
        const missing = bookIds.filter(id => !known.has(id));
        if (missing.length > 0) throw new ValidationError(`Unknown book: ${missing.join(', ')}`);
      }
      await store.accessCodes.setResources(existing.id, resources, bookResources, bookIds);
      await store.log.insert({
        actor: { id: actor.id, email: actor.email }, action: 'code-resources', target: `code:${existing.id}`,
        detail: { name: existing.name, resources, bookIds, bookResources: data.bookResources ?? null }, at: new Date().toISOString()
      });
      return toView(await store.accessCodes.findById(existing.id));
    },

    // Revoking ends every session started with the code straight away.
    async revoke(actor, id) {
      const code = await store.accessCodes.findById(id);
      if (!code) throw new NotFoundError('Access code not found');
      const now = new Date().toISOString();
      await store.accessCodes.revoke(code.id, now);
      await store.sessions.deleteByAccessCode(code.id);
      await store.log.insert({
        actor: { id: actor.id, email: actor.email }, action: 'revoke-access-code', target: `code:${code.id}`,
        detail: { name: code.name }, at: now
      });
      return toView(await store.accessCodes.findById(code.id));
    },

    // Brings a revoked code back: the same code works again. Loans shared with it before the revoke are not restored.
    async restore(actor, id) {
      const code = await store.accessCodes.findById(id);
      if (!code) throw new NotFoundError('Access code not found');
      if (!code.revokedAt) throw new ConflictError('This access code is not revoked');
      await store.accessCodes.restore(code.id);
      await store.log.insert({
        actor: { id: actor.id, email: actor.email }, action: 'restore-access-code', target: `code:${code.id}`,
        detail: { name: code.name }, at: new Date().toISOString()
      });
      return toView(await store.accessCodes.findById(code.id));
    },

    // Permanently deletes an active or revoked code and signs out its sessions. The audit history stays.
    async remove(actor, id) {
      const code = await store.accessCodes.findById(id);
      if (!code) throw new NotFoundError('Access code not found');
      if (!(await store.accessCodes.remove(code.id))) throw new NotFoundError('Access code not found');
      await store.log.insert({
        actor: { id: actor.id, email: actor.email }, action: 'delete-access-code', target: `code:${code.id}`,
        detail: { name: code.name, ...scopeDetail(code), revoked: Boolean(code.revokedAt) }, at: new Date().toISOString()
      });
      return { id: code.id };
    }
  };
};

module.exports = { createAccessCodeService, generateCode, normalizeCode, hashCode, principalFor, IP_MAX_FAILURES };
