"use client";

import React, { useState } from "react";
import { Button, DataTable, StatusBadge, Tabs } from "@gunita/ui";

interface IngredientRow extends Record<string, unknown> {
  id: string;
  name: string;
  currentStock: string;
  minStock: string;
  unit: string;
  cost: string;
  status: string;
}

const sampleIngredients: IngredientRow[] = [
  {
    id: "ing-1",
    name: "Espresso Blend Beans",
    currentStock: "8.5",
    minStock: "5.0",
    unit: "kg",
    cost: "₱750.00/kg",
    status: "in_stock",
  },
  {
    id: "ing-2",
    name: "Whole Milk",
    currentStock: "3.0",
    minStock: "10.0",
    unit: "L",
    cost: "₱95.00/L",
    status: "low_stock",
  },
  {
    id: "ing-3",
    name: "Condensed Milk",
    currentStock: "1.2",
    minStock: "4.0",
    unit: "kg",
    cost: "₱85.00/kg",
    status: "low_stock",
  },
];

export default function InventoryPage() {
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
            Inventory Management
          </h1>
          <p className="text-sm text-gray-500">
            Track ingredients, adjust stock, and review transaction logs
          </p>
        </div>
        <div className="flex space-x-3">
          <Button variant="outline">Stock Adjustment</Button>
          <Button>Add Ingredient</Button>
        </div>
      </div>

      <Tabs tabs={tabs} activeTab={activeTab} onChange={setActiveTab} />

      {activeTab === "ingredients" && (
        <DataTable<IngredientRow>
          columns={[
            { key: "name", header: "Ingredient" },
            { key: "currentStock", header: "Current Stock" },
            { key: "minStock", header: "Min Stock" },
            { key: "unit", header: "Unit" },
            { key: "cost", header: "Unit Cost" },
            {
              key: "status",
              header: "Status",
              render: (row) =>
                row.status === "low_stock" ? (
                  <StatusBadge status="low_stock" label="Low Stock" />
                ) : (
                  <StatusBadge status="completed" label="Adequate" />
                ),
            },
          ]}
          data={sampleIngredients}
          keyExtractor={(row) => row.id}
        />
      )}

      {activeTab === "stock-in-out" && (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h3 className="text-base font-semibold text-gray-900 mb-2">
            Record Stock Movement
          </h3>
          <p className="text-sm text-gray-500">
            Interface to log deliveries, manual waste, and stock withdrawals
            connected to <code>/api/stock-transactions</code>.
          </p>
        </div>
      )}

      {activeTab === "history" && (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h3 className="text-base font-semibold text-gray-900 mb-2">
            Stock Transaction Audit History
          </h3>
          <p className="text-sm text-gray-500">
            Audit trail of all ingredient stock level adjustments, deductions,
            and reconciliations.
          </p>
        </div>
      )}
    </div>
  );
}
