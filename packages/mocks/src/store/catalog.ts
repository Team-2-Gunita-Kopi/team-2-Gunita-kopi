import { computeCosting, round2, sortByStockUrgency } from "@gunita/contracts";
import type {
  CreateIngredientRequest,
  CreateProductRequest,
  Ingredient,
  PosProduct,
  Product,
  ProductCosting,
  RecipeIngredient,
  UpdateRecipeRequest,
} from "@gunita/contracts";
import { MockError, ownerData, type MockState } from "./state";

const INACTIVE_SUPPLIER = "Inactive suppliers can't be assigned.";

export function slug(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "item";
}

function uniqueId(taken: (id: string) => boolean, base: string): string {
  let id = base;
  for (let n = 2; taken(id); n++) id = `${base}-${n}`;
  return id;
}

/** Recipe lines priced at current unit costs, plus the R7 costing. */
function costRecipe(state: MockState, product: PosProduct, updatedAt: string) {
  const { unitCosts, packaging } = ownerData(state);
  const lines: RecipeIngredient[] = (product.ingredients ?? []).map((r) => {
    const costPerUnit = unitCosts[r.ingredientId] ?? 0;
    return { ...r, costPerUnit, subtotalCost: round2(r.quantity * costPerUnit) };
  });
  const packagingCost = packaging[product.id] ?? 0;
  const c = computeCosting(
    lines.map((l) => ({ quantity: l.quantity, unitCost: l.costPerUnit ?? 0 })),
    packagingCost,
    product.sellingPrice,
  );
  const costing: ProductCosting = { productId: product.id, ...c, updatedAt };
  return { lines, packagingCost, costing };
}

/** Current total cost (ingredients + packaging) of one unit of a product. */
export function productUnitCost(state: MockState, product: PosProduct): number {
  return costRecipe(state, product, product.createdAt).costing.totalCost;
}

function toProduct(state: MockState, p: PosProduct): Product {
  const { lines, costing } = costRecipe(state, p, p.createdAt);
  return { ...p, ingredients: lines, costPrice: costing.totalCost, profitMarginPercent: costing.marginPercent };
}

function findProduct(state: MockState, id: string): PosProduct {
  const p = state.products.find((x) => x.id === id);
  if (!p) throw new MockError("NOT_FOUND", "Product not found.");
  return p;
}

export function listProducts(state: MockState): Product[] {
  return state.products.map((p) => toProduct(state, p));
}

export function getProduct(state: MockState, id: string): Product {
  return toProduct(state, findProduct(state, id));
}

function checkProductFields(f: { name?: string; sellingPrice?: number }) {
  if (f.name !== undefined && !f.name.trim()) throw new MockError("VALIDATION", "Product name is required.");
  if (f.sellingPrice !== undefined && !(f.sellingPrice >= 0)) {
    throw new MockError("VALIDATION", "Price must be zero or more.");
  }
}

export function createProduct(
  state: MockState,
  req: CreateProductRequest & { description?: string; isActive?: boolean },
  now: Date,
): Product {
  checkProductFields(req);
  const { packaging } = ownerData(state);
  const p: PosProduct = {
    id: uniqueId((id) => state.products.some((x) => x.id === id), `p-${slug(req.name)}`),
    name: req.name.trim(),
    category: req.category,
    sellingPrice: req.sellingPrice,
    isActive: req.isActive ?? true,
    createdAt: now.toISOString(),
    ingredients: [],
  };
  if (req.sku !== undefined) p.sku = req.sku;
  if (req.description !== undefined) p.description = req.description;
  if (req.imageUrl !== undefined) p.imageUrl = req.imageUrl;
  state.products.push(p);
  packaging[p.id] = 0;
  return toProduct(state, p);
}

export type ProductPatch = Partial<
  Pick<PosProduct, "name" | "sku" | "category" | "sellingPrice" | "description" | "imageUrl" | "isActive">
>;

export function updateProduct(state: MockState, id: string, patch: ProductPatch): Product {
  const p = findProduct(state, id);
  checkProductFields(patch);
  Object.assign(p, patch);
  if (patch.name !== undefined) p.name = patch.name.trim();
  return toProduct(state, p);
}

export function setProductAvailability(state: MockState, id: string, isActive: boolean): Product {
  return updateProduct(state, id, { isActive });
}

export function deleteProduct(state: MockState, id: string): void {
  findProduct(state, id);
  state.products = state.products.filter((p) => p.id !== id);
  delete ownerData(state).packaging[id];
}

export function getRecipe(
  state: MockState,
  productId: string,
): { ingredients: RecipeIngredient[]; packagingCost: number; costing: ProductCosting } {
  const p = findProduct(state, productId);
  const { lines, packagingCost, costing } = costRecipe(state, p, p.createdAt);
  return { ingredients: lines, packagingCost, costing };
}

export function saveRecipe(state: MockState, productId: string, req: UpdateRecipeRequest, now: Date): ProductCosting {
  const p = findProduct(state, productId);
  const { packaging } = ownerData(state);
  const seen = new Set<string>();
  const lines = req.ingredients.map((r): RecipeIngredient => {
    const ing = state.ingredients.find((i) => i.id === r.ingredientId);
    if (!ing) throw new MockError("NOT_FOUND", "Ingredient not found.");
    if (!(r.quantity > 0)) throw new MockError("VALIDATION", "Recipe quantities must be greater than zero.");
    if (seen.has(ing.id)) throw new MockError("VALIDATION", `${ing.name} is listed more than once.`);
    seen.add(ing.id);
    return { ingredientId: ing.id, ingredientName: ing.name, quantity: r.quantity, unit: ing.unit };
  });
  if (req.packagingCost !== undefined) {
    if (!(req.packagingCost >= 0)) throw new MockError("VALIDATION", "Packaging cost must be zero or more.");
    packaging[p.id] = req.packagingCost;
  }
  p.ingredients = lines;
  return costRecipe(state, p, now.toISOString()).costing;
}

