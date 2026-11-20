// The API for the Worker (Hono). Routes live in worker/routes/; this file wires middleware and routes together.
const crypto = require('crypto');
const { Hono } = require('hono');
const { AppError, ForbiddenError } = require('../server/errors');
const { canAccess, canAccessLoan } = require('../server/auth/roles');
const { hasAnyResource, hasResource, requiredResources } = require('../server/auth/resources');
const { configureLocale } = require('../server/domain/locale');
const { createAccountAdmin } = require('../server/auth/admin');
const { runAs } = require('../server/auth/context');
const { registerAuthRoutes } = require('./routes/auth');
const { registerAdminRoutes } = require('./routes/admin');
const { registerBookRoutes } = require('./routes/books');
const { registerLedgerRoutes } = require('./routes/ledger');
const { registerMasterRoutes } = require('./routes/masters');
const { registerReportRoutes } = require('./routes/reports');
const { registerDocumentRoutes } = require('./routes/documents');
const { registerItemRoutes } = require('./routes/items');
const { registerExportRoutes } = require('./routes/export');
const optional = require('../server/optionalModules');
const { registerAppearanceRoutes } = require('./routes/appearance');
const { registerEntryCountRoutes } = require('./routes/entryCounts');
const { registerLoanRoutes } = require('./routes/loans');
const { registerCurrencyRoutes } = require('./routes/currencies');

const WRITE_METHODS = ['POST', 'PUT', 'PATCH', 'DELETE'];
const PUBLIC_PATHS = new Set(['/api/health', '/api/auth/login', '/api/auth/access-code', '/api/auth/logout']);
const FILE_UPLOAD = /^\/api\/books\/[^/]+\/documents\/[^/]+\/file$/;
const BODY_LIMIT = 5 * 1024 * 1024;

// Unexpected errors are logged with an id; the client gets only the id, never internals.
const errorResponse = (c, error) => {
  if (error instanceof AppError) {
    return c.json({ success: false, error: error.message, ...error.extra }, error.status);
  }
  const requestId = crypto.randomUUID();
  console.error(`[${requestId}] ${c.req.method} ${c.req.path}`, error);
  return c.json({ success: false, error: 'Internal error', requestId }, 500);
};

// Reads a JSON body: an empty body is {}, only objects and arrays are accepted,
// and other content types are not parsed.
const readJson = async c => {
  const type = c.req.header('content-type') || '';
  if (!type.startsWith('application/json')) return {};
  const declared = Number(c.req.header('content-length') || 0);
  if (declared > BODY_LIMIT) throw new AppError('Request is too large', 413);
  const text = await c.req.text();
  if (text.length === 0) return {};
  if (new TextEncoder().encode(text).length > BODY_LIMIT) throw new AppError('Request is too large', 413);
  const first = text.trimStart()[0];
  if (first !== '{' && first !== '[') throw new AppError('Malformed JSON', 400);
  try {
    return JSON.parse(text);
  } catch {
    throw new AppError('Malformed JSON', 400);
  }
};

