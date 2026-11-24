# One Vercel Deployment and Hardening: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship Admin, POS and API as one Vercel project with a private API, close the injection and abuse gaps, and clean up stale config and docs.

**Architecture:** Admin stays at `/`. POS moves under Next `basePath: "/staff"`. `apps/api` becomes a private Vercel Service that only the two sites reach, through a binding injected as `API_URL`. Security fixes are small and local: input caps, a request-id rule, a generic 403, LIKE escaping, and Owner-only ingredient creation.

**Tech Stack:** pnpm 12.21.0 + Turborepo, Next.js 15.5, React 19, zod 3, Supabase (Postgres + Auth), Vitest, Vercel Services (beta).

**Spec:** `docs/superpowers/specs/2026-11-24-one-vercel-deploy-and-hardening-design.md`

## Global Constraints

- Node 22 for every test and build. Use `npx -y node@22 ...` when the default Node is newer.
- Prefix pnpm with `npx -y pnpm@12.21.0` when there is no global pnpm.
- Commits use Conventional Commits `<type>(<scope>): <description>`. No `Co-Authored-By` trailers. Commit only after the user approves each part; never push, deploy or touch live or production databases without explicit approval.
- New migration timestamps must be higher than `20261120001200`. Applied migrations are never edited.
- New SQL functions: `SECURITY INVOKER`, `set search_path = ''`, schema-qualified names, `revoke execute ... from public, anon, authenticated` then explicit grants.
- The service-role key is referenced only under `apps/api` (the CI check in `.github/workflows/ci.yml` must stay green).
- Never touch or commit `my-skills/`. Never commit `.env*` except `.env.example`.
- After `pnpm typecheck` or `pnpm build`, restore unintended changes to tracked generated files with `git checkout --` until Task A1 removes them.
- Visual changes are limited to what this plan names. The design refresh is a separate spec.

## Review Focus

1. **Installed POS PWA after the move to `/staff`.** A barista's tablet that installed the PWA at `/pos` should land on `/staff/login`, not a 404 page. Test in Task C3: `/pos` redirects to `/staff/pos`.
2. **Offline queue during the upgrade.** Orders queued in Dexie before the deploy must still sync afterwards. The sync URL changes to `/staff/api/sync`, and the queue stores data, not URLs. Test in Task C3: the sync client posts to `/staff/api/sync`.
3. **A missing `API_URL` in production** should give a logged 503 on sign-in, not a silent call to localhost. Test in Task C1.
4. **A Barista adding an ingredient on production** works, because migrations `0900` and `1000` are part of the production chain. Check this in the D4 preview pass.
5. **An expired session on a POS page** should redirect to `/staff/login?redirect=...`, never the Owner's `/login`. Test in Task C2.

---

## Part A: Clean-up (branch `chore/unslop`)

### Task A1: Repo hygiene

**Files:**
- Modify: `.gitignore` (already has the uncommitted `graphify-out/` line)
- Modify: `package.json` (`engines`)
- Modify: `apps/api/src/lib/mock-db.ts:25`
- Untrack: 8 `tsconfig.tsbuildinfo` files, `apps/pos/public/sw.js`

- [ ] **Step 1:** Add `*.tsbuildinfo` and `apps/pos/public/sw.js` to `.gitignore`.
- [ ] **Step 2:** Run `git rm --cached $(git ls-files '*.tsbuildinfo') apps/pos/public/sw.js`. Expected: 9 files staged as deleted, still present on disk.
- [ ] **Step 3:** Set `"engines": { "node": "22.x", "pnpm": ">=9.0.0" }` in the root `package.json`.
- [ ] **Step 4:** Remove the unused `eslint-disable` directive at `apps/api/src/lib/mock-db.ts:25`.
- [ ] **Step 5:** Run `npx -y pnpm@12.21.0 lint && npx -y pnpm@12.21.0 typecheck`. Expected: 0 errors, 0 warnings. Admin typecheck already passed on 2026-11-24.
- [ ] **Step 6:** Run `git status --short`. Expected: no `tsbuildinfo` or `sw.js` modifications after typecheck.
- [ ] **Step 7: Commit:** `chore(config): stop tracking generated files and pin Node 22`

