# Ledger: User Guide

Ledger is a private app for keeping the money of a family or a company in one place. It runs in your web browser. This guide explains the ideas first, then the tasks.

Examples use made-up names and amounts ("Fund A", "a 50,000 remittance", "Company X").

## Quick start (5 minutes)

1. **Sign in.** Open the address your administrator gave you, enter your email and password, and press the sign-in button.
2. **Read the Dashboard.** It opens first. The big **Usable** figure is the money you can spend. Below it are your funds, wallets, this year's totals and your recent entries.
3. **Add an entry.** Open the **Ledger** page and press **Add entry** (or the **n** key). Pick the **Remittance** preset, enter a date, a fund such as Fund A and an amount such as 50,000, then press **Save**. (Viewers cannot add entries; ask an editor.)
4. **Find it in the Ledger.** Open **Ledger**. Your new row is at the top of the list. Click a year chip, or use the Fund, Category, People and Project filters, to narrow the list.
5. **See the summary.** On a desktop it is the sidebar on the right; on a phone it is the bar at the bottom. It shows Credit, Debit, Net and Closing for the rows you can see.

**First run on a new install.** There is no sample data. A super administrator is created from the command line (see [GETTING_STARTED.md](GETTING_STARTED.md)), signs in, and uses **New ledger** in the sidebar to create the first ledger, with default categories, a General fund and a Cash account. Then add funds, people and members in Settings.

A picture of the whole app is in [APP_MAP.md](APP_MAP.md).

## Contents

1. What this app is
2. Key ideas
   - Currencies and wallets
   - Managing the currency list
3. How years work (important)
4. How projects work (important)
5. Dashboard
6. Adding entries (Quick add)
7. The Ledger page
8. Documents
9. Reports
10. Settings
   - Appearance
11. Users and roles
12. Loans
13. Creating a new ledger
14. Using it on a phone
15. Coming from a spreadsheet
16. Messages you may see
17. FAQ

---

## 1. What this app is

The app keeps **one continuous ledger per book**. Every entry has a date, and all entries sit on one timeline. A fund's balance on any date is everything that came before it. The Ledger page can show one year, several years or all years, but the data is never split into separate sheets.

### Signing in

1. Open the address your administrator gave you.
2. Enter your username (or email) and password, then sign in.
3. To sign out, use the account menu.

The app signs you out after a period of no activity, and at the latest after a week. Passwords must be at least 6 characters. After **5 wrong passwords** in a row, sign-in is blocked for **15 minutes**. You see only the ledgers, loans and pages you have been given (section 11). See section 11 for password reset.

---

## 2. Key ideas

### Books

A **book** is a separate ledger, for one person or one company, such as a family book and a Company X book. Each book has its own funds, people, categories, projects, documents and year closes. Nothing is shared between books. The top bar switches between them.

### Funds and their groups

A **fund** is a pot of money in one currency, such as a bank account, a cash box or a savings pot. Examples: Fund A (a bank account in the base currency), Fund B (a savings pot).

| Group | What it is | In Usable and Total? |
| --- | --- | --- |
| **Usable** | General funds in the base currency. The money you can spend. | Yes |
| **Reserved** | Money set aside: reserved, custodial and investment funds. | Total only |
| **Wallets** | Funds in a currency other than the base currency, for example a USD wallet. Shown in their own currency. | No |
| **Memo** | Money tracked for information only. It is never part of your money. Hidden in the Ledger unless you tick **Show memo funds**. | No |

Two headline figures use these groups:

- **Usable** is the money you can spend. It is the headline on the Dashboard.
- **Total** = Usable + Reserved. Both are in the base currency only.

Example: Fund A (usable) holds 100,000 and Reserved Fund B holds 30,000. Usable is 100,000, Reserved is 30,000 and Total is 130,000. A USD wallet holding 1,000 is shown on its own and is not added.

### Credits, debits and balances

A **credit** is money coming into a fund. A **debit** is money going out. A fund's balance = its credits minus its debits.

### Quantity, unit price and total

When adding or editing an ordinary entry in the Ledger or a project, enter **Quantity** and **Unit price**. The **Total** updates automatically. For a travel expense of 10 tickets at 50 each, enter quantity `10` and unit price `50`: the saved total is `500`. It is still one entry, and balances and project totals count that `500` once.

Quantity defaults to `1`, so a single expense works just as before: enter its full amount as the unit price. Existing entries keep their original amounts, with quantity `1`. You can use fractional quantities with up to three decimal places (for example `2.5` units); totals round to the nearest cent/paisa, with halves rounded up. Quantity and price must be greater than zero.

The Ledger and project entry lists show quantity and unit price alongside the total. These details are also included in JSON backups, CSV downloads and Excel exports. Transfers and currency conversions keep their existing amount fields; quantity does not apply to linked transfers.

### People, categories and projects

- A **person** is who gave or received the money, such as Person A. Typing a new name in an entry creates the person.
- A **category** says what kind of entry it is: Remittance, Profit, Gift, Expense, Medical, Other and so on.
- A **project** groups the entries for one purpose, such as a trip or a medical case. See section 4.

### Linked transfers and conversions

- A **transfer** moves money between two funds in the same currency. It is saved as two linked rows, one debit and one credit. You edit or delete it as one.
- A **conversion** moves money between two funds in different currencies, for example PKR to USD. You enter both amounts, and the app works out the rate.

### Excluded rows

In the entry form this is the **Count in ledger totals** switch: turn it off to exclude the row.

An **excluded** row stays in the list, dimmed and tagged "excluded". It does not count in any balance or total. Use it to keep a record without counting it.

On a project page, clicking a person or a category on an entry filters that project's entries (there is also a **Party** filter next to Category). In the Ledger, clicking them filters the Ledger.

### Moving an entry into a project (or out of one)

If an entry was added in the Ledger but belongs to a project, open it (click the row) and pick the project in the **Project** box, then **Save**. Choose **(none)** to take it out of a project again. Editors and admins can do this; linked transfer legs and entries in a closed year cannot be changed. Moving an entry between the ledger and a project does **not** change any balance or total, because project entries count in the ledger like any other. To keep an entry out of the totals, turn off **Count in ledger totals** instead; to cancel it out, use **Refund / Balance**.

### Refund / Balance an entry

Use **Refund / Balance** on an entry, from either the Ledger or the Projects editor, to cancel it out. The date defaults to the original entry's date; you can choose another now or edit it later. The app adds a **new, independent entry** in the opposite direction (a debit becomes a credit and the reverse) with exactly the same amount, quantity, unit price, fund, party, category, project, comment, rate and excluded flag. The new entry has the date you chose and the original's status (paid stays paid on that date; pending stays pending). The original is kept unchanged, and the new entry can be edited or deleted like any other. Both entries count in totals, so the net is zero. Transfer legs and entries in a closed year (original or new date) cannot be refunded, nor can entries of a disabled fund.

### Pending and paid

Project entries have a status: **pending** (not yet paid) or **paid**. A paid entry can also have a paid date.

### Roles

Your role decides what you can change.

| Role | Can do |
| --- | --- |
| **Viewer** | Read everything. Download the entries as CSV. |
| **Editor** | Everything a viewer can, plus add and change entries, transfers, people, projects and documents. |
| **Admin** | Everything an editor can, plus manage funds, accounts, categories and members, close and reopen years, and download the Excel file and the full backup. |
| **Super administrator** | Sees every ledger, including deactivated ones. Creates ledgers, reactivates them, deletes an inactive ledger permanently, and creates sign-in accounts and sets their roles. |

