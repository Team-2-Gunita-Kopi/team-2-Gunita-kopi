"use client";

import React, { useState } from "react";
import { Button, DataTable, StatCard, StatusBadge, Tabs } from "@gunita/ui";

export default function ReportsPage() {
  const [activeTab, setActiveTab] = useState("daily");

  const tabs = [
    { id: "daily", label: "Daily Sales" },
    { id: "monthly", label: "Monthly Summary" },
    { id: "best-sellers", label: "Best Sellers" },
    { id: "stock-status", label: "Stock Status" },
  ];

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
        <Button variant="outline">Export CSV</Button>
      </div>

      <Tabs tabs={tabs} activeTab={activeTab} onChange={setActiveTab} />

      {activeTab === "daily" && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <StatCard
              title="Daily Revenue"
              value="₱18,420.00"
              subtitle="Today"
            />
            <StatCard
              title="Total Tickets"
              value="112"
              subtitle="Avg ticket ₱164.46"
            />
            <StatCard
              title="Est. Gross Profit"
              value="₱12,525.60"
              subtitle="68.0% margin"
            />
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-6 text-sm text-gray-500">
            Daily reports consume <code>/api/reports/daily</code> data generated
            by the <code>v_daily_sales</code> database view.
          </div>
        </div>
      )}

      {activeTab === "monthly" && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <StatCard
              title="MTD Revenue"
              value="₱384,150.00"
              subtitle="Current Month"
            />
            <StatCard
              title="MTD Orders"
              value="2,410"
              subtitle="Avg 80 orders/day"
            />
            <StatCard
              title="Gross Margin"
              value="69.1%"
              subtitle="After ingredient COGS"
            />
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-6 text-sm text-gray-500">
            Monthly reports consume <code>/api/reports/monthly</code> backed by{" "}
            <code>v_monthly_sales</code>.
          </div>
        </div>
      )}

      {activeTab === "best-sellers" && (
        <div className="space-y-4">
          <DataTable<Record<string, unknown>>
            columns={[
              { key: "rank", header: "Rank" },
              { key: "item", header: "Product" },
              { key: "qty", header: "Units Sold" },
              { key: "revenue", header: "Gross Revenue" },
              { key: "profit", header: "Gross Profit" },
            ]}
            data={[
              {
                rank: "#1",
                item: "Spanish Latte",
                qty: 450,
                revenue: "₱63,000.00",
                profit: "₱43,875.00",
              },
              {
                rank: "#2",
                item: "Caramel Macchiato",
                qty: 380,
                revenue: "₱57,000.00",
                profit: "₱38,684.00",
              },
              {
                rank: "#3",
                item: "Cold Brew Oat",
                qty: 290,
                revenue: "₱46,400.00",
                profit: "₱32,480.00",
              },
            ]}
            keyExtractor={(row) => String(row.rank)}
          />
        </div>
      )}

      {activeTab === "stock-status" && (
        <div className="space-y-4">
          <DataTable<Record<string, unknown>>
            columns={[
              { key: "ingredient", header: "Ingredient" },
              { key: "stock", header: "Current Stock" },
              { key: "reorder", header: "Reorder Level" },
              {
                key: "status",
                header: "Alert",
                render: (row) =>
                  row.status === "low" ? (
                    <StatusBadge status="low_stock" label="Low Stock Alert" />
                  ) : (
                    <StatusBadge status="completed" label="Normal" />
                  ),
              },
            ]}
            data={[
              {
                ingredient: "Whole Milk",
                stock: "3.0 L",
                reorder: "10.0 L",
                status: "low",
              },
              {
                ingredient: "Caramel Syrup",
                stock: "0.8 L",
                reorder: "2.0 L",
                status: "low",
              },
              {
                ingredient: "Espresso Blend",
                stock: "8.5 kg",
                reorder: "5.0 kg",
                status: "ok",
              },
            ]}
            keyExtractor={(row) => String(row.ingredient)}
          />
        </div>
      )}
    </div>
  );
}
