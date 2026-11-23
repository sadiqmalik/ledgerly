# Ledger: Technical specification

A one-page reference for what the app is built with, what it needs to run, and the main technical rules. For how the code is organised see [ARCHITECTURE.md](ARCHITECTURE.md); for running it see [GETTING_STARTED.md](GETTING_STARTED.md), [OPERATIONS.md](OPERATIONS.md) and [DEPLOYMENT.md](DEPLOYMENT.md).

## 1. What the app is

A family finance and records web app that replaces a shared Excel workbook. It is a single-page web app (React) served by a serverless backend (Cloudflare Worker) with a SQL database (Cloudflare D1) and object storage (Cloudflare R2). Main areas: ledgers (books) with funds, entries, transfers, years and reports; projects; loans; documents with files; the Notebook (private notes, important dates, categories); the Item Vault; admin tools; nightly backups.

## 2. Technology stack

| Layer | Technology | Version (see `package.json`) |
| --- | --- | --- |
| Language | JavaScript (ES2022+), no TypeScript. CommonJS on the server (`server/`, `worker/`), ES modules in the browser (`src/`) | Node 22 |
| Frontend framework | React | 19 |
| Styling | Tailwind CSS (via `@tailwindcss/vite`) with design tokens in `src/styles/tokens.css`; 13 colour palettes, light and dark mode | 4.3 |
| Frontend routing | Hash routing with a small hook (`useHashRoute`); no router library | n/a |
| HTTP client | axios | 1.x |
| Build tool | Vite with `@vitejs/plugin-react` | 8 |
| Backend framework | Hono on a Cloudflare Worker (`worker/index.js`, `worker/api.js`, routes in `worker/routes/`) | 4 |
| Validation | zod (every request body and query) | 3 |
| Database | Cloudflare D1 (SQLite), schema by SQL migrations in `migrations/` (24 files, applied in order, additive) | n/a |
| File storage | Cloudflare R2: bucket `DOCS` (document files, `docs/<book>/<doc>`) and `BACKUPS` (nightly JSON backups, newest 30 kept) | n/a |
| Static hosting | Worker Assets binding (`dist/`, single-page-app fallback) | n/a |
| Scheduled work | Cloudflare Cron Trigger, daily 02:00 UTC: purge expired sessions, write a backup when the newest is `BACKUP_EVERY_DAYS` old | n/a |
| Deployment tool | Wrangler | 4 |
| Local environment | Warden (Docker) with HTTPS at `https://app.ledgerly.test`, or plain npm on `http://localhost:3100` | n/a |
| Tests | Node's built-in test runner (`node --test`), supertest, Wrangler `getPlatformProxy` for a real local D1 | 299 tests |
| Spreadsheet import and export | exceljs (one-time Excel import in `tools/import-xlsx/`, Excel download) | 4 |

Worker settings (`wrangler.toml`): `compatibility_date` 2025-09-01, flag `nodejs_compat`, bindings `DB` (D1), `DOCS` and `BACKUPS` (R2), `ASSETS`. Variables: `APP_TIMEZONE` (Europe/Stockholm), `DEFAULT_CURRENCY` (PKR), `BACKUP_EVERY_DAYS`. Secrets and the live address are never committed: locally they come from `.dev.vars`, on the live app from Wrangler secrets.

## 3. Prerequisites

To develop or run locally:

- Node 22 and npm (the Warden container already has Node 22).
- Docker and Warden (optional, recommended): HTTPS at `ledgerly.test`, `warden` commands for backups and restarts.
- A modern evergreen browser (Chrome, Edge, Firefox, Safari) for the app. It works at phone widths (375 px and up).

To deploy: a Cloudflare account with Workers, D1 and R2 enabled, and Wrangler logged in. Create the D1 database and the two R2 buckets once (see DEPLOYMENT.md). No other service is needed: no Redis, queue, search engine or external SQL server.

## 4. Data and money rules

