"use client";

import React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Button, DataTable, StatusBadge, formatPeso, useConfirm, useToast } from "@gunita/ui";
import { useLiveQuery } from "@/lib/data";
import { USE_MOCKS } from "@/lib/use-mocks";
import { NEXT_STATUS, listTodayOrders, updateOrderStatus } from "@/features/orders/api";

interface SampleOrderRow extends Record<string, unknown> {
  id: string;
  orderNumber: string;
  type: string;
  totalAmount: string;
  status: string;
  createdAt: string;
}

const sampleOrders: SampleOrderRow[] = [
  {
    id: "ord-001",
    orderNumber: "#GK-1082",
    type: "dine-in",
    totalAmount: "₱280.00",
    status: "completed",
    createdAt: "10 mins ago",
  },
  {
    id: "ord-002",
    orderNumber: "#GK-1083",
    type: "take-out",
    totalAmount: "₱160.00",
    status: "preparing",
    createdAt: "3 mins ago",
  },
];

/** Order board (SDS: Owner sees the queue and moves its status). Orders are taken on the POS only. */
export default function OrdersPage() {
  const toast = useToast();
  const confirm = useConfirm();
  const client = useQueryClient();
  const orders = useLiveQuery(["orders"], listTodayOrders, { enabled: !USE_MOCKS });

  const rows: SampleOrderRow[] = USE_MOCKS
    ? sampleOrders
    : (orders.data ?? []).map((o) => ({
        id: String(o.orderId),
        orderNumber: `#${o.orderId}`,
        type: o.orderType ?? "",
        totalAmount: formatPeso(o.total),
        status: o.status,
        createdAt: new Date(o.orderDate).toLocaleTimeString(),
      }));

  const change = async (row: SampleOrderRow, cancel: boolean) => {
    const target = cancel ? "cancelled" : NEXT_STATUS[row.status as keyof typeof NEXT_STATUS];
    if (!target) return;
    if (
      cancel &&
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
      await updateOrderStatus(Number(row.id), target);
      await client.invalidateQueries({ queryKey: ["orders"] });
    } catch (e) {
      toast(e instanceof Error ? e.message : "Could not update the order.", true);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Orders</h1>
          <p className="text-sm text-gray-500">
            View and manage all Gunita Kopi orders
          </p>
        </div>
      </div>

      {orders.error && (
        <p className="text-sm text-red-700">
          {orders.error instanceof Error ? orders.error.message : "Could not load orders."}
        </p>
      )}

      <DataTable<SampleOrderRow>
        columns={[
          { key: "orderNumber", header: "Order #" },
          { key: "type", header: "Type" },
          { key: "totalAmount", header: "Total" },
          {
            key: "status",
            header: "Status",
            render: (row) => <StatusBadge status={String(row.status)} />,
          },
          { key: "createdAt", header: "Time" },
          {
            key: "actions",
            header: "",
            render: (row) =>
              !USE_MOCKS && (row.status === "pending" || row.status === "preparing") ? (
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => void change(row, false)}>
                    {row.status === "pending" ? "Start" : "Complete"}
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => void change(row, true)}>
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
