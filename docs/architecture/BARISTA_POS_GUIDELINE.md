# Gunita Coffee POS — CASHIER / BARISTA System (Front-End Guideline)

> **Scope:** This file covers **only** the Cashier/Barista POS at `pos.gunitacoffee.com` (role `barista`).
> The Owner/Admin dashboard is a **separate system** with its own file: `OWNER_ADMIN_GUIDELINE.md`. Don't mix them.
>
> **How to use:** Keep this file + `database_table.jpg` + `cloud_devops_architecture.jpg` + the prototype zip in the project root. Then say: *"Read `BARISTA_POS_GUIDELINE.md` and build Phase N."*

---

## 1. What this system is

A **fast, touch-friendly, offline-capable point-of-sale** used at the counter to take orders, collect cash, print receipts, move orders through the queue, and record stock in/out.

| Item | Value |
|---|---|
| URL | `pos.gunitacoffee.com` |
| Role allowed | `barista` only |
| Device | **Tablet / phone / small counter screen first**; must also work on desktop |
| Connectivity | **Works offline** (installable PWA). Orders queue locally and sync when back online |
| Landing page | `/pos` |
| Hosting / backend | Vercel (Next.js full runtime) + Supabase (Auth, Postgres, RLS, Postgres functions) |

**Out of scope for this system:** product/recipe/costing management, suppliers, users, reports, dashboard KPIs of sales (Owner system).

---

## 2. Source materials & priority

| Material | Defines | Priority |
|---|---|---|
| `database_table.jpg` | Tables, columns, relationships | Data model wins |
| `cloud_devops_architecture.jpg` | Offline sync, hosting, auth, security | Architecture wins |
| Prototype zip → `barista.html`, `js/pos.js`, `js/app.js` (Orders, shell), `js/admin.js` (Inventory part), `js/store.js`, `css/styles.css` | Screens, UX, rules, look | UI/UX + rules win; code is reference only |

If they disagree, follow ERD/architecture and record it in §13.

---

## 3. Tech stack

Next.js (App Router) · TypeScript strict · Tailwind (tokens in §5) · `@supabase/supabase-js` + `@supabase/ssr` · **Zustand** (cart) · TanStack Query · React Hook Form + Zod · **`idb`** (IndexedDB) · **Serwist** (service worker/PWA) · `lucide-react` · Vitest + RTL · Playwright.

**Do not:** use `localStorage` for orders/catalog (use IndexedDB) · cache auth or sensitive API responses in the service worker · expose the `service_role` key · mark an order "synced" before the server confirms · allow public sign-up.

---

## 4. Access control (Barista system)

1. Middleware checks host + session; only `barista` allowed. An owner account here sees the **"Restricted"** screen.
2. Server re-checks role on every Route Handler (`/api/orders`, `/api/sync`, stock endpoints). RLS enforces least privilege.
3. **Barista can:** create orders, advance/cancel orders (Pending/Preparing only), view orders, view inventory, record **Stock In/Out**.
4. **Barista cannot:** edit products/prices/recipes, manage suppliers/users, view reports/costing/margins, delete anything master-data.
5. **Idle auto-logout** (default 5 min): "Still there?" modal with countdown → **Stay signed in** / **Sign out now**. ⚠️ Never sign out while there are **unsynced pending orders** without a clear warning — the queue stays on the device and resumes after next login.
6. Local dev host: `pos.localhost:3000`.

---

## 5. Design system (from `css/styles.css`)

Dark nature theme. The Barista app uses the **default (non owner-mode)** sizes: slightly larger headings (h1 1.75rem · h2 1.35rem · h3 1.1rem), **bigger touch targets**.

```css
:root{
  --bg:#0F1410; --surface:#151D16; --card:#1B251C; --card-2:#212C22;
  --muted:#2A362B; --border:#34433A;
  --fg:#EDE6D6; --fg-muted:#A9B3A3;
  --moss:#7FAE68; --moss-strong:#5C8A48; --leaf:#A7C98B;
  --coffee:#C08A4E; --coffee-deep:#5A3B24; --bark:#3B2A1E;
  --warn:#D9A441; --danger:#E0715A; --ring:#A7C98B; --radius:14px;
}
```

