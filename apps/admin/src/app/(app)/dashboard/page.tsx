"use client";

import React from "react";
import { StatCard, StatusBadge, formatPeso } from "@gunita/ui";
import { useLiveQuery } from "@/lib/data";
import { USE_MOCKS } from "@/lib/use-mocks";
import { getDashboard } from "@/features/reports/api";

export default function DashboardPage() {
  // FR-36 to FR-39 from the database views. Staff on duty (FR-40) needs attendance data the
  // schema does not have (SRS section 8), so it is not shown.
  const dashboard = useLiveQuery(["dashboard"], getDashboard, { enabled: !USE_MOCKS });
  const d = dashboard.data;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-sm text-gray-500">
          Owner overview of Gunita Kopi operations
        </p>
      </div>

      {dashboard.error && (
        <p className="text-sm text-red-700">
          {dashboard.error instanceof Error ? dashboard.error.message : "Could not load the dashboard."}
        </p>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Today Sales"
          value={d ? formatPeso(d.todaySales) : USE_MOCKS ? "₱14,850.00" : "…"}
          subtitle={d ? d.date : "today"}
        />
        <StatCard
          title="Orders Completed"
          value={d ? String(d.todayCompletedOrders) : USE_MOCKS ? "86" : "…"}
          subtitle="today"
        />
        <StatCard
          title="Pending Orders"
          value={d ? String(d.pendingOrders + d.preparingOrders) : USE_MOCKS ? "4" : "…"}
          subtitle={d ? `${d.pendingOrders} pending, ${d.preparingOrders} preparing` : "in the queue"}
        />
        <StatCard
          title="Low Stock Items"
          value={d ? String(d.stock.lowStock + d.stock.outOfStock) : USE_MOCKS ? "3" : "…"}
          badge={<StatusBadge status="low_stock" label="Attention" />}
          subtitle={d ? `${d.stock.available} ingredients available` : "ingredients need restock"}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
          <h2 className="text-base font-semibold text-gray-900 mb-2">Best Sellers</h2>
          {d && d.bestSellers.length > 0 ? (
            <ol className="text-sm text-gray-700 space-y-1">
              {d.bestSellers.map((b) => (
                <li key={b.productId}>
                  {b.productName}: {b.unitsSold} sold ({formatPeso(b.revenue)})
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-sm text-gray-500">No completed sales yet.</p>
          )}
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
          <h2 className="text-base font-semibold text-gray-900 mb-2">Stock Alerts</h2>
          {d && d.stockAlerts.length > 0 ? (
            <ul className="text-sm text-gray-700 space-y-1">
              {d.stockAlerts.map((s) => (
                <li key={s.ingredientId}>
                  {s.ingredientName}: {s.currentStock} {s.unit ?? ""} (reorder at {s.reorderLevel})
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-gray-500">All ingredients are above their reorder level.</p>
          )}
        </div>
      </div>
    </div>
  );
}
