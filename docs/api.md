# Gunita Kopi API Specification

Route handlers in `apps/api` (Next.js on Vercel Functions). Request and response types live in `@gunita/contracts`; the zod schemas named below are the validation rules.

## Conventions

- **Authentication.** Every endpoint except `GET /api/health`, `POST /api/auth/login` and `POST /api/setup/owner` needs `Authorization: Bearer <Supabase access token>`. `requireUser` verifies the token with Supabase Auth, then reads role and status from `users` (token claims are never trusted). Missing or invalid token: **401**. No active profile: **403**.
- **Roles.** `owner_admin` = Owner/Manager, `barista` = Barista/Service Staff (SRS 2.3). Wrong role: **403**. The database repeats the check with RLS, using the caller's own token.
- **Envelope.** `{ success, data?, error?: { code, message, details? }, meta: { requestId?, timestamp } }`.
- **Lists** take `page` (default 1) and `pageSize` (default 25, max 100) and return `{ items, page, pageSize, total }`.
- **Ids** in paths are positive integers. `[id]` of an order is its `order_id`, which is also the queue number.
- **Money and quantities** are numbers with at most two decimals (database `numeric(10,2)`). Dates in queries are `YYYY-MM-DD`, Manila business days.
- **Audit.** Create and update actions on products, recipes, costing, suppliers, ingredients and users, and order status changes, are written to `audit_logs` (NFR-11).

### Errors

| Status | `code`                                         | When                                                                   |
| ------ | ---------------------------------------------- | ---------------------------------------------------------------------- |
| 400    | `VALIDATION_ERROR`                             | Body, query or path failed its schema (`details` lists the fields).    |
| 400    | `INVALID_JSON`                                 | Body is not JSON.                                                      |
| 400    | `VALIDATION`                                   | Business rule: non-cash payment, amount paid below total, bad item id. |
| 401    | `UNAUTHORIZED`                                 | Missing, invalid or expired token.                                     |
| 403    | `FORBIDDEN`                                    | Inactive account, wrong role, or refused by RLS.                       |
| 404    | `NOT_FOUND`                                    | No such record.                                                        |
| 409    | `STOCK_CONFLICT`, `PRICE_CONFLICT`, `CONFLICT` | Checkout or stock-out refused by the database (nothing was saved).     |
| 409    | `INVALID_TRANSITION`                           | Order status change not allowed.                                       |
| 409    | `REFERENCE_CONFLICT`                           | Linked record missing or still in use (for example unknown supplier).  |
| 500    | `INTERNAL_SERVER_ERROR`, `DATABASE_ERROR`      | Logged on the server; the response never carries database details.     |

## Endpoints