Fonts: Lora (headings) · Raleway (body) · **Fira Code** for prices/qty/queue numbers · Noto Sans Tagalog for the Baybayin kicker **ᜄᜓᜈᜒᜆ**.
Currency `₱1,234.50`; dates `Nov 3, 2026 2:22 PM`.

POS-specific UX:
- Touch targets **≥ 44px**; `inputmode="decimal"` on money fields; no hover-only actions.
- Layout: **menu grid (left) + cart panel (right)** on tablet/desktop. On phones the cart is a **slide-up panel** opened by a floating button **"Cart · N · ₱total"**.
- Bottom nav on mobile: **POS · Orders · Stock**. Sidebar (collapsible) on ≥768px.
- Category tabs with icons: Iced (iced cup) · Hot (cup) · Pastries (pastry) · Rice (bowl).
- Always visible: **OfflineBanner** + **pending-sync indicator** (see §8).
- Components: MenuItem tile · CartLine · Seg (aria-pressed) · Chip (ok/low/out) · Modal · ConfirmDialog · Toast · Receipt · Banner · EmptyState.
- A11y: focus ring, labelled dialogs, `aria-live` toasts, reduced-motion.

---

## 6. Navigation & routes

| Label (mobile) | Route | Notes |
|---|---|---|
| POS | `/pos` | **Home** |
| Orders | `/orders`, `/orders/[orderId]` | queue board + detail |
| Inventory (Stock) | `/inventory`, `/inventory/stock`, `/inventory/history` | view + stock in/out |
| Login | `/login` | public |

There is **no** dashboard, products, suppliers, reports or users route in this app.

---

## 7. Data this system uses (ERD → types)

```ts
type OrderType = 'Dine-in' | 'Take-out' | 'Pre-order';
type OrderStatus = 'Pending' | 'Preparing' | 'Completed' | 'Cancelled';

products             { product_id, product_name, description, category, price, is_available, image }
product_ingredients  { product_id, ingredient_id, quantity_needed }        // read-only, for stock checks
ingredients          { ingredient_id, ingredient_name, unit, current_stock, reorder_level }   // read + stock tx
stock_transactions   { stock_trans_id, ingredient_id, user_id, type('in'|'out'), quantity, remaining_stock, date_time, remarks }
orders               { order_line_id, order_id, user_id, product_id, is_addon, ingredient_id, quantity,
                       unit_price, subtotal, order_type, order_date, status, customization, special_instructions }
payments             { payment_id, order_id, amount_paid, payment_method, date_time, received_by, change_amount }
```

- **One row per line item** in `orders`; add-ons are rows with `is_addon = 1` + `ingredient_id`.
- The barista **never** needs `unit_cost`, `product_costing`, margins or supplier data → don't fetch or show them (least privilege).
- Generate types via `supabase gen types typescript`.

**Add-on catalogue** (business rule, not a table):

| Add-on | Ingredient | Qty used | Price | Applies to |
|---|---|---|---|---|
| Extra shot | beans | 18 g | ₱25 | Iced, Hot (only if recipe has beans) |
| Caramel syrup | caramel | 15 mL | ₱15 | Iced |
| Vanilla syrup | vanilla | 15 mL | ₱15 | Iced |
| Hazelnut syrup | hazelnut | 15 mL | ₱15 | Iced |
| Extra milk | milk | 60 mL | ₱15 | Iced, Hot |
| Extra rice | rice | 150 g | ₱20 | Rice Meals |
| Extra egg | egg | 1 pc | ₱15 | Rice Meals |

Add-ons are **disabled** when stock < the add-on quantity.

---

## 8. Screen specifications

### 8.1 Login
Email/username + password, show/hide toggle, inline error, loading state, no sign-up. After login: download/refresh the **catalog cache** (see §9) before showing the POS.

