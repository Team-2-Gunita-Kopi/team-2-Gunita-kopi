"use client";

import React from "react";
import { lineTotal, type CartLine } from "@/contracts/ui";
import { Button, Icon, formatPeso } from "@/ui";

export function lineMeta(l: CartLine): string {
  const parts = [
    ...l.addons.map((a) => `+ ${a.label}`),
    ...(l.customization ? [l.customization] : []),
    ...(l.specialInstructions ? [`“${l.specialInstructions}”`] : []),
  ];
  return parts.join(" · ") || "Standard";
}

export function CartLineRow({
  line,
  onIncrement,
  onDecrement,
  onRemove,
  onCustomize,
}: {
  line: CartLine;
  onIncrement: (id: string) => void;
  onDecrement: (id: string) => void;
  onRemove: (id: string) => void;
  /** Hook-point for the customize modal (Task 18). */
  onCustomize?: (id: string) => void;
}) {
  return (
    <div className="cart-line">
      <div className="grow">
        <div className="name">{line.productName}</div>
        <div className="meta">{lineMeta(line)}</div>
        <Button variant="ghost" size="sm" className="cust-btn" onClick={() => onCustomize?.(line.lineId)}>
          Customize
        </Button>
      </div>
      <div className="cart-side">
        <div className="stepper">
          <button type="button" aria-label={`Decrease ${line.productName}`} onClick={() => onDecrement(line.lineId)}>
            −
          </button>
          <span className="qv">{line.quantity}</span>
          <button type="button" aria-label={`Increase ${line.productName}`} onClick={() => onIncrement(line.lineId)}>
            +
          </button>
        </div>
        <span className="num line-tot">{formatPeso(lineTotal(line))}</span>
        <button
          type="button"
          className="btn btn-ghost icon-btn btn-sm"
          aria-label={`Remove ${line.productName}`}
          onClick={() => onRemove(line.lineId)}
        >
          <Icon name="trash" />
        </button>
      </div>
    </div>
  );
}
