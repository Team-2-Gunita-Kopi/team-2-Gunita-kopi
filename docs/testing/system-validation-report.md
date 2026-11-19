# System Validation Report — Gunita Kopi POS

Date: 2026-11-19. Branch: `integration/phase2-frontend` (HEAD `7bf6ad5`, plus uncommitted work).
Sources: SRS `Team 8 - SRS Documentation (Gunita Kopi POS System) - Web-Based.md`, SDS
`Gunita_Kopi_POS_SDS_updated (1).md` (identical to the copy in Downloads), menu
`Gunita_Kopi_Menu_Transcription-1 (1).md`, and the code on this branch.

Companion documents: [API Testing Report](api-testing-report.md),
[Localhost Manual Testing Guide](localhost-manual-testing-guide.md).

## 1. Executive summary

- **Local evidence is strong.** Typecheck, lint, 425 unit and integration tests (with Supabase mocked),
  three production builds, and four SQL test files on PGlite all pass. A new SQL test checks checkout,
  stock, costing and report numbers against values worked out by hand. It passes on the full migration
  chain and on the chain that matches live.
- **Live evidence is thin, because live has no accounts and no data.** Live checks were read-only: the
  schema, RLS, grants, functions, views, triggers, constraints, indexes, the catalog, and empty-table
  queries. Every check matched the migrations. All 76 products match the approved menu. Authenticated
  live API tests, live business flows and browser tests are **BLOCKED**: there are 0 users and 0
  ingredients, suppliers, recipes or orders.
- **No deployment exists.** GitHub has no Vercel deployment records and the env files point at
  localhost. The only GitHub "deployment" is a failed staging migration job from the first commit.
- **CI has never run.** `ci.yml` was invalid YAML (a duplicated `name` key) from the first commit, so every
  run ended with 0 jobs. Its secret-isolation step would also have failed. Both are fixed locally,
  uncommitted (§10).
- **Defects fixed locally:** malformed JSON returned 500 instead of 400 on 3 routes (with a regression
  test), and the CI workflow.
- **Open issues that need a decision or approval** are listed in §11. The main ones: Owner MFA at the
  database level is not live, product images are not live (bucket missing), no proactive low-stock
  notification (FR-20), the Products page sends one costing request per product, and the
  `db-migrations.yml` pipeline would fail or misbehave on `main`.
- **Readiness:** not ready for production. It can be demonstrated locally once a local Supabase stack or a
  staging project exists (§9). The code largely implements the SRS, but nothing has been proven against
  live services beyond the database structure.

## 2. Scope and method

| Environment | What ran | Label used below |
|---|---|---|
| 1. Local automated tests | vitest in 7 packages, Supabase mocked | L-UT |
| 2. Local API integration | `next start` build of apps/api against live Supabase, **unauthenticated and validation probes only** | L-API→LIVE |
| 3. Local database (PGlite 0.2, Postgres 16 in WASM) | `supabase/tests/*.test.sql` on the full chain and on the live chain (without `20261120000000`, `20261120000100`) | L-SQL |
| 4. Staging | none exists | BLOCKED |
| 5. Live Supabase database | read-only queries inside `BEGIN READ ONLY … ROLLBACK` | LIVE-DB |
| 6. Deployed API and browser | none deployed | BLOCKED |

PGlite is not real PostgreSQL and is not Supabase (no PostgREST, GoTrue or Storage, and roles are
simulated with `supabase-stub.sql`). The Docker/PostgreSQL SQL run from `docs/database.md` is
**BLOCKED** because Docker is not installed on this machine.

Status values: PASS, FAIL, PARTIAL, NOT IMPLEMENTED, BLOCKED, NOT TESTED, plus OUT OF SCOPE for FR-40 by
team decision.

## 3. Environment details

- Windows 11, Git Bash. Node 26.5 is the default; tests and builds ran on **Node 22.23.5** (`npx node@22`).
  pnpm 12.21.0 (pinned), turbo 2, vitest 3.
- Live project `gunita-kopi-pos-dev`, reached through the direct host and the password from
  `supabase/.env.local`. No secret is printed in this report.
- `apps/*/.env.local`: `NEXT_PUBLIC_USE_MOCKS` is unset, so real mode is on. The Supabase URL points at
  live, and the API URL at localhost.

## 4. SRS functional requirements matrix

"Local" = evidence from L-UT and L-SQL. "Live" = against live services. Every live business flow is
BLOCKED by missing accounts and data unless stated otherwise.

