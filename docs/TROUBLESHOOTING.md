# Technical guide: checking problems (logs, database, health)

For the person running the app. Use this when a page shows **Internal error**, nothing loads, or data looks wrong. Run commands from the `ledger/` folder. Nothing in sections 1 to 5 changes data unless it says so. Never paste tokens or account ids into notes or chats.

## 1. The pieces, and what each one does

| Piece | What it is | Where to look when it breaks |
| --- | --- | --- |
| **Screen** (React, Vite) | The pages you click. Local: `https://app.ledgerly.test`. | The browser's developer tools (Console and Network tabs). |
| **API** (Hono worker) | Answers `/api/...`. Local: `https://worker.ledgerly.test`. Live: your `workers.dev` address. | The app log (section 3). |
| **Database** (D1, SQLite) | All ledger, loan, user and document records. | Section 4. |
| **Files** (R2) | Backups (`ledger-backups`) and document files (`ledger-docs`). | Cloudflare dashboard, R2. |

Rule of thumb: the screen shows only "Internal error". The real reason is in the API log, and the log line carries the same **request id** the screen shows.

## 2. Five-minute checklist (local)

Do these in order and stop at the first one that fails.

1. **Is the app container up?**
   ```bash
   warden env ps
   ```
   `ledger-app-1` must say `Up`. If not: `warden env up`.
2. **Is the API alive and the database connected?**
   ```bash
   curl -sk https://worker.ledgerly.test/api/health
   ```
   Healthy: `{"ok":true,"driver":"d1"}`. If it says `{"ok":false,"error":"Unavailable",...}` the API cannot reach the database: go to section 4.
3. **Does the API answer at all?**
   ```bash
   curl -sk -o /dev/null -w "%{http_code}\n" https://worker.ledgerly.test/api/loans
   ```
   `401` means the API works (you are just not signed in). `500` means an error inside the API: read the log (section 3). No answer means the worker is down: section 5.
4. **Read the last errors** (section 3).
5. **Check the database has every table** (section 4, "Migrations"). A missing table is the most common cause after an update.

## 3. Reading the logs

### Local app log
```bash
warden env logs --tail 80 app
```
Useful variants:
```bash
warden env logs --tail 300 app | grep -i "error"      # only the errors
warden env logs -f app                                 # live follow, Ctrl+C to stop
```
What you will see:
- `[wrangler:info] GET /api/books/family/funds 200 OK (118ms)`: one line per request. `200` fine, `401` not signed in, `403` not allowed, `409` a business rule (for example "year closed"), `500` a bug or a broken database.
- `[<request id>] GET /api/... Error: ...`: the real error behind an **Internal error**, with a stack trace. The id is the same one in the browser response (Network tab, response body: `"requestId"`). Search the log for that id.
- `[cause]: Error: no such table: entry_documents: SQLITE_ERROR`: the database is missing a migration (section 4).

### What the common messages mean

| Log text | Meaning | Fix |
| --- | --- | --- |
| `no such table: X` or `no such column: X` | A migration has not been applied to this database. | Section 4, "Migrations". |
| `SQLITE_CONSTRAINT` | The data broke a rule (duplicate, missing value). | Read the SQL and the request; usually a bug to report. |
| `D1_ERROR` / `Unavailable` on `/api/health` | The API cannot open the database. | Section 4, "Database not connected". |
| `Forbidden origin` (403) | The address in the browser is not the allowed origin. | `docs/OPERATIONS.md` section 12. |
| `file storage not configured` (503) | The document bucket is not bound. | `docs/OPERATIONS.md` section 11. |
| `Nightly job failed for <book>` | One ledger's scheduled backup failed. | Read the book id; the others were still saved. |

### Browser
Open developer tools (F12 or Cmd+Option+I). **Network** tab: click the red request, read **Response** (the message and `requestId`) and **Headers** (the URL and status). **Console** tab: errors from the screen itself (red text). A white page with a Console error is a screen bug, not a database problem.

### Live (Cloudflare)
- Stream live logs from your terminal (needs your Cloudflare login, read only):
  ```bash
  npx wrangler tail ledger
  ```
  Open the app in another window and repeat the failing action; the error and its request id appear. Ctrl+C to stop.