### Task A2: Make CLAUDE.md current

**Files:**
- Modify: `CLAUDE.md`
- Create: `docs/history/2026-11-session-notes.md`

- [ ] **Step 1:** Move these sections of `CLAUDE.md` verbatim into `docs/history/2026-11-session-notes.md`, under a one-line header saying they are dated history: "Integration status", "Handoff Notes — Next Phase", "Current Project Status and Testing Handover Summary", and both "Session summary" sections.
- [ ] **Step 2:** In their place, add a short "Current state (2026-11-24)" list to `CLAUDE.md`, one line each:
  - The live dev project `gunita-kopi-pos-dev` and its latest applied migration `20261120001200`.
  - Production will be a new Supabase project.
  - Deployment is one Vercel project (link to the spec).
  - Pending decisions: spec section 8.
  - Out of scope: FR-40.
- [ ] **Step 3:** Fix the contradictions the spec lists in U3:
  - The Owner's second step is an emailed 6-digit code, not TOTP.
  - `20261120000000` is applied on live.
- [ ] **Step 4:** Update `README.md` and `docs/architecture/README.md` to describe the cookie + same-origin proxy flow from `CLAUDE.md` "Request and session flow", replacing "browser sends Bearer token".
- [ ] **Step 5:** Run `npx prettier --check CLAUDE.md README.md docs/architecture/README.md docs/history`. Expected: pass.
- [ ] **Step 6: Commit:** `docs: keep CLAUDE.md to current rules, move session history to docs/history`

---

## Part B: Hardening (branch `fix/hardening`)

### Task B1: Cap request sizes

**Files:**
- Modify: `packages/contracts/src/orders.ts` (`CreateOrderRequestSchema.items`, `.notes`; `OrderListQuerySchema` status list)
- Modify: `packages/contracts/src/ingredients.ts` (`IngredientListQuerySchema.stockStatus` list)
- Modify: `packages/contracts/src/sync.ts` (orders array, if it has no `.max`)
- Test: `packages/contracts/tests/request-caps.test.ts`

**Interfaces:**
- Produces: `MAX_ORDER_ITEMS = 100`, `MAX_SYNC_ORDERS = 100`, `MAX_NOTES_LENGTH = 500`, `MAX_STATUS_FILTERS = 10`, exported from `packages/contracts/src/common.ts`.

- [ ] **Step 1: Write the failing tests**

```ts
// Why: zod 3.25.76 has a high advisory (memory exhaustion on oversized collections). Caps keep
// one request from tying up a function. 100 is far above a real café order.
it("rejects an order with more than 100 items", () => {
  const item = validOrder.items[0];
  expect(CreateOrderRequestSchema.safeParse({ ...validOrder, items: Array(101).fill(item) }).success).toBe(false);
  expect(CreateOrderRequestSchema.safeParse({ ...validOrder, items: Array(100).fill(item) }).success).toBe(true);
});
it("rejects notes over 500 characters", () => { /* "x".repeat(501) fails, 500 passes */ });
it("rejects a sync batch over 100 orders", () => { /* 101 fails, 100 passes */ });
it("rejects more than 10 status filters", () => {
  expect(OrderListQuerySchema.safeParse({ status: Array(11).fill("pending").join(",") }).success).toBe(false);
});
```

- [ ] **Step 2:** Run `npx -y node@22 ../../node_modules/vitest/vitest.mjs run tests/request-caps.test.ts` from `packages/contracts`. Expected: FAIL.
- [ ] **Step 3:** Add the constants and `.max(...)` calls. List filters use `.pipe(z.array(...).min(1).max(MAX_STATUS_FILTERS))`.
- [ ] **Step 4:** Run the whole contracts suite plus the api and pos suites, since they share these schemas. Expected: PASS.
- [ ] **Step 5: Commit:** `fix(contracts): cap request array and text sizes`

### Task B2: Safe request ids and a generic 403

**Files:**
- Create: `apps/api/src/lib/request-id.ts`
- Modify: `apps/api/src/middleware.ts`, `apps/api/src/lib/auth.ts` (`requireRole`)
- Test: `apps/api/tests/request-id.test.ts`, `apps/api/tests/auth.test.ts`