| FR | Requirement (SRS, abridged) | Implementation | Test / evidence | Local | Live |
|---|---|---|---|---|---|
| FR-01 | Accept dine-in and online/Facebook pre-orders | `CreateOrderRequestSchema`, `api-mappers.ts` (`online`→`pre-order`), `orders.order_type` CHECK | `apps/pos/tests/api-mappers.test.ts`, `validation_calculations.test.sql` (types dine-in/take-out/pre-order) | PASS | BLOCKED |
| FR-02 | Item stores product, qty, unit price, customization, special instructions | `process_checkout_transaction` | `validation_calculations`: row keeps `less ice` / `extra hot` / 120 / 240 | PASS | BLOCKED |
| FR-03 | Add-on as its own row, `is_addon`, linked to ingredient | same + `orders_check` | `validation_calculations`: 2 add-on rows, `product_id` NULL, 25.00 | PASS | BLOCKED |
| FR-04 | Order and queue number, order type, date, user | `order_id_seq`, `orders.user_id` | `validation_calculations`, `phase2_core` | PASS | BLOCKED |
| FR-05 | Name, price, availability from PRODUCTS | checkout price recheck, `GET /api/products` | `validation_calculations` (stale price → PRICE_CONFLICT); LIVE-DB: 76 products readable | PASS | PASS (DB level only) |
| FR-06 | Payment: amount, method, date/time, receiver; cash only | `payments`; cash check in `orders/service.ts` | `validation_calculations`; `phase2-api.test.ts` (non-cash 400) | PASS (see R-08) | BLOCKED |
| FR-07 | Change computed and stored | checkout | `validation_calculations`: 500 − 315 = 185; exact payment → 0 | PASS | BLOCKED |
| FR-08 | Confirmation/receipt and queue number | `ReceiptModal.tsx` (Print = `window.print`) | `apps/pos/tests/checkout.test.tsx` | PASS (unit) | BLOCKED; browser NOT TESTED |
| FR-09 | Order slip for staff | Receipt modal: "Order slip" view of the saved order (queue number, type, time, items, add-ons, customization, notes; no prices or payment), printable (second pass) | `apps/pos/tests/checkout.test.tsx` (FR-09 case) | PASS (unit; content not defined by the SRS, see §14) | BLOCKED; browser NOT TESTED |
| FR-10 | Pending/Preparing/Completed/Cancelled; queue shown; completed = sales | `check_order_status_transition`, order boards | `phase2_core`, `validation_calculations` (completed→pending refused) | PASS | BLOCKED |
| FR-11 | Save new or updated orders (D1) | checkout, `PATCH /api/orders/{id}` | L-SQL | PASS | BLOCKED |
| FR-12 | Order deducts stock via recipe | checkout stock-out loop | `validation_calculations`: beans −36, milk −360 in one movement | PASS | BLOCKED (0 recipes live) |
| FR-13 | Completed sales to D3 | `v_sales` (completed only) | `validation_calculations`: cancelled excluded | PASS | BLOCKED |
| FR-14 | Both roles view inventory and status | `v_inventory_status`, both apps | `addons_catalog_costs`, POS/Admin inventory pages | PASS | BLOCKED |
| FR-15 | Owner records stock-in | `stock/service.ts` `ROLE_FOR_TYPE`, RLS | `phase2-api.test.ts`; `validation_calculations` (barista stock-in refused by RLS) | PASS | BLOCKED |
| FR-16 | Stock-out from orders and manual entries | checkout, `POST /api/stock-transactions` (barista) | `validation_calculations` (spoilage, over-deduction refused) | PASS (R-04: live RLS also lets the Owner record stock-out) | BLOCKED |
| FR-17 | Movement: ingredient, user, type, qty, remaining, date, remarks | `stock_transactions` + trigger | `validation_calculations`: milk movement 360, remaining 1640, user 32 | PASS | BLOCKED |
| FR-18 | Remaining stock updated after each movement | `apply_stock_transaction` | L-SQL; seed check: current = Σin − Σout for all ingredients | PASS | BLOCKED |
| FR-19 | Available / Low-Stock / Out-of-Stock | `v_inventory_status` | `validation_calculations` (all three states) | PASS | BLOCKED |
| FR-20 | Notify Owner and staff on Low/Out-of-Stock | Admin dashboard "low stock alerts"; POS shows status badges only | code inspection | **PARTIAL** (R-05) | BLOCKED |
| FR-21 | Ingredient fields | `ingredients` (status derived by view) | LIVE-DB columns verified | PASS | PASS (schema) |
| FR-22 | Supplier fields; one supplier per ingredient | `suppliers`, FK `on delete set null` | LIVE-DB constraints | PASS | PASS (schema) |
| FR-23 | Recipe as ingredients + qty per unit | `product_ingredients`, `set_product_recipe` | `validation_calculations` (bad FK and duplicate refused, recipe kept) | PASS | BLOCKED |
| FR-24 | Owner enters ingredient cost data | `unit_cost` (Owner), `ingredient_unit_costs()` | `addons_catalog_costs` | PASS | BLOCKED |
| FR-25 | Read ingredient/product details for costing | `getCosting` | L-UT | PASS | BLOCKED |
| FR-26 | Owner enters packaging cost | `PUT /api/products/{id}/costing` | `validation_calculations` (5.00) | PASS | BLOCKED |
| FR-27 | Total = ingredient + packaging | generated column `total_cost` | `validation_calculations`: 36.60 + 5.00 = 41.60; after a cost change 42.00 + 5.00 = 47.00 | PASS | BLOCKED |
| FR-28 | One costing row per product | UNIQUE `product_id` | LIVE-DB constraint | PASS | PASS (schema) |
| FR-29 | Show costing with breakdown | Recipe & Costing page | L-UT; browser NOT TESTED | PASS (unit) | BLOCKED |
| FR-30 | Reports Owner-only | `requireRole("owner_admin")`; `v_sales` filters `app_role()` | `phase2-api.test.ts`; `validation_calculations` (barista sees no sales or costing) | PASS | BLOCKED |
| FR-31 | Daily sales report | `v_daily_sales` | `validation_calculations`: +315, +1 order, +5 items | PASS | BLOCKED (empty) |
| FR-32 | Monthly sales report | `v_monthly_sales` | `validation_calculations` | PASS | BLOCKED (empty) |
| FR-33 | Inventory/stock report | `v_inventory_status` | L-SQL | PASS | BLOCKED (empty) |
| FR-34 | Best sellers (D1, D3, D4) | `v_best_sellers` + costing in `reports/service.ts` | `validation_calculations`: latte 2 units, 240; add-ons left out | PASS | BLOCKED |
| FR-35 | Return report to Owner | `GET /api/reports/{type}`, CSV export | L-UT | PASS (printing not implemented, see R-10) | BLOCKED |
| FR-36 | Dashboard: today's sales | `dashboard/service.ts` | L-UT | PASS | BLOCKED |
| FR-37 | Pending and completed counts | same | L-UT | PASS | BLOCKED |
| FR-38 | Available stock | same | L-UT | PASS | BLOCKED |
| FR-39 | Best sellers | same | L-UT | PASS | BLOCKED |
| FR-40 | Staff on duty | not implemented | — | OUT OF SCOPE (team decision; attendance excluded by SRS §8) | — |
| FR-41 | Username + password sign-in | `/auth/login` → `POST /api/auth/login` | `owner-email.test.ts`, `session.test.ts` | PASS | BLOCKED (0 users) |
| FR-42 | Validate against D5 | Supabase Auth + `public.users` | same | PASS | BLOCKED |
| FR-43 | Identify role | `requireUser` reads `users.role` | `auth.test.ts` | PASS | BLOCKED |
| FR-44 | Password in USERS | Supabase Auth holds it (SDS 3.11, OI-11) | design | PASS per SDS 3.11 (accepted deviation) | — |
| FR-45 | Grant access or deny | `requireRole`, middleware | `auth.test.ts`; L-API→LIVE: 401 on every protected route | PASS | PASS (unauthenticated only) |
| FR-46 | Owner access per §2.3 | route roles | API inventory | PASS | BLOCKED |
| FR-47 | Barista only §2.3 functions | route roles + RLS | `phase2-api.test.ts`, L-SQL | PASS | BLOCKED |
| FR-48 | Auto logout after inactivity, with notice | `IdleLogout` (5 min, 30 s warning) | `packages/ui` tests | PASS (period OI-06 open; 5 min chosen) | browser NOT TESTED |
| FR-49 | User fields, unique username | `users` | LIVE-DB constraints | PASS | PASS (schema) |
| FR-50 | Add/edit products incl. image | products API; image route + `20261120000100` | L-UT; LIVE-DB: no `product-images` bucket | **PARTIAL** (image not available live) | BLOCKED |
| FR-51 | Set available/unavailable | `PATCH /api/products/{id}` | L-UT; `validation_calculations` (unavailable product refused at checkout with CONFLICT) | PASS | BLOCKED |
| FR-52 | Record creator and date | `created_by` from session | L-UT; LIVE-DB: the 76 catalog rows have `created_by` NULL (inserted by migration, before any user existed) | PASS for new products | PASS (schema) |
| FR-53 | Two links, same accounts | admin :3000, pos :3001, shared Auth | design + middleware tests | PASS | BLOCKED (not deployed) |
| FR-54 | POS only Barista, back office only Owner | `createAuthMiddleware`, login role check | `apps/*/tests/middleware.test.ts`, `session.test.ts` | PASS | BLOCKED |
| FR-55 | POS screens and catalog on device | `sw.js`, `catalog-cache.ts` | `catalog-cache.test.ts` | PASS (unit) | browser NOT TESTED |
| FR-56 | Offline queue with unique local tx id | Dexie outbox | `sync.test.ts` | PASS (unit) | browser NOT TESTED |
| FR-57 | Send pending orders on reconnect or reopen | `triggers.ts` (online event, Background Sync, reopen) | `use-sync.test.tsx` | PASS (unit) | browser NOT TESTED |
| FR-58 | Server verifies user, stock, prices | `requireRole("barista")`, checkout recheck | L-SQL | PASS | BLOCKED |
| FR-59 | Saved once; synced only after DB confirms | `payments.client_tx_id` UNIQUE, outbox | `validation_calculations` (retry = duplicate, no extra rows or stock), `idempotency.test.ts`, `sync.test.ts` | PASS | BLOCKED |
| FR-60 | Show sync conflicts | `sync/service.ts` → `conflict` | `use-sync.test.tsx`, `phase2-api.test.ts` | PASS (unit) | BLOCKED |

