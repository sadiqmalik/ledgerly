# Getting started

This page takes you from a fresh clone to a running ledger, lists every setting and command, and explains how to use AI assistants and optional modules with this repository. It is the best first page to read. The other pages are listed in the [docs index](#9-docs-index).

## 1. Prerequisites

- **Node 22** and npm. Under Warden the app container already has Node 22 (`NODE_VERSION=22` in `.env.dist`).
- **Docker and [Warden](https://docs.warden.dev/)** (optional). Warden runs the app in a container behind HTTPS at `https://app.ledgerly.test` and gives you the `warden ...` commands below. Without Warden you run the same app with plain npm on `http://localhost:3100`.
- A **Cloudflare account** only if you deploy (section 5). Local use needs none.

## 2. Quick start

### With Warden

1. Copy the templates once: `cp .env.dist .env` and `cp .dev.vars.example .dev.vars`.
2. Create the local HTTPS certificate once: `warden sign-certificate ledgerly.test`.
3. Start the app: `warden env up`. The first start installs the dependencies and applies the database migrations.
4. Open `https://app.ledgerly.test`.
5. Follow "First run" below.

Useful afterwards: `warden env logs --tail 80 app` (log), `warden env restart app` (restart, applies new migrations), `warden env down` (stop).

### Without Warden

```bash
npm install
npm run dev
```

This starts Vite on `http://localhost:3100` and the Worker on port 8788. The Worker applies the migrations to the local database first. Open `http://localhost:3100`. Over plain http the Worker accepts that origin by itself, so no `.dev.vars` is needed. `npm run stop` frees both ports.

## 3. First run

A new install has **no sample data** and no accounts.

1. Create the first super administrator. The password is typed hidden at the prompt (at least 6 characters) and is never a command argument.
   - Warden: `warden account-create --email you@example.com --name "Your Name"`
   - Without Warden: `npm run account:create -- --email you@example.com --name "Your Name"`
2. Open the app and sign in with that email and password.
3. Press **New ledger** in the sidebar. Give it a name and a base currency. The new ledger gets the default categories, a General fund and a Cash account.
4. Add your own funds, accounts and members in Settings. The [user guide](USER_GUIDE.md) walks through the rest.

## 4. Configuration

| Where | Key | Meaning |
| --- | --- | --- |
| `.env` (from `.env.dist`) | `WARDEN_ENV_NAME`, `WARDEN_ENV_TYPE`, `WARDEN_WEB_ROOT` | Warden environment name, type (`local`) and web root. |
| `.env` | `TRAEFIK_DOMAIN`, `TRAEFIK_SUBDOMAIN` | The local address: `app` + `ledgerly.test` gives `https://app.ledgerly.test`. |
| `.env` | `WARDEN_DB`, `WARDEN_REDIS`, `WARDEN_RABBITMQ`, `WARDEN_VARNISH`, `WARDEN_OPENSEARCH`, `WARDEN_ELASTICSEARCH`, `WARDEN_ELASTICHQ` | Warden services. All `0`: the app needs none of them (the database is D1). |
| `.env` | `NODE_VERSION` | Node version in the app container (22). |
| `.env` | `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` | Commented out by default. Needed only for `--remote` commands, `warden d1-pull` and `warden deploy`. Never commit them. |
| `.dev.vars` (from `.dev.vars.example`) | `ALLOWED_ORIGIN` | The browser origin the local Worker accepts, `https://app.ledgerly.test` under Warden. Plain-http `http://localhost:3100` is accepted automatically. |
| `wrangler.toml` `[vars]` | `ALLOWED_ORIGIN` | The live address (the origin allowed to call the API). `.dev.vars` overrides it locally. |
| `wrangler.toml` `[vars]` | `APP_TIMEZONE` | Time zone used for the app's dates. |
| `wrangler.toml` `[vars]` | `BACKUP_EVERY_DAYS` | A nightly backup is written only when a ledger's newest backup is at least this many days old (10 by default). |
| `wrangler.toml` `[vars]` | `DEFAULT_CURRENCY` | A 3-letter currency code (default `USD`). Used for new ledgers, funds, accounts and loan registers. Existing data keeps its own currency. Read in `server/domain/locale.js`; locally it can also be set in `.dev.vars`. |

`.env` and `.dev.vars` are git-ignored. Do not put real tokens in tracked files.

## 5. Cloudflare

To run the app live you need a Cloudflare account, a D1 database (its `database_id` goes into `wrangler.toml`), two R2 buckets (backups and document files), an API token in `.env`, and then `warden deploy` (or `npx wrangler deploy` after a build). The one-time setup, the routine deploy, automatic deploys and rollback are in [DEPLOYMENT.md](DEPLOYMENT.md). Deploying uses your own account and never overwrites data: data changes only through migrations and the app.

## 6. Command reference

### Warden commands (`.warden/commands/`)

Run these from the repository folder. Warden 0.16 rejects a bare `--remote`, so put `--` before it, for example `warden d1 -- --remote "SELECT COUNT(*) AS n FROM users"`. Commands that change the live database ask you to type `live` first.

| Command | What it does | Use it when |
| --- | --- | --- |
| `warden account-create --email <email> --name "<name>"` | Creates a super administrator in the local D1. `-- --remote` creates it in the live D1 (needs the Cloudflare keys and asks for `live`). Password typed hidden, at least 6 characters. | First run, or adding another super administrator. |
| `warden account-reset-password --email <email>` | Sets a new password in the local D1 (`-- --remote` for live). Clears the lockout and signs the account out everywhere. | Someone forgot their password or is locked out. |
| `warden app [COMMAND]` | Opens a bash shell in the app container, or runs a command there, for example `warden app npm ci`. | You want npm or wrangler inside the container. |
| `warden d1 [sql]` | Runs SQL on the local D1. With no SQL it lists the tables. `-- --remote` targets live; anything other than SELECT, PRAGMA, EXPLAIN or WITH asks for `live`. | Looking at or fixing data. |
| `warden d1-backup [label]` | Exports the local D1 to `backups/d1-ledger-<timestamp>-<label>.sql` with a `.sha256` beside it. `-- --remote [label]` exports the live D1 (read only). | Before a risky change, a migration or a deploy. |
| `warden d1-pull [label]` | Copies the live D1 into the local one: backs up local, exports live, replaces local, restarts the app. Document files in R2 are not copied. | You want real data to test with locally. |
| `warden d1-restore <file>` | Replaces the local D1 with a `.sql` file (from `d1-backup` or `d1-pull`). Saves the current local database first. Nothing on Cloudflare changes. | Going back to an earlier local state. |
| `warden deploy` | Builds the frontend, applies migrations to the live D1, then deploys the Worker. The app must be running. | Releasing a new version. |

Warden's own commands are also useful: `warden sign-certificate ledgerly.test`, `warden env up`, `warden env down`, `warden env restart app`, `warden env logs --tail 80 app`.

### npm scripts (`package.json`)

| Script | What it does | Use it when |
| --- | --- | --- |
| `npm start` | Same as `npm run dev`. | Starting without Warden. |
| `npm run dev` | Runs `client` and `worker` together. | Normal local development. |
| `npm run client` | Vite dev server only (port 3100). | Working on the UI against a Worker started elsewhere. |
| `npm run worker` | Creates `dist`, applies the local migrations (`db:migrate:local`) and runs `wrangler dev` on port 8788 with the scheduled-trigger test enabled. | Working on the API, or testing the nightly job. |
| `npm run stop` | Kills whatever listens on ports 3100 and 8788. | A port is stuck. |
| `npm run build` | `vite build`, the production frontend into `dist/`. | Checking a build. |
| `npm run preview` | `vite preview`, serves the built frontend. | Looking at the production build. |
| `npm test` | Applies the migrations to a separate test database (`.wrangler/state-test`), then runs all tests with `node --test`. Your local data is not touched. | Before finishing any change. |
| `npm run db:migrate:local` | Applies pending migrations to the local D1. | After adding or pulling a migration. |
| `npm run account:create -- --email <email> --name "<name>"` | The script behind `warden account-create` (add `--remote` for live). | First run without Warden. |
| `npm run account:reset-password -- --email <email>` | The script behind `warden account-reset-password` (add `--remote` for live). | Password reset without Warden. |

## 7. Using AI assistants with this repo

The repository is set up for AI coding assistants, with small entry files that load only the context a task needs.

- **`CLAUDE.md`** is the router for Claude Code: read the README first, then only the files the task needs. It also holds the safety defaults: never read `.env*` values, skip `node_modules`, backups and `.wrangler/state*`, and never deploy, run remote-destructive commands or commit unless asked.
- **`.github/copilot-instructions.md`** is the same router for GitHub Copilot.
- **Skills** in `.github/skills/<name>/SKILL.md`, each loaded when its description matches the task:
  - `ledger-dev`: implement a bounded change with strict money and domain safety and targeted validation.
  - `ledger-ui`: add or restyle a screen, nav item or component following the UI conventions (app shell, permissions, money display, mobile).
  - `ledger-docs`: answer "how do I..." questions about running, deploying, backing up, restoring or using the app from the docs only.
  - `d1-sync`: back up, pull, restore or push the D1 database between live and local.
  - `safe-money-operations`: migrations, backups, restores and role-sensitive changes with non-destructive defaults.
  - `validate-workspace-changes`: pick and run the smallest useful checks for what changed.
  - `docs-sync`: update the docs after changing a feature, command, migration, schedule or screen.

## 8. Extending: optional modules

Features that not every install needs plug in through two small registries. Both ship **empty** in the public build (a private build can register modules in them).

- **`server/optionalModules.js`** exports `{ repos, routes }`. A module is a repo factory `db => repo` (added to the repository by `createRepo` under its key in `repos`) and/or a route registrar `(app, { repo, env }) => ...` (listed in `routes` and called by `createApi`).
- **`src/optionalModules.js`** exports what the UI needs from a module:
  - `settingsTabs`: extra Settings tabs, each `{ key, label, group, Component, editableBy }`.
  - `ProfitDialog`: a component for a "Profit entry" button on the Ledger page (`null` means no button).
  - `profitCommentLabel`: the short title shown for profit entries in lists (default `Profit`).

To add a module, write its repo factory and routes in `server/repo/` and `worker/routes/`, add a migration for any tables, register them in the two files, and add tests under `test/`. Without a registration nothing changes for users.

## 9. Docs index

- [README](../README.md): overview, project layout and the Data API.
- [User guide](USER_GUIDE.md): using the app.
- [App map](APP_MAP.md): the app in pictures.
- [Architecture](ARCHITECTURE.md): components, data model, domain rules, security, known limits.
- [Operations](OPERATIONS.md): running, backups, restore and tests in detail.
- [Deployment](DEPLOYMENT.md): Cloudflare setup, deploy, rollback.
- [Troubleshooting](TROUBLESHOOTING.md): health check, logs, database and migration checks.
- [Future improvements](FUTURE_IMPROVEMENTS.md): the backlog.
- Designs: [loans](LOANS_DESIGN.md), [currencies](CURRENCIES_DESIGN.md), [document links](DOCUMENT_LINKS_DESIGN.md), [item tracker](ITEM_TRACKER.md).
