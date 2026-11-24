# Toasts, ingredient soft delete, longer idle sign-out: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Success/error toasts on every save, Owner soft delete for ingredients, idle sign-out Owner 30 min / POS 8 h.

**Architecture:** One migration adds `ingredients.deleted_at`, an atomic `delete_ingredient` function and a recipe guard; the inventory view hides deleted rows, so every list follows. Backend adds two Owner routes; the Owner Inventory row gets a trash button using the existing confirm dialog and toast.

**Tech Stack:** Next.js 15, Supabase Postgres (RLS, plpgsql), zod 4, TanStack Query, vitest.

**Spec:** `docs/superpowers/specs/2026-11-24-toasts-ingredient-delete-idle-design.md`

## Global Constraints

- Owner idle sign-out `30 * 60 * 1000` ms; POS `8 * 60 * 60 * 1000` ms; the 30-second warning stays.
- Confirm copy: "Delete <name>? This cannot be undone." plus, when used: "It will be removed from the recipes of: A, B, C."
- Migration file `supabase/migrations/20261120001300_ingredient_soft_delete.sql`; repo SQL conventions (SECURITY INVOKER, `set search_path = ''`, revoke then grant).
- Design freeze: only the approved trash button; reuse existing classes (`ingredient-edit-button`, Button `variant="danger"`). No CSS edits.
- No commits or live database changes without the user's approval (CLAUDE.md).

## Review Focus

1. Deleting an ingredient a recipe uses → product costs recompute and checkout stops deducting it (Task 1 SQL test).
2. A stale recipe screen saving a deleted ingredient → refused (Task 1 SQL test).
3. A queued offline order with a deleted add-on → checkout conflict, not a silent sale (Task 1 SQL test).
4. Stock history of a deleted ingredient keeps its name (Task 1 SQL test: the row still exists).
5. Deleting twice or a missing id → 404, no second audit entry (Task 2 test).

---

### Task 1: Database

**Files:** Create `supabase/migrations/20261120001300_ingredient_soft_delete.sql`, `supabase/tests/ingredient_soft_delete.test.sql`; Modify `src/db-types/index.ts` (column + function types by hand).

**Interfaces — Produces:** `public.delete_ingredient(p_ingredient_id integer) returns table (product_id integer, product_name text)`; errors `NOT_FOUND: ...` (P0002-style raise mapped by message) and `FORBIDDEN`; `v_inventory_status` filters `deleted_at is null`.

- [ ] Write the SQL test: delete as Owner removes recipe rows, clears add-on fields, sets `deleted_at`, returns the products; view hides it; second call raises NOT_FOUND; Barista call refused; recipe insert of the deleted id refused; checkout with it as add-on raises CONFLICT; stock_transactions rows remain.
- [ ] Write the migration; run the SQL tests on plain Postgres per `docs/database.md` if Docker is available, else record that they were not run.

### Task 2: Backend

**Files:** Modify `src/contracts/ingredients.ts`, `src/server/modules/ingredients/service.ts`, `src/server/routes/ingredients/[id]/route.ts`, `src/server/dispatch.ts`; Create `src/server/routes/ingredients/[id]/products/route.ts`; Test `tests/server/ingredient-delete.test.ts`.

**Interfaces — Produces:** `IngredientProductSchema = { id: number, name: string }`; `DeleteIngredientResponseSchema = { id: number, removedFromProducts: IngredientProduct[] }`; `listIngredientProducts(user, id): Promise<IngredientProduct[]>`; `deleteIngredient(user, id): Promise<DeleteIngredientResponse>`; routes `GET /api/ingredients/[id]/products`, `DELETE /api/ingredients/[id]` (Owner only).

- [ ] Failing tests: DELETE as Owner calls the RPC and writes `ingredient.delete` audit; Barista gets 403; NOT_FOUND → 404 and no audit; products route returns names; PATCH on a deleted ingredient → 404 (`.is("deleted_at", null)` filter).
- [ ] Implement; tests pass.

### Task 3: Owner Inventory delete button

**Files:** Modify `src/owner/features/inventory/api.ts`, `src/app/(owner)/admin/(app)/inventory/page.tsx`; Test `tests/owner/inventory-delete.test.tsx`.

**Interfaces — Consumes:** Task 2 routes. **Produces:** `listIngredientProducts(id: number): Promise<IngredientProduct[]>`, `deleteIngredient(id: number): Promise<DeleteIngredientResponse>`.

- [ ] Failing test: trash button → confirm shows "cannot be undone" and the product names → confirm calls `deleteIngredient` and toasts "<name> deleted."; cancel calls nothing; API error → error toast.
- [ ] Implement (trash Button after the pencil, `variant="danger"`, `className="ingredient-edit-button"`, `aria-label="Delete <name>"`); refresh `["ingredients"]` and product queries.

### Task 4: Toasts on every save

**Files:** Modify suppliers, users, products (availability), recipe-costing, inventory (add/edit), Owner and POS order detail, POS checkout pages; Tests: extend the matching existing test files.

- [ ] For each screen: failing assertion that success shows a toast (and a failure shows an error toast when no dialog shows it inline), then add `toast(...)`.

### Task 5: Idle sign-out and docs

**Files:** Modify both `(app)`/`(pos)` layouts (`IDLE_MS`), `docs/architecture/BARISTA_POS_GUIDELINE.md`, `docs/api.md`, `docs/database.md`; Test `tests/ui/idle-timeouts.test.tsx`.

- [ ] Failing test: Owner layout passes `timeoutMs` 1 800 000 and POS layout 28 800 000 to `IdleLogout`.
- [ ] Change the constants; update docs; full typecheck, lint, tests.
