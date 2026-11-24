# Gunita Coffee POS — OWNER / ADMIN System (Front-End Guideline)

> **Scope:** This file covers **only** the Owner/Admin web dashboard at `admin.gunitacoffee.com` (role `owner_admin`).
> The Cashier/Barista POS is a **separate system** with its own file: `BARISTA_POS_GUIDELINE.md`. Don't mix them.
>
> **How to use:** Keep this file + `database_table.jpg` + `cloud_devops_architecture.jpg` + the prototype zip in the project root. Then say: *"Read `OWNER_ADMIN_GUIDELINE.md` and build Phase N."*

---

## 1. What this system is

A **browser dashboard** for the shop owner to manage the menu, recipes/costing, inventory, suppliers, staff accounts, orders and sales reports.

| Item | Value |
|---|---|
| URL | `admin.gunitacoffee.com` |
| Role allowed | `owner_admin` only |
| Device | Desktop/laptop first; tablet and phone must still work |
| Connectivity | **Online required.** No offline mode, no PWA install, no queued writes |
| Landing page | `/dashboard` |
| Hosting / backend | Vercel (Next.js full runtime) + Supabase (Auth, Postgres, Storage, RLS) |

**Out of scope for this system:** the POS cart/checkout screen, offline queue, IndexedDB, service worker. (Those belong to the Barista system.)

---

## 2. Source materials & priority

| Material | Defines | Priority |
|---|---|---|
| `database_table.jpg` | Tables, columns, relationships | Data model wins |
| `cloud_devops_architecture.jpg` | Hosting, auth, security, CI/CD | Architecture wins |
| Prototype zip → `owner.html`, `js/app.js`, `js/admin.js`, `js/store.js`, `css/styles.css` | Screens, UX, business rules, look | UI/UX + rules win; code is reference only |

If they disagree, follow ERD/architecture and record it in §14.

---

## 3. Tech stack

Next.js (App Router) · TypeScript strict · Tailwind (tokens in §5) · `@supabase/supabase-js` + `@supabase/ssr` · TanStack Query · React Hook Form + Zod · Recharts or custom SVG charts · `lucide-react` · Vitest + RTL · Playwright · ESLint/Prettier.

**Do not:** use `localStorage` for business data · expose the `service_role` key · allow public sign-up · register a service worker for this app · cache admin API responses anywhere.

---

## 4. Access control (Owner system)

1. **Middleware** checks host + session. Only `owner_admin` may enter. A barista account logging in here sees the prototype's **"Restricted"** screen and is signed out.
2. **Every Route Handler / Server Action re-checks the role** server-side. Hidden buttons are never security.
3. **Supabase RLS**: owner policies on all master-data tables; least privilege.
4. **Admin MFA** (TOTP) required for owner accounts.
5. **Audit log** entries for: price changes, product/ingredient delete, stock adjustments, user create/role/activate/deactivate, order cancel.
6. **Idle auto-logout** (30 min; the POS uses 8 h, decided 2026-11-24): "Still there?" modal with seconds countdown → **Stay signed in** / **Sign out now**.
7. Local dev host: `admin.localhost:3000`.

---

## 5. Design system (from `css/styles.css`)

Dark nature theme (green + coffee brown). The Owner app uses the prototype's **`owner-mode`** variant: slightly smaller headings and a **wide** layout.

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

| Use | Font |
|---|---|
| Headings/brand | Lora 600/700 |
| Body | Raleway 400/500/600 |
| Numbers, prices, queue no. | Fira Code (`.num`) |
| Baybayin kicker | Noto Sans Tagalog |

- Heading sizes (owner-mode): h1 1.55rem · h2 1.2rem · h3 1rem.
- Page header = Baybayin kicker (**ᜄᜓᜈᜒᜆ**) + small Latin caption (e.g. `gunita · admin`, `gunita · inventory board`) + title + right-aligned action buttons.
- Currency `₱1,234.50` (`en-PH`, 2 decimals). Dates `Nov 3, 2026 2:22 PM`.
- Layout: left sidebar 240px (collapsible to 72px icons-only, remembered per device) · content max-width ~1600px · tables inside a horizontal-scroll wrapper · mobile (<768px) uses a bottom nav with short labels.
- Components: Button (primary/coffee/danger-outline/ghost/sm) · Card · Chip (ok/low/out/coffee/moss) · Field · Table · Subtabs · Modal (focus trap, Esc, restore focus) · ConfirmDialog (promise-style) · Toast (aria-live, ~3.6 s) · KPI card · Bar/H-bar chart · EmptyState · Skeleton.
- A11y: visible focus ring, labelled dialogs, `aria-current="page"`, `prefers-reduced-motion` respected.

