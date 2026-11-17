# Database

Supabase PostgreSQL. The schema follows SDS v3 section 3 (9 tables, 6 views) plus the pure web changes in SDS 3.11.
Source of truth: `supabase/migrations/` (`20261116000000_initial_schema.sql`, then `20261117000000_role_grants.sql`, which grants table privileges explicitly because new Supabase projects no longer do, then `20261118000000_owner_email.sql` for the Owner email and privilege hardening, then `20261118000100_login_throttle.sql` for sign-in rate limiting). TypeScript types: `packages/db-types`.

## Tables

| Table                 | Key                     | Notes                                                                                                                                                                                                                                                                               |
| --------------------- | ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `users`               | `user_id`               | Employee profile. `auth_user_id` links to `auth.users`. No password column: Supabase Auth owns credentials. `role` is `owner_admin` or `barista`; `status` is `active` or `inactive`. `email`: Owner only (required), NULL for baristas; trimmed, lowercased, unique ignoring case. |
| `suppliers`           | `supplier_id`           |                                                                                                                                                                                                                                                                                     |
| `ingredients`         | `ingredient_id`         | Stock items and add-ons. `current_stock` is maintained by `stock_transactions`. `unit_cost` is the add-on price basis.                                                                                                                                                              |
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
The acting user comes from `auth.uid()`, never from the payload.

## Security

- RLS on every table. `app_role()` / `app_user_id()` read the caller's **active** profile.
- Both roles read catalog, inventory, orders and payments. Owner writes catalog, inventory, suppliers and costing.
- Barista may insert `stock_transactions` of type `out` only, and update only `orders.status`.
- `anon` has no access. `audit_logs` has no policies.
- `users`: a barista reads only their own row, so never the Owner's email. Signed-in users may update only `full_name` and `status` (RLS: Owner only); `role`, `email`, `username` and `auth_user_id` change only through the API, so nobody can grant themselves `owner_admin`.
- `provision_initial_owner()` is executable by `service_role` only. An advisory lock makes concurrent setup requests create at most one Owner.
- No Storage buckets exist yet, so there are no Storage policies to update.
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

- **Owner/Admin:** Auth email is the real address in `users.email`. Supports email verification and "Forgot password" (Admin site `/forgot-password` then `/reset-password`).
- **Barista:** Auth email is the internal `<username>@staff.gunitakopi.local` (`usernameToAuthEmail` in `@gunita/auth`); `users.email` is NULL. No mail is sent; the Owner resets barista passwords.

Wrong password, unknown username and inactive account all return the same `401`. An unverified Owner gets `403 EMAIL_NOT_CONFIRMED` (Supabase reports this only after the password matched).

### Session (HttpOnly, server-managed)

The browser never holds a Supabase token. Each site (Admin, POS) has three server routes from `createSessionHandlers` in `@gunita/auth/session-server`:

- `POST /auth/login`: forwards username and password to `apps/api` `POST /api/auth/login` (server to server, with the client IP in `x-gunita-client-ip` and `INTERNAL_PROXY_SECRET`), checks the role is allowed on this site, then stores the session in an **HttpOnly, SameSite=Lax** cookie (`Secure` in production). The response body has no token. A barista signing in to the Owner portal gets 403 and the issued session is revoked.
- `POST /auth/logout`: revokes the session in Supabase Auth and deletes the cookie (local-only clear if Auth is unreachable).
- `/api/*`: same-origin proxy to `apps/api`. It reads the cookie, refreshes an expiring token (rewriting the cookie), and adds `Authorization: Bearer`. It never proxies `/api/auth/login`.

Cookie names: `sb-gunita-admin-auth` (Admin) and `sb-gunita-pos-auth` (POS), so the two sites stay separate on one host. State-changing requests to these routes must come from the site's own origin (CSRF check on the `Origin` header). Each site's `middleware.ts` (`createAuthMiddleware`) reads the same cookie, refreshes it, verifies the JWT with `getClaims` (local check with the project's ES256 signing key), and redirects to `/login` when there is no valid session or the role does not fit. `apps/api` still verifies every token itself (`requireUser`).

Password recovery is the only browser-side Supabase use: the Admin `/forgot-password` and `/reset-password` pages use a separate short-lived cookie (`sb-gunita-admin-recovery`), cleared after the new password is saved.

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

1. Set `OWNER_SETUP_TOKEN` (32+ random characters) in the API environment.
2. Open the Admin site at `/setup`. Enter the setup code, email, full name, username, password and confirmation.
3. `POST /api/setup/owner` (header `X-Setup-Token`) creates the Auth account on the real email (unconfirmed), then calls `provision_initial_owner()` to add the `owner_admin` profile. The role is set by the API; the request has no role field. Supabase sends the confirmation email.
4. After the Owner exists, setup returns `409 SETUP_COMPLETE`. Remove `OWNER_SETUP_TOKEN` to switch the endpoint off.

The Owner then creates barista accounts through `POST /api/admin/employees` (username, password, full name, role `barista` only; no email).

## Open items

- `app_metadata.role` is not updated when an owner changes a role or deactivates a user; the API and RLS still block them, but the site routing will not until the next provisioning flow handles it.
- Storage buckets (product images, receipts) are not created yet.
- Supabase's own sign-in rate limit is per IP, and every sign-in comes from the API server. Raise it in the Dashboard so the app-level throttle is the one that trips.
- During a distributed attack on a username, a new device or IP (not yet trusted) cannot sign in to that username until the lock expires; known terminals keep working.
- Live Auth settings: turn off "Allow new users to sign up" (it is on), add the Admin `/reset-password` URL to Redirect URLs, and set up custom SMTP (the built-in sender only mails project team members).
