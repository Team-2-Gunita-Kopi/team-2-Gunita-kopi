"use client";

import React, { useState } from "react";
import type { Order } from "@/contracts/ui";
import { Button, Modal, Receipt } from "@/ui";

export function ReceiptModal({
  order,
  pendingSync,
  shopName,
  footer,
  cashierName,
  onNewOrder,
}: {
  order: Order;
  pendingSync: boolean;
  shopName: string;
  footer: string;
  cashierName: string;
  onNewOrder: () => void;
}) {
  // FR-08 customer receipt and FR-09 staff order slip: same saved order, Print prints the one shown.
  const [slip, setSlip] = useState(false);
  return (
    <Modal isOpen onClose={onNewOrder} title="Receipt" sticky>
      <Receipt
        order={order}
        shopName={shopName}
        footer={footer}
        cashierName={cashierName}
        pendingSync={pendingSync}
        slip={slip}
      />
      <div className="modal-actions">
        <Button onClick={() => setSlip(!slip)}>{slip ? "Show receipt" : "Order slip"}</Button>
        <Button onClick={() => window.print()}>Print</Button>
        <Button variant="primary" onClick={onNewOrder}>
          New order
        </Button>
      </div>
    </Modal>
  );
}
