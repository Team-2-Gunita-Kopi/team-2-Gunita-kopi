"use client";

import React, { useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { Order, OrderStatus } from "@/contracts";
import {
  CANCEL_REASONS,
  ORDER_STATUS_LABEL,
  ORDER_TYPE_LABEL,
  canCancel as canCancelStatus,
  orderRefund,
} from "@/contracts/ui";
import type { Order as ReceiptOrder } from "@/contracts/ui";
import {
  Button,
  Dialog,
  Icon,
  Input,
  Receipt,
  Select,
  StatusBadge,
  formatPeso,
  formatQueueNumber,
  useToast,
} from "@/ui";
import { USE_MOCKS } from "@/staff/lib/use-mocks";
import {
  cancelOrderItems,
  getOrder,
  NEXT_STATUS,
  updateOrderStatus,
} from "@/staff/features/orders/api";

const DATE_TIME_FORMATTER = new Intl.DateTimeFormat("en-US", {
  timeZone: "Asia/Manila",
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

function displayDateTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : DATE_TIME_FORMATTER.format(date);
}

function displayLabel(value: string): string {
  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function receiptPaymentMethod(
  value: string | null | undefined,
): ReceiptOrder["paymentMethod"] {
  switch (value) {
    case "cash":
    case "card":
    case "qr_code":
    case "other":
      return value;
    default:
      return "other";
  }
}

function groupItems(order: Order) {
  const groups: { item: Order["items"][number]; addons: Order["items"] }[] = [];
  for (const item of [...order.items].sort((a, b) => a.lineId - b.lineId)) {
    const parent = groups[groups.length - 1];
    if (item.isAddon && parent) parent.addons.push(item);
    else groups.push({ item, addons: [] });
  }
  return groups;
}

function toReceiptOrder(order: Order): ReceiptOrder {
  const items: ReceiptOrder["items"] = [];
  // Cancelled items are left out; the Refunded line makes paid = total + change + refunded.
  const active = order.items.filter((line) => line.status !== "cancelled");
  for (const line of active.sort((a, b) => a.lineId - b.lineId)) {
    const parent = items[items.length - 1];
    if (line.isAddon && parent) {
      parent.addons = [
        ...(parent.addons ?? []),
        {
          ingredientId: String(line.ingredientId ?? ""),
          label: line.name ?? "Add-on",
          quantity: parent.quantity > 0 ? line.quantity / parent.quantity : 0,
          price: line.unitPrice,
        },
      ];
      parent.subtotal =
        Math.round((parent.subtotal + line.subtotal) * 100) / 100;
      continue;
    }
    items.push({
      id: String(line.lineId),
      productId: String(line.productId ?? ""),
      productName: line.name ?? "Item",
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      subtotal: line.subtotal,
      addons: [],
      customization: line.customization ?? undefined,
      specialInstructions: line.specialInstructions ?? undefined,
    });
  }
  return {
    id: String(order.orderId),
    clientTxId: order.clientTxId,
    orderNumber: formatQueueNumber(order.orderId),
    status: order.status,
    type: order.orderType ?? "dine-in",
    items,
    totalAmount: order.total,
    taxAmount: 0,
    discountAmount: 0,
    paidAmount: order.payment?.amountPaid ?? 0,
    changeAmount: order.payment?.changeAmount ?? 0,
    refundedAmount: orderRefund(order.items).amount,
    paymentMethod: receiptPaymentMethod(order.payment?.paymentMethod ?? "cash"),
    createdAt: order.orderDate,
    createdBy: String(order.cashierId ?? ""),
    cashierName: order.cashierName ?? undefined,
  };
}

export default function PosOrderDetailsPage() {
  const { id } = useParams<{ id: string }>();
  const orderId = Number(id);
  const validId = Number.isSafeInteger(orderId) && orderId > 0;
  const toast = useToast();
  const client = useQueryClient();
  const [receiptOpen, setReceiptOpen] = useState(false);
  const [showSlip, setShowSlip] = useState(false);
  // Which cancel pop-up is open: chosen items, or the whole order.
  const [cancelMode, setCancelMode] = useState<"items" | "order" | null>(null);
  // Items ticked in the Cancel items pop-up: lineId -> how many to cancel.
  const [picked, setPicked] = useState<Record<number, number>>({});
  const [reason, setReason] = useState("");
  const [reasonNote, setReasonNote] = useState("");
  const orderQuery = useQuery({
    queryKey: ["pos-order", orderId],
    enabled: !USE_MOCKS && validId,
    queryFn: () => getOrder(orderId),
  });
  const order = orderQuery.data;
  const items = useMemo(() => (order ? groupItems(order) : []), [order]);
  const receiptOrder = useMemo(
    () => (order ? toReceiptOrder(order) : null),
    [order],
  );
  const nextStatus = order ? NEXT_STATUS[order.status] : undefined;
  // Only while pending: once preparing the customer pays for the order.
  const canCancel = order ? canCancelStatus(order.status) : false;
  const activeItems = items.filter(({ item }) => item.status !== "cancelled");
  const activeUnits = activeItems.reduce((n, { item }) => n + item.quantity, 0);
  // With one item left, "Cancel order" does the same thing.
  const canCancelItems = canCancel && activeUnits > 1;
  const refund = useMemo(
    () => (order ? orderRefund(order.items) : { amount: 0, reason: null }),
    [order],
  );
  const reasonText = reason === "Other" ? reasonNote.trim() : reason;

  const openCancel = (mode: "items" | "order") => {
    setPicked({});
    setReason("");
    setReasonNote("");
    setCancelMode(mode);
  };

  const changeStatus = async (status: OrderStatus) => {
    if (!order) return;
    try {
      const updated = await updateOrderStatus(order.orderId, status);
      toast(`Order marked ${ORDER_STATUS_LABEL[status]}.`);
      client.setQueryData(["pos-order", orderId], updated);
      await client.invalidateQueries({ queryKey: ["pos-orders"] });
    } catch (error) {
      toast(
        error instanceof Error ? error.message : "Could not update the order.",
        true,
      );
    }
  };

  // The whole order is cancelled as all of its items, so its reason and refund are kept the same way.
  const cancelItems = async () => {
    if (!order || !cancelMode) return;
    const chosen =
      cancelMode === "order"
        ? activeItems.map(({ item }) => ({
            lineId: item.lineId,
            quantity: item.quantity,
          }))
        : Object.entries(picked).map(([lineId, quantity]) => ({
            lineId: Number(lineId),
            quantity,
          }));
    try {
      const updated = await cancelOrderItems(order.orderId, chosen, reasonText);
      toast(cancelMode === "order" ? "Order cancelled." : "Items cancelled.");
      setCancelMode(null);
      setPicked({});
      client.setQueryData(["pos-order", orderId], updated);
      await client.invalidateQueries({ queryKey: ["pos-orders"] });
    } catch (error) {
      toast(
        error instanceof Error ? error.message : "Could not cancel the items.",
        true,
      );
    }
  };

  if (USE_MOCKS) {
    return (
      <div className="order-detail-page">
        <p className="muted" role="status">
          Order details are available when the POS app is connected to the API.
        </p>
        <Link href="/staff/orders" className="btn btn-sm">
          Back to orders
        </Link>
      </div>
    );
  }

  if (!validId) {
    return (
      <p className="recipe-message error" role="alert">
        Invalid order number.
      </p>
    );
  }

  if (orderQuery.isPending) {
    return <p role="status">Loading order details…</p>;
  }

  if (orderQuery.error || !order) {
    return (
      <div className="order-detail-page">
        <p className="recipe-message error" role="alert">
          {orderQuery.error instanceof Error
            ? orderQuery.error.message
            : "Order not found."}
        </p>
        <Link href="/staff/orders" className="btn btn-sm">
          Back to orders
        </Link>
      </div>
    );
  }

  return (
    <div className="order-detail-page">
      <header className="order-detail-header">
        <div>
          <p className="product-page-kicker">Gunita · Order</p>
          <h1>Order {formatQueueNumber(order.orderId)}</h1>
        </div>
        <div className="order-detail-actions">
          <Link href="/staff/orders" className="btn btn-sm">
            <Icon name="back" />
            Back
          </Link>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setShowSlip(false);
              setReceiptOpen(true);
            }}
          >
            <Icon name="printer" />
            Receipt
          </Button>
          {nextStatus ? (
            <Button
              size="sm"
              variant="primary"
              onClick={() => void changeStatus(nextStatus)}
            >
              {order.status === "pending"
                ? "Pending → Preparing"
                : "Preparing → Completed"}
            </Button>
          ) : null}
          {canCancelItems ? (
            <Button
              size="sm"
              variant="outline"
              onClick={() => openCancel("items")}
            >
              Cancel items
            </Button>
          ) : null}
          {canCancel ? (
            <Button
              size="sm"
              variant="danger"
              onClick={() => openCancel("order")}
            >
              Cancel order
            </Button>
          ) : null}
        </div>
      </header>

      <div className="order-detail-layout">
        <section
          className="card order-detail-card"
          aria-labelledby="order-items-title"
        >
          <h2 id="order-items-title">Items</h2>
          <div className="order-detail-items">
            {items.map(({ item, addons }) => {
              const amount =
                item.subtotal +
                addons.reduce((sum, addon) => sum + addon.subtotal, 0);
              return (
                <div className="order-detail-item" key={item.lineId}>
                  <div className="order-detail-item-description">
                    <strong>
                      {item.quantity}× {item.name ?? "Item"}
                    </strong>
                    {item.status === "cancelled" ? (
                      <StatusBadge status="cancelled" />
                    ) : null}
                    {item.customization ? (
                      <span>{item.customization}</span>
                    ) : null}
                    {item.specialInstructions ? (
                      <span>Note: {item.specialInstructions}</span>
                    ) : null}
                    {addons.map((addon) => (
                      <span key={addon.lineId}>
                        + {addon.quantity}× {addon.name ?? "Add-on"}
                      </span>
                    ))}
                  </div>
                  <span className="num">{formatPeso(amount)}</span>
                </div>
              );
            })}
            <div className="order-detail-total">
              <strong>Total</strong>
              <strong className="num">{formatPeso(order.total)}</strong>
            </div>
          </div>
        </section>

        <aside className="card order-detail-card order-detail-meta">
          <h2>Details</h2>
          <dl>
            <div>
              <dt>Queue number</dt>
              <dd>{formatQueueNumber(order.orderId)}</dd>
            </div>
            <div>
              <dt>Date &amp; time</dt>
              <dd>{displayDateTime(order.orderDate)}</dd>
            </div>
            <div>
              <dt>Order type</dt>
              <dd>
                {order.orderType ? ORDER_TYPE_LABEL[order.orderType] : "—"}
              </dd>
            </div>
            <div>
              <dt>Status</dt>
              <dd>
                <StatusBadge status={order.status} />
              </dd>
            </div>
            <div>
              <dt>Taken by</dt>
              <dd>{order.cashierName ?? "—"}</dd>
            </div>
          </dl>

          <h2>Payment</h2>
          {order.payment ? (
            <dl>
              <div>
                <dt>Method</dt>
                <dd>{displayLabel(order.payment.paymentMethod)}</dd>
              </div>
              <div>
                <dt>Amount paid</dt>
                <dd className="num">{formatPeso(order.payment.amountPaid)}</dd>
              </div>
              <div>
                <dt>Change</dt>
                <dd className="num">
                  {formatPeso(order.payment.changeAmount)}
                </dd>
              </div>
              {refund.amount > 0 ? (
                <div>
                  <dt>Refunded</dt>
                  <dd className="num">{formatPeso(refund.amount)}</dd>
                </div>
              ) : null}
              {refund.amount > 0 && refund.reason ? (
                <div>
                  <dt>Refund reason</dt>
                  <dd>{refund.reason}</dd>
                </div>
              ) : null}
              <div>
                <dt>Date</dt>
                <dd>{displayDateTime(order.payment.dateTime)}</dd>
              </div>
              <div>
                <dt>Received by</dt>
                <dd>
                  {order.payment.receivedBy === order.cashierId
                    ? (order.cashierName ?? "—")
                    : "—"}
                </dd>
              </div>
            </dl>
          ) : (
            <p className="muted">No payment record.</p>
          )}
        </aside>
      </div>

      <Dialog
        isOpen={cancelMode !== null}
        onClose={() => setCancelMode(null)}
        title={`${cancelMode === "order" ? "Cancel order" : "Cancel items"} — Order ${formatQueueNumber(order.orderId)}`}
      >
        {cancelMode === "order" ? (
          <p>
            The customer gets back {formatPeso(order.total)}. Cancelled orders
            cannot be reopened.
          </p>
        ) : (
          <div className="order-detail-items">
            {activeItems.map(({ item }) => (
              <div className="order-detail-item" key={item.lineId}>
                <label className="order-detail-item-description">
                  <span>
                    <input
                      type="checkbox"
                      checked={item.lineId in picked}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        setPicked((current) => {
                          const next = { ...current };
                          if (checked) next[item.lineId] = item.quantity;
                          else delete next[item.lineId];
                          return next;
                        });
                      }}
                    />{" "}
                    {item.quantity}× {item.name ?? "Item"}
                  </span>
                </label>
                {item.lineId in picked && item.quantity > 1 ? (
                  <input
                    type="number"
                    min={1}
                    max={item.quantity}
                    aria-label={`How many ${item.name ?? "items"} to cancel`}
                    value={picked[item.lineId]}
                    onChange={(e) => {
                      const value = Math.min(
                        item.quantity,
                        Math.max(1, Math.trunc(Number(e.target.value)) || 1),
                      );
                      setPicked((current) => ({
                        ...current,
                        [item.lineId]: value,
                      }));
                    }}
                  />
                ) : (
                  <span className="num">{formatPeso(item.subtotal)}</span>
                )}
              </div>
            ))}
          </div>
        )}
        <Select
          label="Reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          options={[
            { value: "", label: "Choose a reason" },
            ...CANCEL_REASONS.map((r) => ({ value: r, label: r })),
          ]}
        />
        {reason === "Other" ? (
          <Input
            label="Note"
            maxLength={100}
            value={reasonNote}
            onChange={(e) => setReasonNote(e.target.value)}
          />
        ) : null}
        <div className="modal-actions">
          <Button variant="outline" onClick={() => setCancelMode(null)}>
            {cancelMode === "order" ? "Keep order" : "Keep items"}
          </Button>
          <Button
            variant="danger"
            disabled={
              !reasonText ||
              (cancelMode === "items" && Object.keys(picked).length === 0)
            }
            onClick={() => void cancelItems()}
          >
            {cancelMode === "order" ? "Cancel order" : "Cancel selected"}
          </Button>
        </div>
      </Dialog>

      {receiptOrder ? (
        <Dialog
          isOpen={receiptOpen}
          onClose={() => setReceiptOpen(false)}
          title={showSlip ? "Order slip" : "Receipt"}
          wide
        >
          <Receipt
            order={receiptOrder}
            shopName="Gunita Kopi"
            footer="Salamat po! Come again."
            cashierName={order.cashierName ?? "—"}
            slip={showSlip}
          />
          <div className="modal-actions">
            <Button
              variant="outline"
              onClick={() => setShowSlip((current) => !current)}
            >
              {showSlip ? "Show receipt" : "Order slip"}
            </Button>
            <Button onClick={() => window.print()}>
              <Icon name="printer" />
              Print
            </Button>
            <Button variant="primary" onClick={() => setReceiptOpen(false)}>
              Close
            </Button>
          </div>
        </Dialog>
      ) : null}
    </div>
  );
}
