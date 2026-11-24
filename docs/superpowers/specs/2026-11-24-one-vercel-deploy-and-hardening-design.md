# One Vercel deployment, hardening and cleanup: design

Date: 2026-11-24. Status: draft for approval. Branch: `dev/jay`.

Labels used below: **verified** = checked in code or by a command on 2026-11-24.
**To verify** = depends on Vercel behaviour we have not tested yet.

## 1. Intent

The team was about to deploy Gunita Kopi POS to Vercel as three projects (Admin, POS, API).
The goal is one Vercel project, one deployment and one domain. A single push should ship
everything together and roll back together. The work also covers closing the DDoS and
injection gaps, cleaning up stale or duplicated code and docs ("unslop"), and a design refresh.

Goals:

- One Vercel project and one URL. Admin, POS and API ship and roll back as one unit.
- The API is not reachable from the internet. Only the Admin and POS servers can call it.
- Edge rate limiting and probe blocking in front of the sign-in and API routes.
- Functions run next to the database (Singapore).
- Docs and config describe what the code actually does.

Non-goals (this design):

- Merging the three Next.js apps into one app (option B). Rejected on 2026-11-24: OWASP
  recommends separate applications for administrator and user access, so Admin and POS stay separate.
- Changing business rules, roles, the database schema or the sign-in flow.
- The design refresh itself. It is Project 3 (section 9) and gets its own brainstorm and spec.

Anti-goals (a failure even if it deploys):

- The service-role key or a Supabase token reaching a browser.
- Preview deployments writing junk into the production database with no protection.
- Admin or POS losing offline sync or the Owner's emailed-code sign-in.

## 2. How it works today (verified)

- **Apps.** `apps/admin` (Owner, :3000), `apps/pos` (Barista PWA, :3001) and `apps/api`
  (Route Handlers, :3002). They are about 5.0k, 4.2k and 3.5k lines of TS/TSX.
- **One API already.** Admin and POS each have `src/app/api/[...path]/route.ts`. This is a
  same-origin pass-through (`session.proxy` in `packages/auth/src/session-server.ts`). It reads
  the HttpOnly cookie and calls `apps/api` server to server with `Authorization: Bearer`. The
  browser never holds a token.
- **Cost per click.** Every screen action runs two functions: the site proxy, then the API.
  The API then makes 2–3 Supabase round trips before doing any work: `auth.getUser`, the
  `users` row, and `app_role` for the Owner (`apps/api/src/lib/auth.ts`). The page middleware
  also checks the session (`getClaims`).
- **API URL config is duplicated.** Sites read `API_URL`, then `NEXT_PUBLIC_API_URL`, then fall
  back to `http://localhost:3002` (`apps/*/src/lib/env.ts`, `session-handlers.ts`). If both are
  missing in production, the site silently calls localhost.
- **Login.** `/auth/login` forwards the client IP to the API with `INTERNAL_PROXY_SECRET`. The
  API checks it with a timing-safe compare and requires at least 32 characters. On Vercel the
  client IP comes from `x-real-ip`.
- **Route names overlap.** Admin and POS both have `/inventory`, `/orders`, `/login`, `/auth/*`,
  `/restricted` and `/api/*`.
- **Hard-coded paths.** 51 hard-coded `"/api/..."` or `"/auth/..."` strings across the two
  apps. POS has 39 absolute path references, including `/icons/cat-*.svg`, the manifest and the
  service worker.
- **Service worker.** The POS service worker (Serwist, `defaultCache`) is served at `/sw.js`
  with scope `/`.
- **Owner setup.** The Owner account exists on live (`admingunita`, per `CLAUDE.md`).
  `scripts/provision-owner.mjs` calls `POST /api/setup/owner` on the API. The API refuses this
  call once an Owner exists.
- **Versions.** Next 15.5.29, React 19.3.1, zod 3.25.76 (contracts), Node 22 (`.nvmrc`). The
  root `package.json` says `engines.node ">=20.0.0"`.

## 3. Approaches considered

