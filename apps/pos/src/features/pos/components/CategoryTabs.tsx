"use client";

import React from "react";
import { PRODUCT_CATEGORIES } from "@gunita/contracts/ui";
import { Icon, type IconName } from "@gunita/ui";

export const CAT_ICONS: Record<string, IconName> = {
  "Iced Coffee Drinks": "iced",
  "Hot Beverages": "cup",
  "Pastries & Snacks": "pastry",
  "Rice Meals": "rice",
};

export const ALL = "All";

export function CategoryTabs({ active, onChange }: { active: string; onChange: (c: string) => void }) {
  return (
    <div className="cat-tabs">
      {[ALL, ...PRODUCT_CATEGORIES].map((c) => (
        <button key={c} type="button" className="opt" aria-pressed={active === c} onClick={() => onChange(c)}>
          {CAT_ICONS[c] ? <Icon name={CAT_ICONS[c]} width={16} height={16} /> : null} {c}
        </button>
      ))}
    </div>
  );
}
