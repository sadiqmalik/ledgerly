const { z } = require('zod');
const { AppError, NotFoundError, ValidationError } = require('../errors');
const { normalizeEmail } = require('./accounts');
const { RESOURCES, effectiveResources, normalizeResources } = require('./resources');

const ROLES = ['viewer', 'editor', 'admin'];
const membership = z.object({ bookId: z.string().min(1).max(64), role: z.enum(ROLES), resources: z.array(z.enum(RESOURCES)).max(RESOURCES.length).optional() });

const loanMembership = z.object({ registerId: z.string().min(1).max(64), role: z.enum(ROLES) });

const schemas = {
  create: z.object({
    email: z.string().min(3).max(200),
    name: z.string().trim().min(1).max(120),
    password: z.string().min(1).max(200),
    memberships: z.array(membership).max(50).default([]),
    loanMemberships: z.array(loanMembership).max(200).default([]),
    resources: z.array(z.enum(RESOURCES)).max(RESOURCES.length).nullable().optional(),
    isSuperAdmin: z.boolean().optional()
  }),
  type: z.object({ isSuperAdmin: z.boolean() }).strict(),
  memberships: z.object({ memberships: z.array(membership).max(50) }),
  loanMemberships: z.object({ loanMemberships: z.array(loanMembership).max(200) }),
  resources: z.object({ resources: z.array(z.enum(RESOURCES)).max(RESOURCES.length).nullable() }).strict(),
  status: z.object({ disabled: z.boolean() }),
  bookRole: z.object({ role: z.enum(ROLES).nullable() }).strict(),
  bookMember: z.object({ email: z.string().min(3).max(200), role: z.enum(ROLES) }).strict(),
  password: z.object({ password: z.string().min(1).max(200) })
};

const parse = (schema, body) => {
  const result = schema.safeParse(body || {});
  if (!result.success) {
    const issue = result.error.issues[0];
    throw new ValidationError(`${issue.path.join('.') || 'request'}: ${issue.message}`);
  }
  return result.data;
};

// With a page list on every ledger, the account's global list is just their union (plus Loans when it has loan access):
// it only decides what shows before a ledger is open. undefined when some ledger still uses the global list.
const derivedPages = (memberships = [], loanMemberships = []) => {
  if (memberships.length === 0 && loanMemberships.length === 0) return undefined; // nothing to derive from
  if (!memberships.every(m => Array.isArray(m.resources))) return undefined;
  return normalizeResources([...memberships.flatMap(m => m.resources), ...(loanMemberships.length ? ['loans'] : [])]);
};

