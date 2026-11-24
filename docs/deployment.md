# Setup and deployment, start to finish

This guide takes Gunita Kopi POS from a fresh clone to production on Vercel. It is one Next.js app
(one `package.json`), deployed as a standard Vercel Next.js project: one build, one deployment.

| URL | Area | Notes |
|---|---|---|
| `/` | redirect | Goes to `/staff/pos`. The bare address opens the staff POS, never the Owner sign-in. |
| `/admin` | Owner portal (`src/app/(owner)`) | Sign-in at `/admin/login`, then the emailed code. |
| `/staff` | Barista POS (`src/app/(staff)`) | Main screen `/staff/pos`; `/pos` redirects there. Offline PWA scoped to `/staff/`. |
| none | backend (`src/server`) | Private: called in process by the `/admin/api` and `/staff/api` proxies. Public only: `/api/health`, `/api/setup/owner` (setup token), `/api/mock/rpc` (demo, refused in production). |

The design and its reasons are in `docs/superpowers/specs/2026-11-24-one-vercel-deploy-and-hardening-design.md`.

**Rules for every step:**

- Steps marked **(approval)** change something live. Do them only with the project lead's explicit go-ahead.
- Never commit `.env*` files, except `.env.example`.
- Never put the service-role key in a `NEXT_PUBLIC_*` variable.

## How code reaches production

```
feature branch --PR--> GitHub Actions CI (audit, lint, typecheck, tests, build)
                  \--> Vercel Preview (uses the dev Supabase project, behind Vercel login)
merge to main (only when CI is green) --> Vercel Production (uses the production Supabase project)
```

| Vercel environment | Built from | Supabase project |
|---|---|---|
| Production | `main` | production (new, clean) |
| Preview | every other branch and PR | `gunita-kopi-pos-dev` |
| Development | `vercel env pull` / your machine | local Docker stack (default) or dev |

## Phase 0: accounts and tools (once)

1. **Accounts:**
   - GitHub access to `Team-2-Sweet-Creatures/team-2-Gunita-kopi`.
   - A Vercel account.
   - A Supabase account with access to the dev project.
   - Resend, for the Owner's sign-in code email.
2. **Plan check:**
   - Vercel Hobby (free) is for non-commercial use, has no team members, and allows 3 firewall
     rules. Verify whether Hobby can deploy this repo: private repos owned by a GitHub
     organization may need Pro. A live shop should use **Pro**.
   - GitHub Free: required checks and Environments are free on public repos. Private repos may
     need a paid plan.
3. **Tools:**
   - Git, **Node 22**, Docker Desktop (for local Supabase), Git Bash on Windows.
   - pnpm is run as `npx -y pnpm@12.21.0`.
   - The Vercel CLI is run as `npx -y vercel@66.6.0`.
   - The Supabase CLI is run as `npx -y supabase@2.122.1`.

## Phase 1: local development

1. Clone the repo, then run `bash scripts/setup-local.sh` from the repo root. It:
   - checks your tools,
   - installs packages,
   - starts the local Supabase stack,
   - applies the migrations,
   - seeds the test accounts,
   - prints the passwords.
2. Run `npx -y pnpm@12.21.0 dev`:
   - Admin: http://localhost:3000/admin
   - POS: http://localhost:3000/staff
   - Sign-in codes: http://127.0.0.1:54326
3. **Demo mode, no database:** `MOCK_MODE=true NEXT_PUBLIC_USE_MOCKS=true npx -y pnpm@12.21.0 dev`.
   Demo accounts: `owner` / `owner123` and `barista` / `barista123`.
4. Before every push, run `bash scripts/predeploy-check.sh`. It runs install, lint, typecheck,
   tests, build and audit, and must end with "All pre-deploy checks passed".

## Phase 2: GitHub (once, approval)

1. Go to Settings → Branches → add a rule (or ruleset) for `main`:
   - Require a pull request before merging.
   - Require status checks to pass: **"Lint, Test, Typecheck & Build"** (from `.github/workflows/ci.yml`).
   - Require branches to be up to date before merging.
   - Block force pushes.
2. Go to Settings → Environments → create `staging` and `production`. Give each a secret
   `SUPABASE_DB_URL`, the session-pooler URL of that Supabase project.
   - Add required reviewers on `production`.
   - The manual "Database Migrations" workflow uses these environments. It applies only the exact
     versions you list.
3. **CI runs on every PR to `main`:**
   - Service-role key isolation check.
   - Dependency audit (high and above).
   - Lint, typecheck, all tests and the build.
   - `db-migrations.yml` also runs the SQL tests on PRs that touch `supabase/`.

