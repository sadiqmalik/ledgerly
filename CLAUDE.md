# Claude router (Ledgerly)

Use this file when opening the repository root with Claude Code.

## Start here

1. Read `./README.md`
2. Then read only files required for the task
3. Use `./docs/OPERATIONS.md` only for run/ops command details

## Shared skills

- Skill files: `./.github/skills/*/SKILL.md` (start with `./.github/skills/README.md`)

## Safety defaults

- Do not read secret values from `.env*`.
- Skip `node_modules`, backups, and `.wrangler/state*`.
- Do not deploy, run remote-destructive commands, or commit unless explicitly requested.
- Deploying uses the user's own Cloudflare account and token. Never add real credentials, account ids or tokens to tracked files.

## Run commands: always use Warden

- For anything that runs, migrates, seeds, backs up or deploys, use the `warden` commands in `./.warden/commands/` (`warden env up`, `warden d1`, `warden d1-backup`, `warden d1-pull`, `warden d1-restore`, `warden account-create`, `warden account-reset-password`, `warden deploy`, `warden env logs`/`restart`/`down`) before any bare `npm run`, `npx wrangler` or `node scripts/...`. They run inside the app container, where `wrangler` is installed.
- Read the skill `warden-commands` (`.github/skills/warden-commands/SKILL.md`) for the full list. If no Warden command covers a task, run it with `warden app <command>` and say which you used.
- Anything that writes to the live database or deploys still needs the user's explicit request.