**Add-on decisions** (all eleven checked against code and SQL):

| Decision | Result |
|---|---|
| Add-ons for every beverage, none for food | PASS (POS only): `ADDON_DRINK_CATEGORIES` = Iced Coffee and Non-Coffee (48 of the 76 products). The database does not tie an add-on row to its drink. |
| One add-on = one ingredient | PASS: `is_addon` flag on `ingredients`. Uniqueness of the 11 names is not enforced (data entry). |
| Fixed ₱25.00 | PASS: CHECK `ingredients_addon_config_check` (live), and the server ignores a client-sent price |
| Separate order row | PASS (L-SQL) |
| Quantity × `addon_quantity` deducted | PASS: milk 2 × 30 = 60 on top of a 300 recipe, as one movement |
| Server validates config and availability | PASS: a regular ingredient sold as an add-on gives CONFLICT; 0 stock gives STOCK_CONFLICT |
| Several add-ons, repeated checkout | PASS (L-SQL) |
| Real-mode add-ons in `CustomizeModal.tsx` | Implemented: `inventoryAddons(ingredients)` for drink categories (`customize-real.test.tsx`). **Live shows none**: 0 ingredients. Data readiness, not a code defect. |
| 11 official mappings and quantities | **BLOCKED (data/decision)**. None exist live. Handoff Notes E is still open. |

**Catalog (LIVE-DB):** 76 products, no duplicate names, all available, no description, image or creator.
The categories are Iced Coffee 24, Non-Coffee 24, Silog 6, Shawarma 5, Gunita Meals 8, French Fries 4,
Snacks 5. A parsed diff against the menu transcription matches all 76 names, categories and prices. The
only differences are the `*` marks on *Shawarma Burger* and *Cheese Pancakes*, whose meaning is not stated.
The 13 orange-board lines are not in the catalog, as decided (6 new names, 7 price conflicts). Category
filter and pagination queries return the expected rows.

## 5. Non-functional requirements matrix

The SDS has no numbered NFRs. Its rules (SDS 2.4, 2.5, 2.8, 2.9) back the SRS NFR-01 to NFR-12, which are
used here.