**Interfaces:**
- Produces: `requestIdFrom(header: string | null): string`. Returns the header when it matches `/^[A-Za-z0-9_-]{1,64}$/`, otherwise `req_<timestamp>_<random>`.

- [ ] **Step 1: Write the failing tests**
  - `requestIdFrom("abc-123")` returns `"abc-123"`.
  - `requestIdFrom("x".repeat(65))`, `requestIdFrom("a\nb")` and `requestIdFrom(null)` match `/^req_\d+_[a-z0-9]+$/`.
  - In `auth.test.ts`: a Barista token on an Owner-only route returns 403. The body's `error.message` does not contain `"owner_admin"` or `"barista"`.
- [ ] **Step 2:** Run `npx -y node@22 ../../node_modules/vitest/vitest.mjs run tests/request-id.test.ts tests/auth.test.ts` from `apps/api`. Expected: FAIL.
- [ ] **Step 3:** Implement `requestIdFrom` and use it in `middleware.ts`.
- [ ] **Step 4:** Change the `requireRole` message to `"You do not have access to this resource"`. Keep the role detail in a server log line `auth.role_denied` with `role` and `required`.
- [ ] **Step 5:** Run the api suite. Expected: PASS. Update any existing assertion that matched the old message.
- [ ] **Step 6: Commit:** `fix(api): validate request ids and stop listing roles in 403 messages`

### Task B3: Escape LIKE wildcards in search

**Files:**
- Modify: `apps/api/src/lib/request.ts`
- Modify: `apps/api/src/modules/{ingredients,products,suppliers}/service.ts` (the three `.ilike(...)` lines)
- Test: `apps/api/tests/request-id.test.ts` (rename the file to `request-helpers.test.ts`, which holds both)

