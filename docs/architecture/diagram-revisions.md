# Architecture diagram: what to revise

Checked on 2026-11-25 against `main` (pull request #7) and the live site.
Diagram: "Gunita Coffee POS: Cloud and DevOps Architecture".

How to read this: each table lists only the boxes whose text no longer matches the system.
Anything not listed can stay as it is.

---

## 1. Clients, web delivery and offline capability

| Box | Current text | Change to | Why |
|---|---|---|---|
| Owner / Admin | `gunitakopi.com` | `gunitakopi.vercel.app/admin` | There is no custom domain. |
| Cashier / Barista | `POS PWA, works offline` | `POS in the browser, works offline` | The team decided not to install the POS as an app (2026-11-25). |
| Cashier / Barista | `Role: barista/staff` | `Role: barista` | The only staff role is `barista` (`src/auth`). |
| Cashier / Barista | `gunitakopi.com` | `gunitakopi.vercel.app/staff` | No custom domain. |
| Sync triggers | `Online event + Background Sync*` | `After each sale · connection returns · app reopened · retry every 1 minute` | Background Sync is written in `src/staff/offline/triggers.ts` but never switched on. The 1-minute retry was added on 2026-11-25 (`src/staff/features/pos/hooks/use-sync.ts`). |
| Footnote | `*Background Sync support varies by browser…` | Remove the Background Sync part; keep `Do not cache secrets or sensitive admin responses.` | Background Sync is not used. |

Keep as is: Service Worker, IndexedDB.

---

## 2. Vercel: cloud application hosting

No changes. Next.js web application and Vercel Functions match the code.

---

## 3. Supabase: managed backend services

| Box | Current text | Change to | Why |
|---|---|---|---|
| Supabase Storage | `Product images and authorized receipt files` | `Product images (private bucket)` | Receipts are never stored; they are printed from the order. Only product images use Storage (`src/server/modules/products/service.ts`). |
| Supabase Auth | `Employee sign-in • sessions • JWT` | `Employee sign-in • sessions • JWT • Owner 6-digit email code` | The Owner's second sign-in step is an emailed code. |
| RLS + Postgres functions (optional) | `Role policies • atomic checkout • stock updates` | add `• refuses out-of-stock sales • soft deletes` | Checkout is refused when a recipe ingredient is short; ingredients, products and suppliers are soft deleted. |

Keep as is: Supabase PostgreSQL.

---

## 4. Offline transaction synchronization

| Box | Current text | Change to | Why |
|---|---|---|---|
| 1 Create order (optional) | `POS uses cached catalog / Cashier builds order` | add `Out-of-stock items are blocked` | The menu greys out products whose ingredients are short (2026-11-25). |
| 3 Connection returns | `Online event / Background Sync / Retry when app becomes active` | `Online event · app reopened · retry every minute` | Same as Sync triggers above. |

Keep as is: 2 Save locally, 4 Send to API, 5 Commit and acknowledge, and the note under the row.

---

## 5. Security and access controls

| Box | Current text | Change to | Why |
|---|---|---|---|
| Admin MFA + audit logs | `ADMIN MFA + AUDIT LOGS` | `OWNER 2-STEP SIGN-IN (EMAIL CODE) + AUDIT LOGS` | It is a code sent by email, not an authenticator app. |
| New box (optional) | none | `SIGN-IN LIMITS + OWNER AUTO SIGN-OUT` / `Repeated wrong passwords are blocked · Owner signed out after 30 min idle` | Both exist (`login_throttle` in the database; idle sign-out in the Admin layout). The POS has no auto sign-out since 2026-11-25. |

Keep as is: Invite-only staff accounts, RBAC Admin/Barista, Supabase RLS, HTTPS/TLS + server secrets.

---

## 6. DevOps pipeline, deployment and monitoring

| Box | Current text | Change to | Why |
|---|---|---|---|
| GitHub Actions | `Lint • type-check • unit tests / Build validation` | add `• secret-key check • dependency audit • migration SQL tests` | All of these run in `.github/workflows/ci.yml` and `db-migrations.yml`. |
| Vercel deployment | `Preview + production release / After successful checks` | See decision A below | Nothing on GitHub stops a merge when checks fail. |
| Database migrations | `Versioned SQL schema changes / Controlled Supabase release` | See decision B below | Migrations were applied by hand in the Supabase SQL Editor. |
| Arrow "Controlled migration" (GitHub Actions → Database migrations) | dashed arrow | See decision B below | The GitHub migration job has not been used. |

Keep as is: GitHub repository, Monitoring and audit, "Push / PR", "Checks pass", "Runtime logs", "DB logs and audit".

### Decision A: checks before release

Pick one:

1. **Make the diagram true (recommended, 5 minutes).** GitHub → repo **Settings** → **Rules** →
   **Rulesets** → **New branch ruleset** → target **main** → turn on **Require a pull request
   before merging** and **Require status checks to pass** → add **Lint, Test, Typecheck & Build** →
   **Create**. Then keep the box text.
2. **Change the text** to `Preview + production release / Production deploys from main`.

### Decision B: database releases

Pick one:

1. **Change the text** to `Versioned SQL files / Applied in Supabase SQL Editor after review`, and
   remove the "Controlled migration" arrow. This is what the team does today.
2. **Make the diagram true.** GitHub → repo **Settings** → **Environments** → **production** → add
   secret `SUPABASE_DB_URL`. Then run **Actions** → **Database Migrations** → **Run workflow** for
   each new migration. Keep the box text and the arrow.

Note: the red "staging" deployment on the repo page is a failed run of that migration job. It
changed nothing and does not affect the live site.

---

## Summary

| Section | Changes |
|---|---|
| 1 Clients and offline | Links, role name, no app install, sync triggers |
| 2 Vercel | None |
| 3 Supabase | Storage text, Owner email code |
| 4 Offline sync | Retry every minute |
| 5 Security | "MFA" → email code; optional sign-in limits box |
| 6 DevOps | Decisions A and B; extra checks in GitHub Actions |
