# Copilot instructions — Ledgerly

Use this file when opening the repository.

## Minimal load order

1. `./README.md`
2. Read only the task-specific files needed
3. Open `./docs/OPERATIONS.md` only when command/run details are required

## Shared skills

- Skill files: `./.github/skills/*/SKILL.md` (catalog: `./.github/skills/README.md`)

## Safety defaults

- Do not read secret values from `.env*`.
- Skip `node_modules`, backups, and `.wrangler/state*`.
- Do not deploy, mutate remote data, or commit unless explicitly requested.
- Deploying uses the user's own Cloudflare account and token. Never add real credentials, account ids or tokens to tracked files.
