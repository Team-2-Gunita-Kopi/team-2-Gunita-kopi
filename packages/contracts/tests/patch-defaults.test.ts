import { describe, expect, it } from "vitest";
import {
  UpdateIngredientRequestSchema,
  UpdateProductRequestSchema,
  UpdateSupplierRequestSchema,
} from "../src";

// Why: an edit that sends one field must change only that field. If defaults were filled in,
// renaming a product could make it available again, or renaming an ingredient could switch its
// add-on off and reset its reorder level.
describe("update bodies never fill defaults", () => {
  it.each([
    ["ingredient", UpdateIngredientRequestSchema, { name: "Beans" }],
    ["product", UpdateProductRequestSchema, { name: "Spanish Latte" }],
    ["supplier", UpdateSupplierRequestSchema, { name: "Bean Co" }],
  ] as const)("%s", (_label, schema, body) => {
    const parsed = (schema as { parse: (v: unknown) => object }).parse(body);
    expect(Object.keys(parsed)).toEqual(Object.keys(body));
  });
});
