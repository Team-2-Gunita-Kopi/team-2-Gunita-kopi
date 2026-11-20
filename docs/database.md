# Database

Supabase PostgreSQL. The schema follows SDS v3 section 3 (9 tables, 6 views) plus the pure web changes in SDS 3.11.
Source of truth: `supabase/migrations/` (`20261116000000_initial_schema.sql`, then `20261117000000_role_grants.sql`, which grants table privileges explicitly because new Supabase projects no longer do, then `20261118000000_owner_email.sql` for the Owner email and privilege hardening, then `20261118000100_login_throttle.sql` for sign-in rate limiting). TypeScript types: `packages/db-types`.

## Tables

| Table                 | Key                     | Notes                                                                                                                                                                                                                                                                               |
| --------------------- | ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `users`               | `user_id`               | Employee profile. `auth_user_id` links to `auth.users`. No password column: Supabase Auth owns credentials. `role` is `owner_admin` or `barista`; `status` is `active` or `inactive`. `email`: Owner only (required), NULL for baristas; trimmed, lowercased, unique ignoring case. |
| `suppliers`           | `supplier_id`           |                                                                                                                                                                                                                                                                                     |
| `ingredients`         | `ingredient_id`         | Stock items and add-ons. `current_stock` is maintained by `stock_transactions`. `is_addon`, `addon_selling_price` (fixed 25.00), `addon_quantity`: see "Add-ons". `unit_cost` is Owner-only.                                                                                       |
| `products`            | `product_id`            | `created_by` → `users`.                                                                                                                                                                                                                                                             |
| `product_ingredients` | `product_ingredient_id` | Recipe. Unique `(product_id, ingredient_id)`.                                                                                                                                                                                                                                       |
| `product_costing`     | `costing_id`            | One row per product. `total_cost` is generated (`ingredient_cost + packaging_cost`).                                                                                                                                                                                                |
| `stock_transactions`  | `stock_trans_id`        | Append-only. A trigger updates `ingredients.current_stock`, sets `remaining_stock`, and raises `STOCK_CONFLICT` instead of going negative.                                                                                                                                          |
| `orders`              | `order_line_id`         | One row per item; rows of one sale share `order_id` (the queue number) and `client_tx_id`. A CHECK enforces: add-on rows have `ingredient_id`, product rows have `product_id`.                                                                                                      |
| `payments`            | `payment_id`            | `order_id` is indexed, not a FK (SDS 3.8). `client_tx_id` is unique: the database-level idempotency key.                                                                                                                                                                            |
| `audit_logs`          | `audit_id`              | Privileged actions. Service role only.                                                                                                                                                                                                                                              |

On-delete rules follow SDS 3.6 (set null for user/supplier links, cascade for recipe/costing, restrict for history).

## Views

`v_sales`, `v_order_totals`, `v_daily_sales`, `v_monthly_sales`, `v_best_sellers`, `v_inventory_status`.
All use `security_invoker`, so the caller's RLS applies. The four sales report views return rows to `owner_admin` only (FR-30). Dates are grouped in `Asia/Manila`.

## Checkout

`process_checkout_transaction(p_order jsonb)` is the only way to create orders and payments. In one transaction it:
returns the existing order if `client_tx_id` was already saved, rechecks prices (`PRICE_CONFLICT`),
takes the next `order_id` from `order_id_seq`, writes order rows and the payment, and writes stock-out rows from recipes and add-ons (`STOCK_CONFLICT` rolls everything back).
Add-on rows are charged `ingredients.addon_selling_price` and use `orders.quantity * ingredients.addon_quantity` of stock (migration `20261120000200`).
The acting user comes from `auth.uid()`, never from the payload.
Payments are cash only at the database level too: CHECK `payments_method_cash_check` (migration `20261120000500`, not applied live), so a direct Data API call with another method fails and rolls the checkout back.

## Phase 2 additions (`20261119000000_phase2_core.sql`)

