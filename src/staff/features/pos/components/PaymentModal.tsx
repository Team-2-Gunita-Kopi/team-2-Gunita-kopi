"use client";

import React, { useRef, useState } from "react";
import { computeChange, parseAmount, type OrderType } from "@/contracts/ui";
import { Button, Icon, Input, Modal, Seg, formatPeso } from "@/ui";

const TYPES: { value: OrderType; label: string }[] = [
  { value: "dine-in", label: "Dine-in" },
  { value: "take-out", label: "Take-out" },
  { value: "pre-order", label: "Pre-order" },
];

export function PaymentModal({
  total,
  onConfirm,
  onClose,
}: {
  total: number;
  onConfirm: (input: { type: OrderType; paid: number }) => Promise<void>;
  onClose: () => void;
}) {
  const [type, setType] = useState<OrderType>("dine-in");
  const [raw, setRaw] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const busy = useRef(false);

  const paid = parseAmount(raw);
  const result = paid === null ? null : computeChange(total, paid);
  const valid = paid !== null && result?.ok === true;
  const error = result && !result.ok ? result.error : undefined;

  const confirm = async () => {
    if (busy.current || !valid || paid === null) return;
    busy.current = true;
    setSubmitting(true);
    setFailure(null);
    try {
      await onConfirm({ type, paid });
    } catch (e) {
      setFailure(e instanceof Error ? e.message : "Could not save the order.");
      busy.current = false;
      setSubmitting(false);
    }
  };

  return (
    <Modal isOpen onClose={onClose} title="Payment" sticky={submitting}>
      <div className="pay-panel">
        <div className="pay-type">
          <span className="pay-label">Order type</span>
          <Seg label="Order type" options={TYPES} value={type} onChange={setType} />
        </div>
        <div className="pay-row">
          <span className="muted">Total due</span>
          <div className="due num">{formatPeso(total)}</div>
        </div>
        <div className="pay-row">
          <span className="muted">Payment method</span>
          <div className="pay-cash">
            <Icon name="cash" aria-hidden="true" />
            Cash
          </div>
        </div>
        <Input
          label="Amount paid"
          inputMode="decimal"
          autoComplete="off"
          value={raw}
          error={error}
          onChange={(e) => setRaw(e.target.value)}
        />
        <div className="pay-row">
          <span className="muted">Change</span>
          <div className="change-out num" aria-live="polite">
            {result?.ok ? formatPeso(result.change) : formatPeso(0)}
          </div>
        </div>
        {failure ? <p role="alert">{failure}</p> : null}
      </div>
      <div className="modal-actions">
        <Button onClick={onClose} disabled={submitting}>
          Back
        </Button>
        <Button variant="primary" disabled={!valid || submitting} onClick={confirm}>
          <Icon name="cash" aria-hidden="true" />
          Confirm payment
        </Button>
      </div>
    </Modal>
  );
}