| NFR | Requirement | Evidence | Status |
|---|---|---|---|
| NFR-01 | Orders, payments and stock movements carry user, date and time | `orders.user_id/order_date`, `payments.received_by/date_time`, `stock_transactions.user_id/date_time`; L-SQL checks | PASS (local) |
| NFR-02 | Reports, costing and dashboard Owner-only | `requireRole`; `v_sales` role filter; `unit_cost` column privilege (LIVE-DB) | PASS (local + live schema) |
| NFR-03 | Auto logout | `IdleLogout` 5 min in both apps | PASS (unit); browser NOT TESTED |
| NFR-04 | Android and iOS browsers | — | NOT TESTED (no devices; OI-01) |
| NFR-05 | Phone/tablet layouts, touch | Tailwind responsive layouts (code) | NOT TESTED in a browser |
| NFR-06 | Opened from a web address, no install | PWA design | PASS (design); not deployed |
| NFR-07 | POS keeps taking orders offline | outbox, service worker | PASS (unit); browser NOT TESTED |
| NFR-08 | HTTPS; secrets server-side only | Service key only in `apps/api` (`git grep`); browser holds no token (HttpOnly, SameSite=Lax, Secure in production); HTTPS needs a deployment | PARTIAL: secrets PASS, HTTPS BLOCKED |
| NFR-09 | Invite-only accounts; Owner MFA | No sign-up route; `POST /api/admin/employees` Owner-only; API refuses an Owner without aal2 (`MFA_REQUIRED`, `auth.test.ts`). The database lock (`20261120000000`) is not live. Live "allow sign-up" and TOTP settings not checked. | PARTIAL |
| NFR-10 | Role checks on the server and in RLS | `requireRole` on every protected route; LIVE-DB: RLS on all 11 tables, policies as in the migrations, `anon` has no table or function privileges | PASS (local + live schema) |
| NFR-11 | Privileged actions audited | `auditAction` on 12 action types (create/update of products, recipes, costing, ingredients, suppliers, users, order status, employee and owner setup) | PASS (unit); live 0 rows |
| NFR-12 | Version control and automated checks before release | `ci.yml` was invalid YAML (0 jobs on every run); `db-migrations.yml` would run a plain `db push` | **FAIL** at HEAD; CI fixed locally (uncommitted), migrations pipeline still open (R-03) |

**Performance (measured where possible; the SDS sets no thresholds):**

| Check | Result |
|---|---|
| L-API→LIVE: unauthenticated route rejection | 6–28 ms |
| L-API→LIVE: invalid token verified with live Supabase Auth | 1.04 s (first, cold) and 0.21 s |
| L-SQL: full migration chain + 4 SQL test files | under 1.3 s in total |
| N+1 requests: Admin Products page calls `GET /products/{id}/costing` once per product (`apps/admin/src/features/products/api.ts:55`) | **76 parallel requests** per page load, each with about 5 database/Auth calls. R-06 |
| Pagination | `pageSize` ≤ 100 (contracts); `apiAllPages` stops after 50 pages |
| Order board | 2 queries per page (lines + payments), no N+1 |

**Reliability and integrity:** atomic checkout, rollback on any failure, idempotency, no negative stock,
FK `restrict` protecting history, and saved prices kept after later price and cost changes. All PASS in
L-SQL. Concurrent checkouts could not be tested: PGlite has one connection. The function relies on the
row update in `apply_stock_transaction` and the UNIQUE `client_tx_id`, which serialize in real
Postgres. **NOT TESTED.**

**Usability:** loading ("…"), empty and error states are present on the pages inspected (dashboard,
products). Real mode never falls back to sample rows when the API fails: sample rows appear only when
`USE_MOCKS`, and errors are shown. One exception: the Products page turns a failed costing call into "no
cost" (`.catch(() => null)`), with no error shown (R-06).

**Maintainability:** strict TypeScript, zod at every API boundary, shared contracts, and thin routes over
services. Migrations follow the conventions (RLS, `security_invoker`, `search_path=''`, explicit
grants). 425 tests plus 4 SQL files. Lint has 1 warning (unused eslint-disable in `apps/api`).

## 6. Database testing

### 6.1 Results by category

| Test category | Environment | Result | Reference | Expected / actual |
|---|---|---|---|---|
| Schema validation | Live Supabase | **PASS** | LIVE-DB queries: migrations, columns, constraints, FKs, indexes | 8 migrations recorded, as in Handoff B. Constraints and indexes match the migration files. `20261120000000` and `0100` are not applied (no aal check in `app_role()`; no bucket). |
| Permissions and RLS | Live Supabase | **PASS** | `pg_policies`, `role_table_grants`, `column_privileges`, `has_function_privilege` | RLS on all 11 tables. `anon` has no table or function privilege. `authenticated` has no SELECT on `ingredients.unit_cost` and no TRUNCATE/REFERENCES/TRIGGER. `users` UPDATE only on `full_name, status`; `orders` UPDATE only on `status`. Functions: `search_path=""`. Only intended functions are executable. |
| Product queries | Live Supabase | **PASS** | category filter, sort, limit/offset; diff with the menu | 76/76 match. `category='Iced Coffee' order by name limit 5` returns the first 5 alphabetically. Snacks = 5. |
| Empty-table behaviour | Live Supabase | **PASS** (structure only) | `count(*)` on all 6 views | All return 0 rows, no error. This proves only that the queries run, not that the logic is right. |
| Joins and relationships | Local (PGlite) | **PASS** | `validation_calculations.test.sql`, seed checks | Order lines join payments by `order_id`. Inventory joins suppliers. Bad FK in a recipe refused. |
| Inventory calculations | Local (PGlite) | **PASS** | same | After order A: 1000→964, 2000→1640, 100→85, 5→3. Every seeded ingredient: current = Σin − Σout. |
| Recipe calculations | Local (PGlite) | **PASS** | same | Costing 36.60, then 42.00 after the beans cost 1.20→1.50. Total = ingredient + packaging for all 76 seeded products. |
| Add-on calculations | Local (PGlite) | **PASS** | same | Milk: recipe 2×150 + add-on 2×30 = 360 in one movement. Add-on rows at 25.00. |
| Checkout transactions | Local (PGlite) | **PASS** | same | Total 315, change 185. Retry gives a duplicate with no new rows. Stock, price, add-on and underpayment failures leave no rows. |
| Reports and aggregations | Local (PGlite) | **PASS** | same | Daily +315 / +1 order / +5 items; monthly +315; best sellers 2 units / 240. Add-ons and cancelled orders excluded. |