- **Order status transitions** (trigger `orders_status_transition`): `pending -> preparing -> completed`, and `pending`/`preparing -> cancelled`. `completed` and `cancelled` are final. Anything else raises `INVALID_TRANSITION` (API: 409).
- **Product costing** (`recalculate_product_costing`, triggers on `product_ingredients` and on `ingredients.unit_cost`): `product_costing.ingredient_cost` is always `round(sum(quantity_needed * unit_cost), 2)`; a missing `unit_cost` counts as 0. `total_cost` stays the generated column `ingredient_cost + packaging_cost`. Only `packaging_cost` is entered by the Owner.
- **Recipe replace** (`set_product_recipe(product_id, items jsonb)`): deletes, updates and inserts recipe lines in one transaction. Owner only (`FORBIDDEN` otherwise, so RLS never turns it into a silent no-op).
- **`v_inventory_status`** gains `supplier_id`, `supplier_name`, `unit_cost`, `date_updated` (appended). Suppliers remain Owner-only by RLS, so a barista sees `supplier_name` as NULL. The Barista-only `barista_supplier_options()` function separately exposes active supplier IDs and names for ingredient assignment, never contact details. (`20261120000200` recreates the view without `unit_cost` and with the three add-on columns.)
- No table or column changes. All new functions are `SECURITY INVOKER` with `search_path = ''`.

### Testing the database rules locally

`supabase/tests/phase2_core.test.sql` checks costing, recipe replace, stock rules, checkout (totals, recipe deduction, add-ons, idempotency, rollback on stale price, short stock and underpayment), status transitions, report totals and RLS. Run it on plain PostgreSQL 15 in Docker:

```bash
docker run -d --name gk-pg -e POSTGRES_PASSWORD=test postgres:15
docker cp supabase gk-pg:/sb
docker exec gk-pg sh -c 'cd /sb && for f in tests/supabase-stub.sql migrations/*.sql tests/phase2_core.test.sql tests/roles_mfa_storage.test.sql tests/addons_catalog_costs.test.sql tests/validation_calculations.test.sql; do psql -q -v ON_ERROR_STOP=1 -U postgres -f $f || exit 1; done'
docker rm -f gk-pg
```

`supabase-stub.sql` creates the few Supabase objects the migrations need (`anon`, `authenticated`, `service_role`, `auth.users`, `auth.uid()`, `auth.jwt()`, and minimal `storage.buckets` / `storage.objects`). With `supabase start`, skip the stub and run only the test files. Owner sessions in the tests set `"aal": "aal2"` in `request.jwt.claims`.

`roles_mfa_storage.test.sql` checks the Owner `aal2` rule, Owner and Barista stock-in/out, restricted Barista ingredient creation, active-supplier assignment/options, opening-stock history, caller-bound movement rows, checkout deduction, and the product image Storage policies.

`addons_catalog_costs.test.sql` checks the add-on columns and constraint, Owner-only `unit_cost`, add-on checkout (rows, prices, stock, retries, conflicts), that configuration changes leave stock history and saved orders alone, and the official catalog (count per category, excluded items, re-run through `\ir`). Test fixtures use product ids from 901 because the catalog migration takes the first ids.

`validation_calculations.test.sql` checks checkout, stock, costing, margin and report numbers against hand-computed values (synthetic data), cash-only payments, and that failures leave no rows.

## Security