- Money is stored as **integer minor units** (for example paisa or cents), never floating point. Quantity times unit price is calculated in one place (`server/domain/entryPricing.js`) so totals are never multiplied twice.
- Every ledger (book) has a base currency; funds in other currencies are wallets shown in their own currency. A managed currency list (with aliases such as `kr`) is shared by the whole app.
- There are no foreign keys in the schema; the repositories (`server/repo/`) and routes keep rows consistent, and deleting a ledger removes its rows table by table plus its R2 files.
- **Timestamps (design rule).** Every table and every record the app creates carries `created_at` and `updated_at` (ISO text, set by the server, `updated_at` refreshed on every change), and screens show them ("Created ...", plus "updated ..." when it changed). A new table or a new screen for a record must include both; do not ship one without.
- Closed years are read-only. Linked transfers keep both legs in step. Excluded entries stay on record but are left out of totals.
- Migrations are tracked by file name, applied on app start and by deploy, and are additive. Always take a backup before applying new ones to live data.

## 5. Security model

- **Passwords**: PBKDF2-SHA256, 100,000 iterations, random salt, constant-time compare, minimum 6 characters. Failed sign-ins lock the account for a while; unknown accounts take the same time to answer.
- **Sessions**: cookie sessions stored in D1, with an idle timeout and a one-week maximum; changing a password, access code or admin type signs the person out.
- **Admin types**: a **super admin** has every ledger, loan and page and needs no specific access; a **normal admin** has only the ledger roles (viewer, editor, admin), loan roles and pages a super admin gives. Only super admins manage admins, access codes, all ledgers and currencies.
- **Access control**: every API call needs the book (or loan) role and the page permission (`server/auth/resources.js`, mirrored for the UI in `src/auth/resources.mjs`, kept equal by a test). The API is the real check; the UI only hides what a person cannot use.
- **Access codes**: strictly view only (viewer on chosen ledgers, never Settings; the Notebook only when switched on, read only, for notebooks linked to its ledgers), stored only as a SHA-256 hash, shown once, revocable and restorable.
- **Notebooks**: several, each linked to a ledger (that ledger's roles decide: Viewer reads, Editor or Admin changes; needs the Notebook page) or to none (only the owning super admin). Access codes with the Notebook page can only read notebooks linked to their ledgers (every write route answers 403, private notebooks are hidden).
- **Notebook entries**: optional start time and end (duration), time zone resolved entry, category, notebook, then the ledger zone (`/api/books/:b/timezone`), and locks on entries, categories and notebooks (writes answer 409 until unlocked).
- **Input**: zod validates every request; SQL uses bound parameters; uploads accept PDF and images up to 10 MB.
- **Data hygiene**: real data, `.env*`, `.dev.vars` and backups are never committed; the public copy is generated by a sync tool that blocks personal data (`docs/PUBLIC_SYNC.md`).

## 6. Repository layout

| Path | Contents |
| --- | --- |
| `src/` | React app: `components/`, `layout/`, `hooks/`, `services/`, `auth/`, `utils/`, `styles/` |
| `worker/` | Worker entry, API wiring and route modules |
| `server/` | Domain logic (`domain/`), repositories (`repo/`), auth (`auth/`) |
| `migrations/` | D1 schema migrations `0001` to `0024` |
| `test/` | API, auth and domain tests (`node --test`) |
| `tools/import-xlsx/` | One-time Excel import (needs the private workbook, never committed) |
| `scripts/` | Account CLI, password reset, public-sync tool |
| `docs/` | This documentation set |

## 7. Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Vite (port 3100) and the local Worker (port 8788) with local D1 and R2 |
| `npm run build` | Production build into `dist/` |
| `npm test` | Applies migrations to a test database, then runs all tests (about 3 minutes) |
| `npm run db:migrate:local` | Apply migrations to the local database |
| `npm run account:create` / `account:reset-password` | Create or reset an account from the command line |
| `warden env up` / `restart app` / `d1-backup <label>` | Local environment, restart (applies migrations) and local database backup |

## 8. Requirements the app meets

- Works for several ledgers, several currencies and several admins with selective access, with a per-ledger role and per-loan role model.
- Works on phones and desktops, light and dark mode, 13 palettes, renamable pages, keyboard and screen-reader friendly controls (labels, `aria-*`, Esc closes dialogs).
- Runs on the Cloudflare free or low tiers: no always-on server, nightly JSON backups to R2, exports to CSV, Excel and JSON.
- One UI style everywhere: boxed cards, switches instead of checkboxes and option pickers, shared dialogs (`Modal`, `ConfirmDialog`).
- Times use the `APP_TIMEZONE` setting (default Europe/Stockholm); dates are ISO `YYYY-MM-DD` and inputs are limited to years 1900 to 9999.