Local means PGlite, not Supabase and not the Docker PostgreSQL run (BLOCKED). The live chain was
reproduced by leaving out the two unapplied migrations.

### 6.2 Query inventory (application queries)

| Area | Tables/views/RPC | Role | Empty result | Notes |
|---|---|---|---|---|
| Dashboard | `v_daily_sales`, `v_order_totals` (counts), `v_inventory_status`, reports helpers | Owner | zeros, empty lists (`?? 0`) | "Today completed" counts orders *placed* today |
| Products | `products`, `product_costing`, `ingredient_unit_costs()`, `product_ingredients` | both read / Owner write | empty page | N+1 on the Admin list (R-06) |
| Ingredients/Inventory | `v_inventory_status` (+ costs via function for the Owner) | both / Owner write | empty page | Barista response has no `unitCost` key |
| Suppliers | `suppliers` | Owner | empty page | |
| Stock movements | `stock_transactions` + embeds | both read; in Owner, out Barista | empty page | trigger keeps stock and history in step |
| Recipes/Costing | `set_product_recipe`, `product_costing`, triggers | Owner | costing 0 without recipe | the 76 live products have no recipe, so costing is 0 |
| Orders/Checkout/Payments | `process_checkout_transaction`, `v_order_totals`, `orders`, `payments` | checkout Barista (API); read both | empty page | `v_order_totals.status = min(status)`, safe because all rows of an order share one status |
| Reports | `v_daily_sales`, `v_monthly_sales`, `v_best_sellers`, `v_inventory_status`, `product_costing` | Owner | empty arrays | `items_sold` counts add-on selections as items (documented by the test) |
| Users | `users` (+ Auth admin for creation) | Owner | — | |
| Sync | checkout per order | Barista | — | one result per order |

### 6.3 Not testable without real data

Real recipes, unit costs, the 11 add-on mappings and serving quantities, and real stock levels. Live
reports, dashboard and costing will show zeros or empty lists until the Owner enters them.

## 7. Security validation

| Control | Evidence | Result |
|---|---|---|
| No token in the browser | HttpOnly cookie; proxy refuses `/api/auth/login`; `cache-control: private, no-store` | PASS (code + `session.test.ts`) |
| CSRF | the site proxy and `/auth/login` refuse a body from another origin; SameSite=Lax | PASS (code + tests) |
| Forged JWT | L-API→LIVE: forged owner token → 401; live Auth verifies the signature | PASS |
| Role from `public.users`, not claims | `requireUser` | PASS |
| SQL injection | PostgREST query builder and RPC with jsonb; no string-built SQL in the API | PASS (inspection) |
| XSS | React escaping; no `dangerouslySetInnerHTML` found in app code | PASS (inspection) |
| Error leakage | 5xx bodies are generic (L-API→LIVE) | PASS |
| Rate limiting | `login_throttle_*` (live functions present, service role only) | PASS (unit); live BLOCKED (would write throttle rows) |
| CORS | Allow-list; an unknown origin gets the first allowed origin back, which browsers reject | PASS |
| Direct Data API with a Barista token | RLS and grants verified live; a Barista can still call `process_checkout_transaction` with `payment_method` ≠ cash | R-08 (Low) |
| Owner stock-out at the database | live `stock_insert` policy allows it (API refuses) | R-04 (Low; fixed by pending `20261120000000`) |

## 8. Cloud and DevOps assessment

| Item | Finding |
|---|---|
| Next.js 15 ×3, Route Handlers, monorepo | PASS: matches SDS 2.6 and 2.11 |
| Vercel | **No `vercel.json`, no linked project, no deployment records** on GitHub. Root directories, build commands and per-environment variables cannot be checked. |
| Env separation | `SUPABASE_SERVICE_ROLE_KEY` only in `apps/api`. `NEXT_PUBLIC_*` = URL, key, API URL only. PASS. |
| Production mock guard | `/api/mock/rpc` returns 404 unless `MOCK_MODE=true` and not production (L-API→LIVE: 404) | PASS |
| CI (`ci.yml`) | Invalid YAML at HEAD (duplicate `name` at line 45). `restore-keys` typo. The secret check's `--exclude-dir=apps/api` never matches, so it would always fail. **Fixed locally**; parsed with js-yaml; the secret step passes on tracked files. Triggers only on `main` push/PR. |
| Migrations (`db-migrations.yml`) | Runs on every push to `main` touching migrations. It uses `supabase/setup-cli@v1` with `version: latest` (unpinned) and a plain `supabase db push`. That refuses out-of-order files without `--include-all`, and with it would apply `0000` and `0100` without separate approval. The staging job failed on its only run (2026-11-16). There is no dry-run step or protection against a production push except GitHub environment approval, which could not be checked. **R-03** |
| Backups | Free plan: assume no PITR or automated restore. No backup taken in this session. Rollback scripts from the earlier session may be gone. SDS CL-04 (restore test) is open. Before any migration: `pg_dump` schema and data, write a rollback, use `--dry-run` with a temporary workdir (Handoff C). |

