# Future improvements: backlog and implementation guide

Status: written 2026-11-19. A1 is built (2026-11-19). Nothing else here is built. Each item says what it is, why, how to build it in this codebase, and how to prove it works. Where an item differs from the code when you start, the code is right: re-read the files named before you begin.

## How to use this file

1. Pick one item. Read its "Touches" files first, and only those.
2. Write or update a short design note first (see `LOANS_DESIGN.md` for the shape), then build, then test, then update docs (`docs-sync` skill).
3. Rules that apply to every item:
   - Money is integer minor units. Totals never depend on project or document links.
   - A schema change is a new numbered migration in `migrations/` (next free number after 0014), idempotent, with small INSERTs (D1 rejects big compound SELECTs and `BEGIN/COMMIT` in SQL files).
   - Dry-run any migration on a scratch copy of a live export (`d1-sync` skill) before deploy. Back up live first.
   - Never commit, never deploy, never touch live data unless asked. Real data stays private.
   - UI follows the `ledger-ui` skill: tokens only, full width, mobile first, `ConfirmDialog` (never browser popups), shared classes in `src/components/settings/ui.js`.
   - Full `npm test` stays green (about 261 tests, about 2 minutes, never run two at once) and `npm run build` stays clean.
4. Suggested order is at the bottom.

---

## A. Documents and entries

### A1. Link documents to ledger entries: DONE (2026-11-19)
Built. The design and what was built are in `DOCUMENT_LINKS_DESIGN.md`. Follow-ups that are still open are in A5.

### A2. Attach a file straight to an entry
Shortcut on top of A1: "Add file" in the entry panel creates a document (title defaults from the party and date) and links it in one step. Build after A1.

### A3. Include document files in backups
The JSON backup has document details but not the files (they live in the `DOCS` R2 bucket). Options: a nightly R2-to-R2 copy to a second bucket, or a documented `wrangler r2 object get` export command in `OPERATIONS.md`. Prefer the R2 copy; add it to `server/backup.js` with the same every-`BACKUP_EVERY_DAYS` rule.

### A4. Document extras
Thumbnails or an inline PDF/image preview, drag-and-drop upload, several files per document, a "document type" managed list (instead of free text), expiry or follow-up dates (useful for prescriptions).

### A5. Follow-ups from A1 (not built)
- The entry panel does not open for viewers or for entries in closed years, so those cannot attach a document from the entry. Option: a read-only panel for viewers, and a linking-only mode for closed years (links do not change money).
- The attach picker is a plain list. It does not search by body text, so long lists are hard to scan.
- The document list links to the Ledger by day, not to the entry. An entry deep link (open that exact entry) is a future item.
- Restore and import of `entryDocuments` is not built, because no importer exists yet. Add it together with a restore.

---

## B. Loans

### B1. One-step "New loan" with the first entry
The New loan dialog has no date or amount, which confuses people: dates live on entries. Add optional **Date** and **Amount** (and "Loan taken") to the dialog; when filled, create the register and then the first entry. Do it client-side as two calls, or add an optional `opening` object to `POST /api/loans` so it is one transaction (preferred: no half-created loan). Touches `RegisterDialog.js`, `worker/routes/loans.js`, `server/repo/loans.js`, tests.

### B2. Several lenders in one loan (per-person balances)
Today a loan has one lender text, so "Lender A & Lender B" is one name and balances cannot be split. Options:
- **Light:** add a `lender` (who gave or who is repaid) column to `loan_entries`, default from the register, shown in the list and filterable, with a per-lender summary (taken, returned, remaining) on the register page.
- **Full:** a `loan_parties` table with shares. Only if the light version is not enough.

Build the light version: migration adds nullable `lender` to `loan_entries`; `EntryDialog` gets a Lender field (`ComboInput` from `useLoanNames`); the entries response gains `byLender` totals; keep register-level totals unchanged. For a returned entry, "receiver" and "lender" overlap: decide the wording first and write it in the design note.

**Done (2026-11-19):** per-lender totals (light version, `loan_entries.lender`, By lender block, see `LOANS_DESIGN.md` 7b); only per-lender settle, statements and shares remain. Also done: several borrower or lender names per loan, as chips saved joined with " & " (no schema change). Per-person balances (the light and full versions above) are still open.

### B3. Managed names list for loans
Names are suggested from existing loans and receivers (`useLoanNames` in `src/components/loans/useLoanRegisters.js`) and disappear when unused. If people want rename or merge ("ben" vs "Ben Smith"), add a `loan_names` table per register owner, with rename and merge, like ledger parties. Large; only if typos become a real problem.

### B4. Loan extras
Interest or profit, due dates and overdue badges, instalment schedule, attachments (can reuse A1 style links to documents), a loans widget on the Dashboard, a statement export (CSV or printable PDF per loan, useful to send to the borrower), loan access codes (view-only share links), delegated granting by register admins, multi-currency inside one register. All were listed as out of scope in `LOANS_DESIGN.md`; keep that file as the reference.