Loans have their own viewer, editor and admin roles, set separately from the ledger roles (section 11).

---

### Currencies and wallets

Entries and wallets in a currency other than the book's base currency (for example USD or SEK) have a soft tinted background and a coloured bar on the left, a different colour for each currency, so they stand out from base-currency rows. The same colour marks the currency badge on the Dashboard's Wallets card. The colours are theme tokens (`--cur-1` to `--cur-6` in `src/styles/tokens.css`) and which currency uses which is set in `src/utils/currencyStyle.js`, so a developer can change them; there is no setting screen for it yet.

- **Base currency.** Every ledger has one base currency, for example PKR for a family ledger or SEK for a Swedish company. It is shown as a badge next to the ledger name in the top bar, and on the dashboard ("Usable · PKR"). You pick it from the currency list when you create the ledger. You can change it in **Settings › Details** only while the ledger has no entries.
- **Every amount shows its currency**, for example `41,328 PKR` or `1,124 USD`, so you never have to guess.
- **Wallets** are funds in any other currency. You can have as many as you need: a USD wallet, an SEK wallet, two EUR accounts, and so on.
  - To add one, go to **Dashboard › Wallets › Add wallet** (admin), or to **Settings › Funds › Add fund** and pick a currency.
  - Pick the currency from the list (it has PKR, USD, EUR, GBP, SEK, AED, SAR, QAR and more). If the one you need is missing, a super administrator can add it under Admin, Currencies (see Managing the currency list).
  - On the dashboard, wallets are grouped by currency, with a subtotal when a currency has more than one wallet.
- **Moving money between currencies:** use **Quick add › Convert**. Enter what left one fund and what arrived in the other. The app saves a linked pair and shows the rate.
- **Totals are never mixed.** Usable, Reserved and Total are in the base currency only. Wallets keep their own totals. The Ledger summary shows one block per currency, base currency first.

### Managing the currency list

A super administrator manages the list of currencies in **Admin**, on the **Currencies** tab. Every signed-in person can read the list. Every place that asks for a currency offers only the currencies on the list that are switched on.

**Add a currency**

1. Open **Admin** and choose the **Currencies** tab.
2. Press **Add currency** at the top right. In the dialog, type the 3-letter code (for example SEK), the name (for example Swedish krona) and, if you want, an alias (for example kr).
3. Press **Add currency** in the dialog.

**Give a currency an alias (short label)**

1. In the currency's row, change the **Alias** box (up to 8 characters). Clear it to show the code again.
2. Press **Save**.

The alias is shown wherever an amount or a currency is named on screen, so SEK amounts show as `kr`. The totals headings keep the code and the name, so two currencies with the same alias stay apart. Exports (CSV, Excel and JSON backups) always keep the 3-letter code. If two switched-on currencies share an alias, for example NOK and SEK both as `kr`, the Currencies tab shows a warning. The app does not stop you.

**Switch a currency off or on**

Press **Active** or **Off** on the currency's row.

- **Off** hides the currency from every list where someone picks one. The server also refuses it for any new ledger, fund, account or loan, and for a change of currency on one of them.
- Records that already use the currency (ledgers, funds, accounts, loans and entries) keep it and still show it. When you edit such a record, its currency stays in the list, marked "(off)", so nothing is lost.
- **Active** switches it back on.

**Delete a currency**

Press **Delete** and confirm. A currency can be deleted only when nothing uses it: no ledger, fund, account, loan or entry (deleted entries count too). If something does, the app says what uses it, and nothing is deleted. To hide a currency that is in use, switch it off instead.

**Where you pick a currency**

You pick a currency from the list, and do not type it, for the base currency of a ledger, funds, accounts, loans and wallets.

---

## 3. How years work (important)

### You do not carry the balance forward

There is no carry-forward step. Entries are one dated timeline, and a fund's balance on any day is everything before that day. A new year starts automatically: just add entries with dates in the new year.

### Showing last year's balance

In the Ledger, turn on **Include previous balance**. The app adds an opening row for each fund, labelled "Opening balance (carried from 2025)" for a 2026 view. The row is calculated live from the data. It is not stored, and it does not add to the year's credits or debits. The checkbox becomes available once you pick a year or a From date.

### Closing a year

Closing is a safety lock. It is not a required step.

When an admin closes a year in **Settings › Years**:

- every entry dated in that year is locked. It shows a lock and cannot be edited, deleted or added to;
- the app saves each fund's balance at 31 December as a snapshot.

Settings › Years has three buttons:

- **Check** compares each fund's balance today with its stored 31 December balance. The result appears on the year's card: **Matches the snapshot.**, or the list of funds whose balance differs, with the saved and the current amount.
- **Close** locks the year and stores the snapshot. The app asks you to confirm in a box first.
- **Reopen** unlocks a closed year, so you can make changes. The app asks you to confirm in a box first. Close it again when you are done.

### Year-end checklist

1. Review the year in the Ledger, with the year selected and **Include previous balance** on.
2. Check the summary (sidebar on a desktop, bottom bar on a phone). Make sure each currency's Closing figure is what you expect.
3. Optionally, download the year as CSV or Excel from Settings › Data and keep a copy.
4. Close the year in Settings › Years. Use **Check** later to confirm nothing has changed.

---

## 4. How projects work (important)

### A project is a tag on ordinary entries

A project does not hold its own money. It is a **tag** on ordinary ledger entries.

- Each project has a **fund**, and its entries are saved in that fund.
- So a project's entries already count in the fund's balance, and they appear in the Ledger like any other entry.
- The **project total** is the sum of the entries tagged with that project.

| Total | Meaning |
| --- | --- |
| **Spent** | Debits minus credits, leaving out excluded rows |
| **Paid** | The part of Spent with status paid |
| **Pending** | The part of Spent with status pending |
| **Excluded** | The amounts of excluded rows. Shown separately; not in Spent. |
| **Count** | The number of entries |

### How project entries work

Each detail row is itself a ledger entry, tagged with its project. The fund balance comes out right, and you can see every row and filter by it.

Some projects are tracked but are not part of the main money. For example, an old medical project that is not part of the main money. Put its fund in the **Memo** group. Its entries and totals are tracked but never part of Total or Usable.

### Creating a project (editor)

1. Go to **Projects** and press **New project**.
2. Enter a name and a kind (trip, medical, event or other), and choose a fund.
3. Optionally add start and end dates, a budget and extra fields.
4. Save.

Extra fields are your own labels, such as "Hospital" or "Payer". They appear on the entry form for that project.

### Changing a project's fund

The project's fund is the fund its new entries go to. When you edit a project and pick another fund, a tick box **Also move this project's existing entries to the new fund** appears (on by default). Leave it on to move them all; turn it off to keep the old entries where they are. If some entries are already in another fund, the project page shows a note "N of M entries are in <other fund> instead of <fund>" with a **Move to <fund>** button and a **Dismiss** button. The note is only a hint: the project's fund is where new entries go, and older entries may belong in another fund on purpose. Dismiss hides it on this device until the number of such entries changes. Linked transfer legs are never moved. If any entry to be moved is in a closed year, or is in another currency than the fund, the **whole move is refused** with a message and nothing changes.

**What moving does to the numbers.** Each moved entry leaves its old fund and joins the project's fund, so the two funds' balances shift by the same amount in opposite directions, from that entry's date onward (the fund openings and year-end balances of later years change too). Totals do not change when both funds count the same way (for example two usable funds in the same currency). They do change when one fund is a memo fund (memo funds are not in any total) or when you move between a usable and a reserved fund (the usable/reserved split changes). **Closed years:** reopen the year of every entry you are moving, move them, then close the years again. Close again every closed year from the earliest affected year onward, so each year's saved year-end balances match the new fund split; the year check in Settings › Years shows any year you missed.

