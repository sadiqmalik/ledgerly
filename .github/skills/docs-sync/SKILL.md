---
name: docs-sync
description: Keep the docs in step with code. Use after changing a feature, command, migration, schedule or screen, and before finishing a change that users or operators will notice.
---

Docs drift is the main gap in this workspace: features land (access codes, item tracker, page permissions, quantity and unit price, project kinds, every-10-days backups) and only a README line follows. After a change, update the docs that describe it, in the same change.

## Where things are documented (docs/)

| Changed | Update |
| --- | --- |
| Screen, button, role or rule people see | `USER_GUIDE.md` (steps) and `APP_MAP.md` (diagram or cheat-sheet row) |
| Table, route, domain rule, cron, auth | `ARCHITECTURE.md` (and the Mermaid diagram if the flow changed) |
| Warden or npm command, backup, restore, import, test count | `OPERATIONS.md` and the command list in `README.md` |
| Log message, health check, migration process or a new failure mode | `TROUBLESHOOTING.md` (and `OPERATIONS.md` section 12) |
| Cloudflare setup, address, schedule var, secret, deploy step | `DEPLOYMENT.md` |
| Item tracker | `ITEM_TRACKER.md` |
| New migration | the migration list in `README.md` and the data model in `ARCHITECTURE.md` |
| Loan registers or access rules | `USER_GUIDE.md`, `APP_MAP.md`, `ARCHITECTURE.md`, `LOANS_DESIGN.md` |
| Currency list or alias display | `USER_GUIDE.md`, `APP_MAP.md`, `ARCHITECTURE.md`, `CURRENCIES_DESIGN.md` |


## Method

1. `git diff --stat` to list what changed; grep the docs for each renamed thing (`grep -rn -i "<keyword>" docs README.md`).
2. Fix every stale statement (numbers, schedules, command names, paths), not just add a new paragraph.
3. Keep the voice: short steps, exact commands in code blocks, plain words for non-technical readers in USER_GUIDE and APP_MAP.
4. Never put tokens, account ids or real personal data in docs.
5. Update the skills (`.github/skills/*`) only when their quick answers or rules are wrong now.
