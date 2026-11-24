# API Testing Report — Gunita Kopi POS

Date: 2026-11-19. Branch `integration/phase2-frontend`. API: `apps/api` (Next.js Route Handlers).
Part of the [System Validation Report](system-validation-report.md).

## 1. Environments

| Label | Meaning |
|---|---|
| L-UT | vitest in `apps/api/tests` (route handlers and services called directly, Supabase mocked). 113 tests, all pass on Node 22. |
| L-API→LIVE | This branch's production build (`next start -p 3002`) using `apps/api/.env.local`, so it talks to **live** Supabase. Only requests that cannot write data were sent: health, unauthenticated, invalid-token, validation and CORS. |
| L-SQL | The database functions behind the endpoints, tested on PGlite (`supabase/tests/*.test.sql`) |
| LIVE (authenticated) | **BLOCKED**: live has 0 users, and creating accounts is a live write that needs approval |

No deployed API exists, so nothing was sent to an old `main` API.

## 2. Common behaviour

- Response envelope: `{ success, data | error{code,message,details?}, meta{timestamp} }` (`ApiResponse`).
- Auth: `Authorization: Bearer <Supabase access token>`, verified with Supabase Auth on every request.
  Role and status come from `public.users`. An Owner without aal2 gets 403 `MFA_REQUIRED`.
- Errors: 400 `VALIDATION_ERROR` (zod, with field paths), 400 `INVALID_JSON`, 401 `UNAUTHORIZED`,
  403 `FORBIDDEN`/`MFA_REQUIRED`, 404, 409 (`STOCK_CONFLICT`, `PRICE_CONFLICT`, `CONFLICT`,
  `INVALID_TRANSITION`), 429 (sign-in lock), 503 (sign-in store unavailable). 5xx bodies are generic.
- Pagination: `page` ≥ 1, `pageSize` 1–100 (default 25). Ids: positive integers (`IdSchema`).

## 3. Endpoint inventory

Roles: O = owner_admin, B = barista. "UT" lists the L-UT cases that cover the endpoint.

