import { round2 } from "./money";

/** R7: recipe cost, packaging, margin. All outputs rounded to 2dp. */
export function computeCosting(
  recipe: { quantity: number; unitCost: number }[],
  packagingCost: number,
  price: number,
): {
  ingredientCost: number;
  packagingCost: number;
  totalCost: number;
  margin: number;
  marginPercent: number;
} {
  const ingredientCost = round2(
    recipe.reduce((s, r) => s + r.quantity * r.unitCost, 0),
  );
  const totalCost = round2(ingredientCost + packagingCost);
  const margin = round2(price - totalCost);
  const marginPercent = price > 0 ? round2((margin / price) * 100) : 0;
  return {
    ingredientCost,
    packagingCost: round2(packagingCost),
    totalCost,
    margin,
    marginPercent,
  };
}
