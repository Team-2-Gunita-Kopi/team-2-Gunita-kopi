"use client";

import React from "react";
import { useRouter } from "next/navigation";
import {
  Button,
  HBarChart,
  StatCard,
  StatusBadge,
  formatPeso,
  formatQueueNumber,
} from "@gunita/ui";
import type { DashboardStats } from "@gunita/contracts";
import { useLiveQuery } from "@/lib/data";
import { USE_MOCKS } from "@/lib/use-mocks";
import { getDashboard } from "@/features/reports/api";

const SAMPLE: Pick<
  DashboardStats,
  | "todaySales"
  | "todayOrdersCount"
  | "pendingOrders"
  | "preparingOrders"
  | "bestSellers"
  | "stockAlerts"
  | "recentOrders"
> = {
  todaySales: 1130,
  todayOrdersCount: 4,
  pendingOrders: 1,
  preparingOrders: 0,
  bestSellers: [
    {
      productId: 1,
      productName: "Iced Spanish Latte",
      unitsSold: 2,
      revenue: 320,
      currentUnitCost: null,
    },
    {
      productId: 2,
      productName: "Longsilog",
      unitsSold: 2,
      revenue: 420,
      currentUnitCost: null,
    },
    {
      productId: 3,
      productName: "Ensaymada",
      unitsSold: 2,
      revenue: 170,
      currentUnitCost: null,
    },
    {
      productId: 4,
      productName: "Iced Americano",
      unitsSold: 1,
      revenue: 95,
      currentUnitCost: null,
    },
    {
      productId: 5,
      productName: "Tapsilog",
      unitsSold: 1,
      revenue: 125,
      currentUnitCost: null,
    },
  ],
  stockAlerts: [
    {
      ingredientId: 1,
      ingredientName: "Hazelnut syrup",
      currentStock: 0,
      unit: "mL",
      reorderLevel: 100,
      stockStatus: "out-of-stock",
    },
    {
      ingredientId: 2,
      ingredientName: "Cup lids",
      currentStock: 140,
      unit: "pcs",
      reorderLevel: 200,
      stockStatus: "low-stock",
    },
    {
      ingredientId: 3,
      ingredientName: "Ube halaya",
      currentStock: 500,
      unit: "g",
      reorderLevel: 700,
      stockStatus: "low-stock",
    },
    {
      ingredientId: 4,
      ingredientName: "Longganisa",
      currentStock: 700,
      unit: "g",
      reorderLevel: 1000,
      stockStatus: "low-stock",
    },
  ],
  recentOrders: [
    {
      orderId: 12,
      orderDate: "2026-11-20T14:22:00+08:00",
      orderType: "dine-in",
      status: "preparing",
      itemCount: 1,
      total: 160,
    },
    {
      orderId: 11,
      orderDate: "2026-11-20T12:59:00+08:00",
      orderType: "take-out",
      status: "completed",
      itemCount: 2,
      total: 420,
    },
    {
      orderId: 10,
      orderDate: "2026-11-20T12:47:00+08:00",
      orderType: "take-out",
      status: "pending",
      itemCount: 1,
      total: 255,
    },
    {
      orderId: 9,
      orderDate: "2026-11-20T12:16:00+08:00",
      orderType: "take-out",
      status: "completed",
      itemCount: 1,
      total: 295,
    },
  ],
};

function orderTime(date: string): string {
  return new Date(date).toLocaleTimeString("en-PH", {
    timeZone: "Asia/Manila",
    hour: "numeric",
    minute: "2-digit",
  });
}

function orderTypeLabel(
  type: DashboardStats["recentOrders"][number]["orderType"],
): string {
  if (!type) return "—";
  return type === "pre-order"
    ? "Pre-order"
    : type === "dine-in"
      ? "Dine-in"
      : "Take-out";
}

export default function DashboardPage() {
  const router = useRouter();
  // FR-36 to FR-39 from the database views. Staff on duty (FR-40) needs attendance data the
  // schema does not have (SRS section 8), so it is not shown.
  const dashboard = useLiveQuery(["dashboard"], getDashboard, {
    enabled: !USE_MOCKS,
  });
  const d = dashboard.data ?? (USE_MOCKS ? SAMPLE : undefined);
  const topProducts = d?.bestSellers ?? [];
  const stockAlerts = d?.stockAlerts ?? [];
  const recentOrders = d?.recentOrders ?? [];

  return (
    <div className="space-y-4">
      <header className="product-page-header">
        <div>
          <p className="product-page-kicker">Gunita Kopi · Overview</p>
          <h1>Dashboard</h1>
        </div>
      </header>

      {dashboard.error && (
        <p className="text-sm text-[var(--danger)]">
          {dashboard.error instanceof Error
            ? dashboard.error.message
            : "Could not load the dashboard."}
        </p>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <StatCard
          title="Today's Sales"
          value={d ? formatPeso(d.todaySales) : "…"}
        />
        <div className="kpi">
          <div className="lbl">Orders Today</div>
          <div className="val num" style={{ color: "var(--coffee)" }}>
            {d ? d.todayOrdersCount : "…"}
          </div>
        </div>
        <div className="kpi">
          <div className="lbl">Pending / Preparing</div>
          <div className="val num warn">
            {d ? d.pendingOrders + d.preparingOrders : "…"}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-3">
        <section className="chart-card">
          <h2>Top products today</h2>
          {topProducts.length > 0 ? (
            <HBarChart
              rows={topProducts.map((product) => ({
                label: product.productName,
                value: product.unitsSold,
              }))}
            />
          ) : (
            <p className="muted">
              {d ? "No completed sales today." : "Loading top products…"}
            </p>
          )}
        </section>

        <section className="chart-card">
          <h2>Low stock alerts</h2>
          {stockAlerts.length > 0 ? (
            <ul className="space-y-2">
              {stockAlerts.map((item) => {
                const outOfStock = item.stockStatus === "out-of-stock";
                return (
                  <li
                    key={item.ingredientId}
                    className="flex items-center gap-2 text-sm"
                  >
                    <StatusBadge
                      status={outOfStock ? "out_of_stock" : "low_stock"}
                      label={outOfStock ? "Out of Stock" : "Low Stock"}
                      withIcon
                    />
                    <span className="min-w-0 flex-1 truncate">
                      {item.ingredientName}{" "}
                      <span className="muted num">
                        {item.currentStock} {item.unit ?? ""}
                      </span>
                    </span>
                    <Button size="sm" onClick={() => router.push("/inventory")}>
                      Restock
                    </Button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="muted">
              {d ? "No low-stock items." : "Loading stock alerts…"}
            </p>
          )}
        </section>
      </div>

      <section className="chart-card">
        <h2>Recent orders</h2>
        {recentOrders.length > 0 ? (
          <div className="space-y-0">
            {recentOrders.map((order) => (
              <div
                key={order.orderId}
                className="grid grid-cols-2 sm:grid-cols-[80px_120px_1fr_140px_100px_70px] items-center gap-2 border-b border-[var(--muted)] px-2 py-2 last:border-b-0 text-sm"
              >
                <span className="num text-right">
                  {formatQueueNumber(order.orderId)}
                </span>
                <span className="muted">{orderTime(order.orderDate)}</span>
                <span>{orderTypeLabel(order.orderType)}</span>
                <span>
                  <StatusBadge status={order.status} />
                </span>
                <span className="num text-right">
                  {formatPeso(order.total)}
                </span>
                <span className="muted">Cash</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="muted">
            {d ? "No recent orders." : "Loading recent orders…"}
          </p>
        )}
      </section>
    </div>
  );
}