### 8.2 POS (`/pos`) — the main screen
**Top tools:** search box (debounced, keeps focus) + category tabs (All + 4).
**Menu grid:** tile = icon/image, name, short description, price (`.num`). States:
- **Unavailable** (`is_available=false`) or **not orderable** (any recipe ingredient short, rule R2) → greyed, not tappable, small reason chip ("Out of stock").
**Tap tile** → add line; an identical *plain* line (no add-ons/customization/notes) just increments qty.

**Cart panel:** each line shows name, meta (`+ Extra shot`, customization, notes), qty stepper (− removes at 1 → delete), **Customize**, delete, line total. Footer: **Clear** (confirm) and **Charge ₱total** (disabled when empty). Empty state: "No items yet."

**Customize Item modal:** add-ons toggles (valid for category, disabled if stock short) · quick chips per category (e.g. *Sugar 25/50/75%*, *Less ice*, *Extra hot*, *Heated*, *Scrambled egg*, *Sunny side up*) · free-text **customization** and **special instructions** · Save.

**Payment modal:** order type seg (Dine-in / Take-out / Pre-order) · **Total due** · payment method (Cash) · **Amount paid** · live **Change** · error if paid < total (R9) · Confirm.

**Receipt modal:** shop name, **queue number**, date/time, cashier, lines + add-ons, total, paid, change, footer *"Salamat po! Come again."*, **Print** (CSS print stylesheet, 58/80 mm friendly) and **New order**. If created offline, show a **"Pending sync"** badge on the receipt.

### 8.3 Orders (`/orders`)
- Queue board, newest first, grouped by `order_id`. Filters: status chips (Pending/Preparing/Completed/Cancelled), date, search (queue no./product).
- Row: queue no., type, status chip, time, total, **sync badge** (Pending sync / Synced / Failed).
- **Detail:** lines + add-ons, payment info, **Advance status** (Pending → Preparing → Completed), **Cancel order** (danger + confirm; only Pending/Preparing; restores stock R4), **Reprint receipt**.
- Offline: status changes and cancels are queued too (see §9) and shown as pending.

### 8.4 Inventory (`/inventory`)
- **Ingredient list (read-only):** name, unit, current stock, reorder level, status chip; Out/Low first.
- **Stock In/Out (`/inventory/stock`):** ingredient select (shows current stock), type In/Out, quantity > 0, remarks (e.g. *Delivery*) → creates `stock_transactions`. Out cannot exceed current stock.
- **Stock History:** date/time, ingredient, type, qty, remaining, by, remarks; filter by ingredient/type/date.
- Baristas may add a basic ingredient (name, unit, existing active supplier, reorder level, and opening stock). They cannot create suppliers, view supplier contact details, set unit cost/add-on settings, or edit/delete ingredients.

---

## 9. Offline-first design (core of this system)

**Pieces**
1. **Service worker (Serwist):** caches **app shell + static assets only**. Never cache auth, admin or sensitive API responses.
2. **IndexedDB (`idb`) stores:**
   - `catalog` → products, recipes (qty needed), add-on rules, ingredient stock snapshot, settings (shop name, receipt footer, queue prefix).
   - `pending_orders` → `{ client_txn_id, payload, created_at, status: 'pending'|'syncing'|'synced'|'failed', error? }`
   - `pending_actions` → queued status changes/cancels/stock txs with their own `client_txn_id`.
3. **Sync triggers:** `online` event · Background Sync (where supported) · **app reopen / tab visible** · manual **"Sync now"** button. (Background Sync is not available on every browser — the other triggers are mandatory fallbacks.)

**Flow**
```
1 Create order        → POS uses cached catalog
2 Save locally        → IndexedDB pending_orders (unique client_txn_id = UUID)
3 Connection returns  → sync trigger fires
4 POST /api/sync      → server verifies user + validates payload
5 Server commits ONCE → checks current stock/prices, writes orders + payment + stock OUT atomically
                        (idempotent on client_txn_id) → returns result
6 Client marks 'synced' ONLY after the server confirms the DB commit
```

