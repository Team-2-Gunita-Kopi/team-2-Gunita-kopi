# Session notes, November 2026 (history)

Moved from `CLAUDE.md` on 2026-11-24. Dated records; where they disagree with `CLAUDE.md` or the code, those win.

## Integration status (frontend to Phase 2 API, Nov 2026)

Work on `integration/phase2-frontend`, uncommitted until the user approves. Do not commit, push, merge into `main`, deploy to Vercel, or change the live database without explicit approval. Never touch or commit the untracked `my-skills/` folder.

- The Admin and POS screens call the real API through `apiData` / `apiAllPages` in each app's `lib/api-client.ts`, which validate every response with zod (`pageOf(...)` from contracts for lists). Feature modules: `apps/admin/src/features/{products,inventory,suppliers,reports,users,orders}/api.ts`, `apps/pos/src/features/{orders,inventory}/api.ts`. Pages keep their sample rows when `USE_MOCKS`.
- POS order mapping between `@gunita/contracts/ui` and `@gunita/contracts` is in `apps/pos/src/features/pos/api-mappers.ts` (tests: `apps/pos/tests/api-mappers.test.ts`): one product row plus one row per add-on, `online` is sent as `pre-order`, cash only, non-numeric (demo) ids are refused locally and never synced.
- Stock movement policy is Owner and Barista stock-in/out (Admin/POS), per user-approved POS permission update; API and RLS enforce it. `20261120000700_barista_stock_in.sql` was applied and verified on live Supabase on 2026-11-20. `20261120000800_restore_barista_stock_in.sql` is pending on live; it reasserts the permission after older pending migration `20261120000600` is eventually applied. Baristas may add a basic ingredient and opening stock through a restricted RPC, assigning an existing active supplier only; supplier creation/details, costs, add-on settings, edits, and deletes remain Owner-only. Migrations `20261120000900_barista_add_basic_ingredient.sql` and `20261120001000_barista_ingredient_supplier.sql` are local-only and must not be applied live without approval. The Owner order board only changes status; checkout (`POST /api/orders`, `/api/sync`) is Barista-only.
- Add-ons follow the SDS rule that add-on name and cost come from INGREDIENTS. In real mode `CustomizeModal.tsx` lists ingredients flagged `is_addon` (`inventoryAddons(ingredients)`) for the `ADDON_DRINK_CATEGORIES` (`Iced Coffee`, `Non-Coffee`) at ₱25.00 each; demo mode still uses the static `ADDON_CATALOG`. Live has no ingredients yet, so the POS shows no add-ons until the Owner configures them.
- Open decisions, do not guess: (1) which real ingredient and measured quantity back each of the 11 official add-ons (Handoff Notes E); (2) product images: upload route `apps/api/src/app/api/products/[id]/image/` and migration `20261120000100_product_images.sql` (private bucket `product-images`) exist locally, not applied live; (3) Owner second step is a 6-digit emailed code, not TOTP (password, then `POST /api/auth/otp`; approved `session_id`s in `owner_login_challenges`, enforced by `app_role()` and `requireUser`; migration `20261120001100_owner_email_otp.sql`, local only, supersedes the `aal2` rule of `20261120000000`; neither is applied live). The Owner is provisioned only by `scripts/provision-owner.mjs` (no registration page). Report printing is not implemented. FR-40 (staff on duty) is out of scope per the SRS; do not implement it. Forgot-password needs `{{ .Token }}` in the Supabase recovery email template and has not been tested live.
- Live testing so far is database-level only (read-only queries and one rolled-back role simulation; see Handoff Notes B). No live API test and no browser test has been run.

Checks on Node 22 when the default Node is newer (run from each package folder): `npx -y node@22 ../../node_modules/vitest/vitest.mjs run` and `npx -y node@22 node_modules/next/dist/bin/next build`. The SRS and SDS are not in the repo; they are in the user's Downloads folder (`Team 8 - SRS Documentation (Gunita Kopi POS System) - Web-Based.md`, `Gunita_Kopi_POS_SDS_updated (1).md`).

## Handoff Notes — Next Phase: API Integration and Live Testing

Last updated 2026-11-19 (live database and Git status re-verified the same day, after the code changes). Use this section to continue with API integration and live testing; the database work below is done and must not be repeated.

- **Verified** means checked by a command or read-only query in that session. Everything else is labelled **untested** or **assumption**.
- No secrets are recorded here. The live database password is in `supabase/.env.local` (gitignored); `SUPABASE_DB_URL` and `SUPABASE_ACCESS_TOKEN` there are empty.

### A. Current project state

**Branch and commit (verified):** `integration/phase2-frontend`, latest commit `7bf6ad5 docs: note migration timestamp ordering in CLAUDE.md`. Nothing has been committed, pushed, merged or deployed since.

**Git status (re-verified 2026-11-19):** 44 modified, 2 deleted, 28 untracked paths, all uncommitted.
- Deleted:
  - `apps/admin/src/app/(auth)/reset-password/page.tsx`
  - `apps/admin/src/lib/supabase-browser.ts`
- Untracked, ours:
  - Admin: `apps/admin/src/app/(auth)/mfa/`, `apps/admin/src/app/auth/mfa/`, `apps/admin/src/app/auth/recovery/`, `apps/admin/src/features/{inventory,orders,products,reports,suppliers,users}/api.ts`, `apps/admin/src/lib/safe-redirect.ts`, `apps/admin/tests/inventory-addons.test.tsx`
  - API: `apps/api/src/app/api/products/[id]/image/`
  - POS: `apps/pos/src/features/{inventory,orders}/api.ts`, `apps/pos/src/features/pos/api-mappers.ts`, `apps/pos/tests/api-mappers.test.ts`, `apps/pos/tests/customize-real.test.tsx`
  - Contracts: `packages/contracts/tests/addons.test.ts`
  - Migrations `supabase/migrations/20261120000000` to `20261120000400` (5 files)
  - `supabase/migrations/20261120000600_owner_stock_out.sql`
  - SQL tests `supabase/tests/roles_mfa_storage.test.sql`, `supabase/tests/addons_catalog_costs.test.sql`
