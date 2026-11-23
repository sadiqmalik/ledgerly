// D1 queries only. One repository per request; later modules add their queries here.
const { createD1AuthStore } = require('../auth/stores/d1');
const { createLedgerRepo } = require('./ledger');
const { createReportsRepo } = require('./reports');
const { createExportRepo } = require('./export');
const { createBooksRepo } = require('./books');
const { createItemsRepo } = require('./items');
const optional = require('../optionalModules');
const { createAppearanceRepo } = require('./appearance');
const { createTimeZoneRepo } = require('./timezone');
const { createEntryCountsRepo } = require('./entryCounts');
const { createLoansRepo } = require('./loans');
const { createCurrenciesRepo } = require('./currencies');

const createRepo = db => {
  const authStore = createD1AuthStore(db);
  const ledger = createLedgerRepo(db);
  return {
    authStore,
    db,
    ledger,
    reports: createReportsRepo(db, ledger),
    exportRepo: createExportRepo(db, ledger),
    books: createBooksRepo(db, authStore),
    items: createItemsRepo(ledger),
    appearance: createAppearanceRepo(db),
    timeZone: createTimeZoneRepo(db),
    entryCounts: createEntryCountsRepo(db),
    loans: createLoansRepo(db),
    currencies: createCurrenciesRepo(db),
    ...Object.fromEntries(Object.entries(optional.repos).map(([key, create]) => [key, create(db)])),

    listBooks: () => authStore.books.list(),

    async bookExists(id) {
      return (await authStore.books.existingIds([id])).length > 0;
    },

    async health() {
      await db.prepare('SELECT 1 AS ok').first();
      return { ok: true, driver: 'd1' };
    }
  };
};

module.exports = { createRepo };
