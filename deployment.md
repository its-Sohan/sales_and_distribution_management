# Cloudflare deployment and backend architecture

The browser calls a same-origin Cloudflare Worker API. The Worker accesses `mayer-dowa-telecom-database-main` through its `DB` binding. D1 is the authoritative storage for shop records and terminal drafts.

```text
Browser → /api/workspace → Cloudflare Worker → D1
Browser → static assets  → Cloudflare Workers Static Assets
```

## Workspace API

| Method | Endpoint | Behavior |
| --- | --- | --- |
| POST | `/api/auth/login` | Accepts `{ username, password }`; `admin` / `admin?6767` creates a 24-hour HttpOnly session cookie. |
| GET | `/api/auth/session` | Returns the current authenticated state without shop data. |
| POST | `/api/auth/logout` | Revokes the session and clears the cookie. |
| GET | `/api/workspace?terminalId=1` | Returns `{ ok, revision, state }` from D1, including the selected terminal's draft. |
| GET | `/api/workspace/revision` | Authenticated, uncached `{ ok: true, revision }` check without loading shop history. |
| POST | `/api/workspace` | Validates and commits one operation, then returns the confirmed workspace. |
| GET | `/api/health` | Checks required tables; returns 503 if migrations are incomplete. |
| GET | `/api/reports/summary` | Aggregates receipt totals in D1. |

A write supplies `expectedRevision`, `terminalId`, changed records, and an optional `draft` containing `lines`, `discount`, and `customerId`. Expense removals supply `deletedExpenses`; purchase voids supply `purchaseVoids`. Unchanged catalog records and full workspace snapshots are not uploaded.

Workspace and report endpoints require a valid `hisab_session` cookie and return HTTP 401 without one. Authentication endpoints and health remain available before login. Cross-origin writes are rejected. Login is limited to 10 attempts per IP in a 15-minute window. Migration `0012_admin_sessions.sql` stores token hashes, expiry times, and attempt counters; it does not change shop records. Cookies use `Secure` on HTTPS and `SameSite=Strict`; credentials and tokens are never saved in browser storage.

The Worker validates each record and recalculates receipt totals, purchase totals, refunds, exchanges, and credit spending. Any rejected item rejects the complete operation with HTTP 422. Invalid request structure returns HTTP 400. The revision guard, financial writes, draft update, and returned state all execute in one D1 batch transaction. A stale revision returns HTTP 409 and cannot overwrite newer data.

Reads return the complete authoritative state, so deleted expenses disappear from every terminal after refresh. Historical receipt prices and costs come from the stored sale. Financial API responses use `Cache-Control: no-store`.

Automatic refresh checks the revision before downloading a workspace. Background reads preserve focus and input, are cancelled before writes or explicit refreshes, and cannot replace a newer confirmed workspace. Initial loads, terminal switches, conflict recovery, and manual refresh still read the full state. History pagination and incremental synchronization are not implemented.

Static responses use a same-origin Content Security Policy with framing disabled; fonts are bundled locally. Inline styles remain allowed for React styling, while inline and external scripts are blocked in production. API responses also disable framing and resource loading. Vite preview mirrors production static headers; the development server additionally permits its inline refresh script and local WebSocket connection.

## Database

Apply every migration in `migrations/` in order. `0006_backend_workspace.sql` adds:

- `app_revision`: one revision used to guard workspace writes.
- `terminal_drafts`: draft bills keyed by terminal number (1–999).

Existing financial tables and records are retained. The earlier `shop_workspace` table is no longer read or written. Historical migration filenames and timestamp columns are retained for compatibility with deployed databases.

`0009_accounting_integrity.sql` adds current inventory book value and provenance, signed adjustment costs, per-record quarantine, repair audit records, and an informational repair checkpoint. `pending` does not block an empty new shop. Unresolved historical records and unverified nonempty inventory require review before affected financial operations. Customer due limits are removed from application behavior; existing legacy database columns and archived snapshots remain compatible.

## Historical accounting repair

Migration 0008 converted scalar amounts from poisha to whole Taka without converting receipt, purchase, and return JSON. Do not rerun it or divide every record: old and new payloads can coexist. The offline repair tool never connects to D1 and never changes its input database. It requires migration 0008 in the exported migration history and prepares migration 0009 only inside its local review copy.

Obtain a current SQL export and preserve an independent backup before rollout. Review locally:

```sh
node scripts/accountingRepair.mjs --export current-export.sql --backup backup_before_taka_migration.sql --out accounting-review
```

Use `--database local-copy.sqlite` instead of `--export` for an existing local SQLite copy. The tool writes `accounting-review.json` with every classification, before/after row, provenance, and unresolved record, plus `accounting-review.sql`. Exact pre-0008 backup matches or uniquely consistent payload/header amounts establish units. Payload shape, amount size, and timestamps alone do not. Existing scalar money and historical sale unit prices stay authoritative; only proven poisha JSON is normalized. Existing receipt accounting identities and normalized line/settlement sums must agree. Ambiguous or inconsistent rows are quarantined for explicit reconciliation rather than silently rounded or repriced.

For products with historical stock movements, supply a confirmed opening quantity and total book value. Quantity uses the app's scale (1000 equals one unit); `inventoryValue` is whole Taka. The quantity must equal the catalog stock baseline minus recorded unvoided purchases. An optional `asOf` must precede every movement being replayed. For example, `opening-values.json`:

```json
[
  { "productId": "confirmed-product-id", "quantity": 2000, "inventoryValue": 480, "source": "Opening count and supplier invoice", "asOf": "2026-10-01T00:00:00Z" }
]
```