---

## 6. Navigation & routes

| Sidebar label (mobile short) | Route | Sub-pages |
|---|---|---|
| Dashboard (Home) | `/dashboard` | — |
| Orders | `/orders` | `/orders/[orderId]` |
| Products (Menu) | `/products` | `/products/new`, `/products/[id]/edit`, `/products/[id]/recipe` (**Recipe & Costing**) |
| Inventory (Stock) | `/inventory` | `/inventory/stock` (Stock In/Out), `/inventory/history` |
| Suppliers | `/suppliers` | add/edit modal |
| Reports | `/reports/daily` · `/monthly` · `/best` · `/stock` | — |
| Users | `/users` | `/users/new`, `/users/[id]/edit` |

`/login` is public. `/costing` redirects to `/products/.../recipe`. Sub-tabs: **Products** = Product List | Recipe & Costing · **Inventory** = Ingredient List | Stock In/Out | Stock History.

---

## 7. Data the Owner system uses (ERD → types)

```ts
type Role = 'owner_admin' | 'barista';
type Status = 'Active' | 'Inactive';
type OrderStatus = 'Pending' | 'Preparing' | 'Completed' | 'Cancelled';

suppliers            { supplier_id, supplier_name, contact_person, contact_number, address, status }
ingredients          { ingredient_id, supplier_id, ingredient_name, unit('g'|'mL'|'pcs'), current_stock,
                       reorder_level, unit_cost, date_updated }
stock_transactions   { stock_trans_id, ingredient_id, user_id, type('in'|'out'), quantity,
                       remaining_stock, date_time, remarks }
products             { product_id, product_name, description, category, price, is_available,
                       image, date_created, created_by }
product_ingredients  { product_ingredient_id, product_id, ingredient_id, quantity_needed }   // recipe
product_costing      { costing_id, product_id, ingredient_cost, packaging_cost, total_cost, date_updated }
orders               { order_line_id, order_id, user_id, product_id, is_addon, ingredient_id, quantity,
                       unit_price, subtotal, order_type, order_date, status, customization, special_instructions }
payments             { payment_id, order_id, amount_paid, payment_method, date_time, received_by, change_amount }
users                { user_id, username, full_name, role, status, date_created }   // no password in app table
```

Categories: `Iced Coffee Drinks`, `Hot Beverages`, `Pastries & Snacks`, `Rice Meals`.
Add-ons are rows in `orders` with `is_addon = 1` + `ingredient_id`.
Generate DB types with `supabase gen types typescript`; never hand-edit them.

---

## 8. Screen specifications

### 8.1 Login
Email/username + password, show/hide eye toggle, inline error, loading state, **no sign-up link**, MFA step for owners.

### 8.2 Dashboard
- **KPI cards:** *Today's sales* (₱) · *Orders today* · *Pending / preparing*.
- If there are no orders today, fall back to the **latest day that has orders** (prototype behavior) and label the date.
- **Top products today** (horizontal bars, top 5 by qty) — "No sales yet today." when empty.
- **Low stock alerts:** chip (Low/Out) + ingredient + current stock + unit + **Restock** button → `/inventory/stock?ing=<id>`. Empty: "All stock levels OK."
- **Recent orders** (6): queue no., time, type, status chip, total, payment method (or "Unpaid"). Row click → order detail.

### 8.3 Orders
- Grouped by `order_id`, newest first. Filters: **status** (all/Pending/Preparing/Completed/Cancelled), **date**, **search** (queue no. or product name).
- **Detail:** all lines + add-ons, cashier name, payment (method, paid, change), total.
  - Button **Advance status**: Pending → Preparing → Completed.
  - **Cancel order** (danger + confirm) only while Pending/Preparing → restores stock (rule R4).
  - **Print/reprint receipt** modal.

