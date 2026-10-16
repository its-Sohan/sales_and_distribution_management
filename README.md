# Hisab — shop counter

A React and TypeScript point-of-sale application backed by a Cloudflare Worker and D1. Shop records and terminal drafts are stored in D1. The browser holds the loaded workspace in memory and saves each change directly through the Worker API.

## Run

```sh
npm install
npm run build
npm run db:migrate:local
wrangler dev
```

Open the Worker development URL, usually `http://localhost:8787`. For frontend hot reload, keep the Worker running and run `npm run dev` in another terminal. Vite proxies `/api` to port 8787. A standalone static preview does not supply the backend.

A fresh database starts with no products, customers, or draft bill lines. Catalogs are loaded exclusively from D1 in development and production; no environment flag enables a sample catalog. For deliberate local testing only, `npm run db:seed:local` inserts synthetic records into local D1. Keep `--persist-to` the same for migration, seeding, and `wrangler dev` when using a custom directory. If an older installed Wrangler rejects the project compatibility date, update Wrangler or use `wrangler dev --compatibility-date 2026-09-04` for local testing.

## Data and checkout

- Sign in with user ID `admin` and password `admin?6767`. Sign out from the sidebar. Sessions last 24 hours and survive page reloads; shop APIs require a valid server session.

- Products, customers, sales, payments, purchases, expenses, stock adjustments, and returns are read from the backend.
- Draft bill lines, discounts, and customer selection are stored in D1 per terminal number. Assign a different terminal number to each register in Settings. Reloading retrieves that terminal's draft.
- Every action waits for backend confirmation. Checkout commits the sale and clears the draft together, then displays the confirmed receipt. A failed request does not report success.
- Writes use a workspace revision. Stale terminals receive a conflict, refresh their data, and require the cashier to review it before trying again.
- If a response is interrupted, refresh the backend records before another write. This prevents retrying an action that may already have committed.
- Idle visible terminals refresh every 30 seconds, on reconnection, and when returning to the tab. Settings also provides Refresh data.
- An internet connection is required. Language, theme, and terminal number are the only browser preferences retained.
- On launch, the app erases the previous browser database without transferring its records, as requested. Records that reached D1 remain available. Old tabs holding the database open must be closed before cleanup can finish. The old application cache is retired too.

## Features

- Find bill on Counter searches all saved bills by number, customer, phone, or item, with receipt printing and returns. Back to bills keeps the current search.
- New item defines an exact product code, brand/model, or variant without adding stock. Add stock selects a pending supplier invoice and carries its quantities and costs forward. Receiving can create missing products inline, split invoice lines across brands, and accept partial deliveries; services have an explicit Edit service action.
- Keyboard product entry, search by code or name, quantities, discounts, cash change, customer dues, and cash/mobile/bank method recording.
- Product variants and services, purchasing and restocking, purchase voids with reasons, and stock corrections.
- Suppliers: searchable profiles, multi-item invoices, partial payments, bill-linked repayments, and confirmed balances. New invoices do not change stock; awaiting, partial, and complete receiving states are tracked separately. Receipt PDFs and images can be attached (up to 1 MB each). Products can be purchased from any supplier; fully paid one-time purchases need no saved supplier. Supplier details can be edited or archived without losing history.
- Historical purchase settlement is explicitly reviewed and linked; unknown old payments do not create guessed supplier dues or definitive cash totals. Purchase value and dated cash payments are separate in Reports and overview downloads. Paid purchase voids require an explicit full refund in the same atomic save.
- Customer balances, repayments, expenses with backend deletion and undo, and bill-linked returns and exchanges.
- Reports using Asia/Dhaka dates, JSON and CSV exports, and A4 receipt printing in English and Bangla.
- Light and dark themes and responsive layouts.

| Key | Action |
| --- | --- |
| F2 | Focus product search |
| ↑ / ↓ | Move through products or the focused bill |
| Enter | Select a product or confirm the focused form |
| + | Open payment |
| Alt+B | Focus the bill |
| Alt+C | Choose a customer |
| Escape | Close the current dialog |
| ? | Show shortcuts |

## Verification

```sh
npm test
npm run check:worker
npm run build
```

Tests cover money and quantity rules, reports, receipt formatting, backend draft persistence, cross-terminal reads, expense deletion and undo, stale revisions and concurrent writes, complete rollback on invalid inputs or SQL failure, interrupted acknowledgments, returns and historical prices, and retirement of browser storage.

After building, `npm run test:pricing-ui` checks sale pricing in Chrome, and `npm run test:web-ui` exercises the production build with an isolated in-memory API. The latter checks loading, refresh/write races, Undo, keyboard focus, dialogs, printing, exports, mobile layout, and CSP. Both require Chrome (`CHROME_BIN` can override its path); neither connects to the shop database.

Historical accounting repair tests also cover the pre-Taka backup, mixed currency payloads, exact remaining inventory values, successive returns, signed inventory losses, ambiguous records, and guarded/idempotent repair application.

## Deployment

`npm run deploy` tests, checks Worker types, builds the frontend, applies remote D1 migrations, and deploys the Worker. Existing shops must review the historical accounting repair workflow before this release; migration 0009 adds valuation and quarantine metadata but does not divide historical JSON automatically. See [deployment.md](deployment.md) for the API, repair commands, and deployment details.

Migration `0012_admin_sessions.sql` adds server sessions and login attempt limits. Apply it before running this version. Session tokens use HttpOnly cookies, and only their hashes are stored in D1. Payment methods record bookkeeping entries; they do not process payments.


npm install
npm run build
npm run db:migrate:local
Then, whenever you want to test, start the backend in terminal 1:
wrangler dev --port 8787

Start the frontend in terminal 2:
npm run dev

## Invoice and stock workflow

1. Record the supplier invoice with its original descriptions, quantities, costs, payment, and optional receipt files. The invoice increases purchase totals and supplier due, but not stock.
2. Choose Receive stock on the invoice or Add stock in Stock. Match each invoice line to an exact product code, or create the brand/model inline. Split mixed-brand lines into separate products and receive only the delivered quantity.
3. Costs carry forward automatically. When brands have different prices, allocate their costs explicitly; the remaining quantity must receive the exact remaining invoice value. Confirmed receiving changes stock without creating another invoice or supplier payment.

Earlier combined purchase/stock entries remain already received. New item now creates catalog details only. Receiving records are immutable, quantity/cost capped, and protected by the same atomic revision checks as other writes. Invoice/receiving drafts keep their IDs across uncertain acknowledgments to avoid saving the same action twice. Stock history lists receiving batches, while Suppliers retains the original invoice and all associated batches.
