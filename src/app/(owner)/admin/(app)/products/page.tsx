"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import {
  Button,
  DataTable,
  Icon,
  Tabs,
  useToast,
} from "@/ui";
import type { IconName } from "@/ui";
import { useLiveQuery } from "@/owner/lib/data";
import { USE_MOCKS } from "@/owner/lib/use-mocks";
import {
  listProductsWithCosting,
  toProductRow,
  updateProduct,
  type ProductRow,
} from "@/owner/features/products/api";
import { listUsers } from "@/owner/features/users/api";

interface ProductListRow extends ProductRow {
  creator: string;
}

const sampleProducts: ProductListRow[] = [
  {
    id: "1",
    name: "Iced Spanish Latte",
    description: "Condensed-milk classic, 16oz",
    category: "Iced Coffee Drinks",
    sellingPrice: "₱145.00",
    costPrice: "₱176.50",
    margin: "-22%",
    marginPercent: -21.7,
    available: true,
    createdAt: "2026-08-08T00:00:00+08:00",
    createdBy: 1,
    creator: "Eric Espedilion",
  },
  {
    id: "2",
    name: "Iced Caramel Macchiato",
    description: "Caramel drizzle over milk, 16oz",
    category: "Iced Coffee Drinks",
    sellingPrice: "₱150.00",
    costPrice: "₱41.20",
    margin: "73%",
    marginPercent: 72.5,
    available: true,
    createdAt: "2026-08-08T00:00:00+08:00",
    createdBy: 1,
    creator: "Eric Espedilion",
  },
  {
    id: "3",
    name: "Iced Ube Latte",
    description: "Ube halaya + espresso, 16oz",
    category: "Iced Coffee Drinks",
    sellingPrice: "₱155.00",
    costPrice: "₱26.20",
    margin: "83%",
    marginPercent: 83.1,
    available: true,
    createdAt: "2026-08-08T00:00:00+08:00",
    createdBy: 1,
    creator: "Eric Espedilion",
  },
  {
    id: "4",
    name: "Iced Americano",
    description: "Straight espresso over ice, 16oz",
    category: "Iced Coffee Drinks",
    sellingPrice: "₱110.00",
    costPrice: "₱26.20",
    margin: "76%",
    marginPercent: 76.2,
    available: true,
    createdAt: "2026-08-08T00:00:00+08:00",
    createdBy: 1,
    creator: "Eric Espedilion",
  },
  {
    id: "5",
    name: "Iced Hazelnut Latte",
    description: "Hazelnut syrup latte, 16oz",
    category: "Iced Coffee Drinks",
    sellingPrice: "₱150.00",
    costPrice: "₱41.20",
    margin: "73%",
    marginPercent: 72.5,
    available: true,
    createdAt: "2026-08-08T00:00:00+08:00",
    createdBy: 1,
    creator: "Eric Espedilion",
  },
];

const PRODUCT_TABS = [
  { id: "list", label: "Product List", href: "/admin/products" },
  {
    id: "costing",
    label: "Recipe & Costing",
    href: "/admin/products/recipe-costing",
  },
];

function createdDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("en-US", {
        timeZone: "Asia/Manila",
        month: "short",
        day: "numeric",
        year: "numeric",
      }).format(date);
}

function productIcon(category: string): IconName {
  if (/meal|silog/i.test(category)) return "rice";
  if (/snack|bread|pastry/i.test(category)) return "pastry";
  return /coffee/i.test(category) ? "iced" : "cup";
}

