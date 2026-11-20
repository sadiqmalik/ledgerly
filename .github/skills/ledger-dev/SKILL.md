---
name: ledger-dev
description: Implement bounded changes in ledger with strict money/domain safety and targeted validation.
---

## Scope

Use for implementation or docs aligned to the current code.

## Read order (minimum)

1. `README.md` (architecture + operations links)
2. Targeted files for the requested feature/fix
3. `docs/OPERATIONS.md` only if command/run details are needed

## High-signal entry points

- API wiring/routes: `worker/api.js`, `worker/routes/*`, `worker/index.js`
- Domain logic: `server/domain/*`
- Persistence: `server/repo/*`
- Auth, access codes and page permissions: `server/auth/*` (`resources.js`, `accessCodes.js`), `src/auth/*` (`resources.mjs` must mirror the server list)
- Item tracker: `worker/routes/items.js`, `server/repo/items.js`, `src/components/items/*`, `docs/ITEM_TRACKER.md`
- UI conventions: skill `ledger-ui`; database sync and backups: skill `d1-sync`; docs to update after a change: skill `docs-sync`
- UI: `src/components/*`, `src/hooks/*`, `src/services/dataAPI.js`
- Schema/migrations: `migrations/*.sql`

Paths above are relative to ``; run commands from that directory.

## Common local commands

- `npm run dev`
- `npm test`
- `npm run build`
- `npm run db:migrate:local`

## Implementation checklist

1. Trace request path (UI/API/domain/repo).
2. Keep money in integer minor units.
   For quantity/price changes, preserve the authoritative calculation in `server/domain/entryPricing.js` and keep UI, exports and reports consistent without multiplying totals twice.
3. Preserve linked transfer invariants and year-close restrictions.
4. Adjust tests close to changed behavior.
5. Run targeted validation.

## Safety rules

- Do not run remote D1 writes/deploy without explicit approval.
- Do not commit real financial data, `.env` or `.dev.vars`.
- No commit unless requested.
