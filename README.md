# Ledgerly

A self-hosted household ledger: one continuous dated ledger per book, with funds, entries, linked transfers, projects, documents, loans and yearly reports. Money is kept in integer minor units, and closing a year locks it.

**What it does today**

- **Ledgers (books):** funds, accounts, parties, categories, quantity and unit price, linked transfers, refunds, memo funds, entry filters, bulk edit, year close and reopen, CSV and JSON export, nightly backups, several ledgers (deactivate, not delete).
- **Projects:** entries per project (open or closed), budget and totals, a move-to-project option, party filter, and documents and entries linked to the project.
- **Documents:** a log of reports and receipts with files in R2, **linked to ledger entries** (many to many, paperclip on rows).
- **Loans (loan registers):** borrower and lender names (several of each), taken and returned entries, totals, per-lender balances, settle and reopen, access per loan.
- **Currencies:** a managed list with aliases (such as `kr`), pickers that offer only active ones, and server checks.
- **Reports, dashboard, item tracker, appearance** (palettes, list or card layout).
- **Access:** super administrators (users, ledgers, per-loan access, currencies, access codes), per-ledger roles, page-level permissions, view-only access codes, lockout and an audit log.
- **UI conventions:** one style for lists, cards, switches, dialogs, amount and date boxes (`.github/skills/ledger-ui/SKILL.md`).

It runs only on Cloudflare (a Hono Worker for `/api`, a D1 database `ledger`, and R2 buckets for backups and documents), with a React 19 + Vite + Tailwind 4 frontend. Locally it runs under Warden or with plain `npm run dev`.

- [Start here: Getting started](docs/GETTING_STARTED.md): prerequisites, first run, configuration, every command, AI assistants, optional modules.
- [Architecture](docs/ARCHITECTURE.md): components, data model, domain rules, request flows, security and known limits. Read this first.
- [User guide](docs/USER_GUIDE.md): signing in, recording money, reports and settings, for the people who use the app.
- [App map](docs/APP_MAP.md): diagrams that explain the app in pictures, for non-technical readers.
- [Operations](docs/OPERATIONS.md): running it locally, backups and tests.
- [Deployment](docs/DEPLOYMENT.md): getting it to Cloudflare, one-time setup, rollback.
- [Troubleshooting](docs/TROUBLESHOOTING.md): health check, logs, database and migration checks, restarting.
- [Future improvements](docs/FUTURE_IMPROVEMENTS.md): the backlog with implementation guidance.
- Feature designs: [loans](docs/LOANS_DESIGN.md), [currencies](docs/CURRENCIES_DESIGN.md), [document links](docs/DOCUMENT_LINKS_DESIGN.md).


## Run locally

```bash
npm install
npm run dev        # Vite on http://localhost:3100 and wrangler dev on :8788 (local D1 under .wrangler/state)
npm test           # applies migrations to a test D1, then node --test
```

`npm run dev` applies the migrations in `migrations/` to the local D1 and proxies `/api` to the worker. Check with `curl http://localhost:3100/api/health`. It does not need Warden.

The local site (`localhost`, `127.0.0.1`, or a host ending in `.test`, such as `app.ledgerly.test`) shows a faint red **LOCAL** watermark (`src/index.js`), so a test copy is never mistaken for the live ledger.

**With Warden (the normal way):** `.env` and `.dev.vars` are already set up (templates: `.env.dist`, `.dev.vars.example`). Run `warden sign-certificate ledgerly.test` once, then `warden env up`, and open https://app.ledgerly.test. Other commands:

- `warden account-create --email ... --name ...` creates an account. `warden account-reset-password --email ...` resets a password.
- `warden d1 "SELECT ..."` runs SQL on the local D1. For the live database use `warden d1 -- --remote "SELECT ..."`; anything other than a read asks you to type `live`.
- `warden d1-backup <label>` backs up the local D1; `warden d1-backup -- --remote <label>` saves the live D1 to `backups/` (read only).
- `warden d1-pull` replaces the local D1 with a copy of the live one (backs up local first). `warden d1-restore backups/<file>.sql` replaces the local D1 from a file (backs up local first). Details: `docs/OPERATIONS.md` section 6.
- `warden deploy` deploys. The app must be running (`warden env up`). It needs Cloudflare credentials in `.env` and a real `database_id` in `wrangler.toml`.
- `warden env logs --tail 80 app` shows the app log; `warden env restart app` restarts it (and applies new migrations). If every page shows **Internal error**, see `docs/TROUBLESHOOTING.md`.
- `warden env down` stops the app. Funds and ledger can run at the same time.