export default function ProductsPage() {
  const toast = useToast();
  const router = useRouter();
  const client = useQueryClient();
  const products = useLiveQuery(["products"], listProductsWithCosting, {
    enabled: !USE_MOCKS,
  });
  const users = useLiveQuery(["users"], listUsers, { enabled: !USE_MOCKS });
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");

  const creatorNames = new Map(
    (users.data ?? []).map((user) => [user.id, user.fullName]),
  );
  const productRows: ProductListRow[] = USE_MOCKS
    ? sampleProducts
    : (products.data?.items ?? []).map(({ product, costing }) => {
        const row = toProductRow(product, costing);
        const creator =
          product.createdBy === null
            ? "—"
            : (creatorNames.get(product.createdBy) ??
              (users.isLoading
                ? "Loading…"
                : users.error
                  ? "Unavailable"
                  : "Unknown user"));
        return { ...row, creator };
      });
  const rows = [...productRows].sort((a, b) => Number(a.id) - Number(b.id));
  const categories = [
    ...new Set(rows.map((row) => row.category).filter(Boolean)),
  ].sort();
  const filteredRows = rows.filter(
    (row) =>
      row.name.toLowerCase().includes(search.trim().toLowerCase()) &&
      (!categoryFilter || row.category === categoryFilter),
  );

  const refresh = () => client.invalidateQueries({ queryKey: ["products"] });

  // FR-51: unavailable products disappear from the POS catalog.
  const toggleAvailable = async (row: ProductRow) => {
    try {
      await updateProduct(Number(row.id), { isAvailable: !row.available });
      toast(`${row.name} is now ${row.available ? "unavailable" : "available"}.`);
      await refresh();
    } catch (err) {
      toast(
        err instanceof Error ? err.message : "Could not update the product.",
        true,
      );
    }
  };

  return (
    <div className="space-y-5">
      <header className="product-page-header">
        <div>
          <p className="product-page-kicker">Gunita · Products Board</p>
          <h1>Products</h1>
        </div>
        <Button variant="primary" onClick={() => router.push("/admin/products/new")} disabled={USE_MOCKS}>
          <Icon name="plus" />
          Add product
        </Button>
      </header>

      <Tabs tabs={PRODUCT_TABS} activeTab="list" className="product-tabs" />

      <div className="product-filters" aria-label="Product filters">
        <label className="field">
          Search
          <input
            type="search"
            placeholder="Product name"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
        <label className="field">
          Category
          <select
            value={categoryFilter}
            onChange={(event) => setCategoryFilter(event.target.value)}
          >
            <option value="">All</option>
            {categories.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>
        </label>
      </div>

      {products.error && (
        <p role="alert" className="text-sm text-[var(--danger)]">
          {products.error instanceof Error
            ? products.error.message
            : "Could not load products."}
        </p>
      )}
      {users.error && (
        <p role="alert" className="text-sm text-[var(--danger)]">
          Creator names could not be loaded:{" "}
          {users.error instanceof Error
            ? users.error.message
            : "Request failed."}
        </p>
      )}
      {products.data?.costingError && (
        <p className="text-sm text-[var(--danger)]">
          Costs and margins could not be loaded: {products.data.costingError}
        </p>
      )}
      {!USE_MOCKS && products.isLoading && (
        <p role="status">Loading products…</p>
      )}

      <div className="products-table">
        <DataTable<ProductListRow>
          className="tbl-products"
          columns={[
            { key: "id", header: "ID", className: "num" },
            {
              key: "thumbnail",
              header: "",
              render: (row) =>
                row.imageSrc ? (
                  <img
                    src={row.imageSrc}
                    alt={`${row.name} product`}
                    className="product-thumbnail"
                  />
                ) : (
                  <span className="product-thumbnail">
                    <Icon name={productIcon(row.category)} />
                  </span>
                ),
            },
            {
              key: "name",
              header: "Name",
              render: (row) => (
                <span className="product-name-cell">
                  <strong>{row.name}</strong>
                  {row.description && <span>{row.description}</span>}
                </span>
              ),
            },
            { key: "category", header: "Category" },
            { key: "sellingPrice", header: "Price", className: "num" },
            { key: "costPrice", header: "Cost", className: "num" },
            {
              key: "margin",
              header: "Margin",
              className: "num",
              render: (row) =>
                row.margin ? (
                  <span
                    className={`product-margin${row.marginPercent !== null && row.marginPercent < 0 ? " negative" : ""}`}
                  >
                    {row.margin}
                  </span>
                ) : null,
            },
            {
              key: "available",
              header: "Available",
              render: (row) => (
                <label className="avail-toggle">
                  <span className="switch">
                    <input
                      type="checkbox"
                      role="switch"
                      aria-label={`Available for ${row.name}`}
                      checked={row.available}
                      disabled={USE_MOCKS}
                      onChange={() => void toggleAvailable(row)}
                    />
                    <span className="tr" />
                  </span>
                </label>
              ),
            },
            {
              key: "createdAt",
              header: "Date Created",
              render: (row) => createdDate(row.createdAt),
            },
            { key: "creator", header: "Created By" },
            {
              key: "actions",
              header: "Actions",
              className: "act-cell",
              render: (row) => (
                <div className="product-actions">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={USE_MOCKS}
                    aria-label={`Edit ${row.name}`}
                    onClick={() => router.push(`/admin/products/${row.id}/edit`)}
                  >
                    <Icon name="pencil" />
                    Edit
                  </Button>
                  <Link
                    href="/admin/products/recipe-costing"
                    className="btn btn-sm product-recipe-link"
                  >
                    Recipe &amp; Costing
                  </Link>
                </div>
              ),
            },
          ]}
          data={filteredRows}
          emptyMessage={
            products.error
              ? "Could not load products."
              : "No products match these filters."
          }
          keyExtractor={(row) => row.id}
        />
      </div>

    </div>
  );
}
