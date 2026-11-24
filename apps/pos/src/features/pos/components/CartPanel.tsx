"use client";

import React from "react";
import { Button, Icon, formatPeso, useConfirm } from "@gunita/ui";
import { selectCount, selectTotal, useCartStore } from "../cart.store";
import { CartLineRow } from "./CartLineRow";

export function CartPanel({
  open,
  onCustomize,
  onCharge,
}: {
  open: boolean;
  /** Hook-point for the customize modal (Task 18). */
  onCustomize?: (lineId: string) => void;
  /** Hook-point for the payment modal (Task 19). */
  onCharge?: () => void;
}) {
  const confirm = useConfirm();
  const lines = useCartStore((s) => s.lines);
  const total = useCartStore(selectTotal);
  const count = useCartStore(selectCount);
  const { increment, decrement, remove, clear } = useCartStore.getState();

  const handleClear = async () => {
    if (lines.length === 0) return;
    const ok = await confirm({
      title: "Clear cart",
      message: "Clear all items?",
      confirmLabel: "Clear",
      danger: true,
    });
    if (ok) clear();
  };

  return (
    <aside className={open ? "cart-panel open" : "cart-panel"} aria-label="Cart" data-count={count}>
      <div className="cart-head">
        <h3>Cart</h3>
        <Button variant="ghost" size="sm" onClick={handleClear}>
          Clear
        </Button>
      </div>
      <div className="cart-items">
        {lines.length === 0 ? (
          <div className="cart-empty">No items yet.</div>
        ) : (
          lines.map((l) => (
            <CartLineRow
              key={l.lineId}
              line={l}
              onIncrement={increment}
              onDecrement={decrement}
              onRemove={remove}
              onCustomize={onCustomize}
            />
          ))
        )}
      </div>
      <div className="cart-totals">
        <div className="row">
          <span>Subtotal</span>
          <span className="num">{formatPeso(total)}</span>
        </div>
        <div className="row total">
          <span>Total</span>
          <span className="num">{formatPeso(total)}</span>
        </div>
      </div>
      <Button variant="primary" block disabled={lines.length === 0} onClick={() => onCharge?.()}>
        <Icon name="cash" />
        {`Charge ${formatPeso(total)}`}
      </Button>
    </aside>
  );
}