| | A. One project, Vercel Services (chosen) | B. Merge into one Next.js app | C. Three projects (status quo) |
|---|---|---|---|
| Deploys | 1 deployment, 1 rollback | 1 | 3 (one push triggers all) |
| API on the internet | No (private binding) | No (in-process) | Yes, needs CORS and WAF |
| Code change | Small: config, POS `basePath`, path helper | Large: route collisions, moved layouts, merged middleware, tests | None |
| Function hops per click | 2 (internal, skips public firewall/CDN) | 1 | 2 (public) |
| Service-role key boundary | Code stays in `apps/api`; env var visibility **to verify** (section 4.6) | Key lives in the same app as the UI | Clean |
| Risk | Services is **beta** on all plans | Most retesting before launch | Lowest |

**Picked: A.** It meets the ask (one deploy, one API) with the least churn. It also takes the
API off the internet, which is the biggest single anti-abuse win. If Services fails on a
preview deploy (section 7, step 5), fall back to C without changing app code. B stays a
possible later clean-up once the app is live.

## 4. Design: one project with Vercel Services

### 4.1 URL layout (my call)

- Admin at `/`. POS at `/staff` (Next `basePath: "/staff"`). The API has no public route.
- Why `/staff`: it matches the Figma "Staff" frames and the `staff-mode` class. It also keeps
  the POS service worker inside `/staff/`, so it never caches Owner pages. With POS at `/`,
  the worker's scope would cover `/admin` too.
- Path routing works the same on preview URLs, which have a single host. With a custom domain
  you can later add host rules so `pos.<domain>` and `admin.<domain>` become separate origins
  (see 4.6).

