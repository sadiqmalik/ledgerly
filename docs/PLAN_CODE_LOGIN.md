# Plan: link access codes to admin accounts, and usernames

Status: plan only, nothing built. This version keeps access codes as they are (several codes, their own screen) and
links each one to an admin account. It replaces an earlier idea of turning codes into accounts.

## Goal

1. Every access code belongs to one **admin account** (its owner). The code is always **view only**.
2. A code **inherits its owner's pages per ledger**. A per-ledger switch "Own pages" lets one code show a different
   list in that ledger, exactly like codes work today. The code's list can never be wider than the owner's.
3. Sign in with a **username or an email**. Email becomes optional (kept for a later "forgot password").

## Rules that must hold (security)

- A code session is capped on the server when it is read: role `viewer` everywhere, no Settings page, no writes,
  notebooks read-only and only those linked to a ledger, no password change (this is how codes already behave).
- Ceiling: for each ledger the code may open, pages = (the code's own list if "Own pages" is on, else the owner's list
  for that ledger) intersected with the owner's list for that ledger. So changing the owner's rights narrows or widens
  the inheriting codes, but an own list can never exceed the owner.
- A code can only name ledgers its owner is a member of (a super admin owner may name any ledger) and, for loans,
  only registers its owner may use.
- The code stops working at once when its owner is disabled, loses the ledger, or is deleted (delete the owner's codes
  with the owner, or refuse the delete while codes exist: decide in phase 2).
- Unchanged: the code is stored as a hash only and shown once, unique, case-sensitive, 8-64 characters, per-IP
  failure limit, revoke and reset end sessions.

## Data model

Phase 1 (`accounts`): add `username` (unique, lower case, 3-40 chars of a-z 0-9 . _ -, never contains `@`);
`email` becomes nullable (unique when present). SQLite cannot drop NOT NULL in place: rebuild the table (new table,
copy, drop, rename) and re-create anything that points at it. Backfill `username` from the email's local part (clash gets
`2`, `3`...). Take a backup first (`warden d1-backup`, skill `safe-money-operations`).

Phase 2 (`access_codes`): add `account_id` (the owner). Existing codes have no owner: keep them working as they are
("Unlinked" badge, view-only, their own lists) until someone links them in the screen; new codes require an owner.
No data moves, no session-table change. `book_resources` keeps meaning "own pages for this ledger": an entry present =
the "Own pages" switch is on, absent = inherits.

## Server

- `server/auth/accounts.js`: `findByLogin(login)` (contains `@` means email, else username); `authenticate(login, password)`;
  validate username and optional email.
- `server/auth/accessCodes.js`: `principalFor(code, loanIds, owner)` builds each ledger entry with
  `resources = intersect(ownResources ?? ownerPagesIn(book), ownerPagesIn(book))` using the existing `forBook`; drops ledgers
  the owner no longer has; returns nothing (code refused) when the owner is missing or disabled. Keep principal id `code:<id>`
  and add `ownerAccountId` for audit and display.
- Create and edit validate the owner and the chosen ledgers and loans against the owner's access.
- `worker/routes/auth.js`: login accepts `login` (still accept `email` for a release). Audit log events fall back to username.

## Client

- Login screen: one field "Username or email", password, existing "Sign in with code" link.
- Admin > Admins: Add form gets Username (required) and Email (optional); cards show both.
- Admin > Access codes: pick the **owner** (admin) first; the ledger cards list only that owner's ledgers; each card keeps
  the big Access switch, and under it a small "Own pages" switch: off shows the owner's pages greyed as the inherited list,
  on lets you switch pages for this code (only pages the owner has are offered). The code card shows "Owner: <name>".
- On the owner's Admins card, list the codes linked to them with a link to the Access codes screen.

## Phases (each can ship on its own, with tests)

1. **Usernames**: migration and backfill, login by username or email, Admins form and cards, tests, docs.
2. **Link codes to owners**: `account_id`, ceiling and inheritance in `principalFor`, validation, Access codes screen
   (owner picker, "Own pages" switch, Unlinked badge), tests, docs.
3. Optional clean-up: require an owner on every code once all old ones are linked; remove the "Unlinked" case.

## Tests

- New: username and email login, clash handling, email optional and unique; a code inherits the owner's per-ledger pages;
  an own list is capped by the owner; owner loses a ledger or page and the code follows; disabled or deleted owner blocks
  the code; a code cannot name a ledger or loan the owner lacks; unlinked old codes still work.
- Change: `test/auth/access-codes.test.js`, `test/api/loan-access-codes.test.js` (owner needed on create).

## Open questions

- Can a normal admin manage their own codes, or only super admins as today?
- What happens to a code when its owner is deleted: delete it too, or block the delete while codes exist?
- Keep the `/api/auth/access-code` path name, or rename to `/api/auth/code`?

## Suggested way to run it

Commit the current work first (this plan builds on `forBook` and per-ledger pages). One session per phase.
