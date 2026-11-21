# Ledger: Operations Guide

For the person who runs the Ledger: starts it on the Mac, backs it up, tests it and deploys it to Cloudflare. For the project layout and the Data API, see the README. For using the app, see `USER_GUIDE.md`. Run commands from the `ledger` folder.

---

## 1. What runs

| Part | What it does |
| --- | --- |
| Vite dev server | Serves the React app on port 3100 |
| Worker (`wrangler dev`) | Serves `/api` and runs the nightly job on port 8788 |
| D1 database `ledger` | The data. Locally under `.wrangler/state/`. Live on Cloudflare (not created yet). |
| R2 `BACKUPS` (bucket `ledger-backups`) | Nightly JSON backups |
| R2 `DOCS` (bucket `ledger-docs`) | Document files |
| Cron trigger | Nightly backup and session cleanup at 02:00 UTC |

Migrations in `migrations/` run in order: `0001` auth, `0002` ledger schema, `0003` seed (the book, holders, funds, categories), `0004` memo funds, `0005` document files, `0006` access codes, `0007` item tracker, `0008` page permissions, `0009` entry quantity, `0010` project kinds, `0011` profit settings, `0012` ledger active flag (`books.active`), `0013` loan registers, `0014` currencies, `0015` entry-document links, `0016` settled loans, `0017` loan entry lender, `0018` loans shared with access codes, `0019` diary notes, `0020` diary categories and important dates, `0021` diary privacy (an owner on categories).

---

## 2. Run with Warden

The stack is defined in `.warden/warden-env.yml`. Warden puts it behind Traefik on your Mac.

Once, create the local HTTPS certificate:

```bash
warden sign-certificate ledgerly.test
```

Each time:

```bash
warden env up        # starts or recreates the containers
# open https://app.ledgerly.test
```

| Command | What it does |
| --- | --- |
| `warden env ps` | Shows the containers and their health |
| `warden env down` | Stops and removes the containers. The data is kept. |
| `warden app` | Opens a shell in the app container |
| `warden app <command>` | Runs one command there, for example `warden app npm test` |

Addresses: `https://app.ledgerly.test` is the app, and `/api` goes to the Worker. `https://worker.ledgerly.test` is the same Worker on its own host.

Check the API (no sign-in needed): `curl -s https://app.ledgerly.test/api/health`

`.env` and `.dev.vars` are git-ignored. Copy them from `.env.dist` and `.dev.vars.example` if they are missing. Under Warden, `.dev.vars` needs `ALLOWED_ORIGIN=https://app.ledgerly.test`.

---

## 3. Run without Warden

```bash
npm install
npm run dev
```

This starts Vite on `http://localhost:3100` and the Worker on port 8788. The Worker applies the migrations to the local D1 first. Open `http://localhost:3100`. Over plain http the Worker accepts that origin by itself, so no `.dev.vars` is needed.

| Command | What it does |
| --- | --- |
| `npm run client` | Vite only |
| `npm run worker` | The Worker only, with the scheduled-trigger test enabled |
| `npm run stop` | Frees ports 3100 and 8788 |

Settings in `wrangler.toml` `[vars]`: `ALLOWED_ORIGIN`, `APP_TIMEZONE`, `BACKUP_EVERY_DAYS` and `DEFAULT_CURRENCY` (3-letter code, default USD, used for new ledgers, funds, accounts and loan registers; existing data keeps its own currency). A fresh install has no data: create the first super administrator with `warden account-create` (or `npm run account:create`), sign in and use **New ledger**. See `docs/GETTING_STARTED.md`.

---

## 4. Administrators and passwords

The first account is a super administrator. The password is typed at a hidden prompt, twice, at least 6 characters. It is never a command argument.

```bash
npm run account:create -- --email you@example.com --name "Your Name"    # without Warden
warden account-create --email you@example.com --name "Your Name"         # with Warden
```

Reset a password. This also clears the lockout and signs the account out everywhere:

```bash
npm run account:reset-password -- --email you@example.com
warden account-reset-password --email you@example.com
```

For the live database, add `--remote` after a `--`. The command asks you to type `live`, and it needs `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` in `.env`. Do this only after the deploy (section 11) has created the live tables.

```bash
warden account-create -- --remote --email you@example.com --name "Your Name"
warden account-reset-password -- --remote --email you@example.com
```

