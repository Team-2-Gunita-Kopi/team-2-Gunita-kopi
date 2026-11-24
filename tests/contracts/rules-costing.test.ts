import { describe, expect, it } from "vitest";
import { computeCosting } from "@/contracts/ui";

describe("computeCosting", () => {
  const recipe = [
    { quantity: 18, unitCost: 1.2 },
    { quantity: 150, unitCost: 0.08 },
  ];
  it("computes cost and margin", () => {
    expect(computeCosting(recipe, 6, 145)).toEqual({
      ingredientCost: 33.6,
      packagingCost: 6,
      totalCost: 39.6,
      margin: 105.4,
      marginPercent: 72.69,
    });
  });
  it("margin percent is 0 when price is 0", () => {
    expect(computeCosting(recipe, 6, 0).marginPercent).toBe(0);
  });
});
