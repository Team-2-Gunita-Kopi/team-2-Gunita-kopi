"use client";

import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { BarChart, Button, DataTable, StatCard, StatusBadge, Tabs, formatPeso } from "@gunita/ui";
import type { BestSellerRow, ReportType } from "@gunita/contracts";
import { USE_MOCKS } from "@/lib/use-mocks";
import { getReport, toCsv } from "@/features/reports/api";
import { manilaToday } from "@/features/orders/api";

type Row = Record<string, unknown>;

function daysAgo(n: number): string {
  return manilaToday(new Date(Date.now() - n * 86_400_000));
}

function monthAtOffset(month: string, offset: number): string {
  const [year, monthNumber] = month.split("-").map(Number);
  const date = new Date(Date.UTC(year!, monthNumber! - 1 + offset, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function monthsEndingAt(month: string, source: { month: string; orderCount: number; totalSales: number }[]) {
  const byMonth = new Map(source.map((row) => [row.month.slice(0, 7), row]));
  return Array.from({ length: 12 }, (_, index) => {
    const key = monthAtOffset(month, index - 11);
    const row = byMonth.get(key);
    return { month: key, orderCount: row?.orderCount ?? 0, totalSales: row?.totalSales ?? 0 };
  });
}

/** Report query per tab (FR-31 to FR-34). */
const QUERY: Record<Exclude<ReportType, "monthly" | "best-sellers">, () => string> = {
  daily: () => `from=${daysAgo(29)}&to=${manilaToday()}`,
  "stock-status": () => "",
};

const MOCK_BEST_SELLERS: BestSellerRow[] = [
  { productId: 1, productName: "Salabat", unitsSold: 46, revenue: 3450, currentUnitCost: null },
  { productId: 2, productName: "Tablea Hot Chocolate", unitsSold: 45, revenue: 5850, currentUnitCost: null },
  { productId: 3, productName: "Cheese Pandesal (3 pcs)", unitsSold: 41, revenue: 2255, currentUnitCost: null },
  { productId: 4, productName: "Iced Americano", unitsSold: 39, revenue: 4290, currentUnitCost: null },
  { productId: 5, productName: "Longsilog", unitsSold: 35, revenue: 4900, currentUnitCost: null },
  { productId: 6, productName: "Tapsilog", unitsSold: 34, revenue: 5100, currentUnitCost: null },
  { productId: 7, productName: "Hot Café Latte", unitsSold: 32, revenue: 3840, currentUnitCost: null },
  { productId: 8, productName: "Iced Hazelnut Latte", unitsSold: 32, revenue: 4800, currentUnitCost: null },
  { productId: 9, productName: "Banana Bread", unitsSold: 31, revenue: 1860, currentUnitCost: null },
  { productId: 10, productName: "Iced Ube Latte", unitsSold: 31, revenue: 4805, currentUnitCost: null },
  { productId: 11, productName: "Ensaymada", unitsSold: 29, revenue: 2030, currentUnitCost: null },
  { productId: 12, productName: "Chicken Adobo with Rice", unitsSold: 24, revenue: 3840, currentUnitCost: null },
  { productId: 13, productName: "Iced Caramel Macchiato", unitsSold: 24, revenue: 3600, currentUnitCost: null },
  { productId: 14, productName: "Iced Spanish Latte", unitsSold: 23, revenue: 3335, currentUnitCost: null },
  { productId: 15, productName: "Kapeng Barako", unitsSold: 22, revenue: 1870, currentUnitCost: null },
  { productId: 16, productName: "Cheese Bread", unitsSold: 20, revenue: 1000, currentUnitCost: null },
];

const SAMPLE: Record<ReportType, Row[]> = {
  daily: [{ date: "2026-11-18", orders: 112, itemsSold: 180, totalSales: "₱18,420.00" }],
  monthly: [{ month: "2026-11", orders: 2410, totalSales: "₱384,150.00" }],
  "best-sellers": [],
  "stock-status": [
    { ingredient: "Whole Milk", stock: "3.0 L", reorder: "10.0 L", status: "low-stock" },
    { ingredient: "Espresso Blend", stock: "8.5 kg", reorder: "5.0 kg", status: "available" },
  ],
};

export default function ReportsPage() {
  const [activeTab, setActiveTab] = useState<ReportType>("monthly");
  const [selectedMonth, setSelectedMonth] = useState(() => manilaToday().slice(0, 7));
  const [bestSellersFrom, setBestSellersFrom] = useState(() => daysAgo(6));
  const [bestSellersTo, setBestSellersTo] = useState(() => manilaToday());
  const bestSellerQuery = [
    bestSellersFrom ? `from=${bestSellersFrom}` : "",
    bestSellersTo ? `to=${bestSellersTo}` : "",
    "limit=20",
  ]
    .filter(Boolean)
    .join("&");
  const query =
    activeTab === "monthly"
      ? `from=${monthAtOffset(selectedMonth, -11)}-01&to=${selectedMonth}-01`
      : activeTab === "best-sellers"
        ? bestSellerQuery
        : QUERY[activeTab]();
  const report = useQuery({
    queryKey: ["report", activeTab, query],
    enabled: !USE_MOCKS,
    queryFn: () => getReport(activeTab, query),
  });

  const tabs = [
    { id: "daily", label: "Daily Sales" },
    { id: "monthly", label: "Monthly Sales" },
    { id: "best-sellers", label: "Best Sellers" },
    { id: "stock-status", label: "Stock Status" },
  ];

  const r = report.data;
  const today = manilaToday();
  const monthlySource =
    r?.type === "monthly"
      ? r.rows
      : USE_MOCKS
        ? [{ month: `${today.slice(0, 7)}-01`, orderCount: 2410, totalSales: 384150 }]
        : [];
  const monthlyRows = monthsEndingAt(selectedMonth, monthlySource);
  const bestSellerData =
    r?.type === "best-sellers"
      ? r.rows
      : USE_MOCKS
        ? MOCK_BEST_SELLERS
        : [];
  const bestSellerRows = bestSellerData.map((seller, index) => ({
    rank: index + 1,
    product: seller.productName,
    qtySold: seller.unitsSold,
    sales: formatPeso(seller.revenue),
  }));
  const topFiveBestSellers = bestSellerData.slice(0, 5);
  const maxBestSellerUnits = Math.max(
    ...topFiveBestSellers.map((seller) => seller.unitsSold),
    1,
  );
  let rows: Row[] = USE_MOCKS ? SAMPLE[activeTab] : [];
  if (r?.type === "daily") {
    rows = r.rows.map((d) => ({ date: d.date, orders: d.orderCount, itemsSold: d.itemsSold, totalSales: formatPeso(d.totalSales) }));
  } else if (r?.type === "monthly") {
    rows = monthlyRows.map((m) => ({ month: m.month, orders: m.orderCount, sales: formatPeso(m.totalSales) }));
  } else if (r?.type === "best-sellers") {
    rows = bestSellerRows;
  } else if (r?.type === "stock-status") {
    rows = r.rows.map((s) => ({
      ingredient: s.ingredientName,
      stock: `${s.currentStock} ${s.unit ?? ""}`.trim(),
      reorder: `${s.reorderLevel} ${s.unit ?? ""}`.trim(),
      status: s.stockStatus,
    }));
  }
  if (USE_MOCKS && activeTab === "monthly") {
    rows = monthlyRows.map((m) => ({ month: m.month, orders: m.orderCount, sales: formatPeso(m.totalSales) }));
  }
  if (USE_MOCKS && activeTab === "best-sellers") rows = bestSellerRows;

  const todayRow = r?.type === "daily" ? r.rows.find((d) => d.date === today) : undefined;

  const exportCsv = () => {
    const blob = new Blob([toCsv(rows)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `gunita-kopi-${activeTab}-${today}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const columns: Record<ReportType, { key: string; header: string; render?: (row: Row) => React.ReactNode; className?: string }[]> = {
    daily: [
      { key: "date", header: "Date" },
      { key: "orders", header: "Orders" },
      { key: "itemsSold", header: "Items Sold" },
      { key: "totalSales", header: "Total Sales" },
    ],
    monthly: [
      { key: "month", header: "Month" },
      { key: "orders", header: "Orders", className: "num" },
      { key: "sales", header: "Sales", className: "num" },
    ],
    "best-sellers": [
      { key: "rank", header: "Rank", className: "num" },
      { key: "product", header: "Product" },
      { key: "qtySold", header: "Qty Sold", className: "num" },
      { key: "sales", header: "Sales", className: "num" },
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
          {activeTab === "monthly" || activeTab === "best-sellers" ? (
            <>
              <p className="text-xs uppercase tracking-[0.2em] text-[var(--fg-muted)]">Gunita · Admin</p>
              <h1 className="text-2xl font-bold">
                {activeTab === "monthly" ? "Monthly Sales Report" : "Best Sellers Report"}
              </h1>
            </>
          ) : (
            <>
              <h1 className="text-2xl font-bold text-gray-900">Reports &amp; Analytics</h1>
              <p className="text-sm text-gray-500">Business performance, sales trends, and inventory health</p>
            </>
          )}
        </div>
        <div className="flex flex-wrap items-end justify-end gap-2">
          {activeTab === "monthly" && (
            <label className="field min-w-36">
              Month
              <input type="month" value={selectedMonth} onChange={(event) => setSelectedMonth(event.target.value || selectedMonth)} />
            </label>
          )}
          {activeTab === "best-sellers" && (
            <>
              <label className="field min-w-32">
                From
                <input
                  type="date"
                  value={bestSellersFrom}
                  max={bestSellersTo || undefined}
                  onChange={(event) => setBestSellersFrom(event.target.value)}
                />
              </label>
              <label className="field min-w-32">
                To
                <input
                  type="date"
                  value={bestSellersTo}
                  min={bestSellersFrom || undefined}
                  onChange={(event) => setBestSellersTo(event.target.value)}
                />
              </label>
            </>
          )}
          <Button variant="outline" onClick={exportCsv} disabled={rows.length === 0}>
            Export CSV
          </Button>
          {(activeTab === "monthly" || activeTab === "best-sellers") && (
            <Button variant="outline" onClick={() => window.print()}>
              Print
            </Button>
          )}
        </div>
      </div>

      <Tabs tabs={tabs} activeTab={activeTab} onChange={(id) => setActiveTab(id as ReportType)} />

      {report.isLoading && !USE_MOCKS && <p role="status">Loading report…</p>}
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

      {activeTab === "best-sellers" && (
        <div className="charts best-sellers-layout">
          <section className="chart-card best-sellers-chart" aria-label="Best sellers chart">
            <h2>Top 5 — {bestSellersFrom || "All dates"} to {bestSellersTo || "All dates"}</h2>
            {bestSellerData.length > 0 ? (
              <ol className="best-seller-bars" aria-label="Top five products by units sold">
                {topFiveBestSellers.map((seller) => (
                  <li key={seller.productId} className="best-seller-bar-row">
                    <span className="best-seller-name" title={seller.productName}>{seller.productName}</span>
                    <span className="best-seller-track">
                      <span
                        className="best-seller-fill"
                        style={{ width: `${(seller.unitsSold / maxBestSellerUnits) * 100}%` }}
                      />
                    </span>
                    <span className="best-seller-units">{seller.unitsSold}</span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="muted">No best sellers found for this date range.</p>
            )}
            <div className="legend">
              <span><i className="sw" style={{ background: "var(--coffee)" }} />Units sold</span>
            </div>
          </section>
          <div className="best-sellers-table">
            <DataTable<Row>
              className="tbl-best-sellers"
              columns={columns["best-sellers"]}
              data={rows}
              keyExtractor={(row) => String(row.rank)}
              emptyMessage={report.isLoading ? "Loading best sellers…" : "No best sellers found."}
            />
          </div>
        </div>
      )}

      {activeTab === "monthly" && (
        <div className="space-y-3">
          <section className="chart-card" aria-label="Monthly sales chart">
            <h2>Sales — 12 months ending {selectedMonth}</h2>
            <BarChart values={monthlyRows.map((month) => month.totalSales)} labels={monthlyRows.map((month) => month.month.slice(5, 7))} />
          </section>
          <DataTable<Row>
            columns={columns.monthly}
            data={rows}
            keyExtractor={(row) => String(row.month)}
            emptyMessage={report.isLoading ? "Loading monthly sales…" : "No monthly sales found."}
          />
        </div>
      )}

      {activeTab !== "monthly" && activeTab !== "best-sellers" && (
        <DataTable<Row>
          columns={columns[activeTab]}
          data={rows}
          keyExtractor={(row) => String(row.rank ?? row.date ?? row.month ?? row.ingredient)}
        />
      )}
    </div>
  );
}
