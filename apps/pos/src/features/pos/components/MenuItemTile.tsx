"use client";

import React from "react";
import type { PosProduct } from "@gunita/contracts/ui";
import { Icon, formatPeso } from "@gunita/ui";
import { CAT_ICONS } from "./CategoryTabs";

export type Unorderable = "unavailable" | "out_of_stock";

export function MenuItemTile({
  product,
  reason,
  onAdd,
}: {
  product: PosProduct;
  reason?: Unorderable;
  onAdd: (p: PosProduct) => void;
}) {
  const blocked = reason !== undefined;
  return (
    <button
      type="button"
      className="menu-item"
      aria-disabled={blocked ? "true" : undefined}
      onClick={() => {
        if (!blocked) onAdd(product);
      }}
    >
      {product.imageUrl ? (
        <img className="menu-thumb" src={product.imageUrl} alt="" />
      ) : (
        <span className="menu-thumb">
          <Icon name={CAT_ICONS[product.category] ?? "cup"} />
        </span>
      )}
      <span className="menu-body">
        <span className="menu-name">{product.name}</span>
        <span className="menu-tag">{product.description ?? ""}</span>
        <span className="price num">{formatPeso(product.sellingPrice)}</span>
      </span>
      {blocked ? <span className="sold-out">{reason === "out_of_stock" ? "Out of stock" : "Unavailable"}</span> : null}
    </button>
  );
}
