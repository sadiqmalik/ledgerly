# Ledgerly: deployment

This page explains how the app gets from your Mac to Cloudflare: the routine deploy, the one-time setup, the optional automatic deploy, rollback, the `workers.dev` address and a custom domain.

Deploying is optional: the app is meant to run locally under Warden, and every deployment uses the deployer's own Cloudflare account and token (nothing in this repository holds credentials). The app runs on a Cloudflare account on the free plan. Read the naming checklist (section 2) before you run a command. Read `docs/OPERATIONS.md` too. It covers running the app with Warden and backups.

Placeholders in this guide: `<your-worker>` is your `workers.dev` subdomain (for example `ledger-yourname`), and `you@example.com` is your Cloudflare login. Replace them with your own values.

---

## Every deploy (routine)

1. Test locally under Warden (https://app.ledgerly.test).
2. Deploy from the project folder:

   ```bash
   cd /path/to/ledgerly
   warden deploy
   ```

   This needs the app running (`warden env up`) and `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` in `.env`. Or, once Workers Builds is connected (section 5), commit and push to `master` instead.
3. Open the live address and sign in to check.

`warden deploy` runs three steps in order and stops at the first failure: it builds the frontend (`npm run build`), applies any new migrations to the live `ledger` database (`npx wrangler d1 migrations apply ledger --remote`), then deploys the Worker (`npx wrangler deploy`). Data is never overwritten by a deploy.

Pushing code or running `wrangler deploy` alone does not apply database migrations. The automatic deploy command must include the migration step as well.

## Checking production logs and login errors

The browser shows `Internal error` with a request ID instead of exposing database details. Find the matching request ID in the Worker logs:

1. In Cloudflare, open **Workers & Pages**, select **ledger**, then open **Logs > Live** (or **Observability > Logs**, depending on the dashboard).
2. Start streaming logs, then reproduce the failed login.
3. Expand the request and read its error entry. A request labelled `Ok` can still contain an application error; inspect the error text and HTTP response.

Alternatively, run this from the project folder with Wrangler authenticated (section 4.1), then reproduce the error in the browser:

```bash
npx wrangler tail --format pretty
```

Stop streaming with Ctrl+C. Never share passwords, access codes, cookies or API tokens from logs.

### Missing database migrations

`D1_ERROR: table sessions has no column named access_code_id` means the deployed code expects the access-code migration, but the live database has not received it. This breaks password sign-in too, because both sign-in methods create sessions. Similar missing-table or missing-column errors can occur for `access_codes` or `resources`.

From the project folder, inspect and apply all pending production migrations:

```bash
npx wrangler d1 migrations list ledger --remote
npx wrangler d1 migrations apply ledger --remote
```

The migrations add tables and columns; they do not reset existing ledger data or passwords. Local migrations (`--local`) do not update production. Retry login afterward and check the log if it still fails.

To prevent a recurrence, set the Cloudflare production deploy command to:

```bash
npx wrangler d1 migrations apply ledger --remote && npx wrangler deploy
```

---

## 1. Where things live

| What | Where | In git? |
| --- | --- | --- |
| Code | Your GitHub repo (this project) | Yes |
| Live data | Cloudflare D1 database `ledger` | No |
| Nightly backups | Cloudflare R2 bucket `ledger-backups` (binding `BACKUPS`) | No |
| Uploaded document files | Cloudflare R2 bucket `ledger-docs` (binding `DOCS`) | No |
| Local backups | `backups/` | No (git-ignored) |
| `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` | `.env` | No (git-ignored). Never commit it. |
| D1 `database_id` | `wrangler.toml` | Yes. It is an identifier, not a secret. |
| Schema changes | `migrations/*.sql` | Yes. Applied on every deploy. |

Pushing code never changes the data. Data changes only through a new migration file, or through the app.

---

## 2. Naming checklist

The app uses these names on Cloudflare. If you run other Workers or databases on the same account, make sure none of these names is already taken.

| Resource | Name used here |
| --- | --- |
| Worker name and address | `ledger`, https://ledger.`<your-worker>`.workers.dev |
| D1 database name | `ledger` |
| D1 `database_id` | in `wrangler.toml` (created by `wrangler d1 create ledger`) |
| R2 buckets | `ledger-backups` and `ledger-docs` |
| Cron trigger | `0 2 * * *` |
| Session cookie | `lsid` |
| Credentials file | `.env` |
| `ALLOWED_ORIGIN` | `https://ledger.<your-worker>.workers.dev` |
| Workers Builds root directory | `/` (the repository root) |
| Local address under Warden | https://app.ledgerly.test |

Two rules keep your data safe:

- **Always check the database name in any `wrangler d1 … --remote` command.** It must say `ledger`. Wrangler does not ask which database you mean.
- **Never put a real `database_id` or account id in a doc, a chat or a public repo.** Keep them in `wrangler.toml` (the id only) and `.env` (the token and account id).

---

## 3. Prerequisites: Cloudflare account and token

1. Create or use a Cloudflare account on the free plan.
2. Enable R2 on the account (**R2 Object Storage** in the dashboard). Cloudflare may ask for a payment method before R2 is enabled, even on the free plan.
3. Create an API token with these permissions on the account: **Workers Scripts**, Edit; **D1**, Edit; **Workers R2 Storage**, Edit. Use the **Edit Cloudflare Workers** template and add the D1 and R2 permissions.
4. Put the token and the account id in `.env` (template: `.env.dist`):

   ```bash
   CLOUDFLARE_API_TOKEN=...
   CLOUDFLARE_ACCOUNT_ID=...
   ```

   Check that the file has the two values without printing them:

   ```bash
   grep -c '^CLOUDFLARE_' .env
   ```

   Expect: `2`. Both `.env` files are git-ignored. Never commit them, and never paste the token into chat or a doc.

---

## 4. First-time setup (done once)

Run these from a Mac terminal, in the project folder. Section 3 must be done first.

### 4.1 Steps

1. Start Warden and check the local app:

   ```bash
   warden env up
   curl -sk https://app.ledgerly.test/api/health
   ```

   Expect: `ok` is `true`.

2. Load the token into this terminal. Repeat in every new terminal. Then check that Wrangler is logged in to your account:

   ```bash
   set -a; source <(grep -E '^CLOUDFLARE_' .env); set +a
   npx wrangler whoami
   ```

   Expect: your email and account. The values are loaded without being printed.

3. Check what exists, so you do not overwrite something that is already there:

   ```bash
   npx wrangler d1 list
   npx wrangler r2 bucket list
   ```

   If a `ledger` name already exists, stop and find out whose it is. Do not overwrite or delete it.

4. Create the D1 database and copy the `database_id` it prints:

   ```bash
   npx wrangler d1 create ledger
   ```

5. Open `wrangler.toml`. In the `[[d1_databases]]` block, replace the placeholder `00000000-0000-0000-0000-000000000000` with that id. Only this value changes. The `database_name` stays `ledger`. The id is not a secret, so it is safe to commit.

6. Create the two R2 buckets:

   ```bash
   npx wrangler r2 bucket create ledger-backups
   npx wrangler r2 bucket create ledger-docs
   ```

   Expect: both created, in `npx wrangler r2 bucket list`.

7. Set the allowed origin. In `wrangler.toml`, under `[vars]`, replace the placeholder `https://ledger.example.workers.dev` with your address:

   ```toml
   ALLOWED_ORIGIN = "https://ledger.<your-worker>.workers.dev"
   ```

   `ALLOWED_ORIGIN` must match the address you sign in on exactly: https, the same host, no trailing slash, no path. If it does not match, sign-in fails with **403 `Forbidden origin`**. Do not set it as a dashboard secret. Locally, `.dev.vars` overrides it with `https://app.ledgerly.test`, so Warden keeps working.

8. Deploy:

   ```bash
   warden deploy
   ```

   Expect: the live address printed.

9. Create the first administrator on the live database. Type `live` when asked. The password is typed hidden at the prompt (at least 6 characters), never as an argument:

   ```bash
   warden account-create -- --remote --email you@example.com --name "Your Name"
   ```

10. Check the live API:

    ```bash
    curl -s https://ledger.<your-worker>.workers.dev/api/health
    ```

    Expect: `ok` is `true`.

### 4.2 Start with an empty database

The live database starts empty. Create your ledgers, funds, categories and people in the app, the same way you do locally. Changes made only in the local app are not on the live database. Redo them on the live app if you need them there.

### 4.3 Verify

1. Open https://ledger.`<your-worker>`.workers.dev and sign in. Add a test entry, check the totals, then delete it.
2. Open **Settings**, then **Data downloads**, and check the downloads work.
3. Upload a test document, check that it opens, then delete it.
4. The next morning, check that R2 bucket `ledger-backups` holds `backups/<book>/<date>.json`. Or open the `ledger` Worker's **Logs** and look for the `nightly … backed up` line.

---

## 5. Automatic deploy (optional)

With this set up, Cloudflare builds and deploys each time you push to GitHub. It needs the `ledger` Worker to exist, so do it after the first deploy (section 4.1, step 8).

1. In the dashboard, go to **Workers & Pages**, then **ledger**, then **Settings**, then **Build**. Click **Connect GitHub** and grant access to **only** your repository.
2. Set these values:

| Setting | Value |
| --- | --- |
| Production branch | `master` |
| Root directory | `/` |
| Build command | `npm ci && npm run build` |
| Deploy command | `npx wrangler d1 migrations apply ledger --remote && npx wrangler deploy` |

Daily flow: work and test locally, commit and push, then watch the result in the `ledger` Worker's **Deployments** tab. Build minutes are limited on the free plan.

---

## 6. Rollback

Rollback is separate for code and data.

- **Code** (does not change data). From the project folder run `npx wrangler rollback`, or open the `ledger` Worker's **Deployments** tab, pick an earlier version and click **Rollback**.
- **Data, with D1 Time Travel.** Find the restore point, then restore to an ISO time such as `2026-11-08T09:30:00Z`:

  ```bash
  npx wrangler d1 time-travel info ledger
  npx wrangler d1 time-travel restore ledger --timestamp <ISO-time>
  ```

  Check that both commands name `ledger`. A restore sets the whole database back to that moment, so anything entered later is lost.
- **Data, from a backup file.** Use the nightly R2 backup in `ledger-backups` or an export in `backups/`. Restore as described in `docs/OPERATIONS.md` section 6. Restoring a whole export is a last resort.

---

## 7. Changing the address (workers.dev or custom domain)

Both changes end the same way: `ALLOWED_ORIGIN` must match the address you sign in on, exactly. Always change `wrangler.toml`, then deploy. Dashboard variable changes are overwritten by the next deploy.

| Where | What it holds |
| --- | --- |
| `wrangler.toml` | The config you edit for live: `name`, `database_id`, `[vars]` (`ALLOWED_ORIGIN`, `APP_TIMEZONE`), `[triggers]`, optional `routes` and `workers_dev`. |
| `.dev.vars` (git-ignored) | Local overrides, such as `ALLOWED_ORIGIN=https://app.ledgerly.test` for Warden. Never change it for live. |
| `.env` (git-ignored) | The two `CLOUDFLARE_` values. |

`ALLOWED_ORIGIN` takes exactly one origin, `https://host`, with no trailing slash and no path. A comma-separated list does not work.

### Runbook A: Change the workers.dev address

The address format is `<worker-name>.<account-subdomain>.workers.dev`. The subdomain belongs to the account, so changing it moves every Worker on that account.

1. In the dashboard, go to **Workers & Pages**, then **Account details**, then **Subdomain**, then **Change**. Wait a few minutes for the new name to work.
2. Edit `wrangler.toml`: `ALLOWED_ORIGIN = "https://ledger.<new>.workers.dev"`.
3. Run `warden deploy`, open the new address and sign in. If you see **Forbidden origin**, check the spelling, https and the trailing slash, fix step 2, then deploy again.
4. Tell users the new link. The old address stops working.

### Runbook B: Add a custom domain

The example is `ledger.example.com`. Replace it with your domain.

1. Register the domain at any registrar. Keep it there if Cloudflare Registrar does not support the top-level domain.
2. In the Cloudflare dashboard, click **Add a domain**, enter the domain, and choose the **Free** plan. Cloudflare gives you two nameservers.
3. At the registrar, replace the nameservers with Cloudflare's two. Wait until the domain shows **Active**. This takes minutes to a day.
4. Open **Workers & Pages**, then **ledger**, then **Settings**, then **Domains & Routes**. Click **Add**, then **Custom domain**, and enter `ledger.example.com`. Expect status **Active**.
5. Edit `wrangler.toml`: `ALLOWED_ORIGIN = "https://ledger.example.com"`. Only one origin is allowed, so after this deploys the `workers.dev` address can no longer sign in. That is expected.
6. Optional: add `routes = [{ pattern = "ledger.example.com", custom_domain = true }]` to `wrangler.toml`, so the deploy does step 4 for you. Set `workers_dev = false` only after the custom domain works.
7. Run `warden deploy`, then check `curl -s https://ledger.example.com/api/health` and sign in there.
8. Update the address in this file and in any links you have shared.

If the domain stays **Pending**, the nameservers have not changed at the registrar yet.

---

## 8. Free plan limits

These limits are approximate and can change. Check Cloudflare's pricing pages before you rely on them.

| Resource | Approximate free allowance | For the app |
| --- | --- | --- |
| Workers | About 100,000 requests a day, and a short CPU time per request | A normal day is far below the limit. |
| D1 | About 10 databases, 500 MB each, 5 GB in total, with daily row read and write limits | One database, plenty of room. |
| R2 | About 10 GB storage a month, plus monthly operation allowances | Two buckets. Backups and documents are small. |
| Cron triggers | About 5 per account | The app uses 1. |

R2 may ask for a payment method before it is enabled.

Watch the nightly backup and the JSON export: both read the whole book. With about 1,000 entries this is far under the limits.

---

## 9. Troubleshooting

| Problem | What to check |
| --- | --- |
| **403** `Forbidden origin` on sign-in | `ALLOWED_ORIGIN` in `wrangler.toml` does not match the address you use exactly. Fix it, then `warden deploy`. |
| `database not found`, or a D1 error naming the database | `database_id` is wrong or still the placeholder. Compare it with the id from `npx wrangler d1 create ledger`. |
| `bucket not found` | A bucket is missing. Create `ledger-backups` or `ledger-docs`, then deploy again. |
| Migration error during deploy | Run `npx wrangler d1 migrations list ledger --remote`. Fix the failing SQL file, then deploy again. |
| Blank page at the live address | The build is missing. Run `warden deploy` again. |
| **401** loop after sign-in | The cookie is `lsid`. Use https, and open the same host as `ALLOWED_ORIGIN`. |
| `warden deploy` says the app is not running | Run `warden env up`, then deploy. |
| Workers Builds fails | Open the build's log in **Deployments**. Run `npm ci && npm run build` on your Mac to see the same error. |
| Nightly backup is missing | Open the `ledger` Worker's **Logs** or **Cron events**. The cron runs at 02:00 UTC. See `docs/OPERATIONS.md` section 7. |
| A `--remote` command asks for `live` | The safety check on the live database. Type `live` only if you mean to change live data. |

---

## 10. Where to read next

- `docs/OPERATIONS.md`: running the app, backups and their troubleshooting table.
- `docs/USER_GUIDE.md`: using the app.
- `docs/TROUBLESHOOTING.md`: checking logs and database problems.