**Interfaces:**
- Produces: `escapeLike(s: string): string`. Prefixes `\`, `%` and `_` with `\`.

- [ ] **Step 1: Write the failing test.** `escapeLike("50%_off\\")` equals `"50\\%\\_off\\\\"`. Also assert that a mocked products search for `"%"` calls `ilike("product_name", "%\\%%")`.
- [ ] **Step 2:** Run it. Expected: FAIL.
- [ ] **Step 3:** Implement `escapeLike` and use it in the three services: `` `%${escapeLike(q.search)}%` ``.
- [ ] **Step 4:** Run the api suite. Expected: PASS.
- [ ] **Step 5: Commit:** `fix(api): treat % and _ in search as plain text`

### Task B4: (removed)

Baristas may add ingredients (user, 2026-11-24). Migrations `0900` and `1000` ship to production with the full chain; no code changes.

### Task B5: Patch dependency advisories

**Files:**
- Modify: root `package.json` (`pnpm.overrides`), `pnpm-lock.yaml`

- [ ] **Step 1:** Add `"pnpm": { "overrides": { "postcss@<8.5.23": "^8.5.23" } }` and run `npx -y pnpm@12.21.0 install`.
- [ ] **Step 2:** Run `npx -y pnpm@12.21.0 update @serwist/next --filter @gunita/pos --latest`.
- [ ] **Step 3:** Run `npx -y pnpm@12.21.0 audit --prod`. Expected: no postcss rows.
  - If glob or minimatch rows remain, do **not** force major overrides. They are build-time only (spec S6). Record them in the PR description.
  - The zod advisory remains until the zod 4 upgrade (after launch). Task B1 is its mitigation.
- [ ] **Step 4:** On Node 22, run `next build` for pos, admin and api, plus the pos vitest suite. Expected: all pass. The POS service worker still builds.
- [ ] **Step 5: Commit:** `chore(deps): patch postcss and serwist advisories`

---

## Part C: One Vercel project (branch `chore/single-vercel-project`)

### Task C1: API URL comes only from `API_URL`, and fails loudly

**Files:**
- Modify: `packages/auth/src/session-server.ts` (`login`, `otpApi`, `proxy`)
- Modify: `apps/{admin,pos}/src/lib/session-handlers.ts`, `apps/{admin,pos}/src/lib/env.ts`
- Modify: `apps/{admin,pos,api}/next.config.ts` (required env lists)
- Test: `packages/auth/tests/session.test.ts`

**Interfaces:**
- Produces: `resolveApiUrl(env: NodeJS.ProcessEnv): string`, exported from `@gunita/auth/session-server`.
  - Returns `env.API_URL` when set.
  - Otherwise returns `""` in production, or `env.NEXT_PUBLIC_API_URL || "http://localhost:3002"` outside production.

- [ ] **Step 1: Write the failing tests**
  - `resolveApiUrl({ NODE_ENV: "production" })` returns `""`.
  - `resolveApiUrl({ NODE_ENV: "production", API_URL: "https://x" })` returns `"https://x"`.
  - `resolveApiUrl({ NODE_ENV: "development" })` returns `"http://localhost:3002"`.
  - `createSessionHandlers({ ...opts, apiUrl: "" })`:
    - `login` returns 503 `SERVICE_UNAVAILABLE` and logs `auth.api_url_missing`.
    - `proxy` returns 502 `BAD_GATEWAY` and logs the same line.
    - No `fetch` is called.
- [ ] **Step 2:** Run `npx -y node@22 ../../node_modules/vitest/vitest.mjs run tests/session.test.ts` from `packages/auth`. Expected: FAIL.
- [ ] **Step 3:** Implement `resolveApiUrl`, plus an empty-`apiUrl` guard at the top of `signInThroughApi`, `otpApi` and `proxy`.
  - Both `session-handlers.ts` use `apiUrl: resolveApiUrl(process.env)`.
  - Do not throw at module load: bindings exist only at runtime, and `next build` imports these modules.
- [ ] **Step 4:** Remove `NEXT_PUBLIC_API_URL` from `validate*Env` and from the admin and pos `next.config.ts` lists. Remove `ALLOWED_ORIGINS` from the api list.
  - Keep `env.apiUrl` for `lib/mock-db.ts` only (demo mode). Rename the field to `mockApiUrl` so it can't be reused by mistake.
- [ ] **Step 5:** Run the auth, admin and pos suites. Expected: PASS.
- [ ] **Step 6: Commit:** `fix(auth): read the API address only from API_URL and fail loudly without it`

### Task C2: The auth package respects basePath and cookie path

**Files:**
- Modify: `packages/auth/src/cookies.ts` (`sessionCookieOptions(name, path = "/")`)
- Modify: `packages/auth/src/middleware.ts` (`cookiePath?: string` option; the redirect and rewrite URLs)
- Modify: `packages/auth/src/session-server.ts` (`cookiePath?: string` option passed to `sessionCookieOptions`)
- Modify: `apps/pos/src/middleware.ts` (mock branch redirect and rewrite)
- Test: `packages/auth/tests/session.test.ts`, `apps/pos/tests/middleware.test.ts`

**Interfaces:**
- Consumes: nothing from C1.
- Produces: an optional `cookiePath` on `AuthMiddlewareOptions` and `SessionHandlerOptions`.

- [ ] **Step 1: Write the failing tests**

```ts
// Why: under basePath /staff, a POS redirect to "/login" would land on the Owner sign-in page.
const req = new NextRequest("http://localhost/staff/orders", { nextConfig: { basePath: "/staff" } });
const res = await guard(req); // no session cookie
expect(res.headers.get("location")).toBe("http://localhost/staff/login?redirect=%2Forders");
```

  - Same check for the wrong-role rewrite target: `/staff/restricted`.
  - Same check for the POS mock branch.
  - `login` with `cookiePath: "/staff"` sets a session cookie whose `Path` is `/staff`.
- [ ] **Step 2:** Run the two test files. Expected: FAIL.
- [ ] **Step 3:** Build the URLs with `const url = request.nextUrl.clone(); url.pathname = "/login"; url.search = "";`, then set the query param. Pass `cookiePath` through to `sessionCookieOptions`.
- [ ] **Step 4:** Run the auth, admin and pos suites. Expected: PASS. Admin behaviour is unchanged because it has no basePath and the cookie path stays `/`.
- [ ] **Step 5: Commit:** `fix(auth): keep basePath in redirects and allow a per-site cookie path`

### Task C3: Move POS under `/staff`

**Files:**
- Create: `apps/pos/src/lib/base-path.ts`
- Modify: `apps/pos/next.config.ts` (`basePath: BASE_PATH`, plus `redirects()` from `/pos` to `/staff/pos` with `basePath: false`)
- Modify: `apps/pos/src/lib/api-client.ts` (the `apiClient` URL), `apps/pos/src/app/manifest.ts`, `apps/pos/src/features/pos/components/MenuItemTile.tsx` (icon `src`)
- Modify: `apps/pos/src/lib/session-handlers.ts`, `apps/pos/src/middleware.ts` (`cookiePath: BASE_PATH`)
- Test: `apps/pos/tests/base-path.test.ts`, and update existing POS tests that assert `"/api/..."` or `"/auth/..."` URLs

**Interfaces:**
- Consumes: `cookiePath` from Task C2.
- Produces: `BASE_PATH = "/staff"` and `withBasePath(path: string): string`.
  - Prefixes absolute paths once (`"/api/x"` becomes `"/staff/api/x"`).
  - Leaves already-prefixed paths and full URLs unchanged.

- [ ] **Step 1: Write the failing tests**
  - `withBasePath("/api/orders")` equals `"/staff/api/orders"`.
  - `withBasePath("/staff/api/orders")` is unchanged.
  - `withBasePath("https://x/y")` is unchanged.
  - `apiClient("/api/sync", …)` calls `fetch("/staff/api/sync", …)` (Review Focus 2).
  - `manifest()` has `start_url: "/staff/pos"`, `scope: "/staff/"` and icon `src` values starting with `/staff/icons/`.
  - The `next.config` `redirects()` include `{ source: "/pos", destination: "/staff/pos", basePath: false, permanent: false }` (Review Focus 1).
- [ ] **Step 2:** Run the POS suite. Expected: the new tests FAIL.
- [ ] **Step 3:** Implement. Use `withBasePath` in `apiClient`, the manifest and the icons. Leave `lib/mock-db.ts` alone: demo mode calls the API host directly.
- [ ] **Step 4:** Run the POS suite. Update URL assertions in existing tests to `/staff/...`. Expected: all PASS.
- [ ] **Step 5:** On Node 22, run `next build` in `apps/pos`. Expected: the build passes, and `public/sw.js` is generated.
- [ ] **Step 6: Manual check** (only if the user is running `pnpm dev`; do not start a second dev server):
  - Open `http://localhost:3001/staff/login` and sign in as `testbarista`.
  - DevTools, Application tab: the service worker scope is `/staff/`.
  - A sale completes.
  - If the scope shows `/`, set `scope: BASE_PATH` and `swUrl: \`${BASE_PATH}/sw.js\`` in `withSerwistInit` and rebuild.
