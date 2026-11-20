# Currency setup: design

Status: design for implementation (2026-11-19). Where it differs from the code once built, the code is right.

## 1. Problem

Currencies are used everywhere (ledger base currency, funds, accounts, loans, totals, entries) but there is no list to manage. The server accepts any 3 letters, and the screens use a text box with suggestions, so a typo creates a new, wrong currency. There is no way to show a friendlier label such as `kr` for `SEK`.

## 2. What is being added

1. A **managed list of currencies** (code, name, optional alias, on/off). Super administrators manage it in **Admin → Currencies**. Every signed-in person can read it.
2. **Pick, don't type.** Every place that chooses a currency becomes a real drop-down of the active currencies. The server also refuses a code that is not in the list or is switched off, so a typo can never be saved.
3. **Alias display.** Wherever an amount or a currency is shown, the screen shows the alias when one is set (`kr`), otherwise the code (`SEK`). The stored value and all exports stay the ISO code.

## 3. Decisions

| Decision | Choice | Why |
| --- | --- | --- |
| Scope | One global list for the whole app (not per ledger). | A currency means the same everywhere. Simple to manage. |
| Who manages | Super administrators only (Admin page). | Same rule as users and ledgers. |
| Who reads | Any signed-in account, no page permission needed. | Every screen needs the list. |
| Stored value | The 3-letter ISO code, as today. | No data migration of balances. |
| Alias | Optional display text, 1 to 8 characters, not unique. The admin screen warns when two active currencies share an alias (for example NOK and SEK as `kr`). Headings that list several currencies at once (the Totals blocks) keep the code and the name so they stay unambiguous. | The user wants `kr`; ambiguity is the user's call but must be visible. |
| Exports | CSV, Excel and JSON backups keep ISO codes. | Machine readable and stable. |
| Switching off | A switched-off currency is not offered in pickers for new choices and is refused by the server for new use, but existing books, funds, accounts, loans and entries keep it and still display it. A picker that edits a record already using it keeps showing it. | Nothing historical breaks. |
| Deleting | Only when nothing uses it (no book, fund, account, loan register or entry); otherwise 409 with what uses it. | Same idea as other deletes. |
| Editing an existing record | The server checks the currency only when the field changes. | An old record can still be edited after its currency is switched off. |
| Decimals | Out of scope: money stays integer minor units with 2 decimals. | Zero-decimal currencies are a separate feature. |
| Seed | Migration seeds the 22 currencies in `src/utils/currencies.js` plus every other code already used anywhere (books, funds, holders, loan registers, entries, fx currency), name = the code when unknown. | Nothing existing becomes invalid. |

## 4. Schema: `migrations/0014_currencies.sql`

```sql
CREATE TABLE IF NOT EXISTS currencies (
  code       TEXT PRIMARY KEY CHECK (length(code) = 3 AND code = upper(code)),
  name       TEXT NOT NULL,
  alias      TEXT,
  active     INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
-- then INSERT OR IGNORE the standard list and every distinct code already used (see section 3, Seed)
```

Use the next free migration number if 0014 is taken. Alias is stored trimmed; empty means no alias.

## 5. API (`worker/routes/currencies.js`)

```
GET    /api/currencies                -> [{ code, name, alias, active }]   any signed-in account; sorted by code
POST   /api/currencies  { code, name, alias? }              -> 201 row     super admin; 409 if the code exists
PUT    /api/currencies/:code { name?, alias?, active? }     -> row         super admin; the code never changes
DELETE /api/currencies/:code                                -> { success: true }   super admin; 409 if in use
```

`alias: null` or `""` clears it. Errors use the usual `{ success:false, error }`.

Server validation: every endpoint that takes a currency to CREATE or CHANGE a record must call one shared check (`repo.currencies.assertUsable(code)`): the code must exist and be active, else 400 "Unknown or disabled currency XYZ. Add or enable it under Admin, Currencies." Find them all (at least: book create and update `baseCurrency`, fund create and update, account (holder) create and update, loan register create and update; look for any other, for example profit or masters code). Filters (`?currency=`) and reads are never validated.

## 6. UI

- **Provider** `src/hooks/CurrencyContext.js`: loads `GET /api/currencies` once the account is signed in, exposes `{ currencies, active, label(code), name(code), reload }`, reloads after admin changes, falls back to `src/utils/currencies.js` while loading or for an unknown code. `label(code)` = alias if set, else the code.
- **`CurrencySelect`** (`src/components/common/CurrencySelect.js`): becomes a real `<select>` of active currencies, option text `SEK, Swedish krona (kr)`; keeps its props (`value`, `onChange`, `id`, `className`, `required`, `disabled`, `aria-label`) so callers stay the same; also lists the current value when it is switched off or unknown so an edit does not lose it. No free typing anywhere. Replace the free-text box in `src/components/loans/RegisterDialog.js`.
- **Display**: `Amount` shows `label(currency)`; other places that print a bare currency code next to a value (fund and account rows and popovers, loan cards, dashboard fund sections) use `label`. The Totals block heading keeps code plus name.
- **Admin → Currencies** tab (new `src/components/admin/CurrenciesPanel.js`, a tab in `AdminScreen.js`): cards or rows with code, name, alias (inline edit), an Active/Off toggle (use the shared `Segmented` or a switch), Delete when unused (in-app `ConfirmDialog`), an **Add currency** form (code, name, alias), and a warning line when an alias is shared. Full width, mobile first, tokens only, `ledger-ui` skill.

## 7. Tests

- `test/api/currencies.test.js`: seed contents (standard list present, a code used by existing data present), read as any signed-in account, 401 when signed out, write endpoints 403 for non-super accounts, create (409 duplicate, bad code 400), update name/alias/active, clear alias, delete unused vs 409 when used by a fund/book/loan/entry, and the check on every create/update endpoint listed in section 5 (unknown code, switched-off code, unchanged old code still editable).
- Existing tests keep passing (adjust any that rely on made-up codes by adding them to the list in the test setup). Full `npm test` green and `npm run build` clean.

## 8. Not in scope (v1)

Exchange rates, per-currency decimals, per-ledger currency lists, aliases in exports, symbols placement rules (alias is shown after the amount as the code is today).