// Account administration for super administrators. Every change is written to accountLog.
const createAccountAdmin = (store, { accounts, auth }) => {

  const toView = a => ({
    id: a.id,
    email: a.email,
    name: a.name,
    isSuperAdmin: Boolean(a.isSuperAdmin),
    disabled: Boolean(a.disabled),
    memberships: a.memberships || [],
    loanMemberships: a.loanMemberships || [],
    resources: effectiveResources(a),
    resourcesSet: Array.isArray(a.resources),
    lastLoginAt: a.lastLoginAt || null,
    lockedUntil: a.lockedUntil || null
  });

  const recordEvent = (actor, action, target, detail = {}) =>
    store.log.insert({ actor: { id: actor.id, email: actor.email }, action, target, detail, at: new Date().toISOString() });

  const checkBooks = async memberships => {
    const ids = [...new Set(memberships.map(m => m.bookId))];
    if (ids.length === 0) return;
    const known = new Set(await store.books.existingIds(ids));
    const missing = ids.filter(id => !known.has(id));
    if (missing.length > 0) throw new ValidationError(`Unknown book: ${missing.join(', ')}`);
  };

  const checkRegisters = async loanMemberships => {
    const ids = [...new Set(loanMemberships.map(m => m.registerId))];
    if (ids.length === 0) return;
    const known = new Set(await store.loanRegisters.existingIds(ids));
    const missing = ids.filter(id => !known.has(id));
    if (missing.length > 0) throw new ValidationError(`Unknown loan register: ${missing.join(', ')}`);
  };

  const findAccount = async id => {
    const account = await store.accounts.findById(id);
    if (!account) throw new NotFoundError('Account not found');
    return account;
  };

  // Refuses to delete or disable the only active super administrator, so nobody is locked out of account management.
  const keepOneSuperAdmin = async account => {
    if (!account.isSuperAdmin || account.disabled) return;
    const others = (await store.accounts.list()).filter(a => a.isSuperAdmin && !a.disabled && a.id !== account.id);
    if (others.length === 0) throw new ValidationError('This is the last active super administrator and cannot be removed');
  };

  const memberView = (a, bookId) => ({
    accountId: a.id, name: a.name, email: a.email,
    role: (a.memberships || []).find(m => m.bookId === bookId).role,
    isSuperAdmin: Boolean(a.isSuperAdmin), disabled: Boolean(a.disabled)
  });

  const withRole = (account, bookId, role) => [
    ...(account.memberships || []).filter(m => m.bookId !== bookId), { ...(account.memberships || []).find(m => m.bookId === bookId), bookId, role }
  ];

  return {
    // Accounts with a membership in this book.
    async bookMembers(bookId) {
      return (await store.accounts.list()).filter(a => (a.memberships || []).some(m => m.bookId === bookId)).map(a => memberView(a, bookId));
    },

    // Sets (or, with role null, removes) one account's role in one book. Nobody can change their own role.
    async setBookRole(actor, accountId, bookId, body) {
      const data = parse(schemas.bookRole, body);
      const account = await findAccount(accountId);
      if (account.id === actor.id) throw new AppError('You cannot change your own role', 409);
      const has = (account.memberships || []).some(m => m.bookId === bookId);
      let memberships;
      if (data.role === null) {
        if (!has) throw new NotFoundError('Member not found');
        memberships = account.memberships.filter(m => m.bookId !== bookId);
      } else {
        memberships = withRole(account, bookId, data.role);
      }
      await store.accounts.update(account.id, { memberships, updatedAt: new Date().toISOString() });
      await recordEvent(actor, 'book-role', account.email, { bookId, role: data.role });
      return data.role === null ? null : memberView(await findAccount(account.id), bookId);
    },

    // Adds an existing account (by email) to a book.
    async addBookMember(actor, bookId, body) {
      const data = parse(schemas.bookMember, body);
      const account = await store.accounts.findByEmail(normalizeEmail(data.email));
      if (!account) throw new NotFoundError('No account with that email');
      if ((account.memberships || []).some(m => m.bookId === bookId)) throw new AppError('Already a member of this book', 409);
      await store.accounts.update(account.id, { memberships: withRole(account, bookId, data.role), updatedAt: new Date().toISOString() });
      await recordEvent(actor, 'book-role', account.email, { bookId, role: data.role });
      return memberView(await findAccount(account.id), bookId);
    },

    async list() {
      return (await store.accounts.list()).map(toView);
    },

    async create(actor, body) {
      const data = parse(schemas.create, body);
      // A super administrator has every ledger, loan and page, so they get no specific access of their own.
      const isSuper = Boolean(data.isSuperAdmin);
      if (isSuper) { data.memberships = []; data.loanMemberships = []; data.resources = null; }
      await checkBooks(data.memberships);
      await checkRegisters(data.loanMemberships);
      const account = await accounts.create({
        email: data.email,
        name: data.name,
        password: data.password,
        isSuperAdmin: isSuper,
        memberships: data.memberships,
        loanMemberships: data.loanMemberships,
        resources: derivedPages(data.memberships, data.loanMemberships) ?? (Array.isArray(data.resources) ? normalizeResources(data.resources) : null)
      });
      await recordEvent(actor, 'create', normalizeEmail(data.email), { memberships: data.memberships, loanMemberships: data.loanMemberships, resources: data.resources ?? null });
      return toView(await findAccount(account.id));
    },

    // Makes an account a super administrator (everything, no specific access needed) or a normal admin (only the
    // access it is given). Nobody can change their own type, and the last active super administrator stays one.
    async setType(actor, id, body) {
      const data = parse(schemas.type, body);
      const account = await findAccount(id);
      if (account.id === actor.id) throw new AppError('You cannot change your own admin type', 409);
      if (Boolean(account.isSuperAdmin) === data.isSuperAdmin) return toView(account);
      if (!data.isSuperAdmin) await keepOneSuperAdmin(account);
      await store.accounts.update(account.id, { isSuperAdmin: data.isSuperAdmin, updatedAt: new Date().toISOString() });
      await store.sessions.deleteByAccount(account.id); // sign them in again with the new rights
      await recordEvent(actor, 'admin-type', account.email, { isSuperAdmin: data.isSuperAdmin });
      return toView(await findAccount(account.id));
    },

    // Sets the pages the account may use. null clears the list (full access). Takes effect on the next request.
    async setResources(actor, id, body) {
      const data = parse(schemas.resources, body);
      const account = await findAccount(id);
      const resources = data.resources === null ? null : normalizeResources(data.resources);
      await store.accounts.update(account.id, { resources, updatedAt: new Date().toISOString() });
      await recordEvent(actor, 'resources', account.email, { resources });
      return toView(await findAccount(account.id));
    },

    async setMemberships(actor, id, body) {
      const data = parse(schemas.memberships, body);
      const account = await findAccount(id);
      await checkBooks(data.memberships);
      const derived = derivedPages(data.memberships, account.loanMemberships);
      await store.accounts.update(account.id, { memberships: data.memberships, ...(derived ? { resources: derived } : {}), updatedAt: new Date().toISOString() });
      await recordEvent(actor, 'memberships', account.email, { memberships: data.memberships });
      return toView(await findAccount(account.id));
    },

    async setLoanMemberships(actor, id, body) {
      const data = parse(schemas.loanMemberships, body);
      const account = await findAccount(id);
      await checkRegisters(data.loanMemberships);
      const derived = derivedPages(account.memberships, data.loanMemberships);
      await store.accounts.update(account.id, { loanMemberships: data.loanMemberships, ...(derived ? { resources: derived } : {}), updatedAt: new Date().toISOString() });
      await recordEvent(actor, 'loan-memberships', account.email, { loanMemberships: data.loanMemberships });
      return toView(await findAccount(account.id));
    },

    async setDisabled(actor, id, body) {
      const data = parse(schemas.status, body);
      const account = await findAccount(id);
      if (account.id === actor.id && data.disabled) {
        throw new ValidationError('You cannot disable your own account');
      }
      if (data.disabled) await keepOneSuperAdmin(account);
      await store.accounts.update(account.id, { disabled: data.disabled, updatedAt: new Date().toISOString() });
      if (data.disabled) await auth.signOutAccount(account.id);
      await recordEvent(actor, data.disabled ? 'disable' : 'enable', account.email);
      return toView(await findAccount(account.id));
    },

    async resetPassword(actor, id, body) {
      const data = parse(schemas.password, body);
      const account = await findAccount(id);
      await accounts.resetPassword(account.email, data.password);
      await recordEvent(actor, 'password-reset', account.email);
      return { ok: true };
    },

    // Deletes the account and its sessions. You cannot delete your own account.
    async remove(actor, id) {
      const account = await findAccount(id);
      if (account.id === actor.id) throw new ValidationError('You cannot delete your own account');
      await keepOneSuperAdmin(account);
      await auth.signOutAccount(account.id);
      await store.accounts.delete(account.id);
      await recordEvent(actor, 'delete', account.email);
      return { ok: true };
    }
  };
};

module.exports = { createAccountAdmin, ROLES };
