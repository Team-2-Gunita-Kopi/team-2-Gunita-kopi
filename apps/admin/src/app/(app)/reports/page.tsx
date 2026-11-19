"use client";

import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button, DataTable, StatCard, StatusBadge, Tabs, formatPeso } from "@gunita/ui";
import type { ReportType } from "@gunita/contracts";
import { USE_MOCKS } from "@/lib/use-mocks";
import { getReport, toCsv } from "@/features/reports/api";
import { manilaToday } from "@/features/orders/api";

type Row = Record<string, unknown>;

function daysAgo(n: number): string {
  return manilaToday(new Date(Date.now() - n * 86_400_000));
}

/** Report query per tab (FR-31 to FR-34). */
const QUERY: Record<ReportType, () => string> = {
  daily: () => `from=${daysAgo(29)}&to=${manilaToday()}`,
  monthly: () => `from=${manilaToday().slice(0, 4)}-01-01&to=${manilaToday()}`,
  "best-sellers": () => "limit=20",
  "stock-status": () => "",
};

const SAMPLE: Record<ReportType, Row[]> = {
  daily: [{ date: "2026-11-18", orders: 112, itemsSold: 180, totalSales: "₱18,420.00" }],
  monthly: [{ month: "2026-11", orders: 2410, totalSales: "₱384,150.00" }],
  "best-sellers": [
    { rank: "#1", item: "Spanish Latte", qty: 450, revenue: "₱63,000.00", profit: "₱43,875.00" },
    { rank: "#2", item: "Caramel Macchiato", qty: 380, revenue: "₱57,000.00", profit: "₱38,684.00" },
  ],
  "stock-status": [
    { ingredient: "Whole Milk", stock: "3.0 L", reorder: "10.0 L", status: "low-stock" },
    { ingredient: "Espresso Blend", stock: "8.5 kg", reorder: "5.0 kg", status: "available" },
  ],
};

export default function ReportsPage() {
  const [activeTab, setActiveTab] = useState<ReportType>("daily");
  const report = useQuery({
    queryKey: ["report", activeTab],
    enabled: !USE_MOCKS,
    queryFn: () => getReport(activeTab, QUERY[activeTab]()),
  });

  const tabs = [
    { id: "daily", label: "Daily Sales" },
    { id: "monthly", label: "Monthly Summary" },
    { id: "best-sellers", label: "Best Sellers" },
    { id: "stock-status", label: "Stock Status" },
  ];

  const r = report.data;
  const today = manilaToday();
  let rows: Row[] = USE_MOCKS ? SAMPLE[activeTab] : [];
  if (r?.type === "daily") {
    rows = r.rows.map((d) => ({ date: d.date, orders: d.orderCount, itemsSold: d.itemsSold, totalSales: formatPeso(d.totalSales) }));
  } else if (r?.type === "monthly") {
    rows = r.rows.map((m) => ({ month: m.month.slice(0, 7), orders: m.orderCount, totalSales: formatPeso(m.totalSales) }));
  } else if (r?.type === "best-sellers") {
    rows = r.rows.map((b, i) => ({
      rank: `#${i + 1}`,
      item: b.productName,
      qty: b.unitsSold,
      revenue: formatPeso(b.revenue),
      // Estimate: the current costing, not the cost at the time of sale (not stored).
      profit: b.currentUnitCost === null ? "" : formatPeso(b.revenue - b.unitsSold * b.currentUnitCost),
    }));
  } else if (r?.type === "stock-status") {
    rows = r.rows.map((s) => ({
      ingredient: s.ingredientName,
      stock: `${s.currentStock} ${s.unit ?? ""}`.trim(),
      reorder: `${s.reorderLevel} ${s.unit ?? ""}`.trim(),
      status: s.stockStatus,
    }));
  }

  const todayRow = r?.type === "daily" ? r.rows.find((d) => d.date === today) : undefined;
  const monthRow = r?.type === "monthly" ? r.rows.find((m) => m.month.slice(0, 7) === today.slice(0, 7)) : undefined;

  const exportCsv = () => {
    const blob = new Blob([toCsv(rows)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `gunita-kopi-${activeTab}-${today}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const columns: Record<ReportType, { key: string; header: string; render?: (row: Row) => React.ReactNode }[]> = {
    daily: [
      { key: "date", header: "Date" },
      { key: "orders", header: "Orders" },
      { key: "itemsSold", header: "Items Sold" },
      { key: "totalSales", header: "Total Sales" },
    ],
    monthly: [
      { key: "month", header: "Month" },
      { key: "orders", header: "Orders" },
      { key: "totalSales", header: "Total Sales" },
    ],
    "best-sellers": [
      { key: "rank", header: "Rank" },
      { key: "item", header: "Product" },
      { key: "qty", header: "Units Sold" },
      { key: "revenue", header: "Gross Revenue" },
      { key: "profit", header: "Est. Gross Profit" },
    ],
    "stock-status": [
      { key: "ingredient", header: "Ingredient" },
      { key: "stock", header: "Current Stock" },
      { key: "reorder", header: "Reorder Level" },
      {
        key: "status",
        header: "Alert",
        render: (row) =>
          row.status === "out-of-stock" ? (
            <StatusBadge status="out_of_stock" label="Out of Stock" />
          ) : row.status === "low-stock" ? (
            <StatusBadge status="low_stock" label="Low Stock Alert" />
          ) : (
            <StatusBadge status="completed" label="Normal" />
          ),
      },
    ],
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            Reports & Analytics
          </h1>
          <p className="text-sm text-gray-500">
            Business performance, sales trends, and inventory health
          </p>
        </div>
        <Button variant="outline" onClick={exportCsv} disabled={rows.length === 0}>
          Export CSV
        </Button>
      </div>

      <Tabs tabs={tabs} activeTab={activeTab} onChange={(id) => setActiveTab(id as ReportType)} />

      {report.error && (
        <p className="text-sm text-red-700">
          {report.error instanceof Error ? report.error.message : "Could not load the report."}
        </p>
      )}

      {activeTab === "daily" && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <StatCard title="Daily Revenue" value={formatPeso(todayRow?.totalSales ?? 0)} subtitle="Today" />
          <StatCard title="Total Tickets" value={String(todayRow?.orderCount ?? 0)} subtitle="Completed orders today" />
          <StatCard
            title="Last 30 Days"
            value={formatPeso(r?.type === "daily" ? r.totals.totalSales : 0)}
            subtitle={`${r?.type === "daily" ? r.totals.orderCount : 0} orders`}
          />
        </div>
      )}

      {activeTab === "monthly" && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <StatCard title="MTD Revenue" value={formatPeso(monthRow?.totalSales ?? 0)} subtitle="Current Month" />
          <StatCard title="MTD Orders" value={String(monthRow?.orderCount ?? 0)} subtitle="Completed orders" />
          <StatCard
            title="Year to Date"
            value={formatPeso(r?.type === "monthly" ? r.totals.totalSales : 0)}
            subtitle={`${r?.type === "monthly" ? r.totals.orderCount : 0} orders`}
          />
        </div>
      )}

      <DataTable<Row>
        columns={columns[activeTab]}
        data={rows}
        keyExtractor={(row) => String(row.rank ?? row.date ?? row.month ?? row.ingredient)}
      />
    </div>
  );
}
