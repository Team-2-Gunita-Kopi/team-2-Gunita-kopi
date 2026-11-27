# Gunita Kopi POS Monorepo

Gunita Kopi is a modern Point of Sale (POS) and inventory management system designed for coffee shop operations. It calculates real-time recipe costing, tracks stock levels, and enables seamless offline order taking.

## Admin landing page
https://gunitakopi.vercel.app/admin/login

## User Credentials 
**Admin username**: admingunita
**password**: admin123

**Staff username**: Juan
**password**: barista1

## Key Architecture Rule

> **Important**: The frontend websites (the Owner area (`/admin`) and the POS area (`/staff`)) **never connect directly to the database**. All business data requests go to the site's own `/api` route, which reads the HttpOnly session cookie on the server and forwards the call to the backend API (the backend (`src/server`), a private Vercel service) with the user's token. The browser never holds a token. The frontend uses Supabase Auth strictly for user authentication. The database is protected behind Row Level Security (RLS) and server-side authorization.

## System Roles

- **Owner (`owner_admin`)**: Full access to the Admin website (the Owner area (`/admin`)), inventory management, recipe costing, staff management, and financial reporting.
- **Barista (`barista`)**: Access to the POS website (the POS area (`/staff`)) for taking orders, managing POS transactions, tracking in-shop inventory, and offline outbox sync.

## Target Structure

```text
gunita-kopi-pos/
├─ src/
│  ├─ app/(owner)/admin/    # Owner portal pages (/admin)
│  ├─ app/(staff)/staff/    # Barista POS pages (/staff), offline-first PWA
│  ├─ app/api/              # The only public API routes: health, setup/owner, mock/rpc (demo)
│  ├─ owner/ staff/         # Each area's features, lib and components
│  ├─ server/               # Backend: private routes, modules, lib (service-role key lives here)
│  ├─ contracts/ auth/ ui/ mocks/ db-types/
│  └─ middleware.ts         # One guard for both areas
├─ tests/                   # One vitest config, a project per area
├─ supabase/                # Migrations, SQL tests, local seed
├─ next.config.ts           # Routing redirects, security headers, POS service worker
└─ package.json             # One package, one node_modules
```

## Setup Steps

1. **Prerequisites**:
   - Node.js `>= 20` (recommended: Node 22 LTS via `.nvmrc`)
   - `pnpm` `>= 9` (this repo uses `pnpm@12.21.0`)

2. **Install dependencies**:

   ```bash
   pnpm install
   ```

3. **Configure Environment Variables**:
   Copy `.env.example` to each app's `.env.local`:

   ```bash
   cp .env.example .env.local
   ```

   _Note: `SUPABASE_SERVICE_ROLE_KEY` is read only by the backend in `src/server`; never give it a `NEXT_PUBLIC_` prefix._

4. **Start Development Servers**:
   ```bash
   pnpm dev
   ```
   This starts all three applications concurrently:
   - Admin website: `http://localhost:3000/admin`
   - POS website: `http://localhost:3000/staff`

## Available Commands

| Command          | Description                                                    |
| ---------------- | -------------------------------------------------------------- |
| `pnpm dev`       | Starts all applications in watch mode                          |
| `pnpm build`     | Production build of the one app (Owner, POS and backend)      |
| `pnpm lint`      | Runs ESLint on src/                                            |
| `pnpm typecheck` | Runs TypeScript type checking                                  |
| `pnpm test`      | Runs unit tests using Vitest                                   |
| `pnpm format`    | Checks code formatting with Prettier                           |
| `pnpm db:types`  | Generates TypeScript database types from local Supabase schema |

## Security & Architecture Principles

1. **Zero Browser Service Role Key**: `SUPABASE_SERVICE_ROLE_KEY` is strictly confined to `src/server/lib/supabase-admin.ts` and validated by CI.
2. **Offline-First POS**: Orders are saved to Dexie IndexedDB locally with client-generated transaction IDs before being synced to `POST /api/sync`.
3. **Double Verification**: Both UI route protection and API endpoint authorization (`requireUser` + `requireRole`) verify caller credentials.
4. **Origin Isolation**: browsers never call the API. It is a private Vercel service reached only by the Admin and POS servers, so it sends no CORS headers (`ALLOWED_ORIGINS` is used only by local demo mode).