| Method  | Endpoint                     | Roles                     | Purpose                                    | SRS            |
| ------- | ---------------------------- | ------------------------- | ------------------------------------------ | -------------- |
| `GET`   | `/api/health`                | public                    | Liveness probe                             |                |
| `POST`  | `/api/auth/login`            | public                    | Username sign-in (Phase 1)                 | FR-41 to FR-43 |
| `POST`  | `/api/setup/owner`           | setup token               | One-time Owner account (Phase 1)           |                |
| `POST`  | `/api/admin/employees`       | owner                     | Create a barista account (Phase 1)         | FR-49, NFR-09  |
| `GET`   | `/api/users`                 | owner                     | List staff accounts                        | FR-49          |
| `GET`   | `/api/users/[id]`            | owner                     | Staff account details                      | FR-49          |
| `PATCH` | `/api/users/[id]`            | owner                     | Change name, activate or deactivate        | FR-45 to FR-47 |
| `GET`   | `/api/products`              | owner, barista            | Product catalog                            | FR-05          |
| `POST`  | `/api/products`              | owner                     | Create a product                           | FR-50, FR-52   |
| `GET`   | `/api/products/[id]`         | owner, barista            | Product details                            | FR-05          |
| `PATCH` | `/api/products/[id]`         | owner                     | Edit a product or its availability         | FR-50, FR-51   |
| `GET`   | `/api/products/[id]/recipe`  | owner                     | Recipe lines                               | FR-23          |
| `PUT`   | `/api/products/[id]/recipe`  | owner                     | Replace the recipe                         | FR-23, FR-24   |
| `GET`   | `/api/products/[id]/costing` | owner                     | Cost breakdown, total cost, margin         | FR-27 to FR-29 |
| `PUT`   | `/api/products/[id]/costing` | owner                     | Set packaging cost                         | FR-26 to FR-28 |
| `GET`   | `/api/suppliers`             | owner                     | List suppliers                             | FR-22          |
| `POST`  | `/api/suppliers`             | owner                     | Create a supplier                          | FR-22          |
| `GET`   | `/api/suppliers/[id]`        | owner                     | Supplier details                           | FR-22          |
| `PATCH` | `/api/suppliers/[id]`        | owner                     | Edit, activate or deactivate a supplier    | FR-22          |
| `GET`   | `/api/ingredients`           | owner, barista            | Inventory with stock status                | FR-14, FR-19   |
| `POST`  | `/api/ingredients`           | owner                     | Create an ingredient                       | FR-21, FR-22   |
| `GET`   | `/api/ingredients/[id]`      | owner, barista            | Ingredient details and stock status        | FR-14          |
| `PATCH` | `/api/ingredients/[id]`      | owner                     | Edit an ingredient or its supplier link    | FR-21, FR-22   |
| `GET`   | `/api/stock-transactions`    | owner, barista            | Stock history                              | FR-17          |
| `POST`  | `/api/stock-transactions`    | owner (in), barista (out) | Record stock-in or stock-out               | FR-15 to FR-18 |
| `GET`   | `/api/orders`                | owner, barista            | Order board and queue, with items          | FR-10          |
| `POST`  | `/api/orders`                | barista                   | Checkout (online)                          | FR-01 to FR-13 |
| `GET`   | `/api/orders/[id]`           | owner, barista            | Order, receipt and order slip data         | FR-08, FR-09   |
| `PATCH` | `/api/orders/[id]`           | owner, barista            | Change order status                        | FR-10          |
| `POST`  | `/api/sync`                  | barista                   | Save offline orders                        | FR-56 to FR-60 |
| `GET`   | `/api/reports/[type]`        | owner                     | Daily, monthly, best sellers, stock status | FR-30 to FR-35 |
| `GET`   | `/api/dashboard`             | owner                     | Dashboard summary                          | FR-36 to FR-39 |

### Staff accounts

