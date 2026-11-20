"use client";

import React, { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, DataTable, Dialog, Icon, Input, Select, StatusBadge, Tabs, formatPeso, useToast } from "@gunita/ui";
import {
  ADDON_SELLING_PRICE,
  type Ingredient,
  type StockTransactionType,
} from "@gunita/contracts";
import { USE_MOCKS } from "@/lib/use-mocks";
import {
  STOCK_BADGE,
  createIngredient,
  listIngredients,
  listStockHistory,
  recordStockMovement,
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
  supplier: string;
  status: string;
  label: string;
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

const formatHistoryDate = (dateTime: string) => {
  const date = new Date(dateTime);
  return `${date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  })} ${date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  })}`;
};

const sampleIngredients: IngredientRow[] = [
  {
    id: "ing-1",
    name: "Espresso Blend Beans",
    currentStock: "8.5",
    minStock: "5.0",
    unit: "kg",
    cost: "₱750.00/kg",
    supplier: "—",
    status: "completed",
    label: "In Stock",
  },
  {
    id: "ing-2",
    name: "Whole Milk",
    currentStock: "3.0",
    minStock: "10.0",
    unit: "L",
    cost: "₱95.00/L",
    supplier: "—",
    status: "low_stock",
    label: "Low Stock",
  },
  {
    id: "ing-3",
    name: "Condensed Milk",
    currentStock: "1.2",
    minStock: "4.0",
    unit: "kg",
    cost: "₱85.00/kg",
    supplier: "—",
    status: "low_stock",
    label: "Low Stock",
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
const EMPTY_MOVE: {
  ingredientId: string;
  type: StockTransactionType;
  quantity: string;
  remarks: string;
} = { ingredientId: "", type: "in", quantity: "", remarks: "" };

export default function InventoryPage() {
  const [activeTab, setActiveTab] = useState("ingredients");
  const [editing, setEditing] = useState<Ingredient | "new" | null>(null);
  const [form, setForm] = useState(EMPTY_INGREDIENT);
  const [move, setMove] = useState(EMPTY_MOVE);
  const [historyFilters, setHistoryFilters] = useState({
    ingredientId: "",
    from: "",
    to: "",
  });
  const [savingMove, setSavingMove] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const toast = useToast();
  const client = useQueryClient();

  const ingredients = useQuery({ queryKey: ["ingredients"], enabled: !USE_MOCKS, refetchInterval: 15000, queryFn: listIngredients });
  const suppliers = useQuery({ queryKey: ["suppliers"], enabled: !USE_MOCKS, queryFn: listSuppliers });
  const history = useQuery({
    queryKey: ["stock-history", historyFilters],
    enabled: !USE_MOCKS && activeTab === "history",
    queryFn: () => listStockHistory(historyFilters),
  });

  useEffect(() => {
    const firstIngredient = ingredients.data?.[0];
    if (!move.ingredientId && firstIngredient) {
      setMove((current) =>
        current.ingredientId
          ? current
          : { ...current, ingredientId: String(firstIngredient.id) },
      );
    }
  }, [ingredients.data, move.ingredientId]);

  const tabs = [
    { id: "ingredients", label: "Ingredient List" },
    { id: "stock-in-out", label: "Stock In / Out" },
    { id: "history", label: "Stock History" },
  ];

  const byId = new Map((ingredients.data ?? []).map((i) => [String(i.id), i]));
  const rows: IngredientRow[] = USE_MOCKS
    ? sampleIngredients
    : [...(ingredients.data ?? [])]
        .sort((a, b) => b.id - a.id)
        .map((i) => ({
          id: String(i.id),
          name: i.name,
          currentStock: String(i.currentStock),
          minStock: String(i.reorderLevel),
          unit: i.unit ?? "",
          cost: i.unitCost == null ? "—" : formatPeso(i.unitCost),
          supplier: i.supplierName ?? "—",
          status: STOCK_BADGE[i.stockStatus].status,
          label:
            i.stockStatus === "available"
              ? "In Stock"
              : STOCK_BADGE[i.stockStatus].label,
        }));

  const historyRows: HistoryRow[] = (history.data ?? []).map((t) => ({
    id: String(t.id),
    date: formatHistoryDate(t.dateTime),
    ingredient: t.ingredientName ?? `#${t.ingredientId}`,
    type: t.type === "in" ? "IN" : "OUT",
    quantity: `${new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(t.quantity)}${byId.get(String(t.ingredientId))?.unit ? ` ${byId.get(String(t.ingredientId))?.unit}` : ""}`,
    remaining: t.remainingStock === null ? "" : String(t.remainingStock),
    user: t.userName ?? "—",
    remarks: t.remarks ?? "—",
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
    const quantity = Number(move.quantity);
    if (!move.ingredientId) {
      setErrorMessage("Select an ingredient.");
      return;
    }
    if (!Number.isFinite(quantity) || quantity <= 0) {
      setErrorMessage("Enter a quantity greater than zero.");
      return;
    }
    setSavingMove(true);
    try {
      await recordStockMovement({
        ingredientId: Number(move.ingredientId),
        type: move.type,
        quantity,
        remarks: move.remarks.trim() || undefined,
      });
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Could not record the movement.");
      setSavingMove(false);
      return;
    }
    setMove((current) => ({ ...current, quantity: "", remarks: "" }));
    toast(`Stock-${move.type === "in" ? "in" : "out"} recorded.`);
    setSavingMove(false);
    try {
      await refresh();
    } catch (err) {
      toast(
        err instanceof Error
          ? `Movement recorded, but inventory could not refresh: ${err.message}`
          : "Movement recorded, but inventory could not refresh.",
        true,
      );
    }
  };

  const ingredientOptions = [
    { value: "", label: "Select an ingredient" },
    ...(ingredients.data ?? []).map((i) => ({
      value: String(i.id),
      label: i.name,
    })),
  ];
  const selectedIngredient = byId.get(move.ingredientId);

  const errorBox = errorMessage && (
    <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg">{errorMessage}</div>
  );

  return (
    <div className="inventory-page">
      <header className="inventory-page-header">
        <div>
          <p className="product-page-kicker">
            Gunita · Inventory Board
          </p>
          <h1>
            {activeTab === "stock-in-out"
              ? "Stock In / Out"
              : activeTab === "history"
                ? "Stock In / Out"
                : "Inventory"}
          </h1>
        </div>
        {activeTab === "ingredients" ? (
          <Button
            variant="primary"
            className="ingredient-list-add-button"
            disabled={USE_MOCKS}
            onClick={() => openIngredient("new")}
          >
            <Icon name="plus" />
            Add ingredient
          </Button>
        ) : null}
      </header>

      <Tabs tabs={tabs} activeTab={activeTab} onChange={setActiveTab} />

      {ingredients.error && (
        <p className="text-sm text-red-700">
          {ingredients.error instanceof Error ? ingredients.error.message : "Could not load the inventory."}
        </p>
      )}

      {activeTab === "ingredients" && (
        <DataTable<IngredientRow>
          className="tbl-inventory tbl-ingredient-list"
          columns={[
            { key: "id", header: "ID" },
            { key: "name", header: "Ingredient" },
            { key: "unit", header: "Unit" },
            { key: "currentStock", header: "Stock" },
            { key: "minStock", header: "Reorder At" },
            { key: "cost", header: "Unit Cost" },
            { key: "supplier", header: "Supplier" },
            {
              key: "status",
              header: "Status",
              render: (row) =>
                <StatusBadge status={row.status} label={row.label} />,
            },
            {
              key: "actions",
              header: "Actions",
              className: "act-cell",
              render: (row) => (
                <div className="ingredient-row-actions">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={USE_MOCKS}
                    onClick={() => {
                      setErrorMessage("");
                      setMove((current) => ({ ...current, ingredientId: row.id }));
                      setActiveTab("stock-in-out");
                    }}
                  >
                    Stock In/Out
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={USE_MOCKS}
                    onClick={() => {
                      setHistoryFilters((current) => ({
                        ...current,
                        ingredientId: row.id,
                      }));
                      setActiveTab("history");
                    }}
                  >
                    History
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="ingredient-edit-button"
                    disabled={USE_MOCKS}
                    aria-label={`Edit ${row.name}`}
                    onClick={() => {
                      const i = byId.get(row.id);
                      if (i) openIngredient(i);
                    }}
                  >
                    <Icon name="pencil" />
                  </Button>
                </div>
              ),
            },
          ]}
          data={rows}
          keyExtractor={(row) => row.id}
        />
      )}

      {activeTab === "stock-in-out" && (
        <form className="stock-movement-form" onSubmit={saveMove}>
          <Select
            label="Ingredient"
            required
            value={move.ingredientId}
            disabled={
              savingMove ||
              USE_MOCKS ||
              ingredients.isLoading ||
              !ingredients.data?.length
            }
            onChange={(e) => {
              setErrorMessage("");
              setMove({ ...move, ingredientId: e.target.value });
            }}
            options={ingredientOptions}
          />
          <p className="stock-movement-current" aria-live="polite">
            Current stock:{" "}
            <strong>
              {selectedIngredient
                ? `${selectedIngredient.currentStock}${selectedIngredient.unit ? ` ${selectedIngredient.unit}` : ""}`
                : "—"}
            </strong>
          </p>
          <div className="stock-movement-fields">
            <Select
              label="Type"
              value={move.type}
              disabled={savingMove}
              options={[
                { value: "in", label: "Stock In" },
                { value: "out", label: "Stock Out" },
              ]}
              onChange={(e) => {
                setErrorMessage("");
                const type = e.target.value;
                if (type === "in" || type === "out")
                  setMove({ ...move, type });
              }}
            />
            <Input
              label="Quantity"
              type="number"
              min="0.01"
              step="0.01"
              required
              disabled={savingMove}
              value={move.quantity}
              onChange={(e) => {
                setErrorMessage("");
                setMove({ ...move, quantity: e.target.value });
              }}
            />
          </div>
          <Input
            label="Remarks"
            maxLength={255}
            placeholder="e.g. Delivery, spoilage, usage"
            value={move.remarks}
            disabled={savingMove}
            onChange={(e) => {
              setErrorMessage("");
              setMove({ ...move, remarks: e.target.value });
            }}
          />
          {errorBox}
          <div className="stock-movement-actions">
            <Button
              type="submit"
              variant="primary"
              disabled={
                savingMove ||
                USE_MOCKS ||
                ingredients.isLoading ||
                !ingredients.data?.length
              }
            >
              {savingMove ? "Saving…" : "Save transaction"}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={savingMove}
              onClick={() => setActiveTab("ingredients")}
            >
              Back
            </Button>
          </div>
        </form>
      )}

      {activeTab === "history" && (
        <>
          <div className="inventory-history-filters">
            <Select
              label="Ingredient"
              value={historyFilters.ingredientId}
              disabled={ingredients.isLoading}
              options={[
                { value: "", label: "All" },
                ...(ingredients.data ?? []).map((i) => ({
                  value: String(i.id),
                  label: i.name,
                })),
              ]}
              onChange={(e) =>
                setHistoryFilters((current) => ({
                  ...current,
                  ingredientId: e.target.value,
                }))
              }
            />
            <Input
              label="From"
              type="date"
              max={historyFilters.to || undefined}
              value={historyFilters.from}
              onChange={(e) =>
                setHistoryFilters((current) => ({
                  ...current,
                  from: e.target.value,
                }))
              }
            />
            <Input
              label="To"
              type="date"
              min={historyFilters.from || undefined}
              value={historyFilters.to}
              onChange={(e) =>
                setHistoryFilters((current) => ({
                  ...current,
                  to: e.target.value,
                }))
              }
            />
          </div>
          {history.error && (
            <p className="text-sm text-red-700" role="alert">
              {history.error instanceof Error
                ? history.error.message
                : "Could not load stock history."}
            </p>
          )}
          <div className="inventory-history-table">
            <DataTable<HistoryRow>
              className="tbl-stock-history"
              emptyMessage={
                history.isLoading ? "Loading stock history…" : "No stock movements found."
              }
              columns={[
                { key: "id", header: "ID" },
                { key: "date", header: "Date & Time" },
                { key: "ingredient", header: "Ingredient" },
                {
                  key: "type",
                  header: "Type",
                  render: (row) => (
                    <span
                      className={`stock-history-type ${row.type === "IN" ? "is-in" : "is-out"}`}
                    >
                      {row.type}
                    </span>
                  ),
                },
                { key: "quantity", header: "Qty" },
                { key: "remaining", header: "Remaining" },
                { key: "user", header: "By" },
                { key: "remarks", header: "Remarks" },
              ]}
              data={historyRows}
              keyExtractor={(row) => row.id}
            />
          </div>
        </>
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

    </div>
  );
}