// options: { repo, auth, allowedOrigin (string or array), env (Worker bindings such as DOCS; tests pass a fake) }. The caller builds repo and auth for the request (see worker/index.js).
const createApi = ({ repo, auth, allowedOrigin = 'https://app.ledgerly.test', env = {} }) => {
  configureLocale(env);
  if (!auth) throw new Error('createApi needs an auth service');
  const allowedOrigins = [].concat(allowedOrigin);
  const app = new Hono({ strict: false });
  const accountAdmin = createAccountAdmin(auth.store, { accounts: auth.accounts, auth });

  app.onError((error, c) => errorResponse(c, error));
  app.notFound(c => c.text(`Cannot ${c.req.method} ${c.req.path}`, 404));

  // 0. Body first, before the /api middleware runs.
  app.use('/api/*', async (c, next) => {
    c.set('body', await readJson(c));
    return next();
  });

  // 1. Writes must come from the app's own origin and must not be plain-form requests (CSRF).
  app.use('/api/*', async (c, next) => {
    if (!WRITE_METHODS.includes(c.req.method)) return next();
    const origin = c.req.header('origin');
    if (origin && !allowedOrigins.includes(origin)) return c.json({ success: false, error: 'Forbidden origin' }, 403);
    const type = c.req.header('content-type');
    // The file upload carries raw bytes; the route checks the file type itself (415).
    if (FILE_UPLOAD.test(c.req.path)) return next();
    if (type && !type.startsWith('application/json')) {
      return c.json({ success: false, error: 'Content-Type must be application/json' }, 415);
    }
    return next();
  });

  // 2. Sign-in is required, except for the public paths. The actor is available to the repository.
  app.use('/api/*', async (c, next) => {
    if (PUBLIC_PATHS.has(c.req.path)) return next();
    const signedIn = await auth.fromRequest({ headers: { cookie: c.req.header('cookie') } });
    if (!signedIn) return c.json({ success: false, error: 'Not signed in' }, 401);
    c.set('account', signedIn);
    return runAs({ accountId: signedIn.id, email: signedIn.email }, () => next());
  });

  // 3. Everything under /api/books/:b/ needs at least the viewer role in that book.
  //    Later modules refine this per route (editor for writes, admin for settings).
  app.use('/api/books/:b/*', async (c, next) => {
    const account = c.get('account');
    if (!canAccess(account, c.req.param('b'), 'viewer')) throw new ForbiddenError();
    if (!account.isSuperAdmin) {
      const book = await repo.books.get(c.req.param('b'));
      if (book && book.active === 0) throw new AppError('This ledger is deactivated. A super administrator can reactivate it.', 423);
    }
    return next();
  });

  // 4. The account's page allowlist (resources) must also cover the data being read or written, whatever its book
  //    role. Unknown paths under a book are refused.
  app.use('/api/books/:b/*', async (c, next) => {
    const account = c.get('account');
    const rest = c.req.path.slice(`/api/books/${c.req.param('b')}`.length);
    const needed = requiredResources(c.req.method, rest, c.req.query());
    if (needed && !hasAnyResource(account, needed)) throw new ForbiddenError('This account cannot use that page');
    return next();
  });

  // 5. Loan registers: the `loans` page, then (for /api/loans/:r/...) at least the viewer role on that register.
  //    Without a role the answer is 403 whether or not the register exists, so existence is not revealed.
  app.use('/api/loans/*', async (c, next) => {
    const account = c.get('account');
    if (!hasResource(account, 'loans')) throw new ForbiddenError('This account cannot use that page');
    const register = c.req.path.split('/')[3];
    if (register && !canAccessLoan(account, register, 'viewer')) throw new ForbiddenError('Your account cannot use this loan register');
    return next();
  });
  app.use('/api/loans', async (c, next) => {
    if (!hasResource(c.get('account'), 'loans')) throw new ForbiddenError('This account cannot use that page');
    return next();
  });

  app.get('/api/health', async c => {
    try {
      return c.json(await repo.health());
    } catch (error) {
      const requestId = crypto.randomUUID();
      console.error(`[${requestId}] health`, error);
      return c.json({ ok: false, error: 'Unavailable', requestId }, 503);
    }
  });

  registerAuthRoutes(app, { auth });
  registerBookRoutes(app, { repo, accountAdmin });
  registerLedgerRoutes(app, { repo });
  registerMasterRoutes(app, { repo });
  registerReportRoutes(app, { repo });
  registerDocumentRoutes(app, { repo, env });
  registerItemRoutes(app, { repo });
  registerExportRoutes(app, { repo });
  for (const register of optional.routes) register(app, { repo, env });
  registerAppearanceRoutes(app, { repo });
  registerEntryCountRoutes(app, { repo });
  registerLoanRoutes(app, { repo });
  registerCurrencyRoutes(app, { repo });
  registerAdminRoutes(app, { accountAdmin, auth });

  return app;
};

module.exports = { createApi };
