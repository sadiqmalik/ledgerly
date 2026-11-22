# Demo data

`demo-seed.sql` fills a fresh Ledgerly database with fake but realistic data: two ledgers ("Family Budget", "Home Project Fund"), funds and accounts in PKR/SEK/USD, categories, people, projects with budgets, three loans, document metadata (no files), items, notebooks, notes and yearly important dates, and two closed years (2024, 2025). Everything is made up; ids are fresh. It only inserts rows, so run it after the migrations. `demo-reset.sql` empties the demo tables (not accounts) so the seed can be loaded again.

## Load into the local database (Warden)

The app must be running (`warden env up`).

```bash
warden d1-restore demo/demo-seed.sql          # asks you to type "restore"; backs up the current local D1 first,
                                              # applies the migrations (the file is data only), loads the seed, restarts the app
warden app node demo/create-demo-accounts.js    # asks for a demo password (hidden)
```

Sign in as `demo-super@example.com` (super admin) or `demo-admin@example.com` (admin of Family Budget only). Without Warden: `npm install`, `npm run db:migrate:local`, `npx wrangler d1 execute ledger --local --file demo/demo-seed.sql`, then `node demo/create-demo-accounts.js`.

## Load into the live demo site (remote write, run it yourself)

Use a Cloudflare account and database dedicated to the demo, never one holding real data. No Warden command loads a file into the live D1 (`warden d1` takes inline SQL only), so this goes through the app container with the Cloudflare credentials from `.env` (the same way `warden deploy` does):

```bash
warden env exec -e CLOUDFLARE_API_TOKEN -e CLOUDFLARE_ACCOUNT_ID app npx wrangler d1 migrations apply ledger --remote
warden env exec -e CLOUDFLARE_API_TOKEN -e CLOUDFLARE_ACCOUNT_ID app npx wrangler d1 execute ledger --remote --file demo/demo-reset.sql   # only when reloading
warden env exec -e CLOUDFLARE_API_TOKEN -e CLOUDFLARE_ACCOUNT_ID app npx wrangler d1 execute ledger --remote --file demo/demo-seed.sql
warden env exec -e CLOUDFLARE_API_TOKEN -e CLOUDFLARE_ACCOUNT_ID app node demo/create-demo-accounts.js --remote
```

## Regenerate (maintainers of the private source only)

The generator lives in the private repository (`tools/demo-data/make-demo.js`) and is not part of Ledgerly. It reads a live D1 export and writes new fake data from a fixed seed, so the output is reproducible.