- [ ] **Step 7: Commit:** `feat(pos): serve the POS under /staff`

### Task C4: The API stops speaking CORS

**Files:**
- Modify: `apps/api/src/middleware.ts` (request id only, with no CORS headers and no OPTIONS branch)
- Keep: `apps/api/src/lib/cors.ts`, used only by `app/api/mock/rpc/route.ts` (dev demo mode, refused in production)
- Test: `apps/api/tests/request-helpers.test.ts`

- [ ] **Step 1: Write the failing test.** `middleware(new NextRequest("http://x/api/health", { headers: { origin: "https://evil.example" } }))` has no `access-control-allow-origin` header, and `x-request-id` is set.
- [ ] **Step 2:** Run it. Expected: FAIL.
- [ ] **Step 3:** Implement. Update the `cors.ts` header comment to say "demo mode only".
- [ ] **Step 4:** Run the api suite, including `mock-rpc.test.ts`. Expected: PASS.
- [ ] **Step 5: Commit:** `refactor(api): drop CORS now that browsers never call the API directly`

### Task C5: `vercel.json`, deploy scripts and the deployment doc

**Files:**
- Create: `vercel.json` (copy spec section 4.2 exactly)
- Create: `scripts/predeploy-check.sh`, `scripts/vercel-firewall.sh`
- Modify: `docs/deployment.md` (full rewrite), `CLAUDE.md` (local POS link becomes `http://localhost:3001/staff`), `scripts/setup-local.sh` (printed POS link)

