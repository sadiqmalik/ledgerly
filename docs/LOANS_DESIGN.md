# Loan registers and per-resource access: design

Status: design for implementation (2026-11-19). Where this differs from the code once built, the code is right.

## 1. What is being added

1. **Loan registers.** Many registers, like ledgers. Each has a name, a borrower (who took the loan), a lender (who gave it) and an optional description. Each register holds dated entries of two kinds: **taken** (balance goes up) and **returned** (balance goes down). The top of a register shows Total taken, Total returned and Remaining balance. The screens call this **Loans** (a loan = one register).
2. **Access per resource.** Three kinds of resource, each granted per user:
   - a **ledger** (existing: `accounts.memberships`, roles viewer/editor/admin);
   - a **loan register** (new: `accounts.loan_memberships`, same roles);
   - a **page** (existing: `accounts.resources` allowlist, plus the new page key `loans`).
   A super administrator has everything. The Admin page itself stays super-admin-only on purpose, so account management cannot be delegated by accident.

The Dashboard is unchanged.

## 2. Decisions

| Decision | Choice | Why |
| --- | --- | --- |
| Where loan access lives | New JSON column `accounts.loan_memberships` = `[{"registerId","role"}]` | Same pattern as `memberships`, so the account store, admin service and UI copy cleanly. A generic grants table is cleaner long term but forces a risky migration of live memberships now. |
| Who may create a register | Any account that has the `loans` page. The creator automatically gets `admin` on it. | "Users can create registers". It grants nothing on anyone else's register. A super admin can remove the `loans` page from a user. |
| Who may delete a register | Register admin, only when it has no entries (409 otherwise). Deleting strips it from every `loan_memberships`. | Mirrors ledger deletion. Entries are soft-deleted individually. |
| Who may grant register access | Super administrators only (Admin page). Register admins cannot grant. | No privilege delegation. |
| Money | Integer minor units. One currency per register (default `PKR`, 3-letter code, shown with every amount). | Same as ledger. |
| Balance | `taken - returned`. May go negative (overpaid): the UI says so instead of hiding it. | No silent clamping. |
| Existing accounts | `resources` NULL already means all pages, so they get `loans` too but see no register until granted. Accounts with an explicit page list do not get it. | Default deny for explicit lists. |
| Access codes | A loan is shared with chosen codes, per loan, view-only (section 7c). | Codes stay viewer-only and can never create or change a loan. |
| "Database level" enforcement | D1 has no row-level security, so every loan query takes the register id and the repo never exposes an unscoped read or write; the list query filters by allowed ids. Tests prove isolation. | The honest equivalent. |
| Backups | The scheduled R2 backup also writes each register (`loans/<registerId>/<YYYY-MM-DD>.json`, same every-`BACKUP_EVERY_DAYS` rule and keep-30). | Loan data must not be missing from backups. |

## 3. Schema: `migrations/0013_loan_registers.sql`

```sql
CREATE TABLE IF NOT EXISTS loan_registers (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  borrower    TEXT NOT NULL,
  lender      TEXT NOT NULL,
  description TEXT,
  currency    TEXT NOT NULL DEFAULT 'PKR',
  created_by  TEXT NOT NULL,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS loan_entries (
  id          TEXT PRIMARY KEY,
  register_id TEXT NOT NULL,
  kind        TEXT NOT NULL CHECK (kind IN ('taken','returned')),
  amount      INTEGER NOT NULL CHECK (amount > 0 AND amount <= 10000000000000),
  date        TEXT NOT NULL,
  receiver    TEXT,
  comment     TEXT,
  created_by  TEXT NOT NULL,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL,
  deleted_at  TEXT
);
CREATE INDEX IF NOT EXISTS idx_loan_entries_register ON loan_entries (register_id, date);

ALTER TABLE accounts ADD COLUMN loan_memberships TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(loan_memberships));
```

IDs are `crypto.randomUUID()`. `receiver` is free text (who received the money: for a taken entry, the person who got it; for a returned entry, who received the repayment). Limits: name, borrower, lender, receiver up to 120 characters; description and comment up to 500.

## 4. Authorization rules

Pages (resource key `loans`, added to `RESOURCES` in `server/auth/resources.js` and mirrored in `src/auth/resources.mjs`; `test/auth/resources.test.js` keeps them equal). Label "Loans". Routes `/loans` and `/loans/<id>` need the `loans` page.

Register roles: `loanRoleFor(account, registerId)` in `server/auth/roles.js` (super admin = admin; else from `loan_memberships`; else null). Same ranks as books.

Every `/api/loans...` request must pass, in order:

