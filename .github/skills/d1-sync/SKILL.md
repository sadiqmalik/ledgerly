---
name: d1-sync
description: Back up, copy and restore the D1 database between live Cloudflare and the local Warden environment for the ledger database (backup live to a file, pull live into local, restore local from a file, push data to live). Use for any "get the live data locally", "restore from file" or "backup before change" request.
---

## First: which app and which direction

Run these commands from the project folder with the app running (`warden env up`). Warden 0.16 rejects a bare `--remote`: always write `warden <cmd> -- --remote ...`.

| Goal | Command | Writes to |
| --- | --- | --- |
| Backup local DB | `warden d1-backup <label>` | file in `backups/` |
| Backup live DB to this Mac | `warden d1-backup -- --remote <label>` | file in `backups/` (live only read) |
| Replace local with live | `warden d1-pull` (types `pull`) | local DB (local backup first) |
| Replace local from a file | `warden d1-restore backups/<file>.sql` (types `restore`) | local DB (local backup first) |
| Inspect live data | `warden d1 -- --remote "SELECT ..."` | nothing |
| Push local data to live | manual only: see below | LIVE |

Files: local `backups/d1-<app>-<ts>-<label>.sql`, live `backups/d1-<app>-remote-<ts>-<label>.sql`, each with a `.sha256`. `backups/` is git-ignored. Needs `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` in the app's `.env` for anything `--remote` (never print them).

## Rules

1. Reading live (`d1-backup -- --remote`, `d1 -- --remote SELECT`) is fine. `d1-pull` and `d1-restore` replace the local database: say so and get a yes unless the user already asked for exactly that. Both save the old local DB as `...-before-pull.sql` / `...-before-restore.sql`, so they are undoable with `d1-restore`.
2. Never write to live without an explicit request: no `--remote` UPDATE/DELETE/INSERT, no `wrangler d1 execute --remote --file`, no deploy. If asked to push data to live: backup live first, export `--no-schema`, change `INSERT INTO` to `INSERT OR IGNORE INTO`, drop `accounts`, `sessions`, `d1_migrations` (and `documents` if their files are not in R2), run the deploy first so migrations match, load with `wrangler d1 execute <db> --remote --file`, then compare row counts. Steps: `ledger/docs/OPERATIONS.md` section 6.
3. After any sync, verify with counts on both sides: `warden d1 "SELECT COUNT(*) AS n FROM entries"` versus `warden d1 -- --remote ...`.
4. To test a load without touching the real local DB, import into a scratch copy: `warden env exec -T app npx wrangler d1 execute <db> --local --persist-to .wrangler/state-scratch --yes --file <file>` and delete the folder after.
5. R2 files (ledger documents) are not copied; only their database records.

## Things that bite

- The local D1 file name depends on `database_id` in `wrangler.toml`. If that id changes, the app opens a NEW empty local DB while the old data stays in `.wrangler/state/v3/d1/*.sqlite`. Restore it with `d1-restore` from a backup instead of hunting for the file.
- The app container must be running or the commands stop with "app is not running".
- A data-only file (no `CREATE TABLE`) is accepted by `d1-restore`; migrations are applied first.
- After a pull the live accounts exist locally, so the live password works locally. Local-only accounts are gone (they are in the before-pull backup).