## Phase 3: production Supabase project (once, approval)

1. Create a new project in **Southeast Asia (Singapore), `ap-southeast-1`**. Use a strong database
   password and store it in a password manager.
2. **Migrations** (from your machine). Use the session pooler if the direct host does not resolve:
   `postgresql://postgres.<ref>:<password>@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres`.

   ```bash
   export PROD_DB_URL='...'   # never echo it or commit it
   npx -y supabase@2 db push --dry-run --db-url "$PROD_DB_URL"   # must list every migration, in order
   npx -y supabase@2 db push --db-url "$PROD_DB_URL"
   ```

   The project has no migration history yet, so a full push is expected here. On an existing
   project, use the manual workflow with the exact approved versions.
3. **Authentication** settings, the same as dev:
   - Sign-ups off.
   - Email OTP: 6 digits, expiry 300 s.
   - The Magic Link and Recovery templates contain `{{ .Token }}`.
   - Custom SMTP (Resend) on, email rate limit 30/h.
   - TOTP MFA off.
   - Raise Supabase's per-IP sign-in limit so the app's own throttle trips first.
4. **Authentication → JWT signing keys:** use asymmetric keys (ES256) from the start. Page guards
   can then verify sessions locally, without a call to Supabase Auth on every page (see "Speed").
5. **Create the one Owner account:**

   ```bash
   # Shell 1: run the app against production. Exported values override .env.local.
   export NEXT_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co
   export NEXT_PUBLIC_SUPABASE_ANON_KEY=<publishable key>
   export SUPABASE_SERVICE_ROLE_KEY=<service role key>
   export OWNER_SETUP_TOKEN=$(openssl rand -hex 32)
   npx -y pnpm@12.21.0 dev

   # Shell 2: same OWNER_SETUP_TOKEN.
   OWNER_SETUP_TOKEN=<same> node scripts/provision-owner.mjs   # calls http://localhost:3000/api/setup/owner
   ```

   Then stop the app and close both shells. The setup route refuses a second Owner.
6. **Data:** the Owner enters the real menu, recipes, add-ons, suppliers and opening stock (as
   stock-ins) in Admin. Never run the demo seeds on production.

## Phase 4: Vercel project (once, approval)

1. Go to Vercel → Add New → Project → import the GitHub repo. Framework preset: **Next.js**. Leave
   **Root Directory empty**. `vercel.json` only pins functions to `sin1` (Singapore); routing,
   redirects and security headers live in `next.config.ts`.
2. In Settings → Git, set Production Branch to `main`.
3. In Settings → General, set Node.js Version to 22.x (it also comes from `engines`).
4. **Environment variables** (Settings → Environment Variables, or `npx -y vercel@66.6.0 env add <NAME> <env>`).
   Mark secrets as Sensitive.

| Variable | Production | Preview | Notes |
|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | prod URL | dev URL | public |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | prod publishable key | dev publishable key | public |
| `SUPABASE_SERVICE_ROLE_KEY` (Sensitive) | prod | dev | server only |
| `INTERNAL_PROXY_SECRET` (Sensitive) | 32+ random chars | a different value | `openssl rand -hex 32` |
| `OWNER_SETUP_TOKEN` | unset | unset | only while provisioning |

   - Never set `MOCK_MODE` or `NEXT_PUBLIC_USE_MOCKS` on Vercel.
5. In Settings → Deployment Protection, turn on Vercel Authentication for Preview deployments.

## Phase 5: first preview (verification)

1. Push a branch and open a PR. CI runs, and Vercel posts a preview URL on the PR.
2. **Confirm the routing:**
   - Functions run in `sin1` (deployment details in the Vercel dashboard).
   - `/admin/...` serves the Owner portal, `/staff/...` the POS, and `/` redirects to `/staff/pos`.
   - `/api/products` returns 404 (the backend is private), and `/api/setup/owner` refuses a request
     without the setup token.
3. **Test pass on the preview** (dev database):
   - Owner sign-in with the emailed code.
   - Barista sign-in at `/staff/login`.
   - A sale.
   - An offline sale that syncs later.
   - Stock-in, stock-out, and a Barista adding an ingredient.
   - Reports export.
   - The PWA installs from `/staff`.
   - The browser console shows no `Content-Security-Policy-Report-Only` reports.