**Rules**
- Offline orders are **provisional**. Show a **Pending sync** badge everywhere they appear.
- **Never** mark synced before server confirmation. **Never** create duplicates on retry (idempotency key).
- **Conflicts are visible:** server rejects an item (now out of stock / price changed) → status `failed`, show the reason, let the barista **edit & resubmit** or **cancel**. Never silently drop.
- **Queue numbers:** online → server issues `YYYYMMDD-A-###` atomically (resets daily). Offline → show provisional `OFF-###`; replace with the real number after sync and update the receipt reprint.
- Stock shown offline is a **snapshot**; show "Last updated hh:mm" and re-check on sync.
- **OfflineBanner:** *"Offline — orders are saved on this device"* (`navigator.onLine === false`). Topbar shows **pending count** (e.g. "3 to sync").
- Refresh catalog on login, on reconnect, and every few minutes while online and idle.
- Logout with pending items → warn first; queue persists on the device.
- PWA: `manifest` (name *Gunita Kopi POS*, standalone, dark theme color `#0F1410`), icons 192/512, installable prompt.

---

## 10. Business rules the Barista system owns

| # | Rule |
|---|---|
| R1 | Status flow `Pending → Preparing → Completed`; `Cancelled` only from Pending/Preparing; Completed can never be cancelled. |
| R2 | Product orderable only if `is_available` **and** stock ≥ `quantity_needed` for **every** recipe ingredient. |
| R3 | **Checkout deducts stock**: recipe qty × quantity per line + add-on qty; one `stock_transactions` row per ingredient (`type='out'`, remarks `Order <queue no>`). |
| R4 | Cancel restores stock via `type='in'` rows (remarks `Cancelled <queue no>`). |
| R5 | Stock never below 0. |
| R6 | Status: `≤ 0` Out · `≤ reorder_level` Low · else In Stock. |
| R8 | Line total = `(price + Σ add-on prices) × qty`; order total = Σ lines. |
| R9 | `change = amount_paid − total`; reject if paid < total. |
| R10 | Queue number format & daily reset (server authority; provisional offline). |
| R-B1 | Same plain line merges (qty++), customized lines stay separate. |

R3, R4, R9, R10 are **enforced server-side** (Postgres functions / Route Handlers). The client only previews them for speed and offline use.

---

## 11. State & data layer

- **Cart:** Zustand store (`cart.store.ts`) — lines, add/remove/qty, totals via `lib/business/*` (pure functions, unit-tested). Persist cart in memory only; clear after successful save.
- **Server data:** TanStack Query for orders/inventory when online; **offline reads come from IndexedDB** (`lib/offline/*`). Wrap in hooks like `useCatalog()`, `useOrders()` that pick the source transparently.
- `lib/offline/`: `db.ts` (schema/migrations), `catalog-cache.ts`, `queue.ts` (enqueue/dequeue/retry/backoff), `sync.ts` (runner + triggers), `idempotency.ts` (UUID).
- Components never call Supabase directly.
- Replace prototype `GKStore`: `placeOrder` → `queue.enqueueOrder` + `/api/sync`; `setOrderStatus/cancelOrder/stockTx` → API + queue; `toast/openModal/confirmDialog` → React components.

---

## 12. Folder structure, DevOps, security

```
src/app/
  (auth)/login/
  (pos)/layout.tsx              # shell + barista guard + OfflineBanner + IdleLogout + SyncProvider
  (pos)/pos/ orders/ inventory/
  api/sync/route.ts  api/orders/route.ts  api/stock/route.ts
  manifest.ts
src/components/ui/ layout/ pos/ orders/ inventory/
src/lib/(supabase, auth, offline, business, format)  src/stores/  src/hooks/  src/schemas/  src/types/
supabase/migrations/
```