| Method | Endpoint | Module | Auth | Roles | Validation | Database operation | Positive (UT) | Negative (UT / live probe) | Result |
|---|---|---|---|---|---|---|---|---|---|
| GET | `/api/health` | — | public | — | — | none | 200 ok (UT) | — | PASS (live probe 200) |
| POST | `/api/auth/login` | session | public (server-to-server, trusted IP) | — | `LoginRequestSchema` | `users` lookup (service role), Auth sign-in, `login_throttle_*` | Owner and Barista sign-in by username | wrong password, unknown or inactive user (same answer); 5-failure lock 429; 503 fail-closed; **malformed JSON 400 (fixed)**; live probe `{}` gives 400 | PASS (UT); live sign-in BLOCKED |
| POST | `/api/setup/owner` | setup | `X-Setup-Token` | — | `OwnerSetupRequestSchema` | `provision_initial_owner` (advisory lock), Auth admin | creates the Owner once | no code, mismatched passwords, staff domain, already set up, concurrent race; live probe `{}` and wrong token gives 400 (validation runs first) | PASS (UT); live BLOCKED (write) |
| POST | `/api/admin/employees` | employees | Bearer | O | `CreateEmployeeRequestSchema` | Auth admin `createUser`, `users` insert, rollback on failure | creates a Barista with email NULL | owner_admin role refused; live probe gives 401; **malformed JSON 400 (fixed)** | PASS (UT); live BLOCKED |
| GET | `/api/users`, `/api/users/{id}` | users | Bearer | O | `UserListQuerySchema`, `IdSchema` | `users` (RLS) | list and get | Barista 403 (UT); live 401 | PASS (UT) |
| PATCH | `/api/users/{id}` | users | Bearer | O | `UpdateUserRequestSchema` | `users` update (column grant: `full_name`, `status` only, verified live) + audit | deactivate | — | PASS (UT) |
| GET | `/api/products` | products | Bearer | O, B | `ProductListQuerySchema` | `products` | catalog read by both roles | live 401 | PASS (UT) |
| POST | `/api/products` | products | Bearer | O | `CreateProductRequestSchema` | `products` insert (`created_by` from session) + audit | creator from session | missing name, negative price, 3 decimals, malformed JSON gives 400; Barista 403 | PASS (UT) |
| GET/PATCH | `/api/products/{id}` | products | Bearer | GET O,B / PATCH O | `UpdateProductRequestSchema` | `products` | availability alone | non-numeric id 400 | PASS (UT) |
| GET/PUT | `/api/products/{id}/recipe` | products | Bearer | O | `UpdateRecipeRequestSchema` (unique ingredients, ≤ 50) | `set_product_recipe` RPC | replace recipe | Barista 403; duplicate ingredient refused (schema and DB) | PASS (UT, L-SQL) |
| GET/PUT | `/api/products/{id}/costing` | products | Bearer | O | `UpdatePackagingCostRequestSchema` | `product_costing`, `ingredient_unit_costs()` | packaging + stored ingredient cost; missing unit costs flagged | Barista 403 | PASS (UT, L-SQL) |
| GET | `/api/products/costing` (added in the second pass) | products | Bearer | O | — | `products`, `product_ingredients`, `ingredient_unit_costs()`, `product_costing` (4 queries) | all products' costing; no recipe gives a genuine 0 | Barista 403 with no data; database failure gives 500, not zeros | PASS (UT) |
| GET/PUT/DELETE | `/api/products/{id}/image` | products | Bearer | GET O,B / PUT,DELETE O | file type and size checks | Storage `product-images` | upload, serve, remove | Barista, non-image, oversized; foreign path 404 | PASS (UT); **live BLOCKED: bucket missing** |
| GET | `/api/ingredients`, `/api/ingredients/{id}` | ingredients | Bearer | O, B | `IngredientListQuerySchema` | `v_inventory_status`; Owner also `ingredient_unit_costs()` | Owner gets `unitCost` | Barista response has no `unitCost` key | PASS (UT, L-SQL) |
| POST/PATCH | `/api/ingredients`, `/api/ingredients/{id}` | ingredients | Bearer | O | `Create/UpdateIngredientRequestSchema` | `ingredients` + audit | add-on saved at 25.00 (client price ignored); regular saved false/NULL/NULL; disabling clears config | incomplete add-on configurations 400; Barista 403 | PASS (UT, L-SQL) |
| GET/POST | `/api/suppliers`, `/api/suppliers/{id}` (GET/PATCH) | suppliers | Bearer | O | supplier schemas | `suppliers` + audit | — | live 401 | PASS (UT, partial coverage) |
| GET | `/api/stock-transactions` | stock | Bearer | O, B | `StockTransactionListQuerySchema` | `stock_transactions` | history | live 401 | PASS (UT) |
| POST | `/api/stock-transactions` | stock | Bearer | O, B | `CreateStockTransactionRequestSchema` | insert + trigger | stock-in/out Owner and Barista | quantity 0 / −3 gives 400; user mismatch 403; short stock 409 | PASS (UT, L-SQL) |
| GET | `/api/orders`, `/api/orders/{id}` | orders | Bearer | O, B | `OrderListQuerySchema` | `v_order_totals`, `orders`, `payments` | receipt data | live 401 | PASS (UT) |
| POST | `/api/orders` | orders | Bearer | B | `CreateOrderRequestSchema` | `process_checkout_transaction` | atomic checkout; repeated `clientTxId` gives 200 duplicate | non-cash 400 before the DB; stale price 409; Owner 403 | PASS (UT, L-SQL) |
| PATCH | `/api/orders/{id}` | orders | Bearer | O, B | `UpdateOrderStatusRequestSchema` | `orders.status` + trigger + audit | valid transition audited | invalid transition 409; live 401 | PASS (UT, L-SQL) |
| POST | `/api/sync` | sync | Bearer | B | `SyncPayloadSchema` (`transactionId` = `clientTxId`) | checkout per order | per-order synced/duplicate/conflict/failed | mismatched ids 400; no database internals in results | PASS (UT) |
| GET | `/api/reports/{type}` | reports | Bearer | O | `ReportTypeSchema`, `ReportQuerySchema` | report views + costing | totals add up | unknown type 400; Barista 403 | PASS (UT, L-SQL) |
| GET | `/api/dashboard` | dashboard | Bearer | O | — | views (see validation report §6.2) | — | Barista 403 | PASS (UT) |
| POST | `/api/mock/rpc` | mock | `MOCK_MODE=true`, not production | — | body schema | in-memory mock store | demo data | 404 when off (live probe 404) | PASS |

