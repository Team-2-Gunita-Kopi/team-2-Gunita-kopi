# Architecture Documentation

The system architecture diagrams and visual models will be placed in this folder.

## Core Architectural Rules (Section 3 Summary)

1. **Zero Browser Service Role Key**:
   The browser never receives or reads the Supabase service role key. Only server code inside `apps/api` (`apps/api/src/lib/supabase-admin.ts`) may read `SUPABASE_SERVICE_ROLE_KEY`.

2. **No Direct Database Access from Frontend**:
   The Admin website (`apps/admin`) and POS website (`apps/pos`) utilize Supabase Auth strictly for user authentication. For all business data operations, the browser calls the site's own same-origin `/api` route; the site server reads the HttpOnly session cookie and forwards the call to the backend API (`apps/api`) with `Authorization: Bearer <token>`. The browser never holds a token. Neither website connects to PostgreSQL directly.

3. **Dual-Lock Server-Side Authorization**:
   `apps/api` checks the authentication token, user active status, and role on every protected route. Row Level Security (RLS) acts as the second lock. By default, the API instantiates a Supabase client using the caller's JWT token, ensuring database-level RLS policies apply. The service role key is reserved strictly for employee provisioning and audit logs.

4. **No Public Registration**:
   There is no public sign-up or registration form. Store owners provision all employee accounts through `POST /api/admin/employees`.

5. **Strict Roles in Metadata**:
   The only system roles are `owner_admin` and `barista`. Roles are assigned in Supabase Auth `app_metadata` to prevent client modification. While the client UI may inspect the token to adapt views, the API enforces role verification independently on every request.

6. **Offline-First POS**:
   The POS application saves every order locally on device first in an IndexedDB (`Dexie`) outbox with a unique client transaction ID (`clientTxId`). When connectivity is restored, orders are synchronized via `POST /api/sync`. Orders are marked synced only after database commit confirmation. Secrets and sensitive admin responses are never cached.

7. **Atomic Checkout & Inventory Updates via RPC**:
   Order recording and ingredient stock decrements are executed inside a single PostgreSQL function (`process_checkout_transaction`), guaranteeing that sales and stock deductions either succeed together or roll back atomically.

8. **Private Applications**:
   Both websites require authentication and appropriate roles for all pages (except `/login`). Both applications serve `X-Robots-Tag: noindex, nofollow` headers and security headers (CSP, Frame Options, Referrer Policy).

9. **Strict Origin Isolation**:
   Browsers never call the API: it is a private Vercel service reached only by the Admin and POS servers, so it sends no CORS headers (`ALLOWED_ORIGINS` applies to local demo mode only).

10. **Versioned Database Migrations**:
    All database schema modifications are managed exclusively via versioned SQL migration scripts located in `supabase/migrations`.