1. signed in (existing middleware);
2. `hasResource(account, 'loans')` else 403 "This account cannot use that page";
3. for `/api/loans/:r/...`: role on that register at least viewer, else 403 (also when the register does not exist and the account is not super admin, so existence is not revealed; super admin gets 404);
4. the action's own minimum: entries write = editor; register edit/delete = admin.

An entry id is only valid under its own register: a mismatch returns 404. The register list returns only registers the account may see.

Account API (`/api/auth/me` and the admin account list) exposes `loanMemberships: [{registerId, role}]`.

## 5. API contract (JSON; amounts in minor units)

```
GET    /api/loans
  -> [{ id, name, borrower, lender, description, currency, createdAt, role,
        totals: { taken, returned, balance, count } }]            (visible registers only)
POST   /api/loans            body { name, borrower, lender, description?, currency? }
  -> 201 same shape (role 'admin'); creator gets admin in loan_memberships
GET    /api/loans/:r         -> same shape for one register          (viewer)
PUT    /api/loans/:r         body { name?, borrower?, lender?, description? }   (admin)
         currency cannot change once the register has entries (409)
DELETE /api/loans/:r         -> { success: true }                     (admin; 409 if it has entries)
GET    /api/loans/:r/entries?kind=taken|returned&from=&to=&q=
  -> { register: {...as GET one...}, rows: [{ id, kind, amount, date, receiver, comment, createdAt, updatedAt }],
       totals: { taken, returned, balance, count } }   rows by date desc then createdAt desc; totals cover the matching rows;
       register.totals covers all rows
POST   /api/loans/:r/entries body { kind, amount, date, receiver?, comment? } -> 201 row   (editor)
PUT    /api/loans/:r/entries/:id   partial body                       -> row            (editor)
DELETE /api/loans/:r/entries/:id                                      -> { success: true } (editor; soft delete)

PUT    /api/admin/accounts/:id/loan-memberships  body { loanMemberships: [{ registerId, role }] }  (super admin)
POST   /api/admin/accounts   also accepts optional loanMemberships
```

Errors use the existing shape `{ success:false, error, details? }`. Validation: `kind` must be taken or returned; `amount` an integer from 1 to 10000000000000; `date` a real `YYYY-MM-DD` date; unknown register ids or roles in `loanMemberships` are rejected (400/404 like `memberships`).

## 6. UI contract