On a project's entry form there is a **Party** field, so you can set or change who an entry was paid to or received from (clear it to remove the party).

### The Projects page (cards)

Each project is a card in a grid, in the same style as the cards on the Loans page: the name and badges, the fund and kind, the dates and number of entries, a small table of Out, In and Net spent (with Paid and Pending below), and the budget bar. Press a card to open the project. The checkbox in the corner picks it for the Summary and Compare.

**Quick jump from the sidebar.** The **Projects** and **Loans** items in the sidebar (both under **Money**) each have a small arrow at the right end of their row. For Projects: Click the arrow to open or close a list of your open projects right under it, then click a project to go straight to it, without opening the Projects page first. The sidebar remembers whether the list is open. The list is hidden when the sidebar is collapsed to icons.

**The ledger switcher and the Dashboard.** At the very top of the sidebar a small box lists your ledgers (the selected one is highlighted; a super administrator also sees **New ledger** there). The **Dashboard** is a single item right below it, because it shows the selected ledger. **Choose which ledgers to list.** If you have more than one ledger, press **Choose ledgers** under the list, switch off the ledgers you do not want in the sidebar and press **Done**; press it again to show them later. The open ledger always stays listed, so you can never lose it. This only changes your own sidebar in this browser; nothing is deleted and your access is unchanged.

**Fold the sidebar groups.** Below the Dashboard, each group label (Money, Files and Administration) is a button with a small arrow, and the pages of the group hang under it like the branches of a tree. Press the label to fold the group away or open it again. **Money** holds Ledger, Projects, Loans and Reports; **Administration** holds Settings and, for super administrators, Admins (admins, access codes, all ledgers and currencies). A small dot beside a folded group means the page you are on is inside it. The app remembers your choice in this browser. In the narrow icon-only sidebar the groups cannot be folded.

1. **Filters** narrow the list by kind, fund, status and year. Each filter takes several values.
2. The **Summary** shows the totals of the filtered or selected projects. On a desktop it is a sticky sidebar. On a phone it is a bar at the bottom.
3. To **compare**, tick the checkboxes of the projects you want (or **Select all**), and the summary shows the selected projects side by side. **Unselect** clears the choice.
4. Closed projects are hidden unless you choose to show all.

### A project's detail page

1. Click a project in the list.
2. You see its **summary** (Spent, Paid, Pending, Excluded, Count), its spend by category, and its entries.
3. Filter the entries by **category**, **status** (paid or pending) and any **extra field** you defined (such as Hospital).
4. Press **View in Ledger** to open the Ledger already filtered to this project (across all years).
5. Editors can **add entries** here. The entry is saved in the project's fund, with the project tag.
6. Editors can **Close** a project when it is finished, and **Reopen** it later. A project can be deleted only when it has no entries.

### Memo projects

A project whose fund is a **Memo** fund is a memo project. It keeps full totals and entries, but its money never counts in Usable or Total. Use it for something you want to track but that is not part of your main money.

---

## 5. Dashboard

The Dashboard is the first screen. It answers "how much do we have, and where is it?" at a glance.

| Section | What it shows | Why you would use it |
| --- | --- | --- |
| **Overview** | The Usable headline, Reserved and Total, and a split bar showing the two parts | A quick answer to "how much can we spend?" |
| **Needs attention** | Things worth a look: entries still pending, past years that are still open (admins), and loans that are fully paid back but not settled yet (loan admins). It does not appear when there is nothing to show. | A short to-do list that finds itself |
| **Accounts** | Which account or holder (for example Bank account B or a cash box) holds which funds, with a total for each currency | To see where the money physically sits |
| **Funds** | Two halves side by side: **Usable** (the balance of each spendable fund) and **Reserved** (each reserved, custodial and investment fund), each with its total | Check each fund and the money set aside |
| **Wallets** | Funds in other currencies, each in its own currency, with an **Add wallet** button (admin) | Keep foreign currencies apart from the base currency |
| **This year** | Credits and debits for the current year | See how the year is going |
| **Profit trend** | Profit over recent months | Spot changes in profit |
| **Loans** | The loans that are still open: how much is still owed per currency, and your biggest few with a bar of how much has been paid back. Shown only with the Loans page. | Keep an eye on money lent out |
| **Open projects** | Projects that are still open, with their totals | Keep an eye on trips, cases and events |
| **Recent** | The last 10 entries | Confirm what was just added |
| **Memo** | Memo funds. Not part of Total or Usable. | Information-only money |

### Setting which account holds a fund

The **Accounts** section groups funds by their account. To place a fund in an account:

1. Go to **Settings › Funds** (admin).
2. Edit the fund and choose a value in **Account**.
3. Save. The fund now appears under that account on the Dashboard.

Funds without an account are listed together so nothing is hidden.

### Adding a wallet

1. On the Dashboard, open **Wallets** and press **Add wallet** (admin).
2. Pick a currency from the list and give the wallet a name.
3. Save. It appears under Wallets, grouped by currency.

### Customize the Dashboard

**Dashboard visuals (List, Pie, Bars or Graph).** Choose how the Dashboard shows the Overview, Funds, Accounts and This year cards in **Settings > Dashboard**; the Dashboard follows at once. **List** is the plain view. **Pie** is a filled pie: a line from each slice leads to its amount and percentage, and the legend only says which colour is which fund. **Bars** is one horizontal bar per fund with its name, amount and percentage. **Graph** is vertical columns, one per fund. Hover or tab to a slice, bar or column to highlight it. The choice is saved in this browser for your account (it is not shared with your other devices). Anyone who can open Settings can set it.

1. Press **Customize**.
2. Show or hide each section, and reorder them.
3. Press **Done**.

Your layout is saved for you, for each book, on this device only. Press **Reset to default** to go back to the standard layout.

---

## 6. Adding entries (Quick add)

Quick add is the fastest way to record money.

1. On the Ledger page, press **n**, or use the **Add entry** button.
2. Pick a preset at the top and fill in the fields.
3. Press **Save**. Press **Save & add another** to keep the form open for the next entry, or **Cancel** to close without saving.

| Preset | Use it for | What is fixed |
| --- | --- | --- |
| **Remittance** | Money received into a fund | A credit, category Remittance |
| **Profit** | Profit paid into a fund | A credit, category Profit, and a rate field. The last rate used for that fund is filled in. |
| **Gift** | A gift | Category Gift. You choose the direction. |
| **Expense** | Money spent | A debit |
| **Other** | Anything else | You choose the direction and the category |
| **Transfer** | Money moved between two funds in the same currency | A linked pair of entries |
| **Convert** | Money moved between two funds in different currencies | A linked pair. Only funds with different currencies are offered. The live rate shows as you type. |

Fields: date, direction, person, category, fund, amount and comment. The amount must be more than zero, with up to two decimals. Commas are optional. The direction sets the sign, so you never type a minus.


**Exclude switch.** Each row of a project has a small switch at the far right (on the Ledger page, open the entry to change it). On means the entry counts in totals; off excludes it (the row is dimmed). You do not need to open the entry. It is hidden for linked transfer legs and entries in closed years, and for viewers.

Example: a 50,000 remittance into Fund A is the Remittance preset, amount 50,000, fund Fund A, direction credit.

You cannot save an entry dated in a closed year. The app blocks it. See section 16.

### Changing many entries at once

Use this to change the same thing on many rows, for example to move ten rows into another category. It works on the Ledger page and on a project page.

