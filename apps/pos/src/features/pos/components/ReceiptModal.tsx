"use client";

import React from "react";
import type { Order } from "@gunita/contracts/ui";
import { Button, Modal, Receipt } from "@gunita/ui";

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
  return (
    <Modal isOpen onClose={onNewOrder} title="Receipt" sticky>
      <Receipt order={order} shopName={shopName} footer={footer} cashierName={cashierName} pendingSync={pendingSync} />
      <div className="modal-actions">
        <Button onClick={() => window.print()}>Print</Button>
        <Button variant="primary" onClick={onNewOrder}>
          New order
        </Button>
      </div>
    </Modal>
  );
}
