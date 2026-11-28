# Cancel Order Items Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Baristas cancel chosen items (or part of an item's quantity) of a Pending/Preparing order; only those items' stock returns; the rest of the order continues.

**Architecture:** One SECURITY DEFINER SQL function `cancel_order_items` does the cancel atomically; the existing statement-level stock-return trigger becomes per item. A new API route calls it; the POS order page gets a "Cancel items" button and pop-up.

**Tech Stack:** Postgres (Supabase migrations), Next.js 15 route handlers, zod contracts, React + TanStack Query, vitest.

**Spec:** `docs/superpowers/specs/2026-11-28-cancel-order-items-design.md`

## Global Constraints

- Branch `feat/pos-cancel-order-items`. Migration file `supabase/migrations/20261120001600_cancel_order_items.sql`; never edit applied migrations.
- SQL conventions: `set search_path = ''`, schema-qualified names, `revoke execute ... from public, anon, authenticated` then explicit grants.
- SQL errors use the existing prefixes (`VALIDATION:`, `CONFLICT:`, `NOT_FOUND:`, `INVALID_TRANSITION:`, `FORBIDDEN:`) so `dbError()` maps them.
- Refunds are by hand: `payments` is never changed.
- Design freeze: only add the button, pop-up and a "Cancelled" mark; reuse `Button`, `Dialog`, `StatusBadge` and existing classes. No CSS edits.
- Do not apply the migration to any live database; the user does that (steps in the chat).
- Conventional Commits, no `Co-Authored-By`.

## Review Focus

- Same line sent twice in one request → `VALIDATION`, nothing changes (SQL test).
- Cancelling the last active item → every line cancelled, exact remainder of stock returned once (SQL test).
- Advancing status after an item was cancelled → only active lines move; no `INVALID_TRANSITION` (server test).
- Two partial cancels of the same "3×" line → quantities 1 active + 1 + 1 cancelled, stock never over-returned (SQL test).
- Order total shown after a cancel excludes cancelled items; receipt still adds up to what was paid (UI test).

---

### Task 1: Database: `cancel_order_items`, per-item stock return, `v_order_totals`

**Files:**
- Create: `supabase/migrations/20261120001600_cancel_order_items.sql`
- Create: `supabase/tests/cancel_order_items.test.sql` (fixture style of `cancel_returns_stock.test.sql`, own ids: users 13/14, ingredients 23/24, product 922)
- Modify: `src/db-types/index.ts` (add `cancel_order_items` under `Functions`: `Args: { p_order_id: number; p_items: Json }`, `Returns: undefined`)
- Modify: `docs/database.md` (one paragraph under functions; add the test file to the Docker command list)

**Interfaces:**
- Produces: `public.cancel_order_items(p_order_id integer, p_items jsonb) returns void`, `p_items = [{"line_id": int, "quantity": int}]`.

- [ ] **Step 1: Write the SQL test.** Barista sells order X: Latte(922) 3× + Syrup add-on 3×, and Croissant-like second product 1×. Checks, each `raise exception 'TEST FAILED: ...'` on failure:
  - cancel `[{line_id: latte, quantity: 1}]` → latte line quantity 2, subtotal 2×price; a new latte row qty 1 `cancelled`; syrup line qty 2; new syrup row qty 1 `cancelled`; stock back by 1× recipe and 1× addon_quantity with remark `Cancelled item, order #X`; `payments` row unchanged.
  - `v_order_totals` for X: status `pending`, total = active lines only.
  - same line twice in one call → raises `VALIDATION`; quantity 0 or > line quantity → `VALIDATION`; add-on line id → `CONFLICT`; other order's line → `CONFLICT`.
  - `update ... set status = 'preparing' where order_id = X and status <> 'cancelled'` succeeds.
  - cancel all remaining product lines → every row `cancelled`, total stock returned for X equals total stock taken (sum `in` = sum `out`), `v_order_totals.status = 'cancelled'`, total 0.
  - completed order → `INVALID_TRANSITION`.
  - whole-order cancel of a fresh order (old path: update all rows) still returns exactly its stock-outs, remark `Cancelled order #N`.

