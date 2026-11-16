"use client";

import React from "react";
import { DataTable, StatusBadge } from "@gunita/ui";

interface PosOrderRow extends Record<string, unknown> {
  id: string;
  orderNumber: string;
  type: string;
  items: string;
  total: string;
  status: string;
  syncState: string;
}

const samplePosOrders: PosOrderRow[] = [
  {
    id: "tx_1",
    orderNumber: "#GK-1085",
    type: "dine-in",
    items: "2x Spanish Latte",
    total: "₱280.00",
    status: "completed",
    syncState: "synced",
  },
  {
    id: "tx_2",
    orderNumber: "#GK-1086",
    type: "take-out",
    items: "1x Americano, 1x Croissant",
    total: "₱195.00",
    status: "preparing",
    syncState: "pending",
  },
];

export default function PosOrdersPage() {
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
        ]}
        data={samplePosOrders}
        keyExtractor={(row) => row.id}
      />
    </div>
  );
}