## 9. Live database and deployment status

- Before and after this session, live counts were 76 products and 0 in every other table. No
  write was made. The queries ran in read-only transactions, and the final count check is in §12.
- No deployed API or site was found, so no live API test was sent to an old `main` API.
- **Localhost real-data testing: BLOCKED.** It needs a local Supabase stack (Docker) or a separate
  staging project. The seed is ready and validated on PGlite. See the
  [Localhost Manual Testing Guide](localhost-manual-testing-guide.md).

## 10. Changes made during testing (uncommitted)

| File | Change | Test |
|---|---|---|
| `apps/api/src/app/api/auth/login/route.ts`, `setup/owner/route.ts`, `admin/employees/route.ts` | Use the existing `readJson` helper, so malformed JSON returns 400 `INVALID_JSON`, not 500 | new `apps/api/tests/malformed-json.test.ts` (3 cases); api 113/113 |
| `.github/workflows/ci.yml` | Remove the duplicate `name`, fix the `restore-keys` expression, use `git grep` with pathspec exclusions for the secret check | js-yaml parse; the secret step passes locally |
| `supabase/tests/validation_calculations.test.sql` | New SQL test with hand-computed expectations | passes on both chains |
| `supabase/seed/synthetic_localhost_seed.sql`, `supabase/seed/seed-localhost.sh` | Synthetic localhost dataset and a guarded loader (local-only, refuses to run twice, no deletes) | SQL validated on PGlite (both chains); the shell script was only syntax-checked |
| `docs/testing/*.md` | These reports | — |

Generated `tsconfig.tsbuildinfo` and `apps/pos/public/sw.js` were restored after the builds.

## 11. Prioritized remediation list

| ID | Severity | Issue | Type | Smallest fix | Needs approval |
|---|---|---|---|---|---|
| R-01 | **High** | CI never ran (invalid YAML), so NFR-12 is unmet and nothing has been checked automatically | deployment | Fixed locally and parsed; **not yet run on GitHub** | commit/push |
| R-02 | **High** | No live proof of any business flow: 0 users, no deployment, no staging | data/deployment | Create a staging project or a local Docker stack, run the seed, then the Handoff D checklist; create the Owner live with `/api/setup/owner` | yes |
| R-03 | **High** | `db-migrations.yml`: unpinned CLI and a plain `db push` on `main` | deployment | **Rewritten locally** (§14): PR validation on PostgreSQL 15, manual apply only, exact approved list, pinned CLI 2.122.1 | commit; GitHub environment reviewers must be set |
| R-04 | Medium | Owner MFA not enforced in the database live (API enforces it); live RLS allows Owner stock-out | deployment | Apply `20261120000000` after deploying this branch's API and Admin `/mfa` (Handoff C) | yes |
| R-05 | Medium | FR-20: no notification when stock turns Low/Out; Barista sees badges only | missing feature | Decide what a "notification" is (e.g. toast or banner on the POS and Admin after a stock-changing response) | yes (scope) |
| R-06 | Medium | Admin Products page: one costing request per product (76) and costing errors hidden as "no cost" | performance/usability | **Fixed locally**: `GET /api/products/costing` (Owner only, 4 queries); page shows a costing error and blank costs | commit |
| R-07 | Medium | FR-50 image upload unavailable live (no bucket) | deployment | Apply `20261120000100` or create the bucket in the Dashboard | yes |
| R-08 | Low | Cash-only enforced in the API only; a Barista token on the Data API can save a non-cash `payment_method` | design gap | **Fixed locally**: migration `20261120000500_payments_cash_only.sql` (not applied live) | apply to live |
| R-09 | Low | FR-09: no separate order-slip layout; printer open (OI-02) | design | **Implemented locally** (order slip view); slip content and printer still to confirm with the client | confirm content |
| R-10 | Low | SDS 4.3 "Print" on reports not implemented (CSV present) | missing feature | `window.print()` with print CSS | optional |
| R-11 | Low | Malformed JSON returned 500 on 3 routes | code defect | **Fixed locally** | commit |
| R-12 | Low | Lint warning: unused eslint-disable in `apps/api` | code quality | Remove the directive | no |

Critical: none found. No unauthorized access path, data loss or wrong money or stock calculation was
found in the tested paths. Concurrency is untested, so this rests on code reasoning.

## 12. Test execution summary

| Command (from each package folder unless noted) | Node | Result |
|---|---|---|
| `npx -y node@22 node_modules/turbo/bin/turbo run typecheck --force` (root) | 22 | 9/9 pass |
| `… turbo run lint --force` (root) | 22 | 9/9 pass, 1 warning |
| `npx -y node@22 ../../node_modules/vitest/vitest.mjs run`: contracts 45, auth 30, ui 51, mocks 63, api 110→**113** after the fix, admin 33, pos 90 | 22 | all pass (425 total) |
| `npx -y node@22 node_modules/next/dist/bin/next build`: api, admin, pos | 22 | all compile |
| PGlite: stub + 10 migrations + `phase2_core`, `roles_mfa_storage`, `addons_catalog_costs`, `validation_calculations` | 26 | pass |
| PGlite live chain (no `0000`/`0100`) + `phase2_core`, `addons_catalog_costs`, `validation_calculations` | 26 | pass |
| PGlite: seed + consistency checks, then a second seed run | 26 | pass; second run refused |
| LIVE-DB read-only catalog and security queries | — | as §6 |
| L-API→LIVE probes (`next start`, port 3002), 26 requests + 2 CORS preflights | 22 | as API report |
| Docker/PostgreSQL SQL tests | — | **BLOCKED** (no Docker) |
| Live authenticated API, live writes, browser tests, staging | — | **BLOCKED / NOT RUN** |

