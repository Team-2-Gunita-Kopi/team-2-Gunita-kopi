"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { Button, DataTable, Dialog, Input, useToast } from "@gunita/ui";
import {
  PRODUCT_IMAGE_MAX_BYTES,
  PRODUCT_IMAGE_TYPES,
  productImageSrc,
  type Product,
} from "@gunita/contracts";
import { useLiveQuery } from "@/lib/data";
import { USE_MOCKS } from "@/lib/use-mocks";
import {
  createProduct,
  listProductsWithCosting,
  removeProductImage,
  toProductRow,
  updateProduct,
  uploadProductImage,
  type ProductRow,
} from "@/features/products/api";

type SampleProductRow = ProductRow;

const sampleProducts: SampleProductRow[] = [
  {
    id: "prod-1",
    name: "Spanish Latte",
    category: "Coffee",
    sellingPrice: "₱140.00",
    costPrice: "₱42.50",
    margin: "69.6%",
    available: true,
  },
  {
    id: "prod-2",
    name: "Caramel Macchiato",
    category: "Coffee",
    sellingPrice: "₱150.00",
    costPrice: "₱48.20",
    margin: "67.8%",
    available: true,
  },
];

const EMPTY = { name: "", description: "", category: "", price: "" };
const IMAGE_TYPES: readonly string[] = PRODUCT_IMAGE_TYPES;

export default function ProductsPage() {
  const toast = useToast();
  const client = useQueryClient();
  const products = useLiveQuery(["products"], listProductsWithCosting, {
    enabled: !USE_MOCKS,
  });
  const [editing, setEditing] = useState<Product | "new" | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [file, setFile] = useState<File | null>(null);
  const [removeImage, setRemoveImage] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const byId = new Map(
    (products.data?.items ?? []).map((r) => [String(r.product.id), r.product]),
  );
  const rows = USE_MOCKS
    ? sampleProducts
    : (products.data?.items ?? []).map((r) =>
        toProductRow(r.product, r.costing),
      );

  const open = (p: Product | "new") => {
    setErrorMessage("");
    setEditing(p);
    setFile(null);
    setRemoveImage(false);
    setForm(
      p === "new"
        ? EMPTY
        : {
            name: p.name,
            description: p.description ?? "",
            category: p.category ?? "",
            price: String(p.price),
          },
    );
  };

  // Quick check before upload; the API checks the file's real type and size again.
  const pickFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] ?? null;
    setErrorMessage("");
    if (f && !IMAGE_TYPES.includes(f.type)) {
      setErrorMessage("Choose a PNG, JPEG or WebP image.");
      e.target.value = "";
      return setFile(null);
    }
    if (f && f.size > PRODUCT_IMAGE_MAX_BYTES) {
      setErrorMessage("The image must be 2 MB or smaller.");
      e.target.value = "";
      return setFile(null);
    }
    setFile(f);
    if (f) setRemoveImage(false);
  };

  const currentImage =
    editing && editing !== "new" ? productImageSrc(editing) : undefined;
  const refresh = () => client.invalidateQueries({ queryKey: ["products"] });

  // FR-50/FR-52: the API records the creating user and date.
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage("");
    const body = {
      name: form.name,
      description: form.description || null,
      category: form.category || null,
      price: Number(form.price),
    };
    try {
      const saved =
        editing === "new"
          ? await createProduct({ ...body, isAvailable: true })
          : editing
            ? await updateProduct(editing.id, body)
            : null;
      // The image needs the product id, so it is stored after the product is saved.
      if (saved && file) await uploadProductImage(saved.id, file);
      else if (saved && removeImage) await removeProductImage(saved.id);
      setEditing(null);
      await refresh();
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : "Could not save the product.",
      );
    }
  };

  // FR-51: unavailable products disappear from the POS catalog.
  const toggleAvailable = async (row: ProductRow) => {
    try {
      await updateProduct(Number(row.id), { isAvailable: !row.available });
      await refresh();
    } catch (err) {
      toast(
        err instanceof Error ? err.message : "Could not update the product.",
        true,
      );
    }
  };

  const set =
    (key: keyof typeof EMPTY) => (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm({ ...form, [key]: e.target.value });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Products</h1>
          <p className="text-sm text-gray-500">Manage coffee menu and items</p>
        </div>
        <div className="flex items-center space-x-3">
          <Link href="/products/recipe-costing">
            <Button variant="outline">Recipe Costing</Button>
          </Link>
          <Button onClick={() => open("new")} disabled={USE_MOCKS}>
            Add Product
          </Button>
        </div>
      </div>

      {products.error && (
        <p className="text-sm text-red-700">
          {products.error instanceof Error
            ? products.error.message
            : "Could not load products."}
        </p>
      )}
      {products.data?.costingError && (
        <p className="text-sm text-red-700">
          Costs and margins could not be loaded: {products.data.costingError}
        </p>
      )}

      <DataTable<SampleProductRow>
        columns={[
          {
            key: "imageSrc",
            header: "Image",
            render: (row) =>
              row.imageSrc ? (
                <img
                  src={row.imageSrc}
                  alt=""
                  className="h-10 w-10 rounded object-cover"
                />
              ) : null,
          },
          { key: "name", header: "Product Name" },
          { key: "category", header: "Category" },
          { key: "sellingPrice", header: "Selling Price" },
          { key: "costPrice", header: "Cost (COGS)" },
          { key: "margin", header: "Profit Margin" },
          {
            key: "available",
            header: "Status",
            render: (row) => (
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={USE_MOCKS}
                  onClick={() => void toggleAvailable(row)}
                >
                  {row.available ? "Available" : "Unavailable"}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={USE_MOCKS}
                  onClick={() => {
                    const p = byId.get(row.id);
                    if (p) open(p);
                  }}
                >
                  Edit
                </Button>
              </div>
            ),
          },
        ]}
        data={rows}
        keyExtractor={(row) => row.id}
      />

      <Dialog
        isOpen={editing !== null}
        onClose={() => setEditing(null)}
        title={editing === "new" ? "Add Product" : "Edit Product"}
      >
        <form onSubmit={save} className="space-y-4">
          {errorMessage && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg">
              {errorMessage}
            </div>
          )}
          <Input
            label="Product Name"
            required
            maxLength={100}
            value={form.name}
            onChange={set("name")}
          />
          <Input
            label="Description"
            value={form.description}
            onChange={set("description")}
          />
          <Input
            label="Category"
            maxLength={50}
            value={form.category}
            onChange={set("category")}
          />
          <Input
            label="Selling Price"
            type="number"
            min="0"
            step="0.01"
            required
            value={form.price}
            onChange={set("price")}
          />
          <div className="space-y-2">
            <label
              htmlFor="product-image"
              className="block text-sm font-medium text-gray-700"
            >
              Image (PNG, JPEG or WebP, up to 2 MB)
            </label>
            {currentImage && !file && !removeImage && (
              <div className="flex items-center gap-3">
                <img
                  src={currentImage}
                  alt=""
                  className="h-16 w-16 rounded object-cover"
                />
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => setRemoveImage(true)}
                >
                  Remove image
                </Button>
              </div>
            )}
            <input
              id="product-image"
              type="file"
              accept={IMAGE_TYPES.join(",")}
              onChange={pickFile}
              className="block w-full text-sm"
            />
          </div>
          <div className="flex justify-end space-x-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setEditing(null)}
            >
              Cancel
            </Button>
            <Button type="submit">Save</Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
