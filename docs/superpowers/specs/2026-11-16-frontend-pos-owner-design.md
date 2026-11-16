# Frontend for Barista POS and Owner Admin — Design

Date: 2026-11-16 · Status: draft for approval

## 1. Intent

Turn the vanilla-JS prototype into the real frontends of the two Next.js apps already scaffolded in the monorepo:

| App | Folder | Role | Prototype source |
|---|---|---|---|
| Owner / Admin | `apps/admin` (port 3000) | `owner_admin` | `apps/admin/owner.html`, `app.js`, `admin.js`, `store.js` |
| Barista POS | `apps/pos` (port 3001) | `barista` | `apps/pos/barista.html`, `app.js`, `pos.js`, `store.js` |

Shared look: `packages/ui/css/styles.css` (dark green / coffee "nature" theme).

**Why:** the prototype defines the screens, UX and business rules the team agreed on; the Next.js apps today are light-themed placeholders with hard-coded sample rows. The team needs working, clickable frontends that follow the project's architecture now, while the backend (`apps/api`, every route currently returns 501 Not Implemented) is built separately.

Authoritative specs for screen behavior: `docs/architecture/OWNER_ADMIN_GUIDELINE.md` and `docs/architecture/BARISTA_POS_GUIDELINE.md`. This document says how we build them in *this* repo, and where it deviates from those guidelines.

## 2. Goals, non-goals, anti-goals

**Goals**
- Every screen in Owner guideline §8 and Barista guideline §8 exists, works, and matches the prototype's look and behavior.
- Screens run today on mock data (seeded from the prototype) and switch to the real API per feature with a one-line change.
- Business rules are pure functions with unit tests.
- Follows the existing folder structure (§6).

**Non-goals (this round)**
- Implementing `apps/api` or Supabase schema/migrations.
- Real Supabase login, MFA (TOTP), audit-log writes.
- PWA install prompt polish, Playwright E2E tests.
- Product image upload to Supabase Storage (mock keeps images as data URLs / none).

**Anti-goals (fails even if it "works")**
- Looks like the old light grey/emerald UI, or drifts from `styles.css`.
- Components call Supabase or `fetch` directly instead of going through the feature's data module.
- Mock code leaks into the real-API path (e.g. mock login accepted when mocks are off).
- Barista app exposes owner-only things (costing, margins, suppliers, users, ingredient edit/delete).
- A sale is shown as "synced" before the (mock) server confirms it.

## 3. Constraints

- Monorepo: pnpm + Turborepo; Next.js 15 App Router; React 19 in apps; TypeScript strict.
- Repo decisions win over the guidelines where they conflict (the user asked to keep the repo's structure):
  - Dexie (ADR 0002), not `idb`, for the POS offline store.
  - `src/features/<feature>/` structure, not the guideline's `src/components/<area>/`.
  - Data goes through `apps/api` via each app's `src/lib/api-client.ts` (README golden rule: frontends never touch the DB).
- Role names `owner_admin` / `barista` (`packages/contracts/src/roles.ts`); order status/type values follow `packages/contracts` (lowercase enums), displayed with the prototype's capitalized labels.
- Currency `₱1,234.50` (`en-PH`), dates `Nov 3, 2026 2:22 PM`.
- Works 360px–1600px; touch targets ≥ 44px on POS; keyboard accessible; `prefers-reduced-motion` respected.

## 4. Approaches considered (data source while the API is unimplemented)

| | Approach | Trade-off |
|---|---|---|
| **A (chosen)** | Mock data behind the same data functions the real API will use, toggled by `NEXT_PUBLIC_USE_MOCKS` | Clickable now with realistic data; extra mock code to maintain until the API lands |
| B | Wire straight to `apps/api` | No throwaway code, but every screen is empty/error until the backend exists |
| C | Build the API too | Real data from day one; roughly doubles scope and pulls in DB work |

The user chose **A**.

## 5. Look and design system (decided)

- `packages/ui/css/styles.css` is the **single source of styling** for both apps. Each app's root layout imports it (plus Tailwind for small layout utilities) and loads the fonts Lora, Raleway, Fira Code, Noto Sans Tagalog via `next/font/google`.
- The components in `packages/ui/src` are **rewritten to render the prototype's markup and class names** (`.sidebar`, `.bottomnav`, `.btn`, `.chip`, `.card`, `.modal`, `.toast-region`, `.kicker`, `.num`, etc.). Public component names stay where they exist (`Button`, `AppShell`, `StatusBadge`, `StatCard`, `Dialog`, `DataTable`, `Tabs`, `Input`, `Select`) so pages importing them keep working; new ones are added: `Chip`, `ConfirmDialog` (promise-style), `Toast`/`useToast`, `PageHeader` (Baybayin kicker ᜄᜓᜈᜒᜆ + Latin caption + title + actions), `BarChart`, `HBarChart`, `EmptyState`, `Skeleton`, `Banner`, `Seg`, `Icon` (the prototype's SVG icon set ported as a component).
- Owner app sets `owner-mode` on `<body>` (smaller headings, wide layout). POS uses default sizes.
- Sidebar collapse state is remembered per device (localStorage key, UI preference only).
- `packages/config/tailwind.preset.js` colors are replaced with the `styles.css` tokens (`bg`, `surface`, `card`, `moss`, `leaf`, `coffee`, `warn`, `danger`, …) and ADR 0007 is updated to describe the dark theme.
- Where the prototype has a CSS rule, use it; don't restyle with Tailwind classes. If a new screen needs a style the stylesheet lacks, add it to `styles.css` in the same style.

