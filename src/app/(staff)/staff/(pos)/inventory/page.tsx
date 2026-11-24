"use client";

import React, { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Button,
  DataTable,
  Dialog,
  Icon,
  Input,
  Select,
  StatusBadge,
  Tabs,
  useToast,
} from "@/ui";
import type { StockTransactionType } from "@/contracts";
import { USE_MOCKS } from "@/staff/lib/use-mocks";
import {
  STOCK_BADGE,
  createBaristaIngredient,
  listIngredients,
  listIngredientSupplierOptions,
  listStockHistory,
  recordStockMovement,
} from "@/staff/features/inventory/api";

interface PosIngredientRow extends Record<string, unknown> {
  id: string;
  name: string;
  currentStock: string;
  reorderAt: string;
  unit: string;
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

const EMPTY_NEW_INGREDIENT = {
  name: "",
  unit: "g",
  customUnit: "",
  supplierId: "",
  reorderLevel: "100",
  openingStock: "0",
};

const INGREDIENT_UNITS = [
  { value: "g", label: "g" },
  { value: "kg", label: "kg" },
  { value: "ml", label: "ml" },
  { value: "L", label: "L" },
  { value: "pcs", label: "pcs" },
  { value: "other", label: "Other…" },
];

const samplePosIngredients: PosIngredientRow[] = [
  {
    id: "ing-1",
    name: "Espresso Blend Beans",
    currentStock: "8.5",
    reorderAt: "5.0",
    unit: "kg",
    status: "ok",
    label: "In Stock",
  },
  {
    id: "ing-2",
    name: "Whole Milk",
    currentStock: "3.0",
    reorderAt: "10.0",
    unit: "L",
    status: "low_stock",
    label: "Low Stock",
  },
  {
    id: "ing-3",
    name: "Vanilla Syrup",
    currentStock: "2.5",
    reorderAt: "2.0",
    unit: "L",
    status: "ok",
    label: "In Stock",
  },
];

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

export default function PosInventoryPage() {
  const [activeTab, setActiveTab] = useState("ingredients");
  const [ingredientId, setIngredientId] = useState("");
  const [movementType, setMovementType] = useState<StockTransactionType>("out");
  const [quantity, setQuantity] = useState("");
  const [remarks, setRemarks] = useState("");
  const [historyFilters, setHistoryFilters] = useState({
    ingredientId: "",
    from: "",
    to: "",
  });
  const [savingMove, setSavingMove] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [addingIngredient, setAddingIngredient] = useState(false);
  const [savingIngredient, setSavingIngredient] = useState(false);
  const [newIngredient, setNewIngredient] = useState(EMPTY_NEW_INGREDIENT);
  const [ingredientError, setIngredientError] = useState("");
  const toast = useToast();
  const client = useQueryClient();

  const ingredients = useQuery({
    queryKey: ["pos-ingredients"],
    enabled: !USE_MOCKS,
    refetchInterval: 15000,
    queryFn: listIngredients,
  });
  const history = useQuery({
    queryKey: ["pos-stock-history", historyFilters],
    enabled: !USE_MOCKS && activeTab === "history",
    queryFn: () => listStockHistory(historyFilters),
  });
  const supplierOptions = useQuery({
    queryKey: ["pos-ingredient-supplier-options"],
    enabled: addingIngredient && !USE_MOCKS,
    queryFn: listIngredientSupplierOptions,
  });

  // Preselect the first ingredient, and move off one that is no longer listed (deleted by the Owner).
  useEffect(() => {
    const list = ingredients.data;
    const firstIngredient = list?.[0];
    if (!firstIngredient) return;
    if (!ingredientId || !list.some((i) => String(i.id) === ingredientId)) {
      setIngredientId(String(firstIngredient.id));
    }
  }, [ingredientId, ingredients.data]);

  const tabs = [
    { id: "ingredients", label: "Ingredient List" },
    { id: "stock-in-out", label: "Stock In / Out" },
    { id: "history", label: "Stock History" },
  ];

  const byId = new Map((ingredients.data ?? []).map((i) => [String(i.id), i]));
  const rows: PosIngredientRow[] = USE_MOCKS
    ? samplePosIngredients
    : [...(ingredients.data ?? [])]
        .sort((a, b) => b.id - a.id)
        .map((i) => ({
          id: String(i.id),
          name: i.name,
          currentStock: String(i.currentStock),
          reorderAt: String(i.reorderLevel),
          unit: i.unit ?? "",
          status: STOCK_BADGE[i.stockStatus].status,
          label: STOCK_BADGE[i.stockStatus].label,
        }));

  const historyRows: HistoryRow[] = (history.data ?? []).map((t) => {
    const unit = t.ingredientUnit ?? byId.get(String(t.ingredientId))?.unit;
    return {
      id: String(t.id),
      date: formatHistoryDate(t.dateTime),
      ingredient: t.ingredientName ?? `#${t.ingredientId}`,
      type: t.type === "in" ? "IN" : "OUT",
      quantity: `${new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(t.quantity)}${unit ? ` ${unit}` : ""}`,
      remaining: t.remainingStock === null ? "" : String(t.remainingStock),
      user: t.userName ?? "—",
      remarks: t.remarks ?? "—",
    };
  });

  const ingredientOptions = [
    { value: "", label: "Select an ingredient" },
    ...(ingredients.data ?? []).map((i) => ({
      value: String(i.id),
      label: i.name,
    })),
  ];
  const selectedIngredient = byId.get(ingredientId);

  const submitStockMovement = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage("");
    const parsedQuantity = Number(quantity);
    if (!ingredientId) {
      setErrorMessage("Select an ingredient.");
      return;
    }
    if (!Number.isFinite(parsedQuantity) || parsedQuantity <= 0) {
      setErrorMessage("Enter a quantity greater than zero.");
      return;
    }
    const type = movementType;
    const movementLabel = type === "in" ? "Stock-in" : "Stock-out";
    setSavingMove(true);
    try {
      await recordStockMovement({
        ingredientId: Number(ingredientId),
        type,
        quantity: parsedQuantity,
        remarks: remarks.trim() || undefined,
      });
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : `Could not record the ${movementLabel}.`,
      );
      setSavingMove(false);
      return;
    }