The PGlite harness (a psql subset for `\set`, `\echo`, `\ir`) lives in the session scratchpad, not in
the repository.

## 13. Overall assessment

| Question | Answer |
|---|---|
| SRS functional requirements | 59 FRs in scope (FR-01 to FR-60 without FR-40). 56 are implemented and pass locally, some by unit test only. FR-09, FR-20 and FR-50 are PARTIAL. **None is verified end to end live.** FR-05 and the schema-only FRs are verified at database level. |
| SDS / SRS NFRs | NFR-12 fails at HEAD (fixed locally). NFR-08 and NFR-09 are PARTIAL. NFR-04 and NFR-05 are untested. The others pass locally. |
| Business logic | Correct in every tested calculation (L-SQL, hand-computed). Concurrency untested. |
| Database and API security | Correct live at schema level. API controls verified with unit tests and unauthenticated live probes. The MFA database lock is pending. |
| Cloud/DevOps | Architecture matches the SDS. CI was broken, the migration pipeline is unsafe, and nothing is deployed. |
| Before production | R-01 to R-04 and R-07; a staging run of the full migration chain; the Owner created and MFA configured; real ingredients, recipes and add-on mappings; the live Auth settings (Handoff E); a backup taken; then the Handoff D checklist and browser tests on real devices. |

## 14. Second pass (2026-11-19): remediation and Docker setup

### 14.1 Docker and local Supabase: BLOCKED

| Check | Result |
|---|---|
| Docker Desktop | **Not installed** (no `docker` command, no `C:\Program Files\Docker`) |
| Admin rights in this session | **No** (the shell is not elevated) |
| WSL | WSL 2 is the default; no distribution installed (Docker Desktop creates its own) |
| Hypervisor | present; 15.7 GB RAM; Windows 11 Pro |

Installing Docker Desktop needs administrator approval (a UAC prompt), so it was not attempted. Because of this,
the following **did not run**: `supabase start`, the seed script, the synthetic accounts, Owner TOTP
enrolment and login, Barista login, local authenticated API tests, browser tests, viewport tests,
the Storage (image) tests and the concurrent checkout test. No separate Supabase project was used.

### 14.2 Changes in this pass (local, uncommitted)

| Item | Change | Evidence |
|---|---|---|
| Cash only (R-08) | New migration `supabase/migrations/20261120000500_payments_cash_only.sql`: CHECK `payment_method = 'cash'` on `payments`. Checkout function, idempotency and grants unchanged. | `validation_calculations.test.sql`: a direct non-cash checkout is refused (`check_violation`), leaves no rows, the same sale in cash then succeeds, and a direct `insert into payments` is refused (no privilege). Without the migration the test fails ("non-cash payment accepted"). PGlite, full and live chains. |
| Products costing N+1 (R-06) | `GET /api/products/costing` (Owner only; products, recipes, `ingredient_unit_costs()` and costing rows in 4 queries). The Admin Products and Recipe Costing pages make 2 requests instead of 1 + 76. When costing fails, products still show, costs stay blank and an error is displayed. | api: 2 new cases (Owner list and computed totals, Barista 403 with no data, database failure gives 500 rather than zeros). admin: `products-costing.test.tsx` (one costing request; error shown, no ₱0.00). |
| FR-09 order slip | `Receipt` takes `slip`; the POS receipt modal has an "Order slip" toggle. Same saved order: queue number, type, time, items, add-on quantities, customization and notes. No prices, payment or footer. Print prints the view shown. | `checkout.test.tsx` FR-09 case |
| Migration pipeline (R-03) | `db-migrations.yml` rewritten: (1) PR validation applies all migrations plus the 4 SQL test files on a PostgreSQL 15 service. (2) Apply runs only by `workflow_dispatch`, in the chosen GitHub environment, with a concurrency lock. It requires the exact pending versions as input and stops if the pending list differs. It writes a step summary (actor, commit, pending, approved, time), does a dry run, then `db push --include-all`. CLI pinned to 2.122.1. The DB URL comes only from environment secrets. | js-yaml parse; Prettier. **Not run on GitHub.** |
| Seed tooling | CLI pinned to 2.122.1 in `seed-localhost.sh` and the guide | `bash -n` |
| Docs | `docs/database.md`: cash-only rule, new test file, migration list | — |

### 14.3 Requirement status changes

| Item | Status now | Notes |
|---|---|---|
| FR-09 | PASS (unit) | The SRS says only "produce an order slip for the staff". The slip content above is the smallest reading and should be confirmed with the client (with the printer, OI-02). |
| FR-20 | PARTIAL, **needs your decision** | SRS FR-20 says "send a notification to the Owner/Manager and the Barista/Service Staff"; SDS 4.1/4.3 mention only warm-colored tags and "low stock alerts with Restock" on the dashboard. Neither says what a notification is. Proposal (smallest): after any stock-changing response (checkout, sync, stock-out, stock-in), show the existing toast "Low stock: X, Y" / "Out of stock: Z" in POS and Admin for ingredients that crossed into Low or Out, plus a count badge on the Inventory menu item. No push or email. Not implemented. |
| FR-50 | PARTIAL | Code complete: Owner-only PUT/DELETE, both roles GET, 2 MB limit, PNG/JPEG/WebP by magic bytes, server-generated path, private bucket with 4 policies. UT covers upload, replace, invalid file and Barista refusal. Storage untested: no local stack; the live bucket is missing by decision. |
| NFR-08 | BLOCKED (no deployment) | Needed at deployment: Vercel serves HTTPS automatically, with HSTS on its domains. Add the custom domains `admin.`/`pos.gunitacoffee.com` (OI-09) and keep HTTP redirecting. In apps/api, set `ALLOWED_ORIGINS` to the two `https://` origins. Set `API_URL`/`NEXT_PUBLIC_API_URL` to the API's `https://` URL. Supabase URL is already https. Session cookies get `Secure` because `NODE_ENV=production`. Supabase Auth: Site URL and redirect URLs set to the https origins. |
| NFR-09 | PARTIAL | API enforcement unit-tested; the live database part (`20261120000000`) needs approval. Owner TOTP end to end NOT TESTED (no stack). |
| NFR-04/05 | NOT TESTED | No browser run was possible without a stack. Emulation (phone 360×800, iPhone 390×844, tablet 820×1180, desktop 1440×900) is still to do, and so is physical-device testing. |
| NFR-12 | Fixed locally, not run on GitHub | `ci.yml` parses: Node 22, pnpm 12.21.0, cache key fixed, secret check passes locally. Typecheck 9/9, lint 9/9 (1 warning), 430 tests, 3 builds, all on Node 22. actionlint could not be used (downloading its binary was refused in this session). |