- RLS on every table. `app_role()` / `app_user_id()` read the caller's **active** profile.
- Both roles read catalog, inventory, orders and payments. The Owner writes catalog, ingredient details, suppliers and costing; both roles may write their own stock transactions.
- Ingredient costs are Owner-only (team decision; SRS NFR-02). `authenticated` has column-level SELECT on `ingredients` without `unit_cost`, so no signed-in token can select it, including through the Data API. The Owner reads costs through `ingredient_unit_costs()` (SECURITY DEFINER; raises `FORBIDDEN` unless `app_role()` is `owner_admin`). The costing triggers `product_ingredients_recost` and `ingredients_recost` run as SECURITY DEFINER because they read `unit_cost`; they fire only on Owner writes. `recalculate_product_costing` is no longer executable by `authenticated`.
- Manual stock movements: the Owner and Barista may insert `stock_transactions` of type `in` or `out`, with `user_id` bound to the caller. This is a user-approved POS permission change. In the clean migration order, `20261120000700` follows `20261120000600`; live already records `00700` out of order, so pending `20261120000800` restores the permission after `00600` is eventually applied. Baristas may create basic ingredients through `create_barista_ingredient`; the function can assign an existing active supplier but cannot create suppliers or expose contact details, costs, or add-on settings. Optional opening stock is recorded as a stock-in in the same transaction. Ingredient edits, unit costs, supplier management, and add-on settings remain Owner-only. This permission is local-only until `20261120000900` and `20261120001000` are separately approved for live. Checkout stock-out goes through `process_checkout_transaction` (SECURITY DEFINER) and is not affected. Baristas update only `orders.status`.
- An Owner session counts only at `aal2` (after MFA): `app_role()` and `app_user_id()` return NULL for an Owner below it.
- `anon` has no access. `audit_logs` has no policies.
- `users`: a barista reads only their own row, so never the Owner's email. Signed-in users may update only `full_name` and `status` (RLS: Owner only); `role`, `email`, `username` and `auth_user_id` change only through the API, so nobody can grant themselves `owner_admin`.
- `provision_initial_owner()` is executable by `service_role` only. An advisory lock makes concurrent setup requests create at most one Owner.
- Storage: bucket `product-images` (private) with policies on `storage.objects` (see "Product images").
- `sync_owner_email_from_auth` (trigger on `auth.users`) copies a confirmed Auth email change to the Owner's `users.email`, so username sign-in keeps working. It is the only new `SECURITY DEFINER` function; all new functions pin `search_path = ''`.
- `authenticated` has no `TRUNCATE`, `REFERENCES`, `TRIGGER` or `MAINTAIN` on any table. `20261118000000` revokes them on existing tables and in the default privileges of `postgres` (the migration role) in `public`. Live has no global default-privilege entries. Tables created by `supabase_admin` follow that role's own defaults, which `postgres` cannot change.
- `login_throttle` and its functions (`login_throttle_blocked`, `login_throttle_fail`, `login_throttle_success`): RLS on, no policies, no grants to `anon`/`authenticated`; only the API (service role) uses them.
- The API verifies every token with Supabase Auth and reads role and status from `users` (`apps/api/src/lib/auth.ts`). `app_metadata.role` is set at provisioning only so the Admin/POS sites can route; it is not used for authorization.

## Workflow

```bash
npx supabase login
npx supabase link --project-ref <project-ref>
npx supabase db push          # apply migrations
pnpm db:types                 # regenerate packages/db-types from the linked project
```

## Sign in

Everyone signs in with **username + password** (SRS FR-41). The login page posts to its own site (`/auth/login`), which calls `apps/api` `POST /api/auth/login`. The API looks up the username in `users`, picks the Auth email, and signs in with Supabase Auth. The site stores the session in an HttpOnly cookie; the browser never sees a token or the Auth email.

- **Owner/Admin:** Auth email is the real address in `users.email`. Supports email verification and "Forgot password" by emailed 6-digit code (Admin sign-in page or `/forgot-password`), and needs a second sign-in step (TOTP MFA, below).
- **Barista:** Auth email is the internal `<username>@staff.gunitakopi.local` (`usernameToAuthEmail` in `@gunita/auth`); `users.email` is NULL. No mail is sent; the Owner resets barista passwords.

Wrong password, unknown username and inactive account all return the same `401`. An unverified Owner gets `403 EMAIL_NOT_CONFIRMED` (Supabase reports this only after the password matched).

### Session (HttpOnly, server-managed)

The browser never holds a Supabase token. Each site (Admin, POS) has three server routes from `createSessionHandlers` in `@gunita/auth/session-server`:

- `POST /auth/login`: forwards username and password to `apps/api` `POST /api/auth/login` (server to server, with the client IP in `x-gunita-client-ip` and `INTERNAL_PROXY_SECRET`), checks the role is allowed on this site, then stores the session in an **HttpOnly, SameSite=Lax** cookie (`Secure` in production). The response body has no token. A barista signing in to the Owner portal gets 403 and the issued session is revoked.
- `POST /auth/logout`: revokes the session in Supabase Auth and deletes the cookie (local-only clear if Auth is unreachable).
- `/api/*`: same-origin proxy to `apps/api`. It reads the cookie, refreshes an expiring token (rewriting the cookie), and adds `Authorization: Bearer`. It never proxies `/api/auth/login`.

