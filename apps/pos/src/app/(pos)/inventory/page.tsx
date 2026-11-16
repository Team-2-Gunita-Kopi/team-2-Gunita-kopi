"use client";

import React, { useState } from "react";
import { Button, DataTable, StatusBadge, Tabs } from "@gunita/ui";

interface PosIngredientRow extends Record<string, unknown> {
  id: string;
  name: string;
  currentStock: string;
  unit: string;
  status: string;
}

const samplePosIngredients: PosIngredientRow[] = [
  {
    id: "ing-1",
    name: "Espresso Blend Beans",
    currentStock: "8.5",
    unit: "kg",
    status: "ok",
  },
  {
    id: "ing-2",
    name: "Whole Milk",
    currentStock: "3.0",
    unit: "L",
    status: "low_stock",
  },
  {
    id: "ing-3",
    name: "Vanilla Syrup",
    currentStock: "2.5",
    unit: "L",
    status: "ok",
  },
];

export default function PosInventoryPage() {
  const [activeTab, setActiveTab] = useState("ingredients");

  const tabs = [
    { id: "ingredients", label: "Ingredient List" },
    { id: "stock-in-out", label: "Stock In & Out" },
    { id: "history", label: "Stock History" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            Barista Inventory
          </h1>
          <p className="text-sm text-gray-500">
            Check on-hand levels, record daily milk consumption or wastage
          </p>
        </div>
        <Button>Record Stock Movement</Button>
      </div>

      <Tabs tabs={tabs} activeTab={activeTab} onChange={setActiveTab} />

      {activeTab === "ingredients" && (
        <DataTable<PosIngredientRow>
          columns={[
            { key: "name", header: "Ingredient" },
            { key: "currentStock", header: "Current Stock" },
            { key: "unit", header: "Unit" },
            {
              key: "status",
              header: "Status",
              render: (row) =>
                row.status === "low_stock" ? (
                  <StatusBadge status="low_stock" label="Low Stock" />
                ) : (
                  <StatusBadge status="completed" label="In Stock" />
                ),
            },
          ]}
          data={samplePosIngredients}
          keyExtractor={(row) => row.id}
        />
      )}

      {activeTab === "stock-in-out" && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 text-sm text-gray-500">
          Baristas can log daily ingredient usage, stock replenishment, and
          spoiled milk/items via <code>/api/stock-transactions</code>.
        </div>
      )}

      {activeTab === "history" && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 text-sm text-gray-500">
          Recent stock transactions recorded on this terminal.
        </div>
      )}
    </div>
  );
}