- Untracked, not ours (present before this work; leave alone): `Gunita_Kopi_POS_SDS_updated (1).md`, `Team 8 - SRS Documentation (Gunita Kopi POS System) - Web-Based.md`.
- `my-skills/`: untracked and untouched. Never read, stage or commit it.

**Implementation status:**
- **Phase 1** (auth, username sign-in, sessions, sign-in throttle, Owner setup): committed on `main`; live migrations up to `20261118000100`.
- **Phase 2 core APIs** (catalog, recipes, costing, stock, orders, sync, reports): committed; live migration `20261119000000`.
- **Uncommitted on this branch:**
  - Frontend integration: Admin and POS call the real API through each app's `lib/api-client.ts`.
  - Owner MFA.
  - Server-side password recovery.
  - Product images.
  - Owner stock-in/out screen and authorization update.
- **Add-ons, uncommitted, implemented and active in real mode (verified in code):**
  - In `apps/pos/src/features/pos/components/CustomizeModal.tsx`, real mode builds the list with `inventoryAddons(ingredients)` when the product's category is in `ADDON_DRINK_CATEGORIES` (`Iced Coffee`, `Non-Coffee`). The heading reads "Add-ons — ₱25.00 each".
  - `apps/pos/src/app/(pos)/pos/page.tsx` passes the catalog `ingredients`.
  - Demo mode still uses `ADDON_CATALOG`.
  - Live has no ingredients yet, so the POS has nothing to show: the code is active, but no add-on data exists.
- **Ingredient cost privacy (uncommitted code; database part live):** Barista API responses omit `unitCost`; the Owner gets costs through `ingredient_unit_costs()`.

**Important code paths:**
- **API:**
  - Ingredients: `apps/api/src/modules/ingredients/service.ts` (`ownerUnitCosts`, add-on mapping in `toRow`), `apps/api/src/app/api/ingredients/route.ts`, `apps/api/src/app/api/ingredients/[id]/route.ts`.
  - Products and costing: `apps/api/src/modules/products/service.ts` (`getCosting`), `apps/api/src/app/api/products/[id]/costing/route.ts`, `apps/api/src/app/api/products/[id]/recipe/route.ts`.
  - Checkout and sync: `apps/api/src/modules/orders/service.ts` (`checkout`), `apps/api/src/app/api/sync/route.ts`.
  - Auth: `apps/api/src/lib/auth.ts`.
- **Contracts:** `packages/contracts/src/ingredients.ts` (`ADDON_SELLING_PRICE`, add-on rules), `packages/contracts/src/products.ts` (`ADDON_DRINK_CATEGORIES`), `packages/contracts/src/ui/rules/catalog.ts` (`inventoryAddons`), `packages/contracts/src/ui/pos.ts` (`PosIngredient.addon`).
- **Admin:** `apps/admin/src/app/(app)/inventory/page.tsx` (Add/Edit Ingredient "Add-on Configuration"), `apps/admin/src/features/inventory/api.ts`.
- **POS:** `apps/pos/src/features/pos/api-mappers.ts` (`toPosIngredient`, add-on order rows), `CustomizeModal.tsx`, `apps/pos/src/features/pos/components/CategoryTabs.tsx` (real categories), `apps/pos/src/app/(pos)/inventory/page.tsx` (no Unit Cost column).
- **Database:** `supabase/migrations/*.sql`, `supabase/tests/*.test.sql`, `packages/db-types/src/index.ts` (hand-edited for `0200`, not regenerated from live), `docs/database.md` ("Add-ons", "Official catalog", "Pending live configuration").

**Local test results.** These were run earlier on 2026-11-19, before the latest changes. **Rerun everything before live testing.**

| Check | Node version | Result |
|---|---|---|
| `pnpm typecheck` | 26 (machine default) | 9/9 pass |
| `pnpm lint` | 26 | 9/9 pass, 1 pre-existing warning in `apps/api/src/lib/mock-db.ts` |
| vitest: contracts 45, auth 30, ui 51, mocks 63, api 110, admin 33, pos 90 | 22 | all pass |
| `next build`: api, admin, pos | 22 | all compile |
| PGlite SQL tests: `phase2_core.test.sql`, `roles_mfa_storage.test.sql`, `addons_catalog_costs.test.sql` | default Node | pass |

- **What changed after the runs:**
  - Prettier was run on API and contracts files. Afterwards only the api and contracts vitest suites were rerun (110 and 45 pass); typecheck, lint, builds and the other suites were not.
  - `addons_catalog_costs.test.sql` was changed to expect 76 products and rerun (pass).
  - `CLAUDE.md` and `docs/database.md` edits are docs only.
- **PGlite harness:** it lived in the session scratchpad and may be gone. It ran `supabase/tests/supabase-stub.sql`, all migrations, then the test files, and supported `\set`, `\echo` and `\ir`.
- **Not run at all:** Docker/PostgreSQL SQL tests (no Docker on this machine), staging tests, live API tests, browser tests.

### B. Live Supabase status

Project `gunita-kopi-pos-dev`. All rows below were verified by read-only queries on 2026-11-19 and re-checked with one read-only query the same day (migration history, product and category counts, data counts, add-on columns and CHECK, column and function privileges, view options, bucket, `app_role()` aal check): unchanged. The rolled-back role simulation was not repeated.