### 8.4 Products
**Product List:** search + category filter · image thumb · price · **availability toggle** (saves instantly) · margin % · edit/delete (delete = confirm).
**Product form:** name, description, category, price, available, **image upload** (resize client-side → Supabase Storage → store path), remove image. Validate with Zod.
**Recipe & Costing** (`/products/[id]/recipe`):
- Product dropdown switches product.
- Rows: ingredient select + quantity with −/+ steppers + remove; **Add ingredient**.
- **Packaging cost** with ±0.50 steppers.
- Live totals: ingredient cost, packaging, **total cost**, **margin = price − total cost**, margin %.
- **Save** replaces the product's recipe rows and recomputes `product_costing` (server-side).

### 8.5 Inventory
- **Ingredient List:** Out/Low first. Columns: name, supplier, unit, current stock, reorder level, unit cost, status chip (In/Low/Out), updated. Add/Edit modal (name, unit g/mL/pcs, **Active suppliers only**, reorder level, unit cost, stock). Delete → confirm dialog **listing products that use it** (R11).
- **Stock In/Out:** ingredient select (shows current stock live), type In/Out, quantity > 0, remarks → writes `stock_transactions`, updates `current_stock` (never < 0).
- **Stock History:** date/time, ingredient, type, qty, remaining, by (user), remarks. Filters: ingredient, type, date. **Export CSV.**

### 8.6 Suppliers
Table (name, contact person, number, address, status chip) + add/edit modal. Toggle Active/Inactive. Inactive suppliers can't be assigned to new ingredients.

### 8.7 Reports (sub-tabs, each with **Export CSV**)
1. **Daily Sales** — bar chart + table (date, orders, total). 
2. **Monthly Sales** — bar chart + table.
3. **Best Sellers** — date-range picker, horizontal bars (product, qty, revenue).
4. **Stock Status** — all ingredients with status.
Only **Completed** orders count as sales (R13). Backed by SQL views `v_daily_sales_report`, `v_monthly_sales_report`, `v_best_sellers`, `v_stock_status`.

### 8.8 Users
- Table: full name (+ "(you)"), username, role, status chip, date created, **Edit**, **Activate/Deactivate** (hidden for yourself).
- Form: full name, username (**locked on edit**), password (new: min 6, edit: blank = keep) → handled via Supabase Auth **invite/reset**, role (Owner/Barista), status.
- Guard: **at least one active Admin must always remain** (block deactivate/demote with toast). Can't deactivate yourself. Confirm dialog on deactivate: *"They will not be able to sign in."*

---

## 9. Business rules the Owner system owns

| # | Rule |
|---|---|
| R6 | Stock status: `stock ≤ 0` Out · `≤ reorder_level` Low · else In Stock. |
| R7 | `ingredient_cost = Σ(qty_needed × unit_cost)`; `total_cost = ingredient_cost + packaging_cost`; recompute when recipe, ingredient `unit_cost` or packaging changes. `margin = price − total_cost`. |
| R4 | Cancelling an order restores stock via `type='in'` rows (remarks `Cancelled <queue no>`). |
| R5 | Stock never below 0. |
| R11 | Deleting an ingredient used in recipes needs explicit confirm listing affected products. |
| R12 | Inactive suppliers can't be assigned. |
| R13 | Reports use Completed orders only. |
| R-U1 | ≥ 1 active Owner must always exist. |
| R-A | Add-on catalogue (reference): Extra shot 18 g ₱25 · Caramel/Vanilla/Hazelnut syrup 15 mL ₱15 · Extra milk 60 mL ₱15 · Extra rice 150 g ₱20 · Extra egg 1 pc ₱15. Show/edit in settings only if the owner asks for it later. |

All mutations that touch money or stock run in **Postgres functions / Route Handlers** (atomic). The UI may preview, but the server decides.

---

## 10. Data layer conventions

- Components → `hooks/` (TanStack Query) → `lib/` → Supabase. Components never call Supabase directly.
- Prototype `GKStore` replacement: `state()/save()` → queries; `v_*` → SQL views with same names; `stockTx/cancelOrder/setOrderStatus` → RPC/Route Handlers; `toast/openModal/confirmDialog` → React components.
- Invalidate query keys after mutations (e.g., recipe save → `products`, `product_costing`).
- Every screen has **loading, empty, error** states. Tables paginate server-side beyond ~50 rows.
- Search inputs are **debounced** and keep focus/caret (prototype bug-prone area).
- Money = numbers with 2 decimals; round only at display/storage.