### 14.4 Live migration history (read-only, this session)

Your brief listed `20261120000200` as pending and `20261120000300` as unrecorded. Live
`supabase_migrations.schema_migrations` shows otherwise: it has 8 rows, **including `20261120000200`,
`20261120000300` and `20261120000400`**, and the live schema matches `0200` (no SELECT on `unit_cost`,
add-on columns and CHECK present). The `0300` row exists because of the earlier recorded
`migration repair`, and all 74 of its products plus the 2 from `0400` are present. Pending on live:
`20261120000000`, `20261120000100` and now `20261120000500`. Nothing was applied, repaired or recorded.

### 14.5 Test results this pass

| Suite | Result |
|---|---|
| Typecheck (Node 22) | 9/9 |
| Lint | 9/9, 1 warning (as before) |
| vitest: contracts 45, auth 30, ui 51, mocks 63, api **115**, admin **35**, pos **91** | 430 pass |
| `next build` api, admin, pos | pass |
| PGlite full chain (11 migrations) + 4 SQL files | pass |
| PGlite live chain + `0500` + 3 SQL files | pass |
| PGlite seed + checks (with `0500`) | pass |
| Docker PostgreSQL, local Supabase, browser, viewport, concurrency | **BLOCKED** (no Docker) |
| Live | read-only only; unchanged |

## 15. Migration sequence audit (2026-11-19)

| Version | File | On live | Creates or changes |
|---|---|---|---|
| 20261116000000 | `initial_schema.sql` | applied | tables, `app_role()`, `app_user_id()`, checkout, views, RLS, `stock_insert` |
| 20261117000000 | `role_grants.sql` | applied | table grants |
| 20261118000000 | `owner_email.sql` | applied | `users.email`, `provision_initial_owner`, Auth email sync |
| 20261118000100 | `login_throttle.sql` | applied | `login_throttle` and functions |
| 20261119000000 | `phase2_core.sql` | applied | status trigger, costing, `set_product_recipe` |
| 20261120000000 | `owner_mfa_and_stock_roles.sql` | **pending** | replaces `app_role()`/`app_user_id()` bodies (aal2 for Owner); recreates `stock_insert` (Owner in, Barista out) |
| 20261120000100 | `product_images.sql` | **pending** | bucket `product-images`; 4 `storage.objects` policies |
| 20261120000200 | `ingredient_addons_cost_privacy.sql` | applied | add-on columns and CHECK, `unit_cost` column privilege, `v_inventory_status`, `ingredient_unit_costs()`, checkout |
| 20261120000300 | `official_menu_catalog.sql` | applied (recorded by an earlier, documented repair) | 74 products |
| 20261120000400 | `official_menu_catalog_additions.sql` | applied | 2 products |
| 20261120000500 | `payments_cash_only.sql` | **pending** | CHECK `payments_method_cash_check` |

**Finding.** The gap is a migration-history ordering issue, not a schema dependency. `0200`–`0400` neither
create nor replace any object that `0000` or `0100` touch, and `0000`/`0100` do not depend on `0200`–`0400`.
It happened because `0000` and `0100` were written first but held back for approval, while
`0200`–`0400` were approved and pushed separately from a temporary CLI workdir. The CLI therefore needs
`--include-all` for the older pending files.

**Resolution (Option A).** Keep every file as it is. Apply `0000`, `0100`, `0500` in that order, after
the API and Admin (`/mfa`) of this branch are deployed. No corrective migration and no `migration repair`.

| Check | Environment | Result |
|---|---|---|
| Live catalog vs PGlite chain of the 8 applied migrations (policies, functions, constraints, column grants, views, indexes, columns, products) | live read-only and PGlite | identical: 15/17/51/194/6/23/128, same product hash |
| Fresh order vs live order + pending: full catalog fingerprint, including storage policies and bucket | PGlite | identical |
| All 4 SQL test files on the fresh order and on live order + pending | PGlite | pass |
| Live chain, synthetic data, then `0000`, `0100`, `0500` (data kept, cash CHECK valid on existing rows) | PGlite | pass |
| Live preconditions: `stock_insert` and initial function bodies present; no bucket or name clashes; `postgres` may INSERT `storage.buckets`; `supautils.policy_grants` allows `storage.objects` policies; 0 payments | live read-only | met |
| `seed-localhost.sh` end to end with stubbed `npx`/`docker`/`curl` in a scratch repo | local | pass: env files written together with one proxy secret, accounts file written, rerun refused, non-local URL refused |
| `supabase start`, hosted Storage accepting `0100`, real Auth MFA | Docker or staging | **not run** |

Change from this audit: `seed-localhost.sh` now also writes one generated `INTERNAL_PROXY_SECRET` to the
three local env files, all three together or none. A fresh clone has no `.env.local`, and without the
secret every sign-in answers 503. The local-only target checks are unchanged.
