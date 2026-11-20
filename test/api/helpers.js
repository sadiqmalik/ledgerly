const request = require('supertest');
const { createRepo } = require('../../server/repo');
const { createAuthService } = require('../../server/auth/service');
const { createAccountStore } = require('../../server/auth/accounts');
const { createApi } = require('../../worker/api');
const { createAdaptorServer } = require('@hono/node-server');

const APP_ORIGIN = 'https://app.ledgerly.test';
const BOOK = 'family';
const TESTER = { email: 'tester@example.com', name: 'Tester', password: 'test passphrase for api tests' };

// Local D1 persisted under .wrangler/state-test (npm test migrates it first).
// getPlatformProxy's persist.path is the directory that holds the d1 folder itself, so the proxy points at <dir>/v3.
const D1_STATE = '.wrangler/state-test/v3';

const withCookie = (app, cookie) => ({
  get: url => request(app).get(url).set('Cookie', cookie),
  post: url => request(app).post(url).set('Cookie', cookie),
  put: url => request(app).put(url).set('Cookie', cookie),
  delete: url => request(app).delete(url).set('Cookie', cookie)
});

// Empties every table (not the migration bookkeeping) and seeds the books the tests use.
// Migration 0002 creates `books`; if it is missing (0002 not applied yet) a minimal table is created here.
const STANDARD_CURRENCIES = ['PKR', 'USD', 'EUR', 'GBP', 'SEK', 'NOK', 'DKK', 'AED', 'SAR', 'QAR', 'KWD', 'OMR', 'BHD', 'TRY', 'INR', 'CAD', 'AUD', 'CHF', 'JPY', 'CNY', 'MYR', 'SGD'];
const TEST_BOOKS = [['family', 'Family'], ['personal', 'Personal']];
const resetD1 = async d1 => {
  await d1.exec(
    'CREATE TABLE IF NOT EXISTS books (id TEXT PRIMARY KEY, name TEXT NOT NULL, base_currency TEXT NOT NULL DEFAULT \'PKR\', created_at TEXT NOT NULL)'
  );
  const tables = await d1.prepare(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' AND name <> 'd1_migrations'"
  ).all();
  await d1.batch(tables.results.map(t => d1.prepare(`DELETE FROM "${t.name}"`)));
  // The managed currency list is wiped with everything else; tests need the standard codes back.
  if (tables.results.some(t => t.name === 'currencies')) {
    const stamp = new Date().toISOString();
    await d1.batch(STANDARD_CURRENCIES.map(code => d1.prepare(
      'INSERT INTO currencies (code, name, created_at, updated_at) VALUES (?, ?, ?, ?)'
    ).bind(code, code, stamp, stamp)));
  }
  await d1.batch(TEST_BOOKS.map(([id, name]) => d1.prepare(
    'INSERT INTO books (id, name, created_at) VALUES (?, ?, ?)'
  ).bind(id, name, new Date().toISOString())));
};

// In-memory stand-in for an R2 bucket: put / get / delete / list (with prefix, limit and cursor).
const makeFakeR2 = () => {
  const store = new Map();
  return {
    store,
    async put(key, value, options = {}) {
      const bytes = typeof value === 'string' ? new TextEncoder().encode(value) : new Uint8Array(value instanceof ArrayBuffer ? value : value.buffer ?? value);
      store.set(key, { bytes: new Uint8Array(bytes), httpMetadata: options.httpMetadata || {} });
    },
    async get(key) {
      const o = store.get(key);
      return o ? { body: new Response(o.bytes).body, httpMetadata: o.httpMetadata, size: o.bytes.length } : null;
    },
    async delete(key) { store.delete(key); },
    async list({ prefix = '', cursor, limit = 1000 } = {}) {
      const keys = [...store.keys()].filter(k => k.startsWith(prefix)).sort();
      const start = cursor ? Number(cursor) : 0;
      const page = keys.slice(start, start + limit);
      const truncated = start + limit < keys.length;
      return { objects: page.map(key => ({ key })), truncated, cursor: truncated ? String(start + limit) : undefined };
    }
  };
};

// A fresh database, the tester signed in as a super administrator, and the Worker app.
// options.docs: false leaves the DOCS binding out; otherwise ctx.docs is a fake R2 bucket bound as DOCS.
const makeContext = async ({ docs = true } = {}) => {
  const { getPlatformProxy } = require('wrangler');
  const proxy = await getPlatformProxy({ persist: { path: D1_STATE } });
  const d1 = proxy.env.DB;
  await resetD1(d1);
  const repo = createRepo(d1);
  await createAccountStore(repo.authStore).create({ ...TESTER, isSuperAdmin: true });
  const auth = createAuthService(repo.authStore, { cookieSecure: false });
  const { sid } = await auth.login(TESTER.email, TESTER.password);
  const cookie = `lsid=${sid}`;
  const bucket = docs ? makeFakeR2() : null;
  const env = { DEFAULT_CURRENCY: 'PKR', ...(bucket ? { DOCS: bucket } : {}) };
  const app = createAdaptorServer({ fetch: createApi({ repo, auth, allowedOrigin: APP_ORIGIN, env }).fetch });
  return {
    repo, d1, auth, app, cookie, docs: bucket, env,
    api: withCookie(app, cookie),
    anonymous: request(app),
    close: async () => { await proxy.dispose(); }
  };
};

module.exports = { makeFakeR2, BOOK, APP_ORIGIN, TESTER, makeContext, withCookie };
