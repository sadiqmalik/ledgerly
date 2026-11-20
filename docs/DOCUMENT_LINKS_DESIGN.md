# Documents linked to ledger entries: design

Status: built (2026-11-19). Where it differs from the code, the code is right.
Backlog item A1 in `FUTURE_IMPROVEMENTS.md` (done). Its open follow-ups are A5 in that file.

## Differences from the design

- `docCount` counts only links whose document still exists in the same book.
- The entry panel stays open after attach or unlink. It only refreshes the paperclip count.
- The entry panel opens only for editors, and only on entries in open years. To link an entry in a closed year, use the document form.

## 1. What is being added

A document (a report, receipt or prescription with an optional file) can be linked to ledger entries.

- **Many to many.** One document can cover several entries; one entry can have several documents.
- **From the entry.** The entry panel gets a **Documents** section: the linked documents (title, date, open file), an **Attach document** picker and an **Unlink** button on each.
- **From the document.** The Add and Edit document form gets an optional **Entries** field: search entries by date, party or comment and pick several.
- **Viewing.** The Documents page shows the entries each document is linked to. Ledger rows that have documents show a small paperclip with the count.

Totals, balances, year close and exports of money are not affected. Loans are out of scope (loan entries are not ledger entries).

## 2. Decisions

| Decision | Choice | Why |
| --- | --- | --- |
| Storage | New table `entry_documents (entry_id, document_id, book_id, created_at)`, primary key `(entry_id, document_id)`, index on `document_id`. | Plain many-to-many; no change to `entries` or `documents`. |
| Same book | Entry and document must be in the same book as the URL, else 404. | Books share nothing. |
| Entry deleted (soft) | The link row stays, but every read joins `entries.deleted_at IS NULL`, so it is invisible. | Restoring or re-reading stays consistent; entries are never hard deleted. |
| Document deleted | Its links are deleted with it (same request). | No orphans. The entry is untouched. |
| Closed years | Linking is allowed on an entry in a closed year. | It changes no money. Still needs editor role. |
| Who | Read links: viewer. Change links: editor or admin. Gated by the existing `documents` page permission because the endpoints live under `/documents`. | No new page key; a user without the Documents page cannot see or change links. |
| Paperclip count | `docCount` on every entry row from the entries list, via one correlated subquery (no extra requests per row). Not gated (a number only). | One query, cheap. |
| Limits | At most 50 documents per entry and 50 entries per document in one replace call. | Keeps requests and the picker small. |
| Backup | JSON book export gains `entryDocuments: [{ entryId, documentId }]` (deleted entries' links included, like deleted entries). No importer exists today, so nothing to restore. `format` version stays 1 (additive). | Links must not be missing from backups. |
| Entry picker search | Uses the existing entries list endpoint (`GET /api/books/:b/entries` with its `q` filter, small page size). | No new search code. |

## 3. Schema: `migrations/0015_entry_documents.sql`

```sql
CREATE TABLE IF NOT EXISTS entry_documents (
  entry_id    TEXT NOT NULL,
  document_id TEXT NOT NULL,
  book_id     TEXT NOT NULL,
  created_at  TEXT NOT NULL,
  PRIMARY KEY (entry_id, document_id)
);
CREATE INDEX IF NOT EXISTS idx_entry_documents_document ON entry_documents (document_id);
CREATE INDEX IF NOT EXISTS idx_entry_documents_book ON entry_documents (book_id);
```

Use the next free number if 0015 is taken. Add `entry_documents` to `BOOK_TABLES` in `server/repo/books.js`, before `entries` (book delete removes rows by `book_id`).

## 4. API (all in `worker/routes/documents.js`, all scoped by book)

```
GET  /api/books/:b/documents/for-entry/:entryId
  -> [{ id, title, date, type, hasFile, fileName, fileType }]    viewer; 404 if the entry is not in this book or is deleted
PUT  /api/books/:b/documents/for-entry/:entryId   body { documentIds: [id, ...] }
  -> same list as the GET                                          editor; replaces the whole set; max 50; every id must be a
                                                                    document of this book (404 "Document" otherwise); duplicates ignored
GET  /api/books/:b/documents                     (existing) each row gains
  entries: [{ id, date, direction, amount, currency, partyName, comment }]   linked, non-deleted entries only, date desc; max 50
POST /api/books/:b/documents                     (existing) accepts optional entryIds: [id, ...]
PUT  /api/books/:b/documents/:id                 (existing) accepts optional entryIds (replaces the set when present; omitted = unchanged)
DELETE /api/books/:b/documents/:id               (existing) also deletes the document's links
GET  /api/books/:b/entries                       (existing list) each row gains docCount: number (0 when none)
```

`entryIds` validation: array of ids, max 50, each must be a non-deleted entry of this book (404 "Entry"). The single document response (POST, PUT, file PUT) also includes `entries`. A `PUT` that only changes links must not touch other columns and still bumps `updated_at`.

Errors use the usual `{ success:false, error }`. Do not read or write links in any other route.

## 5. UI

Follow the `ledger-ui` skill (tokens only, full width, mobile first, `ConfirmDialog`, shared classes in `src/components/settings/ui.js`). Reuse `ComboInput` for pickers.

- **Entry panel** (`src/components/ledger/EntryPanel.js`): a **Documents** section shown when the account has the `documents` page (`can('documents')` from `useLedger`). Lists linked documents (title, date, a link that opens the file in a new tab when `hasFile`), an **Unlink** button on each (editors only, no confirm needed), and an **Attach document** picker: a `ComboInput` of the book's documents (title and date) that links on pick. Read-only for viewers and for entries the panel treats as locked is NOT required: linking is allowed on closed years (editor role only). Save does not touch links; each attach or unlink is its own immediate call (`PUT .../for-entry/:entryId` with the new id list) and then refreshes the list and calls `onChanged` so the paperclip count updates.
- **Document form** (`src/components/documents/index.js`): an **Entries** field. Selected entries appear as removable chips (date, party, amount, comment start); a search box queries the entries list (`q`, page size 20) and shows matches as `date, party, amount, comment`; picking adds a chip. Sends `entryIds` on save.
- **Documents list**: under each document, the linked entries as small chips (`date party amount`), each clicking through to the Ledger with that entry in view (use whatever deep link or filter the Ledger already supports; if there is none, show them as plain text).
- **Ledger list rows** (desktop table and mobile cards): when `docCount > 0`, a small paperclip icon (an existing icon helper if one exists, else a small inline SVG) with the count, `aria-label` "N documents". Placement: next to the comment or party, quiet colour.
- Strings: "Documents", "Attach document", "Unlink", "Entries", "No documents linked.".

## 6. Tests

- `test/api/document-links.test.js`: link, replace, unlink via `PUT .../for-entry`; one document on several entries and one entry with several documents; cross-book entry or document id gives 404; viewer can GET but gets 403 on PUT; account without the `documents` page is refused; limits (51 ids rejected); soft-deleted entry disappears from `documents[].entries` and from `for-entry` reads; deleting a document removes its links; `entryIds` on create and update (omitted leaves links unchanged); `docCount` in the entries list; link on an entry in a closed year succeeds; export contains `entryDocuments`.
- Existing documents, export and backup tests stay green (adjust only for the new fields). Full `npm test` green and `npm run build` clean.

## 7. Not in scope (kept in `FUTURE_IMPROVEMENTS.md`)

Attaching a file straight from the entry (A2), document files in backups (A3), previews and multi-file documents (A4), linking from loans, a dedicated "documents of this project" view, restore/import of `entryDocuments`.