**Applied and recorded** in `supabase_migrations.schema_migrations`, 8 rows, in order:
1. `20261116000000_initial_schema.sql`
2. `20261117000000_role_grants.sql`
3. `20261118000000_owner_email.sql`
4. `20261118000100_login_throttle.sql`
5. `20261119000000_phase2_core.sql`
6. `20261120000200_ingredient_addons_cost_privacy.sql`
7. `20261120000300_official_menu_catalog.sql`
8. `20261120000400_official_menu_catalog_additions.sql`

**About the last three:**
- `20261120000300` **is recorded.** Its insert was first run as SQL, then verified against the file (74/74 rows match by name, category and price), then recorded with `supabase migration repair --status applied 20261120000300`. Its inserts were not run a second time.
- `20261120000400` **is applied** with `supabase db push`. It added id 75 `Biscoff (Non Coffee)` (Non-Coffee, 120.00) and id 76 `Shanghai / Rice` (Gunita Meals, 60.00). A fingerprint of the other 74 products was identical before and after.
- `20261120000200` and `20261120000400` were each pushed with `--workdir` pointing at a temporary folder that held only the applied migrations plus the approved file.
- Applied but not recorded: **none.**

**Not applied:**
- `20261120000000_owner_mfa_and_stock_roles.sql`: live `app_role()` has no aal check, and the old `stock_insert` policy still lets the Owner record stock-out.
- `20261120000100_product_images.sql`: no `product-images` bucket.

**Products:** 76 in total; no duplicate names; all `is_available`; no description, image or `created_by`.

| Category | Products |
|---|---:|
| Iced Coffee | 24 |
| Non-Coffee | 24 |
| Silog Meals | 6 |
| Shawarma Meals | 5 |
| Gunita Meals | 8 |
| French Fries | 4 |
| Snacks | 5 |

**Add-on columns on `public.ingredients`:**
- `is_addon boolean not null default false`
- `addon_selling_price numeric(10,2)`, nullable, no default
- `addon_quantity numeric(10,2)`, nullable, no default
- CHECK `ingredients_addon_config_check` (validated) allows only `(false, NULL, NULL)` or `(true, 25.00, > 0)`.

**Permissions (database level):**
- Signed-in users (the `authenticated` role, Barista and Owner alike) have SELECT on every `ingredients` column except `unit_cost`; UPDATE on `unit_cost` remains (Owner only by RLS).
- Anonymous users have no SELECT on `ingredients`.
- `public.ingredient_unit_costs()` is SECURITY DEFINER with `search_path=""`; signed-in users may execute it, anonymous users may not.
- `public.recalculate_product_costing(integer)` is not executable by signed-in or anonymous users. `product_ingredients_recost` and `ingredients_recost` are SECURITY DEFINER.
- `public.process_checkout_transaction(jsonb)`: signed-in users only; it uses `addon_selling_price` and `addon_quantity`.
- `public.v_inventory_status` is `security_invoker=true`, has no `unit_cost` and has the three add-on columns. Signed-in users have SELECT.
- **Session simulation:** one rolled-back transaction with temporary Owner and Barista rows (none remained afterwards):
  - Barista: direct `unit_cost` select, `ingredient_unit_costs()` and `recalculate_product_costing()` all denied; the inventory view and add-on columns are readable; changes to add-on settings have no effect.
  - Owner: cost via the function returned 1.50; a direct `unit_cost` select is denied, as designed; a `unit_cost` update works.
  - Constraint: price 30 rejected, missing quantity rejected, (25, 18) accepted.

**Live data counts:** 0 `public.users`, 0 `auth.users`, 0 ingredients, 0 suppliers, 0 recipe rows (`product_ingredients`), 0 `product_costing`, 0 orders, 0 payments, 0 stock transactions, 76 products. Nobody can sign in yet.

**Testing so far:** everything above is **database-level** (SQL queries and a rolled-back simulation). **No live API test and no browser test has been run.** API behaviour against live is untested.

### C. Deployment warnings

- **`20261120000200` is live.** The `main` API reads `unit_cost` from `v_inventory_status` and through `ingredients(unit_cost)` embeds, so its ingredient list, recipe and costing endpoints fail against live. **Do not run or deploy the `main` API against live.**
- **Matching code is local only.** This branch's API, Admin and POS match live, but they are uncommitted and undeployed. No Vercel deployment link was found locally, and the app env files point at localhost; assumption: nothing is deployed, but Vercel itself was not checked.
- **Do not run a plain `supabase db push`.** `20261120000000` and `20261120000100` are pending but older than the newest applied version (`20261120000400`). A push needs `--include-all`, which applies both. Each needs separate approval:
  - `20261120000000`: deploy the Admin `/mfa` page and this branch's API **first**. From then on an Owner session without the second step reads no data.
  - `20261120000100`: creates the private bucket `product-images`. If the migration role cannot write `storage.buckets`, create the bucket in the Dashboard (2 MB; PNG, JPEG, WebP) and keep the policies.
- **Applying one approved migration alone:**
  - Copy `supabase/config.toml`, the applied migrations and the approved file into `<tmp>/supabase/migrations/`.
  - Run `npx supabase@2 db push --dry-run --workdir <tmp> --db-url "<url>"`, check that only the approved file is listed, then rerun without `--dry-run`.
  - Keep the URL in an environment variable, never printed.
  - Direct host `db.<project-ref>.supabase.co:5432` with the password from `supabase/.env.local` worked.
  - `npx supabase@2 db query` runs single statements only ("cannot insert multiple commands into a prepared statement"); use it for checks, not whole migration files.
- **Ordering rules:**
  - New migration files need timestamps above `20261120000500`.
  - Applied migrations are never edited; add a new one.
  - After deploying this branch, run `pnpm db:types` against live to confirm `packages/db-types`.
