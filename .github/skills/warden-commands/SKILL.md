---
name: warden-commands
description: Which Warden command to use for running, database, accounts, backups, demo data and deploy in this app. Use before any bare npm run, npx wrangler or node scripts command, and when asked what commands exist.
---

Always reach for a `warden` command first; they run inside the app container, where `wrangler` is installed. Run them from the app folder with the app running (`warden env up`). To list or learn one: `warden help`, `warden <command> --help`, or read `.warden/commands/*.help`.

| Goal | Command |
| --- | --- |
| Start / stop / restart / logs | `warden env up`, `warden env down`, `warden env restart app` (applies new migrations), `warden env logs --tail 80 app` |
| Shell or any command in the container | `warden app` or `warden app <command>` (e.g. `warden app node demo/create-demo-accounts.js`) |
| Run SQL on local D1 | `warden d1 "SELECT ..."` |
| Run SQL on live D1 | `warden d1 -- --remote "SELECT ..."` (non-reads ask you to type `live`) |
| Back up local D1 / live D1 to `backups/` | `warden d1-backup <label>` / `warden d1-backup -- --remote <label>` |
| Replace local with live | `warden d1-pull` |
| Replace local from a file (full export or data-only seed; migrations applied first for data-only) | `warden d1-restore <path-in-project>.sql` (asks for `restore`, backs up first) |
| Create a super admin | `warden account-create --email ... --name "..."` (`-- --remote` for live) |
| Reset a password | `warden account-reset-password --email ...` |
| Deploy | `warden deploy` (explicit user request only) |

Rules
- Warden 0.16 rejects a bare `--remote`: write `warden <cmd> -- --remote ...`. Remote and destructive commands need the user's explicit request and a typed confirmation.
- Passwords are typed hidden at the prompt, never passed as arguments.
- Demo data: `warden d1-restore demo/demo-seed.sql`, then `warden app node demo/create-demo-accounts.js` (it needs fixed account ids that `account-create` cannot set; for any other account use `account-create`). Details: `demo/README.md` where it exists.
- If no command above fits, use `warden app <command>` and tell the user which one you used. Plain `npm run` / `npx wrangler` on the host is a last resort (`wrangler` may not be installed there).
