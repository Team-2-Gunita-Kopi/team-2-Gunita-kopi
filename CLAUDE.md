# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Gunita Kopi POS: coffee-shop POS and inventory system. pnpm + Turborepo monorepo, Next.js 15 apps, Supabase (Postgres + Auth). Requirements come from the team's SRS/SDS; code comments cite them as `FR-xx` / `SDS x.y`.

## Commands

Use Node 22 (`.nvmrc`): on Node 25+ the `@gunita/ui` jsdom tests fail because Node's own experimental `localStorage` global shadows jsdom's. pnpm is pinned (`packageManager: pnpm@12.21.0`); without a global pnpm, prefix commands with `npx -y pnpm@12.21.0`.

```bash
pnpm install
pnpm dev                 # admin :3000, pos :3001, api :3002
pnpm typecheck           # all 8 workspaces
pnpm lint
pnpm test                # vitest in every package that has tests
pnpm build

# one package / one file / one test
pnpm --filter @gunita/api test
pnpm --filter @gunita/api exec vitest run tests/phase2-api.test.ts -t "rejects an inactive account"
pnpm --filter @gunita/auth exec vitest run tests/session.test.ts
```

- `pnpm db:types` regenerates `packages/db-types/src/index.ts` and needs a linked Supabase project (`supabase link`). Alternative: `npx supabase@2 gen types typescript --db-url "<url>" --schema public`, then prettier.
- Database rule tests (`supabase/tests/*.test.sql`) run with psql on plain PostgreSQL; the exact Docker commands are in `docs/database.md` ("Testing the database rules locally"). Load `supabase/tests/supabase-stub.sql` first on a non-Supabase database.
- Migrations: `npx supabase@2 db push --dry-run --db-url "<url>"` before any real push. The project is not CLI-linked by default.

Windows gotchas seen in this repo: `core.autocrlf=true`, so `prettier --write` on whole folders rewrites line endings of untouched files (restore files whose `git diff` is empty). `pnpm typecheck` rewrites tracked `tsconfig.tsbuildinfo` files and `pnpm build` regenerates `apps/pos/public/sw.js`; restore them with `git checkout --` unless the change is intended.

## Architecture

Three apps, five packages:

- `apps/api`: backend only (Next.js Route Handlers under `src/app/api/**/route.ts`). The only place that holds `SUPABASE_SERVICE_ROLE_KEY`.
- `apps/admin` (Owner portal) and `apps/pos` (barista PWA, offline-first with a Dexie outbox in `src/offline/`). Neither talks to the database.
- `packages/contracts`: zod schemas and types. `@gunita/contracts` is the API contract (request bodies, query strings, responses, the `ApiResponse` envelope), shaped after the database. `@gunita/contracts/ui` (`src/ui/`) holds the frontend's own view models and business rules (`rules/`), which use different shapes (string ids, `sellingPrice`, add-on lists). Frontend screens and `packages/mocks` import `/ui`; mapping API responses into those shapes happens in each app's `features/*/api.ts`.
- `packages/db-types`: generated Supabase types; services use `Tables<"x">`.
- `packages/auth`: roles, username-to-Auth-email mapping, and the server-side session code used by both sites.
- `packages/ui`, `packages/config`: shared components and eslint/tsconfig/tailwind preset.
- `packages/mocks`: the demo data service used when the sites run in demo mode (below).

### Request and session flow

The browser never holds a Supabase token.

1. The login page posts username + password to its own site, `/auth/login` (`createSessionHandlers` in `packages/auth/src/session-server.ts`).
2. The site server calls `apps/api` `POST /api/auth/login` server to server, forwarding the client IP with `INTERNAL_PROXY_SECRET`, then stores the Supabase session in an HttpOnly cookie (`sb-gunita-admin-auth` / `sb-gunita-pos-auth`; separate names so the two sites stay apart on one host).
3. Browser code calls same-origin `/api/*` via each app's `lib/api-client.ts`; the site's `app/api/[...path]/route.ts` proxy reads the cookie, refreshes the token, and forwards with `Authorization: Bearer`.
4. Each site's `middleware.ts` (`createAuthMiddleware`) guards pages by the token's `app_metadata.role`. That claim only routes pages.
5. `apps/api` `requireUser` / `requireRole` (`src/lib/auth.ts`) verifies the token with Supabase Auth and reads role and status from `public.users`. That row is the authority, not JWT claims.

Some docs (`README.md`, `docs/architecture/README.md`) still describe the older "browser sends Bearer token" model; the flow above is what the code does.

### Demo mode