- [ ] **Step 2: Run it, expect failure** (function missing). Docker Desktop must be running:
  `docker run -d --name gk-pg -e POSTGRES_PASSWORD=test postgres:15`, copy, run stub + migrations + `tests/cancel_returns_stock.test.sql tests/cancel_order_items.test.sql` (command in `docs/database.md`). If Docker is unavailable, run the same files on PGlite from the scratchpad, or stop and ask the user to start Docker Desktop.

- [ ] **Step 3: Write the migration.**
  - `create or replace function public.return_stock_for_cancelled_orders()` (same trigger, same name): for lines moving to `cancelled`, per order compute `remaining = sum(out 'Order #N') − sum(in 'Cancelled order #N' or 'Cancelled item, order #N')` per ingredient. If the order has no non-cancelled line left → insert `remaining` (> 0) with `Cancelled order #N`; else insert `least(remaining, item usage)` (> 0) with `Cancelled item, order #N`, where item usage = `product_ingredients.quantity_needed × quantity` for product lines and `ingredients.addon_quantity × quantity` for add-on lines.
  - `cancel_order_items`: SECURITY DEFINER. Requires `app_user_id()` not null and `app_role() in ('owner_admin','barista')` else `FORBIDDEN` (42501). Non-empty `p_items`, no duplicate `line_id` → else `VALIDATION`. Lock the order's rows `for update`; none → `NOT_FOUND`. Active lines' status must be `pending`/`preparing` → else `INVALID_TRANSITION`. Each line: same order, `not is_addon`, not cancelled → else `CONFLICT`; `1 <= quantity <= line.quantity` → else `VALIDATION`. Add-ons of a line = add-on rows of the order with `order_line_id` between the line and the next product line (any status), not cancelled. Whole quantity → collect line + add-on ids. Part → add-on cancel qty = `quantity × addon.quantity / line.quantity` (`CONFLICT` if not whole); reduce originals (`quantity`, `subtotal = unit_price × new qty`), insert copies (product first, then its add-ons; same `order_id, client_tx_id, user_id, order_type, order_date, status, customization, special_instructions`) with the cancelled qty, collect their ids. Finally one `update public.orders set status = 'cancelled' where order_line_id = any(ids)`.
  - `create or replace view public.v_order_totals with (security_invoker = true)`: same columns; `status = coalesce(min(status) filter (where status <> 'cancelled'), 'cancelled')`, `item_count` and `total` over non-cancelled lines (`total` coalesce 0).
  - Grants: revoke from `public, anon, authenticated`; `grant execute on function public.cancel_order_items(integer, jsonb) to authenticated`.

- [ ] **Step 4: Run the SQL tests, expect all to pass** (no `TEST FAILED`, exit 0), plus `tests/phase2_core.test.sql` still passing.

- [ ] **Step 5: Commit** `feat(supabase): cancel single order items with per-item stock return`

### Task 2: API: contract, service, route

**Files:**
- Modify: `src/contracts/orders.ts` (`OrderLineSchema.status: OrderStatusSchema`; `CancelOrderItemsRequestSchema`)
- Modify: `src/server/modules/orders/service.ts` (`loadOrders`, `updateOrderStatus`, new `cancelOrderItems`)
- Create: `src/server/routes/orders/[id]/cancel-items/route.ts`
- Modify: `src/server/dispatch.ts` (add `[/^orders\/([^/]+)\/cancel-items$/, ["id"], ...]`)
- Modify: test fixtures that build `OrderLine` (`tests/owner/orders-*.test.tsx`, `tests/staff/orders-*.test.tsx`) to include `status`
- Test: `tests/server/phase2-api.test.ts` (in `describe("orders and checkout")`)
- Modify: `docs/api.md` (one entry)

**Interfaces:**
- Consumes: Task 1 `cancel_order_items`.
- Produces: `CancelOrderItemsRequestSchema = z.object({ items: z.array(z.object({ lineId: z.number().int().positive(), quantity: z.number().int().min(1) })).min(1).max(50) })`; `cancelOrderItems(user, orderId: number, items: {lineId: number; quantity: number}[]): Promise<Order>`; `POST /api/orders/{id}/cancel-items` (roles `owner_admin`, `barista`) → `Order`.