- **Navigation (sidebar, `src/layout/AppShell.js`)**: keep the ledger switcher (a boxed list at the top, no group label) and the Dashboard item below it. Add **Loans** as an item in the **Money** group (`/loans`), with the same row arrow as Projects that opens the loans the account may open (click opens `#/loans/<id>`, highlighted when active); new loans are made on the Loans page, as new projects are made on the Projects page. Hidden entirely without the `loans` page. In the icon-only sidebar the Loans item is a plain icon. (Changed 2026-11-20: it used to be its own group under Ledgers.)
- **`/loans`**: full-width grid of register cards (name, `Lender → Borrower`, three numbers: Total taken, Total returned, Remaining; currency code on amounts). **New loan** dialog (name, borrower, lender, description, currency). Empty state text.
- **`/loans/<id>`**: header with name, `Lender → Borrower`, description, role badge; three stat cards **Total taken / Total returned / Remaining balance** (negative balance labelled "Overpaid by ..."); filter row (type, search, dates); entry list (date, a Taken or Returned badge, receiver, comment, amount) as cards on phones; **Add entry** dialog with a two-button type switch (Loan taken / Loan returned), date (default today), amount, receiver (default: the register's lender), comment; click an entry to edit or delete (in-app `ConfirmDialog`, never the browser popup). Loan admins also get Edit loan and Delete loan (disabled with a hint while entries exist). Viewers see everything read-only.
- **Admin page (`src/components/admin/AdminScreen.js`)**: each user card gains **Loan access** (one role select per register: No access / Viewer / Editor / Admin, same look as ledger access) and the add-user form gets the same optional list. The **Pages** picker shows the new Loans page automatically.
- Follow `ledger-ui`: tokens only, full width, mobile first, `Amount` with currency code, `Modal`/`ConfirmDialog`, shared classes in `src/components/settings/ui.js`. Reference screens: `src/components/items/` (a per-book list page) and the Admin and Settings cards.

## 7. Tests required

- `test/api/loans.test.js`: register and entry CRUD, totals (including negative balance and filters), validation errors, soft delete excluded from totals, currency lock once entries exist, delete blocked while entries exist and strips memberships when allowed, creator becomes admin.
- Authorization matrix in the same file: no session; account without the `loans` page; member of another register only; viewer, editor, admin; super admin; entry id from another register; every endpoint above checked for each case. `/api/books/*` behaviour must be unchanged.
- `test/auth/`: `loans` in `RESOURCES` on both sides, `loanMemberships` in the account view, `PUT /api/admin/accounts/:id/loan-memberships` (super admin only, validation), `POST /api/admin/accounts` with `loanMemberships`.
- Backup: the scheduled job writes registers and respects the interval.
- Full `npm test` stays green (currently about 219 tests) and `npm run build` is clean.

## 7a. Settled loans (added 2026-11-19, migration 0016)

- `loan_registers.settled_at` (NULL = active). The API returns `settled` (boolean) and `settledAt` on every register.
- `PUT /api/loans/:r` accepts `settled: true | false` (register admin). Settling needs a zero balance (409 otherwise). Reopening clears it.
- While settled, entry create, edit and delete return 409 "This loan is settled. Reopen it to change its entries."; reads still work. Edit loan (name, description) still works.
- UI: **Mark as settled** and **Reopen loan** on the loan page, a Settled badge, **Show settled loans** switch on `/loans` (off by default), and settled loans are left out of the sidebar list unless open.

## 7b. Per-lender totals (added 2026-11-19, migration 0017)

- A loan's lender field may hold several names joined with " & ". `loan_entries.lender` (nullable) says which one an entry is for: who gave the money (taken) or who is repaid (returned).
- Entry create and update accept `lender` (one of the register's lender names, matched ignoring case, stored with the register's spelling; null clears). Anything else is 400.
- `GET /api/loans/:r/entries` returns `byLender: [{ lender, taken, returned, balance, count }]` over all entries of the register (not affected by the list filters); `lender: null` is "not assigned", listed last.
- UI: the entry dialog asks for the lender when the loan has two or more lender names; the loan page shows a **By lender** block and a Lender column; register totals are unchanged.
- On a repayment (returned) for a loan with several lenders, the entry dialog has no separate Receiver box: the chosen lender is saved as the receiver. A loan taken still asks who received the money (default: the borrower).
- Not done: per-lender settle, per-lender statements, shares (percent) between lenders.

## 7c. Loans shared with access codes (added 2026-11-20, migration 0018)

Problem: an access code signed in with a ledger viewer role but had no loan role, so the Loans page (when turned on for the code) listed nothing, and the screen still offered New loan.

| Question | Decision |
| --- | --- |
| Where is it stored? | New table `access_code_loans (code_id, register_id, created_at)`, one row per shared pair. Additive; no existing data changes. |
| What does a code get? | A `viewer` loan membership for each shared register, built on every request in `principalFor`. Sharing and unsharing apply at once, with no new sign-in. |
| What can a code do? | Read the register and its entries. Every write route needs editor or admin, so all writes return 403. `POST /api/loans` already refuses code sessions (403); the screen now hides New loan for them. |
| Who shares a loan? | A loan admin (for their own loan) or a super administrator: `GET` and `PUT /api/loans/:r/access-codes`. `PUT {codeIds}` replaces the set. Only active codes are accepted (400 otherwise). |
| Where is it in the UI? | The Edit loan dialog, a "Shared with access codes (view only)" group with one boxed switch per active code (same style as the Loan returned switch). Only a loan admin sees it. |
| Does the page switch still apply? | Yes. A code also needs the Loans page in its page list; sharing alone does not open the page. |
| Cleanup | Rows go when the register is deleted, or the code is revoked or deleted. |
| Audit | Each change writes a `loan-codes` entry (loan id and name, code ids; never a code secret). |
| Tests | `test/api/loan-access-codes.test.js`. |

## 7d. Loans shared with several ledgers (migration 0030)

A loan keeps one main ledger (`book_id`) and can be shared with more ledgers (`loan_register_ledgers`; `extraLedgerIds` on write, `ledgerIds` in the JSON). Reading works through any of them where the person has a role and the Loans page. A loan linked to a ledger needs Editor or Admin in its main ledger, with the Loans page, for any write; elsewhere the JSON `role` is capped to viewer and `canWrite` is false. Loans linked to no ledger are unchanged (they show **All**). Moving the main ledger needs Admin in the ledger left and the ledger joined (super admin always); the new main is dropped from the list. Access-code sessions get no sharing details. Loans return `createdByName` ("Created by" on the card).

## 8. Not in scope (v1)

Interest or due dates, attachments, per-entry permissions, delegated granting by register admins, multi-currency inside one register, a loans widget on the Dashboard.