1. Tick the box at the left of each row. Boxes are greyed out for linked transfer legs and for entries in a closed year. Hover over a greyed box to see why.
2. A bar appears at the bottom of the screen with "N selected". To tick every row on the page, use the box in the bar.
3. Press the action you want (see the table) and pick the value in the window.
4. Check the line "Apply to N entries", then press the confirm button.
5. All the selected entries change together. The ticks clear when it is done.

Press **Clear** to untick everything. You can change up to 200 entries at once.

| Action | What it does | Asks you for |
| --- | --- | --- |
| **Move to fund** | Moves the entries to another fund | A fund in the same currency |
| **Change category** | Sets the category | A category |
| **Change party** | Sets the person | A person, or a new name |
| **Move to project** | Puts the entries in a project, or takes them out | A project, or none |
| **Mark paid / pending** | Sets the status (project page only) | Paid or pending |
| **Exclude / Include** | Leaves the entries out of totals, or counts them again | Nothing. It applies at once |
| **Delete** | Deletes the entries | A confirmation box |
| **Clear** | Unticks all rows | Nothing |

Rules to know:

- **All or nothing.** If any selected entry cannot be changed, nothing changes and a message says why. The reasons are: the entry is in a closed year, it is a linked transfer leg, the target fund is disabled, or (for **Move to fund**) it is in another currency than the target fund. Untick that row and try again.
- **Delete** works like deleting one entry. The entries are hidden, but they stay in the full backup.

---

## 7. The Ledger page

The Ledger lists entries, one row per entry. It is the place to find, check and correct anything.

### Choosing the period

1. **Year chips** show one chip per year, plus **All years**. Click a chip to see that year.
2. For several years, switch on **Select several years**, or hold Ctrl (Windows) or Cmd (Mac) while you click. A lock on a chip means the year is closed.
3. **From / To** shows a date range instead of years.

### The main filters

The main row has four filters: **Fund**, **Category**, **People** and **Project**. Each takes several values, and each has a **(none)** choice for entries without one.

- **Picking a project switches to All years automatically**, because a project often spans more than one year. If you are on a single year and that project has no entries in it, a hint appears: "No entries for this project in 2026. **Show all years**". Click it to widen the view.
- Clicking a **fund**, **person** or **category** name inside a row filters the list by it. Hovering over one shows more details.

### More filters, saved views and previous balance

1. Press **More filters** for the less-used filters: fund kind, currency, direction (credit or debit), status (paid or pending), excluded rows, transfers, amount range, dates, search text and sort.
2. Press **Clear all** to reset everything.
3. Filters are kept in the address bar, so you can bookmark a view. Press **Save view** to keep the current filters under a name, and **Views** to open a saved one.
4. Tick **Include previous balance** to add an opening row for each fund (see section 3). It becomes available once you pick a year or a From date.

### Reading a row

- **Fund** with a coloured dot (the colour you set in Settings › Funds).
- **Party** (the person), **Category**, and a **📁 project tag**. Click the tag to open that project.
- **Credit and debit** columns sit in a tinted band so they are easy to tell apart.
- Dimmed rows tagged "excluded" do not count in totals.

### The Summary

The summary adds up the rows that match your filters. Excluded rows are left out.

- **On a desktop**, it is a sticky sidebar. **On a phone**, it is a bar at the bottom showing the closing figure; tap it for details.
- There is **one block per currency** (base currency first, for example PKR, then USD or SEK). Each block shows **Opening**, **Credit**, **Debit**, **Net** and **Closing**, then **By fund**.
- Totals are never added across currencies.

### The "Closing not shown" note

When **Include previous balance** is on, the Closing figure is normally Opening + Net. Sometimes the app cannot give a correct Closing and shows a note such as "Closing not shown: the category filter narrows the rows but not the opening balance." It appears when:

- you use a filter that narrows the rows (person, category, project, status, direction, excluded, transfers, amount or search) but the opening balance is for the whole fund, so the two would not match; or
- you pick several years that are not consecutive (for example 2023 and 2025).

To see a Closing figure, clear those filters or pick consecutive years.

### Editing and deleting

1. Open a row.
2. Change the fields, or tick **Exclude from totals** to keep the entry on record without counting it.
3. Save, or delete the entry.

### Duplicating a record

To create something that is almost the same as an existing record, use **Duplicate** instead of typing it again. It opens the normal form already filled in with the original's values. Change what differs and save. Nothing is created until you save, and the original is never touched.

