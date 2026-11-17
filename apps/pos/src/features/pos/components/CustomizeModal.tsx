"use client";

import React, { useId, useState } from "react";
import { QUICK_CHIPS, addonsFor, type CartLine, type OrderAddon, type PosProduct, type ProductCategory } from "@gunita/contracts";
import { Button, Modal, formatPeso } from "@gunita/ui";
import { useCartStore } from "../cart.store";

const splitChips = (s: string): string[] =>
  s
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);

export function CustomizeModal({
  line,
  product,
  stockById,
  onClose,
}: {
  line: CartLine;
  product: PosProduct;
  stockById: Record<string, number>;
  onClose: () => void;
}) {
  const ids = useId();
  const addons = addonsFor(product.category, product.ingredients ?? [], stockById);
  const chips = QUICK_CHIPS[product.category as ProductCategory] ?? [];
  const [picked, setPicked] = useState<OrderAddon[]>(line.addons);
  const [customization, setCustomization] = useState(line.customization);
  const [instructions, setInstructions] = useState(line.specialInstructions);

  const toggleAddon = (a: (typeof addons)[number]) =>
    setPicked((cur) =>
      cur.some((p) => p.ingredientId === a.ingredientId)
        ? cur.filter((p) => p.ingredientId !== a.ingredientId)
        : [...cur, { ingredientId: a.ingredientId, label: a.label, quantity: a.quantity, price: a.price }],
    );

  const toggleChip = (c: string) =>
    setCustomization((cur) => {
      const parts = splitChips(cur);
      return (parts.includes(c) ? parts.filter((p) => p !== c) : [...parts, c]).join(", ");
    });

  const save = () => {
    useCartStore.getState().updateLine(line.lineId, {
      addons: picked,
      customization: customization.trim(),
      specialInstructions: instructions.trim(),
    });
    onClose();
  };

  return (
    <Modal isOpen onClose={onClose} title={`Customize — ${product.name}`}>
      <p className="muted">
        {product.description ? `${product.description} — ` : ""}
        <span className="num">{formatPeso(product.sellingPrice)}</span> base
      </p>
      <div className="opt-group">
        <span className="lbl">Add-ons</span>
        <div className="opt-row">
          {addons.length === 0 ? (
            <span className="muted">No add-ons for this item.</span>
          ) : (
            addons.map((a) => {
              const on = picked.some((p) => p.ingredientId === a.ingredientId);
              return (
                <button
                  key={a.ingredientId}
                  type="button"
                  className="opt"
                  aria-pressed={on}
                  disabled={a.disabled && !on}
                  onClick={() => toggleAddon(a)}
                >
                  {a.label} · +{formatPeso(a.price)}
                  {a.disabled && !on ? <span className="opt-note">Not enough stock</span> : null}
                </button>
              );
            })
          )}
        </div>
      </div>
      <div className="opt-group">
        <label className="lbl" htmlFor={`${ids}-cust`}>
          Customization
        </label>
        <div className="opt-row opt-chips">
          {chips.map((c) => (
            <button
              key={c}
              type="button"
              className="opt qc"
              aria-pressed={splitChips(customization).includes(c)}
              onClick={() => toggleChip(c)}
            >
              {c}
            </button>
          ))}
        </div>
        <textarea
          id={`${ids}-cust`}
          rows={2}
          placeholder="e.g. Sugar 50%, less ice"
          value={customization}
          onChange={(e) => setCustomization(e.target.value)}
        />
      </div>
      <label className="field">
        Special instructions
        <textarea
          rows={2}
          placeholder="e.g. no lid, serve last"
          value={instructions}
          onChange={(e) => setInstructions(e.target.value)}
        />
      </label>
      <div className="modal-actions">
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button variant="primary" onClick={save}>
          Save
        </Button>
      </div>
    </Modal>
  );
}
