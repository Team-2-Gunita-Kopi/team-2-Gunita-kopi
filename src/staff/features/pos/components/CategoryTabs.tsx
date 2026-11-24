"use client";

import React from "react";
import { PRODUCT_CATEGORIES } from "@/contracts/ui";
import type { IconName } from "@/ui";

export const CAT_ICONS: Record<string, IconName> = {
  "Iced Coffee Drinks": "iced",
  "Hot Beverages": "cup",
  "Pastries & Snacks": "pastry",
  "Rice Meals": "rice",
  "Iced Coffee": "iced",
  "Non-Coffee": "iced",
  "Silog Meals": "rice",
  "Shawarma Meals": "rice",
  "Gunita Meals": "rice",
  "French Fries": "pastry",
  Snacks: "pastry",
};

export const ALL = "All";

/** `categories` defaults to the demo categories; real mode passes the saved products' categories. */
export function CategoryTabs({
  active,
  onChange,
  categories = PRODUCT_CATEGORIES,
}: {
  active: string;
  onChange: (c: string) => void;
  categories?: readonly string[];
}) {
  return (
    <div className="cat-tabs">
      {[ALL, ...categories].map((c) => (
        <button key={c} type="button" className="opt" aria-pressed={active === c} onClick={() => onChange(c)}>
          {c}
        </button>
      ))}
    </div>
  );
}
