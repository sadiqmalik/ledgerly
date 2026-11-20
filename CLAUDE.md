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
