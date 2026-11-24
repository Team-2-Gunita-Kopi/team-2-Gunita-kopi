"use client";

import React from "react";
import { isOrderable, type PosIngredient, type PosProduct } from "@/contracts/ui";
import { MenuItemTile } from "./MenuItemTile";

export function MenuGrid({
  products,
  ingredients,
  onAdd,
}: {
  products: PosProduct[];
  ingredients: PosIngredient[];
  onAdd: (p: PosProduct) => void;
}) {
  const stockById = Object.fromEntries(ingredients.map((i) => [i.id, i.currentStock]));
  if (products.length === 0) return <p className="muted">No products match.</p>;
  return (
    <div className="menu-grid">
      {products.map((p) => {
        const res = isOrderable(p, p.ingredients ?? [], stockById);
        return <MenuItemTile key={p.id} product={p} reason={res.reason} onAdd={onAdd} />;
      })}
    </div>
  );
}