## 6. Folder structure (decided: follow the repo)

```
packages/
  ui/src/                     # shared components (rewritten, see §5); css/styles.css
  contracts/src/              # zod schemas + types (extended, see §8)
  contracts/src/rules/        # NEW: pure business-rule functions + Vitest tests
  mocks/                      # NEW workspace package @gunita/mocks: seed data + in-memory mock store
apps/admin/src/
  app/(auth)/login/
  app/(app)/layout.tsx        # shell + owner guard + idle logout + toast/modal roots
  app/(app)/dashboard/ orders/ orders/[orderId]/ products/ products/new/ products/[id]/edit/
            products/[id]/recipe/ inventory/ inventory/stock/ inventory/history/
            suppliers/ reports/daily|monthly|best|stock/ users/ users/new/ users/[id]/edit/
  features/<feature>/
    api.ts                    # real calls via lib/api-client.ts
    mock.ts                   # same signatures, backed by @gunita/mocks
    index.ts                  # exports api or mock based on NEXT_PUBLIC_USE_MOCKS
    hooks/                    # React hooks the screens use
    components/               # screen pieces
  lib/                        # api-client, env, format (currency/date), session
apps/pos/src/
  app/(auth)/login/
  app/(pos)/layout.tsx        # shell + barista guard + OfflineBanner + idle logout + sync
  app/(pos)/pos/ orders/ orders/[orderId]/ inventory/ inventory/stock/ inventory/history/
  features/{auth,pos,orders,inventory}/  (same api/mock/index/hooks/components pattern)
  features/pos/cart.store.ts  # Zustand cart
  offline/                    # existing Dexie db/outbox/sync/triggers, extended
```

