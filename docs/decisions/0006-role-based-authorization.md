# Decision 0006: Dual-Layer Role Authorization with Supabase app_metadata

## Status

Accepted

## Context

Gunita Kopi operates with two distinct user roles: `owner_admin` and `barista`. Roles must be immutable by the client and enforced at both the application route and database levels.

## Decision

We store user roles strictly in Supabase Auth `app_metadata.role`, provisioned only via `POST /api/admin/employees`.

## Rationale

- Supabase `app_metadata` can only be set or modified by the service role, preventing users from altering their privileges.
- Layer 1: Middleware and route handlers verify claims using `requireUser` and `requireRole`.
- Layer 2: API initiates a Supabase client using the user's JWT token, allowing PostgreSQL Row Level Security (RLS) to enforce data-tier permissions.
- Prevents privilege escalation and isolates store-level operations from system administration.