### 4.2 `vercel.json` (repo root, draft)

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "regions": ["sin1"],
  "services": {
    "admin": {
      "root": "apps/admin",
      "installCommand": "cd ../.. && pnpm install --frozen-lockfile",
      "buildCommand": "cd ../.. && pnpm turbo run build --filter=@gunita/admin",
      "bindings": [{ "type": "service", "service": "api", "format": "url", "env": "API_URL" }]
    },
    "pos": {
      "root": "apps/pos",
      "installCommand": "cd ../.. && pnpm install --frozen-lockfile",
      "buildCommand": "cd ../.. && pnpm turbo run build --filter=@gunita/pos",
      "bindings": [{ "type": "service", "service": "api", "format": "url", "env": "API_URL" }]
    },
    "api": {
      "root": "apps/api",
      "installCommand": "cd ../.. && pnpm install --frozen-lockfile",
      "buildCommand": "cd ../.. && pnpm turbo run build --filter=@gunita/api"
    }
  },
  "rewrites": [
    { "source": "/staff", "destination": { "service": "pos" } },
    { "source": "/staff/(.*)", "destination": { "service": "pos" } },
    { "source": "/(.*)", "destination": { "service": "admin" } }
  ],
  "headers": [
    {
      "source": "/(.*)",
      "headers": [{ "key": "Strict-Transport-Security", "value": "max-age=63072000; includeSubDomains" }]
    }
  ]
}
```

To verify on the first preview:

- Whether `installCommand` runs from the service root or the repo root. The `cd ../..` assumes
  the service root.
- That top-level `regions` applies to every service.
- That a `/(.*)` admin catch-all never shadows `/staff`. Rewrites are evaluated in order, and
  routing into a service is final.

### 4.3 Code changes

1. **POS `basePath: "/staff"`** in `apps/pos/next.config.ts`. `<Link>`, `router.push` and
   `redirect()` pick it up automatically. `fetch()`, `<img src>`, the manifest and the service
   worker registration do not. Add one small helper and use it in POS's `lib/api-client.ts`,
   `features/*/api.ts` and `features/auth/api.ts`. Apply the same fix to the `/icons/...` image
   paths. Set the manifest `start_url` and `scope` to `/staff/`.
2. **Middleware redirects keep the basePath.** `packages/auth/src/middleware.ts` builds
   `new URL("/login", request.url)`, which drops `/staff`. Use `request.nextUrl.clone()` and
   set `pathname`. **To verify:** whether Next applies the basePath to middleware `matcher`
   automatically.
3. **API URL from the binding only.** The sites read `process.env.API_URL` at request time.
   Remove `NEXT_PUBLIC_API_URL`, the localhost fallback in production, and its check in both
   `next.config.ts`. Bindings exist only at runtime and not in middleware. The site middleware
   never calls the API (verified), so that is fine.
4. **Keep `INTERNAL_PROXY_SECRET`.** A binding gives network reachability, not authentication.
   The API keeps checking the secret before it trusts the forwarded client IP.
5. **Remove CORS from the API** (`apps/api/src/lib/cors.ts` and its use in `middleware.ts` and
   `mock/rpc`). No browser calls the API any more. Drop `ALLOWED_ORIGINS`.
6. **Separate the cookies.** Set the POS session cookie path to `/staff` so Admin requests
   never carry it, and the reverse.
7. **Owner setup script.** The Owner already exists, and the API refuses a second one. If setup
   is ever needed again (for example on a new database), run `apps/api` locally against that
   database and point `scripts/provision-owner.mjs` at `http://localhost:3002`. Document this.

### 4.4 Environment variables (one project)

| Variable | Value | Notes |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | project URL | public |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | publishable key | public. The sites and the API must use the same one (the 2026-11-22 sign-in bug). |
| `SUPABASE_SERVICE_ROLE_KEY` | secret | Sensitive. Used only by `apps/api` code. |
| `OWNER_SETUP_TOKEN` | secret | Sensitive. Can stay unset in production because the Owner already exists. |
| `INTERNAL_PROXY_SECRET` | 32+ random chars | Sensitive. One value shared by all services. |
| `API_URL` | injected by binding | Never set by hand. |
| `MOCK_MODE`, `NEXT_PUBLIC_USE_MOCKS` | unset | Must never be `true` in Preview or Production. |

### 4.5 Speed

- `regions: ["sin1"]` puts functions next to Supabase (`ap-southeast-1`). Today every Supabase
  call from the default US region crosses the Pacific, several times per click.
- Turborepo remote cache on Vercel. Builds already filter per app.
- Later (not in this scope): collapse the API's per-request `users` read and `app_role` call
  into one RPC.

### 4.6 Trade-offs of A (stated, not hidden)

- **Services is beta.** Fallback C needs no app code changes beyond what is listed here.
- **Shared environment variables (to verify).** If Services env vars are project-wide, the
  service-role key is present in the Admin and POS server functions too. It is never in a
  browser bundle, because it has no `NEXT_PUBLIC_` prefix. The CI check that no code outside
  `apps/api` references it still holds.
- **One origin.** Admin and POS share an origin on a single host. Their cookies and sessions
  stay separate (different names, paths after 4.3.6). But a script injected into one site
  could call the other's same-origin routes in a browser signed in to both. No XSS sinks were
  found (section 5). With a custom domain, host rules can split them into two origins.

## 5. Security: DDoS and injection

### 5.1 Already in place (verified in code)

- **SQL injection.** All database access goes through supabase-js/PostgREST, which sends
  values as parameters, or through RPC functions with `search_path = ''`. No SQL is built from
  strings in the API. Search inputs are capped at 100 characters.
- **XSS.** No `dangerouslySetInnerHTML`, `eval` or `new Function` in apps or packages. React
  escapes output.
- **Validation.** Every body and query is validated with zod (`readJson` / `readQuery`). Image
  upload checks magic bytes and a 2 MB cap.
- **CSRF.** Cookie-authenticated writes require a same-origin `Origin` header. Session cookies
  are HttpOnly and SameSite=Lax.
- **Brute force.** The sign-in throttle lives in Postgres (per username+IP, per IP, per
  username) and fails closed with 503. The Owner's emailed code has send and attempt limits.
- **Demo mode.** The mock RPC route refuses production builds.

### 5.2 Gaps and fixes

| # | Gap | Fix |
|---|---|---|
| S1 | The API is public today | Private service (section 4). The open `GET /` status page, which makes an outbound Supabase call per hit, is then unreachable. |
| S2 | No edge rate limit. Every sign-in attempt reaches Postgres. | WAF rules (5.3). Vercel's automatic L3/L4/L7 DDoS mitigation is on for every plan, and blocked traffic is not billed. |
| S3 | **zod 3.25.76 advisory** (high): memory exhaustion on oversized constrained arrays | Now: add caps where they are missing: order `items` and `notes`, the sync batch, and the comma-list status filters. The recipe request already has `.max(50)`. Bodies are already capped at 4.5 MB by Vercel. Later: move to zod ≥ 4.6.6 (a major upgrade). |
| S4 | CSP has no `script-src` (only `base-uri`, `object-src`, `frame-ancestors`, `form-action`) | Nonce-based CSP from middleware, shipped first as `Content-Security-Policy-Report-Only`. |
| S5 | No HSTS on custom domains | Header in `vercel.json` (4.2). |
| S6 | Build-time advisories: postcss via next (3 high, 1 moderate); glob and minimatch via `@serwist/next` | Not reachable from requests. Bump with `pnpm update` / `pnpm.overrides`, then rerun `pnpm audit --prod`. |
| S7 | Preview deployments use the live database | Turn on Vercel Deployment Protection for previews. Better: point Preview env vars at a separate Supabase project (decision D2). |
| S8 | `x-request-id` is taken from the client | Accept only `[A-Za-z0-9_-]{1,64}`, otherwise generate one. |
| S9 | `403` messages list role names (`Required: owner_admin or barista`) | Generic message. Keep the detail in server logs. |
| S10 | `ilike` search does not escape `%` and `_` | Harmless (it only widens the caller's own search). Escape for correctness. |

### 5.3 Firewall rules (staged: log → preview → production)

Hobby allows 3 custom rules, one of which can be a rate limit. Pro allows 40.

1. **Sign-in rate limit.** Paths starting `/auth/` or `/staff/auth/`, method POST: 20
   requests per 60 s per IP, action `rate_limit` (429). Postgres keeps the finer per-user
   throttle.
2. **Probe block.** Paths `/wp-admin`, `/wp-login.php`, `/.env`, `/.git`, `/phpmyadmin`, and
   paths ending in `.php`: deny.
3. **(Pro) API rate limit.** Paths starting `/api/` or `/staff/api/`: 300 per 60 s per IP,
   starting in `log` mode.

Each rule is added with `--action log` first. After a day of dashboard review it moves to
deny/rate-limit on preview, then production (`scripts/vercel-firewall.sh`, section 7).
`vercel firewall publish` is run by a person, not a script.

## 6. Clean-up ("unslop") list

| # | Item | Action |
|---|---|---|
| U1 | `docs/deployment.md` describes 3 projects with a wrong env matrix (no `INTERNAL_PROXY_SECRET` or `API_URL`; lists `NEXT_PUBLIC_API_URL` and `ALLOWED_ORIGINS`) | Rewrite for section 4. |
| U2 | `README.md`, `docs/architecture/README.md` describe the old "browser sends Bearer token" flow | Update to the cookie + proxy flow. |
| U3 | `CLAUDE.md` is ~600 lines of dated session logs that contradict each other (for example, `20261120000000` "not applied" in one section, "applied 2026-11-20" in another; TOTP vs emailed code) | Keep current rules only. Move history to `docs/history/`. Update the design-freeze section after Project 3. |
| U4 | 9 tracked generated files (8 `tsconfig.tsbuildinfo`, `apps/pos/public/sw.js`) | `.gitignore` them and `git rm --cached`. |
| U5 | Duplicated, leaky API URL config (`NEXT_PUBLIC_API_URL`, `API_URL`, localhost fallback) | Binding `API_URL` only (4.3.3). |
| U6 | Same env-check loop copied into 3 `next.config.ts` files with a `!process.env.CI` escape | One shared helper in `@gunita/config`, with the new variable list. |
| U7 | CORS module and `ALLOWED_ORIGINS` | Remove (4.3.5). |
| U8 | `engines.node ">=20.0.0"` vs `.nvmrc` 22 (tests fail on 25+) | `"node": "22.x"`, so Vercel builds on Node 22. |
| U9 | Known `tailwind.config.ts` typecheck error (admin, pos) and the `mock-db.ts` lint warning | Fix both so CI is green. |
| U10 | Uncommitted `.gitignore` change (`graphify-out/`) | Commit with U4. |
| U11 | Kicker text "Gunita · … Board" left for review | Decide in Project 3. |

## 7. To-do, start to finish

Decisions first (section 8), then:

1. **Housekeeping** (branch `chore/unslop`): U1–U4, U6, U8–U10. Run the full checks on Node 22.
2. **Security code** (branch `fix/hardening`): S3, S8, S9, S10, S6 bumps. S4 moved to step 11
   (see the plan, "Not in this plan").
   Add tests that fail if an array cap or the request-id rule is removed.
3. **Services migration** (branch `chore/single-vercel-project`): `vercel.json`, sections
   4.3.1–4.3.7 and U5/U7, with tests for the basePath redirect and the path helper.
4. **Local checks**: `pnpm typecheck`, `pnpm lint`, vitest in every package on Node 22,
   `next build` ×3, SQL tests, then `vercel dev` to see `/` and `/staff` together.
5. **Production Supabase project** (D2): create, migrate, configure Auth, provision the Owner.
   **Vercel project**: `vercel link` at the repo root (one project). Add env vars per
   environment (4.4) with `vercel env add`, marking secrets Sensitive. Enable Deployment
   Protection for previews. Push the branch and get a preview URL.
6. **Preview test pass**:
   - Owner sign-in with the emailed code.
   - Barista sign-in at `/staff/login`.
   - A checkout.
   - An offline sale that syncs later.
   - Stock-in and stock-out.
   - Reports export.
   - The PWA installs from `/staff`.
   - The API has no public address. `/api/*` and `/staff/api/*` reach it only through the
     site proxies: `/api/setup/owner` and `/api/auth/login` return 404, and data routes
     without a session return 401.
   - Response times measured before and after `sin1`.
7. **Firewall**: `scripts/vercel-firewall.sh` stages the 5.3 rules in `log` mode. Review for a
   day, then switch to enforce. A person runs `vercel firewall publish --yes`.
8. **Design refresh** (Project 3, section 9) on its own branch, reviewed on previews.
9. **Go-live**:
   - Merge to `main` through a PR.
   - Production deploy (`vercel --prod` or the Git integration).
   - Smoke test the step 6 list on production.
   - Record stock-ins with real counts.
   - Rotate the weak Owner password.
10. **Rollback plan**: `vercel rollback` (Instant Rollback) returns all three services at once.
    Database migrations are not rolled back by Vercel. Keep the rollback SQL with each
    migration.
11. **After launch**: nonce-based CSP (S4), the single-RPC auth read (4.5), and Owner passkeys
    (section 10).

Scripts to add (my call):

- `scripts/predeploy-check.sh`: runs typecheck, lint, tests and builds on Node 22, plus
  `pnpm audit --prod`. It stops on the first failure.
- `scripts/vercel-firewall.sh`: the `vercel firewall rules add ... --action log` commands from
  5.3. It never publishes.

## 8. Decisions

- **D1 Vercel plan: not decided.**
  - The plan uses Hobby limits as the baseline: firewall rules 1 and 2 from 5.3. Rule 3 is
    added on Pro.
  - Before go-live, confirm Hobby's non-commercial fair-use terms
    (vercel.com/docs/limits/fair-use-guidelines). A live shop POS is commercial use.
- **D2 Production database: a new, clean Supabase project.**
  - Production env vars point at the new project. Preview and Development keep
    `gunita-kopi-pos-dev`. This also resolves S7: previews never touch real sales.
  - Setting it up adds these to-do items:
    - Create the project in Singapore (`ap-southeast-1`), next to `sin1`.
    - Dry-run, then `db push` all migrations in order. This is also the first full-chain run
      on real Postgres, which the migration audit asked for.
    - Copy the live Auth settings from `CLAUDE.md` ("Live Auth config set 2026-11-20"): sign-ups
      off, 6-digit email OTP for 300 s, `{{ .Token }}` in the Magic Link and Recovery templates,
      Resend SMTP, TOTP off.
    - Provision the one Owner: run `apps/api` locally against the new project, then
      `scripts/provision-owner.mjs` (section 4.3.7), with a strong password.
    - Enter the real menu, recipes, add-ons and opening stock. Demo seeds never run on
      production.
- **D3 Domain: `<project>.vercel.app` for now.**
  - Admin at `/`, POS at `/staff`. Vercel already sends HSTS on `vercel.app`; the header in 4.2
    matters once a custom domain is added.
  - Host-based origin separation (4.6) waits for a domain.
- **D4 Barista "Add ingredient" (migrations `0900`, `1000`): YES (user, 2026-11-24, reversing
  the earlier "Owner-only" answer).**
  - Production gets both migrations with the full chain.
  - `gunita-kopi-pos-dev` needs them applied, after a dry run and with approval, so previews
    match.
  - No code is removed. The bullets below are superseded.
- ~~Owner-only~~ (superseded):
  - My call: keep both files, because local databases already ran them. Add a new migration
    after `20261120001200` that drops `create_barista_ingredient` and the supplier-options
    function. This follows the repo rule that applied migrations are never edited. Every
    environment, including the new production project, ends with no Barista path.
  - Code to remove:
    - The Barista branch of `createIngredient` (`apps/api/src/modules/ingredients/service.ts`
      ~l.121). Barista `POST /api/ingredients` returns 403 again.
    - `GET /api/ingredients/suppliers`.
    - The POS inventory "Add ingredient" dialog and its calls in
      `apps/pos/src/features/inventory/api.ts`.
    - The matching tests and `db-types` entries.
  - Barista stock-in and stock-out stay as they are.

## 9. Project 3: design refresh (to brainstorm next)

Approved by the user on 2026-11-24 as the design owner. It replaces the 2026-11-21 Figma
freeze as the baseline once done. It gets its own brainstorm with mockups and the
`frontend-design` guidance before any screen changes.

Constraints recorded now:

- Consistent styling across Admin and POS.
- Not templated or "slop".
- Follow the user's 19 UX and motion principles: exaggeration, origin awareness, staggering,
  squash and stretch, rubber banding, Doherty threshold, anticipation, Fitts's law,
  slow in/slow out, Hick's law, follow-through, arcs, Von Restorff effect, timing,
  interruptible motion, secondary action, solid drawing, frequency of use, peak-end rule.
- Respect `prefers-reduced-motion`.
- Check every screen at 1536, 1366, 1180, 1024, 820 and 390 px, plus print.

## 10. Separation of the Owner portal (decided 2026-11-24)

Sources: OWASP Developer Guide (separate applications for administrator and user access; high-value
admin systems on separate hosts), OWASP WSTG (admin paths are guessable, so hiding a URL is not a
control), and Square's POS model (owner dashboard sign-in separate from staff passcodes on the device).

- **Layout:** Admin and POS stay separate apps with separate sign-ins, in one deployment.
  - `/admin/...` is the Owner portal (`/admin/login`, then the emailed code).
  - `/staff/...` is the POS (`/staff/login`).
  - `/` and `/pos` redirect to `/staff/pos`; any other path goes to the POS service.
  - The API has no public route.
- **Cookies:** each site's session cookie is scoped to its prefix (`/admin`, `/staff`), so a request to
  one side never carries the other side's session. The Owner's emailed-code challenge cookie is
  scoped to `/admin/auth`.
- **Only the Owner:** one Owner row (`users_single_owner`); password plus emailed code (the session is
  approved only after the code); role checked in the page guard, the API and RLS; a Barista session
  on `/admin` sees `/admin/restricted`.
- **Firewall (free, Hobby):** sign-in rate limit, probe block, and "Owner portal: Philippines only"
  (path starts with `/admin` and country is not PH). It is staged in log mode first.
- **Next feature (Owner passkeys):** password, then a passkey on an enrolled device (WebAuthn via
  SimpleWebAuthn; Supabase passkeys are still experimental). The emailed code is kept for recovery
  and for enrolling a new device. Design and plan come first.
- **Not covered by the app:** anyone with the Owner's password *and* email inbox, and anyone with
  Supabase, Vercel or GitHub admin access. Turn on 2-step verification for those accounts.
- **A separate host for the Owner portal** needs a bought domain (`admin.<domain>` on the same
  deployment). Nested `*.vercel.app` names fail HTTPS (the certificate is `*.vercel.app`, one level only).