- **Backups:** Free plan; no backup or point-in-time restore was confirmed. Before a risky change:
  - Capture the definitions to be changed (views, functions, grants) and write a rollback script.
  - The rollback for `0200` sat in the session scratchpad and may be gone.
  - Live data is still empty except the 76 products.

### D. Next phase: API and live testing

All unchecked; nothing here has been done. Run this branch locally (`pnpm dev`: admin :3000, pos :3001, api :3002) against live, or deploy it first.

- [ ] **Rerun local checks** before live testing: `pnpm typecheck`, `pnpm lint`, vitest in every package on Node 22, `next build` for api, admin and pos on Node 22, and the SQL tests.
- [ ] **Live API connectivity:** `GET /api/health`.
  - `apps/api/.env.local` needs the Supabase URL, publishable key and `SUPABASE_SERVICE_ROLE_KEY`.
  - The same `INTERNAL_PROXY_SECRET` must be set in api, admin and pos.
  - `API_URL` for admin and pos.
- [ ] **Owner authentication:**
  - Create the Owner once with `POST /api/setup/owner` and header `X-Setup-Token`.
  - Admin username sign-in; wrong password; sign-in throttle (503 fail-closed when the store or client IP is missing).
  - Sign out; password recovery (needs the live template, see E).
  - MFA cannot be tested until `20261120000000` is approved.
- [ ] **Barista authentication:**
  - Create through `POST /api/admin/employees`.
  - POS sign-in; the Admin site refuses a Barista; an inactive account is refused (403).
- [ ] **Ingredient Add and Edit, including add-ons:**
  - `POST /api/ingredients` for a regular ingredient (saved `false`/NULL/NULL) and an add-on (`isAddon: true`, `addonQuantity`; saved `addon_selling_price` 25.00).
  - `PATCH /api/ingredients/{id}` turning an add-on on and off; stock and history unchanged.
  - 400 for a missing, zero or negative quantity, and for a quantity without `isAddon`.
  - A client-sent `addonSellingPrice` is ignored.
  - Barista POST or PATCH gets 403.
- [ ] **Owner-only cost retrieval:**
  - The Owner's `GET /api/ingredients` and `/api/ingredients/{id}` include `unitCost` (served by `ingredient_unit_costs()`).
  - Admin Inventory shows the Unit Cost column.
- [ ] **Barista responses without costs:**
  - `GET /api/ingredients` and `/api/ingredients/{id}` have no `unitCost` key.
  - 403 on `/api/products/{id}/recipe`, `/api/products/{id}/costing`, `/api/reports/*` and `/api/dashboard`.
  - A Barista token used against the Data API: selecting `ingredients.unit_cost` is refused.
- [ ] **Products and recipes:**
  - `GET /api/products` returns 76 products.
  - Product edit and availability.
  - `PUT /api/products/{id}/recipe`.
  - `GET /api/products/{id}/costing` recalculates after a `unit_cost` change; packaging cost via `PUT .../costing`.
- [ ] **Add-on checkout and stock deduction** (`POST /api/orders`, Barista):
  - One product row plus one row per add-on (`is_addon`, `ingredient_id`, quantity = selections, `unit_price` 25, subtotal).
  - Stock deducted = recipe usage + quantity × `addon_quantity`.
  - Errors: `PRICE_CONFLICT` for a stale price, `CONFLICT` for a disabled or non-add-on ingredient, `STOCK_CONFLICT` for short stock, 400 for non-cash payment or underpayment.
- [ ] **Duplicate checkout and idempotency:** the same `clientTxId` twice returns `duplicate: true` and creates no second payment, order rows or stock movement.
- [ ] **Offline sync:**
  - A POS sale while offline goes to the Dexie outbox, then `POST /api/sync`; the queue number comes from the server.
  - Conflicts are shown as failed; an order is never marked synced before the server confirms; demo ids are never sent.
- [ ] **Admin browser:** login, dashboard, products, recipe costing, inventory (list, Add/Edit Ingredient with "Add-on Configuration", stock-in, history), suppliers, orders board, reports, users.
- [ ] **POS browser:**
  - Category tabs show the 7 menu categories.
  - Customize modal: "Add-ons — ₱25.00 each" for Iced Coffee and Non-Coffee, none for food, "Not enough stock" when stock is below one selection.
  - Cart, payment, receipt; Inventory tab (no Unit Cost column); stock-out; idle logout.
- [ ] **Error handling and permissions:**
  - 401 without a token, 403 for the wrong role.
  - 400 `VALIDATION_ERROR` for bad bodies; no 5xx details reach clients.
  - Each site's same-origin `/api` proxy refuses cross-site requests.
  - `audit_logs` rows for privileged actions.
- [ ] **Database consistency and inventory:**
  - After each scenario, compare `orders`, `payments`, `stock_transactions.remaining_stock` and `ingredients.current_stock` with expectations.
  - No negative stock; `product_costing` matches the recipe × unit cost.
- [ ] **Remaining SQL and staging tests:**
  - The Docker/PostgreSQL SQL tests (command in `docs/database.md`, "Testing the database rules locally").
  - Full migration order on a staging project or branch, including `0000` and `0100`, before they reach live.

### E. Outstanding decisions and tasks

- **Ingredients and suppliers:** none exist live. The Owner enters real records in Admin, Inventory: name, unit, supplier, reorder level, unit cost. Opening stock is a stock-in, not a form field. Do not invent shop data; mark any test data as temporary and remove it.
- **11 official add-ons, none mapped yet:** Biscoff (Spread/Biscuits), Caramel, Chocolate, Espresso Extra Shots, Gunita, Jam, Matcha, Milk, Oreo Biscuits, Sauce, Syrup.
  - Each needs exactly one ingredient record with "Available as a POS add-on" turned on.
  - The Owner must say which real ingredient Biscoff (spread or biscuits), Sauce, Syrup, Milk and Gunita are.
  - The POS shows the ingredient name as the add-on label, so either name ingredients with the menu names or approve a display-name field.
