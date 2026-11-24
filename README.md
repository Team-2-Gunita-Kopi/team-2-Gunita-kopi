# Gunita Kopi POS Monorepo

Gunita Kopi is a modern Point of Sale (POS) and inventory management system designed for coffee shop operations. It calculates real-time recipe costing, tracks stock levels, and enables seamless offline order taking.

## Key Architecture Rule

> **Important**: The frontend websites (`apps/admin` and `apps/pos`) **never connect directly to the database**. All business data requests go to the site's own `/api` route, which reads the HttpOnly session cookie on the server and forwards the call to the backend API (`apps/api`, a private Vercel service) with the user's token. The browser never holds a token. The frontend uses Supabase Auth strictly for user authentication. The database is protected behind Row Level Security (RLS) and server-side authorization.

## System Roles

- **Owner (`owner_admin`)**: Full access to the Admin website (`apps/admin`), inventory management, recipe costing, staff management, and financial reporting.
- **Barista (`barista`)**: Access to the POS website (`apps/pos`) for taking orders, managing POS transactions, tracking in-shop inventory, and offline outbox sync.

## Target Structure

```text
gunita-kopi-pos/
├─ apps/
│  ├─ admin/                 # Private website for the Owner (port 3000)
│  ├─ pos/                   # Private offline-first PWA for the Barista (port 3001)
│  └─ api/                   # Backend Route Handlers only (port 3002)
├─ packages/
│  ├─ contracts/             # Shared zod schemas and types for requests and responses
│  ├─ db-types/              # Generated Supabase database types
│  ├─ auth/                  # Roles, role guards and token helpers
│  ├─ ui/                    # Shared Tailwind components and design theme
│  └─ config/                # Shared eslint, tsconfig and tailwind preset
├─ supabase/
│  ├─ migrations/            # Versioned SQL migration files
│  ├─ seed.sql               # Seed data placeholder
│  └─ config.toml            # Supabase CLI configuration
├─ docs/
│  ├─ architecture/          # Architecture documentation and rules
│  ├─ decisions/             # Architecture Decision Records (ADRs)
│  ├─ api.md                 # API endpoints, roles, and descriptions
│  ├─ database.md            # Database schema and views plan
│  └─ deployment.md          # Vercel deployment guide
├─ .github/
│  └─ workflows/
│     ├─ ci.yml              # CI workflow (lint, test, build, security scan)
│     └─ db-migrations.yml   # Staging/Production database migration workflow
├─ .env.example              # Monorepo environment variable template
├─ .editorconfig             # Consistent editor configuration
├─ .gitignore                # Git ignore patterns
├─ .nvmrc                    # Target Node.js LTS version (v22)
├─ CONTRIBUTING.md           # Contribution, git workflow, and commit conventions
├─ README.md                 # This file
├─ package.json              # Monorepo root manifest
├─ pnpm-workspace.yaml       # pnpm workspace definition
├─ tsconfig.base.json        # Base TypeScript configuration
└─ turbo.json                # Turborepo task pipeline configuration
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
   cp .env.example apps/admin/.env.local
   cp .env.example apps/pos/.env.local
   cp .env.example apps/api/.env.local
   ```

   _Note: Remove `SUPABASE_SERVICE_ROLE_KEY` from `apps/admin` and `apps/pos` env files. Only `apps/api` requires the service role key._

4. **Start Development Servers**:
   ```bash
   pnpm dev
   ```
   This starts all three applications concurrently:
   - Admin website: `http://localhost:3000/admin`
   - POS website: `http://localhost:3001/staff`
   - Backend API: `http://localhost:3002`

## Available Commands

| Command          | Description                                                    |
| ---------------- | -------------------------------------------------------------- |
| `pnpm dev`       | Starts all applications in watch mode                          |
| `pnpm build`     | Builds all packages and applications via Turborepo             |
| `pnpm lint`      | Runs ESLint across all workspaces                              |
| `pnpm typecheck` | Runs TypeScript type checking across all workspaces            |
| `pnpm test`      | Runs unit tests using Vitest                                   |
| `pnpm format`    | Checks code formatting with Prettier                           |
| `pnpm db:types`  | Generates TypeScript database types from local Supabase schema |

## Security & Architecture Principles

1. **Zero Browser Service Role Key**: `SUPABASE_SERVICE_ROLE_KEY` is strictly confined to `apps/api/src/lib/supabase-admin.ts` and validated by CI.
2. **Offline-First POS**: Orders are saved to Dexie IndexedDB locally with client-generated transaction IDs before being synced to `POST /api/sync`.
3. **Double Verification**: Both UI route protection and API endpoint authorization (`requireUser` + `requireRole`) verify caller credentials.
4. **Origin Isolation**: browsers never call the API. It is a private Vercel service reached only by the Admin and POS servers, so it sends no CORS headers (`ALLOWED_ORIGINS` is used only by local demo mode).