## 4. Live probe results (L-API→LIVE, 2026-11-19 14:22 UTC)

Reproduce: build `apps/api`, then `npx -y node@22 node_modules/next/dist/bin/next start -p 3002` in
`apps/api`, then send the requests below.

| Request | Status | Time | Body (code) |
|---|---|---|---|
| `GET /api/health` | 200 | 9 ms | `status: ok` |
| `GET` products, products/1, ingredients, ingredients/1, suppliers, users, orders, orders/1, stock-transactions, dashboard, reports/daily-sales, products/1/recipe, products/1/costing, products/1/image (no token) | 401 ×14 | 7–28 ms | `UNAUTHORIZED` "Missing Bearer authentication token" |
| `POST /orders`, `POST /sync`, `POST /admin/employees`, `PATCH /orders/1` (no token) | 401 ×4 | 7–12 ms | `UNAUTHORIZED` |
| `GET /products` with `Bearer not-a-jwt` | 401 | 1043 ms | "Invalid or expired authentication token" (checked by live Auth) |
| `GET /dashboard` with a forged JWT claiming `owner_admin` | 401 | 208 ms | same |
| `POST /setup/owner` `{}` | 400 | 9 ms | `VALIDATION_ERROR`, field paths |
| `POST /mock/rpc` | 404 | 6 ms | "Mock mode is off" |
| `POST /auth/login` `{}` | 400 | 29 ms | `VALIDATION_ERROR` |
| `POST /auth/login` body `not json` | **500** | 8 ms | `INTERNAL_SERVER_ERROR` (generic, no leak). **Defect, fixed locally**: now 400 `INVALID_JSON` (UT; the build probed was the one before the fix) |
| `OPTIONS /products`, Origin `https://evil.example` | 204 | — | `Access-Control-Allow-Origin: http://localhost:3000` (not the requesting origin, so browsers block it) |
| `OPTIONS /products`, Origin `http://localhost:3001` | 204 | — | echoes `http://localhost:3001` |

Database effects of the probes: none. No probe reached a write path, and the sign-in probes failed
validation before the throttle was touched.

## 5. Failed, blocked and not-tested

| Item | Status | Reason |
|---|---|---|
| Malformed JSON on login, setup and employees | FAIL, then fixed locally | used `req.json()` directly; now `readJson` |
| Any authenticated live call | BLOCKED | 0 live users; creating the Owner (`/api/setup/owner`) is a live write that needs approval |
| Live sign-in throttle | BLOCKED | every failed attempt writes `login_throttle` rows |
| Live checkout, sync, stock, recipe, costing, reports with data | BLOCKED | no ingredients, recipes or users; checkout writes orders and payments that must not be deleted |
| Product image endpoints live | BLOCKED | `product-images` bucket not created (`20261120000100` not applied) |
| Concurrent checkout of the same `clientTxId` against real Postgres | NOT TESTED | PGlite has one connection; the logic relies on the UNIQUE `payments.client_tx_id` and the `unique_violation` handler |
| Cash-only at the database (`20261120000500`) | PASS (L-SQL) | a direct non-cash checkout is refused with `check_violation` (API maps it to 400 `VALIDATION_ERROR`); not applied live |
| Every authenticated local-stack test from the second-pass brief | BLOCKED | Docker Desktop not installed and admin rights needed (validation report §14.1) |
| Supplier endpoints | partly covered | no dedicated L-UT cases beyond role checks; database part covered in L-SQL |

## 6. Steps to finish API testing

1. Get a local Supabase stack or a staging project ([guide](localhost-manual-testing-guide.md)), then
   run the seed.
2. Sign in as `testowner` (after TOTP enrolment) and `testbarista`, and run the Handoff Notes D checklist
   against `http://localhost:3002`, recording status, timing and database effects as in §4.
3. Live: only after approval, create the real Owner with `/api/setup/owner`, then repeat the read-only
   authenticated checks (products 76, empty lists, Barista response without `unitCost`).
