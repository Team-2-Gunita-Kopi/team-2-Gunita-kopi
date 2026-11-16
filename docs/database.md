# Database Architecture & Migration Plan

This document outlines the database schema, views, security design, and migration plan for the Gunita Kopi Supabase PostgreSQL database. This document serves as the implementation specification for the upcoming database phase.

## Planned Tables (9 Core Domain Tables + 1 Audit Table)

1. **`users`**
   - Application profile record corresponding to Supabase Auth accounts.
   - Contains employee details, assigned role, phone number, and active flag.

2. **`suppliers`**
   - Directory of coffee bean and ingredient suppliers.
   - Holds business name, contact person, phone number, email address, physical address, and notes.

3. **`ingredients`**
   - Inventory tracking for all raw consumables (coffee beans, milk, syrups, cups, lids, packaging).
   - Tracks SKU, measurement unit (e.g. grams, ml, pcs), current on-hand quantity, minimum safety threshold, and unit purchase cost.

4. **`products`**
   - Beverage and food items offered on the point-of-sale menu.
   - Tracks SKU, category (Coffee, Non-Coffee, Pastry, Beans), retail selling price, and active catalog availability.

5. **`product_ingredients`**
   - Recipe bill of materials mapping each product to its component ingredients.
   - Defines the precise ingredient quantity depleted per serving.

6. **`product_costing`**
   - Automated financial metrics per product calculated from component ingredient costs.
   - Maintains total Cost of Goods Sold (COGS), selling price, and real-time gross profit margin percentage.

7. **`stock_transactions`**
   - Complete ledger of inventory additions, reductions, waste events, and cycle counts.
   - Records movement type (`stock_in`, `stock_out`, `waste`, `adjustment`, `order_deduction`), quantity change, previous balance, new balance, and barista/admin reference.

8. **`orders`**
   - Sales transaction headers generated either online or synchronized from offline POS outboxes.
   - Records order status, order type (`dine-in`, `take-out`, `online`, `pre-order`), financial summary, payment method, and cashier attribution.

9. **`payments`**
   - Payment transaction records associated with finalized orders.
   - Tracks payment method (cash, card, QR code), payment amount, payment provider references, and confirmation timestamp.

10. **`audit_logs`**
    - Immutable security and administrative audit log.
    - Records user identity, administrative actions, targeted entity, IP address, and payload snapshots.

## Planned Views (6 Reporting Views)

1. **`v_sales`**
   - Flattened sales order ledger joining order header information with payment confirmation timestamps.

2. **`v_order_totals`**
   - Order-level aggregation calculating item counts, subtotal sums, discounts, taxes, and final payable amounts.

3. **`v_daily_sales`**
   - Daily roll-up summarizing aggregate daily revenue, total transactions processed, average ticket value, estimated COGS, and daily gross margin.

4. **`v_monthly_sales`**
   - Calendar month financial summaries tracking gross sales volume, ticket volumes, and seasonal trajectory.

5. **`v_best_sellers`**
   - Product ranking analytics ordering menu items by total unit volume sold, total revenue generated, and profit margin contribution.

6. **`v_inventory_status`**
   - Operational inventory dashboard view comparing current ingredient stock against minimum reorder points, providing real-time low stock indicators.

## Planned Key Architectural Changes

1. **`auth_user_id` Column on `users`**:
   - Replaces custom auth identifiers by foreign keying directly to Supabase Auth's `auth.users(id)`.
2. **No Password Column on Application Tables**:
   - Zero credential storage in the application schema; all passwords, salts, and credential flows are strictly managed within Supabase Auth (`auth.users`).
3. **Client Transaction ID (`client_tx_id`) on Every Order Row**:
   - Unique UUID generated client-side at order creation time before being queued to IndexedDB.
   - Provides safe idempotency and prevents duplicate orders upon network retries or batch sync.
4. **Final Order ID Issued by API at Sync**:
   - System assigns the definitive sequential/formatted order number and database primary key upon confirmation of the transaction commit.
5. **Dedicated `audit_logs` Table**:
   - Separate append-only table accessible exclusively by the service role for security and compliance tracking.
6. **Unified PostgreSQL Function for Checkout (`process_checkout_transaction`)**:
   - Single atomic stored procedure called via Supabase RPC that creates order records, inserts payment logs, and decrements recipe ingredient inventory inside a single ACID database transaction.
7. **Strict System Roles**:
   - Application roles strictly restricted to `owner_admin` and `barista`, stored in Supabase `app_metadata` to prevent client modification.
