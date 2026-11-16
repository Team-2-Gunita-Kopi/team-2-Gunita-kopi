# Vercel Deployment Guide

This repository is structured as a Turborepo monorepo designed for isolated deployment into three separate projects on Vercel.

## Monorepo Architecture on Vercel

Although all source code resides within one Git repository, Vercel deploys three discrete projects:

1. **Gunita Admin Portal** (`apps/admin`)
2. **Gunita POS Terminal** (`apps/pos`)
3. **Gunita Backend API** (`apps/api`)

### Turborepo Incremental Builds & Caching

Vercel automatically integrates with Turborepo Remote Caching. When a commit is pushed:

- If only `apps/admin` or packages that `apps/admin` depends on have changed, only the Admin project is rebuilt.
- If only `apps/pos` changes, `apps/admin` and `apps/api` skip the build step entirely (`>>> Full Turbo: Cached`).
- Pull request preview deployments are generated independently for each app.

## Project Setup on Vercel

For each project, create a new Project in your Vercel Dashboard connected to this repository and set the **Root Directory** as follows:

### 1. Project: `gunita-admin`

- **Root Directory**: `apps/admin`
- **Framework Preset**: Next.js
- **Build Command**: `cd ../.. && pnpm turbo run build --filter=@gunita/admin` (or leave default Vercel build command with root directory configured)
- **Output Directory**: `.next`

### 2. Project: `gunita-pos`

- **Root Directory**: `apps/pos`
- **Framework Preset**: Next.js
- **Build Command**: `cd ../.. && pnpm turbo run build --filter=@gunita/pos`
- **Output Directory**: `.next`

### 3. Project: `gunita-api`

- **Root Directory**: `apps/api`
- **Framework Preset**: Next.js
- **Build Command**: `cd ../.. && pnpm turbo run build --filter=@gunita/api`
- **Output Directory**: `.next`

---

## Environment Variables Matrix

Set the corresponding environment variables in the Project Settings on Vercel.

| Environment Variable            | Project: `gunita-admin` | Project: `gunita-pos` | Project: `gunita-api` | Secret / Public          | Description                                                                                               |
| ------------------------------- | ----------------------- | --------------------- | --------------------- | ------------------------ | --------------------------------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`      | **Required**            | **Required**          | **Required**          | Public                   | The Supabase project URL (`https://<ref>.supabase.co`)                                                    |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | **Required**            | **Required**          | **Required**          | Public                   | Public anonymous key for client sessions                                                                  |
| `NEXT_PUBLIC_API_URL`           | **Required**            | **Required**          | _Not Used_            | Public                   | URL of the deployed `gunita-api` service                                                                  |
| `SUPABASE_SERVICE_ROLE_KEY`     | **FORBIDDEN**           | **FORBIDDEN**         | **Required**          | **Secret (Server Only)** | Privileged key for employee provisioning and audit logs                                                   |
| `ALLOWED_ORIGINS`               | _Not Used_              | _Not Used_            | **Required**          | Server Config            | Comma-separated list of approved domains (e.g. `https://admin.gunitakopi.com,https://pos.gunitakopi.com`) |

> **Security Warning**: Never add `SUPABASE_SERVICE_ROLE_KEY` to the `gunita-admin` or `gunita-pos` Vercel projects. Continuous integration scanning will fail if this key is referenced outside `apps/api`.
