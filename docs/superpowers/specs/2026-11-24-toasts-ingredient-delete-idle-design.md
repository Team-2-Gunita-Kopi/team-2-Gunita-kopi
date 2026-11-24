# Toasts, ingredient soft delete, longer idle sign-out (design, 2026-11-24)

## Why

- The Owner and baristas cannot always tell whether a save worked: some actions show nothing on success.
- The Owner needs to remove ingredients the shop no longer uses, without losing stock or order history.
- Both areas sign out after 5 idle minutes, so people sign in again all day.

## Decided by the user

- Idle sign-out: **Owner 30 minutes, POS 8 hours** (the 30-second "Still there?" warning stays).
- Deleting an ingredient that recipes or add-ons use: **confirm, then remove it**. The confirm dialog
  lists the affected products; on confirm the ingredient is hidden and taken out of those recipes
  (guideline R11).
- Delete is a **soft delete** (no row is removed). The dialog says it cannot be undone (there is no
  restore screen).
- The trash button on the Owner Inventory table, as in the Figma frame, is **approved** (design freeze).
- Only these three changes now; other delete candidates are listed at the end, not built.

## Goals

1. Every save or change action on Admin and POS shows a success toast; failures show an error toast.
2. The Owner can delete an ingredient; it disappears everywhere it is offered, and history keeps its name.
3. Idle sign-out at 30 min (Owner) and 8 h (POS).

## Non-goals and anti-goals

- No restore screen, no hard delete, no delete for other records.
- Anti-goals: stock history or old orders losing the ingredient's name; a recipe changing without the
  Owner seeing which products are affected; a deleted ingredient still being deducted at checkout.

## Approaches for the soft delete

| Approach | Trade-off |
| --- | --- |
| **A. `deleted_at` column + one atomic database function + the inventory view filters deleted rows** (chosen) | Explicit; history and orders still read the name through their joins. |
| B. RLS hides deleted rows | Every list hides them for free, but stock history and old orders would lose the ingredient name (their joins return nothing). |
| C. Reuse active/inactive like suppliers | Wrong meaning (inactive can come back) and the same filtering work. |

## Design

### Toasts (my call)
- Use the existing `useToast()` (`src/ui/OverlayProvider.tsx`); no new component, no layout change.
- Success: short past tense ("Supplier added.", "Order #12 saved."). Failure: "Could not … : <API message>".
- When a form dialog stays open and shows the error inline, do not also toast it (no double message).
- Screens: Owner Inventory (add, edit, delete), Suppliers (add, edit, activate/deactivate), Users (add,
  edit, status), Products (availability toggle), Recipe & Costing (recipe, packaging cost), order status
  (Owner and POS), POS checkout (saved online, or "Saved offline, will sync"), POS Inventory (already done).

### Ingredient soft delete
- Migration `20261120001300_ingredient_soft_delete.sql`:
  - `ingredients.deleted_at timestamptz` (NULL = active).
  - `v_inventory_status` recreated with the same columns plus `where i.deleted_at is null`. This alone
    hides deleted ingredients from the Owner and POS inventory, recipe picker, add-on choices, dashboard
    low-stock alerts and the stock-status report.
  - `delete_ingredient(p_ingredient_id)` (SECURITY INVOKER, Owner only, `set search_path = ''`), in one
    transaction: lock the row; refuse if missing or already deleted; delete its `product_ingredients`
    rows (the existing costing trigger recomputes product cost); clear its add-on settings
    (`is_addon = false`, price and quantity NULL); set `deleted_at = now()`; return the affected
    products (id, name). Grants per repo convention.
  - Trigger on `product_ingredients` (insert/update) refusing a deleted ingredient, so a stale recipe
    screen cannot put it back.
  - SQL test `supabase/tests/ingredient_soft_delete.test.sql`.
- API (Owner only):
  - `GET /api/ingredients/[id]/products`: products whose recipe uses it (for the confirm dialog).
  - `DELETE /api/ingredients/[id]`: calls the function, writes `ingredient.delete` to `audit_logs`, returns
    `{ id, removedFromProducts: [{ id, name }] }`.
  - `GET` and `PATCH /api/ingredients/[id]` and manual stock movements answer 404 for a deleted ingredient.
- Offline POS orders queued before the delete that use it as an add-on: checkout refuses them as a
  conflict shown to staff (the add-on is no longer configured). To confirm during planning.
- Owner Inventory row: trash button after the edit pencil (Figma). Click → load usage → existing confirm
  dialog (danger): "Delete <name>? This cannot be undone." plus, if used, "It will be removed from the
  recipes of: A, B, C." → success toast, lists refresh.
- Docs: `docs/api.md`, `docs/database.md`.
- **Your action:** apply the new migration to the dev project (SQL Editor, same as `0900`/`1000`).

### Idle sign-out
- `IDLE_MS` in `src/app/(owner)/admin/(app)/layout.tsx` → 30 min; `src/app/(staff)/staff/(pos)/layout.tsx` → 8 h.
- Update the "default 5 min" line in `docs/architecture/BARISTA_POS_GUIDELINE.md`.

## Left to the builder
Toast wording, query keys to refresh, test file placement (tests first, per the repo's TDD habit).

## Other delete candidates (not built, for your decision)
| Screen | Today | Suggestion |
| --- | --- | --- |
| Products | "Available" toggle only | Good candidate: soft delete hides it from the menu and POS; orders keep their history. |
| Suppliers | Deactivate | Optional soft delete; linked ingredients would show no supplier. |
| Users | Deactivate | Keep deactivate only: accounts must stay for order and audit history. |
| Orders | Cancel (returns stock) | No delete: it would break sales reports and the audit trail. |
| Recipe lines, product image | Already removable | Nothing to add. |
