"use client";

import React, { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, DataTable, Dialog, Input, Select, StatusBadge, Tabs, useToast } from "@gunita/ui";
import { USE_MOCKS } from "@/lib/use-mocks";
import {
  STOCK_BADGE,
  listIngredients,
  listStockHistory,
  recordStockOut,
} from "@/features/inventory/api";

interface PosIngredientRow extends Record<string, unknown> {
  id: string;
  name: string;
  currentStock: string;
  unit: string;
  status: string;
  label?: string;
}

interface HistoryRow extends Record<string, unknown> {
  id: string;
  date: string;
  ingredient: string;
  type: string;
  quantity: string;
  remaining: string;
  user: string;
  remarks: string;
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
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [ingredientId, setIngredientId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [remarks, setRemarks] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const toast = useToast();
  const client = useQueryClient();

  const ingredients = useQuery({
    queryKey: ["pos-ingredients"],
    enabled: !USE_MOCKS,
    refetchInterval: 15000,
    queryFn: listIngredients,
  });
  const history = useQuery({
    queryKey: ["pos-stock-history"],
    enabled: !USE_MOCKS && activeTab === "history",
    queryFn: listStockHistory,
  });

  const tabs = [
    { id: "ingredients", label: "Ingredient List" },
    { id: "stock-in-out", label: "Stock In & Out" },
    { id: "history", label: "Stock History" },
  ];

  const rows: PosIngredientRow[] = USE_MOCKS
    ? samplePosIngredients
    : (ingredients.data ?? []).map((i) => ({
        id: String(i.id),
        name: i.name,
        currentStock: String(i.currentStock),
        unit: i.unit ?? "",
        status: STOCK_BADGE[i.stockStatus].status,
        label: STOCK_BADGE[i.stockStatus].label,
      }));

  const historyRows: HistoryRow[] = (history.data ?? []).map((t) => ({
    id: String(t.id),
    date: new Date(t.dateTime).toLocaleString(),
    ingredient: t.ingredientName ?? `#${t.ingredientId}`,
    type: t.type === "in" ? "Stock-in" : "Stock-out",
    quantity: String(t.quantity),
    remaining: t.remainingStock === null ? "" : String(t.remainingStock),
    user: t.userName ?? "",
    remarks: t.remarks ?? "",
  }));

  // FR-16/FR-17: manual stock-out; the database updates the remaining stock.
  const submitStockOut = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage("");
    try {
      await recordStockOut({
        ingredientId: Number(ingredientId),
        quantity: Number(quantity),
        remarks: remarks.trim() || undefined,
      });
      setIsModalOpen(false);
      setIngredientId("");
      setQuantity("");
      setRemarks("");
      toast("Stock-out recorded.");
      await client.invalidateQueries({ queryKey: ["pos-ingredients"] });
      await client.invalidateQueries({ queryKey: ["pos-stock-history"] });
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Could not record the stock-out.");
    }
  };

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
        <Button onClick={() => setIsModalOpen(true)} disabled={USE_MOCKS}>
          Record Stock Movement
        </Button>
      </div>

      <Tabs tabs={tabs} activeTab={activeTab} onChange={setActiveTab} />

      {ingredients.error && (
        <p className="text-sm text-red-700">
          {ingredients.error instanceof Error ? ingredients.error.message : "Could not load the inventory."}
        </p>
      )}

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
                row.label ? (
                  <StatusBadge status={row.status} label={row.label} />
                ) : row.status === "low_stock" ? (
                  <StatusBadge status="low_stock" label="Low Stock" />
                ) : (
                  <StatusBadge status="completed" label="In Stock" />
                ),
            },
          ]}
          data={rows}
          keyExtractor={(row) => row.id}
        />
      )}

      {activeTab === "stock-in-out" && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 text-sm text-gray-500">
          Record ingredients used, spoiled or wasted with <strong>Record Stock Movement</strong>.
          Stock-in (deliveries and replenishment) is recorded by the Owner.
        </div>
      )}

      {activeTab === "history" && (
        <DataTable<HistoryRow>
          columns={[
            { key: "date", header: "Date" },
            { key: "ingredient", header: "Ingredient" },
            { key: "type", header: "Type" },
            { key: "quantity", header: "Quantity" },
            { key: "remaining", header: "Remaining" },
            { key: "user", header: "By" },
            { key: "remarks", header: "Remarks" },
          ]}
          data={historyRows}
          keyExtractor={(row) => row.id}
        />
      )}

      <Dialog
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Record Stock-Out"
      >
        <form onSubmit={submitStockOut} className="space-y-4">
          {errorMessage && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg">
              {errorMessage}
            </div>
          )}
          <Select
            label="Ingredient"
            required
            value={ingredientId}
            onChange={(e) => setIngredientId(e.target.value)}
            options={[
              { value: "", label: "Select an ingredient" },
              ...(ingredients.data ?? []).map((i) => ({
                value: String(i.id),
                label: `${i.name} (${i.currentStock} ${i.unit ?? ""})`,
              })),
            ]}
          />
          <Input
            label="Quantity used"
            type="number"
            min="0.01"
            step="0.01"
            required
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
          />
          <Input
            label="Remarks"
            value={remarks}
            onChange={(e) => setRemarks(e.target.value)}
            placeholder="e.g. spilled milk"
          />
          <div className="flex justify-end space-x-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsModalOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit">Record</Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