### B5. Loan data in the JSON backup and restore
The nightly R2 job writes `loans/<id>/<date>.json`, but there is no restore path or on-screen download. Add a "Download backup" for register admins and a restore command, tested like the book import.

---

## C. Currencies

From `CURRENCIES_DESIGN.md` section 8, all still open:
- **Zero-decimal and three-decimal currencies** (JPY, KWD): money is stored as integer minor units with 2 decimals everywhere. Needs a per-currency `decimals` column and changes in `src/utils/money.js`, `parseMoney`, `formatMoney`, the server validators and every total. Large and risky: plan it as its own project with a full test pass.
- **Exchange rates** and a combined total across currencies (Dashboard "all in one currency").
- **Per-ledger currency lists** (a ledger offers only some currencies).
- **Aliases in exports** (CSV and Excel currently keep ISO codes on purpose).
- **Symbol placement rules** (`kr` after the amount, `$` before). Today the alias is always shown after the amount.
- **Shared alias warning on the pickers** (the admin page warns; the dropdowns do not).
- **Server message wording:** "Fund is archived" should say "disabled" now that the UI says Disabled (find the string in `worker/routes/` and its tests).

---

## D. Ledger and funds

- **Education Support style guidance.** Moving entries into a project never changes totals. If a project needs its own balance, use entries in the project's fund plus a transfer from General, not moved entries. Add this as a short worked example in `USER_GUIDE.md`, with the 8-entry case, and consider a banner in `ProjectDetail.js` when entries sit in a different fund than the project's main one (the dismissible note exists; make it explain the fix).
- **Retire the old General fund cleanly.** A "Close fund" flow that checks the balance is zero, hides it from the quick add picker and the Dashboard, and keeps history (today: Disabled plus manual transfers).
- **Bulk move.** Move many entries into a project, or between funds, in one action (project move exists for single entries and a bulk move exists; extend it to funds with the balance preview).
- **Recurring entries** (rent, salary) with a monthly generator and a confirm step.
- **Attachments on ledger entries** (see A1/A2).
- **Reports:** saved filters, month-on-month comparison, printable annual summary.

---

## E. Admin, access and security

- **Delegated user management:** the Admin page is super-admin only on purpose. A per-ledger "manage members" for ledger admins would need an audit trail first.
- **Audit log:** who changed what (entries, access, currencies). A single `audit_log` table written by the route layer; show it on the Admin page.
- **Password reset by email** (today a super admin resets passwords).
- **Two-factor sign-in.**
- **Access codes for documents** (today a code reads ledger views and the loans shared with it, viewer-only). Loans are done: see `docs/LOANS_DESIGN.md` section 7c.
- **Session list and "sign out everywhere".**

---

## F. Operations and quality

- **Faster tests.** Each test file starts its own emulator, so `npm test` takes about 2 minutes. Share one emulator per test file (or per run) with the `resetD1` helper in `test/api/helpers.js`, keep the shared `.wrangler/state-test` rule (never two runs at once). Target under 40 seconds.
- **Browser smoke tests** for the new screens (Loans, Currencies, sidebar tree, soft toggles): none were verified in a browser. Add a short Playwright or manual checklist in `OPERATIONS.md`, and run it before each deploy.
- **Deploy checklist for loans and currencies.** Live has not been deployed with migrations 0013 and 0014 (as of 2026-11-19). Before the next `warden deploy`: back up live, dry-run both migrations on a scratch copy of a live export, deploy, then check Admin (Currencies shows the seeded list, the codes in use are present) and that existing ledgers still open.
- **Backups:** a restore drill every quarter (restore a backup into a scratch local DB and compare totals), an alert when the nightly job fails, and the same 10-day interval already set for funds.
- **Monitoring:** a `/api/health` check with D1 and R2 reachability, used by an uptime monitor.
- **Docs:** keep `APP_MAP.md` and `USER_GUIDE.md` updated with every item (the `docs-sync` skill lists which files).

---

## G. Suggested order

1. B1 (New loan first entry): small, removes confusion.
2. F: faster tests and the deploy checklist, before the next deploy.
3. C server message wording and the shared alias warning: small cleanups.
4. B2 (lenders per entry), then B5.
5. A3 (document files in backups).
6. D items as needed, then E.
7. Zero-decimal currencies and exchange rates last: biggest risk to money correctness.

## H. Brief for a future session (copy and adapt)

> Implement item <ID> from `ledger/docs/FUTURE_IMPROVEMENTS.md`. First write a short design note in `ledger/docs/` (schema, API, authorization, UI, tests), then build it following the rules at the top of that file. Do not commit, deploy or touch live data. Run `npm test` once (never in parallel) and `npm run build`, update the docs with the `docs-sync` skill, and report what you verified and what you did not.