- [ ] **Step 1: Write failing tests**
  - "cancels chosen items through cancel_order_items and audits it": rpc called with `("cancel_order_items", { p_order_id: 24, p_items: [{ line_id: 7, quantity: 1 }] })`; audit action `order.cancel_items` with `{ items }`; 200 with the order.
  - "rejects an empty cancel-items body with 400 VALIDATION_ERROR" and rpc not called.
  - "maps INVALID_TRANSITION from cancel_order_items to 409".
  - "order status and total ignore cancelled items": lines `[{line 1 pending 140}, {line 2 cancelled 60}]` → `status: "pending"`, `total: 140`, `items[1].status: "cancelled"`; all lines cancelled → `status: "cancelled"`.
  - "status change moves only active lines": update chain includes `.neq("status", "cancelled")`; when no active line is updated but the order exists → 409 `INVALID_TRANSITION`.
- [ ] **Step 2: Run** `npx -y pnpm@12.21.0 exec vitest run tests/server/phase2-api.test.ts -t "cancel"` → FAIL.
- [ ] **Step 3: Implement** contract, service (`loadOrders`: item `status`; order `status` = first non-cancelled line's status else `cancelled`; `total` sums non-cancelled lines), route (thin: `requireRole`, `readId`, `readJson`, service, `jsonResponse`), dispatch line.
- [ ] **Step 4: Run** the file and `npx -y pnpm@12.21.0 typecheck` → PASS.
- [ ] **Step 5: Commit** `feat(api): cancel single order items`

### Task 3: POS: "Cancel items" button and pop-up

**Files:**
- Modify: `src/staff/features/orders/api.ts` (`cancelOrderItems(orderId, items): Promise<Order>`)
- Modify: `src/app/(staff)/staff/(pos)/orders/[id]/page.tsx`
- Test: `tests/staff/orders-detail.test.tsx`

**Interfaces:**
- Consumes: Task 2 route and `Order` with `items[].status`.

- [ ] **Step 1: Write failing tests**
  - "cancels only the chosen items": order 024 with Barkada 140, Chicken Poppers 60, Hungarian 85 (pending). Click "Cancel items", tick "Barkada", click "Cancel selected" → POST `/api/orders/24/cancel-items` body `{ items: [{ lineId: <barkada>, quantity: 1 }] }`; afterwards Barkada shows "Cancelled" and Total shows ₱145.00.
  - "lets the barista cancel part of a quantity": 2× line → quantity input max 2, choosing 1 sends `quantity: 1`.
  - "hides Cancel items for a single-unit or finished order".
  - "receipt still adds up to what was paid": receipt total = sum of all lines (₱285.00) after the cancel.
- [ ] **Step 2: Run** `npx -y pnpm@12.21.0 exec vitest run tests/staff/orders-detail.test.tsx` → FAIL.
- [ ] **Step 3: Implement.** Button "Cancel items" (`size="sm" variant="outline"`) before "Cancel order", shown when `canCancel` and active product units > 1. `Dialog` titled "Cancel items — Order NNN" lists active product groups (checkbox + `<input type="number" min=1 max=qty>` when qty > 1), buttons "Keep items" / "Cancel selected" (danger, disabled until one is ticked). On success: `setQueryData`, invalidate `pos-orders`, toast "Items cancelled.". Cancelled groups get `<StatusBadge status="cancelled" />` in the description; the items total uses `order.total`. `toReceiptOrder` uses the sum of all lines for `totalAmount`.
- [ ] **Step 4: Run** the test file, then `npx -y pnpm@12.21.0 test --project staff` and `--project owner` → PASS.
- [ ] **Step 5: Commit** `feat(pos): cancel single items of an order`

### Task 4: Full check

- [ ] **Step 1:** `npx -y pnpm@12.21.0 typecheck`, `lint`, `test` → all pass (report any skipped).
- [ ] **Step 2:** Open the order page at 1536, 1366, 1180, 1024, 820, 390 px in demo-free dev mode if a dev database is available; otherwise report that the visual check is left to the user.