Other accounts get roles per book. Only a super administrator can do this, through the API. There is no screen for it yet.

```
GET  /api/admin/accounts
POST /api/admin/accounts
PUT  /api/admin/accounts/:id/memberships     body: [{"bookId":"family","role":"viewer|editor|admin"}]
```

---

## 5. Database commands

| Command | What it does |
| --- | --- |
| `warden d1` | Lists the tables in the local database |
| `warden d1 "SELECT ..."` | Runs SQL on the local database |
| `warden d1 -- --remote "SELECT ..."` | Runs SQL on the live database |

On the live database, anything other than SELECT, PRAGMA, EXPLAIN or WITH asks you to type `live`. Take a backup before any UPDATE or DELETE.

---

## 6. Backups, copying live to local, and restore

Every command below is a Warden command. Run it from the `ledger` folder with the app running (`warden env up`). Warden 0.16 rejects a bare `--remote`, so always put `--` before it.

| I want to... | Command | Changes |
| --- | --- | --- |
| Back up the **local** database | `warden d1-backup <label>` | nothing (writes a file) |
| Back up the **live** database to my Mac | `warden d1-backup -- --remote <label>` | nothing (read only) |
| Copy **live to local** (replace local with live) | `warden d1-pull` | local database |
| Restore the **local** database from a file | `warden d1-restore backups/<file>.sql` | local database |
| Look at live data | `warden d1 -- --remote "SELECT ..."` | nothing |

The `<label>` is only a name (for example `before-move`), not a file path. The command chooses the file name itself; a path such as `backups/x.sql` is shortened to the label `x`. Files are written to `backups/` (git-ignored) with a `.sha256` beside each:

- local: `backups/d1-ledger-<YYYYMMDD-HHMMSS>-<label>.sql`
- live: `backups/d1-ledger-remote-<YYYYMMDD-HHMMSS>-<label>.sql`

The live commands need `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` in `.env`. The live database is only ever read by these commands.

### Copy the live database to local

```bash
warden d1-pull
```

It asks you to type `pull`, then: saves the current local database as `...-before-pull.sql`, exports the live one, replaces the local database with it, and restarts the app. Afterwards you can sign in locally with your live password, because live accounts come along. Document files in R2 are not copied, only their records. Undo it with `warden d1-restore backups/<...-before-pull.sql>`.

### Restore from a file

```bash
warden d1-restore backups/<file>.sql
```

It asks you to type `restore`, saves the current local database as `...-before-restore.sql`, replaces it with the file and restarts the app. The file can be any `d1-backup` or `d1-pull` export. A data-only file (no `CREATE TABLE`) is loaded after the migrations are applied. The path must be inside the project (for example `backups/...`). Check a file first with `shasum -a 256 -c <file>.sha256`.

### Push local data to live (manual, on purpose)

There is no Warden command that writes to the live database. When you must (for example the first load), do it by hand, with a backup first:

1. `warden d1-backup -- --remote before-push` (live backup).
2. Export only the data: `npx wrangler d1 export ledger --local --no-schema --output backups/ledger-data.sql`. Edit it: change `INSERT INTO` to `INSERT OR IGNORE INTO`, and remove the `accounts`, `sessions`, `documents` and `d1_migrations` lines if live already has them.
3. Load it: `npx wrangler d1 execute ledger --remote --file backups/ledger-data.sql` (credentials loaded from `.env`).
4. Compare counts with `warden d1 -- --remote "SELECT COUNT(*) FROM entries"`.

The live schema must already match: run the deploy (section 11) first so the migrations are applied.

### Other copies

- A full copy of one book: an admin opens Settings › Data and presses **Download backup (JSON)**. It holds everything except document files, and includes deleted rows.
- Scheduled copies on Cloudflare: section 7.

---

## 7. Scheduled backup on Cloudflare

The cron trigger runs daily at 02:00 UTC (`[triggers]` in `wrangler.toml`). A **backup is written only when a book's newest backup is at least `BACKUP_EVERY_DAYS` old** (10 by default, set under `[vars]` in `wrangler.toml`). Each run:

- writes each due book to R2 `BACKUPS` as `backups/<bookId>/<YYYY-MM-DD>.json`
- keeps the newest 30 files per book and deletes older ones
- backs up loan registers the same way: each register is written under `loans/<registerId>/<YYYY-MM-DD>.json`, with the same interval and the newest 30 kept
- deletes expired sessions (every day)

If one book fails, the others still run, and the log names the failure. To change the interval, edit `BACKUP_EVERY_DAYS` and deploy.

To test it locally, with the Worker running (`npm run worker` or `warden env up`):

```bash
warden app curl -s http://127.0.0.1:8788/__scheduled
```

The log line `nightly <date>: backed up ...` appears in the app container's output. The test writes to the local R2 emulation. Check the live backups in the `ledger-backups` bucket in the Cloudflare dashboard.

---

## 8. Load existing data

To fill an empty database with existing data, restore a backup (section 6). Back up first, restore into the local database, check the Dashboard and Reports, and only then think about the live database.

---

## 9. Tests

```bash
npm test                 # or: warden app npm test
```

This applies the migrations to a test database under `.wrangler/state-test`, then runs `test/auth`, `test/domain` and `test/api`. Your local data is not touched.

---

## 10. Packages

`node_modules` is a Docker volume, separate from the Mac's `node_modules`. Running `npm install` on the Mac does not change the copy the app uses.

When the app container starts, it compares `package-lock.json` with `node_modules/.installed-lock`. If they differ, it runs `npm ci`, copies the lock file, and then starts `npm run dev`. To add a package:

```bash
npm install <package>    # on the Mac: updates package.json and package-lock.json
warden env up           # the container sees the new lock file and reinstalls
```

While it reinstalls, the page can be blank. Wait, check `warden env ps`, and reload. If it is still blank, run `warden app npm ci` and reload.

---

## 11. Deploy to Cloudflare

The step-by-step guide for deploying to Cloudflare, including first-time setup, rollback and custom domains, is `docs/DEPLOYMENT.md`.

Routine deploy: `warden deploy` from the `ledger` folder, after `warden env up`. Live data is never overwritten by a deploy.

**Migration 0012 must be on the live database before the new code runs.** The new code reads `books.active`. `warden deploy` applies new migrations to the live D1 before it deploys the Worker, so run it normally and let it finish. If the migration is applied any other way, apply `0012_book_active.sql` to the live D1 first, then deploy. Without it the live site shows "Could not load your books". To check the live migrations without changing anything, run `npx wrangler d1 migrations list ledger --remote`. For local work, run `npm run db:migrate:local` (`npm run dev` and `npm run worker` also apply it).

Check the live API afterwards with `curl -s https://ledger.example.workers.dev/api/health`.

---

## 12. Troubleshooting

For logs, the database and migration checks, and the health check, see `docs/TROUBLESHOOTING.md`. After an update, **Internal error** on every page usually means a migration has not been applied: back up (`warden d1-backup before-migrate`), then `warden env restart app`.

| Symptom | Cause | Fix |
| --- | --- | --- |
| **403** `Forbidden origin` | The address in the browser is not in the allowed list. | Under Warden, `.dev.vars` needs `ALLOWED_ORIGIN=https://app.ledgerly.test`. Without Warden, open `http://localhost:3100`. Live, `ALLOWED_ORIGIN` in `wrangler.toml` must match the address you open, then run `warden deploy`. |
| Blank page after adding a package | The container is still reinstalling, or the install failed. | Wait, check `warden env ps`, reload. If it stays blank, run `warden app npm ci`. See section 10. |
| **423** `year closed` | The date is in a closed year. | An admin reopens the year in Settings › Years, and closes it again afterwards. |
| **409** archiving a fund: "Fund still has a balance" | The fund's balance is not zero. | Transfer the money to another fund, then archive. |
| **503** `file storage not configured` | The `DOCS` binding is missing: the `ledger-docs` bucket is not created, or not bound. | Create the bucket (section 11, step 2), then `warden deploy`. |
| `warden deploy` says the app is not running | Deploy runs inside the app container. | `warden env up`, then deploy. |
| A `--remote` command asks for `live` | The safety check on the live database. | Type `live` only if you mean to change live data. |
| Port 3100 or 8788 in use | An earlier `npm run dev` is still running. | `npm run stop`. |
| Log shows `Nightly job failed for ...` | One book failed to back up. | Read the book id in the log. The other books were still backed up. |