## Create the first administrator

The password is typed hidden (min 12 characters), never passed as an argument. It writes to the local D1 database.

```bash
npm run account:create -- --email you@example.com --name "Your Name"
# Warden: warden account-create --email you@example.com --name "Your Name"
```

Reset a password: `npm run account:reset-password -- --email you@example.com`. Add `--remote` to change the live database (`warden account-reset-password -- --remote --email ...`, which asks you to type `live`). See `docs/OPERATIONS.md`.

Super administrators see every book. Other accounts get memberships `[{"bookId":"family","role":"viewer|editor|admin"}]` through `/api/admin/accounts`.

## Layout

- `worker/index.js` entry, `worker/api.js` middleware and wiring, `worker/routes/` HTTP routes (`auth`, `admin`, `books`, `ledger`, `masters`, `documents`, `items`, `reports`, `export`, `validate`, `appearance`, `entryCounts`, `loans`, `currencies`)
- `server/auth/` PBKDF2 passwords, sessions, lockout, roles; `server/repo/` D1 queries; `server/domain/` pure rules
- Loans, the screens' name for loan registers (`/api/loans`, page `loans`): `worker/routes/loans.js`, `server/repo/loans.js`, `server/domain/loans.js`, UI in `src/components/loans/`. Design and rules: `docs/LOANS_DESIGN.md`
- Documents linked to ledger entries (built 2026-11-19): design and differences from the code in `docs/DOCUMENT_LINKS_DESIGN.md`
- Technical troubleshooting guide (health check, logs, database and migration checks, restarting): `docs/TROUBLESHOOTING.md`
- Backlog of planned improvements with implementation guidance (loans, currencies, tests, ops, document follow-ups): `docs/FUTURE_IMPROVEMENTS.md`
- Currency setup: a managed list of currencies (`GET`/`POST`/`PUT`/`DELETE /api/currencies`, `worker/routes/currencies.js`, `server/repo/currencies.js`, `src/hooks/CurrencyContext.js`, `src/components/admin/CurrenciesPanel.js`). Super administrators add, alias, switch off or delete currencies under Admin, Currencies. Every currency picker offers only the active ones, and the server refuses unknown or switched-off codes for new ledgers, funds, accounts and loans. Design: `docs/CURRENCIES_DESIGN.md`
- `migrations/`: `0001` auth (accounts, sessions, account_log), `0002`/`0003` ledger schema and seed, `0004` memo funds, `0005` document files, `0006` access codes and guess throttling, `0007` item tracker, `0008` page-level permissions, `0009` entry quantity and unit price, `0010` free-text project kinds, `0011` profit settings (`book_settings`, `profit_rates`), `0012` `books.active` (a ledger is deactivated, not deleted), `0013` loan registers (`loan_registers`, `loan_entries`, `accounts.loan_memberships`), `0014` the managed currency list (`currencies`, seeded with the standard list and every code already in use), `0015` document links (`entry_documents`), `0016` settled loans (`loan_registers.settled_at`), `0017` the lender of a loan entry (`loan_entries.lender`). Appearance and entry counts need no migration: the ledger default palette and list layout are two `book_settings` keys (`appearance.palette`, `appearance.listView`), and entry counts are computed on read
- `src/` React app: sidebar app shell (ledger list, navigation, admin page for super admins), dashboard, ledger, projects, reports, documents, item tracker, settings (grouped into Ledger setup and Display tabs; `src/components/common/ConfirmDialog.js` and `PromptDialog.js` replace browser popups, except the "Discard your changes?" prompt in `Modal.js`; `AppearanceMenu.js` is the palette button in the top bar, `AppearanceSync.js` loads the ledger default, `src/theme.js` and `src/hooks/useListView.js` hold the personal and default choices in the browser)

## Data API (`/api/books/:b`)