The existing `(app)` / `(pos)` route groups are kept (the guideline's `(admin)` name is not adopted). `/costing` redirects to `/products` recipe tab. Feature READMEs are updated to describe what's actually in each folder.

## 7. Data layer (decided: option A)

- Each feature exposes plain async functions (e.g. `listOrders(filters)`, `advanceOrderStatus(id)`, `createStockTransaction(input)`), typed with `@gunita/contracts`. `features/<f>/index.ts` picks `api.ts` or `mock.ts` from `NEXT_PUBLIC_USE_MOCKS`. Swapping a feature to the real API = make `index.ts` export `api.ts`.
- Screens never import `api.ts`/`mock.ts` directly; they use the feature's hooks.
- Server-state hooks: **TanStack Query** (named in both guidelines; new dependency). Mutations invalidate the related query keys.
- `@gunita/mocks` ports the prototype's `store.js` seed (users, suppliers, ingredients, products, recipes, costing, ~seed orders, stock transactions, add-on catalogue, settings) to TypeScript and implements the same operations the prototype store had (place order, set status, cancel with stock restore, stock in/out, recipe save + costing recompute, user activate/deactivate, report aggregations). Mock calls add a small artificial delay so loading states are visible.
- **Mock persistence (my call):** the mock store lives in memory and is mirrored to `localStorage` under one key (`gk-mock-v1`) so data survives reloads during demos; a "Reset demo data" item in the user menu reseeds it. This is demo data, not business data, and is deleted along with the mocks.
- **Known limitation:** admin (`:3000`) and POS (`:3001`) are different origins, so each app has its own mock copy — a sale made in the POS does not appear in the owner dashboard while on mocks. Accepted for this round.
- Every screen has loading, empty and error states (error state reachable by making a mock throw).

## 8. Contracts changes needed

`packages/contracts` is imported by `apps/api` (`modules/*/schema.ts`, `tests/contracts.test.ts`), so the rule is: **add optional fields only; never rename, remove or change the meaning of an existing field or enum value.** `apps/api` typecheck and tests must keep passing. Where an existing field already carries the meaning, reuse it.

- **Order line (`OrderItemSchema`)** — add-ons are **nested** in the drink line, not separate lines: add optional `addons[]` (`ingredientId`, `label`, `quantity`, `price`), `customization`, `specialInstructions`. `unitPrice` stays the base product price; `subtotal` = `(unitPrice + Σ addon price) × quantity` (R8). The DB's "one row per add-on with `is_addon=1`" is a storage detail the API maps to/from; the frontend never sees it.
- **Order (`OrderSchema`)** — reuse existing fields: `orderNumber` **is** the queue number (`YYYYMMDD-A-###`, provisional `OFF-###` offline); `paidAmount`, `changeAmount`, `paymentMethod`, `notes` used as-is. Add optional `cashierName` only. Sync state is **not** in the contract: it lives on the Dexie outbox record (`OutboxOrderRecord.status`, already exists) and is joined in by the POS hooks.
- **Product** — add optional `description`, `isAvailable`, `image` if missing; category uses the four prototype categories. `marginPct`/costing stay in the existing costing types (owner only, see below).
- **Ingredient** — add optional `supplierId`, `unit` (`g | mL | pcs`), `reorderLevel`, `dateUpdated` if missing. `unitCost` stays owner-only.
- **Stock transactions** — keep the existing contract (`stock_in | stock_out | waste | adjustment | order_deduction`, `quantityChange`, `previousStock`, `newStock`, `reason`). The UI maps it: the Stock In/Out form offers **In** (`stock_in`) and **Out** (`stock_out`) only; Stock History shows all types with labels *In, Out, Waste, Adjustment, Sale (Order …)*, "Remaining" = `newStock`, "Remarks" = `reason`. Sale deductions and cancel restores (as `stock_in` with reason `Cancelled <queue no>`) appear as their own rows, like the prototype. Optional `byName` added for display.
- **Users** — keep the existing email-based user/employee contracts and `isActive`; add optional `username` and `fullName`, `dateCreated` if missing. UI shows `isActive` as the *Active / Inactive* chip (no `status` field added).
- Supplier and report row types: add where missing.
- Payment method stays the existing enum; UI offers **Cash only** in v1 (guideline Q9). Order type `online` exists in the enum but is hidden in the UI.

**Owner-only data never reaches the POS (least privilege, Barista guideline §7).** Owner-only fields (unit cost, costing, margins, suppliers, users) live in owner-specific schemas/exports, not on the shared Product/Ingredient types used by the POS. `@gunita/mocks` exposes two entry points: `@gunita/mocks/owner` (full seed) and `@gunita/mocks/pos` (products, recipes, add-ons, ingredient name/unit/stock/reorder level, orders, stock transactions — no costs, suppliers or users). The POS app only imports `@gunita/mocks/pos`, so costing data is never in its bundle, localStorage or Dexie.

Where the guidelines and `docs/database.md` disagree (report view names, stock transaction types), the frontend uses the contracts types and does not depend on DB names; the mismatch is listed in §13.

## 9. Business rules (`packages/contracts/src/rules/`, unit-tested)

| Rule | Function |
|---|---|
| R6 stock status (≤0 Out, ≤reorder Low, else In) | `stockStatus(ingredient)` |
| R2 product orderable (available and every recipe ingredient in stock) | `isOrderable(product, recipe, stock)` |
| Add-on applicability + disabled when stock short | `addonsFor(category, recipe, stock)` |
| R8 line/order totals | `lineTotal(line)`, `orderTotal(lines)` |
| R9 change, reject paid < total | `computeChange(total, paid)` |
| R-B1 plain-line merge | `addLine(cart, product)` |
| R7 costing and margin | `computeCosting(recipe, ingredients, packaging, price)` |
| R10 queue number format / daily reset | `nextQueueNo(lastNo, date, prefix)` |
| R1 status flow; cancel only Pending/Preparing | `nextStatus(s)`, `canCancel(s)` |
| R-U1 at least one active owner | `canDeactivateOrDemote(users, target)` |

Mocks and screens both call these, so the API can reuse them for previews later. Server remains the authority once real.

## 10. Auth in mock mode (decided)

- Login screen: one "Email or username" field + password, show/hide, inline error, loading state, no sign-up. Users have both an **email** (the real Supabase login, guideline Q6) and a **username** (display handle, locked on edit). In mock mode the field accepts either, for the prototype accounts: `owner / owner123` (owner_admin), `barista / barista123` and `barista2 / barista123` (barista); seed users get emails like `owner@gunita.local`. The Users form has both Email and Username fields.
- On success it sets a `gk-mock-session` cookie (role, user id, name). Each app's `middleware.ts` accepts that cookie **only when `NEXT_PUBLIC_USE_MOCKS === "true"`**; otherwise the existing Supabase token path is unchanged.
- Wrong role for the app → the prototype's **Restricted** screen with a sign-out button (owner app: barista is signed out; POS: owner sees Restricted).
- **Idle auto-logout** (5 min): "Still there?" modal with seconds countdown → Stay signed in / Sign out now. POS: if the outbox has unsynced orders, the sign-out shows a warning that they stay on the device and resume after next login.
- The real Supabase login path stays as-is (not completed this round).

## 11. Screens

Behavior per screen is exactly as in the guidelines; prototype (`app.js`, `admin.js`, `pos.js`) is the visual reference.

**Owner (`apps/admin`)** — Owner guideline §8: Login · Dashboard (KPIs, latest-day fallback, top products h-bars, low-stock with Restock link, recent orders) · Orders (list, filters, detail, advance, cancel restores stock, receipt reprint) · Products (list with search/category/availability toggle/margin/edit/delete; form; Recipe & Costing with steppers, packaging ±0.50, live totals) · Inventory (ingredient list Out/Low first, add/edit modal with active suppliers only, delete confirm listing affected products; Stock In/Out; Stock History with filters + CSV) · Suppliers (table, add/edit, activate/deactivate) · Reports (Daily, Monthly, Best Sellers with date range, Stock Status; each CSV export; Completed orders only) · Users (table with "(you)", add/edit, username locked on edit, activate/deactivate with last-owner guard and self guard).

**Barista (`apps/pos`)** — Barista guideline §8: Login · POS (search + category tabs with icons; menu grid with unavailable/out-of-stock states; cart panel on tablet/desktop, slide-up cart with floating "Cart · N · ₱total" button on phones; customize modal with add-ons, quick chips per category, customization + special instructions; payment modal with order type seg, amount paid, live change, R9 error; receipt modal with queue no., Print via print stylesheet, New order, "Pending sync" badge) · Orders (board grouped by order, filters, sync badge, detail with advance/cancel/reprint) · Inventory (read-only list; Stock In/Out; Stock History). Mobile bottom nav: POS · Orders · Stock.

## 12. POS offline behavior in this round

- Cart: Zustand store in memory (`features/pos/cart.store.ts`, new dependency), cleared after a successful save.
- Checkout always writes to the existing Dexie outbox first (`offline/outbox.ts`) with a UUID `clientTxId`, then the sync runner (`offline/sync.ts`) sends it — to the mock in mock mode — and marks it `synced` only after the (mock) server confirms. Failures stay `failed` with a reason and can be resubmitted or cancelled.
- Offline: provisional `OFF-###` queue number, replaced after sync. `OfflineBanner` ("Offline — orders are saved on this device") when `navigator.onLine` is false; topbar shows pending count and a "Sync now" button. Triggers: `online` event, tab visible, manual (existing `offline/triggers.ts`).
- Catalog cache in Dexie (products, recipes, stock snapshot, add-ons) refreshed on login/reconnect, with "Last updated hh:mm".
- Mock mode offers a "Simulate offline" toggle in the user menu so offline flows can be demoed without unplugging.
- Offline status changes/cancels (`pending_actions`) are **out of this round**; those buttons are disabled offline with a tooltip.

## 13. Recorded deviations and open items

| # | Item | Decision here |
|---|---|---|
| D1 | Guideline says `idb`; repo uses Dexie (ADR 0002) | Dexie |
| D2 | Guideline folder `src/components/<area>`; repo uses `src/features/` | `src/features/` |
| D3 | Guideline route group `(admin)`; repo has `(app)` | keep `(app)` |
| D4 | ADR 0007 describes a light theme | update ADR 0007 to the `styles.css` dark theme |
| D5 | Report view names differ between Owner guideline and `docs/database.md` | frontend unaffected; backend team to reconcile |
| D6 | Stock tx types `in/out` (guideline, prototype `IN/OUT`) vs `stock_in/order_deduction/...` (database.md and existing contracts) | keep the existing contract; UI maps to In/Out labels (§8) |
| D7 | Contracts order enums lowercase; prototype labels capitalized | lowercase in data, capitalized in UI |
| D8 | ERD stores add-ons as separate order rows | frontend/contract nest them in the line; API maps (§8) |
| D9 | Guideline `queue_no` column | contract's existing `orderNumber` carries it |
| D10 | Guideline user `status` | existing `isActive` shown as Active/Inactive |
| D11 | Existing POS middleware lets `owner_admin` in "for cross-testing" | removed; owner sees Restricted in POS (Barista guideline §4) |

## 14. Prototype files

`owner.html`, `barista.html`, `app.js`, `store.js`, `pos.js`, `admin.js` stay in place as reference during the build. At the end they move to `docs/prototype/` (with `styles.css` remaining in `packages/ui/css/`), and the guidelines' "prototype zip" references point there.

## 15. Build order

1. Design system: fonts, `styles.css` wired into both apps, `packages/ui` rewrite, Tailwind preset + ADR 0007.
2. Contracts extensions + `rules/` with tests; `@gunita/mocks` package.
3. Shells: owner sidebar/bottom nav/topbar, POS shell with OfflineBanner + sync indicator; toast/modal/confirm roots; mock auth, middleware, Restricted, idle logout.
4. POS: menu/cart/customize/payment/receipt → Orders → Inventory → offline outbox + sync + catalog cache.
5. Owner: Suppliers → Inventory → Products + Recipe & Costing → Orders → Dashboard + Reports → Users.
6. Clean-up: move prototype files, update feature READMEs and guideline §13/§14 "Decided" notes.

## 16. Definition of done

Per screen: matches the prototype visually; works at 360px–1600px; keyboard and screen-reader basics (focus ring, labelled dialogs, `aria-live` toasts, `aria-current`); loading/empty/error states; no console errors. Repo-wide: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build` pass; all rule functions in §9 have unit tests.

## 17. Left to the builder

Exact component APIs and prop names for new `packages/ui` components; hook names; query-key naming; how much of the prototype's CSS needs small additions; mock delay length; how to split work into PRs; test file layout under each package; how `offline/sync.ts` routes to the mock; the Dexie version bump for the catalog cache tables; mapping the existing `products/recipe-costing` route onto `products/[id]/recipe` (redirect).
