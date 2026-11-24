  # CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Gunita Kopi POS: coffee-shop POS and inventory system. pnpm + Turborepo monorepo, Next.js 15 apps, Supabase (Postgres + Auth). Requirements come from the team's SRS/SDS; code comments cite them as `FR-xx` / `SDS x.y`.

## Setting up a new developer machine

When someone asks to set up, install, or run this project on their computer, run `bash scripts/setup-local.sh` from the repo root (Git Bash on Windows). It checks Git, Node 22 and Docker, installs packages, copies `supabase/.env.example` to `supabase/.env` if missing, starts the LOCAL Supabase stack, applies migrations, seeds synthetic test accounts once, and prints the links and test passwords. Then start the apps with `npx -y pnpm@12.21.0 dev` (run it in the background) and give the user the links: Admin http://localhost:3000/admin, POS http://localhost:3000/staff, sign-in codes http://127.0.0.1:54326.

- If the script stops on a missing tool, tell the user exactly what to install (Git https://git-scm.com, Node.js 22 https://nodejs.org, Docker Desktop https://www.docker.com/products/docker-desktop) or to open Docker Desktop and wait until it runs, then run the script again. It is safe to rerun.
- Local setup never needs the live project, keys or `supabase/.env.local`. Never point a new machine at live, and never run `supabase link`, `db push` or `migration repair` for setup.
- Optional real email for the Owner code: a Resend account and key in `supabase/.env` (`SMTP_ENABLED=true`, `SMTP_PASS=...`), the local Owner's email changed to the Resend account email, then `npx -y supabase@2.122.1 stop` and `start`.

## Design freeze (set 2026-11-21) — read before changing any screen

The POS (Barista) and Admin (Owner) design and layout were matched to the team's Figma file on
2026-11-21 by jhnjffryyy: https://www.figma.com/design/dt2Pzmp3Eo1Nq9M2UUwZiq/SAD---Phase-3--Systems-Design
("Staff Mockup Design" and "Owner Mockup Design" frames). These rules apply to every teammate and
every AI agent working on this repository:

- Do not change the design or layout of any POS or Owner screen: colors, fonts, font sizes, spacing,
  sidebar and top bar, page headings, tables, badges, buttons, forms, scrollbars, card layout,
  breakpoints, or the print layout. This includes "cleanups", restyles and component swaps.
- Protected files and areas:
  - `src/ui/css/styles.css`, especially the `.staff-mode` / `.owner-mode` rules, the scrollbar
    rules, the table box rules, the Owner typography block, the user form styles and both
    `@media print` blocks.
  - `src/app/(staff)/layout.tsx` and `src/app/(owner)/layout.tsx` (body classes `staff-mode` /
    `owner-mode`, fonts) and the bundled font `src/app/fonts/FiraCode-VF.woff2`.
  - The POS screens (`src/app/(staff)/staff/(pos)/**`, `src/staff/features/pos/components/**`,
    `public/staff/icons/cat-*.svg`) and the Owner pages (`src/app/(owner)/admin/(app)/**`).
  - Shared components whose look changed: `src/ui/StatusBadge.tsx` (`withIcon`),
    `LoginForm.tsx`, `Receipt.tsx`.
- Allowed without asking: bug fixes and data or backend work that leave the look unchanged, and new
  screens that reuse the existing classes and components.
- Any visual or layout change needs jhnjffryyy's approval first. If a task seems to require one, stop
  and ask instead of changing it. After any change, check the screen at 1536, 1366, 1180, 1024,
  820 and 390 px wide.

## Commands

Use Node 22 (`.nvmrc`): on Node 25+ the jsdom tests fail because Node's own experimental `localStorage` global shadows jsdom's. pnpm is pinned (`packageManager: pnpm@12.21.0`); without a global pnpm, prefix commands with `npx -y pnpm@12.21.0`.

```bash
pnpm install
pnpm dev                 # one app on :3000: Owner /admin, POS /staff
pnpm typecheck
pnpm lint
pnpm test                # vitest, one project per area (server, contracts, auth, mocks, ui, owner, staff)
pnpm build

# one area / one file / one test
pnpm test --project server
pnpm exec vitest run tests/server/phase2-api.test.ts -t "rejects an inactive account"
pnpm exec vitest run tests/auth/session.test.ts
```

- `pnpm db:types` regenerates `src/db-types/index.ts` and needs a linked Supabase project (`supabase link`). Alternative: `npx supabase@2 gen types typescript --db-url "<url>" --schema public`, then prettier.
- Database rule tests (`supabase/tests/*.test.sql`) run with psql on plain PostgreSQL; the exact Docker commands are in `docs/database.md` ("Testing the database rules locally"). Load `supabase/tests/supabase-stub.sql` first on a non-Supabase database.
- Migrations: `npx supabase@2 db push --dry-run --db-url "<url>"` before any real push. The project is not CLI-linked by default.
- `bash scripts/predeploy-check.sh` runs install, lint, typecheck, tests, build and audit (it switches itself to Node 22).

Windows gotchas seen in this repo: `core.autocrlf=true`, so `prettier --write` on whole folders rewrites line endings of untouched files (restore files whose `git diff` is empty). `pnpm build` regenerates `public/staff/sw.js` (gitignored).

## Architecture

One Next.js app (one `package.json`, one `node_modules`) with two separate areas and a private backend. Admin and POS stay separate areas with separate sign-ins, sessions and roles (OWASP: separate admin and user access).

- `src/app/(owner)/admin/**`: Owner portal at `/admin` (own root layout `src/app/(owner)/layout.tsx`, body class `owner-mode`). Code in `src/owner/`.
- `src/app/(staff)/staff/**`: Barista POS at `/staff` (own root layout `src/app/(staff)/layout.tsx`, `staff-mode`), offline-first with a Dexie outbox in `src/staff/offline/` and a service worker (`src/staff/sw.ts`, served at `/staff/sw.js`, scope `/staff/`). Code in `src/staff/`. `/` and `/pos` redirect to `/staff/pos`.
- `src/server/`: the backend. `routes/**/route.ts` are Route Handlers but **not public URLs**: `src/server/dispatch.ts` calls them in process for the `/admin/api/*` and `/staff/api/*` proxies. Only `/api/health`, `/api/mock/rpc` (demo, refused in production) and `/api/setup/owner` (setup token) are public (`src/app/api/`). The only code that uses `SUPABASE_SERVICE_ROLE_KEY` (CI checks this).
- `src/contracts`: zod schemas and types. `@/contracts` is the API contract (request bodies, query strings, responses, the `ApiResponse` envelope), shaped after the database. `@/contracts/ui` holds the frontend's own view models and business rules (`rules/`). Screens and `src/mocks` import `/ui`; mapping API responses happens in `src/owner/features/*/api.ts` and `src/staff/features/*/api.ts`.
- `src/db-types`: generated Supabase types; services use `Tables<"x">`.
- `src/auth`: roles, username-to-Auth-email mapping, and the session code used by both areas.
- `src/ui`: shared components and `css/styles.css`; `tailwind.preset.cjs` is the shared Tailwind preset.
- `src/mocks`: the demo data service used in demo mode (below).
- `src/middleware.ts`: one guard for both areas (prefix decides the sign-in page, cookie and role).

### Request and session flow

The browser never holds a Supabase token.

1. The login page posts username + password to its own area, `/admin/auth/login` or `/staff/auth/login` (`createSessionHandlers` in `src/auth/session-server.ts`).
2. The handler calls the backend's `/api/auth/login` in process (`callApi: dispatchApi`), passing the client IP with `INTERNAL_PROXY_SECRET`, then stores the Supabase session in an HttpOnly cookie scoped to its area (`sb-gunita-admin-auth` on `/admin`, `sb-gunita-pos-auth` on `/staff`), so a request to one area never carries the other's session.
3. Browser code calls `/admin/api/*` or `/staff/api/*` via `src/{owner,staff}/lib/api-client.ts`; the proxy reads the cookie, refreshes the token, and dispatches with `Authorization: Bearer`.
4. `src/middleware.ts` (`createAuthMiddleware` per area) guards pages by the token's `app_metadata.role`; that claim only routes pages. Sign-in redirects stay inside their area.
5. `requireUser` / `requireRole` (`src/server/lib/auth.ts`) verify the token with Supabase Auth and read role and status from `public.users`. That row is the authority, not JWT claims.

### Demo mode

`NEXT_PUBLIC_USE_MOCKS=true` switches each area's `features/<area>/index.ts` from `api.ts` (real API) to `mock.ts`, which calls `POST /api/mock/rpc` (`MOCK_MODE=true`, refused in production builds) backed by `src/mocks`. Demo accounts: `owner` / `owner123`, `barista` / `barista123`. The mock session is an unsigned `gk-mock-session` cookie read only by the demo branch of `src/middleware.ts`; real sessions always go through `createAuthMiddleware`. Frontend tests run in demo mode (`vitest.config.ts`, projects `owner` and `staff`).

### API layout

- Route files stay thin: wrap handlers in `route()` (`src/server/lib/response.ts`), authorize with `requireRole`, validate with `readJson` / `readQuery` / `readId` (`src/server/lib/request.ts`) against contract schemas, call a service, return `jsonResponse(...)`. New routes also need a line in `src/server/dispatch.ts` (fixed paths before `[id]` patterns).
- Business logic is in `src/server/modules/<area>/service.ts`. Services query through `user.supabaseClient`, a client carrying the caller's JWT, so RLS applies. They map snake_case rows to camelCase contract types.
- `supabaseAdmin` (service role) is used only for account provisioning, the one-time Owner setup, sign-in lookup and throttling, and `audit_logs`.
- Errors: throw `AppError` subclasses (`src/server/lib/errors.ts`). `dbError()` maps Postgres errors to HTTP errors; SQL functions raise messages like `STOCK_CONFLICT: ...`, `PRICE_CONFLICT`, `INVALID_TRANSITION`, which become typed API errors. `errorResponse` never returns 5xx details to clients (they are logged); zod errors become 400 `VALIDATION_ERROR`.
- Multi-step writes that must be atomic are Postgres functions called with `.rpc()`: `process_checkout_transaction` (orders + payment + stock-out, idempotent on `client_tx_id`), `set_product_recipe`, `provision_initial_owner`, `login_throttle_*`.
- Tests mock Supabase (`vi.mock("@/server/lib/supabase-admin")` / `supabase-user`) and call route handlers or services directly; database behavior is tested in SQL instead.

### Database

- Source of truth: `supabase/migrations/` in timestamp order; `docs/database.md` explains tables, views, functions and security. Check the remote history before editing a migration: applied migrations are never edited, add a new one. New migration timestamps must be higher than the newest file in `supabase/migrations/` (some are future-dated, e.g. `20261119000000`); if `supabase migration new` produces a lower one, rename the file, or `db push` will refuse it.
- Conventions the existing migrations follow: RLS on every table; views `with (security_invoker = true)`; new functions `SECURITY INVOKER` with `set search_path = ''` and schema-qualified names (`SECURITY DEFINER` only when unavoidable, e.g. the `auth.users` email-sync trigger); `revoke execute ... from public, anon, authenticated` then explicit grants.
- The live project does not auto-grant table privileges to `authenticated` / `service_role`, so every table a migration adds needs explicit `grant`s (see `20261117000000_role_grants.sql`), plus revokes of default `TRUNCATE/REFERENCES/TRIGGER/MAINTAIN`.
- Roles: `owner_admin` and `barista` only. `app_role()` / `app_user_id()` read the caller's active profile for RLS.

### Accounts and sign-in

- Everyone signs in with a username (`UsernameSchema`: trimmed, lowercased). Baristas get an internal Auth email `<username>@staff.gunitakopi.local` (`usernameToAuthEmail`) and `users.email` is NULL. The single Owner has a real email (verification and password recovery) kept in sync from `auth.users` by trigger.
- The Owner is created once via `POST /api/setup/owner` (header `X-Setup-Token` = `OWNER_SETUP_TOKEN`); afterwards baristas only via `POST /api/admin/employees`. There is no public sign-up.
- Sign-in is rate limited in Postgres (`login_throttle`, per username+IP, per IP, and per username for untrusted IPs) and fails closed (503) if the throttle store or a trusted client IP is unavailable. Client IP comes only from platform headers (`@/auth/client-ip`: `x-real-ip` on Vercel, `TRUSTED_CLIENT_IP_HEADER` elsewhere, `127.0.0.1` in development).

### Environment

One `.env.example`; real values go in `.env.local` at the repo root (gitignored), and `supabase/.env.local` holds the DB password for CLI use. Server-only values (never `NEXT_PUBLIC_`): `SUPABASE_SERVICE_ROLE_KEY` and `OWNER_SETUP_TOKEN` (used only by `src/server`), `INTERNAL_PROXY_SECRET` (32+ chars). `NEXT_PUBLIC_*` values are browser-visible: only the Supabase URL and the publishable key. There is no `API_URL` any more: the backend runs in the same app.

## Git workflow

From `CONTRIBUTING.md`: `main` is protected (no direct pushes); work on `feature/*`, `fix/*`, `chore/*` branches through PRs. Conventional Commits `<type>(<scope>): <description>` with scopes `admin`, `pos`, `api` (the backend in `src/server`), `contracts`, `db-types`, `auth`, `ui`, `config`, `supabase`, `ci`, `deps`. Do not add `Co-Authored-By` trailers to commits in this repo.

## Current state (2026-11-24)

- Dated handoff and session notes: `docs/history/2026-11-session-notes.md` (history, not rules).
- Structure: one Next.js app since 2026-11-24 (branch `chore/clean-structure`); Vercel deploys it as a standard Next.js project (no Services). See `docs/deployment.md`.
- Live dev project `gunita-kopi-pos-dev`: latest applied migration `20261120001200`; `0900` and `1000` (Barista add-ingredient, approved 2026-11-24) are still to be applied there with approval. Production will be a new, clean Supabase project.
- Owner sign-in second step is a 6-digit emailed code (not TOTP). Baristas may record stock-in and stock-out and add a basic ingredient.
- Do not commit, push, deploy, or change a live database without explicit approval. Never touch `my-skills/`. FR-40 (staff on duty) is out of scope.