- [ ] **Step 1: `scripts/predeploy-check.sh`** (bash, `set -euo pipefail`). It runs, in order, on Node 22:
  1. `pnpm install --frozen-lockfile`
  2. `pnpm lint`
  3. `pnpm typecheck`
  4. `pnpm test`
  5. `pnpm build`
  6. `pnpm audit --prod --audit-level high`

  It exits on the first failure and prints which step failed. Afterwards it restores `apps/pos/public/sw.js` if git still tracks it.
- [ ] **Step 2: `scripts/vercel-firewall.sh`.** It stages the spec 5.3 rules with `--action log`:
  - `Sign-in rate limit`: a `rate_limit` rule (window 60, 20 requests, key `ip`, `--rate-limit-action log`). Its conditions are path prefix `/auth/` OR `/staff/auth/`, AND method `POST`.
  - `Probe block`: path in `/wp-admin`, `/wp-login.php`, `/.env`, `/.git`, `/phpmyadmin`, OR path suffix `.php`.
  - `API rate limit`: added only when the first argument is `pro`.

  It ends with `vercel firewall diff`. It never runs `publish`, and prints that a person must.
- [ ] **Step 3: `docs/deployment.md`.** Rewrite it from spec sections 4 and 7:
  - The one-project setup and the env-var table (4.4).
  - Preview env points at `gunita-kopi-pos-dev`, Production at the new project.
  - Deployment Protection is on for previews.
  - The staged firewall rollout.
  - Rollback with `vercel rollback`.
  - Owner provisioning for a new database (spec 4.3.7).
- [ ] **Step 4:** Run `bash -n scripts/predeploy-check.sh scripts/vercel-firewall.sh`. Expected: no syntax errors. Run `node -e "JSON.parse(require('fs').readFileSync('vercel.json','utf8'))"`. Expected: no error.
- [ ] **Step 5:** Run `bash scripts/predeploy-check.sh`. Expected: it ends with all steps passing.
- [ ] **Step 6: Commit:** `chore(ci): one Vercel project with services, deploy checks and firewall staging`

---

## Part D: Production rollout (each step needs the user's explicit approval at the time)

Run, don't code. The commands are in `docs/deployment.md` after Task C5. Mark each step done only with evidence.

- [ ] **D1.** Create the production Supabase project in `ap-southeast-1`. Dry-run, then push all migrations, including `0900` and `1000`. Apply the Auth settings (spec D2). Provision the Owner with a strong password.
- [ ] **D2.** Apply `0900` and `1000` to `gunita-kopi-pos-dev` after a dry run that lists only them.
- [ ] **D3.** `vercel link` at the repo root. Add env vars per environment with `vercel env add`, with secrets marked Sensitive. Enable Deployment Protection for previews.
- [ ] **D4.** Push the branch and open the preview. Run the spec section 7 step 6 checklist and record the results in the PR.
  - If Services fails (install from the service root, `regions`, rewrites), stop and report. The fallback is spec option C.
- [ ] **D5.** Run `bash scripts/vercel-firewall.sh [pro]`. After a day of dashboard review, the user publishes and enforces the rules.
- [ ] **D6.** Merge to `main` through a PR. Production deploy, then a smoke test. Enter real menu data and opening stock.

## Not in this plan

- **The design refresh** (spec section 9). It gets its own brainstorm, spec and plan next.
- **Nonce-based CSP (spec S4) moves to after launch.** This deviates from spec step 7.2: report-only adds no protection before launch, and a nonce CSP needs request-header plumbing in `createAuthMiddleware`.
- **The shared env-check helper (spec U6) is dropped.** `next.config.ts` cannot reliably import TypeScript from a workspace package, so each config keeps its own short list, updated in Task C1.
- **Later items:** the single-RPC auth read and Owner passkeys (spec section 10). Option B (one app) was rejected per OWASP; the zod 4 upgrade is done.