- GitHub + PRs; Actions: lint → `tsc --noEmit` → unit tests → `next build`; Vercel preview/prod after checks; versioned SQL migrations.
- Env: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (server only).
- HTTPS/TLS, secure cookies, escape user text (customization/instructions render as text only), no secrets in client bundle.

---

## 13. Open questions (decide before the related phase)

| # | Topic | Suggested default |
|---|---|---|
| Q1/Q2 | `orders.order_id` INT vs `YYYYMMDD-A-###` | Add `queue_no` column; keep `order_id` internal |
| Q3 | Offline queue numbers | Provisional `OFF-###`, real number after sync |
| Q4 | Idempotency key missing in ERD | Add `client_txn_id UUID UNIQUE` on `orders` (or sync-log table) |
| Q5 | `users.password` in ERD | Remove; link to `auth.users.id` |
| Q6 | Login by username vs email | Email login, `username` as display handle |
| Q7 | Stock type casing | Follow ERD (lowercase) |
| Q8 | Role names | `barista` / `owner_admin` |
| Q9 | Payment methods | Cash only v1; field stays extensible (GCash later) |
| Q12 | Prototype lets barista edit/delete ingredients | Barista = view + Stock In/Out only |
| Q14 | Offline status changes/cancels | Queue them in `pending_actions`; resolve conflicts on sync |
| Q15 | Receipt printing | Browser print (CSS) v1; thermal/Bluetooth later |

Mark answered items **Decided: …** instead of deleting.

---

## 14. Build phases (Barista system)

- [ ] **B0 Setup:** Next.js/TS/Tailwind, tokens, fonts, Supabase clients, env, CI.
- [ ] **B1 Design system + shell:** touch-friendly components, sidebar + bottom nav, modal/toast/confirm, OfflineBanner.
- [ ] **B2 Auth:** login, host middleware, role guard, Restricted screen, idle logout (with pending-queue warning).
- [ ] **B3 POS online:** menu grid, search/category, cart (Zustand), customize modal, payment modal, receipt/print, checkout via `/api/orders`.
- [ ] **B4 Orders:** board, filters, detail, advance status, cancel (restores stock), reprint.
- [ ] **B5 Inventory (barista scope):** read-only list, Stock In/Out, Stock History.
- [ ] **B6 PWA shell:** manifest, icons, service worker (shell/static only), install prompt.
- [ ] **B7 Offline data:** IndexedDB catalog cache + login refresh + "Last updated" + offline reads.
- [ ] **B8 Offline queue + sync:** `pending_orders`, `client_txn_id`, `/api/sync`, triggers (online/background/reopen/manual), badges, pending count.
- [ ] **B9 Conflicts & edge cases:** failed-order UI (edit/resubmit/cancel), duplicate-retry safety, offline cancel/status queue, provisional queue numbers.
- [ ] **B10 Hardening:** a11y, Playwright (checkout, **offline → reconnect → sync once**, duplicate retry, role block), perf on low-end tablet, deploy.

**Definition of Done per phase:** compiles, works at 360px–1280px, ≥44px touch targets, keyboard-accessible, loading/empty/error states, no console errors, rules in §10 unit-tested.

**Minimum tests:** add-on pricing (R8) · change calc (R9) · orderable check (R2) · plain-line merge (R-B1) · queue-number format (R10) · idempotent sync (no duplicates) · offline enqueue → sync success/failure · role redirect.

---

## 15. Prompt templates

**Start a phase:** *Read `BARISTA_POS_GUIDELINE.md`, the ERD, architecture and prototype. Build **Phase B#**. Follow §5 design, §9 offline rules and §10 business rules. List assumptions and update §13.*

**One screen:** *Using §8.X build `<screen>` at `<route>` for the Barista app, matching the prototype in `js/pos.js` / `js/app.js`. Mobile-first, touch targets ≥44px, loading/empty/error states, works with offline data source.*

**Review:** *Review this code against §4 (access), §9 (offline) and §10 (rules). Report violations only.*
