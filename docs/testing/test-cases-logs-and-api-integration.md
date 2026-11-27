# Test Cases, Test Logs and API Integration: Gunita Kopi POS

| | |
|---|---|
| Version tested | `main` after pull request #7 (commit `43a4c13`), 2026-11-25 |
| Live system | https://gunitakopi.vercel.app (`/admin` Owner, `/staff` Barista POS) on Vercel, Supabase project `gunita-kopi-pos-prod` |
| Automated tests | Vitest, 616 tests in 7 areas; SQL tests on PostgreSQL 15 |
| Full API reference | [docs/api.md](../api.md) |

Contents: [1. How we test](#1-how-we-test) · [2. Test cases](#2-test-cases) ·
[3. Test logs](#3-test-logs) · [4. Known issues](#4-known-issues) ·
[5. API integration](#5-api-integration)

---

## 1. How we test

| Level | What it covers | Tool | Where | When it runs |
|---|---|---|---|---|
| Unit and component | Business rules (cart, costing, stock status), screens, forms, offline queue | Vitest + Testing Library | `tests/contracts`, `tests/owner`, `tests/staff`, `tests/ui`, `tests/mocks` | Every pull request (GitHub Actions) and locally |
| API integration | Every route: sign-in, roles, validation, error codes, checkout, sync | Vitest, Supabase mocked | `tests/server`, `tests/auth` | Every pull request and locally |
| Database rules | Row-level security, checkout function, stock trigger, soft deletes | SQL scripts on PostgreSQL 15 | `supabase/tests/*.test.sql` | Pull requests that change the database |
| Live acceptance | Real screens and data on the deployed site | Browser (Microsoft Edge) | gunitakopi.vercel.app | After each release |

Automated tests per area (2026-11-25):

| Area | Tests | Examples |
|---|---|---|
| server (API) | 181 | `phase2-api.test.ts` (81), `owner-email.test.ts` (52), `auth.test.ts` (10) |
| staff (POS) | 122 | `pos-menu`, `checkout`, `sync`, `use-sync`, `api-mappers`, `login` |
| owner (Admin) | 103 | `login`, `inventory-delete`, `suppliers-page`, `users-page`, `recipe-costing` |
| mocks (demo data) | 63 | orders, stock, reports, sync |
| ui (shared screens) | 55 | `shell`, `components`, `overlays` |
| contracts (rules) | 53 | cart, catalog, costing, stock, users |
| auth (sessions) | 39 | `session.test.ts` (28) |
| **Total** | **616** | |

---

## 2. Test cases

Status: **Pass** = verified; **Known issue** = see [section 4](#4-known-issues).
Evidence: an automated test file, or **Live** (checked on the deployed site on the date shown).

### 2.1 Sign-in and access

| ID | Test case | Steps | Expected result | Status | Evidence |
|---|---|---|---|---|---|
| TC-A01 | Barista signs in | Open `/staff/login`, enter a barista username and password | POS menu opens | Pass | `tests/staff/login.test.tsx`; Live 2026-11-25 |
| TC-A02 | Wrong password | Enter a wrong password | "Incorrect username or password." Stays on sign-in | Pass | `tests/ui/shell.test.tsx`, `tests/owner/login.test.tsx` |
| TC-A03 | Barista uses the Owner portal | Sign in at `/admin/login` with a barista account | Wrong-portal message, no access | Pass | `tests/owner/login.test.tsx` |
| TC-A04 | Owner 2-step sign-in | Owner signs in, then enters the 6-digit email code | Admin opens only after a correct code | Pass | `tests/owner/login-otp.test.tsx`, `tests/server/owner-email.test.ts` |
| TC-A05 | Too many failed sign-ins | Repeat wrong passwords | Sign-in temporarily blocked | Pass | `tests/server/owner-email.test.ts` |
| TC-A06 | Deactivated account | Owner deactivates a barista, barista signs in | Refused (403) | Pass | `tests/server/auth.test.ts` |
| TC-A07 | API without sign-in | Call an API with no session | 401, no data | Pass | `tests/server/phase2-api.test.ts`, `tests/auth/session.test.ts` |
| TC-A08 | Barista calls an Owner API | Barista calls e.g. `DELETE /api/suppliers/6` | 403, database not touched | Pass | `tests/server/phase2-api.test.ts`, `tests/server/auth.test.ts` |
| TC-A09 | Owner idle sign-out | Leave Admin idle 30 minutes | "Still there?" countdown, then signed out | Pass | `tests/owner/shell.test.tsx` |
| TC-A10 | POS has no idle sign-out | Leave POS idle | Barista stays signed in until Log out | Pass | `tests/staff/shell.test.tsx` |

### 2.2 POS ordering and checkout

| ID | Test case | Steps | Expected result | Status | Evidence |
|---|---|---|---|---|---|
| TC-P01 | Menu loads | Open the POS | Products with names, descriptions and prices by category | Pass | `tests/staff/pos-menu.test.tsx`; Live 2026-11-25 |
| TC-P02 | Search and category filter | Type "ube"; tap a category tab | Only matching products show | Pass | `tests/staff/pos-menu.test.tsx` |
| TC-P03 | Out-of-stock product is blocked | An ingredient in the product's recipe is below what one serving needs | Tile shows "Out of stock", cannot be added | Pass | `tests/staff/api-mappers.test.ts`; Live 2026-11-25 (76/76 blocked at zero stock) |
| TC-P04 | Customize and add-ons | Add a drink, choose sugar level and an add-on | Line price includes the add-on (e.g. ₱99 + ₱25) | Pass | `tests/staff/customize-real.test.tsx`; Live order #11 |
| TC-P05 | Payment validation | Confirm with empty, non-numeric or too-low cash | Refused with a message; change shown for a valid amount | Pass | `tests/staff/checkout.test.tsx` |
| TC-P06 | Online checkout | Charge, pay, confirm | Order saved once, receipt with queue number, stock taken off | Pass | `tests/staff/checkout.test.tsx`; Live orders #6–#11 |
| TC-P07 | Sale refused for low stock | Sell a product whose ingredient is short (sent straight to the API) | 409 "Out of stock: Ice. This order was not saved." Nothing saved | Pass | `tests/server/phase2-api.test.ts`; Live 2026-11-25 |
| TC-P08 | Price changed since menu loaded | Checkout with an old price | 409 `PRICE_CONFLICT`, nothing saved | Pass | `tests/server/phase2-api.test.ts` |
| TC-P09 | Double tap on Confirm | Tap Confirm twice | One order only | Pass | `tests/staff/checkout.test.tsx` |

### 2.3 Offline and sync

| ID | Test case | Steps | Expected result | Status | Evidence |
|---|---|---|---|---|---|
| TC-S01 | Order while offline | Go offline, ring up a sale | Saved on the device with a provisional number; offline banner shows | Pass | `tests/staff/checkout.test.tsx`, `tests/staff/shell.test.tsx` |
| TC-S02 | Sync when the connection returns | Come back online | Queued orders sent, marked synced only after the database returns an order number | Pass | `tests/staff/sync.test.ts`, `tests/staff/use-sync.test.tsx` |
| TC-S03 | Retry every minute | Stay online with an unsent order | Sent again every 60 seconds; nothing sent while offline | Pass | `tests/staff/use-sync.test.tsx` |
| TC-S04 | Same order sent twice | Sync repeats a `clientTxId` | Reported as duplicate, saved once | Pass | `tests/server/idempotency.test.ts`, `tests/server/phase2-api.test.ts` |
| TC-S05 | One bad order in a batch | Batch with a stock conflict and a server error | Each order reported on its own; no database details leak | Pass | `tests/server/phase2-api.test.ts` |
| TC-S06 | Large queue | More orders than one request allows | Sent in chunks | Pass | `tests/staff/sync-chunks.test.ts` |

### 2.4 Orders board

| ID | Test case | Steps | Expected result | Status | Evidence |
|---|---|---|---|---|---|
| TC-O01 | Order list and search | Open Orders, search a queue number | Matching order lines | Pass | `tests/owner/orders-board.test.tsx`; Live 2026-11-25 |
| TC-O02 | Order details and receipt | Open an order | Items, add-ons, payment, change, cashier | Pass | `tests/owner/orders-detail.test.tsx`; Live order #11 |
| TC-O03 | Allowed status change | pending → preparing | Saved and audited | Pass | `tests/server/phase2-api.test.ts` |
| TC-O04 | Not allowed status change | pending → completed | 409 `INVALID_TRANSITION` | Pass | `tests/server/phase2-api.test.ts` |
| TC-O05 | Cancel returns stock | Cancel an order | Its ingredients are added back | Test written, run not recorded | `supabase/tests/cancel_returns_stock.test.sql` |

### 2.5 Inventory, products and suppliers (Owner)

| ID | Test case | Steps | Expected result | Status | Evidence |
|---|---|---|---|---|---|
| TC-I01 | Stock in / stock out | Record a stock movement | Stock and history updated | Pass | `tests/server/phase2-api.test.ts`; Live (Stock History) |
| TC-I02 | Stock out above stock | Take out more than is left | 409 `STOCK_CONFLICT`, nothing saved | Pass | `tests/server/phase2-api.test.ts` |
| TC-I03 | Empty quantity | Save Stock In/Out with no quantity | Form warning, nothing sent | Pass | Live 2026-11-25 |
| TC-I04 | Delete ingredient | Delete, read the warning, confirm | Hidden; removed from recipes; add-on switched off; cancel does nothing | Pass | `tests/owner/inventory-delete.test.tsx`, `supabase/tests/ingredient_soft_delete.test.sql` |
| TC-I05 | Stock History shows everything | Open Stock History with no filter | All movements listed | **Known issue K1** | Live 2026-11-25 |
| TC-R01 | Product create and edit | Add or edit a product | Saved; categories listed | Pass | `tests/owner/products-add.test.tsx`, `products-edit.test.tsx` |
| TC-R02 | Make a product unavailable | Turn off "Available" | Disappears from the POS menu | Pass | `tests/owner/products-costing.test.tsx` |
| TC-R03 | Delete product | Delete and confirm | Hidden from lists and POS; past orders keep it | Pass | `tests/server/phase2-api.test.ts` |
| TC-R04 | Recipe and costing | Set a recipe | Ingredient cost, total cost and margin computed | Pass | `tests/owner/recipe-costing.test.tsx`, `tests/contracts/rules-costing.test.ts`; Live (Barkada ₱68.50, 51%) |
| TC-U01 | Supplier create and deactivate | Add, then deactivate | Saved; deactivate sends only the status | Pass | `tests/owner/suppliers-page.test.tsx` |
| TC-U02 | Delete supplier | Delete, read the warning, confirm | Hidden; ingredients lose the link; second delete is 404 | Pass | `tests/owner/suppliers-page.test.tsx`, `tests/server/phase2-api.test.ts`; SQL test written, not yet run |

### 2.6 Users, reports and dashboard (Owner)

| ID | Test case | Steps | Expected result | Status | Evidence |
|---|---|---|---|---|---|
| TC-E01 | Create a barista | Add user | Account created as barista | Pass | `tests/owner/users-page.test.tsx` |
| TC-E02 | Required fields | Save an empty Add User form | Form warning, nothing sent | Pass | Live 2026-11-25 |
| TC-E03 | Save with no changes | Open Edit, save unchanged | "No changes to save.", nothing sent | Pass | `tests/owner/users-page.test.tsx`; Live 2026-11-25 |
| TC-D01 | Dashboard totals | Open Dashboard | Matches the Daily report (₱1,855, 10 orders on 2026-11-25) | Pass | Live 2026-11-25 |
| TC-D02 | Reports | Open Daily, Monthly, Best Sellers, Stock Status | Each loads with correct totals | Pass | `tests/owner/reports-*.test.tsx`; Live 2026-11-25 |
| TC-D03 | Print Report | Click Print | A4 report with report ID, filters, matching totals, preparer from the session, blank signature lines; audit entry `report_prepared_for_print`; no Export CSV button | Pass | `tests/owner/reports-buttons.test.tsx`, `tests/server/phase2-api.test.ts` |

---

## 3. Test logs

### 3.1 Automated runs

| Date | Version | Command | Result | Notes |
|---|---|---|---|---|
| 2026-11-25 | pull request #7 | `pnpm test` | 615 / 616 passed | 1 timeout under machine load (`tests/staff/checkout.test.tsx`, "rejects empty and non-numeric amounts"); passed 9/9 when re-run alone |
| 2026-11-25 | pull request #7 | `pnpm typecheck`, `pnpm lint` | Clean | |
| 2026-11-25 | pull request #5 | server, owner, ui tests | 244 / 244 passed | Supplier delete and logo |
| 2026-11-25 | pull request #4 | `pnpm test` | 593 passed, 14 timeouts under load | All 14 passed on re-run (97/97) |
| 2026-11-25 | pull request #7 (`39d5a29`) | GitHub Actions | Lint, Test, Typecheck & Build: success | |
| 2026-11-25 | pull request #5 (`b1ef8c8`) | GitHub Actions | Lint, Test, Typecheck & Build: success; Migrations and SQL tests on PostgreSQL 15: success | All 21 migrations, including the supplier delete, applied cleanly |
| Every pull request | | GitHub Actions `ci.yml` | Lint, typecheck, tests, build, secret-key check, dependency audit | |

### 3.2 Database tests (SQL)

| Test file | What it checks | Last result |
|---|---|---|
| `phase2_core.test.sql` | Checkout, stock trigger, roles | Pass (CI, pull request #5) |
| `roles_mfa_storage.test.sql` | Role rules, Owner code, image storage | Pass (CI, pull request #5) |
| `addons_catalog_costs.test.sql` | Add-ons, menu, cost privacy | Pass (CI, pull request #5) |
| `validation_calculations.test.sql` | Totals, change, stock maths | Pass (CI, pull request #5) |
| `ingredient_soft_delete.test.sql` | Ingredient and product delete | Pass (local run, 2026-11-24); not in the CI list yet |
| `cancel_returns_stock.test.sql` | Cancel gives stock back | Not in the CI list; no run recorded in this log |
| `supplier_soft_delete.test.sql` | Supplier delete | **Not run yet** (Docker was off). Its migration applied cleanly in CI and on the live database |

The CI job runs only the first four files. Adding the last three is an open task.

### 3.3 Live test log (production)

| Date / time | Test | Result | Action |
|---|---|---|---|
| 2026-11-25 | Sale with out-of-stock ingredients (orders #1–#5) | **Failed**: orders went through | Cause: live products had no recipes. Fixed with the recipe import (484 lines) and pull request #4 |
| 2026-11-25 | Retest: sale needing Ice at zero stock | Pass: 409 "Out of stock: Ice. This order was not saved." | Latest order stayed #5 |
| 2026-11-25 | Suppliers page after pull request #5 | **Failed**: "An unexpected error occurred" | Cause: database step not applied yet. Fixed by running migration `20261120001500` |
| 2026-11-25 | Health check and sign-in pages | Pass (`/api/health` OK) | |
| 2026-11-25 | All 18 Admin data addresses | Pass: all 200, 200–380 ms | |
| 2026-11-25 | Admin screens (read-only walk) | Pass, no console errors | 2 issues found, see K1 and K2 |
| 2026-11-25 | Logo and tab icon (pull requests #5, #6) | Pass after a hard refresh | Browser kept the old copy until Ctrl + Shift + R |
| 2026-11-25 | No Sync now button, no POS auto sign-out (pull request #7) | Pass after removing the old offline copy | |

---

## 4. Known issues

| ID | Issue | Impact | Status |
|---|---|---|---|
| K1 | Admin Stock History shows only the newest 100 movements (119 exist). The POS shows 50 | Older movements are hidden unless filtered by ingredient or date | Open |
| K2 | A new browser tab shows "Owner Owner" in the Admin top bar, and the POS Charge button says "You are signed out" | The POS cannot charge in a new tab until the barista signs in again | Open |
| K3 | An offline order the server later refuses shows as "pending" on the POS Orders page | Staff may not notice it failed | Open |
| K4 | Stock History tab title reads "Stock In / Out" | Cosmetic; may match the Figma design | To confirm with the designer |

---

## 5. API integration

### 5.1 How the parts connect

```
 Browser (Owner /admin, Barista /staff)
   │  HTTPS, session in an HttpOnly cookie (the browser never holds a Supabase token)
   ▼
 /admin/api/*  or  /staff/api/*        ← proxy in each area: reads the cookie, refreshes the token
   │  in-process call, Authorization: Bearer <user token>
   ▼
 src/server routes (Next.js Route Handlers on Vercel Functions)
   │  requireRole → validate with zod (src/contracts) → service
   ▼
 Supabase
   ├─ Auth          sign-in, sessions, Owner email code
   ├─ PostgreSQL    tables + RLS (queries run with the user's own token)
   │                functions: process_checkout_transaction, set_product_recipe,
   │                delete_ingredient, delete_supplier, login_throttle_*
   └─ Storage       product images (private bucket)
```

| Integration | Direction | How |
|---|---|---|
| POS / Admin screens → API | Browser to server | `src/owner/lib/api-client.ts`, `src/staff/lib/api-client.ts` call `/admin/api/*` and `/staff/api/*` |
| API → Supabase Auth | Server to Supabase | Verifies every token; the role comes from the `users` table, never from the token |
| API → Postgres | Server to Supabase | Supabase client with the caller's token, so RLS applies; multi-step writes use Postgres functions |
| API → Storage | Server to Supabase | Product image upload and download through the API only |
| POS offline → API | Device to server | IndexedDB queue → `POST /api/sync` with a unique `clientTxId` per order |
| Supabase → email | Supabase to Owner | Owner sign-in code through SMTP (Resend) |
| GitHub → Vercel | Deployment | Merging into `main` deploys production |

### 5.2 Rules every endpoint follows

- **Sign-in:** everything except `/api/health`, `/api/auth/login` and `/api/setup/owner` needs a signed-in user. No session: 401. Wrong role or inactive account: 403.
- **Roles:** `owner_admin` (Owner) and `barista`. The database checks again with row-level security.
- **Response envelope:** `{ success, data?, error?: { code, message, details? }, meta: { timestamp } }`.
- **Lists:** `page`, `pageSize` (max 100) → `{ items, page, pageSize, total }`.
- **Errors:** 400 `VALIDATION_ERROR` / `INVALID_JSON` / `VALIDATION`, 401 `UNAUTHORIZED`, 403 `FORBIDDEN`, 404 `NOT_FOUND`, 409 `STOCK_CONFLICT` / `PRICE_CONFLICT` / `CONFLICT` / `INVALID_TRANSITION` / `REFERENCE_CONFLICT`, 500 (never shows database details).
- **Audit:** Owner changes and order status changes are written to `audit_logs`.

### 5.3 Endpoints

The browser calls these through `/admin/api/...` (Owner) or `/staff/api/...` (Barista).

| Method | Endpoint | Who | Purpose |
|---|---|---|---|
| GET | `/api/health` | public | Server is up |
| POST | `/api/auth/login`, `/api/auth/otp` | public | Sign-in; Owner email code |
| POST | `/api/setup/owner` | setup token | Create the one Owner (once) |
| POST | `/api/admin/employees` | owner | Create a barista account |
| GET, PATCH | `/api/users`, `/api/users/[id]` | owner | List, edit, activate or deactivate staff |
| GET | `/api/products`, `/api/products/[id]` | owner, barista | Menu (the list includes each product's recipe for the POS stock check) |
| POST, PATCH, DELETE | `/api/products`, `/api/products/[id]` | owner | Create, edit, make unavailable, soft delete |
| GET, PUT | `/api/products/[id]/recipe`, `/api/products/[id]/costing` | owner | Recipe, packaging cost, margin |
| GET | `/api/products/costing` | owner | All products' costing |
| GET, PUT, DELETE | `/api/products/[id]/image` | owner (GET: both) | Product photo |
| GET | `/api/ingredients`, `/api/ingredients/[id]` | owner, barista | Inventory with stock status |
| POST, PATCH, DELETE | `/api/ingredients`, `/api/ingredients/[id]` | owner (barista: add a basic ingredient) | Manage ingredients |
| GET | `/api/ingredients/[id]/products` | owner | Products that use an ingredient (shown before delete) |
| GET | `/api/ingredients/suppliers` | barista | Active supplier names only |
| GET, POST, PATCH, DELETE | `/api/suppliers`, `/api/suppliers/[id]` | owner | Manage suppliers; delete is soft |
| GET, POST | `/api/stock-transactions` | owner, barista | Stock history; stock in / out |
| GET | `/api/orders`, `/api/orders/[id]` | owner, barista | Order board, receipt data |
| POST | `/api/orders` | barista | Online checkout |
| PATCH | `/api/orders/[id]` | owner, barista | Change order status |
| POST | `/api/sync` | barista | Save offline orders |
| GET | `/api/reports/[type]` | owner | `daily`, `monthly`, `best-sellers`, `stock-status` |
| GET | `/api/dashboard` | owner | Dashboard summary |

### 5.4 Example: checkout

Request (`POST /staff/api/orders`, Barista):

```json
{
  "clientTxId": "7b0d6a4c-4f2e-4a8e-9a55-3d1f0c2b9e11",
  "type": "dine-in",
  "items": [
    { "productId": "8", "productName": "Almond Latte", "quantity": 1, "unitPrice": 99, "subtotal": 99, "customization": "Sugar 35%, Less Ice" },
    { "isAddon": true, "ingredientId": "67", "productName": "Sugar Syrup", "quantity": 1, "unitPrice": 25, "subtotal": 25 }
  ],
  "totalAmount": 124, "taxAmount": 0, "discountAmount": 0,
  "paidAmount": 150, "paymentMethod": "cash"
}
```

Success: **201** `{ "success": true, "data": { "duplicate": false, "order": { "orderId": 11, ... } } }`.
The same `clientTxId` again returns **200** with `"duplicate": true` and the same order.

Refused for stock (nothing saved): **409**

```json
{ "success": false, "error": { "code": "STOCK_CONFLICT", "message": "Out of stock: Ice. This order was not saved." } }
```

### 5.5 Example: offline sync

Request (`POST /staff/api/sync`): `{ "batchId": "batch_…", "orders": [ { "transactionId": "<clientTxId>", "order": { …same as checkout… }, "createdAt": "…" } ] }`

Response: each order is answered on its own.

```json
{
  "success": true,
  "data": {
    "processedCount": 2,
    "results": [
      { "transactionId": "a1…", "orderId": "12", "status": "synced" },
      { "transactionId": "b2…", "status": "conflict", "code": "STOCK_CONFLICT", "error": "Out of stock: Ice. This order was not saved." }
    ]
  }
}
```

The POS marks an order synced only when it gets an `orderId` back.
