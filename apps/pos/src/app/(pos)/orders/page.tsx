"use client";

import React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, DataTable, StatusBadge, useConfirm, useToast } from "@gunita/ui";
import { USE_MOCKS } from "@/lib/use-mocks";
import { posDb } from "@/offline/db";
import {
  NEXT_STATUS,
  listTodayOrders,
  toOrderBoardRow,
  updateOrderStatus,
  type OrderBoardRow,
} from "@/features/orders/api";

type PosOrderRow = OrderBoardRow;

const samplePosOrders: PosOrderRow[] = [
  {
    id: "tx_1",
    orderId: null,
    orderNumber: "#GK-1085",
    type: "dine-in",
    items: "2x Spanish Latte",
    total: "₱280.00",
    status: "completed",
    syncState: "synced",
  },
  {
    id: "tx_2",
    orderId: null,
    orderNumber: "#GK-1086",
    type: "take-out",
    items: "1x Americano, 1x Croissant",
    total: "₱195.00",
    status: "preparing",
    syncState: "pending",
  },
];

/** Orders still on this device (not yet confirmed by the server, FR-56/FR-60). */
async function queuedRows(): Promise<PosOrderRow[]> {
  const records = await posDb.ordersOutbox.where("status").anyOf("pending", "syncing", "failed").toArray();
  return records.map((r) => ({
    id: r.clientTxId,
    orderId: null,
    orderNumber: r.provisionalNo ?? "Queued",
    type: r.order.type,
    items: r.order.items.map((i) => `${i.quantity}x ${i.productName}`).join(", "),
    total: `₱${r.order.totalAmount.toFixed(2)}`,
    status: "pending",
    syncState: r.status === "failed" ? "failed" : "pending",
  }));
}

export default function PosOrdersPage() {
  const toast = useToast();
  const confirm = useConfirm();
  const client = useQueryClient();
  const orders = useQuery({
    queryKey: ["pos-orders"],
    enabled: !USE_MOCKS,
    refetchInterval: 5000,
    queryFn: async () => [...(await queuedRows()), ...(await listTodayOrders()).map(toOrderBoardRow)],
  });

  const advance = async (row: PosOrderRow, status: "cancel" | "next") => {
    const target = status === "cancel" ? "cancelled" : NEXT_STATUS[row.status as keyof typeof NEXT_STATUS];
    if (row.orderId === null || !target) return;
    if (
      target === "cancelled" &&
      !(await confirm({
        title: "Cancel order",
        message: `Cancel order ${row.orderNumber}? Cancelled orders cannot be reopened.`,
        confirmLabel: "Cancel order",
        danger: true,
      }))
    ) {
      return;
    }
    try {
      await updateOrderStatus(row.orderId, target);
      await client.invalidateQueries({ queryKey: ["pos-orders"] });
    } catch (e) {
      toast(e instanceof Error ? e.message : "Could not update the order.", true);
    }
  };

  const rows = USE_MOCKS ? samplePosOrders : (orders.data ?? []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Today Orders</h1>
          <p className="text-sm text-gray-500">
            Live order queue and outbox sync status
          </p>
        </div>
      </div>

      {orders.error && (
        <p className="text-sm text-red-700">
          {orders.error instanceof Error ? orders.error.message : "Could not load orders."}
        </p>
      )}

      <DataTable<PosOrderRow>
        columns={[
          { key: "orderNumber", header: "Order #" },
          { key: "type", header: "Type" },
          { key: "items", header: "Items" },
          { key: "total", header: "Total" },
          {
            key: "status",
            header: "Status",
            render: (row) => <StatusBadge status={String(row.status)} />,
          },
          {
            key: "syncState",
            header: "Sync",
            render: (row) => (
              <StatusBadge
                status={String(row.syncState)}
                label={String(row.syncState)}
              />
            ),
          },
          {
            key: "actions",
            header: "",
            render: (row) =>
              row.orderId !== null && (row.status === "pending" || row.status === "preparing") ? (
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => void advance(row, "next")}>
                    {row.status === "pending" ? "Start" : "Complete"}
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => void advance(row, "cancel")}>
                    Cancel
                  </Button>
                </div>
              ) : null,
          },
        ]}
        data={rows}
        keyExtractor={(row) => row.id}
      />
    </div>
  );
}