**`GET /api/users`**: query `role`, `status`, paging. Returns `Page<UserProfile>`: `{ id, username, fullName, role, status, email, createdAt }` (`email` is the Owner's only; null for baristas).

**`PATCH /api/users/[id]`**: body `UpdateUserRequestSchema`: `{ fullName?: 2-100 chars, status?: "active" | "inactive" }`, at least one. Role, username, email and the sign-in identity cannot change here (the database grants no update on them). The Owner cannot deactivate their own account (400). A deactivated user is refused on their next request (403); see Known limitations.

### Products

**`GET /api/products`**: query `category`, `available` (`true`/`false`), `search` (name contains), paging. Returns `Page<Product>`: `{ id, name, description, category, price, isAvailable, image, createdBy, createdAt }`. Unavailable products are included so the POS can show them as sold out; filter with `available=true`.

**`POST /api/products`**: body `CreateProductRequestSchema`: `name` (1-100, required), `price` (money, required), `description?`, `category?` (max 50), `isAvailable?` (default true), `image?` (Storage path or URL, max 255). `createdBy` is always the caller. **201** with the product.

**`PATCH /api/products/[id]`**: any subset of the create fields. `{ "isAvailable": false }` alone switches availability (FR-51). Price changes never affect saved orders, which keep their own `unit_price`.

### Recipe and costing

**`GET /api/products/[id]/recipe`**: `{ productId, items: [{ ingredientId, ingredientName, unit, quantityNeeded }] }`.

**`PUT /api/products/[id]/recipe`**: body `{ items: [{ ingredientId, quantityNeeded > 0 }] }`, each ingredient once, max 50. Replaces the whole recipe in one transaction: listed lines are added or updated, missing lines are removed. `[]` clears it. Unknown ingredient: 409 `REFERENCE_CONFLICT`.

**`GET /api/products/[id]/costing`**: `ProductCosting`:

```json
{
  "productId": 1,
  "productName": "Latte",
  "sellingPrice": 120,
  "lines": [
    {
      "ingredientId": 1,
      "ingredientName": "Espresso beans",
      "unit": "g",
      "quantityNeeded": 18,
      "unitCost": 0.5,
      "cost": 9
    }
  ],
  "ingredientCost": 29,
  "packagingCost": 6.5,
  "totalCost": 35.5,
  "margin": 84.5,
  "marginPercent": 70.42,
  "missingUnitCost": [],
  "updatedAt": "..."
}
```

`ingredientCost = round(sum(quantityNeeded * unitCost), 2)` is kept in `product_costing` by the database: it is recalculated whenever a recipe line or an ingredient's unit cost changes, so there is no separate recalculate call. `totalCost = ingredientCost + packagingCost`. `missingUnitCost` lists recipe ingredients with no unit cost (counted as 0).

**`PUT /api/products/[id]/costing`**: body `{ packagingCost: money }`. Returns the updated costing.

### Suppliers (Owner only)

Reference records only; no purchase orders or automatic reordering (SRS section 8).

**`GET /api/suppliers`**: query `status`, `search`, paging. `Supplier`: `{ id, name, contactPerson, contactNumber, address, status }`.

**`POST /api/suppliers`**: `name` (1-100, required), `contactPerson?` (100), `contactNumber?` (20), `address?` (255). New suppliers are `active`. **201**.

**`PATCH /api/suppliers/[id]`**: any subset, plus `status: "active" | "inactive"`.

### Ingredients and inventory

**`GET /api/ingredients`**: query `stockStatus` (one or a comma list of `available`, `low-stock`, `out-of-stock`), `supplierId`, `search`, paging. `Ingredient`: `{ id, name, unit, currentStock, reorderLevel, unitCost, stockStatus, supplierId, supplierName, updatedAt }`. `stockStatus` comes from `v_inventory_status`: out-of-stock at 0, low-stock at or below the reorder level. `supplierName` is null for baristas (supplier records are Owner-only). Low-stock alerts: `?stockStatus=low-stock,out-of-stock`.

**`POST /api/ingredients`**: `name` (1-100, required), `unit?` (20), `supplierId?`, `reorderLevel?` (default 0), `unitCost?` (money; also the add-on price, SDS 3.5.3). New ingredients start at 0 stock: record the opening quantity as a stock-in so it appears in the history. **201**.

**`PATCH /api/ingredients/[id]`**: any subset of the create fields. `currentStock` is not editable. A `unitCost` change recosts every product that uses the ingredient.

### Stock transactions

**`GET /api/stock-transactions`**: query `ingredientId`, `type` (`in`/`out`), `from`, `to`, paging; newest first. `StockTransaction`: `{ id, ingredientId, ingredientName, type, quantity, remainingStock, userId, userName, dateTime, remarks }`.

**`POST /api/stock-transactions`**: body `{ ingredientId, type: "in" | "out", quantity > 0, remarks? (255) }`. `in` is Owner-only and `out` is Barista-only (SRS 2.3, FR-15, FR-16); the user is always the caller. The database updates `current_stock`, stores `remainingStock` and refuses to go below 0 in the same statement: **409 `STOCK_CONFLICT`**. Unknown ingredient: 404. **201**.

### Orders and checkout

**`POST /api/orders`** (barista): body `CreateOrderRequestSchema`, the same order the POS stores offline:

```json
{
  "clientTxId": "uuid",
  "type": "dine-in | take-out | pre-order",
  "items": [
    {
      "productId": "1",
      "productName": "Latte",
      "quantity": 2,
      "unitPrice": 120,
      "subtotal": 240,
      "customization": "less ice"
    },
    {
      "isAddon": true,
      "ingredientId": "3",
      "productName": "Vanilla",
      "quantity": 1,
      "unitPrice": 15,
      "subtotal": 15
    }
  ],
  "totalAmount": 255,
  "paidAmount": 300,
  "paymentMethod": "cash"
}
```

Runs `process_checkout_transaction` under the barista's token: one transaction writes one `orders` row per item (add-ons as their own rows with `is_addon`), the payment with change, and the stock-out rows from the recipes and add-ons. The database rechecks every price (`PRICE_CONFLICT`), product availability (`CONFLICT`) and stock (`STOCK_CONFLICT`); any failure rolls everything back. It ignores the client's `totalAmount`/`subtotal` and computes the total itself. `paymentMethod` must be `cash` and `paidAmount` must cover the total (400 `VALIDATION`). Online and Facebook orders use type `pre-order`.

Returns `{ duplicate, order }`: **201** for a new sale, **200** with `duplicate: true` when that `clientTxId` was already saved (safe retry). `order` is the full `Order` below.

**`GET /api/orders/[id]`**: `Order`, also the receipt and order slip data:

```json
{
  "orderId": 7,
  "clientTxId": "uuid",
  "status": "pending",
  "orderType": "dine-in",
  "orderDate": "...",
  "cashierId": 2,
  "cashierName": "Bea",
  "items": [
    {
      "lineId": 1,
      "productId": 1,
      "ingredientId": null,
      "isAddon": false,
      "name": "Latte",
      "quantity": 2,
      "unitPrice": 120,
      "subtotal": 240,
      "customization": "less ice",
      "specialInstructions": null
    }
  ],
  "total": 255,
  "payment": {
    "amountPaid": 300,
    "changeAmount": 45,
    "paymentMethod": "cash",
    "receivedBy": 2,
    "dateTime": "..."
  }
}
```

`cashierName` is null when a barista views another staff member's order (RLS shows a barista only their own profile).

**`GET /api/orders`**: query `status` (one or a comma list, e.g. `pending,preparing` for the queue), `from`, `to`, paging; newest first. Returns `Page<Order>`.

**`PATCH /api/orders/[id]`**: body `{ status }`. Allowed: `pending -> preparing -> completed`, and `pending`/`preparing -> cancelled`. Others: **409 `INVALID_TRANSITION`**. Completed orders count as sales in the reports. The change is audited with the user and time.

### Offline sync

**`POST /api/sync`** (barista): body `{ batchId?, orders: [{ transactionId, order: CreateOrderRequest, createdAt }] }`, with `transactionId` equal to `order.clientTxId`. Each order goes through the same checkout as `POST /api/orders` and commits on its own. Response `{ processedCount, results: [{ transactionId, status, orderId?, code?, error? }] }`:

| `status`    | Meaning                                                            | POS action                  |
| ----------- | ------------------------------------------------------------------ | --------------------------- |
| `synced`    | Saved now; `orderId` is the final queue number.                    | Mark synced.                |
| `duplicate` | Already saved by an earlier request; `orderId` is that order.      | Mark synced.                |
| `conflict`  | Stock, price or availability changed (`code`); nothing saved.      | Show to staff (FR-60).      |
| `failed`    | Invalid order (`code: VALIDATION`) or server error; nothing saved. | Keep in outbox, show error. |

`orderId` is present only after the database confirmed the order (FR-59). A malformed batch is rejected as a whole with 400.

### Reports (Owner only)

**`GET /api/reports/[type]`**, `type` = `daily | monthly | best-sellers | stock-status`; query `from`, `to`, `limit` (default 100, max 500). Computed from the views on each request; sales count completed orders only, by Manila day.

| Type           | View                                 | Rows                                                                              |
| -------------- | ------------------------------------ | --------------------------------------------------------------------------------- |
| `daily`        | `v_daily_sales`                      | `{ date, orderCount, itemsSold, totalSales }`, plus `totals`                      |
| `monthly`      | `v_monthly_sales`                    | `{ month, orderCount, totalSales }`, plus `totals`                                |
| `best-sellers` | `v_best_sellers` + `product_costing` | `{ productId, productName, unitsSold, revenue, currentUnitCost }`, all time       |
| `stock-status` | `v_inventory_status`                 | `{ ingredientId, ingredientName, unit, currentStock, reorderLevel, stockStatus }` |

`currentUnitCost` is today's costing, not the cost at the time of sale.

### Dashboard (Owner only)

**`GET /api/dashboard`**: `{ date, todaySales, todayCompletedOrders, pendingOrders, preparingOrders, stock: { available, lowStock, outOfStock }, stockAlerts (max 10), bestSellers (top 5), recentOrders (last 10) }`. All values come from the live views.

## Known limitations

- **Staff on duty (FR-40)** is not returned: there is no attendance or shift data, and attendance is out of scope (SRS section 8).
- **Cancelling an order does not restore stock.** No rule is defined; record a stock-in if ingredients were not used.
- **Deactivation** blocks the API at the next request, but the Supabase session stays valid and `app_metadata.role` still routes the Admin/POS pages until it expires (see `docs/database.md`).
- **The POS UI** still offers card/QR payment, which the API now rejects (cash only, FR-06), and its sync client treats `conflict` like `failed` (retries). Both are frontend follow-ups.
- **Receipts as files**: receipt and order slip data are served as JSON by `GET /api/orders/[id]`; no PDF or Storage file is generated (no Storage buckets exist yet).
- **Product images**: `image` stores a reference only; uploading goes through Storage once buckets exist.
- **Large sync batches** are processed one order at a time in one request; the POS should send at most about 50 per call.