```sh
node scripts/accountingRepair.mjs --export current-export.sql --backup backup_before_taka_migration.sql --opening-values opening-values.json --out accounting-review
```

Complete recorded purchases with zero opening quantity can prove valuation directly. A catalog opening with explicit cost and no stock movements is recorded as `provided`. Otherwise, the tool marks inventory and historical cost snapshots unverified. With proven opening/history, replay uses exact remaining inventory value, repairs extended sale/return/adjustment costs, and assigns rounding remainders cumulatively. Historical voids after consumption, negative stock, missing costs, and ambiguous event ordering require reconciliation.

Apply a reviewed manifest only to a new local output copy for verification:

```sh
node scripts/accountingRepair.mjs --export current-export.sql --backup backup_before_taka_migration.sql --opening-values opening-values.json --out accounting-review --apply --output-db reviewed-copy.sqlite
```

Re-run against the repaired copy and confirm that it proposes no further changes. Preserve the manifest and original backup. For remote rollout, apply migration 0009 first, pause shop writes, obtain a fresh export/revision, regenerate and review the manifest, then submit **all** generated SQL statements together through a single transactional `D1Database.batch`. Do not run the patch statements individually or use an unreviewed export. The patch guards both revision and original rows; stale data aborts the whole operation. It saves before/after repair records and leaves unresolved entities quarantined. This repository's repair command intentionally performs no remote mutation.

After rollout, verify historic receipt totals and refunds, affected customer balances, inventory quantities/book values, and the remaining quarantine list before resuming affected operations. The unused `shop_workspace` archive is retained without automatic rewriting.

## Browser storage retirement

`src/browserCleanup.ts` deletes the old `hisab-counter` database without reading or transferring its records. This cleanup runs before loading the workspace. If another tab blocks deletion, the app asks the user to close it. Only language, theme, and terminal number remain in browser preferences.

`public/sw.js` is a retirement script for previously installed application caches. It deletes this app's caches, unregisters itself, and reloads controlled tabs. The application does not register a new service worker.

## Development

```sh
npm install
npm run build
wrangler d1 migrations apply mayer-dowa-telecom-database-main --local
wrangler dev
```

This SQLite emulation is backend development storage. Open `http://localhost:8787`. Run `npm run dev` alongside the Worker for frontend hot reload; Vite proxies API calls to port 8787.

## Production

Authenticate Wrangler, then run:

```sh
npm run deploy
```

This command tests, checks Worker types, builds assets, applies remote migrations, and deploys. The new migration must run before the frontend is published. Verify `/api/health` returns HTTP 200, sign in, and verify `/api/workspace?terminalId=1` returns HTTP 200 JSON with the session cookie. Without a session, it must return HTTP 401.

`wrangler.jsonc` sends `/api/*` to the Worker before the SPA fallback. All registers share one shop database and use the admin sign-in described above.

- Worker: `mayer-dowa-telecom`
- D1: `mayer-dowa-telecom-database-main`
- Deployment URL: `https://mayer-dowa-telecom.stathammurphy141.workers.dev`


## Supplier ledger (migration 0010)

Apply `0010_suppliers.sql` before serving the new frontend/Worker. It adds `suppliers`, `supplier_payments`, and `purchase_settlements` without modifying historical purchases. Workspace reads return `suppliers`, `supplierPayments`, and `purchaseSettlements`; writes accept their changed records using the existing revision guard.

New purchases store `supplierId` (optional), `paid` (initial whole-Taka amount), `method`, and optional `invoiceNumber` inside their immutable payload. Stock-only products can start at zero. Existing older clients that omit `paid` create unreconciled legacy entries rather than inferred debt. New supplier-linked purchases must supply settlement; partial payment requires an active saved supplier. Suppliers may be archived, but their outstanding bills remain repayable.

Supplier payments are immutable, linked to a purchase, limited to its remaining balance, and retain their payment date. A paid purchase may be voided only with an explicit full refund (type `refund`, method, and reason) in the same atomic mutation; existing stock-consumption restrictions still apply. Refunds do not erase earlier cash payments.

An unreconciled historical purchase can receive one immutable settlement review (`purchaseId`, optional `supplierId`, `paid`, `method`, review `createdAt`, and required `note`). The reviewed `paid` amount is the payment on the original purchase date; subsequent repayments must be recorded separately. Reviews never add stock. Unknown settlement suppresses definitive cash totals for that purchase period; legacy entries remain visible for review in Suppliers.


## Invoice receiving (migration 0011)

Apply `0011_invoice_receiving.sql` after migration 0010. No remote command is needed for local testing. Existing combined purchases retain their original inventory effects; no data is converted or stocked again.

New purchase payloads use `mode: "invoice"`, empty `lines`, and immutable `invoiceLines` (`id`, `description`, `unit`, scaled `quantity`, whole-Taka `total`). The server derives invoice totals and retains supplier payment rules. Recording an invoice never moves inventory.

Workspace `stockReceivings` holds immutable batches (`id`, `purchaseId`, `createdAt`, optional `note`, and line requests containing `invoiceLineId`, exact `productId`, and scaled `quantity`). An optional `allocatedCost` supports differing brand costs. The server derives line totals and unit costs, caps cumulative quantities/costs, matches units, and assigns the exact cost remainder to the final quantity. Client-supplied derived totals are ignored. Products need unique codes and established stock units cannot be changed. A receiving batch, new SKU, and related writes commit or roll back together.

Invoice voids reverse only confirmed receiving, retain batch/payment history, and still reject removal of consumed stock. Paid invoice voids require a full explicit refund. Reports distinguish purchase value, actual payments, and invoice value awaiting stock. The historical accounting repair reads receiving events for stock valuation and treats invoice descriptions as financial lines rather than stock movements.
