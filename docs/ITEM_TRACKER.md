# Item tracker

A simple per-book page that tracks where things are. Each item has a name, a comment, a location, an owner (free text: who it belongs to) and an updated time that the server sets on every create and change.

Locations are a reusable list per book. Each has a name (unique within the book, case-insensitive) and an optional country or place.

## Using it

Open **Item tracker** in the sidebar (Files). **Locations** manages the list; **Add item** records an item. A location that still has items cannot be deleted. Search matches name, comment, location, place and owner. Viewers only read; editors and admins add, change and delete. Switching books clears the page. An item can be shared into other ledgers (**Also share with**): people there can read it, but any change, delete or move is allowed only in its main ledger (the API answers 409 elsewhere). Moving the main ledger uses `moveToLedgerId`, needs Admin in both ledgers and clears the location. Access-code sessions see no sharing details.

## API

All routes are under `/api/books/:b`. Reads need viewer, writes need editor.

- `GET /items`, `POST /items {name, comment?, locationId?, owner?}`, `PUT|DELETE /items/:id`
- `GET /item-locations`, `POST /item-locations {name, place?}`, `PUT|DELETE /item-locations/:id`

Shared items: `extraLedgerIds` on write, `ledgerIds` in the response (migration `0030`, table `item_ledgers`).

`locationId` must belong to the same book (404 otherwise). Unknown fields are rejected (400). A duplicate location name or deleting a location in use returns 400. Item responses include `locationName`, `place` and `updatedAt`.

## Data

Migration `0007_item_tracker.sql` adds `item_locations (id, book_id, name, place)` and `items (id, book_id, name, comment, location_id, owner, updated_at)`. The JSON backup includes them as `itemLocations` and `items`, and deleting a book removes them.

## Code

`server/repo/items.js`, `worker/routes/items.js` (registered with `registerItemRoutes(app, { repo })` in `worker/api.js`), `src/services/itemAPI.js`, `src/components/items/`, `test/api/items.test.js`.
