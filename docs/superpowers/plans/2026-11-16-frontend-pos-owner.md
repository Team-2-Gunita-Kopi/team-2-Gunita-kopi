# Barista POS + Owner Admin Frontend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the vanilla-JS prototype as the real Next.js frontends of `apps/pos` (barista) and `apps/admin` (owner), styled by `packages/ui/css/styles.css`, running on mock data behind the same data functions the real API will use.

**Architecture:** Shared pieces live in packages — `@gunita/contracts` (types + pure business rules), new `@gunita/mocks` (prototype seed + in-memory store, with an owner and a stripped POS entry point), `@gunita/ui` (React components rendering the prototype's CSS classes), `@gunita/auth` (mock session cookie helpers). Each app feature folder has `api.ts` + `mock.ts` behind `index.ts`, chosen by `NEXT_PUBLIC_USE_MOCKS`; screens use TanStack Query hooks. The POS writes checkouts to the existing Dexie outbox and syncs to the mock.

**Tech Stack:** pnpm + Turborepo, Next.js 15 App Router, React 19, TypeScript strict, zod, Dexie 4, Zustand, TanStack Query v5, Vitest + Testing Library + jsdom, fake-indexeddb.

**Spec:** `docs/superpowers/specs/2026-11-16-frontend-pos-owner-design.md` (read it first; section numbers below refer to it). Screen behavior details: `docs/architecture/OWNER_ADMIN_GUIDELINE.md` §8 and `docs/architecture/BARISTA_POS_GUIDELINE.md` §8. Visual reference: `apps/admin/app.js`, `apps/admin/admin.js`, `apps/pos/pos.js`, `apps/admin/store.js` and `packages/ui/css/styles.css`.

## Global Constraints

- `packages/contracts`: **add optional fields / new exports only**. Never rename, remove or change an existing field or enum value. `pnpm --filter @gunita/api typecheck` and `pnpm --filter @gunita/api test` must pass after every task.
- Field reuse (decided, spec §8): `Order.orderNumber` = queue number; `Product.isActive` = "available"; `Product.sellingPrice` = price; `Product.imageUrl` = image; `Ingredient.minimumStock` = reorder level; `Ingredient.updatedAt` = date updated; `Supplier.phone` = contact number; `isActive` everywhere = Active/Inactive chip.
- Categories (exact): `Iced Coffee Drinks`, `Hot Beverages`, `Pastries & Snacks`, `Rice Meals`.
- Status/type values lowercase in data (`pending | preparing | completed | cancelled`, `dine-in | take-out | pre-order`); UI labels capitalized (`Pending`, `Dine-in`…). Order type `online` is never offered in the UI.
- Payment: UI offers Cash only (`paymentMethod: "cash"`).
- Currency `₱1,234.50` (`en-PH`, 2 decimals); date-time `Nov 3, 2026 2:22 PM`.
- Styling: use the class names in `packages/ui/css/styles.css`; don't restyle with Tailwind color classes. New styles go into `styles.css` in its style.
- **Shared demo data:** the mock store runs once in `apps/api` (`:3002`) behind `POST /api/mock/rpc`, enabled only when `MOCK_MODE=true`. Both frontends' `mock.ts` files call it over HTTP; a barista order must appear in the owner app.
- Owner-only data (unit cost, costing, margins, suppliers, users other than login identities) never reaches `apps/pos`: POS RPC calls go through the POS projection, and `apps/pos` imports only **types** from `@gunita/mocks` (`import type`).
- Mock session cookie accepted **only** when `process.env.NEXT_PUBLIC_USE_MOCKS === "true"`.
- No `localStorage` for business data; only UI prefs (`gk-sidebar-collapsed`). Mock data lives in the api process + `apps/api/.mock-data/state.json` (git-ignored).
- Touch targets ≥ 44px in POS; focus ring, labelled dialogs, `aria-live` toasts, `aria-current="page"`, reduced-motion.
- Settings constants: shop name `Gunita Kopi`, receipt footer `Salamat po! Come again.`, queue prefix `A`, auto-logout 5 min, idle warning countdown 30 s.
- Never edit files under `apps/api` except in Task 9b (mock service only; real route handlers untouched).
- Demo runs with `pnpm dev` (admin `:3000`, pos `:3001`, api `:3002`) and env: admin/pos `NEXT_PUBLIC_USE_MOCKS=true`, `NEXT_PUBLIC_API_URL=http://localhost:3002`; api `MOCK_MODE=true`.

## Review Focus

1. **Paying with a non-numeric, empty or comma-formatted amount** ("1,000", "") — Confirm stays disabled and no NaN reaches the order; covered in Task 19 (`payment rejects empty and non-numeric amounts`).
2. **Two quick taps on Confirm / Sync now** — exactly one outbox record / one mock order per `clientTxId`; covered in Task 19 (`double confirm creates one outbox record`) and Task 20 (`syncing the same transaction twice returns duplicate`).
3. **Stock running out between adding to cart and checkout** (another line used the last milk) — checkout is rejected by the store with the ingredient named, cart kept; covered in Task 7 (`placeOrder rejects when combined lines exceed stock`) and Task 20 (failed sync shows reason).
4. **Restarting the dev servers or reloading mid-session** — demo data and session survive; a corrupt `.mock-data/state.json` reseeds instead of crashing; covered in Task 6 (`corrupt storage reseeds`) and Task 9b (`file store survives restart`).
6. **Mock service not running** (api on `:3002` stopped) — screens show the error state `Can't reach the demo data service on :3002. Is \`pnpm dev\` running?` instead of hanging; POS checkout still saves to the outbox; covered in Task 15 (`rpc network error shows service message`).
5. **Owner deactivating/demoting the last active owner or themselves** via the edit form (not only the toggle) — blocked with toast; covered in Task 30 (`edit form cannot demote last owner`).

---

## File Map

```
packages/contracts/
  src/{orders,products,users,dashboard}.ts        modify: optional fields + new owner schemas
  src/pos.ts                                       create: PosProduct/PosIngredient schemas
  src/rules/{stock,catalog,cart,orders,costing,users,index}.ts   create
  tests/*.test.ts, vitest.config.ts                create
packages/auth/src/mock-session.ts (+ test)         create
packages/mocks/                                    create package @gunita/mocks
  src/seed/{catalog,owner,orders,rng}.ts
  src/store/{state,orders,stock,catalog,owner,reports,auth,sync}.ts
  src/owner.ts  src/pos.ts  tests/
packages/ui/src/                                   rewrite + add components (see Tasks 10–12)
packages/ui/src/format.ts                          create
packages/config/tailwind.preset.js, docs/decisions/0007-*.md   modify
apps/admin/src/
  app/layout.tsx, app/globals.css                 modify
  app/(auth)/login/page.tsx, app/restricted/page.tsx
  app/(app)/layout.tsx + routes (Tasks 23–30)
  lib/{mock-db,query,use-mocks,session-client}.ts, middleware.ts
  features/<f>/{api,mock,index,types}.ts, hooks/, components/
  test/{setup,render}.tsx, vitest.config.ts
apps/pos/src/  (same pattern) + features/pos/cart.store.ts + offline/* extended
docs/prototype/                                    Task 31 (move prototype files)
```

---

### Task 1: Workspace tooling + contracts extensions

**Files:**
- Modify: `packages/contracts/src/orders.ts`, `products.ts`, `users.ts`, `dashboard.ts`, `index.ts`, `package.json`
- Create: `packages/contracts/src/pos.ts`, `packages/contracts/vitest.config.ts`, `packages/contracts/tests/schemas.test.ts`

**Interfaces:**
- Produces:
  - `OrderAddonSchema = z.object({ ingredientId: z.string(), label: z.string(), quantity: z.number().positive(), price: z.number().nonnegative() })`, type `OrderAddon`
  - `OrderItemSchema` gains optional `addons: OrderAddon[]`, `customization: string`, `specialInstructions: string`
  - `OrderSchema` gains optional `cashierName: string`
  - `ProductSchema` gains optional `description: string`
  - `UpdateRecipeRequestSchema` gains optional `packagingCost: number (>=0)`
  - `ProductCostingSchema = { productId, ingredientCost, packagingCost, totalCost, margin, marginPercent, updatedAt }` (all numbers except ids/strings), type `ProductCosting`
  - `UserProfileSchema` gains optional `username: string`
  - `OwnerDashboardSchema = { date: string /*YYYY-MM-DD*/, isFallbackDay: boolean, sales: number, ordersCount: number, openOrdersCount: number, topProducts: {productName: string, quantity: number}[], lowStock: InventoryStatusItem[], recentOrders: Order[] }`
  - `src/pos.ts`: `PosProductSchema = ProductSchema.omit({ costPrice: true, profitMarginPercent: true })`, `PosIngredientSchema = IngredientSchema.omit({ unitCost: true, supplierId: true, supplierName: true })`, types `PosProduct`, `PosIngredient`
  - `OrderFilters = { status?: OrderStatus | "all"; date?: string; search?: string }` (type only, in orders.ts)

- [ ] **Step 1: Install tooling.** Run `corepack enable && corepack prepare --activate` (falls back to `npm i -g pnpm@9` if the `packageManager` version is unavailable — record what was used in the commit message), then `pnpm install`. Expected: `node_modules` present, no errors.
- [ ] **Step 2: Baseline.** Run `pnpm --filter @gunita/api test` and `pnpm typecheck`. Expected: PASS (record any pre-existing failure and stop to report it).
- [ ] **Step 3: Add vitest to contracts** (`devDependencies: vitest`, script `"test": "vitest run"`, `vitest.config.ts` node env, globals).
- [ ] **Step 4: Write failing tests** in `tests/schemas.test.ts`:
  - `order item accepts nested addons` — `OrderItemSchema.parse({...base, addons:[{ingredientId:"i-beans",label:"Extra shot",quantity:18,price:25}], customization:"Sugar 50%"})` keeps `addons[0].price === 25`.
  - `old order item without new fields still parses` — base item parses, `addons` undefined.
  - `pos product schema strips cost fields` — `PosProductSchema.parse({...product, costPrice: 40, profitMarginPercent: 60})` has no `costPrice` key.
  - `pos ingredient schema strips unit cost and supplier` — result has no `unitCost`, `supplierId`, `supplierName`.
  - `owner dashboard schema parses fallback day` — `isFallbackDay: true` round-trips.
- [ ] **Step 5: Run** `pnpm --filter @gunita/contracts test` → FAIL (exports missing).
- [ ] **Step 6: Implement** the schema additions above; export `pos.ts` from `index.ts`.
- [ ] **Step 7: Run** contracts tests → PASS; `pnpm --filter @gunita/api test` and `pnpm --filter @gunita/api typecheck` → PASS.
- [ ] **Step 8: Commit** `feat(contracts): add optional order/product/user fields and pos schemas`.

### Task 2: Rules — stock status, orderability, add-ons

**Files:**
- Create: `packages/contracts/src/rules/stock.ts`, `rules/catalog.ts`, `rules/index.ts`; export `./rules` from `src/index.ts`
- Test: `packages/contracts/tests/rules-stock.test.ts`, `rules-catalog.test.ts`

**Interfaces:**
- Produces:
  - `type StockStatus = "ok" | "low" | "out_of_stock"`; `stockStatus(currentStock: number, minimumStock: number): StockStatus`; `STOCK_STATUS_LABEL: Record<StockStatus,string>` = `{ok:"In Stock", low:"Low", out_of_stock:"Out"}`; `sortByStockUrgency<T extends {currentStock:number; minimumStock:number; name:string}>(items: T[]): T[]` (Out, then Low, then OK; name asc within)
  - `PRODUCT_CATEGORIES` (the four, in order) and `type ProductCategory`
  - `type RecipeLine = { ingredientId: string; quantity: number }`
  - `isOrderable(product: {isActive: boolean}, recipe: RecipeLine[], stockById: Record<string, number>): { orderable: boolean; reason?: "unavailable" | "out_of_stock" }`
  - `ADDON_CATALOG: AddonDef[]` where `AddonDef = { ingredientId; label; quantity; price; categories: ProductCategory[]; requiresInRecipe?: boolean }` — exact rows: Extra shot `i-beans` 18 ₱25 Iced+Hot requiresInRecipe; Caramel syrup `i-caramel` 15 ₱15 Iced; Vanilla syrup `i-vanilla` 15 ₱15 Iced; Hazelnut syrup `i-hazelnut` 15 ₱15 Iced; Extra milk `i-milk` 60 ₱15 Iced+Hot; Extra rice `i-rice` 150 ₱20 Rice; Extra egg `i-egg` 1 ₱15 Rice
  - `addonsFor(category: string, recipe: RecipeLine[], stockById: Record<string,number>): (AddonDef & { disabled: boolean })[]`
  - `QUICK_CHIPS: Record<ProductCategory,string[]>` — copy exactly from `apps/pos/pos.js:131-136`

- [ ] **Step 1: Write failing tests:**
  - `stockStatus`: `(0,10)→"out_of_stock"`, `(-1,10)→"out_of_stock"`, `(10,10)→"low"`, `(10.5,10)→"ok"`.
  - `sortByStockUrgency` puts out, low, ok in that order.
  - `isOrderable`: inactive → `{orderable:false, reason:"unavailable"}`; one ingredient short (`stock 17 < need 18`) → `reason:"out_of_stock"`; exact stock (18/18) → orderable; ingredient missing from map counts as 0.
  - `addonsFor("Hot Beverages", [{ingredientId:"i-tablea",quantity:40}], …)` excludes Extra shot (no beans) but includes Extra milk; `addonsFor("Iced Coffee Drinks", beansRecipe, {"i-caramel": 10, ...})` marks Caramel `disabled: true`; `addonsFor("Pastries & Snacks", …)` → `[]`.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(contracts): add stock and catalog business rules`.

### Task 3: Rules — cart, money, order flow, queue numbers

**Files:**
- Create: `packages/contracts/src/rules/cart.ts`, `rules/orders.ts`
- Test: `tests/rules-cart.test.ts`, `tests/rules-orders.test.ts`

**Interfaces:**
- Consumes: `OrderAddon`, `OrderItem`, `OrderStatus` (Task 1)
- Produces:
  - `type CartLine = { lineId: string; productId: string; productName: string; category: string; unitPrice: number; quantity: number; addons: OrderAddon[]; customization: string; specialInstructions: string }`
  - `isPlainLine(l: CartLine): boolean` (no addons, empty customization and instructions)
  - `addLine(lines: CartLine[], p: {id; name; category; sellingPrice}, makeId: () => string): CartLine[]` — R-B1: increments an existing plain line of the same product, else appends a new plain line
  - `lineTotal(l: CartLine): number` = `(unitPrice + Σaddon.price) × quantity`, rounded to 2dp; `orderTotal(lines): number`
  - `toOrderItems(lines: CartLine[]): OrderItem[]` (`subtotal = lineTotal`)
  - `computeChange(total: number, paid: number): { ok: true; change: number } | { ok: false; error: "Amount paid is less than the total." }`; `parseAmount(input: string): number | null` (accepts `"1,000.50"`, `" 200 "`; returns null for empty/non-numeric/negative)
  - `nextStatus(s: OrderStatus): OrderStatus | null` (pending→preparing→completed→null; cancelled→null); `canCancel(s): boolean`; `ORDER_STATUS_LABEL`, `ORDER_TYPE_LABEL` (`dine-in:"Dine-in"`, `take-out:"Take-out"`, `pre-order:"Pre-order"`, `online:"Online"`)
  - `nextQueueNo(prev: {day: string; seq: number} | null, now: Date, prefix = "A"): { queueNo: string; day: string; seq: number }` — `day` = local `YYYYMMDD`, `queueNo` = `${day}-${prefix}-${seq padded to 3}`, seq resets to 1 when day changes
  - `provisionalQueueNo(n: number): string` → `OFF-001`

- [ ] **Step 1: Write failing tests:**
  - `addLine` twice for the same product → one line qty 2; after giving the line an addon, `addLine` appends a second line.
  - `lineTotal` for Iced Spanish Latte ₱145 + Extra shot ₱25 ×2 = `340`; `orderTotal` sums lines.
  - `computeChange(340, 500)` → `{ok:true, change:160}`; `computeChange(340, 339.99)` → ok false with the exact message; `computeChange(0.1+0.2, 0.3)` → ok true (no float trap).
  - `parseAmount("1,000.50") === 1000.5`; `parseAmount("") === null`; `parseAmount("abc") === null`; `parseAmount("-5") === null`.
  - `nextStatus("pending") === "preparing"`, `nextStatus("completed") === null`; `canCancel("completed") === false`, `canCancel("preparing") === true`.
  - `nextQueueNo(null, new Date(2026,10,16,9))` → `"20261116-A-001"`; prev `{day:"20261116", seq:41}` same day → `"20261116-A-042"`; prev from `"20261115"` → seq 1.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(contracts): add cart, payment and order-flow rules`.

### Task 4: Rules — costing and user guard

**Files:**
- Create: `packages/contracts/src/rules/costing.ts`, `rules/users.ts`
- Test: `tests/rules-costing.test.ts`, `tests/rules-users.test.ts`

**Interfaces:**
- Produces:
  - `computeCosting(recipe: {quantity: number; unitCost: number}[], packagingCost: number, price: number): { ingredientCost; packagingCost; totalCost; margin; marginPercent }` — R7; `marginPercent = price > 0 ? margin / price * 100 : 0`; all rounded to 2dp
  - `checkUserChange(users: {id: string; role: Role; isActive: boolean}[], targetId: string, next: {role: Role; isActive: boolean}, currentUserId: string): { ok: true } | { ok: false; message: string }` — messages exactly: self-deactivate `"You can't deactivate your own account."`; last owner `"At least one active Owner must remain."`

- [ ] **Step 1: Write failing tests:** costing `[{quantity:18, unitCost:1.2},{quantity:150, unitCost:0.08}]`, packaging `6`, price `145` → ingredientCost `33.6`, totalCost `39.6`, margin `105.4`, marginPercent `72.69`; price 0 → marginPercent 0. User guard: deactivating self → self message; demoting the only active owner → last-owner message; demoting one of two active owners → ok; deactivating an inactive-already barista → ok.
- [ ] **Step 2–4:** run FAIL → implement → run PASS.
- [ ] **Step 5: Commit** `feat(contracts): add costing and user guard rules`.

### Task 5: Mock session helpers + formatting helpers

**Files:**
- Create: `packages/auth/src/mock-session.ts` (export from `index.ts`), `packages/auth/tests/mock-session.test.ts`, vitest setup for `packages/auth`
- Create: `packages/ui/src/format.ts` (export from `index.ts`), `packages/ui/tests/format.test.ts`, vitest setup for `packages/ui` (jsdom, `@testing-library/react`, `@testing-library/user-event`, `@testing-library/jest-dom`; add `react@^19`/`react-dom@^19` dev deps to match apps)

**Interfaces:**
- Produces:
  - `MOCK_SESSION_COOKIE = "gk-mock-session"`; `type MockSession = { userId: string; role: Role; fullName: string; username: string }`; `encodeMockSession(s: MockSession): string` (base64url JSON); `decodeMockSession(v: string | undefined): MockSession | null` (null on bad input or unknown role)
  - `formatPeso(n: number): string`; `formatDate(iso)`; `formatTime(iso)`; `formatDateTime(iso): string`; `toDayKey(iso: string): string` (`YYYY-MM-DD` local)

- [ ] **Step 1: Write failing tests:** round-trip encode/decode; `decodeMockSession("garbage") === null`; role `"admin"` → null. `formatPeso(1234.5) === "₱1,234.50"`; `formatPeso(0) === "₱0.00"`; `formatDateTime(new Date(2026,10,3,14,22).toISOString()) === "Nov 3, 2026 2:22 PM"`; midnight → `12:00 AM`.
- [ ] **Step 2–4:** FAIL → implement (`Intl.NumberFormat("en-PH",{style:"currency",currency:"PHP"})`, normalize the symbol to `₱`) → PASS.
- [ ] **Step 5: Commit** `feat(auth,ui): add mock session and formatting helpers`.

### Task 6: `@gunita/mocks` — package, seed, state, persistence

**Files:**
- Create: `packages/mocks/package.json` (name `@gunita/mocks`, exports `"./owner": "./src/owner.ts"`, `"./pos": "./src/pos.ts"`; deps `@gunita/contracts`), `tsconfig.json`, `vitest.config.ts`
- Create: `src/seed/rng.ts` (mulberry32 port), `src/seed/catalog.ts`, `src/seed/owner.ts`, `src/seed/orders.ts`, `src/store/state.ts`
- Test: `packages/mocks/tests/state.test.ts`
- Modify: both apps' `next.config.ts` `transpilePackages` += `@gunita/mocks`; add `@gunita/mocks: workspace:*` to both apps

**Interfaces:**
- Produces:
  - `seed/catalog.ts` (POS-safe): `seedProducts(): PosProduct[]` with `ingredients: RecipeIngredient[]` (no cost fields), `seedIngredients(): PosIngredient[]`, settings `{shopName, receiptFooter, queuePrefix, autoLogoutMin}`. Port values from `apps/admin/store.js` (products ~L141–200, ingredients ~L122–140); map ids as in the prototype (`p-iced-spanish-latte`, `i-beans`…). Settings type `MockSettings = { shopName: string; receiptFooter: string; queuePrefix: string; autoLogoutMin: number }` exported from `@gunita/mocks/pos` and `/owner`.
  - `seed/owner.ts` (owner-only): unit costs by ingredient id, packaging costs by product, suppliers (6, from `store.js` L112–121), users (`owner/owner123` Eric Espedilion owner_admin; `barista/barista123` Juan Dela Cruz; `barista2/barista123` Maria Santos; emails `<username>@gunita.local`)
  - `seed/orders.ts`: `seedOrders(now: Date, rng)` — port `buildSeedOrders`/`buildSeedTx` so there are orders today and on prior days with deterministic RNG seed `20261103`
  - `store/state.ts`: `type MockState` (products, ingredients, orders, stockTx, settings, queue `{day, seq}`, plus owner-only `suppliers?`, `users?`, `unitCosts?`, `packaging?`); `createState(kind: "owner" | "pos", now: Date): MockState`; `loadState(storage: StateStorage | null, key: string, kind, now): MockState` (`StateStorage` defined here, see Task 9) (reseeds on missing/corrupt JSON); `saveState(storage, key, state): void`
  - `class MockError extends Error { code: "NOT_FOUND" | "VALIDATION" | "INSUFFICIENT_STOCK" | "FORBIDDEN" }`

- [ ] **Step 1: Write failing tests:** `createState("owner")` has 6 suppliers, 3 users, ≥ 16 products across all 4 categories, today has ≥ 1 order; `createState("pos")` has `suppliers`, `users`, `unitCosts` undefined and `JSON.stringify` contains none of `unitCost`, `costPrice`, `supplier`; `corrupt storage reseeds` — storage with `"{not json"` under the key returns a valid seeded state; save then load returns equal state; same `now` → identical seed (deterministic).
- [ ] **Step 2–4:** FAIL → implement → PASS.
- [ ] **Step 5: Commit** `feat(mocks): add seed data and persisted mock state`.

### Task 7: `@gunita/mocks` — orders, stock and sync operations

**Files:**
- Create: `src/store/orders.ts`, `src/store/stock.ts`, `src/store/sync.ts`
- Test: `tests/orders.test.ts`, `tests/stock.test.ts`, `tests/sync.test.ts`

**Interfaces:**
- Consumes: rules from Tasks 2–3, `MockState`, `MockError`
- Produces (all pure over `state`, mutate in place, return contract types):
  - `listOrders(state, f: OrderFilters): Order[]` (newest first; search matches `orderNumber` or product name, case-insensitive; `date` = `YYYY-MM-DD`)
  - `getOrder(state, id): Order` (NOT_FOUND)
  - `placeOrder(state, req: CreateOrderRequest, user: {id; fullName}, now: Date): Order` — validates `computeChange`, R2 per line, combined stock need (recipe qty × qty + addon qty × qty, summed per ingredient across lines) ≤ stock else `INSUFFICIENT_STOCK` with message `Not enough <ingredient name> in stock.`; assigns `nextQueueNo`; writes one `order_deduction` StockTransaction per ingredient with reason `Order <queueNo>`
  - `advanceOrder(state, id): Order` (VALIDATION if `nextStatus` null)
  - `cancelOrder(state, id, user, now): Order` — only if `canCancel`; restores stock with `stock_in` rows, reason `Cancelled <queueNo>`
  - `listIngredients(state): Ingredient[]` (sorted by urgency), `createStockTransaction(state, req: CreateStockTransactionRequest, user, now): StockTransaction` — `quantityChange > 0` required for in/out; `stock_out` beyond current → VALIDATION `Cannot remove more than current stock.`; sets `previousStock/newStock`, ingredient `updatedAt`
  - `listStockTransactions(state, f: {ingredientId?; type?: StockTransactionType; date?}): StockTransaction[]` newest first, `createdBy` holds the user's full name
  - `syncOrders(state, payload: SyncPayload, user, now): SyncResponse` — per item: already-seen `transactionId` → `duplicate` with the existing `orderId`; `placeOrder` error → `failed` with message; else `synced`

- [ ] **Step 1: Write failing tests:**
  - `placeOrder deducts recipe and addon stock` — 2× Iced Spanish Latte + Extra shot: beans drop by `(18+18)×2 = 72`, two-plus `order_deduction` rows with reason starting `Order 2026`.
  - `placeOrder rejects when combined lines exceed stock` — set milk to 200; two separate lines needing 150 each → throws `INSUFFICIENT_STOCK` mentioning `Milk`; stock unchanged.
  - `placeOrder rejects underpayment` → VALIDATION.
  - `cancelOrder restores stock` — beans back to original, `stock_in` rows reason `Cancelled <queueNo>`; cancelling a completed order throws.
  - `advanceOrder` pending → preparing → completed → throws.
  - `stock_out beyond current stock throws`; `stock_in 500` raises stock by 500 and records previous/new.
  - `listOrders` filters by status, date and search (`"spanish"` finds the order).
  - `syncing the same transaction twice returns duplicate` — second call result `status: "duplicate"`, only one order exists.
- [ ] **Step 2–4:** FAIL → implement → PASS.
- [ ] **Step 5: Commit** `feat(mocks): add order, stock and sync operations`.

### Task 8: `@gunita/mocks` — owner operations, reports, dashboard, auth

**Files:**
- Create: `src/store/catalog.ts`, `src/store/owner.ts`, `src/store/reports.ts`, `src/store/auth.ts`
- Test: `tests/owner.test.ts`, `tests/reports.test.ts`, `tests/auth.test.ts`

**Interfaces:**
- Produces:
  - Products: `listProducts(state): Product[]` (owner: `costPrice` = costing total, `profitMarginPercent`), `getProduct`, `createProduct(state, req: CreateProductRequest & {description?; isActive?})`, `updateProduct(state, id, patch)`, `setProductAvailability(state, id, isActive)`, `deleteProduct(state, id)`
  - Recipe: `getRecipe(state, productId): { ingredients: RecipeIngredient[]; packagingCost: number; costing: ProductCosting }`, `saveRecipe(state, productId, req: UpdateRecipeRequest, now): ProductCosting` (replaces lines; recompute via `computeCosting`)
  - Ingredients: `createIngredient(state, req: CreateIngredientRequest)` (supplier must be active → VALIDATION `Inactive suppliers can't be assigned.`), `updateIngredient`, `productsUsingIngredient(state, id): {id; name}[]`, `deleteIngredient(state, id)` (removes it from recipes too)
  - Suppliers: `listSuppliers`, `createSupplier`, `updateSupplier`, `setSupplierActive`
  - Users: `listUsers(state): UserProfile[]` (with `username`), `createUser(state, req: CreateEmployeeRequest & {username: string})`, `updateUser(state, id, patch: {fullName?; role?; isActive?; password?}, currentUserId)` (runs `checkUserChange`, throws FORBIDDEN with its message)
  - Reports (Completed orders only, R13): `dailySales(state, days = 14): DailyReport[]`, `monthlySales(state, months = 6): MonthlyReport[]`, `bestSellers(state, from: string, to: string): BestSellerItem[]` (qty desc), `stockStatusReport(state): InventoryStatusItem[]`
  - `getDashboard(state, now): OwnerDashboard` — falls back to the latest day with orders when today has none (`isFallbackDay: true`); `openOrdersCount` = pending + preparing; top 5 products by qty; `lowStock` = low/out items; `recentOrders` 6 newest
  - `authenticate(state, identifier: string, password: string): UserProfile | null` — matches username or email, active users only; POS state keeps a minimal login list (id, username, email, fullName, role, isActive, password) and nothing else from users

- [ ] **Step 1: Write failing tests:** saving a recipe updates `listProducts` margin; `productsUsingIngredient("i-milk")` lists the latte products; creating an ingredient with the inactive Panaderia supplier throws; updateUser demoting the only owner throws FORBIDDEN with `"At least one active Owner must remain."`; reports exclude cancelled/pending orders (place + cancel an order, daily total unchanged); dashboard with today's orders removed → `isFallbackDay` true and `date` = latest day with orders; `authenticate("owner","owner123")` and `authenticate("owner@gunita.local","owner123")` both return the owner; wrong password → null.
- [ ] **Step 2–4:** FAIL → implement → PASS.
- [ ] **Step 5: Commit** `feat(mocks): add owner operations, reports and auth`.

### Task 9: `@gunita/mocks` entry points (owner vs POS)

**Files:**
- Create: `src/owner.ts`, `src/pos.ts`
- Test: `tests/entrypoints.test.ts`

**Interfaces:**
- Produces:
  - `type StateStorage = { getItem(key: string): string | null; setItem(key: string, value: string): void }` (Task 6's `loadState/saveState` take this instead of DOM `Storage`)
  - `createOwnerMockDb(opts: { storage: StateStorage | null; key?: string /*default "gk-mock-v1"*/; now?: () => Date }): OwnerMockDb` — binds every op from Tasks 7–8 to one persisted state (save after each mutating call), plus `reset(): void`
  - `createPosView(db: OwnerMockDb): PosMockDb` — over the **same** state; exposes only: `listCatalog(): { products: PosProduct[]; ingredients: PosIngredient[]; settings: MockSettings; updatedAt: string }`, `listOrders`, `getOrder`, `placeOrder`, `advanceOrder`, `cancelOrder`, `listIngredients(): PosIngredient[]`, `createStockTransaction`, `listStockTransactions`, `syncOrders`, `authenticate`, `reset`; every result is parsed through `PosProductSchema`/`PosIngredientSchema` (or stripped) so owner-only fields are removed
  - `OWNER_OPS: (keyof OwnerMockDb)[]`, `POS_OPS: (keyof PosMockDb)[]` allow-lists
  - `src/pos.ts` exports **types only** (`PosMockDb`, `MockSettings`, `POS_OPS` as a `const` tuple of strings) so `apps/pos` can `import type` without pulling seed code
- [ ] **Step 1: Write failing tests:** `createPosView(db)` results never contain `unitCost`, `costPrice`, `profitMarginPercent`, `supplierId`; an order placed through the POS view appears in `db.listOrders({})` (shared state); owner db persists across two instances sharing one in-memory `StateStorage` stub.
- [ ] **Step 2–4:** FAIL → implement → PASS.
- [ ] **Step 5: Commit** `feat(mocks): add owner and pos entry points`.

### Task 9b: Shared mock service in `apps/api`

**Files:**
- Create: `apps/api/src/lib/mock-db.ts`, `apps/api/src/app/api/mock/rpc/route.ts`, `apps/api/tests/mock-rpc.test.ts`
- Modify: `apps/api/package.json` (+ `@gunita/mocks: workspace:*`), `apps/api/next.config.ts` (`transpilePackages` += `@gunita/mocks`), `apps/api/vitest.config.ts` (alias `@gunita/mocks`), `apps/api/.env.example` (`MOCK_MODE=true`), root `.gitignore` (`apps/api/.mock-data/`)

**Interfaces:**
- Consumes: `createOwnerMockDb`, `createPosView`, `OWNER_OPS`, `POS_OPS`, `MockError` (Tasks 6–9)
- Produces:
  - `fileStorage(dir: string): StateStorage` (sync `fs` read/write of `<dir>/<key>.json`, creates the dir; read errors → null)
  - `getSharedMockDb(): { owner: OwnerMockDb; pos: PosMockDb }` — singleton on `globalThis.__gkMockDb` (survives Next dev hot reload), storage `fileStorage(path.join(process.cwd(), ".mock-data"))`
  - `POST /api/mock/rpc` — 404 `{ok:false,error:{code:"NOT_FOUND",message:"Mock mode is off"}}` unless `process.env.MOCK_MODE === "true"`; body `{ app: "owner" | "pos"; op: string; args: unknown[] }` (zod); op not in that app's allow-list → 400 `UNKNOWN_OP`; `MockError` → 400 `{ok:false,error:{code,message}}`; success `{ ok: true, data }`; `OPTIONS` + CORS headers via `getCorsHeaders` from `src/lib/cors.ts`. The route is excluded from the api auth middleware (check `apps/api/src/middleware.ts` matcher and add `/api/mock` to its public paths).
- [ ] **Step 1: Write failing tests** (call the route's `POST` with `new NextRequest(...)`):
  - `returns 404 when MOCK_MODE is off`.
  - `pos cannot call owner ops` — `{app:"pos", op:"listSuppliers"}` → 400 `UNKNOWN_OP`.
  - `order placed by pos is visible to owner` — `pos.placeOrder` then `owner.listOrders` contains its `orderNumber`.
  - `pos catalog has no cost fields` — response JSON text contains no `unitCost`/`costPrice`.
  - `file store survives restart` — write through one db, clear `globalThis.__gkMockDb`, new db (same temp dir) sees the order.
  - `mock errors map to 400` — underpaid `placeOrder` → `{ok:false, error:{code:"VALIDATION"}}`.
- [ ] **Step 2–4:** FAIL → implement → PASS; `pnpm --filter @gunita/api typecheck` PASS.
- [ ] **Step 5: Commit** `feat(api): add dev-only shared mock service`.

### Task 10: `@gunita/ui` — base components in the prototype style

**Files:**
- Rewrite: `packages/ui/src/Button.tsx`, `StatusBadge.tsx`, `StatCard.tsx`, `DataTable.tsx`, `Tabs.tsx`, `Input.tsx`, `Select.tsx`, `tokens.ts`
- Create: `Chip.tsx`, `Card.tsx`, `Field.tsx`, `Seg.tsx`, `PageHeader.tsx`, `Icon.tsx`, `EmptyState.tsx`, `Skeleton.tsx`, `Banner.tsx`, `BarChart.tsx`, `HBarChart.tsx`, `Receipt.tsx`
- Test: `packages/ui/tests/components.test.tsx`

**Interfaces:**
- Produces (class names from `styles.css`; check each against the prototype's markup in `app.js`/`admin.js`/`pos.js`):
  - `Button` props `variant?: "default" | "primary" | "coffee" | "danger" | "ghost"`, `size?: "sm"`, `block?: boolean` → `btn btn-primary btn-sm btn-block`. Keep accepting old `"secondary" | "outline"` (map to default) and `size "md"|"lg"` (no class) so existing pages compile.
  - `Chip({ tone: "ok" | "low" | "out" | "coffee" | "moss" | "neutral", children })` → `chip chip-<tone>`
  - `StatusBadge({ status, label? })` — maps order statuses, sync states (`pending`→low, `synced`→ok, `failed`→out, `syncing`→coffee) and stock statuses to a `Chip`; default label from `ORDER_STATUS_LABEL`/`STOCK_STATUS_LABEL`
  - `Card`, `Field({ label, error?, children })` (`label.field` + `.field-err`), `Input`, `Select` (forward refs, `inputMode` passthrough)
  - `Seg<T extends string>({ options: {value: T; label: string; icon?: IconName}[], value: T, onChange, label })` — buttons with `aria-pressed`
  - `Tabs` → prototype `.subtabs` links: `Tabs({ tabs: {id; label; href?}[], activeTab, onChange? })`
  - `DataTable` → `.tbl-wrap > table.tbl` (+ `className` for `tbl-orders` etc.), `onRowClick?`, `emptyMessage`
  - `PageHeader({ latin: string, title: string, actions?: ReactNode })` — kicker `ᜄᜓᜈᜒᜆ` with `data-latin`, `lang="tl-Tglg"`
  - `Icon({ name: IconName })` — all SVGs from `store.js` `ICONS` (L58–86); `IconName` union of their keys
  - `StatCard` → `.kpi` card (title, value in `.num`, subtitle)
  - `EmptyState({ message, action? })`, `Skeleton({ rows })`, `Banner({ tone: "warn" | "danger"; children })`
  - `BarChart({ values: number[]; labels: string[] })`, `HBarChart({ rows: {label; value}[]; format?: (n) => string })` — port `barChart`/`hbarChart` from `app.js:242-279`
  - `Receipt({ order: Order; shopName; footer; cashierName; pendingSync?: boolean })` — layout from `app.js` `receiptModal` (L293–328) inside `.print-area`
- [ ] **Step 1: Write failing tests:** `Button variant="primary" size="sm"` has classes `btn btn-primary btn-sm`; `StatusBadge status="out_of_stock"` renders text `Out` with class `chip-out`; `Seg` sets `aria-pressed="true"` only on the selected option and calls `onChange("take-out")`; `PageHeader` renders `ᜄᜓᜈᜒᜆ` and `data-latin="gunita · admin"`; `Receipt` shows `20261116-A-001`, `₱340.00`, `Salamat po! Come again.` and `Pending sync` when `pendingSync`.
- [ ] **Step 2–4:** FAIL → implement → PASS. Run `pnpm --filter @gunita/admin typecheck` and `pnpm --filter @gunita/pos typecheck` → PASS (existing pages still compile).
- [ ] **Step 5: Commit** `feat(ui): restyle base components to the prototype design`.

### Task 11: `@gunita/ui` — overlays: Modal, ConfirmDialog, Toast

**Files:**
- Rewrite: `packages/ui/src/Dialog.tsx` (keep name `Dialog`, also export `Modal` alias)
- Create: `ConfirmDialog.tsx`, `Toast.tsx`, `OverlayProvider.tsx`
- Test: `packages/ui/tests/overlays.test.tsx`

**Interfaces:**
- Produces:
  - `Dialog({ isOpen, onClose, title, children, sticky?: boolean, wide?: boolean })` — `.modal-backdrop > .modal[role=dialog][aria-modal][aria-labelledby]`, focus trap, Esc closes unless `sticky`, focus restored to the opener on close
  - `OverlayProvider` (renders toast region `.toast-region[aria-live=polite]` and the confirm dialog host); `useToast(): (message: string, isError?: boolean) => void` (auto-dismiss 3600 ms); `useConfirm(): (opts: { title; message; confirmLabel?; danger?: boolean }) => Promise<boolean>`
- [ ] **Step 1: Write failing tests:** Esc closes a normal dialog but not a `sticky` one; Tab from last focusable wraps to first; closing restores focus to the trigger; `useConfirm` resolves `true` on confirm and `false` on cancel/Esc; toast appears in the live region and is gone after 3600 ms (fake timers).
- [ ] **Step 2–4:** FAIL → implement → PASS.
- [ ] **Step 5: Commit** `feat(ui): add modal, confirm dialog and toasts`.

### Task 12: `@gunita/ui` — AppShell, Restricted, IdleLogout, LoginForm

**Files:**
- Rewrite: `AppShell.tsx`, `SidebarNav.tsx`, `TopBar.tsx`
- Create: `Restricted.tsx`, `IdleLogout.tsx`, `LoginForm.tsx`
- Test: `packages/ui/tests/shell.test.tsx`

**Interfaces:**
- Produces:
  - `NavItem = { label: string; short: string; href: string; icon: IconName }`
  - `AppShell({ navItems, currentPath, onNavigate, topBarProps, mobileNavCount?: number /*bottom nav items before "More" sheet*/, children })` — `.app > aside.sidebar + main.main(header.topbar + content)` and `nav.bottomnav`; sidebar collapse toggle stored under `gk-sidebar-collapsed` (try/catch), toggles `body.sidebar-collapsed`; `aria-current="page"` on the active link (matches by path prefix)
  - `TopBarProps = { title: string; userName: string; roleLabel: string; onLogout: () => void; statusSlot?: ReactNode; menuItems?: { label: string; onSelect: () => void }[] }`
  - `Restricted({ message, actionLabel, onAction })` — `.restricted.card` with alert icon, heading `Access restricted`
  - `IdleLogout({ timeoutMs, warnSeconds = 30, onLogout: (reason: "idle" | "manual") => void, warning?: ReactNode })` — listens to `mousemove keydown click touchstart scroll`; sticky dialog title `Still there?`, text `You'll be signed out in <n> s.`, buttons `Sign out now` / `Stay signed in`; `warning` renders above the buttons (POS pending-orders note)
  - `LoginForm({ roleLabel: "Owner" | "Barista", onSubmit: (identifier, password) => Promise<string | null /*error*/> })` — prototype login card (L56–107): `Email or username` field, password with eye toggle (`Show password`/`Hide password`), `Sign in`, inline error with `role="alert"`, loading state, lockout after 5 failures for 30 s with `Too many attempts — locked for 30 s.`
- [ ] **Step 1: Write failing tests:** active nav item has `aria-current="page"`; collapse toggle adds `sidebar-collapsed` to `body` and persists `"1"`; IdleLogout shows the warning after `timeoutMs`, counts down, calls `onLogout("idle")` at 0, and "Stay signed in" resets the timer; LoginForm shows the returned error and locks after 5 failures; eye toggle switches the input type.
- [ ] **Step 2–4:** FAIL → implement → PASS.
- [ ] **Step 5: Commit** `feat(ui): add app shell, restricted screen, idle logout and login form`.

### Task 13: Theme wiring in both apps + ADR

**Files:**
- Modify: `packages/config/tailwind.preset.js` (colors = `styles.css` tokens: `bg #0F1410, surface #151D16, card #1B251C, card2 #212C22, muted #2A362B, border #34433A, fg #EDE6D6, fgMuted #A9B3A3, moss #7FAE68, mossStrong #5C8A48, leaf #A7C98B, coffee #C08A4E, coffeeDeep #5A3B24, bark #3B2A1E, warn #D9A441, danger #E0715A`, under `gunita`; fonts `head/body/num/baybayin`)
- Modify: `packages/ui/src/tokens.ts` (same values), `packages/ui/package.json` (`exports["./styles.css"] = "./css/styles.css"`)
- Modify: `apps/admin/src/app/layout.tsx`, `apps/pos/src/app/layout.tsx` (import `@gunita/ui/styles.css` before `./globals.css`; `next/font/google` for Lora 600/700, Raleway 400/500/600, Fira Code 400/500/600, Noto Sans Tagalog 400 exposed as CSS variables `--font-head/--font-body/--font-num/--font-baybayin`; admin `<body className="owner-mode">`; remove light `bg-gray-50` classes)
- Modify: both `globals.css` (drop `--font-sans` Inter; keep `@tailwind` lines, set `preflight: false` in both `tailwind.config.ts` so Tailwind base doesn't override `styles.css`)
- Modify: `apps/pos/src/app/manifest.ts` (name `Gunita Kopi POS`, `theme_color`/`background_color` `#0F1410`, display standalone)
- Modify: `docs/decisions/0007-design-tokens-tailwind.md` (dark theme; status note "Amended 2026-11-16")
- [ ] **Step 1:** Implement the changes.
- [ ] **Step 2: Verify:** `pnpm --filter @gunita/admin build` and `pnpm --filter @gunita/pos build` → succeed (use `NEXT_PUBLIC_USE_MOCKS=true` and placeholder envs from `.env.example`); `pnpm --filter @gunita/admin dev`, open `/login` → dark background `#0F1410`, Lora heading font.
- [ ] **Step 3: Commit** `feat(ui): apply dark nature theme to both apps`.

### Task 14: Mock login, middleware, Restricted route (both apps)

**Files:**
- Create: `apps/{admin,pos}/src/lib/use-mocks.ts` (`export const USE_MOCKS = process.env.NEXT_PUBLIC_USE_MOCKS === "true"`), `src/lib/session.ts`, `src/app/restricted/page.tsx`, `src/features/auth/{api,mock,index}.ts`
- Modify: `apps/{admin,pos}/src/middleware.ts`, `src/app/(auth)/login/page.tsx`, `.env.example` (add `NEXT_PUBLIC_USE_MOCKS=true`), root `.env.example`
- Create: `apps/{admin,pos}/vitest.config.ts`, `src/test/setup.ts` (jest-dom, `vi.mock("next/navigation")`), `src/test/render.tsx` (`renderWithProviders(ui)` wrapping `QueryClientProvider` with retries off + `OverlayProvider`); add `"test": "vitest run"` scripts and dev deps (vitest, jsdom, testing-library, `@tanstack/react-query` as a dependency)
- Test: `apps/{admin,pos}/tests/middleware.test.ts`, `tests/login.test.tsx`

**Interfaces:**
- Consumes: `MOCK_SESSION_COOKIE`, `decodeMockSession`, `encodeMockSession` (Task 5), `LoginForm`, `Restricted` (Task 12)
- Produces:
  - `resolveRole(request: NextRequest, useMocks: boolean): Role | null` in `src/lib/session.ts` — mock cookie only when `useMocks`; else the existing Supabase token extraction (moved here unchanged)
  - Middleware: no role → redirect `/login?redirect=<path>`; wrong role → **rewrite** to `/restricted`; `/login` and `/restricted` public. POS drops the `owner_admin` cross-testing allowance.
  - `features/auth`: `signIn(identifier, password): Promise<MockSession>` (mock: `authenticate` from the app's mock db, wrong role → error `This is the Owner page. Please use the Barista POS for this account.` / `This is the Barista page. Please use the Owner portal for this account.`, inactive → `This account is inactive. Contact the administrator.`, bad creds → `Incorrect username or password.`; sets cookie `path=/; SameSite=Lax`), `signOut(): Promise<void>`, `getSession(): MockSession | null` (client cookie read); real `api.ts` keeps the Supabase calls
  - `/restricted` page: owner app message `This portal is only for the Owner account.` and signs the session out on mount; POS message `The Barista POS is only for barista accounts.`; button `Back to sign-in`
- [ ] **Step 1: Write failing tests:** middleware with valid mock cookie + `useMocks=false` → redirect to `/login`; with `useMocks=true` and role `barista` on admin → rewrite to `/restricted`; owner cookie on POS → `/restricted`; no cookie → `/login?redirect=%2Fdashboard`. Login: `barista/barista123` on admin shows the wrong-portal message; `owner/owner123` sets the cookie and calls `router.replace("/dashboard")` (POS: barista → `/pos`).
- [ ] **Step 2–4:** FAIL → implement → PASS.
- [ ] **Step 5: Commit** `feat(auth): add mock login, role middleware and restricted screen`.

### Task 15: Owner shell + data-layer plumbing

**Files:**
- Create: `apps/admin/src/lib/mock-db.ts`, `src/lib/query.tsx` (`QueryProvider`), `src/lib/data.ts`
- Modify: `apps/admin/src/app/(app)/layout.tsx`
- Test: `apps/admin/tests/shell.test.tsx`

**Interfaces:**
- Produces:
  - `mockRpc<T>(op: string, ...args: unknown[]): Promise<T>` in `src/lib/mock-db.ts` — `POST ${env.apiUrl}/api/mock/rpc` with `{ app: "owner", op, args }`; `{ok:false}` → throws `Error(error.message)`; network failure → throws `Error("Can't reach the demo data service on :3002. Is \`pnpm dev\` running?")`; throws `Error("Mock failure (<op>)")` when the URL has `?mockFail=<op>` (for error-state demos). Feature `mock.ts` files are thin wrappers over `mockRpc` (op names = `OwnerMockDb` method names).
  - `unwrap<T>(res: ApiResponse<T>): T` added to `src/lib/api-client.ts` (throws `Error(res.error?.message ?? "Request failed")`)
  - Feature folder pattern used by every later task: `features/<f>/types.ts` declares `interface <F>Data {…}`; `mock.ts` and `api.ts` each `export const data: <F>Data`; `index.ts` `export const <f>Data: <F>Data = USE_MOCKS ? mock.data : api.data`; hooks in `hooks/use-<f>.ts` with query keys `["<f>", …]`
  - Owner nav (exact order, labels/short): Dashboard/Home `/dashboard` home, Orders/Orders `/orders` receipt, Products/Menu `/products` cup, Inventory/Stock `/inventory` box, Suppliers/Suppliers `/suppliers` truck, Reports/Reports `/reports` chart, Users/Users `/users` users
  - Layout: `QueryProvider` + `OverlayProvider` + `AppShell` + `IdleLogout` (5 min) ; top bar user = session full name, role label `Owner`; menu items `Reset demo data` (mock only; confirm `Reset all demo data for both Owner and Barista?` → `mockRpc("reset")` → invalidate all queries → toast `Demo data reset.`) and `Sign out`
  - Owner queries for orders and dashboard use `refetchInterval: 5000` and `refetchOnWindowFocus: true` so barista orders appear without a manual reload
- [ ] **Step 1: Write failing tests:** layout renders 7 nav links in order with Dashboard `aria-current` on `/dashboard`; `Reset demo data` is absent when `USE_MOCKS` is false; `mockRpc` posts `{app:"owner", op:"listOrders", args:[{}]}` (mock `fetch`); `rpc network error shows service message` — `fetch` rejecting → error text `Can't reach the demo data service on :3002. Is \`pnpm dev\` running?`; `?mockFail=listOrders` rejects.
- [ ] **Step 2–4:** FAIL → implement → PASS.
- [ ] **Step 5: Commit** `feat(admin): add owner shell and mock data plumbing`.

### Task 16: POS shell, connectivity, cart store

**Files:**
- Create: `apps/pos/src/lib/mock-db.ts`, `src/lib/query.tsx`, `src/lib/connectivity.ts`, `src/features/pos/cart.store.ts`, `src/components/OfflineBanner.tsx`, `src/components/SyncIndicator.tsx`
- Modify: `apps/pos/src/app/(pos)/layout.tsx`, `apps/pos/package.json` (+ `zustand`)
- Test: `apps/pos/tests/cart.store.test.ts`, `tests/shell.test.tsx`

**Interfaces:**
- Consumes: `CartLine`, `addLine`, `lineTotal`, `orderTotal` (Task 3)
- Produces:
  - `mockRpc` (same contract as Task 15 but `app: "pos"`; ops = `PosMockDb` method names; `import type` only from `@gunita/mocks/pos`)
  - `useConnectivity(): { online: boolean; simulatedOffline: boolean; setSimulatedOffline(v: boolean): void }` — `online = navigator.onLine && !simulatedOffline`; simulated flag in memory only; mock `listCatalog`/sync calls throw `Error("Offline")` while `!online`
  - `useCartStore` (Zustand): `lines: CartLine[]`, `add(p: PosProduct)`, `increment(lineId)`, `decrement(lineId)` (removes at 1), `remove(lineId)`, `updateLine(lineId, patch: Partial<Pick<CartLine,"addons"|"customization"|"specialInstructions">>)`, `clear()`; selectors `selectTotal`, `selectCount` (Σ qty)
  - POS nav: POS/POS `/pos` cart, Orders/Orders `/orders` receipt, Inventory/Stock `/inventory` box
  - Layout: `OfflineBanner` text `Offline — orders are saved on this device` when `!online`; `SyncIndicator` shows `<n> to sync` + `Sync now` button (wired in Task 20; for now reads `getPendingSyncCount()`); menu items `Simulate offline` (mock only, toggles), `Reset demo data`, `Sign out`; `IdleLogout` with `warning` = `You have <n> unsynced order(s). They stay on this device and will sync after you sign in again.` when n > 0
- [ ] **Step 1: Write failing tests:** cart: add same product twice → 1 line qty 2; `updateLine` with an addon then `add` → 2 lines; `decrement` at qty 1 removes; `selectTotal` equals `orderTotal`. Shell: toggling `Simulate offline` shows the banner text; nav shows 3 links.
- [ ] **Step 2–4:** FAIL → implement → PASS.
- [ ] **Step 5: Commit** `feat(pos): add pos shell, connectivity and cart store`.

### Task 17: POS menu and cart panel (`/pos`)

**Files:**
- Create: `apps/pos/src/features/pos/{types,api,mock,index}.ts`, `hooks/use-catalog.ts`, `components/{MenuGrid,MenuItemTile,CategoryTabs,PosSearch,CartPanel,CartLineRow,CartFab}.tsx`
- Rewrite: `apps/pos/src/app/(pos)/pos/page.tsx`
- Test: `apps/pos/tests/pos-menu.test.tsx`

**Interfaces:**
- Produces:
  - `PosData.getCatalog(): Promise<{ products: PosProduct[]; ingredients: PosIngredient[]; settings: MockSettings; updatedAt: string }>`; `useCatalog()` (query key `["catalog"]`) — Task 20 adds the Dexie fallback inside `mock.ts`/`api.ts`
  - Screen per Barista guideline §8.2 and `pos.js:22-136`: `.pos-wrap` with `.pos-tools` (search debounced 200 ms, keeps focus; category tabs All + 4 with icons iced/cup/pastry/rice), `.menu-grid` of tiles (name, `menu-tag` description, `.price.num`), not-orderable tiles `sold-out`, `aria-disabled`, chip `Out of stock` or `Unavailable`; `.cart-panel` with lines (name, meta `+ Extra shot`, customization, notes; qty stepper; `Customize`; delete; line total), footer `Clear` (confirm `Clear all items?`) and `Charge ₱total` (disabled when empty); empty text `No items yet.`; on < 768 px the panel is a slide-up sheet opened by `.cart-fab` `Cart · N · ₱total`
- [ ] **Step 1: Write failing tests:** search `"ube"` shows only Iced Ube Latte; category `Rice Meals` filters; tapping an out-of-stock tile does nothing; tapping a tile twice → one line qty 2 and `Charge ₱290.00` for Iced Spanish Latte; `Clear` asks for confirmation and empties; empty cart shows `No items yet.` and Charge disabled.
- [ ] **Step 2–4:** FAIL → implement → PASS.
- [ ] **Step 5: Commit** `feat(pos): build menu grid and cart panel`.

### Task 18: POS customize modal

**Files:**
- Create: `apps/pos/src/features/pos/components/CustomizeModal.tsx`
- Test: `apps/pos/tests/customize.test.tsx`

**Interfaces:**
- Consumes: `addonsFor`, `QUICK_CHIPS` (Task 2), `useCartStore.updateLine` (Task 16)
- Produces: `CustomizeModal({ line: CartLine; product: PosProduct; stockById: Record<string, number>; onClose })` — add-on toggles (disabled ones show `Not enough stock`), quick chips append to customization (comma-separated, toggling removes), free-text `Customization` and `Special instructions` (rendered as text only), `Save`. Layout from `pos.js:138-187`.
- [ ] **Step 1: Write failing tests:** Hot Beverages product shows `Extra milk` but not syrups; selecting `Extra shot` + chip `Sugar 50%` + Save → the line has the addon, customization `Sugar 50%`, total increases by ₱25 × qty; a disabled add-on can't be toggled; `<b>hi</b>` in instructions renders literally.
- [ ] **Step 2–4:** FAIL → implement → PASS.
- [ ] **Step 5: Commit** `feat(pos): add customize item modal`.

### Task 19: POS payment, checkout to outbox, receipt

**Files:**
- Create: `apps/pos/src/features/pos/components/{PaymentModal,ReceiptModal}.tsx`, `features/pos/checkout.ts`
- Modify: `apps/pos/src/offline/outbox.ts` (store `provisionalNo`), `offline/db.ts` (version 2: add `provisionalNo` to `OutboxOrderRecord`, `meta` table `{key, value}` for the OFF counter)
- Test: `apps/pos/tests/checkout.test.tsx` (uses `fake-indexeddb/auto`)

**Interfaces:**
- Consumes: `computeChange`, `parseAmount`, `toOrderItems`, `provisionalQueueNo` (Task 3), `saveOrderToOutbox`, `Receipt` (Task 10)
- Produces:
  - `checkout(input: { lines: CartLine[]; type: "dine-in" | "take-out" | "pre-order"; paid: number; cashier: MockSession }): Promise<{ record: OutboxOrderRecord; order?: Order }>` — builds `CreateOrderRequest` with `clientTxId = crypto.randomUUID()`, `paymentMethod: "cash"`; saves to outbox first; if online runs `syncOutboxOrders()` (Task 20 wiring; until then calls it directly) and returns the synced `order`
  - `PaymentModal` (Barista guideline §8.2): Seg `Dine-in / Take-out / Pre-order`, `Total due`, method shown as `Cash`, `Amount paid` input `inputMode="decimal"`, live `Change`, error `Amount paid is less than the total.`, `Confirm` disabled while invalid or submitting
  - `ReceiptModal({ order or record, pendingSync })` with `Print` (`window.print()`) and `New order` (clears cart)
- [ ] **Step 1: Write failing tests:** `payment rejects empty and non-numeric amounts` — `""` and `"abc"` keep Confirm disabled; `"300"` for ₱290 shows Change `₱10.00`; `double confirm creates one outbox record` — two rapid clicks → one Dexie record; online checkout shows receipt with `20261116-A-` number and no `Pending sync`; offline checkout shows `OFF-001` and `Pending sync`; cart cleared after `New order`.
- [ ] **Step 2–4:** FAIL → implement → PASS.
- [ ] **Step 5: Commit** `feat(pos): add payment, checkout and receipt`.

### Task 20: POS offline catalog cache and sync

**Files:**
- Modify: `apps/pos/src/offline/db.ts` (version 3: `productsCache` holds full `PosProduct` incl. recipe, `ingredientsCache` holds `PosIngredient`, `meta` keys `catalogUpdatedAt`, `settings`), `offline/sync.ts`, `offline/triggers.ts`, `offline/outbox.ts`
- Create: `apps/pos/src/offline/catalog-cache.ts`, `src/features/pos/hooks/use-sync.ts`
- Modify: `features/pos/mock.ts`, `api.ts` (catalog falls back to cache), `components/SyncIndicator.tsx`
- Test: `apps/pos/tests/sync.test.ts`, `tests/catalog-cache.test.ts`

**Interfaces:**
- Produces:
  - `saveCatalog(c)`, `readCatalog(): Promise<Catalog | null>`; `getCatalog` = online → fetch + `saveCatalog`; offline or fetch error → `readCatalog()` (error if null: `No saved menu yet. Connect to the internet once to download it.`); UI shows `Last updated hh:mm`
  - `syncOutboxOrders()` sends via `posData.syncOrders(payload)` (mock → `PosMockDb.syncOrders`, api → `POST /api/sync`); on `synced`/`duplicate` stores the returned order number on the record (`orderNumber`) then marks `synced`; `failed` keeps `errorMessage`; never marks synced on thrown errors
  - `retryOrder(clientTxId)`, `discardOrder(clientTxId)` (marks `failed` record removed after confirm)
  - `useSync(): { pendingCount: number; failedCount: number; syncNow(): Promise<void>; isSyncing: boolean }` — triggers: `online` event, `visibilitychange` to visible, after checkout, manual; catalog refresh on login, reconnect and every 5 min while online
- [ ] **Step 1: Write failing tests:** offline checkout then going online syncs exactly once and the record gets a real `orderNumber`; a sync that throws leaves records `failed` (not `synced`); a server `failed` result (stock gone) keeps the reason and `retryOrder` resubmits; `getCatalog` offline returns cached products with `updatedAt`; with an empty cache offline it throws the exact message.
- [ ] **Step 2–4:** FAIL → implement → PASS.
- [ ] **Step 5: Commit** `feat(pos): add offline catalog cache and outbox sync`.

### Task 21: POS orders board and detail

**Files:**
- Create: `apps/pos/src/features/orders/{types,api,mock,index}.ts`, `hooks/use-orders.ts`, `components/{OrdersBoard,OrderRow,OrderDetail}.tsx`, `apps/pos/src/app/(pos)/orders/[orderId]/page.tsx`
- Rewrite: `apps/pos/src/app/(pos)/orders/page.tsx`
- Test: `apps/pos/tests/orders.test.tsx`

**Interfaces:**
- Produces: `OrdersData { list(f: OrderFilters): Promise<Order[]>; get(id): Promise<Order>; advance(id): Promise<Order>; cancel(id): Promise<Order> }`. `useOrders(f)` merges server orders with local outbox records not yet synced (shown with `orderNumber = provisionalNo` and a `Pending sync`/`Failed` badge; synced ones `Synced`). Filters: status chips (All/Pending/Preparing/Completed/Cancelled), date input, search (queue no./product). Detail (`app.js:473-550` style): lines + add-ons, payment (paid, change), `Advance status` (label `Start preparing` / `Mark completed`), `Cancel order` (danger, confirm `Cancel this order? Stock will be restored.`, only pending/preparing), `Reprint receipt`. Offline: advance/cancel buttons disabled with title `Available when online`. Failed outbox orders show the reason with `Retry` and `Discard`.
- [ ] **Step 1: Write failing tests:** list newest first; status chip `Completed` filters; search finds by queue number; advancing a pending order changes its chip to Preparing; cancel on a completed order is not offered; offline → advance disabled; a failed outbox record shows its error and `Retry`.
- [ ] **Step 2–4:** FAIL → implement → PASS.
- [ ] **Step 5: Commit** `feat(pos): build orders board and detail`.

### Task 22: POS inventory (list, stock in/out, history)

**Files:**
- Create: `apps/pos/src/features/inventory/{types,api,mock,index}.ts`, `hooks/use-inventory.ts`, `components/{IngredientList,StockForm,StockHistory}.tsx`, routes `apps/pos/src/app/(pos)/inventory/stock/page.tsx`, `inventory/history/page.tsx`
- Rewrite: `apps/pos/src/app/(pos)/inventory/page.tsx`
- Test: `apps/pos/tests/inventory.test.tsx`

**Interfaces:**
- Produces: `InventoryData { listIngredients(): Promise<PosIngredient[]>; createStock(req: CreateStockTransactionRequest): Promise<StockTransaction>; history(f): Promise<StockTransaction[]> }`. Subtabs `Ingredient List | Stock In/Out | Stock History`. List read-only (name, unit, current, reorder level, status chip) Out/Low first — no edit/delete/cost/supplier. Stock form: ingredient select showing current stock live, Seg `In / Out` → `stock_in`/`stock_out`, quantity > 0 (`inputMode="decimal"`), remarks; success toast `Stock updated.`; `?ing=<id>` preselects. History: date/time, ingredient, type label (`In, Out, Waste, Adjustment, Sale`), qty, remaining (`newStock`), by, remarks (`reason`); filters ingredient/type/date. Offline: form disabled with banner `Stock changes need a connection.` (offline stock queue is out of scope).
- [ ] **Step 1: Write failing tests:** list puts out-of-stock first and shows no `Unit cost` header; Out of 999999 shows `Cannot remove more than current stock.`; quantity `0` blocked; In 500 then History shows a new `In` row with remaining updated; a sale shows as `Sale` with remarks `Order …`.
- [ ] **Step 2–4:** FAIL → implement → PASS.
- [ ] **Step 5: Commit** `feat(pos): build inventory list, stock form and history`.

### Task 23: Owner suppliers

**Files:**
- Create: `apps/admin/src/features/suppliers/{types,api,mock,index}.ts`, `hooks/use-suppliers.ts`, `components/{SuppliersTable,SupplierModal}.tsx`
- Rewrite: `apps/admin/src/app/(app)/suppliers/page.tsx`
- Test: `apps/admin/tests/suppliers.test.tsx`

**Interfaces:**
- Produces: `SuppliersData { list; create(req: CreateSupplierRequest); update(id, patch); setActive(id, isActive) }`. Page header latin `gunita · suppliers`, action `Add supplier`. Table: name, contact person, number (`phone`), address, status chip, `Edit`, `Activate/Deactivate`. Modal: name (required), contact person, number, address; Zod validation.
- [ ] **Step 1: Write failing tests:** 6 rows with Panaderia `Inactive`; add supplier with empty name shows `Name is required`; deactivate flips the chip and toasts `Supplier deactivated.`; `?mockFail=suppliers` shows the error state with `Try again`.
- [ ] **Step 2–4:** FAIL → implement → PASS.
- [ ] **Step 5: Commit** `feat(admin): build suppliers screen`.

### Task 24: Owner inventory (list, modal, delete, stock form, history + CSV)

**Files:**
- Create: `apps/admin/src/features/inventory/{types,api,mock,index}.ts`, `hooks/use-inventory.ts`, `components/{IngredientTable,IngredientModal,StockForm,StockHistory}.tsx`, `src/lib/csv.ts`, routes `inventory/stock/page.tsx`, `inventory/history/page.tsx`
- Rewrite: `apps/admin/src/app/(app)/inventory/page.tsx`
- Test: `apps/admin/tests/inventory.test.tsx`, `tests/csv.test.ts`

**Interfaces:**
- Produces:
  - `toCsv(headers: string[], rows: (string | number)[][]): string` (RFC 4180 quoting, `\r\n`), `downloadCsv(filename, csv)`
  - `InventoryData { list; create(req: CreateIngredientRequest); update(id, patch); usedBy(id): Promise<{id; name}[]>; remove(id); createStock; history }`
  - Ingredient list (Owner guideline §8.5) with columns name, supplier, unit, current, reorder level, unit cost (`₱`), status chip, updated; header latin `gunita · inventory board`; modal fields name, unit Select `g | mL | pcs`, supplier Select (**active suppliers only**), reorder level, unit cost, stock; delete → confirm whose message lists products using it (`Used in: Iced Spanish Latte, …`) or `Not used in any recipe.`
  - Stock form/history as Task 22 plus `Export CSV` on history (filename `stock-history-YYYY-MM-DD.csv`, columns `Date/Time, Ingredient, Type, Qty, Remaining, By, Remarks`)
- [ ] **Step 1: Write failing tests:** `toCsv` quotes `a,"b"` as `"a,""b"""`; supplier select omits Panaderia; deleting Milk shows its products in the confirm; `Restock` link `?ing=i-milk` preselects milk on the stock form.
- [ ] **Step 2–4:** FAIL → implement → PASS.
- [ ] **Step 5: Commit** `feat(admin): build inventory screens with csv export`.

### Task 25: Owner products list and form

**Files:**
- Create: `apps/admin/src/features/products/{types,api,mock,index}.ts`, `hooks/use-products.ts`, `components/{ProductsTable,ProductForm,ImagePicker}.tsx`, routes `products/new/page.tsx`, `products/[id]/edit/page.tsx`
- Rewrite: `apps/admin/src/app/(app)/products/page.tsx`
- Test: `apps/admin/tests/products.test.tsx`

**Interfaces:**
- Produces: `ProductsData { list; get; create; update; setAvailability(id, isActive); remove; getRecipe(id); saveRecipe(id, req: UpdateRecipeRequest) }` (recipe methods used in Task 26). Subtabs `Product List | Recipe & Costing`. List: search + category filter, thumb, price, availability switch (saves instantly, toast), margin % (`profitMarginPercent`), edit/delete (confirm). Form (Zod): name, description, category Select (4), price > 0, available, image — `ImagePicker` resizes to max 512 px via canvas and stores a data URL in mock mode, `Remove image`. Port layout from `admin.js:25-154`.
- [ ] **Step 1: Write failing tests:** category filter `Pastries & Snacks`; toggling availability calls `setAvailability` and toasts; form rejects price `0` with `Price must be greater than 0`; delete asks for confirmation.
- [ ] **Step 2–4:** FAIL → implement → PASS.
- [ ] **Step 5: Commit** `feat(admin): build products list and form`.

### Task 26: Owner recipe & costing

**Files:**
- Create: `apps/admin/src/features/products/components/RecipeEditor.tsx`, route `products/[id]/recipe/page.tsx`, `app/(app)/costing/page.tsx` (redirect)
- Modify: `apps/admin/src/app/(app)/products/recipe-costing/page.tsx` (redirect to `/products/<first product id>/recipe`)
- Test: `apps/admin/tests/recipe.test.tsx`

**Interfaces:**
- Consumes: `computeCosting` (Task 4), `ProductsData.getRecipe/saveRecipe`
- Produces: `RecipeEditor({ productId })` per Owner guideline §8.4 and `admin.js:155-283`: product dropdown (navigates), rows (ingredient select, quantity with −/+ steppers step 1, unit, remove), `Add ingredient`, packaging cost with ±0.50 steppers, live totals (ingredient cost, packaging, total cost, margin `₱`, margin %), `Save` → toast `Recipe saved.` and invalidates `["products"]`.
- [ ] **Step 1: Write failing tests:** pressing + on beans updates ingredient cost live; packaging + adds 0.50; removing a row updates totals; Save persists (reload query shows new margin on the products list).
- [ ] **Step 2–4:** FAIL → implement → PASS.
- [ ] **Step 5: Commit** `feat(admin): build recipe and costing editor`.

### Task 27: Owner orders and detail

**Files:**
- Create: `apps/admin/src/features/orders/{types,api,mock,index}.ts`, `hooks/use-orders.ts`, `components/{OrdersTable,OrderDetail,ReceiptModal}.tsx`, route `orders/[orderId]/page.tsx`
- Rewrite: `apps/admin/src/app/(app)/orders/page.tsx`
- Test: `apps/admin/tests/orders.test.tsx`

**Interfaces:**
- Produces: same `OrdersData` shape as Task 21 (owner mock). Table: queue no., time, type, status chip, total, payment (`Cash` or `Unpaid`); filters status/date/search. Detail: lines + add-ons, cashier name, payment (method, paid, change), total, `Advance status`, `Cancel order` (confirm, restores stock; toast `Order cancelled. Stock restored.`), `Print receipt`.
- [ ] **Step 1: Write failing tests:** row click opens `/orders/<id>`; cancel then inventory query shows restored stock; completed order hides Cancel.
- [ ] **Step 2–4:** FAIL → implement → PASS.
- [ ] **Step 5: Commit** `feat(admin): build orders list and detail`.

### Task 28: Owner dashboard

**Files:**
- Create: `apps/admin/src/features/dashboard/{types,api,mock,index}.ts`, `hooks/use-dashboard.ts`, `components/{KpiRow,TopProducts,LowStockList,RecentOrders}.tsx`
- Rewrite: `apps/admin/src/app/(app)/dashboard/page.tsx`
- Test: `apps/admin/tests/dashboard.test.tsx`

**Interfaces:**
- Produces: `DashboardData { get(): Promise<OwnerDashboard> }`. KPIs `Today's sales`, `Orders today`, `Pending / preparing`; when `isFallbackDay` the KPI subtitle reads `Showing <formatted date> (no orders yet today)`. Top products `HBarChart` (empty `No sales yet today.`), low stock list (chip + name + stock + unit + `Restock` → `/inventory/stock?ing=<id>`, empty `All stock levels OK.`), recent 6 orders (row click → detail). Port from `app.js:329-376`.
- [ ] **Step 1: Write failing tests:** KPIs show formatted peso; fallback subtitle appears when the mock returns `isFallbackDay: true`; Restock link href correct; empty low-stock message.
- [ ] **Step 2–4:** FAIL → implement → PASS.
- [ ] **Step 5: Commit** `feat(admin): build owner dashboard`.

### Task 29: Owner reports + CSV

**Files:**
- Create: `apps/admin/src/features/reports/{types,api,mock,index}.ts`, `hooks/use-reports.ts`, `components/{DailyReport,MonthlyReport,BestSellers,StockStatusReport}.tsx`, routes `reports/daily|monthly|best|stock/page.tsx`
- Rewrite: `apps/admin/src/app/(app)/reports/page.tsx` (redirect `/reports/daily`)
- Test: `apps/admin/tests/reports.test.tsx`

**Interfaces:**
- Produces: `ReportsData { daily(); monthly(); bestSellers(from, to); stockStatus() }`. Subtabs `Daily Sales | Monthly Sales | Best Sellers | Stock Status`, each with `Export CSV` (filenames `daily-sales.csv`, `monthly-sales.csv`, `best-sellers-<from>-<to>.csv`, `stock-status.csv`). Daily/Monthly: `BarChart` + table (date/month, orders, total). Best Sellers: date-range inputs (default last 30 days), `HBarChart` + table (product, qty, revenue). Stock Status: all ingredients with chip. Port from `admin.js:550-703`.
- [ ] **Step 1: Write failing tests:** daily table rows match the mock; changing the best-sellers range refetches with new args; Export CSV calls `downloadCsv` with the expected header row.
- [ ] **Step 2–4:** FAIL → implement → PASS.
- [ ] **Step 5: Commit** `feat(admin): build reports with csv export`.

### Task 30: Owner users

**Files:**
- Create: `apps/admin/src/features/users/{types,api,mock,index}.ts`, `hooks/use-users.ts`, `components/{UsersTable,UserForm}.tsx`, routes `users/new/page.tsx`, `users/[id]/edit/page.tsx`
- Rewrite: `apps/admin/src/app/(app)/users/page.tsx`
- Test: `apps/admin/tests/users.test.tsx`

**Interfaces:**
- Consumes: `checkUserChange` (Task 4)
- Produces: `UsersData { list; create(req); update(id, patch) }`. Table: full name (+ ` (you)`), username, email, role label (`Owner`/`Barista`), status chip, date created, `Edit`, `Activate/Deactivate` (hidden for yourself; confirm `Deactivate <name>? They will not be able to sign in.`). Form (Zod): full name, username (min 3, **disabled on edit**), email, password (new: min 8 per `CreateEmployeeRequestSchema`; edit: blank = keep), role Select, active switch. Guard runs client-side (toast the rule message) and the mock enforces it too.
- [ ] **Step 1: Write failing tests:** own row shows `(you)` and no Deactivate; `edit form cannot demote last owner` — changing the only owner's role to Barista and saving shows toast `At least one active Owner must remain.` and nothing changes; username input disabled on edit; new user with 5-char password shows the min-length error.
- [ ] **Step 2–4:** FAIL → implement → PASS.
- [ ] **Step 5: Commit** `feat(admin): build users screens with last-owner guard`.

### Task 31: Clean-up, docs, full verification

**Files:**
- Move (git mv): `apps/admin/{owner.html,app.js,admin.js,store.js}` → `docs/prototype/`; `apps/pos/{barista.html,pos.js}` → `docs/prototype/`; delete the duplicate `apps/pos/app.js`, `apps/pos/store.js` (identical to the admin copies — verify with `diff` first)
- Modify: every `apps/*/src/features/*/README.md` (describe files actually present), `docs/architecture/*_GUIDELINE.md` §13/§14 (mark Q-items `Decided: …` per spec §13), prototype references → `docs/prototype/`, `README.md` (how to run with mocks: `NEXT_PUBLIC_USE_MOCKS=true`, demo accounts)
- [ ] **Step 1:** Apply the moves and doc edits.
- [ ] **Step 2: Verify:** `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build` → all PASS. Manually with `pnpm dev`: owner `owner/owner123` at `:3000` and barista `barista/barista123` at `:3001` complete one checkout online and confirm it appears in the owner's Orders and Dashboard within 5 s, one with `Simulate offline` then sync (also appears for the owner), cancel an order from the owner side and see it Cancelled on the barista board, edit a recipe; restart `pnpm dev` and confirm the orders are still there; check 360 px and 1280 px widths; no console errors.
- [ ] **Step 3:** Run `graphify update .` to refresh the knowledge graph.
- [ ] **Step 4: Commit** `chore: move prototype to docs, update readmes and guidelines`.
