---
name: ledger-docs
description: Cheap docs lookup for the ledger project. Use for "how do I..." questions about running, deploying, backing up, restoring, syncing the DB, importing, or using ledger. Answers from docs only.
---

## Rules (keep it cheap)

- Answer ONLY from these files; do not read source code, do not explore, do not edit anything, do not run commands.
- Search with grep first (`grep -n -i <keyword>`), then view only the matching section with a line range.
- Reply with the exact commands plus at most 3 sentences. Say which file and section it came from.
- If the docs do not cover it, say so in one line and stop.

## Files (in order of likelihood)

1. `docs/OPERATIONS.md`: run locally, `warden d1` queries, backups/restore (section 6), nightly R2 backup, tests, troubleshooting, passwords/accounts.
2. `docs/DEPLOYMENT.md`: deploy / push changes to Cloudflare, secrets, migrations on live.
3. `docs/USER_GUIDE.md`: how to use the app (entries, projects, refund/balance, documents, years).
4. `README.md`: API endpoints, commands overview.
5. `docs/ARCHITECTURE.md`, `docs/APP_MAP.md`: only for "how does it work / where is X".

## Quick answers (verify against docs if unsure)

Run from `` with `warden env up`. Warden needs `--` before `--remote`. Source: `docs/OPERATIONS.md` section 6.

- Copy live DB to local (one step): `warden d1-pull` (type `pull`). It backs up local first, exports live, replaces local, restarts the app.
- Backup live DB to this Mac: `warden d1-backup -- --remote <label>` (read only) -> `backups/d1-ledger-remote-<ts>-<label>.sql`.
- Backup local DB: `warden d1-backup <label>`.
- Restore local from a file: `warden d1-restore backups/<file>.sql` (type `restore`; local is backed up first).
- Look at live data: `warden d1 -- --remote "SELECT ..."`.
- Push local data to live: manual and guarded, see OPERATIONS section 6 (live backup first, data-only export, `INSERT OR IGNORE`). Not a Warden command.
- Scheduled backup on Cloudflare: daily cron, a book is saved to R2 `ledger-backups` every `BACKUP_EVERY_DAYS` (10) days.
