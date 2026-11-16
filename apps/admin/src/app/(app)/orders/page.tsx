"use client";

import React from "react";
import { DataTable, StatusBadge } from "@gunita/ui";

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

export default function OrdersPage() {
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
        ]}
        data={sampleOrders}
        keyExtractor={(row) => row.id}
      />
    </div>
  );
}
