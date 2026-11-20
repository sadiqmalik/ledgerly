---
name: safe-money-operations
description: "Perform financial-data operations safely: migrations, backups, restores, and role-sensitive changes with strict non-destructive defaults."
---

## Default mode: safe/read-only first

1. Confirm project (the ledger app).
2. Inspect migrations/ops docs and command wrappers.
3. Prefer read-only checks before any write operation.

## Approved local-first workflow

- Use Warden/D1 helper commands only in local mode unless explicitly asked otherwise

### Ledger

- Schema changes: review `migrations/*.sql`
- Local apply: `npm run db:migrate:local`
- Local tests: `npm test`

## Remote data: reads are fine, writes need a request

- Allowed without asking: `warden d1 -- --remote "SELECT ..."` and `warden d1-backup -- --remote <label>` (they only read live).
- `warden d1-pull` and `warden d1-restore` replace the LOCAL database (they back it up first): confirm unless the user asked for it. Full procedures: skill `d1-sync`.

## Strict prohibitions unless explicitly requested

- No `--remote` database mutations (including pushing data to live)
- No deploy (`warden deploy`, `wrangler deploy`, etc.)
- No destructive data actions (clear/restore/import over live data)
- No commit/push

## Data handling safeguards

- Never expose secret values from `.env*`.
- Never inspect or modify backup artifacts unless task requires and permission is clear.
- Preserve role/resource authorization behavior when changing admin/data endpoints.

## Reporting format

- What was changed
- Which environment was touched (local only or explicit remote)
- Validation commands run
- Residual risk or manual follow-up needed
