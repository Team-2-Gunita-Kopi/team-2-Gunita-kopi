  # CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Gunita Kopi POS: coffee-shop POS and inventory system. pnpm + Turborepo monorepo, Next.js 15 apps, Supabase (Postgres + Auth). Requirements come from the team's SRS/SDS; code comments cite them as `FR-xx` / `SDS x.y`.

## Setting up a new developer machine

When someone asks to set up, install, or run this project on their computer, run `bash scripts/setup-local.sh` from the repo root (Git Bash on Windows). It checks Git, Node 22 and Docker, installs packages, copies `supabase/.env.example` to `supabase/.env` if missing, starts the LOCAL Supabase stack, applies migrations, seeds synthetic test accounts once, and prints the links and test passwords. Then start the apps with `npx -y pnpm@12.21.0 dev` (run it in the background) and give the user the links: Admin http://localhost:3000, POS http://localhost:3001/staff, sign-in codes http://127.0.0.1:54326.

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
  - `packages/ui/css/styles.css`, especially the `.staff-mode` / `.owner-mode` rules, the scrollbar
    rules, the table box rules, the Owner typography block, the user form styles and both
    `@media print` blocks.
  - `apps/pos/src/app/layout.tsx` and `apps/admin/src/app/layout.tsx` (body classes `staff-mode` /
    `owner-mode`, fonts) and the bundled font `apps/*/src/app/fonts/FiraCode-VF.woff2`.
  - The POS screens (`apps/pos/src/app/(pos)/**`, `apps/pos/src/features/pos/components/**`,
    `apps/pos/public/icons/cat-*.svg`) and the Owner pages (`apps/admin/src/app/(app)/**`).
  - Shared components whose look changed: `packages/ui/src/StatusBadge.tsx` (`withIcon`),
    `LoginForm.tsx`, `Receipt.tsx`.
- Allowed without asking: bug fixes and data or backend work that leave the look unchanged, and new
  screens that reuse the existing classes and components.
- Any visual or layout change needs jhnjffryyy's approval first. If a task seems to require one, stop
  and ask instead of changing it. After any change, check the screen at 1536, 1366, 1180, 1024,
  820 and 390 px wide.

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

- Source of truth: `supabase/migrations/` in timestamp order; `docs/database.md` explains tables, views, functions and security. Check the remote history before editing a migration: applied migrations are never edited, add a new one. New migration timestamps must be higher than the newest file in `supabase/migrations/` (some are future-dated, e.g. `20261119000000`); if `supabase migration new` produces a lower one, rename the file, or `db push` will refuse it.
- Conventions the existing migrations follow: RLS on every table; views `with (security_invoker = true)`; new functions `SECURITY INVOKER` with `set search_path = ''` and schema-qualified names (`SECURITY DEFINER` only when unavoidable, e.g. the `auth.users` email-sync trigger); `revoke execute ... from public, anon, authenticated` then explicit grants.
- The live project does not auto-grant table privileges to `authenticated` / `service_role`, so every table a migration adds needs explicit `grant`s (see `20261117000000_role_grants.sql`), plus revokes of default `TRUNCATE/REFERENCES/TRIGGER/MAINTAIN`.
- Roles: `owner_admin` and `barista` only. `app_role()` / `app_user_id()` read the caller's active profile for RLS.

### Accounts and sign-in

- Everyone signs in with a username (`UsernameSchema`: trimmed, lowercased). Baristas get an internal Auth email `<username>@staff.gunitakopi.local` (`usernameToAuthEmail`) and `users.email` is NULL. The single Owner has a real email (verification and password recovery) kept in sync from `auth.users` by trigger.
- The Owner is created once via `POST /api/setup/owner` (header `X-Setup-Token` = `OWNER_SETUP_TOKEN`); afterwards baristas only via `POST /api/admin/employees`. There is no public sign-up.
- Sign-in is rate limited in Postgres (`login_throttle`, per username+IP, per IP, and per username for untrusted IPs) and fails closed (503) if the throttle store or a trusted client IP is unavailable. Client IP comes only from platform headers (`@gunita/auth/client-ip`: `x-real-ip` on Vercel, `TRUSTED_CLIENT_IP_HEADER` elsewhere, `127.0.0.1` in development).

### Environment

Each app has `.env.example`; real values go in `apps/*/.env.local` (gitignored), and `supabase/.env.local` holds the DB password for CLI use. Server-only values: `SUPABASE_SERVICE_ROLE_KEY` and `OWNER_SETUP_TOKEN` (api only), `INTERNAL_PROXY_SECRET` (same value in api, admin and pos), `API_URL` (admin, pos; injected by the Vercel service binding, never set by hand there). `NEXT_PUBLIC_*` values are browser-visible: only the Supabase URL and the publishable key (`NEXT_PUBLIC_API_URL` is used by local demo mode only).

## Git workflow

From `CONTRIBUTING.md`: `main` is protected (no direct pushes); work on `feature/*`, `fix/*`, `chore/*` branches through PRs. Conventional Commits `<type>(<scope>): <description>` with scopes `admin`, `pos`, `api`, `contracts`, `db-types`, `auth`, `ui`, `config`, `supabase`, `ci`, `deps`. Do not add `Co-Authored-By` trailers to commits in this repo.

## Current state (2026-11-24)

- Dated handoff and session notes: `docs/history/2026-11-session-notes.md` (history, not rules).
- Deployment: one Vercel project with Services (Admin `/`, POS `/staff`, private API). See `docs/deployment.md` and `docs/superpowers/specs/2026-11-24-one-vercel-deploy-and-hardening-design.md`.
- Live dev project `gunita-kopi-pos-dev`: latest applied migration `20261120001200`; `0900` and `1000` (Barista add-ingredient, approved 2026-11-24) are still to be applied there with approval. Production will be a new, clean Supabase project.
- Owner sign-in second step is a 6-digit emailed code (not TOTP). Baristas may record stock-in and stock-out and add a basic ingredient.
- Do not commit, push, deploy, or change a live database without explicit approval. Never touch `my-skills/`. FR-40 (staff on duty) is out of scope.
