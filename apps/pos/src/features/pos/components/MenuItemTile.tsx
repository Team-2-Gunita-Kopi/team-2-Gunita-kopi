"use client";

import React from "react";
import { withBasePath } from "@/lib/base-path";
import type { PosProduct } from "@gunita/contracts/ui";
import { Icon, formatPeso, type IconName } from "@gunita/ui";
import { CAT_ICONS } from "./CategoryTabs";

// Category glyphs exported from the Figma Staff POS mockups (apps/pos/public/icons).
const CAT_ART: Partial<Record<IconName, { src: string; width: number; height: number }>> = {
  iced: { src: withBasePath("/icons/cat-iced.svg"), width: 21, height: 40 },
  pastry: { src: withBasePath("/icons/cat-pastry.svg"), width: 40, height: 44 },
  rice: { src: withBasePath("/icons/cat-rice.svg"), width: 50, height: 23 },
};

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
  const iconName = CAT_ICONS[product.category] ?? "cup";
  const art = CAT_ART[iconName];
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
          {art ? (
            <img className="menu-cat-art" src={art.src} width={art.width} height={art.height} alt="" />
          ) : (
            <Icon name={iconName} />
          )}
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