---

## 11. Suggested folder structure (Owner app)

```
src/app/
  (auth)/login/
  (admin)/layout.tsx            # sidebar shell + owner guard + idle logout
  (admin)/dashboard/ orders/ products/ inventory/ suppliers/ reports/ users/
  api/ ...                      # server-side business logic
src/components/ui/  layout/  orders/ products/ inventory/ suppliers/ reports/ users/
src/hooks/  src/lib/(supabase, auth, format, business)  src/schemas/  src/types/
supabase/migrations/
```

---

## 12. DevOps & security checklist

- GitHub + PRs; Actions: lint → `tsc --noEmit` → unit tests → `next build`; Vercel preview per PR, prod after checks.
- Versioned SQL migrations in `supabase/migrations/`.
- Env (server-only for the key):
  `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.
- HTTPS/TLS, secure cookies, no secrets in client bundle, audit logs on privileged actions, monitoring via Vercel + Supabase logs.

---

## 13. Build phases (Owner system)

- [ ] **O0 Setup:** Next.js/TS/Tailwind, tokens, fonts, Supabase clients, env, CI.
- [ ] **O1 Design system + shell:** components, sidebar (collapsible) + bottom nav, topbar, modal/toast/confirm.
- [ ] **O2 Auth:** login, MFA, host middleware, role guard, Restricted screen, idle logout.
- [ ] **O3 Suppliers → Ingredients (Inventory list).**
- [ ] **O4 Products → Recipe & Costing.**
- [ ] **O5 Stock In/Out + Stock History (+CSV).**
- [ ] **O6 Orders:** list, filters, detail, status flow, cancel, receipt reprint.
- [ ] **O7 Dashboard + Reports (+CSV).**
- [ ] **O8 Users:** invite, roles, activate/deactivate, last-admin guard, audit log view.
- [ ] **O9 Hardening:** a11y, Playwright (login/role-block, recipe→costing, cancel restores stock), perf, deploy.

**Definition of Done per phase:** compiles, responsive, keyboard-accessible, loading/empty/error states, no console errors, rules in §9 covered by unit tests.

**Minimum tests:** costing math (R7) · stock status (R6) · cancel restores stock (R4) · last-admin guard · role redirect · CSV export format.

---

## 14. Open questions (decide before the related phase)

| # | Topic | Suggested default |
|---|---|---|
| Q1 | IDs: ERD `INT` vs prototype string IDs | Use DB ids; show readable queue no. separately |
| Q2 | `orders.order_id` INT vs `YYYYMMDD-A-###` | Add `queue_no` column |
| Q5 | `users.password` in ERD | Remove; link to `auth.users.id` |
| Q6 | Login by username vs Supabase email | Email login, `username` as display handle |
| Q7 | Stock type casing (`in/out` vs `IN/OUT`) | Follow ERD (lowercase) |
| Q8 | Role naming (`Owner/Barista` vs `owner_admin/barista`) | Use `owner_admin` / `barista` |
| Q10 | Product images base64 vs Storage | Supabase Storage, path in `products.image` |
| Q12 | Prototype lets Barista edit/delete ingredients too | Barista may assign an existing supplier when adding a basic ingredient, but cannot create suppliers or view their contact details. Unit cost, add-on settings, and ingredient edit/delete remain Owner-only; Barista keeps stock movement access (see Barista guideline). |
| Q13 | Add-on catalogue is hard-coded | Keep as config for v1 |

Mark answered items **Decided: …** instead of deleting.

---

## 15. Prompt templates

**Start a phase:** *Read `OWNER_ADMIN_GUIDELINE.md`, the ERD, architecture and prototype. Build **Phase O#**. Follow §5 design and §9 rules. List assumptions and update §14.*

**One screen:** *Using §8.X build `<screen>` at `<route>` for the Owner app. Match the prototype in `js/admin.js`/`js/app.js`, use TanStack Query hooks, include loading/empty/error states.*

**Review:** *Review this code against §4 (access), §9 (rules) and §10 (data layer). Report violations only.*