    setQuantity("");
    setRemarks("");
    toast(`${movementLabel} recorded.`);
    setSavingMove(false);
    try {
      await client.invalidateQueries({ queryKey: ["pos-ingredients"] });
      await client.invalidateQueries({ queryKey: ["pos-stock-history"] });
    } catch (err) {
      toast(
        err instanceof Error
          ? `${movementLabel} recorded, but inventory could not refresh: ${err.message}`
          : `${movementLabel} recorded, but inventory could not refresh.`,
        true,
      );
    }
  };

  const submitNewIngredient = async (e: React.FormEvent) => {
    e.preventDefault();
    setIngredientError("");
    const reorderLevel = Number(newIngredient.reorderLevel);
    const openingStock = Number(newIngredient.openingStock);
    const unit =
      newIngredient.unit === "other"
        ? newIngredient.customUnit.trim()
        : newIngredient.unit;
    if (!newIngredient.name.trim()) {
      setIngredientError("Enter an ingredient name.");
      return;
    }
    if (newIngredient.unit === "other" && !unit) {
      setIngredientError("Enter a unit.");
      return;
    }
    if (!Number.isFinite(reorderLevel) || reorderLevel < 0) {
      setIngredientError("Enter a reorder level of zero or more.");
      return;
    }
    if (!Number.isFinite(openingStock) || openingStock < 0) {
      setIngredientError("Enter opening stock of zero or more.");
      return;
    }

    setSavingIngredient(true);
    try {
      await createBaristaIngredient({
        name: newIngredient.name.trim(),
        unit: unit || null,
        supplierId: newIngredient.supplierId
          ? Number(newIngredient.supplierId)
          : null,
        reorderLevel,
        openingStock,
      });
    } catch (err) {
      setIngredientError(
        err instanceof Error ? err.message : "Could not add the ingredient.",
      );
      setSavingIngredient(false);
      return;
    }

    setAddingIngredient(false);
    setNewIngredient(EMPTY_NEW_INGREDIENT);
    setSavingIngredient(false);
    toast("Ingredient added.");
    try {
      await client.invalidateQueries({ queryKey: ["pos-ingredients"] });
      await client.invalidateQueries({ queryKey: ["pos-stock-history"] });
    } catch (err) {
      toast(
        err instanceof Error
          ? `Ingredient added, but inventory could not refresh: ${err.message}`
          : "Ingredient added, but inventory could not refresh.",
        true,
      );
    }
  };

  return (
    <div className="inventory-page pos-inventory-page">
      <header className="inventory-page-header">
        <div>
          <p className="product-page-kicker">Gunita · Inventory Board</p>
          <h1>{activeTab === "ingredients" ? "Inventory" : "Stock In / Out"}</h1>
        </div>
        {activeTab === "ingredients" && (
          <Button
            variant="primary"
            className="ingredient-list-add-button"
            disabled={USE_MOCKS || savingIngredient}
            onClick={() => {
              setIngredientError("");
              setNewIngredient(EMPTY_NEW_INGREDIENT);
              setAddingIngredient(true);
            }}
          >
            <Icon name="plus" />
            Add ingredient
          </Button>
        )}
      </header>

      <Tabs tabs={tabs} activeTab={activeTab} onChange={setActiveTab} />

      {ingredients.error && (
        <p className="text-sm text-red-700" role="alert">
          {ingredients.error instanceof Error
            ? ingredients.error.message
            : "Could not load the inventory."}
        </p>
      )}

      {activeTab === "ingredients" && (
        <DataTable<PosIngredientRow>
          className="tbl-pos-inventory"
          columns={[
            { key: "id", header: "ID" },
            { key: "name", header: "Ingredient" },
            { key: "unit", header: "Unit" },
            { key: "currentStock", header: "Stock" },
            { key: "reorderAt", header: "Reorder At" },
            {
              key: "status",
              header: "Status",
              render: (row) => <StatusBadge status={row.status} label={row.label} withIcon />,
            },
            {
              key: "actions",
              header: "Actions",
              className: "act-cell",
              render: (row) => (
                <div className="pos-inventory-actions">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={USE_MOCKS}
                    onClick={() => {
                      setErrorMessage("");
                      setIngredientId(row.id);
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
                </div>
              ),
            },
          ]}
          data={rows}
          keyExtractor={(row) => row.id}
        />
      )}

      {activeTab === "stock-in-out" && (
        <form className="stock-movement-form" onSubmit={submitStockMovement}>
          <Select
            label="Ingredient"
            required
            value={ingredientId}
            disabled={savingMove || USE_MOCKS || ingredients.isLoading || !ingredients.data?.length}
            onChange={(e) => {
              setErrorMessage("");
              setIngredientId(e.target.value);
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
              value={movementType}
              disabled={savingMove}
              onChange={(e) => {
                setErrorMessage("");
                if (e.target.value === "in" || e.target.value === "out") {
                  setMovementType(e.target.value);
                }
              }}
              options={[
                { value: "in", label: "Stock In" },
                { value: "out", label: "Stock Out" },
              ]}
            />
            <Input
              label="Quantity"
              type="number"
              min="0.01"
              step="0.01"
              required
              disabled={savingMove}
              value={quantity}
              onChange={(e) => {
                setErrorMessage("");
                setQuantity(e.target.value);
              }}
            />
          </div>
          <Input
            label="Remarks"
            maxLength={255}
            placeholder="e.g. Usage, spoilage, waste"
            value={remarks}
            disabled={savingMove}
            onChange={(e) => {
              setErrorMessage("");
              setRemarks(e.target.value);
            }}
          />
          {errorMessage && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg" role="alert">
              {errorMessage}
            </div>
          )}
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
          <div className="pos-stock-history-filters">
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
                setHistoryFilters((current) => ({ ...current, from: e.target.value }))
              }
            />
            <Input
              label="To"
              type="date"
              min={historyFilters.from || undefined}
              value={historyFilters.to}
              onChange={(e) =>
                setHistoryFilters((current) => ({ ...current, to: e.target.value }))
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
          <div className="pos-stock-history-table">
            <DataTable<HistoryRow>
              className="pos-stock-history-list"
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

      {/* Figma "Staff Inventory ... (Add ingredient menu)" dialog 317:17034, approved by jhnjffryyy 2026-11-23. */}
      <Dialog
        isOpen={addingIngredient}
        onClose={() => {
          if (!savingIngredient) setAddingIngredient(false);
        }}
        title="Add ingredient"
      >
        <form className="pos-add-ingredient-form" onSubmit={submitNewIngredient}>
          <div className="pos-add-ingredient-fields">
            <Input
              label="Name"
              maxLength={100}
              required
              value={newIngredient.name}
              disabled={savingIngredient}
              onChange={(e) => {
                setIngredientError("");
                setNewIngredient({ ...newIngredient, name: e.target.value });
              }}
            />
            <Select
              label="Unit"
              value={newIngredient.unit}
              disabled={savingIngredient}
              options={INGREDIENT_UNITS}
              onChange={(e) => {
                setIngredientError("");
                setNewIngredient({ ...newIngredient, unit: e.target.value });
              }}
            />
            <div className="pos-add-ingredient-supplier">
              <Select
                label="Supplier"
                value={newIngredient.supplierId}
                disabled={
                  savingIngredient ||
                  supplierOptions.isLoading ||
                  Boolean(supplierOptions.error)
                }
                options={[
                  { value: "", label: "No supplier" },
                  ...(supplierOptions.data ?? []).map((supplier) => ({
                    value: String(supplier.id),
                    label: supplier.name,
                  })),
                ]}
                onChange={(e) => {
                  setIngredientError("");
                  setNewIngredient({
                    ...newIngredient,
                    supplierId: e.target.value,
                  });
                }}
              />
            </div>
            {newIngredient.unit === "other" && (
              <Input
                label="Custom unit"
                maxLength={20}
                required
                value={newIngredient.customUnit}
                disabled={savingIngredient}
                onChange={(e) =>
                  setNewIngredient({
                    ...newIngredient,
                    customUnit: e.target.value,
                  })
                }
              />
            )}
            <div className="pos-add-ingredient-reorder-level">
              <Input
                label="Reorder level"
                type="number"
                min="0"
                step="0.01"
                required
                value={newIngredient.reorderLevel}
                disabled={savingIngredient}
                onChange={(e) => {
                  setIngredientError("");
                  setNewIngredient({
                    ...newIngredient,
                    reorderLevel: e.target.value,
                  });
                }}
              />
            </div>
            {/* Costs are Owner-only (the API refuses them from a Barista); shown as in the Figma frame. */}
            <Input label="Unit cost (₱)" value="" placeholder="Set by Owner" readOnly disabled />
            <div className="pos-add-ingredient-opening-stock">
              <Input
                label="Opening stock"
                type="number"
                min="0"
                step="0.01"
                required
                value={newIngredient.openingStock}
                disabled={savingIngredient}
                onChange={(e) => {
                  setIngredientError("");
                  setNewIngredient({
                    ...newIngredient,
                    openingStock: e.target.value,
                  });
                }}
              />
            </div>
          </div>
          {supplierOptions.error && (
            <div
              className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg"
              role="alert"
            >
              {supplierOptions.error instanceof Error
                ? `Could not load suppliers: ${supplierOptions.error.message}`
                : "Could not load suppliers."}
            </div>
          )}
          {ingredientError && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg" role="alert">
              {ingredientError}
            </div>
          )}
          <div className="pos-add-ingredient-actions">
            <Button
              type="button"
              variant="outline"
              disabled={savingIngredient}
              onClick={() => setAddingIngredient(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              disabled={savingIngredient || supplierOptions.isLoading}
            >
              {savingIngredient ? "Saving…" : "Save"}
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
