# Cancel single items of an order (POS) — design

Date: 2026-11-28 · Status: waiting for approval · UI change needs jhnjffryyy's approval (design freeze)

## Why

A customer often changes their mind about one item, not the whole order. Today the barista can only
cancel the whole order (e.g. Order 024: Barkada, Chicken Poppers, Hungarian), which is wrong for
the shop. The barista must be able to cancel only the items the customer asks to cancel.

## Goals

- The barista cancels chosen items of a Pending or Preparing order, including part of a quantity
  ("2× Latte", cancel 1). The rest of the order continues as normal.
- Cancelling a drink also cancels its add-ons (the same number of them).
- Only the cancelled items' ingredients go back to stock.
- When no item is left, the order becomes Cancelled.
- Sales reports exclude cancelled items (already true: they count completed items only).

## Non-goals

- Refunds are handled by hand. The system records no refund; the payment row stays as paid.
- No offline cancelling: it needs the internet, like "Cancel order" today.
- No changes to Owner screens or the receipt layout; they only get correct data.

## Anti-goals (a failure even if it "works")

- More stock returned than the order took out.
- A half-done cancel (item cancelled but quantity or stock not updated).
- One cancelled item making the whole order look Cancelled.
- Baristas getting direct write access to order quantities or prices.

## Approaches

- **Database A (chosen):** one function `cancel_order_items` does the whole cancel in one
  transaction. **B (rejected):** the app updates rows itself; splitting a quantity takes two writes,
  so a dropped connection can leave wrong numbers.
- **Screen 1 (chosen):** a "Cancel items" button next to "Cancel order" opens a pop-up with tick
  boxes and quantities. **2 (rejected):** a cancel button on every item row changes every row of a
  frozen screen and needs one confirmation per item.

## Design

**Database** (new migration `20261120001600_cancel_order_items.sql`; applied migrations untouched)

- `cancel_order_items(p_order_id integer, p_items jsonb)` with `p_items = [{ "line_id", "quantity" }]`.
  SECURITY DEFINER, `set search_path = ''`: baristas only hold `update (status)` on `orders`, and
  splitting a quantity needs insert and update, which they must not get directly (same reason as
  `process_checkout_transaction`). Checks inside: active profile with role `owner_admin` or
  `barista`; order is Pending or Preparing; each line belongs to the order, is a product line and
  is not cancelled; `1 <= quantity <= line quantity`. Grant execute to `authenticated` only.
- Whole line: its status and its add-on rows (the add-on rows right after it, the grouping the POS
  already uses) move to `cancelled`. Part of a line: the line and its add-ons keep the remaining
  quantity (subtotal recalculated), and new rows with the cancelled quantity are inserted right
  after each other (product first, then add-ons) and then set to `cancelled`.
- Stock return trigger (replaces `return_stock_for_cancelled_orders`): for each line moving to
  `cancelled`, return its recipe usage (products) or `addon_quantity × quantity` (add-ons), capped
  at what the order took out minus what was already returned. When the order has no active line
  left, return exactly the rest, so a whole-order cancel stays exact as today. Remarks:
  `Cancelled item, order #N` / `Cancelled order #N`.
- If no active line is left after the cancel, the order is Cancelled.
- `v_order_totals`: status and total come from non-cancelled lines (status `cancelled` only when
  every line is cancelled).

**API**

- `POST /api/orders/{id}/cancel-items` (POS and Owner), body `{ items: [{ lineId, quantity }] }`,
  returns the updated order; audited as `order.cancel_items`. Errors from the function map to
  existing typed errors (`INVALID_TRANSITION`, `VALIDATION`, `CONFLICT`).
- `updateOrderStatus` skips cancelled lines when moving Pending → Preparing → Completed.
- Order contract: each item gets `status`; the order's `status` and `total` ignore cancelled items.

**POS screen** (`src/app/(staff)/staff/(pos)/orders/[id]/page.tsx`)

- "Cancel items" button next to "Cancel order", shown for Pending/Preparing orders with more than
  one item unit. Pop-up (existing modal style) lists product lines with a tick box and a quantity
  (1 to the line's quantity); "Keep items" / "Cancel selected".
- Cancelled items stay listed, marked "Cancelled", and are left out of the total.

## Left to the builder

Exact pop-up component reuse, error messages, SQL test cases (`supabase/tests/`), and the order of
splitting rows inside the function.

## Calls made without asking (check these)

- Add-ons follow their drink: cancelling 1 of 2 drinks cancels 1 of each of its add-ons.
- Cancelling while Preparing is allowed, like cancelling a whole order today.
- The receipt reprint is unchanged and shows the sale as rung up.