- Or in the Cloudflare dashboard: **Workers & Pages** > `ledger` > **Logs** (or **Observability**). Filter by status or by the request id.
- Live health check (use your own address): `curl -s https://<your-worker-address>/api/health`.

## 4. Checking the database

### Local database
```bash
warden d1                                   # lists the tables
warden d1 "SELECT COUNT(*) AS n FROM entries"
warden d1 "SELECT id, name FROM books"
```
Read only queries (`SELECT`, `PRAGMA`) are safe. Where the data lives: `.wrangler/state/v3/d1/miniflare-D1DatabaseObject/<database id>.sqlite` (keep it, never commit it). If the app suddenly looks empty, see "Data seems gone" below before doing anything.

### Migrations (are all tables there?)
```bash
warden d1 "SELECT name FROM d1_migrations ORDER BY id DESC LIMIT 5"
```
The newest name should match the newest file in `migrations/`. If a file is newer than the list, apply it:
1. Take a safety copy first: `warden d1-backup before-migrate`
2. Restart the app (it applies migrations on start): `warden env restart app`
3. Check the log shows the new file with a tick, then the `Ready on` line:
   ```bash
   warden env logs --tail 40 app | grep -i "migrat\|Ready"
   ```
The same mismatch on **live** is fixed by `warden deploy` (it applies pending migrations). Back up live first (`warden d1-backup -- --remote live-before`, see `docs/OPERATIONS.md` section 6).

### Database not connected
Symptoms: `/api/health` returns `ok:false` or 503; every page says Internal error.
1. `warden env ps` and the log: is the worker running and did it print `Ready on`? If not: `warden env restart app`.
2. Look for `D1_ERROR` or `database` in the log. In `wrangler.toml`, the `[[d1_databases]]` block must name binding `DB` (never put real ids in docs or chats).
3. Local data folder missing or locked: only one app container may use `.wrangler/state`. Make sure no second `npm run dev` or test run is open (`npm run stop`).
4. Live: the Cloudflare dashboard, **Storage & Databases** > **D1** > `ledger` must exist, and `wrangler.toml`'s id must be the same database. A wrong id after a rename is the usual cause.

### Data seems gone (locally)
This has happened once: the local file name is keyed by `database_id`. If `database_id` in `wrangler.toml` changed, the app opens a new empty file and the old data is still in the old `.sqlite` file. Do not delete anything. Ask for help or follow `docs/OPERATIONS.md` section 6 (restore from a backup file). Backups are in `backups/` (git ignored).

### Compare live with local
```bash
warden d1 "SELECT COUNT(*) AS n FROM entries WHERE deleted_at IS NULL"
warden d1 -- --remote "SELECT COUNT(*) AS n FROM entries WHERE deleted_at IS NULL"
```
(`--remote` needs your Cloudflare token in `.env`; it never changes data for a `SELECT`.)

## 5. Restarting and resetting (safe order)

| Situation | Do this |
| --- | --- |
| Page errors after pulling or changing code | `warden env restart app`, then section 2 again. |
| Blank page after a package change | Wait, then `warden app npm ci`. |
| Port 3100 or 8788 in use | `npm run stop`. |
| Container will not start | `warden env up` and read `warden env logs --tail 80 app` for the first error. |
| Forgot a password | `warden account-reset-password` (see `docs/OPERATIONS.md` section 4). |
| Need a clean copy of live data | `warden d1-pull` (takes a local backup first). |
| Need to undo a bad change | `warden d1-restore <file>` (takes a backup first). |

Never run `reset`, `delete` or `restore` against live unless you mean to; live commands ask you to type `live`.

## 6. When you ask for help, send this

1. What you clicked and the time.
2. The `requestId` from the Network tab response (or the screen).
3. The log lines for that id: `warden env logs --tail 300 app | grep <requestId>` (or a few lines around it, with the stack trace).
4. Output of `curl -sk https://worker.ledgerly.test/api/health` and `warden d1 "SELECT name FROM d1_migrations ORDER BY id DESC LIMIT 3"`.
5. Which environment (local or live) and whether it worked before the last change.

Do not include passwords, tokens, cookies, or the `.env` files.

## 7. Keeping this guide current

When a command, log message or migration process changes, update this file and `docs/OPERATIONS.md` section 12 (the `docs-sync` skill lists which docs to touch).
