# One app instead of three: design

Date: 2026-11-24. Branch: `chore/clean-structure`. Status: built (this branch).

## Why

The repo was three Next.js apps (Admin, POS, API) and six workspace packages. That meant three
`node_modules` trees, a proxy hop from each site to the API, and Vercel Services (beta) to ship them
as one deployment. The user asked for the usual structure: one app, one `src/`, modules shown by
role.

## Approaches

| | A. Merge the apps only | B. Full flatten (chosen) |
|---|---|---|
| Result | One app in `apps/web`, packages kept | One project at the repo root, everything in `src/` |
| `package.json` / `node_modules` | Several | One |
| Vercel Services, extra hop | Removed | Removed |

B was chosen because one `node_modules` was part of the request.

## Decisions

- **Two areas, kept separate** (OWASP: separate admin and user access):
  - Owner portal `src/app/(owner)/admin` at `/admin`; Barista POS `src/app/(staff)/staff` at `/staff`.
  - Each has its own root layout, sign-in page, session cookie (scoped to its prefix) and allowed role.
  - One middleware picks the guard by prefix.
  - Sign-in redirects stay inside their area.
- **Private backend:**
  - `src/server/routes` keeps the former API route handlers, unchanged.
  - They are not public URLs. `src/server/dispatch.ts` calls them in process for the `/admin/api`
    and `/staff/api` proxies, so the tests and handlers stayed as they were.
  - Public: only `/api/health`, `/api/setup/owner` (setup token) and `/api/mock/rpc` (demo; refused
    in production).
- **Shared code:** `src/{contracts,auth,ui,mocks,db-types}` replace the packages; imports use `@/...`.
- **POS offline:** the service worker is built to `/staff/sw.js`, scope `/staff/`. The staff layout
  registers it, so Owner pages are never controlled or cached by it.
- **No Next `basePath`:**
  - Route paths carry their prefix explicitly.
  - `src/{owner,staff}/lib/base-path.ts` still prefixes API calls and POS assets.
- **Tooling:**
  - One `vitest.config.ts` with a project per area.
  - Turborepo and workspaces removed.
  - `vercel.json` only pins `sin1`; redirects and headers live in `next.config.ts`.
- **Kept on purpose:**
  - The session handlers' `INTERNAL_PROXY_SECRET` check on the in-process sign-in route.
  - The two `base-path.ts` helpers.
- **Removed:**
  - The old static prototypes (`owner.html`, `barista.html`, `*.js`).
  - The API root status page.
  - The API CORS middleware test.
  - `resolveApiUrl` / `API_URL`.

## Verification

- Typecheck, lint and all test projects pass.
- The production build passes.
- Edge checks in demo mode on both areas: pages, six widths, console.
- Edge checks in production:
  - routes and redirects;
  - the private backend returns 404;
  - the security headers are present;
  - icons load signed out;
  - the service worker scope is `/staff/` only.
- Screenshots match the earlier screens.
