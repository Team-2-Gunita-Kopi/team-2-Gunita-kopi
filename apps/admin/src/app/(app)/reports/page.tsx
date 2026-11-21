"use client";

import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { BarChart, Button, DataTable, Icon, StatusBadge, Tabs, formatPeso, formatQueueNumber } from "@gunita/ui";
import type { BestSellerRow, ReportType } from "@gunita/contracts";
import { USE_MOCKS } from "@/lib/use-mocks";
import { downloadCsv, getReport, toCsv } from "@/features/reports/api";
import { listOrders, manilaToday } from "@/features/orders/api";

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

/** The 7 business days ending on `date` (YYYY-MM-DD), oldest first. */
function weekEndingAt(date: string): string[] {
  const end = Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10)));
  return Array.from({ length: 7 }, (_, i) => new Date(end - (6 - i) * 86_400_000).toISOString().slice(0, 10));
}

const TITLES: Record<ReportType, string> = {
  daily: "Daily Sales Report",
  monthly: "Monthly Sales Report",
  "best-sellers": "Best Sellers Report",
  "stock-status": "Stock Status Report",
};

const TYPE_LABEL: Record<string, string> = { "dine-in": "Dine-in", "take-out": "Take-out", "pre-order": "Pre-order" };

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
  const [activeTab, setActiveTab] = useState<ReportType>("daily");
  const [selectedDate, setSelectedDate] = useState(() => manilaToday());
  const [lowStockOnly, setLowStockOnly] = useState(false);
  const week = weekEndingAt(selectedDate);
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
        : activeTab === "daily"
          ? `from=${week[0]}&to=${selectedDate}`
          : "";
  const report = useQuery({
    queryKey: ["report", activeTab, query],
    enabled: !USE_MOCKS,
    queryFn: () => getReport(activeTab, query),
  });

  // FR-31: the orders taken on the selected day, listed under the daily summary.
  const dayOrders = useQuery({
    queryKey: ["report-day-orders", selectedDate],
    enabled: !USE_MOCKS && activeTab === "daily",
    queryFn: () => listOrders({ date: selectedDate }),
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
  const dailyByDate = new Map(r?.type === "daily" ? r.rows.map((d) => [d.date.slice(0, 10), d]) : []);
  if (r?.type === "daily") {
    rows = week.map((date) => ({
      date,
      orders: dailyByDate.get(date)?.orderCount ?? 0,
      sales: formatPeso(dailyByDate.get(date)?.totalSales ?? 0),
    }));
  } else if (r?.type === "monthly") {
    rows = monthlyRows.map((m) => ({ month: m.month, orders: m.orderCount, sales: formatPeso(m.totalSales) }));
  } else if (r?.type === "best-sellers") {
    rows = bestSellerRows;
  } else if (r?.type === "stock-status") {
    rows = r.rows
      .filter((s) => !lowStockOnly || s.stockStatus !== "available")
      .map((s) => ({
        ingredient: s.ingredientName,
        unit: s.unit ?? "",
        stock: s.currentStock,
        reorder: s.reorderLevel,
        status: s.stockStatus,
      }));
  }
  if (USE_MOCKS && activeTab === "monthly") {
    rows = monthlyRows.map((m) => ({ month: m.month, orders: m.orderCount, sales: formatPeso(m.totalSales) }));
  }
  if (USE_MOCKS && activeTab === "best-sellers") rows = bestSellerRows;

  const dayRow = dailyByDate.get(selectedDate);
  const daySales = dayRow?.totalSales ?? 0;
  const dayCount = dayRow?.orderCount ?? 0;


  const columns: Record<ReportType, { key: string; header: string; render?: (row: Row) => React.ReactNode; className?: string }[]> = {
    daily: [
      { key: "date", header: "Date", className: "mono" },
      { key: "orders", header: "Orders", className: "num" },
      { key: "sales", header: "Sales", className: "num" },
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
      { key: "ingredient", header: "Ingredient", render: (row) => <strong>{String(row.ingredient)}</strong> },
      { key: "unit", header: "Unit" },
      { key: "stock", header: "Current Stock", className: "num" },
      { key: "reorder", header: "Reorder Level", className: "num" },
      {
        key: "status",
        header: "Status",
        render: (row) =>
          row.status === "out-of-stock" ? (
            <StatusBadge status="out_of_stock" label="Out of Stock" withIcon />
          ) : row.status === "low-stock" ? (
            <StatusBadge status="low_stock" label="Low Stock" withIcon />
          ) : (
            <StatusBadge status="ok" label="In Stock" withIcon />
          ),
      },
    ],
  };

  // FR-35: the CSV holds exactly what the table shows, with the table's column names.
  const exportCsv = () => {
    const stockLabel: Record<string, string> = { available: "In Stock", "low-stock": "Low Stock", "out-of-stock": "Out of Stock" };
    const csvRows =
      activeTab === "stock-status" ? rows.map((r) => ({ ...r, status: stockLabel[String(r.status)] ?? r.status })) : rows;
    const period = activeTab === "daily" ? selectedDate : activeTab === "monthly" ? selectedMonth : today;
    downloadCsv(`gunita-kopi-${activeTab}-${period}.csv`, toCsv(csvRows, columns[activeTab]));
  };

  return (
    <div className="space-y-6">
      <header className="product-page-header">
        <div>
          <p className="product-page-kicker">Gunita · Admin</p>
          <h1>{TITLES[activeTab]}</h1>
        </div>
        <div className="flex flex-wrap items-end justify-end gap-2">
          {activeTab === "daily" && (
            <label className="field min-w-36">
              Date
              <input type="date" value={selectedDate} max={today} onChange={(event) => setSelectedDate(event.target.value || today)} />
            </label>
          )}
          {activeTab === "stock-status" && (
            <Button aria-pressed={lowStockOnly} onClick={() => setLowStockOnly((v) => !v)}>
              Low stock only
            </Button>
          )}
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
          <Button onClick={exportCsv} disabled={rows.length === 0}>
            <Icon name="download" />
            Export CSV
          </Button>
          <Button onClick={() => window.print()}>
            <Icon name="printer" />
            Print
          </Button>
        </div>
      </header>

      <Tabs tabs={tabs} activeTab={activeTab} onChange={(id) => setActiveTab(id as ReportType)} />

      {report.isLoading && !USE_MOCKS && <p role="status">Loading report…</p>}
      {report.error && (
        <p className="text-sm text-[var(--danger)]">
          {report.error instanceof Error ? report.error.message : "Could not load the report."}
        </p>
      )}

      {activeTab === "daily" && (
        <div className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="kpi">
              <div className="lbl">Sales</div>
              <div className="val num">{formatPeso(daySales)}</div>
            </div>
            <div className="kpi">
              <div className="lbl">Orders</div>
              <div className="val num coffee">{dayCount}</div>
            </div>
            <div className="kpi">
              <div className="lbl">Avg Order</div>
              <div className="val num">{formatPeso(dayCount > 0 ? daySales / dayCount : 0)}</div>
            </div>
          </div>
          <h2 className="report-section-title">7 days ending {selectedDate}</h2>
          <DataTable<Row> columns={columns.daily} data={rows} keyExtractor={(row) => String(row.date)} />
          <h2 className="report-section-title">Orders on {selectedDate}</h2>
          <DataTable<Row>
            columns={[
              { key: "queue", header: "Queue", className: "mono" },
              { key: "time", header: "Time" },
              { key: "type", header: "Type" },
              { key: "status", header: "Status", render: (row) => <StatusBadge status={String(row.status)} /> },
              { key: "total", header: "Total", className: "num" },
              { key: "payment", header: "Payment" },
            ]}
            data={(dayOrders.data ?? []).map((o) => ({
              queue: formatQueueNumber(o.orderId),
              time: new Date(o.orderDate).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Manila" }),
              type: o.orderType ? (TYPE_LABEL[o.orderType] ?? o.orderType) : "—",
              status: o.status,
              total: formatPeso(o.total),
              payment: "Cash",
            }))}
            keyExtractor={(row) => String(row.queue)}
            emptyMessage={dayOrders.isLoading ? "Loading orders…" : "No orders on this date."}
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

      {activeTab === "stock-status" && (
        <DataTable<Row>
          columns={columns[activeTab]}
          data={rows}
          keyExtractor={(row) => String(row.rank ?? row.date ?? row.month ?? row.ingredient)}
        />
      )}
    </div>
  );
}