// ---- Ingredients (owner view: unit cost + supplier) ----

function toOwnerIngredient(state: MockState, i: MockState["ingredients"][number]): Ingredient {
  const { unitCosts, ingredientSuppliers, suppliers } = ownerData(state);
  const supplierId = ingredientSuppliers[i.id];
  const out: Ingredient = { ...i, unitCost: unitCosts[i.id] ?? 0 };
  if (supplierId) {
    out.supplierId = supplierId;
    const s = suppliers.find((x) => x.id === supplierId);
    if (s) out.supplierName = s.name;
  }
  return out;
}

export function listOwnerIngredients(state: MockState): Ingredient[] {
  return sortByStockUrgency(state.ingredients).map((i) => toOwnerIngredient(state, i));
}

function checkSupplier(state: MockState, supplierId: string | undefined) {
  if (!supplierId) return;
  const s = ownerData(state).suppliers.find((x) => x.id === supplierId);
  if (!s) throw new MockError("NOT_FOUND", "Supplier not found.");
  if (!s.isActive) throw new MockError("VALIDATION", INACTIVE_SUPPLIER);
}

export function createIngredient(state: MockState, req: CreateIngredientRequest, now: Date): Ingredient {
  if (!req.name.trim()) throw new MockError("VALIDATION", "Ingredient name is required.");
  if (!req.unit.trim()) throw new MockError("VALIDATION", "Unit is required.");
  if (!(req.unitCost >= 0)) throw new MockError("VALIDATION", "Unit cost must be zero or more.");
  checkSupplier(state, req.supplierId);
  const { unitCosts, ingredientSuppliers } = ownerData(state);
  const currentStock = req.currentStock ?? 0;
  const minimumStock = req.minimumStock ?? 0;
  const ing = {
    id: uniqueId((id) => state.ingredients.some((x) => x.id === id), `i-${slug(req.name)}`),
    name: req.name.trim(),
    unit: req.unit.trim(),
    currentStock,
    minimumStock,
    isLowStock: currentStock <= minimumStock,
    updatedAt: now.toISOString(),
  };
  state.ingredients.push(ing);
  unitCosts[ing.id] = req.unitCost;
  if (req.supplierId) ingredientSuppliers[ing.id] = req.supplierId;
  return toOwnerIngredient(state, ing);
}

export type IngredientPatch = Partial<
  Pick<CreateIngredientRequest, "name" | "unit" | "minimumStock" | "unitCost" | "supplierId">
>;

/** Stock quantity changes go through stock transactions, not here. `supplierId: ""` clears the link. */
export function updateIngredient(state: MockState, id: string, patch: IngredientPatch, now: Date): Ingredient {
  const ing = state.ingredients.find((i) => i.id === id);
  if (!ing) throw new MockError("NOT_FOUND", "Ingredient not found.");
  if (patch.name !== undefined && !patch.name.trim()) throw new MockError("VALIDATION", "Ingredient name is required.");
  if (patch.unit !== undefined && !patch.unit.trim()) throw new MockError("VALIDATION", "Unit is required.");
  if (patch.unitCost !== undefined && !(patch.unitCost >= 0)) {
    throw new MockError("VALIDATION", "Unit cost must be zero or more.");
  }
  if (patch.minimumStock !== undefined && !(patch.minimumStock >= 0)) {
    throw new MockError("VALIDATION", "Reorder level must be zero or more.");
  }
  const { unitCosts, ingredientSuppliers } = ownerData(state);
  if (patch.supplierId && patch.supplierId !== ingredientSuppliers[id]) checkSupplier(state, patch.supplierId);
  if (patch.name !== undefined) ing.name = patch.name.trim();
  if (patch.unit !== undefined) ing.unit = patch.unit.trim();
  if (patch.minimumStock !== undefined) ing.minimumStock = patch.minimumStock;
  if (patch.unitCost !== undefined) unitCosts[id] = patch.unitCost;
  if (patch.supplierId !== undefined) {
    if (patch.supplierId) ingredientSuppliers[id] = patch.supplierId;
    else delete ingredientSuppliers[id];
  }
  ing.isLowStock = ing.currentStock <= ing.minimumStock;
  ing.updatedAt = now.toISOString();
  // keep denormalised recipe names/units in step
  for (const p of state.products) {
    for (const r of p.ingredients ?? []) {
      if (r.ingredientId === id) {
        r.ingredientName = ing.name;
        r.unit = ing.unit;
      }
    }
  }
  return toOwnerIngredient(state, ing);
}

export function productsUsingIngredient(state: MockState, id: string): { id: string; name: string }[] {
  return state.products
    .filter((p) => (p.ingredients ?? []).some((r) => r.ingredientId === id))
    .map((p) => ({ id: p.id, name: p.name }));
}

export function deleteIngredient(state: MockState, id: string): void {
  if (!state.ingredients.some((i) => i.id === id)) throw new MockError("NOT_FOUND", "Ingredient not found.");
  const { unitCosts, ingredientSuppliers } = ownerData(state);
  state.ingredients = state.ingredients.filter((i) => i.id !== id);
  for (const p of state.products) p.ingredients = (p.ingredients ?? []).filter((r) => r.ingredientId !== id);
  delete unitCosts[id];
  delete ingredientSuppliers[id];
}