Cookie names: `sb-gunita-admin-auth` (Admin) and `sb-gunita-pos-auth` (POS), so the two sites stay separate on one host. State-changing requests to these routes must come from the site's own origin (CSRF check on the `Origin` header). Each site's `middleware.ts` (`createAuthMiddleware`) reads the same cookie, refreshes it, verifies the JWT with `getClaims` (local check with the project's ES256 signing key), and redirects to `/login` when there is no valid session or the role does not fit. `apps/api` still verifies every token itself (`requireUser`).

The Admin site has two more server routes:

- `POST /auth/mfa` (Owner MFA, SDS 2.4 and 2.8, SRS NFR-09). After a password sign-in the Owner session is `aal1`; `/auth/login` returns `mfaRequired: true` and the page goes to `/mfa`. `{ action: "start" }` returns `step: "verify"` when a TOTP factor exists, otherwise enrolls one (any unfinished factor is removed first) and returns its QR code and secret. `{ action: "verify", code }` runs `challengeAndVerify`; Supabase upgrades the session to `aal2` and the HttpOnly cookie is rewritten. No token is returned. A new factor is never enrolled while a verified one exists.
- `POST /auth/recovery` (Owner password recovery, all server side). `step: "request"` calls `resetPasswordForEmail` and answers the same for unknown emails and for mail failures (only Supabase's 429 is passed on). `step: "verify"` checks the 6-digit code with `verifyOtp` (type `recovery`) and keeps the recovery session in the HttpOnly cookie `sb-gunita-admin-recovery` (15 minutes). The page guard and `/api` proxy never read that cookie, and a non-Owner account is refused with the same message as a wrong code. `step: "reset"` sets the new password (8+ characters) and then signs out every session of the account (`scope: global`); the Owner signs in again, including the second step.

Owner `aal2` is enforced in three places: the Admin middleware (`mfaPath: "/mfa"`, every other page redirects there), `apps/api` `requireUser` (`403 MFA_REQUIRED` for an `owner_admin` token whose verified `aal` claim is not `aal2`), and the database (`app_role()` / `app_user_id()` return NULL for an Owner below `aal2`, migration `20261120000000`), so a password-only Owner token gives no data even when used against the Data API directly. Baristas have no second step.

Server-only settings (never `NEXT_PUBLIC_`): `INTERNAL_PROXY_SECRET` (same value in api, admin and pos), `API_URL` (admin and pos; defaults to `NEXT_PUBLIC_API_URL`).

### Client IP

Read only from a header the hosting platform sets (`@gunita/auth/client-ip`):

- Vercel (`VERCEL=1`): `x-real-ip`. Vercel overwrites client-sent values, so a spoofed `X-Forwarded-For` is ignored.
- Own reverse proxy: set `TRUSTED_CLIENT_IP_HEADER` to the header it sets.
- Local development: `127.0.0.1`.
- Production with no trusted source: sign-in returns 503 (no shared "unknown" bucket).

`apps/api` accepts the forwarded `x-gunita-client-ip` only with a matching `INTERNAL_PROXY_SECRET`; a forwarded IP without it is refused (503).

### Rate limiting

`apps/api/src/lib/login-throttle.ts` with table `login_throttle` (shared by all serverless instances). Keys are SHA-256 hashes of the normalized username and the client IP:

| Key           | Limit (15 min) | Effect                                                                                      |
| ------------- | -------------- | ------------------------------------------------------------------------------------------- |
| username + IP | 5 failures     | locks that pair                                                                             |
| IP            | 20 failures    | locks that IP for every username                                                            |
| username      | 10 failures    | locks the username **only for IPs without a successful sign-in for it in the last 30 days** |

- Locks start at 15 minutes and double on each repeated lockout of the same key, up to 24 hours.
- A correct password clears the pair counter and marks the IP as trusted for that username, so failures from other IPs cannot lock staff out of a terminal they already use.
- Unknown and inactive usernames are counted exactly like real ones; every lock returns the same `429 TOO_MANY_ATTEMPTS`.
- Fail closed: if a throttle read or write fails, sign-in returns `503` and the error is logged.
- Housekeeping runs inside each failure: at most 100 idle rows (1 day; trusted rows 30 days) without an active lock, `SKIP LOCKED`. No extension or scheduler needed.

### Logging

JSON logs, no passwords, tokens or setup codes. Sign-in events: `auth.login_failed` (reason), `auth.login_blocked`, `auth.lockout`, `auth.login_succeeded`, `auth.throttle_unavailable`, `auth.proxy_secret_rejected`, `auth.client_ip_unavailable`. Usernames and IPs are logged only as short hash prefixes. Server errors (5xx) are logged as `request.failed`; clients get a generic message.

## First owner account (one time)

1. Outside localhost development, set `OWNER_SETUP_TOKEN` (32+ random characters) in the API environment.
2. On the Admin sign-in page, choose **Create account** and enter the email, full name, username, password and confirmation. Localhost development uses the trusted local proxy and does not ask for a setup code; all other environments require the setup token. A visit to the former `/setup` page returns to sign-in.
3. `POST /api/setup/owner` creates the Auth account on the real email (unconfirmed), then calls `provision_initial_owner()` to add the `owner_admin` profile. The role is set by the API; the request has no role field. Supabase sends the confirmation email.
4. After the Owner exists, setup returns `409 SETUP_COMPLETE`. Remove `OWNER_SETUP_TOKEN` to switch the endpoint off.

The Owner then creates barista accounts through `POST /api/admin/employees` (username, password, full name, role `barista` only; no email).

## Open items

- Cancelling an order does not return its ingredients to stock. The SRS does not define a rule (stock may already be used); record a stock-in if needed until one is agreed.
- `orders` has no column for who changed the status; the API writes it to `audit_logs` (`order.status`).
- `ingredients` has no `status` column (SRS FR-21 lists one); the API exposes the derived stock status from `v_inventory_status`.
- `packages/db-types` was updated by hand for `20261119000000` (two functions, four view columns). Run `pnpm db:types` against a linked project after the migration is applied to confirm.

- `app_metadata.role` is not updated when an owner changes a role or deactivates a user; the API and RLS still block them, but the site routing will not until the next provisioning flow handles it.
- Receipt files (SDS 2.6) have no bucket yet; product images do (migration `20261120000100`, below).
- Supabase's own sign-in rate limit is per IP, and every sign-in comes from the API server. Raise it in the Dashboard so the app-level throttle is the one that trips.
- During a distributed attack on a username, a new device or IP (not yet trusted) cannot sign in to that username until the lock expires; known terminals keep working.
- Live Auth settings: turn off "Allow new users to sign up" (it is on) and set up custom SMTP (the built-in sender only mails project team members and about 2 emails per hour). The old `/reset-password` link page is gone, so no Redirect URL is needed for recovery.
- Supabase's per-IP limits on code checks (`/verify`, MFA verify) see the Admin server's IP for every user, as with sign-in. The app does not add its own throttle to recovery or MFA codes.

## Live configuration and pending migrations (updated 2026-11-20)

### Migration order audit (2026-11-20)

Live history has 9 recorded rows, including `20261120000700_barista_stock_in`. On 2026-11-20, that migration was applied to the live `gunita-kopi-pos-dev` project in one guarded SQL Editor transaction. The live `stock_insert` policy was verified afterward: `user_id` must equal `app_user_id()`, and `app_role()` must be `owner_admin` or `barista`, allowing either manual movement type. No other migration was applied.

Pending on live: `20261120000000` (Owner MFA and stock roles), `20261120000100` (product image Storage), `20261120000500` (cash only), `20261120000600_owner_stock_out.sql`, `20261120000800_restore_barista_stock_in.sql`, `20261120000900_barista_add_basic_ingredient.sql`, and `20261120001000_barista_ingredient_supplier.sql`. `00600` re-allows Owner stock-out after `20261120000000` restricts it, but it would also narrow Barista writes to stock-out if applied after the already-recorded `00700`. `00800` reasserts the approved Owner/Barista stock-in/out policy after those older migrations run. `00900` adds the Barista ingredient-creation RPC; `01000` adds existing-active-supplier assignment and limited supplier-name options. Neither has been applied to live. The gap is a **history-order issue only**, not a schema dependency:

- `0000` replaces only `app_role()` and `app_user_id()` (same signatures and grants) and the `stock_insert` policy. All three come from the initial schema and are unchanged on live.
- `0100` touches only `storage.buckets` and four new `storage.objects` policies.
- `0500` adds one CHECK on `payments`.
- `0200`, `0300` and `0400` create or replace none of those objects. They only call `app_role()`/`app_user_id()` at run time, and the stricter MFA bodies are intended for them.

Checks run:

- **Read-only on live:** function bodies, policies, constraints, column grants, views, indexes, columns and the product set equal a PGlite database built from the applied migrations.
- **PGlite fingerprint:** applying `0000`, `0100`, `0500` after `0400` gives the same fingerprint as the fresh order.
- **Live preconditions:** the `stock_insert` policy and the initial function bodies exist. There is no bucket and no conflicting policy name. `postgres` has INSERT on `storage.buckets`, and `supautils.policy_grants` lets `postgres` create policies on `storage.objects`. There are 0 payments.

No history repair is needed. The still-pending MFA, Storage, cash-only, and Owner stock-out migrations each need approval before live application. Recommended order, when approved:

1. Deploy this branch's API and Admin (`/mfa`) first.
2. Apply `20261120000000`, `20261120000100`, `20261120000500`, `20261120000600`, then `20261120000800`. `20261120000700` is already applied and recorded. Use `supabase db push --include-all` only after a `--dry-run` that lists exactly these five pending versions, or the `db-migrations.yml` manual job with those five versions.

Not yet proven on real Supabase: that the hosted Storage service accepts the `0100` bucket insert and policies. Try it on staging or a local `supabase start` first.

Except where noted above and in item 4, nothing below has been done on the live project or tested against it.

1. **Migrations** `20261120000000_owner_mfa_and_stock_roles.sql`, `20261120000100_product_images.sql`, `20261120000500_payments_cash_only.sql`, `20261120000600_owner_stock_out.sql` and `20261120000800_restore_barista_stock_in.sql`: check with `npx supabase@2 db push --dry-run --db-url "<url>"`, then push only after separate approval. Deploy the Admin site (with `/mfa`) and the API **before the first MFA migration**: from then on an Owner session without the second step reads no data. `20261120000700` is already applied and recorded.
2. **Owner MFA (TOTP):** enabled by default on hosted projects. In the Dashboard (Authentication, Multi-Factor) confirm TOTP enrollment and verification are on. Nothing else is required; the Owner enrolls on the next sign-in. Check the MFA verification rate limit (Authentication, Rate Limits).
3. **Recovery email:** Authentication, Email Templates, "Reset Password": the body must contain `{{ .Token }}` (the 6-digit code), for example `Your Gunita Kopi password reset code is {{ .Token }}. It expires soon; ignore this email if you did not ask for it.` The `{{ .ConfirmationURL }}` link is not used. Code lifetime is the Email OTP expiry (Authentication, Providers, Email; keep it short, for example 900 seconds). Custom SMTP is needed for real delivery.
4. **Catalog migrations.** Live state on 2026-11-19:
   - `20261120000200`, `20261120000300` and `20261120000400` are applied and recorded, with all 76 products present.
   - `20261120000200` and `20261120000400` were pushed from a temporary CLI workdir without the MFA and Storage files.
   - `20261120000300`'s SQL was run directly, verified row for row, then recorded with `supabase migration repair --status applied 20261120000300`.

   `20261120000000` and `20261120000100` are still pending and older than the newest applied version, so the next `db push` needs `--include-all`, which pushes both. Do that only once they are approved. The old API (main) reads `unit_cost` from `v_inventory_status`, which `20261120000200` removed, so deploy this branch's API, Admin and POS before using the live project.
5. **Storage:** the `20261120000100` migration creates the private bucket `product-images` (2 MB, PNG/JPEG/WebP) and its four `storage.objects` policies. If the migration role may not write `storage.buckets` on the project, create the bucket in the Dashboard with the same settings and keep the policies.

## Product images (FR-50)

- Private bucket `product-images`; no public URLs (SDS 2.6: "Private files with access checks").
- `PUT /api/products/{id}/image` (Owner): raw image bytes, at most 2 MB. The type comes from the file's first bytes (PNG, JPEG, WebP), never from the client. The path is generated by the API (`<product_id>/<uuid>.<ext>`), uploaded with the Owner's own token, then saved in `products.image`; the previous stored file is deleted.
- `GET /api/products/{id}/image` (both roles): streams the stored file with the caller's token, `nosniff`. Only a path of that exact form for that product is served.
- `DELETE /api/products/{id}/image` (Owner): clears `products.image` and deletes the stored file.
- Pages load `/api/products/{id}/image?v=<file>` through their same-origin proxy (`productImageSrc` in `@gunita/contracts`). Products without an image, or with an older http(s) URL in `image`, keep working.
- Storage RLS: both roles read; only an Owner at `aal2` inserts, updates or deletes, and only in this bucket.
- The POS does not cache images for offline use; offline, product tiles show without a picture.

## Add-ons (FR-03, migration `20261120000200`)

Confirmed client decisions: each add-on is exactly one inventory ingredient, the same add-on list is offered for every drink, and every add-on sells for PHP 25.00. No add-on table exists; three columns on `ingredients` hold the configuration:

| Column                | Type            | Regular ingredient | Add-on                                      |
| --------------------- | --------------- | ------------------ | ------------------------------------------- |
| `is_addon`            | `boolean`       | `false` (default)  | `true`                                      |
| `addon_selling_price` | `numeric(10,2)` | NULL               | `25.00`                                     |
| `addon_quantity`      | `numeric(10,2)` | NULL               | amount used per selection, in `unit`, `> 0` |

- CHECK `ingredients_addon_config_check` allows only those two shapes, so an incomplete add-on cannot be stored. The API sets the price; clients never send one.
- Owner configures it in Admin, Inventory, Add/Edit Ingredient ("Add-on Configuration"). Turning it off sets the three columns back to `false`/NULL and touches no stock, stock history or orders.
- POS (real mode): the customization modal lists ingredients with a complete configuration from `GET /api/ingredients`, for products in `ADDON_DRINK_CATEGORIES` (`Iced Coffee`, `Non-Coffee`) only, and disables one when `current_stock < addon_quantity`. Demo mode keeps its fixture menu.
- Order rows: one row per add-on with `is_addon = true`, `ingredient_id`, `quantity` = selections (one per drink), `unit_price` = 25.00, `subtotal` = `quantity * unit_price`. Checkout rechecks the configuration (`CONFLICT` when the ingredient is not an add-on now), the price (`PRICE_CONFLICT`) and stock (`STOCK_CONFLICT`). Values are read at checkout, so later configuration changes never alter saved orders or stock history.
- Order rows do not link an add-on to its drink (no column for it), so "drinks only" is enforced by the POS, not by the database.
- No ingredient for the official add-ons exists in the migrations; the Owner creates or flags them (Biscoff, Caramel, Chocolate, Espresso Extra Shots, Gunita, Jam, Matcha, Milk, Oreo Biscuits, Sauce, Syrup) with measured serving quantities.

## Official catalog (migration `20261120000300`)

- 76 products from the approved menu: Iced Coffee 24, Non-Coffee 24, Silog Meals 6, Shawarma Meals 5, Gunita Meals 8, French Fries 4, Snacks 5. `20261120000300` adds 74, and `20261120000400` adds `Biscoff (Non Coffee)` (120) and `Shanghai / Rice` (60). Category is the menu heading (the column is free text). No description, image, recipe, costing or `created_by` is set.
- Inserted only when no product with the same name (ignoring case and surrounding spaces) exists, so it can run again and never overwrites what the Owner entered.
- Left out until the Owner confirms them: every item on the partly visible orange board. Its category is not visible, names and prices differ between the transcription and the photo, and seven names conflict with main-menu prices.
- The menu marks `Shawarma Burger` and `Cheese Pancakes` with an asterisk of unknown meaning; `products` has no notes column, so it is recorded only in the migration comment.
- French Fries flavors (BBQ, Cheese, Sour Cream) are entered per order in `orders.customization`; there is no variant model.
- Without recipes (`product_ingredients`), a sale deducts no stock and costing shows 0 until the Owner enters them.