`NEXT_PUBLIC_USE_MOCKS=true` (admin, pos) switches each app's `features/<area>/index.ts` from `api.ts` (real API) to `mock.ts`, which calls `POST /api/mock/rpc` on apps/api (`MOCK_MODE=true`, refused in production builds) backed by `packages/mocks`. The mock session is an unsigned `gk-mock-session` cookie read only by the mock branch of each `middleware.ts`; real sessions always go through `createAuthMiddleware`. Frontend tests run in demo mode (`test.env` in each app's `vitest.config.ts`).

### API layout

- Route files stay thin: wrap handlers in `route()` (`src/lib/response.ts`), authorize with `requireRole`, validate with `readJson` / `readQuery` / `readId` (`src/lib/request.ts`) against contract schemas, call a service, return `jsonResponse(...)`.
- Business logic is in `src/modules/<area>/service.ts`. Services query through `user.supabaseClient`, a client carrying the caller's JWT, so RLS applies. They map snake_case rows to camelCase contract types.
- `supabaseAdmin` (service role) is used only for account provisioning, the one-time Owner setup, sign-in lookup and throttling, and `audit_logs`.
- Errors: throw `AppError` subclasses (`src/lib/errors.ts`). `dbError()` maps Postgres errors to HTTP errors; SQL functions raise messages like `STOCK_CONFLICT: ...`, `PRICE_CONFLICT`, `INVALID_TRANSITION`, which become typed API errors. `errorResponse` never returns 5xx details to clients (they are logged); zod errors become 400 `VALIDATION_ERROR`.
- Multi-step writes that must be atomic are Postgres functions called with `.rpc()`: `process_checkout_transaction` (orders + payment + stock-out, idempotent on `client_tx_id`), `set_product_recipe`, `provision_initial_owner`, `login_throttle_*`.
- Tests mock Supabase (`vi.mock("../src/lib/supabase-admin")` / `supabase-user`) and call route handlers or services directly; database behavior is tested in SQL instead.

### Database

- Source of truth: `supabase/migrations/` in timestamp order; `docs/database.md` explains tables, views, functions and security. Check the remote history before editing a migration: applied migrations are never edited, add a new one.
- Conventions the existing migrations follow: RLS on every table; views `with (security_invoker = true)`; new functions `SECURITY INVOKER` with `set search_path = ''` and schema-qualified names (`SECURITY DEFINER` only when unavoidable, e.g. the `auth.users` email-sync trigger); `revoke execute ... from public, anon, authenticated` then explicit grants.
- The live project does not auto-grant table privileges to `authenticated` / `service_role`, so every table a migration adds needs explicit `grant`s (see `20261117000000_role_grants.sql`), plus revokes of default `TRUNCATE/REFERENCES/TRIGGER/MAINTAIN`.
- Roles: `owner_admin` and `barista` only. `app_role()` / `app_user_id()` read the caller's active profile for RLS.

### Accounts and sign-in

- Everyone signs in with a username (`UsernameSchema`: trimmed, lowercased). Baristas get an internal Auth email `<username>@staff.gunitakopi.local` (`usernameToAuthEmail`) and `users.email` is NULL. The single Owner has a real email (verification and password recovery) kept in sync from `auth.users` by trigger.
- The Owner is created once via `POST /api/setup/owner` (header `X-Setup-Token` = `OWNER_SETUP_TOKEN`); afterwards baristas only via `POST /api/admin/employees`. There is no public sign-up.
- Sign-in is rate limited in Postgres (`login_throttle`, per username+IP, per IP, and per username for untrusted IPs) and fails closed (503) if the throttle store or a trusted client IP is unavailable. Client IP comes only from platform headers (`@gunita/auth/client-ip`: `x-real-ip` on Vercel, `TRUSTED_CLIENT_IP_HEADER` elsewhere, `127.0.0.1` in development).

### Environment

Each app has `.env.example`; real values go in `apps/*/.env.local` (gitignored), and `supabase/.env.local` holds the DB password for CLI use. Server-only values: `SUPABASE_SERVICE_ROLE_KEY` and `OWNER_SETUP_TOKEN` (api only), `INTERNAL_PROXY_SECRET` (same value in api, admin and pos), `API_URL` (admin, pos). `NEXT_PUBLIC_*` values are browser-visible: only the Supabase URL, the publishable key and the API URL.

## Git workflow

From `CONTRIBUTING.md`: `main` is protected (no direct pushes); work on `feature/*`, `fix/*`, `chore/*` branches through PRs. Conventional Commits `<type>(<scope>): <description>` with scopes `admin`, `pos`, `api`, `contracts`, `db-types`, `auth`, `ui`, `config`, `supabase`, `ci`, `deps`. Do not add `Co-Authored-By` trailers to commits in this repo.