- **Measured quantities:** the amount consumed per add-on selection (in the ingredient's unit) is unknown for all 11 and must come from shop measurements.
- **Recipes:** no `product_ingredients` rows exist for the 76 products. Until they are entered, a sale deducts no stock and costing shows 0.
- **Menu decisions still open:**
  - The 6 orange-board drinks are not inserted: Brusko Kopi, Kopi Latte, Tres Leches, White Chocolate, Matcha Latte, Matcha Papaya. Their category heading is not visible, and the photo and transcription differ (for example "Matcha Peppermint", "White Chocolate Mocha", Tres Leches at 94).
  - The orange board's prices for Butterscotch, Caramel Macchiato, Long Black, Spanish Latte, Mocha Latte, Sea Salt Latte and Salted Caramel conflict with the main menu; the main-menu prices are used.
  - Asterisks on Shawarma Burger and Cheese Pancakes have no stated meaning.
  - French Fries flavours go in `orders.customization`; the new categories have no quick-choice buttons (`QUICK_CHIPS`).
- **Migrations needing separate approval:** `20261120000000_owner_mfa_and_stock_roles.sql` and `20261120000100_product_images.sql` (see C).
- **Live Auth configuration** (not done; needs approval):
  - Confirm TOTP MFA is enabled.
  - The "Reset Password" email template must contain `{{ .Token }}`.
  - Set the Email OTP expiry; set up custom SMTP.
  - Turn off "Allow new users to sign up".
  - Raise Supabase's per-IP sign-in limit so the app's own throttle trips first.
  - Recovery and MFA are untested live.
- **Scope reminders:**
  - FR-40 (staff on duty) is out of scope and must not be implemented. Attendance, scheduling and timekeeping are out of scope.
  - Report printing is not implemented.
  - Add-on rows are not linked to their drink, so "drinks only" is enforced by the POS only.

## Current Project Status and Testing Handover Summary

Written 2026-11-20 for the `testing/local-supabase-handover` branch. Details and evidence are in
`docs/testing/system-validation-report.md` (§14 and §15), `docs/testing/api-testing-report.md`,
`docs/testing/localhost-manual-testing-guide.md` and `docs/database.md` ("Migration order audit").

### A. Architecture

- Gunita Kopi POS: a pnpm 12.21.0 + Turborepo monorepo, Node 22 (`.nvmrc`).
- Three Next.js 15 apps:
  - `apps/admin`: Owner portal, :3000.
  - `apps/pos`: Barista offline-first PWA, :3001.
  - `apps/api`: Route Handlers, the only holder of the service-role key, :3002.
- Shared packages: `contracts`, `db-types`, `auth`, `ui`, `config`, `mocks`.
- Supabase provides PostgreSQL (RLS on every table), Auth and Storage.
- Planned hosting: Vercel, three projects. Checks: GitHub Actions (`ci.yml`, `db-migrations.yml`). Nothing is deployed yet.

### B. Implementation and rules that must hold

- **Sign-in:**
  - Username sign-in through each site's `/auth/login`, with the session in an HttpOnly cookie; the browser never holds a token.
  - Throttled in Postgres and fails closed.
  - No public sign-up: the Owner is created once via `/api/setup/owner`, and baristas via `/api/admin/employees`.
- **Roles:** `owner_admin` (Admin site) and `barista` (POS site), checked on every API call against `public.users` and again by RLS.
  - Owner second step: a 6-digit code emailed on every sign-in (Supabase email OTP, 5 minutes, single use; 3 sends, 5 attempts per sign-in). Only sessions apps/api approved count (`app_role()`, `requireUser` answers `MFA_REQUIRED`). No TOTP. One Owner only (`users_single_owner`).
  - Stock: the Owner records stock-in and stock-out; the Barista can record stock-in and stock-out from POS.
- **Modules:**
  - Catalog: the 76 official products.
  - Ingredients and suppliers.
  - Inventory status, stock-in, stock-out and history.
  - Recipes and costing: ingredient cost is derived by the database; the Owner enters packaging cost. The batch list is `GET /api/products/costing`.
  - Add-ons: ingredients flagged `is_addon`, fixed ₱25.00, drinks only.
  - Checkout: `process_checkout_transaction`, atomic and idempotent on `client_tx_id`.
  - Offline outbox and `/api/sync`.
  - Order board with status transitions.
  - Receipt plus "Order slip" view (FR-09).
  - Reports (daily, monthly, best sellers, stock) and the dashboard.
  - User management.
- **Ingredient costs are Owner-only:** no `unit_cost` column privilege; the Owner reads costs through `ingredient_unit_costs()`, and Barista responses have no cost fields.
- **Cash only:** enforced by the API, and by the database CHECK `payments_method_cash_check` (migration `20261120000500`).
- Checkout and stock deductions must stay atomic and idempotent.
- Mock or demo data (`NEXT_PUBLIC_USE_MOCKS`, `MOCK_MODE`, `packages/mocks`) must never reach production. The synthetic seed is for local stacks only.
- FR-40 (staff on duty) is out of scope.

### C. Migrations

- **Live history (checked 2026-11-20).** Applied:
  - `20261116000000_initial_schema`
  - `20261117000000_role_grants`
  - `20261118000000_owner_email`
  - `20261118000100_login_throttle`
  - `20261119000000_phase2_core`
  - `20261120000200_ingredient_addons_cost_privacy`
  - `20261120000300_official_menu_catalog`
  - `20261120000400_official_menu_catalog_additions`
  - `20261120000700_barista_stock_in` (applied and recorded through Supabase SQL Editor)
- **Applied on live 2026-11-20** (one `db push --include-all` from a temporary workdir holding only applied + approved files, after a dry run listed exactly these; verified read-only afterwards):
  - `20261120000000_owner_mfa_and_stock_roles`, `20261120000100_product_images`, `20261120000500_payments_cash_only`, `20261120000600_owner_stock_out`, `20261120000800_restore_barista_stock_in`, `20261120001100_owner_email_otp`
- **Live Auth config set 2026-11-20 via the Management API (verified):** sign-ups off; email OTP 6 digits, 300 s; Magic Link and Recovery templates show `{{ .Token }}`; SMTP Resend (`smtp.resend.com:587`, sender `onboarding@resend.dev`, so mail reaches only the Resend account email admingunitakopi@gmail.com); email rate limit 30/h; TOTP off. No live Owner account yet.
- **Pending on live (need separate approval):** `20261120000900_barista_add_basic_ingredient`, `20261120001000_barista_ingredient_supplier`.
- **Connecting from this network:** the direct host `db.<ref>.supabase.co` is IPv6-only and does not resolve here; use the session pooler `aws-0-ap-southeast-1.pooler.supabase.com:5432`, user `postgres.<ref>` (URL in gitignored `supabase/.env.local`).
- **Audit result:** an ordering issue in migration history, not a demonstrated schema dependency.
  - The pending files touch only `app_role()`/`app_user_id()`, the `stock_insert` policy, Storage, and one `payments` CHECK.
  - `0200`–`0400` do not create or replace any of these.
  - A fresh order and live order plus pending gave identical catalogs, and the live catalog equals the simulated applied chain.
  - `00700` is recorded before older pending `00600`. Applying `00600` later would restrict Barista inserts to stock-out, so `00800` reasserts the approved policy afterward.
  - No `migration repair` is needed.
- **Proposed production order (a plan only; nothing here is authorized):**
  1. Deploy the compatible API and Admin (password + emailed code), with the Magic Link template showing `{{ .Token }}` and custom SMTP.
  2. Apply `20261120000000`.
  3. Apply `20261120000100`.
  4. Apply `20261120000500`.
  5. Apply `20261120000600`, then `20261120000800` to preserve Barista stock-in.
  6. Apply `20261120001100` in the same push as `0000` (alone, `0000` locks the Owner out).
- `supabase db push --include-all` applies **every** local migration missing from remote history. Run it only after a `--dry-run`, or the `db-migrations.yml` manual job, has shown exactly the approved pending versions.
- **Limitation:** the schema comparison and SQL tests ran on PGlite. They have not run on real Supabase or Docker PostgreSQL, and hosted Storage accepting `0100` is unproven.

### D. Local Supabase handover (groupmate)

Use the **local** Supabase stack only. Never point local apps at the team's production project, and
never run `supabase link`, `db push` or `migration repair` against it.

```bash
git clone --branch testing/local-supabase-handover https://github.com/Team-2-Sweet-Creatures/team-2-Gunita-kopi.git
cd team-2-Gunita-kopi
node -v                                        # v22.x
npx -y pnpm@12.21.0 install --frozen-lockfile
docker ps                                      # Docker Desktop running
cp -n supabase/.env.example supabase/.env      # email settings for the local stack (codes go to http://127.0.0.1:54326)
npx -y supabase@2.122.1 start
bash supabase/seed/seed-localhost.sh
npx -y pnpm@12.21.0 dev
```

- Admin http://localhost:3000, POS http://localhost:3001/staff, API http://localhost:3002.
- Accounts:
  - `testowner` (Owner) signs in on the Admin site, then enters the emailed code from Inbucket (http://localhost:54326).
  - `testbarista` (Barista) uses the POS site.
- Passwords are generated by the seed and stored in the gitignored `supabase/.env.seed-accounts.local`.
- The seed also writes gitignored `apps/*/.env.development.local` files: the local URL and keys, plus one shared `INTERNAL_PROXY_SECRET`.
- The seed refuses non-local targets and refuses to run twice. Never reset or clean the seeded data without approval.

### E. Outstanding

- Docker-based local Supabase testing has not been done on the original machine (Docker is not installed).
- Not yet tested end to end:
  - Owner MFA.
  - Storage (image upload).
  - Browser and responsive layouts.
  - Physical devices.
  - Concurrent checkout.
- Neither workflow has completed a real GitHub Actions run.
- Decisions needed:
  - FR-20 low-stock notification behaviour (proposal in the validation report §14.3).
  - Order-slip content, to confirm with the client.
- Production migrations, deployment and the live Owner account each need separate approval.

### F. Git and deployment safety

- Do not merge `testing/local-supabase-handover` into `main` without approval.
- No Vercel production deploys.
- No migrations on production, and no repair of live migration history.
- Never commit secrets or `.env*` files (only `.env.example`).
- Never touch or commit `my-skills/`.
- Keep the SRS and SDS Markdown files in the repository root out of this branch.

## Session summary — 2026-11-21 afternoon (from about 3 PM), jhnjffryyy with Claude Code

Branch `testing/local-supabase-handover`. Testing was on the local Docker Supabase stack (see
"Local Supabase handover"); live means project `gunita-kopi-pos-dev`. Earlier the same day the POS
was matched to the Figma Staff frames and pushed (see below).

### Pushed to GitHub (`testing/local-supabase-handover`, no co-author trailers)

- `51a5838 feat(pos): match the Staff POS Figma mockups at 1180x820`: 197 px sidebar, compact top bar
  with per-screen titles, one-row scrolling category tabs, 259 px cart, Figma category icons,
  name/description/price cards, search icon, payment dialog layout, centered tables, stock badge
  icons, clickable order rows with hover, light calendar icons, dark scrollbars, staff login wording,
  phone layout fix, "…" menu only in demo mode.
- `1617d62 chore(supabase): local draft descriptions for all 76 products`.

### Live database changes (all approved by jhnjffryyy, verified with read-only queries)

- Product descriptions: all 76 products got short drafted descriptions (only empty ones were filled).
- Demo ingredients and recipes: 67 ingredients with unit, unit cost and reorder level, and 484
  `product_ingredients` rows, so every product has a recipe; costing recalculated by trigger
  (e.g. Spanish Latte PHP 50.60). Script: `supabase/seed/demo_ingredients_recipes.sql`. The client has
  no real recipe data; these are invented demo values to replace when real recipes arrive.
- Add-ons: the 11 menu-board add-ons (PHP 25, drinks only) mapped to existing ingredients: Biscoff
  Spread 20 g, Caramel Sauce 20 ml, Chocolate Sauce 20 ml, Espresso Beans 18 g, Gunita House Syrup
  20 ml, Strawberry Jam 25 g, Matcha Powder 3 g, Fresh Milk 60 ml, Oreo Biscuits 2 pcs, Salted
  Caramel Sauce 20 ml, Sugar Syrup 20 ml. The POS shows the ingredient name as the add-on label.
- Live stock is still 0 for every ingredient, so the live POS shows products as out of stock until
  stock-ins are recorded. No migrations were run; the CLI link file was removed after each query.

### Local stack

- The local database was reset (by jhnjffryyy) and reseeded with `SEED_DATA=demo bash
  supabase/seed/seed-localhost.sh`: the same demo ingredients, recipes and add-ons as live, test
  accounts `testowner` / `testbarista` (passwords in `supabase/.env.seed-accounts.local`), and opening
  stock (4 x reorder level) recorded as stock-ins with realistic remarks such as "Dairy delivery".
  Without `SEED_DATA=demo` the script still loads the old synthetic data.
- New seed files: `demo_ingredients_recipes.sql`, `demo_localhost_accounts_stock.sql`,
  `product_descriptions_localhost.sql` (all in `supabase/seed/`).

### Uncommitted code changes (not pushed yet)

- Owner portal matched to the Figma Owner frames: header "…" menu only in demo mode; header shows the
  signed-in name (display-only `sessionStorage` key `gk-admin-owner-name`); invisible light-theme
  page titles and grays replaced with the dark palette; "GUNITA · ADMIN" headings; green "+ Add"
  buttons; stock and account status badges with icons; Owner typography (title 28 px, small heading
  11.5 px, section titles 17.6 px).
- Fonts: Fira Code is bundled locally (`next/font/local`) in both apps because the Google Fonts
  download failed at dev start and left all numbers in a fallback font.
- Scrollbars and tables (Owner and POS): green scrollbar thumb on a dark track; table boxes capped at
  `max(260px, 100dvh - 22rem)` so the bottom and right scrollbars stay on screen; sticky table headers;
  Products and Inventory tables fit without sideways scrolling from 1200 px up.
- Suppliers: Name, Contact Person, Number, Address, Status, Ingredients (count), Actions (Edit,
  Deactivate).
- Reports: per-tab titles; Daily Sales with a date picker, Sales / Orders / Avg Order cards, a 7-day
  table and the orders of that day; Stock Status with Unit, Current Stock, Reorder Level, Status and a
  "Low stock only" filter. Export CSV uses the table headings, readable labels and a UTF-8 BOM (Excel
  shows PHP signs) and downloads in every browser (`downloadCsv` in
  `apps/admin/src/features/reports/api.ts`). Print now prints the page (it was blank); receipts still
  print only the receipt.
- Users: list, Add User and Edit User views like Figma. No role field: new accounts are always
  baristas; roles never change. Edit changes the full name, status (baristas) and password. API:
  `PATCH /api/users/{id}` accepts `password` (Owner only, 8-72 characters, set through Supabase Auth
  admin; the audit log records `passwordChanged`, never the password).
- Order slip: removed on request, then restored; it is unchanged from the committed version.
- Tests added: `apps/admin/tests/users-page.test.tsx`, `reports-export.test.ts`,
  `reports-buttons.test.tsx`, and Owner-password tests in `apps/api/tests/phase2-api.test.ts`.
  Last runs: api 137, admin 71, pos 106, ui 54, contracts 46, all passing.

### Open items

- Commit and push the uncommitted changes above after review.
- Typecheck still reports the old `tailwind.config.ts` type error in admin and pos (not from today).
- Repeated automated Owner sign-ins trip the sign-in throttle; wait a few minutes before retrying.
- Live: record stock-ins before live POS testing; real recipes, add-on amounts and descriptions
  should come from the shop.
- FR-09 (order slip) stays implemented.

## Session summary — 2026-11-22/23, branch `testing/frontend-and-backend-v2` (mnrdmsqt with Claude Code)

Work started on `testing/local-supabase-handover` by mistake; switched (approved) to a local
`testing/frontend-and-backend-v2` tracking origin at `3a94abd`. Everything below is **uncommitted**
unless marked live. A classmate's log (`~/Downloads/session-log-2026-11-22.md`) was from the wrong
branch; its `hardNavigate()` and recovery-link changes are NOT on this branch.

### Environment (this machine)

- No Docker, so no local Supabase. `apps/{admin,pos,api}/.env.local` point at hosted
  `gunita-kopi-pos-dev` (ref `ntgk…`), so every edit in the apps (users, passwords, orders, stock)
  writes to live. Approved by the user for live testing.
- Fixed env (gitignored files, approved): `INTERNAL_PROXY_SECRET` was missing in admin/pos (API logged
  `auth.proxy_secret_rejected`, sign-in 503); `NEXT_PUBLIC_SUPABASE_ANON_KEY` in admin/pos held the
  Supabase URL instead of a key (Owner code accepted, then "Sign-in failed" in `storeSession`). Both now
  match `apps/api/.env.local` (publishable key).
- Do not start a second `next dev` while the user's `pnpm dev` runs (ports 3000-3002, shared `.next`).
- Hosted DB from this network: session pooler `aws-0-ap-southeast-1.pooler.supabase.com:5432`, user
  `postgres.<ref>`, password from `supabase/.env.local`; run the CLI with a temp `--workdir` holding a
  minimal `config.toml` (the repo config fails on `auth.email.smtp.enabled` without `supabase/.env`).

### Code changes (uncommitted)

- **Auth / sign-in**
  - `packages/auth/src/session-server.ts`: `storeSession` logs `auth.store_session_failed` (status, code).
  - Double sign-in fixed: opening `/` gave `/login?redirect=/`, and `/` always redirected to `/login`.
    `apps/admin/src/app/page.tsx` now redirects to `/dashboard`, `apps/pos/src/app/page.tsx` to `/pos`.
    Tests `apps/{admin,pos}/tests/home-redirect.test.ts`.
  - Barista sign-in uses the linked Auth account's email (`auth.admin.getUserById`) instead of rebuilding
    it from the username (`apps/api/src/modules/session/service.ts`), so renamed users still sign in.
    Usernames must be lowercase with no spaces (sign-in input is normalized).
- **Users module** (approved by jhnjffryyy): Owner can edit any username and full name;
  `PATCH /api/users/{id}` writes `username` with the service role, then syncs Auth `user_metadata` and, for
  Baristas, the internal email `<username>@staff.gunitakopi.local`. The Owner's own new password needs
  `currentPassword` (checked with `signInWithPassword`, check session revoked); Owner-set Barista
  passwords do not. Files: `packages/contracts/src/users.ts`, `apps/api/src/modules/users/service.ts`,
  `apps/admin/src/app/(app)/users/page.tsx` (Username editable, "Current password" box on the Owner).
- **API root**: `apps/api/src/app/route.ts` serves a small HTML status page (API running + a live
  Supabase Auth `/auth/v1/health` check, 3 s timeout, no URLs or keys). `/api/health` unchanged JSON.
- **Orders lists** (Admin `/orders`, POS `/orders`, queued offline orders): one row per item; add-on lines
  folded in (names under Ingredient, `×n`, Unit Price = item + add-ons per unit). Display only; the DB
  still stores one line per add-on. Dashboard "Orders today" was already correct (distinct `order_id`).
- **Design changes approved by jhnjffryyy** (Design Freeze still applies to everything else):
  - Dashboard Low stock alerts matched to Figma 510:6830 (`.owner-mode .stock-alerts*` CSS).
  - Dashboard Recent orders show date + time ("Nov 22, 7:56 PM"), time column 150px.
  - Add Product is a page `/products/new` (Figma 1076:5) using shared
    `apps/admin/src/features/products/ProductForm.tsx` (also used by Edit); old dialog removed.
  - Admin Add/Edit ingredient dialog (Figma 510:4463): two-column grid, Unit select (g/ml/pcs), Opening
    stock on add (recorded as a stock-in "Opening stock"), add-on settings kept below.
  - POS Add ingredient dialog (Figma 317:17034): equal columns, disabled "Unit cost (₱) — Set by
    Owner" (Baristas never send costs), note removed.
- Not mine, left for review: kicker text on Products/Reports/Suppliers changed to "Gunita · … Board".

### Database

- New migration `supabase/migrations/20261120001200_cancel_returns_stock.sql`: statement trigger
  `orders_cancel_returns_stock` records one stock-in per ingredient ("Cancelled order #N") when an order
  is cancelled. Test `supabase/tests/cancel_returns_stock.test.sql`; `docs/database.md` updated.
- SQL tests run on PGlite **0.2.17** under **Node 22** (0.3.x crashes); runner only in the session
  scratchpad. All 5 SQL test files pass.

### Live changes (each approved by the user)

- Migration `20261120001200` applied (dry run listed only it). Live history: 16 rows, latest
  `20261120001200`. Still NOT applied: `0900`, `1000` (the POS Add ingredient dialog needs them).
- Opening stock: 66 ingredients got one Owner stock-in of 4 × reorder level, remark "Opening stock
  (demo values, replace with real count)". Oreo Biscuits kept the user's own 1000 pcs.
- User 6 renamed by hand in Supabase to `"Juan "`: set to `juan`, Auth email
  `juan@staff.gunitakopi.local`, metadata `juan` / `Juan Dela Cruz`; `gelo1414` no longer exists
  except one `employee.create` audit row. Barista `makmak` is inactive and its profile row was deleted
  outside the app (Auth user remains).
- Test order #5 (cancelled, 14 lines) deleted with its payment, 17 stock-outs (amounts added back) and
  1 audit row.
- Owner `admingunita` exists on live (password shared in chat; weak, change it).

### Checks and open items

- Last runs (Node 22): api 143, admin 75, pos 107, contracts 46, auth 31 vitest pass; typecheck clean;
  lint only the old `apps/api` mock-db warning.
- Not done: `next build`, browser checks at 1536/1366/1180/1024/820/390, live Owner sign-in after the
  fixes, a live cancel to confirm stock return.
- Decide: apply `0900` + `1000` on live; replace demo opening stock with real counts; commit and push
  after review (no co-author trailers).