| Where | How | What is copied |
| --- | --- | --- |
| Ledger entry (also inside a project) | Open the entry, then **Duplicate** | Everything (fund, side, party, category, project, quantity, price, rate, comment, count-in-totals, a project entry's extra fields). The date becomes today. Not copied: linked documents. Linked transfer legs have no Duplicate. |
| Document | **Duplicate** on the row | Title, type, doctor, hospital, project, person, comment, linked entries. The date becomes today. The file is not copied: attach it in the form. |
| Notebook entry | **Duplicate** on the card or in the category | Everything, dated today |
| Item | **Duplicate** on the row | Name, location, owner, comment |
| Loan entry | Open the entry, then **Duplicate** | Type, amount, lender, receiver, comment. The date becomes today. |
| Loan | **Duplicate loan** on the loan page | Name (with "(copy)"), borrower, lender, description, currency. No entries and no sharing. |
| Project | **Duplicate** on the project page | Name (with "(copy)"), kind, fund, dates, budget, extra fields. No entries. |

Rules to know:

- A **linked row** (a transfer or a conversion) is tagged. For a transfer you can change the date, the comment or the amount, and both rows change together. Anything else, including a conversion's rate, means deleting both rows and entering the transfer again. Deleting one leg deletes both.
- **Closed years** are read-only. Ask an admin to reopen the year.
- You cannot post to a **disabled fund**.
- A deleted entry is kept in the full backup, but it is not shown in the app.

---

## 8. Documents

Documents keep a log of reports and prescriptions, with the files attached.

1. Press **Add document**.
2. Enter a date and a title. Optionally add the date received, the type, the doctor, the hospital, a project, a person and a comment.
3. Attach a file if you have one.

Accepted files are **PDF**, **JPEG**, **PNG**, **WebP** and **HEIC**, up to **10 MB**. Replacing a file replaces the old one. Deleting a document also removes its file.

Documents appear as cards, the same as Loans, Projects and the Notebook: the title and type, the date, doctor and hospital, the person and project, the comment, linked entries and the file. Click a card to edit it, or use **Duplicate** and **Delete** on it.

Search by title, comment, doctor or hospital. Filter by project, person, type or dates.

Viewers can open the files. Editors add, replace and delete them.

### Linking a document to entries

One document can cover several entries, and one entry can have several documents. For example, one receipt can cover three payments, or one entry can have both a report and a prescription. A document can be linked to up to 50 entries, and an entry can have up to 50 documents.

**From the document form.** In **Add document** or **Edit document**, use the **Entries** field. Type in its search box to find entries by date, person, amount or comment, and pick the ones you want. Each entry you pick shows as a chip. To take one out, remove its chip. Press **Save**. This works for entries in closed years too.

**From the entry.** Click the row of an entry in the Ledger to open it. The entry panel has a **Documents** section with the documents already linked, and the file name of each one. Press **Attach document** and pick a document from the list to link it. To remove a link, press **Unlink** next to the document. Linking and unlinking save straight away, so you do not need to press **Save** on the entry. The panel stays open, and the paperclip on the row updates.

The entry panel opens only for editors, and only for entries in a year that is still open. For a closed year, or if you are a viewer, link from the document form instead (viewers cannot link at all).

**On the Ledger.** A row that has documents shows a small paperclip with the number of documents, for example a paperclip with 2 next to it.

**On the Documents page.** Each document lists the entries it is linked to, with the date, person and amount. Click one to open the Ledger on that day.

**Rules:**

- Linking needs the **Documents** page permission and the editor role. Viewers can see the links on the Documents page, but cannot change them.
- Links do not change any amount. Totals, balances, reports and year closes are the same with or without links.
- Deleting a document also removes its links. The entries are not changed.

---


### The Notebook (notebooks, categories, notes and important dates)

**Notebook** (in the Files group) is where you keep notes and dates worth remembering. It has three levels:

1. **Notebooks**: create as many as you like (for example Family, Car). **New notebook** asks for a name and which ledger to link it to.
2. **Categories** inside a notebook: a person or topic such as "Family" or "Car".
3. **Entries** inside a category: notes and important dates.

**Formatting a note.** The message box has a small bar: **B** bold, *I* italic, ~~S~~ strikethrough and a bullet list (also Ctrl or Cmd with B and I). Select text and press a button, or press it again to take the formatting off. It is stored as plain text (`**bold**`, `*italic*`, `~~strike~~`, `- ` for bullets) and shown formatted on the card; older notes are unchanged.

The Notebook page lists the open ledger's notebooks plus your private ones (linked to no ledger). A notebook linked to another ledger appears only when you switch to that ledger. **New notebook** starts linked to the open ledger.

**Who can open a notebook.**

- **Linked to a ledger**: it follows that ledger's access. A super admin, or an admin who has the Notebook page switched on and a role in that ledger, can open it. A **Viewer** only reads it (view only), an **Editor or Admin** can change it. Several notebooks can be linked to the same ledger.
- **Not linked to a ledger** (super admins only): private to you. No other admin can see it, not even another super admin.
- An access code sees notebooks only when you switch on its Notebook page: it can then read (never change) the notebooks linked to the ledgers it is attached to. Private notebooks stay hidden. Only the owner (or a ledger Admin or super admin) can delete a notebook, and only the owning super admin can change which ledger it is linked to.

**Sharing a notebook with other ledgers.** A notebook keeps one **main ledger** and can also be shared into other ledgers (the **Also share with** switches in the notebook form). People read it through any ledger where they have a role and the Notebook page. Only the main ledger can change it: you need **Editor** or **Admin** there (**Admin** to delete it, move it or change who it is shared with). Moving it to another main ledger needs the **Admin** role in the ledger it leaves and in the one it joins. A small two-people badge with a number shows a shared notebook; hover it to see the main ledger and the others. People who sign in with an access code never see this.

An entry is an ordinary **note** (a date, a title and a message, with **From** (who said it) and **For** (who it is for); names you used before are offered as suggestions) until you switch on **Important date**. An important date is a day to remember, such as an anniversary, a first service or a purchase date, with a **small note**; switch on **Repeats every year** for anniversaries and birthdays. It shows under Upcoming. This is separate from **Starred**, which only puts a star on any entry. The two switches sit side by side at the top of the form.

Entries can also link to a project when the notebook is linked to a ledger. **Disable** hides an entry from the default list without deleting it, **Enable** brings it back, **Duplicate** copies it into a new pre-filled form.

**Categories** are a person or a topic, such as "Family" or "Car". Type a new name in the Category box of any entry and it is created for you, or use **New category**. Each name is used once ("car", "Car" and "CAR" are the same category, and extra spaces are dropped). Open a category to see its **main note** at the top and all its dates and notes as a timeline (oldest first, or switch to newest first). **Add date** and **Add note** on that page start with the category already chosen. Deleting a category keeps its entries; they just have no category.

The Notebook page has two views:

- **Categories**: one card per category with its counts and the next date coming up.
- **All entries**: every entry as cards, filtered by search, category, project, dates, **Show** (Active, Disabled, All), **Type** (Notes, Dates) and **Starred only**.

**Upcoming** at the top of the page lists the important dates in the next 30 days, soonest first, each with a countdown ("today", "tomorrow", "in 12 days"). Dates within a week are highlighted. A yearly date comes round again every year (29 February falls on 28 February in other years). A date that does not repeat appears until it has passed. A disabled entry is not shown. The countdown uses the date on your device.

## 9. Reports

Reports use the base currency only. They leave out deleted rows and excluded rows.

| Tab | What it shows |
| --- | --- |
| **Yearly** | For each fund and year: opening, credits, debits and closing balance. The total leaves out memo funds. Transfers are counted, because this view follows fund movements. |
| **Spending by** | A table of category, person, project or fund against years. Choose debit, credit or net. You can leave out memo funds. Transfers, conversions and openings are not counted. |
| **Profit** | Profit per month for a fund, with the average rate for that month. |
| **Medical** | Medical spending per year, and the medical projects for each year. |

The Reports page uses the same look as Settings (pill tabs, full width) and is interactive: hover or click a bar for its figures; on **Yearly**, click a bar or **Expand all** to open the funds of a year; on **Spending by** and **Medical**, choose rows and direction with the pill buttons, click a column heading to sort, and type in **Search rows** to filter.

---

## 10. Settings

Settings has ten tabs in two groups. **Ledger setup** holds the records everyone on the ledger shares. **Display** holds how the app looks. The tables show who can change each tab. On a wide screen the boxes in a tab sit side by side; on a phone they stack, one under the other.

### Ledger setup

| Tab | Who | What you can do |
| --- | --- | --- |
| **Funds** | Admin | Add or rename funds. Set the **kind** (general, reserved, custodial, investment or memo), **currency**, **Account** (the holder), the Reserved flag and **colour** (the dot in the Ledger). Disable a fund to hide it. |
| **Needs attention** | Things worth a look: entries still pending, past years that are still open (admins), and loans that are fully paid back but not settled yet (loan admins). It does not appear when there is nothing to show. | A short to-do list that finds itself |
| **Accounts** | Admin | The holders: the bank accounts, cash boxes and wallets your funds sit in. Each shows its **balance**. Disable a holder to hide it. |
| **Categories** | Admin | Add and rename categories. **System categories** cannot be renamed or deleted. |
| **People** | Admin, editor | Add and rename people. Give a person **aliases** (other spellings) so typing any of them finds the same person. |
| **Years** | Admin | **Check**, **Close** and **Reopen** years. The result of **Check** appears inside the year's card. See section 3. |
| **Data** | Everyone (CSV); admin (Excel, backup) | Download your data. See below. |
| **Ledger** | Admin | The name and base currency, the members, and deactivating the ledger (or, for a super administrator, reactivating it). See section 11 and section 13. |

### Display

| Tab | Who | What you can do |
| --- | --- | --- |
| **Appearance** | Admin sets the ledger default. Everyone sets their own. | The colour palette and the list layout. See **Appearance** below. |
| **Dashboard** | Everyone | How the Dashboard shows its amounts (List, Pie, Bars or Graph). See section 5. |

Notes:

- A fund's currency cannot change once it has entries.
- Currencies are picked from the list, not typed, on Funds, Accounts and the base currency. A currency that is switched off cannot be picked for a new fund, account or ledger (see Managing the currency list).
- A fund with money in it cannot be disabled. Move the money to another fund first.
- A category used by an entry cannot be deleted. System categories cannot be renamed or deleted at all.
- Disabled funds are hidden and cannot receive new entries.
- On the Funds, Accounts, Categories and People tabs, a small **Show disabled** switch at the top right of the list, beside the Add button (it appears only when something is disabled), is off by default, so only active rows show. Turn it on to see disabled rows too, greyed with a Disabled badge; press **Enable** on one to bring it back. The switch shows how many are disabled.

### Lists, cards and entry counts

**Funds**, **Accounts**, **Categories** and **People** show their records as **cards** (several per row, with the name as the card title and a round letter badge) or as a **table**. The list layout choice decides which (see **Appearance**). **Members** (Settings › Details), **Profit** rates and **Years** always use cards.

Each record in Funds, Accounts, Categories and People shows how many entries use it, across all years. Transfers count; deleted entries do not. Click the number to open the Ledger filtered to that record, for all years. An **Account** counts the entries of its funds. An account with no funds attached shows **No entries**, because entries belong to funds. The number is shown as plain text if you cannot open the Ledger.

### Page names

**Settings › Page names** (ledger admins) lets you rename the main pages: Ledger, Projects, Loans, Reports, Documents, Notebook and Item Vault. Type a name in a page's box and press **Save names**. The new name shows in the sidebar and as the page title, for everyone on this ledger. Leave a box empty, or press **Use default**, to go back to its default name, and **Reset all to defaults** clears every alias. Only the displayed names change; the pages, links and permissions are the same.

### Appearance

Appearance changes only how the app looks. It never changes any money. It has two parts:

- **Colour palette.** The accent colour of the app. There are 13: Forest (the default), Ocean, Indigo, Plum, Rose, Terracotta, Slate, Sky, Mint, Lavender, Coral, Sunshine and Blush.
- **List layout.** **Cards** or **Table**, for the Funds, Accounts, Categories and People lists.

There are two layers:

1. **Ledger default (admins).** In Settings › Appearance, an admin sets the palette and list layout for everyone on this ledger who has not made their own choice. The default is saved with the ledger, so everyone with the default sees the same look on any device.
2. **My appearance (everyone).** Each person can choose their own palette and list layout. Your own choice wins over the ledger default. It is saved for your account in this browser only, so on another device you see the ledger default again. Press **Use ledger default** to drop your own choice.

Anyone can change their own look from the **palette button** in the top bar, next to the sun and moon button. This works even for people who cannot open Settings. The panel has a **Use ledger defaults** button that drops your own choice.

Light and dark mode (the sun and moon button) and the Dashboard visuals are saved per browser. The ledger default does not change them.

### Data downloads

- **Entries (CSV)**: editors and admins can download it, limited to the pages the account may use. Choose one year or all years. Deleted rows are left out. Amounts are plain decimals with a **currency column**, so any spreadsheet program can open the file.
- **Excel** (admin): one sheet per year, plus a **Funds** summary sheet. Each amount comes with a **currency column**.
- **Backup (JSON)** (admin, limited to the account's pages): the whole book, including deleted rows, document details and which documents are linked to which entries (`entryDocuments`). The document files are not included.

Backups are also made for you every night. See the FAQ.

### The Ledger tab

- **Name** and **base currency**. Pick the base currency from the list. It can be changed only while the ledger has no entries.
- **Members**: add a person by their email and choose a role (viewer, editor or admin). Remove a member with **Remove**. See section 11.
- **Deactivate ledger** (admin): hides the ledger from everyone, including its members. Nothing is deleted and no data is lost. Type the ledger's name to confirm. Only a super administrator can bring it back.
- **Ledger is inactive** (super administrator): when a ledger is deactivated, this box shows that it is inactive, with a **Reactivate** button. Type the ledger's name to confirm. Members can see the ledger again straight away.
- A ledger that is deleted permanently is different: that is done by a super administrator from **Administration > All ledgers**, see section 13.

---

## 11. Users and roles

### Who can do what

| Action | Viewer | Editor | Admin | Super admin |
| --- | :-: | :-: | :-: | :-: |
| Read everything, open documents, download CSV | Yes | Yes | Yes | Yes |
| Add and change entries, transfers, people, projects, documents | | Yes | Yes | Yes |
| Manage funds, accounts, categories | | | Yes | Yes |
| Add and remove members, change roles | | | Yes | Yes |
| Close and reopen years | | | Yes | Yes |
| Download Excel and the full backup | | | Yes | Yes |
| See every ledger | | | | Yes |
| Create ledgers | | | | Yes |
| Deactivate a ledger (hidden, nothing deleted) | | | Yes | Yes |
| Enable a disabled ledger, or delete any ledger (with all its data) | | | | Yes |
| Create sign-in accounts | | | | Yes |
| Add, switch off, rename and delete currencies (Admin, Currencies) | | | | Yes |

### Who can see what

### Admin types

Everyone who signs in with an email and password is an **admin** of one of two types:

- **Super admin**: has everything. Every ledger, every loan and every page, so they need no specific access, and they are the only ones who can open **Admins** (create admins, access codes, all ledgers, currencies). Create ledgers, delete them, and manage other admins.
- **Normal admin**: has only what a super admin gives them, so you can make one admin manage one ledger and another admin manage several, or one admin manage a single loan and another all of them.

The sidebar has one **Administration** group with the sections **Access**, **Ledgers**, **Settings** and **Data**. A super admin sees them as one group (with Admins, currencies and all ledgers as well); a normal admin sees **Settings** with the same sections. A ledger **Admin** manages the access codes they own in **Settings > Access**.

Access for a normal admin is set in three places:

- **Ledgers**: a viewer, editor or admin role in each ledger they may use (a ledger they have no role in stays closed to them).
- **Loans**: a viewer, editor or admin role on each loan they may use.
- **Pages**: the pages they may open (Dashboard, Ledger, Reports, Item Vault, Projects, Documents, Notebook, Settings, Loans). Everything except the **Notebook** is on by default for a regular admin; switch the Notebook on for the ones who should have one. They then see the notebooks linked to ledgers they have a role in (a Viewer reads, an Editor or Admin changes).

A super administrator sets these on the **Admins** page. **Add admin** opens a dialog with a **Super admin** switch (on: nothing else to choose; off: pick ledgers, loans and pages). Each admin card shows its type and has:

1. **Edit ledgers**: the ledger roles.
2. **Edit loans**: the role on each loan (No access, Viewer, Editor or Admin).
3. **Edit pages**: which pages the admin may open.
4. **Make super admin** or **Make normal admin**: change the type. They are signed out and must sign in again. You cannot change your own type, and the last active super admin cannot be demoted.

**Loans and ledgers.** A loan can be linked to a ledger (the **Ledger** box in **New loan** and **Edit loan**; a new loan starts with the ledger that is open). The sidebar and the Loans page then show a loan only under its ledger. A loan with **No ledger** (all older ones until you link them) shows under every ledger. Linking only changes where the loan is listed; who may open it is still set per loan. If a ledger is deleted its loans are kept, unlinked.

The **Loans** page is new. Whoever creates a loan becomes its admin. A loan admin can change that loan, but cannot give another user access to it; only a super administrator can.

To let people who sign in with an **access code** read a loan, open the loan, press **Edit**, and switch on the codes under **Shared with access codes (view only)**. A code sees only the loans switched on for it. It can read the entries and totals, and it cannot add, change, settle or delete anything, or create a loan. The code also needs the **Loans** page turned on (Admin, Access codes). A loan admin can share their own loans this way; a super administrator can share any loan.

**An access code has an owner.** Each code belongs to an admin. By default it inherits that admin's pages; switch on **Own pages** for a ledger to give it a shorter list (never wider than the owner's), and it can inherit the owner's loans. For notebooks you can limit a code to **only** some notebooks or **all except** some. A super admin can press **Show code** to see a code again. Codes are always view only.

**Sharing a loan with several ledgers.** A loan has a main ledger and can be shown in other ledgers too. Everyone with a role there can read it, but only **Editor** or **Admin** in the main ledger (with the Loans page) can add or change anything; elsewhere the loan is view only. Moving the main ledger needs **Admin** in both ledgers. A loan in no ledger shows **All** on the badge. Each loan shows **Created by** and the times at the bottom of its card; one info line explains the page hints.

**Sharing an item.** The same rule applies to Item Vault items: shared into other ledgers they can be read there, but changing, deleting or moving them is done only in the main ledger (elsewhere the app answers that the main ledger owns it).

### Giving someone access (two steps)

There is **no in-app "invite" yet**. A new person needs an account first, then a role in the ledger.

1. **Super admin creates the account.** This is done from the command line today, with `warden account-create --email ... --name ...` (see OPERATIONS.md). The person gets a first password from the super admin.
2. **A ledger admin adds the person.** Go to **Settings › Members**, type the person's email, choose **viewer**, **editor** or **admin**, and press **Add**. They can now sign in and see that ledger.

To change a role, change it in the Members list. To remove access, press **Remove** and confirm in the box that opens. An admin cannot change their own role; another admin must do it.

### Signing in and out

1. Enter your email and password and sign in.
2. To leave, open the account menu and choose **Sign out**.
3. After **5 wrong passwords**, sign-in is blocked for **15 minutes**. Wait, then try again.

### Resetting a password

There is no "forgot password" link. Ask your super admin, who runs `warden account-reset-password` (see OPERATIONS.md) and gives you a new password. Passwords must be at least 6 characters.

---

## 12. Loans

A loan records money one person borrowed from another, for example a loan from a relative. It is separate from the ledgers: it has no funds and does not change any ledger balance. You need the **Loans** page to use it (section 11).

Each loan has a name, the **borrower** (who took the loan), the **lender** (who gave it), an optional description and a currency picked from the list (PKR by default). Every amount shows its currency code.

**Several lenders in one loan.** For example, Ben borrowed 3,000,000: 2,000,000 from Lender A and 1,000,000 from Lender B. Create one loan with the lender **Lender A & Lender B** and the borrower **Ben**. Then record each amount with its lender: **Add entry**, leave the switch off (loan taken), choose **Lender A** under "Lender who gave the money" and enter 2,000,000; add another for **Lender B** with 1,000,000. When Ben pays money back, add an entry with the switch on (loan returned) and choose **which lender is being repaid**; that lender is recorded as the one who received the money, so there is no separate Receiver box on a repayment. The loan page shows a **By lender** block: for each person, how much they gave, how much was paid back to them and how much is **still owed** to them. The cards at the top still show the totals for the whole loan. Entries made before this feature, or on a loan with one lender, show as "Not assigned" in that block if lenders are used.

Every loan page has the same layout. At the top, one card holds the name, who lent to whom, the description and the buttons. Below it, the left side has one tidy toolbar (a search box, the All, Taken and Returned switch, a **Dates** button that opens the From and To dates, and **Add entry**) above the list of entries. The right side (above the list on a phone) is a **Summary** box with **Total taken**, **Total returned** and **Remaining balance**. When the loan has several lenders, the same box continues with **By lender**: one tile per person with how much is still owed to them, how much they gave and how much was paid back. **Click a lender** to see only their entries, and click again or press **Show all** to go back. The entries are listed like ledger entries: date, comment, a Taken or Returned label with the lender and receiver, and the amount on the right. Click an entry to edit it.

The borrower and the lender can each be several people. Pick a name from the list, or type a new one and press Enter or a comma: each name becomes a small chip, and the loan shows them joined, for example **Lender A & Lender B → Ben**. Press the × on a chip to remove it. Names you used on other loans are suggested one by one. The names are saved as one piece of text (up to 120 characters in total), so a loan still has one balance, not one per person.

Access to a loan is a **viewer**, **editor** or **admin** role. Viewers read the loan. Editors add and change entries. Admins also change the loan and delete it.

### Creating a loan

1. Find **Loans** in the sidebar under **Money**. Open the **Loans** page and press **New loan**. The small arrow beside Loans in the sidebar lists your open loans for a quick jump.
2. Enter the name, the borrower and the lender. Add a description or choose a currency if needed.
3. Press **Save**. You become the admin of the loan.

### Adding entries

A loan has two kinds of entry:

- **Loan taken**: money the borrower received. It increases what is owed.
- **Loan returned**: money the borrower paid back. It reduces what is owed.

To add one, open the loan and press **Add entry**. Use the **Loan returned** switch at the top: off means loan taken, on means loan returned, then enter the date (today by default) and the amount. **Receiver** follows the choice: the borrower for a loan taken, the lender for a loan returned. Type or pick another name if someone else received the money. Add a comment if you want, then press **Save**.

### The three numbers

At the top of a loan:

- **Total taken**: all the Loan taken entries added together.
- **Total returned**: all the Loan returned entries added together.
- **Remaining balance**: Total taken minus Total returned. This is what is still owed.

If more has been returned than was taken, the balance is labelled **Overpaid by** and shows the extra amount. It is shown on purpose, so an overpayment is not hidden. Check the entries if you see it.

### Editing and deleting an entry

Press **Edit** on an entry, change what is needed and press **Save**. To remove it, press **Delete** and confirm. A deleted entry leaves the three numbers. It is hidden, not erased.

### Editing and deleting a loan

A loan admin can press **Edit loan** to change its name, borrower, lender or description. The currency can be changed only while the loan has no entries.

**Mark as settled** (loan admins) closes a loan once everything is paid back. It is available when the loan has entries and the remaining balance is exactly zero. A settled loan shows a Settled badge, its entries become read only (no add, edit or delete), and it leaves the sidebar list. On the Loans page, turn on the small **Show settled** switch beside New loan to see settled loans again. Open one and press **Reopen loan** to continue adding entries.

**Delete loan** is for loan admins. It is greyed out while the loan has entries. Delete each entry first, then press **Delete loan** and confirm. This cannot be undone.

---

## 13. Creating a new ledger

A new ledger is a separate book, for example one for Company X. Each book has its own funds, people, categories, projects, entries and documents. Nothing is shared between books, and roles are set per book.

### Steps (super administrator)

1. Open the ledger switcher at the top of the sidebar and choose **New ledger**.
2. Enter a name and pick a base currency from the list (for example SEK for a Swedish company). The list starts on the install's default currency (`DEFAULT_CURRENCY`, USD unless the administrator set another).
3. Press **Create ledger**.
4. Use the top bar to switch to it.
5. Add its members in **Settings › Members** (section 11).

### What it starts with

- one fund named **General** in the base currency;
- one account (holder) named **Cash**;
- 20 default categories, which you can rename (except system categories).

Then add your own funds and accounts in Settings.

### Deactivating, reactivating and deleting a ledger

Administration › All ledgers shows every ledger as a card with **Open**, **Edit** (a dialog on the same page: name, base currency and the ledger's members), **Disable** (or **Enable** when it is off) and **Delete**.

1. **Deactivate** (an admin, from **Settings › Details**). Press **Deactivate ledger**, type the ledger's name and confirm. The ledger disappears for everyone, including its members. Nothing is deleted.
2. **Enable** (a super administrator only; the Settings box calls it Reactivate). The deactivated ledger stays visible to super administrators, marked **Inactive**. Open **Settings › Details** (it shows "Ledger is inactive" and a **Reactivate** button) or **Administration › All ledgers**. Type the name and confirm. Everything comes back as it was.
3. **Delete** (a super administrator only, from **Administration › All ledgers**). It works on any ledger, active or not, and removes the ledger with all its entries, documents (and their files), projects, funds, people, diary notes and settings. Type the name and confirm. This cannot be undone, so take a backup first. To hide a ledger without losing anything, use **Disable**.

**Disable** takes the ledger out of the side panel and away from its members. **Enable** brings it back.

---

## 14. Using it on a phone

The app works in a phone browser, with the same data and the same roles.

- Tables become **cards**, one per entry or project, so you can read each row without scrolling sideways.
- The **summary** is a bar at the bottom. Tap it to open the details.
- **Filters** open as sheets that slide up from the bottom.

---

## 15. Coming from a spreadsheet

If you kept your money in a spreadsheet, create your funds and categories in **Settings**, then add your entries one by one or with bulk actions. Use the year chips and the Summary instead of one sheet per year.

---

## 16. Messages you may see

| Message | What it means | What to do |
| --- | --- | --- |
| **403** "Your account cannot do this for this book" | Your role does not allow this action. | Ask an admin or editor. |
| **403** "Only a super administrator can do this" | You tried to create, reactivate or delete a ledger, or manage sign-in accounts. | Ask a super administrator. |
| **423** "This ledger is deactivated. A super administrator can reactivate it." | The ledger has been deactivated, so you cannot open it. Nothing is lost. | Ask a super administrator to reactivate it. |
| **"Could not load your books."** (the top bar or page shows it after an update) | The new version of the app expects a database change that has not been applied yet, so it cannot read the ledgers. | Ask the person who runs the Ledger to apply the latest database update, then reload the page. Nothing is lost. |
| **409** "delete and recreate" | You tried to change a transfer beyond its date, comment or amount. | Delete both rows, then enter the transfer again. |
| **409** "Fund still has a balance; move it to another fund before archiving" | You tried to archive a fund with money in it. | Move the money to another fund first. |
| **409** "Cannot change the currency of a fund that has entries" | A fund's currency is locked once it is used. | Create a new fund in the other currency. |
| **400** "Unknown or disabled currency XYZ. Add or enable it under Admin, Currencies." | The currency is not on the list, or it is switched off, so it cannot be used for a new ledger, fund, account or loan. | Ask a super administrator to add it or switch it on under Admin, Currencies. |
| **409** "Cannot delete XYZ: it is used by ..." | You tried to delete a currency that a ledger, fund, account, loan or entry still uses. | Switch it off instead. |
| **409** "Category is used by entries" | You tried to delete a category that entries use. | Move those entries to another category, or keep the category. |
| **409** "Cannot change the base currency of a book that has entries" | The ledger has entries, so its base currency is locked. | Keep the current currency. |
| **400** "Type the ledger name to confirm the delete." | The name typed in the delete box did not match. | Type the ledger name exactly. |
| **409** "Project has entries" | You tried to delete a project that has entries. | Close the project instead. |
| **409** "Year already closed" | You tried to close a year that is already closed. | Nothing to do. Check Settings › Years. |
| **409** "Name already exists" | Another row has that name. | Pick a different name. |
| **409** "A book with this id already exists" | The name you chose for a new ledger is already in use. | Pick a different name. |
| **409** "You cannot change your own role" | An admin tried to change their own role. | Ask another admin. |
| **409** "Already a member of this book" | The person is already a member. | Change their role instead. |
| **413** "File is too large (max 10 MB)." | The file is over 10 MB. | Make the file smaller. |
| **415** "Unsupported file type (allowed: pdf, jpeg, png, webp, heic)" | The file type is not accepted. | Save or convert the file to one of the allowed types. |
| **423** "year closed" | The entry's date is in a closed year. | Ask an admin to reopen the year. |
| **"Fund is archived"** | You tried to add an entry to an archived fund. | Enable the fund in Settings › Funds, or pick another fund. |
| **"System category"** | You tried to rename or delete a category the app depends on. | Use it as it is, or add your own category. |
| "Enter a valid amount greater than zero. **Use . for decimals.**" | The amount is empty, zero, negative or uses a comma as the decimal mark. | Type it like 1500.50. |
| Amount or date **out of range** | The amount is too large, or the date is not a real or allowed date. | Check the numbers and the date. |
| **"Closing not shown: ..."** | The Ledger cannot give a correct Closing figure for these filters. | See section 7. Clear the narrowing filters or pick consecutive years. |
| "Choose funds with different currencies." | A conversion needs two funds in different currencies. | Pick a fund in another currency. |
| **"Discard your changes?"** (a box from your browser) | You clicked outside a form you had already changed. This is the only confirmation that is not drawn inside the app. | Press **OK** to discard the changes, or **Cancel** to keep editing. |

---

## 17. FAQ

### Do I need to carry the balance to next year?

No. Entries sit on one timeline, and a fund's balance is everything before a given date. Add entries with new dates and the balance carries on. To see last year's balance as opening rows, turn on **Include previous balance** in the Ledger.

### Why don't memo funds count?

Memo funds are money you track for information only. They are never part of your money, so they are left out of Total and Usable. They appear in their own Memo section on the Dashboard, and in the Ledger only when you tick **Show memo funds**.

### Why is a project's total also in my fund?

A project is a tag on ordinary entries, and each project has a fund. Its entries are saved in that fund, so they are already part of the fund's balance. The project total is a view of those entries, not an extra amount on top.

### Can I undo a year close?

Yes. An admin can **reopen** the year in Settings › Years. Make the changes you need, then close the year again. Reopening does not delete anything.

### Where are backups?

The app makes a backup every night at 02:00 UTC and stores it in private cloud storage. The newest 30 backups for each book are kept, and you do not need to do anything. To keep your own copy, an admin can download the full **Backup (JSON)** from Settings › Data at any time.

### How do I add someone new?

A super admin creates their sign-in account from the command line, then a ledger admin adds them by email in **Settings › Members** with a role. See section 11.

### I forgot my password. What now?

Ask your super admin to reset it. After 5 wrong tries, sign-in is blocked for 15 minutes.

### Why does the Ledger show all years when I pick a project?

A project often runs across several years, so picking one switches to **All years** so nothing is hidden. Click a year chip to narrow it again.

### Why is "Closing" missing in the summary?

You have filters on that narrow the rows but not the opening balance, or you picked years that are not consecutive. Clear those filters. See section 7.

### Which funds are in which account?

See **Accounts** on the Dashboard. To move a fund to another account, edit it in **Settings › Funds** and change **Account**.

### Why can't I see one of my ledgers?

It has probably been deactivated. Nothing is deleted, but the ledger is hidden from everyone except super administrators. Ask a super administrator to reactivate it (section 13).

### Why is there a red LOCAL label on the screen?

You are using a test copy of the app on a computer (a `localhost` or `.test` address), not the live ledger. Changes made there do not go to the live ledger. The label is faint and only appears on those test addresses.


### Two-way switches

Where a choice has just two sides, the app uses the same boxed switch as **Count in ledger totals** (a fixed name, a hint that explains what On and Off mean, and a switch on the right; the text never changes when you flip it) instead of big buttons or a drop-down: **Credit** (on) or debit (off) when adding or editing an entry (in the ledger, quick add and project entries, and the default direction of a category), and **Loan returned** (on) or loan taken (off) on a loan entry. Click the switch to change sides.

### Amount boxes

When you type an amount (a ledger entry, a loan entry, a unit price, a project budget), it is tidied with commas as soon as you leave the box, for example 1500.5 becomes 1,500.50. Click the box again and it goes back to plain numbers so you can edit it. Percentages and quantities are not changed.
