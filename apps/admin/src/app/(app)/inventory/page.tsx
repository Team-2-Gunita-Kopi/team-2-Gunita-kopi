"use client";

import React, { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, DataTable, Dialog, Input, Select, StatusBadge, Tabs, formatPeso, useToast } from "@gunita/ui";
import { ADDON_SELLING_PRICE, type Ingredient } from "@gunita/contracts";
import { USE_MOCKS } from "@/lib/use-mocks";
import {
  STOCK_BADGE,
  createIngredient,
  listIngredients,
  listStockHistory,
  recordStockIn,
  updateIngredient,
} from "@/features/inventory/api";
import { listSuppliers } from "@/features/suppliers/api";

interface IngredientRow extends Record<string, unknown> {
  id: string;
  name: string;
  currentStock: string;
  minStock: string;
  unit: string;
  cost: string;
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

const EMPTY_INGREDIENT = {
  name: "",
  unit: "",
  reorderLevel: "0",
  unitCost: "",
  supplierId: "",
  isAddon: false,
  addonQuantity: "",
};
const EMPTY_MOVE = { ingredientId: "", quantity: "", remarks: "" };

export default function InventoryPage() {
  const [activeTab, setActiveTab] = useState("ingredients");
  const [editing, setEditing] = useState<Ingredient | "new" | null>(null);
  const [form, setForm] = useState(EMPTY_INGREDIENT);
  const [moveOpen, setMoveOpen] = useState(false);
  const [move, setMove] = useState(EMPTY_MOVE);
  const [errorMessage, setErrorMessage] = useState("");
  const toast = useToast();
  const client = useQueryClient();

  const ingredients = useQuery({ queryKey: ["ingredients"], enabled: !USE_MOCKS, refetchInterval: 15000, queryFn: listIngredients });
  const suppliers = useQuery({ queryKey: ["suppliers"], enabled: !USE_MOCKS, queryFn: listSuppliers });
  const history = useQuery({
    queryKey: ["stock-history"],
    enabled: !USE_MOCKS && activeTab === "history",
    queryFn: listStockHistory,
  });

  const tabs = [
    { id: "ingredients", label: "Ingredient List" },
    { id: "stock-in-out", label: "Stock In & Out" },
    { id: "history", label: "Stock History" },
  ];

  const byId = new Map((ingredients.data ?? []).map((i) => [String(i.id), i]));
  const rows: IngredientRow[] = USE_MOCKS
    ? sampleIngredients
    : (ingredients.data ?? []).map((i) => ({
        id: String(i.id),
        name: i.name,
        currentStock: String(i.currentStock),
        minStock: String(i.reorderLevel),
        unit: i.unit ?? "",
        cost: i.unitCost == null ? "" : `${formatPeso(i.unitCost)}${i.unit ? `/${i.unit}` : ""}`,
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

  const refresh = async () => {
    await client.invalidateQueries({ queryKey: ["ingredients"] });
    await client.invalidateQueries({ queryKey: ["stock-history"] });
  };

  const openIngredient = (i: Ingredient | "new") => {
    setErrorMessage("");
    setEditing(i);
    setForm(
      i === "new"
        ? EMPTY_INGREDIENT
        : {
            name: i.name,
            unit: i.unit ?? "",
            reorderLevel: String(i.reorderLevel),
            unitCost: i.unitCost == null ? "" : String(i.unitCost),
            supplierId: i.supplierId === null ? "" : String(i.supplierId),
            isAddon: i.isAddon,
            addonQuantity: i.addonQuantity === null ? "" : String(i.addonQuantity),
          },
    );
  };

  // FR-21/FR-22. New ingredients start at 0; the opening quantity is a stock-in (FR-17).
  const saveIngredient = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage("");
    const body = {
      name: form.name,
      unit: form.unit || null,
      reorderLevel: Number(form.reorderLevel || 0),
      unitCost: form.unitCost === "" ? null : Number(form.unitCost),
      supplierId: form.supplierId ? Number(form.supplierId) : null,
      // Unchecked saves a regular ingredient (no quantity); the price is set by the server.
      isAddon: form.isAddon,
      addonQuantity: form.isAddon ? Number(form.addonQuantity) : null,
    };
    if (form.isAddon && !(Number(form.addonQuantity) > 0)) {
      setErrorMessage("Enter a quantity consumed per selection greater than zero.");
      return;
    }
    try {
      if (editing === "new") await createIngredient(body);
      else if (editing) await updateIngredient(editing.id, body);
      setEditing(null);
      await refresh();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Could not save the ingredient.");
    }
  };

  // FR-15/FR-18: stock-in; the database writes the movement and the remaining stock.
  const saveMove = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage("");
    try {
      await recordStockIn({
        ingredientId: Number(move.ingredientId),
        quantity: Number(move.quantity),
        remarks: move.remarks.trim() || undefined,
      });
      setMoveOpen(false);
      setMove(EMPTY_MOVE);
      toast("Stock-in recorded.");
      await refresh();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Could not record the movement.");
    }
  };

  const ingredientOptions = [
    { value: "", label: "Select an ingredient" },
    ...(ingredients.data ?? []).map((i) => ({
      value: String(i.id),
      label: `${i.name} (${i.currentStock} ${i.unit ?? ""})`,
    })),
  ];

  const errorBox = errorMessage && (
    <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg">{errorMessage}</div>
  );

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
          <Button
            variant="outline"
            disabled={USE_MOCKS}
            onClick={() => {
              setErrorMessage("");
              setMoveOpen(true);
            }}
          >
            Stock Adjustment
          </Button>
          <Button disabled={USE_MOCKS} onClick={() => openIngredient("new")}>
            Add Ingredient
          </Button>
        </div>
      </div>

      <Tabs tabs={tabs} activeTab={activeTab} onChange={setActiveTab} />

      {ingredients.error && (
        <p className="text-sm text-red-700">
          {ingredients.error instanceof Error ? ingredients.error.message : "Could not load the inventory."}
        </p>
      )}

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
                row.label ? (
                  <StatusBadge status={row.status} label={row.label} />
                ) : row.status === "low_stock" ? (
                  <StatusBadge status="low_stock" label="Low Stock" />
                ) : (
                  <StatusBadge status="completed" label="Adequate" />
                ),
            },
            {
              key: "actions",
              header: "",
              render: (row) => (
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={USE_MOCKS}
                  onClick={() => {
                    const i = byId.get(row.id);
                    if (i) openIngredient(i);
                  }}
                >
                  Edit
                </Button>
              ),
            },
          ]}
          data={rows}
          keyExtractor={(row) => row.id}
        />
      )}

      {activeTab === "stock-in-out" && (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h3 className="text-base font-semibold text-gray-900 mb-2">
            Record Stock Movement
          </h3>
          <p className="text-sm text-gray-500">
            Record deliveries and replenishment (stock-in) with <strong>Stock Adjustment</strong>.
            Used, spoiled or wasted items (stock-out) are recorded by the Barista/Service Staff on the
            POS, and sales deduct stock automatically from each product&apos;s recipe.
          </p>
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
        isOpen={editing !== null}
        onClose={() => setEditing(null)}
        title={editing === "new" ? "Add Ingredient" : "Edit Ingredient"}
      >
        <form onSubmit={saveIngredient} className="space-y-4">
          {errorBox}
          <Input label="Ingredient" required maxLength={100} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <Input label="Unit" maxLength={20} value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} placeholder="g, ml, pcs" />
          <Input
            label="Reorder Level"
            type="number"
            min="0"
            step="0.01"
            required
            value={form.reorderLevel}
            onChange={(e) => setForm({ ...form, reorderLevel: e.target.value })}
          />
          <Input
            label="Unit Cost"
            type="number"
            min="0"
            step="0.01"
            value={form.unitCost}
            onChange={(e) => setForm({ ...form, unitCost: e.target.value })}
          />
          <Select
            label="Supplier"
            value={form.supplierId}
            onChange={(e) => setForm({ ...form, supplierId: e.target.value })}
            options={[
              { value: "", label: "No supplier" },
              ...(suppliers.data ?? [])
                .filter((s) => s.status === "active" || String(s.id) === form.supplierId)
                .map((s) => ({ value: String(s.id), label: s.name })),
            ]}
          />
          <div className="space-y-4 border-t border-gray-200 pt-4">
            <h4 className="text-sm font-semibold text-gray-900">Add-on Configuration</h4>
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={form.isAddon}
                onChange={(e) => setForm({ ...form, isAddon: e.target.checked })}
              />
              Available as a POS add-on
            </label>
            {form.isAddon && (
              <>
                <Input label="Add-on selling price (₱)" value={ADDON_SELLING_PRICE.toFixed(2)} readOnly disabled />
                <Input
                  label={`Quantity consumed per selection${form.unit ? ` (${form.unit})` : ""}`}
                  type="number"
                  min="0.01"
                  step="0.01"
                  required
                  value={form.addonQuantity}
                  onChange={(e) => setForm({ ...form, addonQuantity: e.target.value })}
                />
              </>
            )}
          </div>
          <div className="flex justify-end space-x-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button type="submit">Save</Button>
          </div>
        </form>
      </Dialog>

      <Dialog isOpen={moveOpen} onClose={() => setMoveOpen(false)} title="Stock-In">
        <form onSubmit={saveMove} className="space-y-4">
          {errorBox}
          <Select
            label="Ingredient"
            required
            value={move.ingredientId}
            onChange={(e) => setMove({ ...move, ingredientId: e.target.value })}
            options={ingredientOptions}
          />
          <Input
            label="Quantity received"
            type="number"
            min="0.01"
            step="0.01"
            required
            value={move.quantity}
            onChange={(e) => setMove({ ...move, quantity: e.target.value })}
          />
          <Input label="Remarks" maxLength={255} value={move.remarks} onChange={(e) => setMove({ ...move, remarks: e.target.value })} />
          <div className="flex justify-end space-x-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setMoveOpen(false)}>
              Cancel
            </Button>
            <Button type="submit">Record</Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
