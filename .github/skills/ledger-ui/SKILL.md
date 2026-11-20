---
name: ledger-ui
description: UI conventions for the ledger frontend (app shell, adding a page, permissions, money display, full-width layout, mobile). Use when adding or restyling a ledger screen, nav item or component.
---

Paths are relative to the project root. Look at the nearest existing component first and copy its patterns.

## Shell and navigation

- `src/layout/AppShell.js` is the sidebar: grouped nav with icons (`NAV_GROUPS`), collapse button on desktop, a sheet on phones, the ledger list with the active book highlighted, a top bar with page title, book name, base currency, theme toggle and account menu. A super-admin-only `ADMIN_GROUP` adds Users & ledgers.
- Routing is hash based (`useHashRoute`, `#/ledger`). A new page needs: a nav item in `NAV_GROUPS` (path, label, icon path in `ICON_PATHS`), a branch in `Screens` in `src/App.js`, and a permission resource (below).
- Pages use the full window width. Do not add a `max-w-*` page container; cap only inner text blocks.

## Permissions

- Page access is a resource allowlist per account or access code (`server/auth/resources.js`, mirrored in `src/auth/resources.mjs`; `test/auth/resources.test.js` keeps them equal). A new page means a new resource in both files, a route permission on the API, and a test. A request needs the book role AND the resource. Viewer reads, editor writes entries, admin writes master data, a super admin has everything. Hide buttons the role cannot use, but the API is the real check.

## Look and behavior

- Colors come from tokens (`src/styles/tokens.css`): `bg-card`, `border-border`, `text-muted-foreground`, `bg-accent`, `text-negative`. Dark mode toggles the `dark` class on `<html>`. No hard-coded colors.
- Shared form and button classes: `src/components/settings/ui.js` (`inputCls`, `btnPrimary`, `btnSecondary`, `btnDanger`, `Field`, `Badge`). Cards: `rounded-xl border border-border bg-card p-4`. Tabs: a pill bar in a card (see Settings and Admin).
- Money is minor units shown through `Amount` / `formatMoney` with the currency code always visible (per book base currency, wallets in other currencies). Never show a bare number for money.
- Credit and debit are separate columns with a visible divider. Memo funds stay out of totals. Closed years show a lock and block edits.
- Mobile first: every screen works at 375px (cards or stacked rows instead of wide tables, bottom sheet for summaries, 16px side gutters, no page-level horizontal scroll).
- Layouts are flexible, not stacked: lists of records and groups of sections use `grid items-start gap-* grid-cols-[repeat(auto-fill|auto-fit,minmax(min(100%,Nrem),1fr))]` (or flex-wrap) so a wide screen fills each row with several cards and a narrow one wraps to one column by itself, without fixed breakpoints. Avoid full-width rows with mostly empty space and tiny text. In a card, the record name is the larger title and label and value share one text size.
- Confirmations and text prompts use `ConfirmDialog` / `PromptDialog` (`src/components/common/`), never `window.confirm` / `window.prompt`.
- Appearance: 13 palettes via `data-palette` on `<html>` (tokens.css); ledger default set by an admin plus a personal override per user (`src/theme.js`, `src/hooks/useListView.js`). Use tokens so every palette and dark mode work.
- Accessibility: real buttons and links, labels on inputs, `aria-current` on the active nav item, Esc closes sheets and modals, focus returns to the trigger.
- Tailwind utilities work as normal because the CSS reset lives in `@layer base`; never add an unlayered reset.
- Local-only `LOCAL` watermark shows on `*.test`, `localhost` and `127.0.0.1` (`src/index.js`).

## Check

`warden env exec -T app npm run build` must pass. `npm test` for API changes. State plainly if the screen was not opened in a browser.

## Switches instead of big buttons

For a yes/no setting use `Toggle` (boxed) or `Toggle compact` (small, inline, for list headers) from `src/components/settings/ui.js`. For a choice with exactly two named sides (Debit | Credit, Taken | Returned) use `SideSwitch`, which renders the same boxed `Toggle` with a fixed `label` and a `hint` that explains both states ("On: ... Off: ..."), plus `offValue` and `onValue`. Never change the text when it flips. Use `Segmented` only for three or more choices. Do not add big two-button blocks or two-option drop-downs.

## Amount boxes

Use `MoneyInput` (`src/components/common/MoneyInput.js`) for every money amount a person types: it shows `1,500.50` when the box loses focus and plain `1500.50` while editing. Its value is text and `onChange` receives the text, so callers keep using `parseMoney` (which accepts thousands commas). Do not use it for percentages or quantities.

## Lists, cards and grids: one style everywhere

Reuse the existing look, do not invent a new one per feature. Before building a list or panel, open the nearest existing screen and copy its structure.

- **Entry-style lists** (ledger entries, project entries, loan entries, documents): one `ul.divide-y.divide-border.overflow-hidden.rounded-xl.border.border-border.bg-card`; each row `li.flex.items-center.gap-3.px-3.py-1.5.text-sm`; date `w-[4.75rem] text-xs text-muted-foreground`; middle column `min-w-0 flex-1` with a `font-medium truncate` main line (the comment) and a `text-xs text-muted-foreground` line of small chips or labels; amount on the right with `Amount ... font-semibold`. The whole row is the click target (no Edit buttons), with `cursor-pointer hover:bg-muted/40`, `tabIndex` and Enter or Space. Same on phones: no separate table and card versions.
- **Card grids**: `grid gap-3 grid-cols-[repeat(auto-fill,minmax(min(100%,Nrem),1fr))]`, cards `rounded-xl border border-border bg-card p-4`.
- **Summary figures** belong together in one card with the heading (a header card with a divider, then small tiles in one auto-fit grid), not as separate full-width rows.
- Form boxes, switches, amounts: `Toggle`, `SideSwitch`, `MoneyInput`, `ComboInput`, `Modal`, `ConfirmDialog` from the sections above.

## Date boxes

Every `<input type="date">` must carry `min="1900-01-01" max="9999-12-31"`. Without a max, Chrome lets people type a 5 or 6 digit year instead of moving on to the month.
