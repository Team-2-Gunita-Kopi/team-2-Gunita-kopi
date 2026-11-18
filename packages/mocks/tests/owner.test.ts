import { describe, expect, it } from "vitest";
import { MockError, createState } from "../src/store/state";
import {
  createIngredient, deleteIngredient, listOwnerIngredients, listProducts, productsUsingIngredient,
  saveRecipe, getRecipe, createProduct, deleteProduct, setProductAvailability, updateIngredient, updateProduct,
} from "../src/store/catalog";
import { createSupplier, createUser, listSuppliers, listUsers, setSupplierActive, updateSupplier, updateUser } from "../src/store/owner";
import { NOW } from "./helpers";

const fresh = () => createState("owner", NOW);
const code = (fn: () => unknown) => {
  try { fn(); } catch (e) { return e instanceof MockError ? `${e.code}:${e.message}` : String(e); }
  return "no error";
};

describe("products and recipes", () => {
  it("costs products from unit costs + packaging", () => {
    const s = fresh();
    const p = listProducts(s).find((x) => x.id === "p-iced-americano")!;
    // 18g beans * 0.9 + cup16 5 + lid 2 + straw 0.75 + packaging 8
    expect(p.costPrice).toBe(31.95);
    expect(p.profitMarginPercent).toBe(70.95);
  });
  it("saving a recipe updates the product margin", () => {
    const s = fresh();
    const before = listProducts(s).find((x) => x.id === "p-iced-americano")!;
    const costing = saveRecipe(s, "p-iced-americano", { ingredients: [{ ingredientId: "i-beans", quantity: 100, unit: "g" }], packagingCost: 0 }, NOW);
    expect(costing.totalCost).toBe(90);
    const after = listProducts(s).find((x) => x.id === "p-iced-americano")!;
    expect(after.profitMarginPercent).toBe(costing.marginPercent);
    expect(after.profitMarginPercent).toBeLessThan(before.profitMarginPercent!);
    expect(getRecipe(s, "p-iced-americano").packagingCost).toBe(0);
  });
  it("unit cost changes flow into costing", () => {
    const s = fresh();
    updateIngredient(s, "i-beans", { unitCost: 2 }, NOW);
    expect(getRecipe(s, "p-iced-americano").costing.ingredientCost).toBe(36 + 7.75);
  });
  it("creates, toggles and deletes products", () => {
    const s = fresh();
    const p = createProduct(s, { name: "Test Brew", category: "Hot Beverages", sellingPrice: 99 }, NOW);
    expect(p.isActive).toBe(true);
    expect(setProductAvailability(s, p.id, false).isActive).toBe(false);
    expect(updateProduct(s, p.id, { sellingPrice: 120 }).sellingPrice).toBe(120);
    deleteProduct(s, p.id);
    expect(listProducts(s).some((x) => x.id === p.id)).toBe(false);
    expect(code(() => updateProduct(s, "nope", {}))).toMatch(/^NOT_FOUND/);
  });
});

describe("ingredients", () => {
  it("lists the products using an ingredient", () => {
    const names = productsUsingIngredient(fresh(), "i-milk").map((p) => p.id);
    expect(names).toContain("p-iced-spanish-latte");
    expect(names).toContain("p-hot-caf-latte");
  });
  it("rejects an inactive supplier", () => {
    const s = fresh();
    const req = { name: "Flour", unit: "g", currentStock: 0, minimumStock: 0, unitCost: 1, supplierId: "sup-panaderia" };
    expect(code(() => createIngredient(s, req, NOW))).toBe("VALIDATION:Inactive suppliers can't be assigned.");
    expect(code(() => updateIngredient(s, "i-beans", { supplierId: "sup-panaderia" }, NOW))).toBe(
      "VALIDATION:Inactive suppliers can't be assigned.",
    );
  });
  it("creates with supplier name on owner reads", () => {
    const s = fresh();
    const i = createIngredient(s, { name: "Oat milk", unit: "mL", currentStock: 10, minimumStock: 5, unitCost: 0.2, supplierId: "sup-unisilver" }, NOW);
    expect(i.supplierName).toBe("Unisilver PH");
    expect(listOwnerIngredients(s).find((x) => x.id === i.id)?.unitCost).toBe(0.2);
  });
  it("delete removes the ingredient from every recipe", () => {
    const s = fresh();
    deleteIngredient(s, "i-milk");
    expect(s.ingredients.some((i) => i.id === "i-milk")).toBe(false);
    expect(productsUsingIngredient(s, "i-milk")).toEqual([]);
    expect(s.products.every((p) => !(p.ingredients ?? []).some((r) => r.ingredientId === "i-milk"))).toBe(true);
  });
});

describe("suppliers and users", () => {
  it("creates and deactivates suppliers", () => {
    const s = fresh();
    const sup = createSupplier(s, { name: "New Co", phone: "0900" }, NOW);
    expect(setSupplierActive(s, sup.id, false).isActive).toBe(false);
    expect(listSuppliers(s).find((x) => x.id === sup.id)?.isActive).toBe(false);
  });
  it("updateSupplier ignores undefined fields", () => {
    const s = fresh();
    const before = listSuppliers(s).find((x) => x.id === "sup-nova")!;
    const after = updateSupplier(s, "sup-nova", { name: undefined, phone: "0999" });
    expect(after.name).toBe(before.name);
    expect(after.phone).toBe("0999");
  });
  it("lists users without passwords, with username", () => {
    const u = listUsers(fresh());
    expect(u.find((x) => x.id === "u-owner")?.username).toBe("owner");
    expect(u[0]).not.toHaveProperty("password");
  });
  it("creates users, rejecting duplicates", () => {
    const s = fresh();
    const u = createUser(s, { username: "newbie", email: "newbie@gunita.local", password: "secret123", fullName: "New Bie", role: "barista" }, NOW);
    expect(u.username).toBe("newbie");
    expect(code(() => createUser(s, { username: "NEWBIE", email: "x@gunita.local", password: "secret123", fullName: "Dup", role: "barista" }, NOW))).toMatch(/^VALIDATION/);
  });
  it("blocks demoting the only owner and self-deactivation", () => {
    const s = fresh();
    expect(code(() => updateUser(s, "u-owner", { role: "barista" }, "u-juan"))).toBe("FORBIDDEN:At least one active Owner must remain.");
    expect(code(() => updateUser(s, "u-juan", { isActive: false }, "u-juan"))).toBe("FORBIDDEN:You can't deactivate your own account.");
    expect(updateUser(s, "u-juan", { fullName: "Juan D", password: "newpass123" }, "u-owner").fullName).toBe("Juan D");
  });
});