Amounts are integers in minor units (10,326.29 PKR = `1032629`); dates are `YYYY-MM-DD`. Errors are `{ success:false, error, details? }`. Booleans are real booleans in responses (`exclude`, `isReserved`, `archived`, `active`).
Roles: viewer reads; editor writes entries, transfers, parties; admin writes funds, holders, categories. A closed year (a `year_closes` row) makes entry/transfer writes return 423 `{error:"year closed"}`.

- `GET /summary?asOf=` total, usable, funds (with balance), `year {cr,dr}` (base currency), `recent` (10 entries)
- `GET /entries` returns `{rows, totals, totalsByCurrency, page, pageSize, count}`; totals cover every matching row and skip `exclude` rows. Filters take comma-separated values (OR within a filter, AND across): `year=2024,2025`, `from`, `to`, `fund=id,id`, `kind=reserved,memo`, `currency=PKR,USD`, `party|category|project=id,none` (`none` = empty), `direction=cr|dr`, `status=paid,pending`, `exclude=0|1`, `linked=0|1`, `min`, `max` (minor units), `q`, `sort=date_desc|date_asc|amount_desc|amount_asc`, `page`, `pageSize`. All values are bound SQL parameters. `opening=1` adds `openings [{fundId, fundName, currency, amount}]` (fund balances before 1 Jan of the earliest year, or `from`; non-zero only; funds matching fund/kind/currency; memo funds only if `kind` has memo or `fund` names one) and `opening`/`closing` in `totals` and each `totalsByCurrency` entry
- Books: `POST /api/books` (super admin) `{name, baseCurrency='PKR', id?}` creates a book (slug id, 409 if taken) with 20 default categories (`server/domain/defaults.js`), fund General and holder Cash; `PUT /api/books/:b` (book admin) `{name?, baseCurrency?}` (baseCurrency 409 if the book has entries); `PUT /api/books/:b/active` `{active}` deactivates (`false`, book admin) or reactivates (`true`, super admin) a ledger; nothing is deleted. Deactivated ledgers return 423 `This ledger is deactivated` to everyone except super admins. `DELETE /api/books/:b` (super admin; 403 if not super admin, 404 unknown, 409 `Deactivate the ledger first` if still active, 409 if it has entries or documents; removes its rows and strips it from memberships); `GET /api/books` also returns `role`, `createdAt` and `active` (non-super accounts get active books only)
- Members (book admin): `GET /api/books/:b/members`, `POST /api/books/:b/members` `{email, role}` (existing account, 404 if none, 409 if already a member), `PUT /api/books/:b/members/:accountId` `{role: viewer|editor|admin|null}` (null removes; 409 when changing your own role)
- `POST /entries/bulk` (editor) `{ids:[1..200 distinct], delete:true | changes:{fundId?, categoryId?, partyId?, partyName?, projectId?, exclude?, status?}}` (exactly one of `delete`/`changes`) changes or soft-deletes several entries atomically and returns `{updated, deleted}`: 404 unknown id or reference, 403 without the Ledger page unless every entry is in a project (and no `projectId:null`), 409 linked transfer legs, archived fund or currency mismatch, 423 closed year; `paid` keeps/sets `paidDate`, `pending` clears it.
- `POST /entries`, `PUT /entries/:id`, `DELETE /entries/:id` (soft delete). Ordinary entries accept `quantity` (positive, up to 3 decimal places, maximum 1 billion) and `unitPrice` (positive integer minor units). The server calculates `amount = quantity * unitPrice`, rounded half up to a minor unit; the total must be positive and at most `10000000000000` minor units. For example `{quantity:10, unitPrice:5000}` yields `amount:50000` (10 tickets at 50 = 500). An optional `amount` must match. Existing amount-only creates and single-unit edits still work; old/imported entries read as quantity 1 and unit price equal to their amount. PUT accepts a partial body and recalculates when quantity or price changes. Linked legs: only date, comment and same-currency amount change (both legs); quantity/price changes are 409 `delete and recreate`
- `POST /entries/:id/refund` `{date}` (editor; body strictly `{date}`) creates an independent, normal editable entry in the opposite direction (cr↔dr) that copies the source's exact amount, quantity, unit price, fund, currency, party, category, project, comment, rate, exclude and meta. The new entry has the requested date, the source's status, and `paidDate` = the requested date when paid (else null). The original is untouched; repeated refunds create further balancing entries. Returns 201 with the new entry. 404 for a missing/deleted/other-book source; 409 for a linked transfer leg or an archived fund; 423 when the source or target year is closed. Accounts without the Ledger page may only refund project entries.
- `POST /transfers` `{date, fromFundId, toFundId, amount, toAmount?, comment?}` returns 201 `{linkId, entries:[dr, cr]}`
- `GET|POST /funds|holders|categories|parties`, `PUT|DELETE /…/:id`. DELETE archives (holders: `active=0`); categories are hard-deleted unless an entry uses them (409). `GET` hides archived unless `?all=1`; funds include `balance`
- `GET|POST /projects`, `GET|PUT|DELETE /projects/:id` (editor writes). `PUT` also takes `moveEntries: true`, which moves the project's existing entries (not linked transfer legs) to the project's fund (the new `fundId` in the same request, else the current one) and returns `movedEntries`; 409 if an entry is in another currency than that fund, 423 if one is in a closed year. List hides closed unless `?all=1` and carries `totals {spent, paid, pending, excluded, count}`; detail adds `byCategory` and `metaKeys` (metaSchema keys, else the union of keys in its entries' `meta`). DELETE is 409 when the project has entries
- `GET /reports/yearly` per base-currency fund and year `{opening, cr, dr, closing}` plus `total` (memo funds left out; transfers counted); `GET /reports/pivot?rows=category|party|project|fund&direction=dr|cr|net&from=&to=&memo=0|1` (base currency, skips Transfer/Conversion/Opening, null ids grouped as `(none)`); `GET /reports/profit?fund=` monthly net of the Profit category with the average rate
- `GET /years`, `POST /years/:y/close` (admin; stores a per-fund snapshot of every fund at y-12-31; 409 if closed), `POST /years/:y/reopen` (admin; 404 if not closed), `GET /years/:y/check` compares current balances with the snapshot `{ok, diffs}`
- Appearance: `GET /api/books/:b/appearance` (any member) returns `{palette, listView}` (the ledger default; `forest` and `cards` when unset). `PUT /appearance` (book admin, `settings` page) takes `{palette?, listView?}`, palette one of the 13 keys `forest, ocean, indigo, plum, rose, terracotta, slate, sky, mint, lavender, coral, sunshine, blush`, listView `cards|table`, at least one field. Personal choices (per account, per browser) are never sent to the server
- `GET /entry-counts` (any book role, but the account needs the `settings` page) returns `{funds, holders, parties, categories}`, each a map of record id to live entry count across all years. Soft-deleted rows are ignored, transfer legs and excluded rows count, zero counts are omitted. Accounts (`holders`) count the entries of their funds. Route: `worker/routes/entryCounts.js`, repo `server/repo/entryCounts.js`
- Loans (`/api/loans`, not under a book; page `loans`, a role per loan): `GET /api/loans` (registers you may see, with `totals`, `settled`), `POST /api/loans` `{name, borrower, lender, description?, currency?}` (creator becomes admin), `GET|PUT|DELETE /api/loans/:r` (`PUT` also takes `settled: true|false`; settling needs a zero balance; delete only when it has no entries), `GET /api/loans/:r/entries?kind=&from=&to=&q=` returns `{register, rows, totals, byLender}`, `POST /api/loans/:r/entries` `{kind: taken|returned, amount, date, lender?, receiver?, comment?}`, `PUT|DELETE /api/loans/:r/entries/:id`. A settled loan refuses entry changes (409). `lender` must be one of the names in the register's lender field (several names are joined with ` & `). Access: `PUT /api/admin/accounts/:id/loan-memberships` (super admin). Rules and tests: `docs/LOANS_DESIGN.md`, `test/api/loans.test.js`, `loan-settle.test.js`, `loan-lenders.test.js`
- Currencies (`/api/currencies`, global): `GET` (any signed-in account) `[{code, name, alias, active}]`; `POST`, `PUT /:code`, `DELETE /:code` (super admin; delete refused while anything uses the code). Alias is display only; exports keep the ISO code. Design: `docs/CURRENCIES_DESIGN.md`
- Item tracker (items and reusable locations per book): see [docs/ITEM_TRACKER.md](docs/ITEM_TRACKER.md)
- `GET /documents?project=&party=&type=&q=&from=&to=` (viewer), `POST /documents`, `PUT|DELETE /documents/:id` (editor; DELETE also removes the R2 object), `GET /documents/types`. `PUT /documents/:id/file` takes the raw file as the body (`Content-Type` pdf/jpeg/png/webp/heic else 415, `X-File-Name` URI-encoded, max 10 MB else 413) and `GET /documents/:id/file` streams it. Documents can be linked to entries: `GET|PUT /documents/for-entry/:entryId` (`PUT {documentIds}` replaces the set), `entryIds` on document create and update, `entries` on every document response and `docCount` on every entry row (design: `docs/DOCUMENT_LINKS_DESIGN.md`). Files live in R2 `DOCS` under `docs/<book>/<id>`; without the binding the file endpoints return 503 `file storage not configured`
- `GET /export?format=json` (admin) the whole book including soft-deleted entries and document metadata; `GET /export?format=csv&year=` (viewer) entries CSV with a UTF-8 BOM and decimal amounts, deleted rows left out. JSON includes `quantity` and `unitPrice`; CSV appends `quantity` and decimal `unit_price` columns
- Nightly cron (02:00 UTC, `worker/index.js` `scheduled`): writes `backups/<book>/<date>.json` to R2 `BACKUPS` (newest 30 per book kept) and deletes expired sessions. Test locally with `npm run worker` then `curl http://localhost:8788/__scheduled`

## Access codes

The sign-in screen shows one Access Code field by default, with a link to email and password. A super administrator creates named codes in Admin › Access codes, picks the ledgers, and either types a simple code (8-64 characters, exact and case-sensitive, e.g. `family-view-2026`, globally unique) or leaves it blank for a strong random one. The code is shown once (only its SHA-256 is stored; it is never listed again). A code gives **viewer** access to those ledgers only, never write or admin. A super administrator can **reset** an active code (blank for a generated one, same rules as create): name and ledgers are kept, the new code is shown once, the old code stops working and its sessions end at once; revoked codes cannot be reset and the new code must be unused and differ from the current one. Revoking a code signs out its sessions at once. Wrong guesses are throttled per client (`cf-connecting-ip`): 8 failures lock that client for 15 minutes, and a global counter caps abuse. Routes: `POST /api/auth/access-code`, `GET|POST /api/admin/access-codes`, `POST /api/admin/access-codes/:id/reset`, `POST /api/admin/access-codes/:id/revoke`, `DELETE /api/admin/access-codes/:id`. A super administrator can also **delete** an active or revoked code permanently (Delete button, with confirmation): its sessions end at once, the code cannot be used again, and the audit log keeps a `delete-access-code` entry (never the code). Tests: `test/auth/access-codes.test.js`.

## Page permissions (resources)

Each regular account and each access code has a global page allowlist (migration `0008_resource_permissions.sql`): `dashboard`, `ledger`, `reports`, `items`, `projects`, `documents`, `settings`, `loans`. It is independent of book roles: a request needs the book role **and** the resource, and book admins cannot change resources. Super administrators always have every page. Existing accounts with no list keep full access; access codes default to Dashboard, Ledger, Reports and Item tracker (existing codes were migrated to that). An explicit empty list is allowed and shows a "no pages" screen. Super administrators edit lists in Admin › Users (Edit pages) and Admin › Access codes (create and Edit pages): `PUT /api/admin/accounts/:id/resources` (`null` clears the list), `PUT /api/admin/access-codes/:id/resources`; both are audited and apply on the next request. `/api/auth/me` and the admin lists include `resources`.

The API enforces it in `worker/api.js` using `server/auth/resources.js`; unknown book paths are refused. Master data (funds, holders, categories, parties) is shared lookup data: readable by pages that show money (dashboard, ledger, reports, projects, settings; parties also documents), writable only with `settings`. `GET /books/:b/project-names` returns project id, name and kind only (no financials) for ledger, documents and reports; project lists and details need `projects`. The UI mirror is `src/auth/resources.mjs` (nav, hash routes, lazy lookups, QuickAdd). Ledger viewers cannot open the entry editor. Tests: `test/auth/resources.test.js`.