4. **Only the Owner gets into `/admin`** (live security checks; record the results in the PR):
   - A wrong password is refused, and so is a wrong emailed code.
   - A used code cannot be reused.
   - A Barista account on `/admin/login` is refused, and a Barista session sees `/admin/restricted`.
   - A second Owner setup is refused.
   - A database check shows exactly one `owner_admin` row:
     `select count(*) from public.users where role = 'owner_admin';` must return 1.
   - POS logout clears cached data, but queued offline orders stay.

## Phase 6: firewall (approval)

1. Run `bash scripts/vercel-firewall.sh` (or `bash scripts/vercel-firewall.sh pro`). It stages three
   rules in **log** mode and never publishes:
   - the sign-in rate limit;
   - the probe block;
   - **Owner portal: Philippines only** (`/admin` from outside PH is blocked once enforced; the POS is
     unaffected). If the Owner travels abroad, disable that rule in the Vercel dashboard.
2. Review hits in Vercel → Firewall for about a day.
3. Switch the rules to enforce (`--rate-limit-action rate_limit`, or `--action deny`).
4. A person runs `npx -y vercel@66.6.0 firewall publish --yes`.

## Phase 7: go-live (approval)

1. Merge the PR into `main`. CI must be green. Vercel builds Production.
2. Smoke test on the production URL: Phase 5 step 3, with real accounts.
3. Install the POS PWA on the shop tablet from `https://<project>.vercel.app/staff`.
4. **Security policy:** once previews show no reports, merge the report-only policy into the
   enforced `Content-Security-Policy` header in `next.config.ts` (one header).

## Phase 8: running it

- **Rollback:** `npx -y vercel@66.6.0 rollback` (or Instant Rollback in the dashboard) returns
  the whole app at once. Database migrations are never rolled back by Vercel; keep a rollback
  SQL file with each migration.
- **New migrations:**
  - PR with the migration and its SQL test. CI runs them on PostgreSQL.
  - After merge, run "Database Migrations" by hand with `target=production` and the exact versions.
- **Logs:** `npx -y vercel@66.6.0 logs <deployment-url>`, plus Supabase → Logs.
- **Backups:** the free Supabase plan has no point-in-time restore. Take a weekly `pg_dump`
  through the pooler URL and store it off-site.
- **Free Supabase projects pause after a week without traffic.** Daily shop use prevents this.

## Speed: why some requests are slow, and what was done

Measured from a developer machine in the Philippines on 2026-11-24:

| What | Cost |
|---|---|
| One Supabase round trip | about 80–120 ms |
| A request through a local `next dev` server (no Supabase) | about 65–100 ms |
| The first request to a route in `next dev` (on-demand compile) | several seconds |

Where the time went for one screen action:

1. Browser to the area's `/api` proxy, which calls the backend in process (one server hop; before
   2026-11-24 there were two, through a separate API app).
2. **The identity check in the API:** verify the token with Supabase Auth, then read the user's
   profile, then (Owner) confirm the emailed-code approval. These were three round trips in a row.
3. The actual data query (one round trip; list endpoints already run their queries in parallel).
4. On page navigations, the page guard checks the session. With legacy HS256 JWT keys that is
   another call to Supabase Auth.

Done:

- **Identity check runs in parallel** (`src/server/lib/auth.ts`). Three round trips become one
  for the Owner, two become one for a Barista: about 100–200 ms saved per request from the
  Philippines. Tests in `tests/server/auth-parallel.test.ts`.
- **Ingredient detail** reads the row and the Owner's costs in parallel.
- **Functions pinned to `sin1` (Singapore)** in `vercel.json`, next to Supabase. The default US
  region would add about 200 ms to every Supabase call.

Still to do (each optional):

- **Asymmetric JWT keys:** Supabase → Authentication → JWT signing keys, for dev (approval) and
  production (Phase 3). The page guard's `getClaims()` then verifies locally instead of calling
  Supabase Auth on every navigation.
- **Faster local dev:** try `next dev --turbopack` in the `dev` script. On-demand compiling
  is the main reason the first click on each page is slow locally. Production builds do not have
  this delay.
- **Later:** merge the profile read and the approval check into one SQL function (one query
  instead of two). The Owner and POS areas stay separate (OWASP: separate admin and user access).

## Next feature: Owner passkeys

The Owner signs in with the password, then a passkey on an enrolled phone or laptop (Face ID,
fingerprint or PIN). The emailed code stays for recovery and for enrolling a new device. It is built
with SimpleWebAuthn; Supabase's passkeys are still experimental. See spec section 10. Design first.

Until then, turn on 2-step verification for the Owner's email and for every Supabase, Vercel and
GitHub admin account. Anyone with those can bypass the app.
