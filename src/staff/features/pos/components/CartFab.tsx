"use client";

import React from "react";
import { Icon, formatPeso } from "@/ui";

export function CartFab({ count, total, onClick }: { count: number; total: number; onClick: () => void }) {
  return (
    <button type="button" className="cart-fab" onClick={onClick}>
      <Icon name="cart" />
      <span>{`Cart · ${count} · ${formatPeso(total)}`}</span>
    </button>
  );
}
