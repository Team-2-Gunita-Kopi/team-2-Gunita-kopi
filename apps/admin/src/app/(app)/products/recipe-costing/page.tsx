"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Icon, Input, Select, Tabs, formatPeso } from "@gunita/ui";
import { USE_MOCKS } from "@/lib/use-mocks";
import {
  listProductsWithCosting,
  setPackagingCost,
  setRecipe,
} from "@/features/products/api";
import { listIngredients } from "@/features/inventory/api";

type RecipeLine = {
  key: string;
  ingredientId: string;
  quantityNeeded: string;
};

const PRODUCT_TABS = [
  { id: "list", label: "Product List", href: "/products" },
  {
    id: "costing",
    label: "Recipe & Costing",
    href: "/products/recipe-costing",
  },
];

const round2 = (value: number) => Math.round(value * 100) / 100;

export default function RecipeCostingPage() {
  const client = useQueryClient();
  const costings = useQuery({
    queryKey: ["products"],
    enabled: !USE_MOCKS,
    queryFn: listProductsWithCosting,
  });
  const ingredients = useQuery({
    queryKey: ["ingredients"],
    enabled: !USE_MOCKS,
    queryFn: listIngredients,
  });
  const [productId, setProductId] = useState("");
  const [lines, setLines] = useState<RecipeLine[]>([]);
  const [packaging, setPackaging] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const nextKey = useRef(0);

  const products = costings.data?.items;
  const selected = products?.find(
    (row) => String(row.product.id) === productId,
  );
  const selectedCosting = selected?.costing;

  useEffect(() => {
    if (productId || !products?.length) return;
    const first = products[0];
    if (!first) return;
    const preferred = products.find((row) =>
      /iced spanish latte/i.test(row.product.name),
    );
    setProductId(String((preferred ?? first).product.id));
  }, [productId, products]);

  useEffect(() => {
    setLines(
      (selectedCosting?.lines ?? []).map((line, index) => ({
        key: `saved-${productId}-${index}`,
        ingredientId: String(line.ingredientId),
        quantityNeeded: String(line.quantityNeeded),
      })),
    );
    setPackaging(String(selectedCosting?.packagingCost ?? 0));
    setErrorMessage("");
    setSuccessMessage("");
  }, [productId, selectedCosting]);

  const ingredientById = useMemo(
    () =>
      new Map(
        (ingredients.data ?? []).map((ingredient) => [
          String(ingredient.id),
          ingredient,
        ]),
      ),
    [ingredients.data],
  );

  const lineDetails = lines.map((line) => {
    const ingredient = ingredientById.get(line.ingredientId);
    const savedLine = selectedCosting?.lines.find(
      (saved) => String(saved.ingredientId) === line.ingredientId,
    );
    const unitCost = ingredient ? ingredient.unitCost : savedLine?.unitCost;
    const quantity = Number(line.quantityNeeded);
    const rawLineCost =
      line.ingredientId && Number.isFinite(quantity) && quantity > 0
        ? quantity * (unitCost ?? 0)
        : 0;
    return {
      ...line,
      ingredient,
      unit: ingredient?.unit ?? savedLine?.unit ?? "",
      unitCost,
      rawLineCost,
      lineCost: round2(rawLineCost),
    };
  });
  const ingredientCost = round2(
    lineDetails.reduce((sum, line) => sum + line.rawLineCost, 0),
  );
  const packagingAmount = Number(packaging);
  const packagingCost =
    packaging.trim() && Number.isFinite(packagingAmount) && packagingAmount >= 0
      ? round2(packagingAmount)
      : 0;
  const totalCost = round2(ingredientCost + packagingCost);
  const price = selected?.product.price ?? 0;
  const margin = round2(price - totalCost);
  const marginPercent = price > 0 ? Math.round((margin / price) * 100) : null;
  const hasMissingUnitCost = lineDetails.some(
    (line) => line.ingredientId && line.unitCost == null,
  );

  const updateLine = (key: string, patch: Partial<RecipeLine>) => {
    setLines((current) =>
      current.map((line) => (line.key === key ? { ...line, ...patch } : line)),
    );
    setErrorMessage("");
    setSuccessMessage("");
  };

  const addLine = () => {
    nextKey.current += 1;
    setLines((current) => [
      ...current,
      { key: `new-${nextKey.current}`, ingredientId: "", quantityNeeded: "" },
    ]);
    setErrorMessage("");
    setSuccessMessage("");
  };

  const removeLine = (key: string) => {
    setLines((current) => current.filter((line) => line.key !== key));
    setErrorMessage("");
    setSuccessMessage("");
  };

  const save = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selected || !selectedCosting) return;
    setErrorMessage("");
    setSuccessMessage("");

    const seen = new Set<string>();
    for (const [index, line] of lines.entries()) {
      if (!line.ingredientId) {
        setErrorMessage(`Choose an ingredient for row ${index + 1}.`);
        return;
      }
      if (seen.has(line.ingredientId)) {
        setErrorMessage("Each ingredient may appear only once in a recipe.");
        return;
      }
      seen.add(line.ingredientId);
      const quantity = Number(line.quantityNeeded);
      if (
        !line.quantityNeeded.trim() ||
        !Number.isFinite(quantity) ||
        quantity <= 0
      ) {
        setErrorMessage(
          `Enter a quantity greater than zero for row ${index + 1}.`,
        );
        return;
      }
    }

    if (
      !packaging.trim() ||
      !Number.isFinite(packagingAmount) ||
      packagingAmount < 0
    ) {
      setErrorMessage("Packaging cost must be zero or more.");
      return;
    }

    setSaving(true);
    try {
      await setRecipe(
        selected.product.id,
        lines.map((line) => ({
          ingredientId: Number(line.ingredientId),
          quantityNeeded: Number(line.quantityNeeded),
        })),
      );
      if (round2(packagingAmount) !== selectedCosting.packagingCost) {
        await setPackagingCost(selected.product.id, round2(packagingAmount));
      }
      await client.invalidateQueries({ queryKey: ["products"] });
      setSuccessMessage("Recipe saved.");
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Could not save the recipe.",
      );
    } finally {
      setSaving(false);
    }
  };

  const canEdit =
    !USE_MOCKS &&
    !!selected &&
    !!selectedCosting &&
    !costings.isPending &&
    !costings.error &&
    !costings.data?.costingError &&
    !ingredients.isPending &&
    !ingredients.error &&
    !saving;

  return (
    <div className="recipe-costing-page">
      <header className="product-page-header">
        <div>
          <p className="product-page-kicker">Gunita · Admin</p>
          <h1>Recipe &amp; Costing</h1>
        </div>
      </header>

      <Tabs tabs={PRODUCT_TABS} activeTab="costing" className="product-tabs" />

      {USE_MOCKS ? (
        <p className="muted" role="status">
          Recipe editing is unavailable in demo mode. Connect the Admin app to
          the local API to save recipes.
        </p>
      ) : (
        <>
          {costings.error ? (
            <p className="recipe-message error" role="alert">
              {costings.error instanceof Error
                ? costings.error.message
                : "Could not load products."}
            </p>
          ) : null}
          {costings.data?.costingError ? (
            <p className="recipe-message error" role="alert">
              Could not load costing: {costings.data.costingError}
            </p>
          ) : null}
          {ingredients.error ? (
            <p className="recipe-message error" role="alert">
              {ingredients.error instanceof Error
                ? ingredients.error.message
                : "Could not load ingredients."}
            </p>
          ) : null}

          <Select
            label="Product"
            className="recipe-product-select"
            value={productId}
            disabled={saving || costings.isPending || !products?.length}
            onChange={(event) => {
              setProductId(event.target.value);
              setErrorMessage("");
              setSuccessMessage("");
            }}
            options={[
              { value: "", label: "Select a product" },
              ...(products ?? []).map(({ product }) => ({
                value: String(product.id),
                label: product.name,
              })),
            ]}
          />

          {costings.isPending ? (
            <p className="muted" role="status">
              Loading products and costing…
            </p>
          ) : products?.length === 0 ? (
            <p className="muted" role="status">
              No products are available.
            </p>
          ) : selected && selectedCosting ? (
            <form className="recipe-editor" onSubmit={save}>
              <div className="recipe-table-wrap">
                <table className="tbl recipe-table">
                  <thead>
                    <tr>
                      <th>Ingredient</th>
                      <th className="recipe-qty-heading">Qty needed</th>
                      <th className="num">Unit cost</th>
                      <th className="num">Line cost</th>
                      <th aria-label="Actions" />
                    </tr>
                  </thead>
                  <tbody>
                    {lineDetails.length ? (
                      lineDetails.map((line, index) => {
                        const usedByOtherRows = new Set(
                          lines
                            .filter((other) => other.key !== line.key)
                            .map((other) => other.ingredientId)
                            .filter(Boolean),
                        );
                        const options = (ingredients.data ?? [])
                          .filter(
                            (ingredient) =>
                              !usedByOtherRows.has(String(ingredient.id)) ||
                              String(ingredient.id) === line.ingredientId,
                          )
                          .map((ingredient) => ({
                            value: String(ingredient.id),
                            label: `${ingredient.name}${ingredient.unit ? ` (${ingredient.unit})` : ""}`,
                          }));
                        return (
                          <tr key={line.key}>
                            <td>
                              <Select
                                aria-label={`Ingredient for row ${index + 1}`}
                                value={line.ingredientId}
                                disabled={saving}
                                onChange={(event) =>
                                  updateLine(line.key, {
                                    ingredientId: event.target.value,
                                  })
                                }
                                options={[
                                  { value: "", label: "Select an ingredient" },
                                  ...options,
                                ]}
                              />
                            </td>
                            <td>
                              <div className="recipe-quantity">
                                <Input
                                  aria-label={`Quantity needed for ${line.ingredient?.name ?? `row ${index + 1}`}`}
                                  type="number"
                                  min="0.01"
                                  step="0.01"
                                  required
                                  disabled={saving}
                                  value={line.quantityNeeded}
                                  onChange={(event) =>
                                    updateLine(line.key, {
                                      quantityNeeded: event.target.value,
                                    })
                                  }
                                />
                                <span className="recipe-qty-unit">
                                  {line.unit}
                                </span>
                              </div>
                            </td>
                            <td className="num">
                              {line.ingredientId
                                ? formatPeso(line.unitCost ?? 0)
                                : "—"}
                            </td>
                            <td className="num">
                              {line.ingredientId
                                ? formatPeso(line.lineCost)
                                : "—"}
                            </td>
                            <td className="recipe-remove-cell">
                              <Button
                                size="sm"
                                variant="danger"
                                className="recipe-remove"
                                aria-label={`Remove ${line.ingredient?.name ?? `row ${index + 1}`}`}
                                disabled={saving}
                                onClick={() => removeLine(line.key)}
                              >
                                <Icon name="trash" />
                              </Button>
                            </td>
                          </tr>
                        );
                      })
                    ) : (
                      <tr>
                        <td colSpan={5} className="recipe-empty">
                          No ingredients in this recipe yet. Add one to get
                          started.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              <div className="recipe-add-row">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={saving}
                  onClick={addLine}
                >
                  <Icon name="plus" />
                  Add ingredient
                </Button>
              </div>

              <div className="recipe-packaging">
                <Input
                  label="Packaging cost (₱)"
                  type="number"
                  min="0"
                  step="0.01"
                  required
                  disabled={saving}
                  value={packaging}
                  onChange={(event) => {
                    setPackaging(event.target.value);
                    setErrorMessage("");
                    setSuccessMessage("");
                  }}
                />
              </div>

              {hasMissingUnitCost ? (
                <p className="recipe-message warning">
                  An ingredient has no unit cost yet and is counted as ₱0.00.
                </p>
              ) : null}
              {errorMessage ? (
                <p className="recipe-message error" role="alert">
                  {errorMessage}
                </p>
              ) : null}
              {successMessage ? (
                <p className="recipe-message success" role="status">
                  {successMessage}
                </p>
              ) : null}

              <div className="recipe-summary" aria-live="polite">
                <div className="recipe-summary-row">
                  <span>Ingredient cost</span>
                  <span className="num">{formatPeso(ingredientCost)}</span>
                </div>
                <div className="recipe-summary-row">
                  <span>Packaging</span>
                  <span className="num">{formatPeso(packagingCost)}</span>
                </div>
                <div className="recipe-summary-row">
                  <span>Total cost</span>
                  <span className="num">{formatPeso(totalCost)}</span>
                </div>
                <div className="recipe-summary-row">
                  <span>Price</span>
                  <span className="num">{formatPeso(price)}</span>
                </div>
                <div
                  className={`recipe-summary-row recipe-summary-margin${margin < 0 ? " negative" : ""}`}
                >
                  <span>Margin</span>
                  <span className="num">
                    {formatPeso(margin)}
                    {marginPercent === null ? "" : ` · ${marginPercent}%`}
                  </span>
                </div>
              </div>

              <div className="recipe-actions">
                <Button type="submit" variant="primary" disabled={!canEdit}>
                  {saving ? "Saving…" : "Save recipe"}
                </Button>
                <Link href="/products" className="btn btn-sm">
                  Back to list
                </Link>
              </div>
            </form>
          ) : null}
        </>
      )}
    </div>
  );
}
