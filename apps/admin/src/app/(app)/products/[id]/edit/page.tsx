"use client";

import React, { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  PRODUCT_IMAGE_MAX_BYTES,
  PRODUCT_IMAGE_TYPES,
  productImageSrc,
} from "@gunita/contracts";
import type { Product } from "@gunita/contracts";
import { Button, Input, Select, Tabs, useToast } from "@gunita/ui";
import { USE_MOCKS } from "@/lib/use-mocks";
import {
  getProduct,
  listProducts,
  removeProductImage,
  updateProduct,
  uploadProductImage,
} from "@/features/products/api";

const PRODUCT_TABS = [
  { id: "list", label: "Product List", href: "/products" },
  {
    id: "costing",
    label: "Recipe & Costing",
    href: "/products/recipe-costing",
  },
];

interface ProductForm {
  name: string;
  category: string;
  price: string;
  description: string;
}

function ProductEditForm({
  product,
  categories,
}: {
  product: Product;
  categories: string[];
}) {
  const router = useRouter();
  const client = useQueryClient();
  const toast = useToast();
  const fileInput = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState<ProductForm>({
    name: product.name,
    category: product.category ?? "",
    price: String(product.price),
    description: product.description ?? "",
  });
  const [available, setAvailable] = useState(product.isAvailable);
  const [file, setFile] = useState<File | null>(null);
  const [fileUrl, setFileUrl] = useState<string>();
  const [removeImage, setRemoveImage] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const storedImage = productImageSrc(product);
  const previewImage = fileUrl ?? (removeImage ? undefined : storedImage);
  const categoryOptions = [...new Set([...categories, product.category ?? ""])]
    .filter(Boolean)
    .map((category) => ({ value: category, label: category }));

  useEffect(() => {
    if (!file) {
      setFileUrl(undefined);
      return;
    }
    const url = URL.createObjectURL(file);
    setFileUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const pickFile = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selected = event.target.files?.[0];
    if (!selected) return;
    setErrorMessage("");
    if (!(PRODUCT_IMAGE_TYPES as readonly string[]).includes(selected.type)) {
      setErrorMessage("Choose a PNG, JPEG or WebP image.");
      event.target.value = "";
      return;
    }
    if (selected.size > PRODUCT_IMAGE_MAX_BYTES) {
      setErrorMessage("The image must be 2 MB or smaller.");
      event.target.value = "";
      return;
    }
    setFile(selected);
    setRemoveImage(false);
  };

  const save = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMessage("");
    const name = form.name.trim();
    const price = Number(form.price);
    if (!name) {
      setErrorMessage("Product name is required.");
      return;
    }
    if (!Number.isFinite(price) || price < 0) {
      setErrorMessage("Enter a valid product price.");
      return;
    }

    setSaving(true);
    let saved: Product | null = null;
    try {
      saved = await updateProduct(product.id, {
        name,
        category: form.category || null,
        price,
        description: form.description.trim() || null,
        isAvailable: available,
      });
      if (file) saved = await uploadProductImage(product.id, file);
      else if (removeImage) saved = await removeProductImage(product.id);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Could not save the product.";
      setErrorMessage(
        saved
          ? `${message} Product details were saved, but the image change did not complete.`
          : message,
      );
      if (saved) await client.invalidateQueries({ queryKey: ["products"] });
      setSaving(false);
      return;
    }

    if (!saved) {
      setSaving(false);
      return;
    }
    client.setQueryData(["product", product.id], saved);
    await Promise.all([
      client.invalidateQueries({ queryKey: ["products"] }),
      client.invalidateQueries({ queryKey: ["product-edit-categories"] }),
    ]);
    toast("Product updated.");
    router.push("/products");
  };

  return (
    <form className="product-edit-form" onSubmit={(event) => void save(event)}>
      {errorMessage ? (
        <p role="alert" className="recipe-message error">
          {errorMessage}
        </p>
      ) : null}
      <div className="product-edit-fields">
        <Input
          label="Name"
          required
          maxLength={100}
          value={form.name}
          onChange={(event) =>
            setForm((current) => ({ ...current, name: event.target.value }))
          }
        />
        <Select
          label="Category"
          required
          value={form.category}
          options={[
            { value: "", label: "Choose category" },
            ...categoryOptions,
          ]}
          onChange={(event) =>
            setForm((current) => ({
              ...current,
              category: event.target.value,
            }))
          }
        />
        <Input
          label="Price (₱)"
          type="number"
          min="0"
          step="0.01"
          required
          value={form.price}
          onChange={(event) =>
            setForm((current) => ({ ...current, price: event.target.value }))
          }
        />
      </div>

      <label className="field product-edit-description">
        Description
        <textarea
          maxLength={5000}
          value={form.description}
          onChange={(event) =>
            setForm((current) => ({
              ...current,
              description: event.target.value,
            }))
          }
        />
      </label>

      <div className="product-edit-image-row">
        <div className="product-edit-image-controls">
          <span className="product-edit-image-label">Image</span>
          <input
            ref={fileInput}
            id="edit-product-image"
            type="file"
            accept={PRODUCT_IMAGE_TYPES.join(",")}
            onChange={pickFile}
            className="product-edit-image-input"
            aria-label="Product image"
          />
          <div className="product-edit-image-actions">
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={saving}
              onClick={() => fileInput.current?.click()}
            >
              Choose image
            </Button>
            {file ? (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={saving}
                onClick={() => {
                  setFile(null);
                  if (fileInput.current) fileInput.current.value = "";
                }}
              >
                Discard selected
              </Button>
            ) : storedImage && !removeImage ? (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={saving}
                onClick={() => {
                  setRemoveImage(true);
                }}
              >
                Remove image
              </Button>
            ) : null}
            {removeImage ? (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={saving}
                onClick={() => setRemoveImage(false)}
              >
                Undo
              </Button>
            ) : null}
            {file ? (
              <span className="muted product-edit-file-name">{file.name}</span>
            ) : null}
          </div>
        </div>
        <button
          type="button"
          className="product-edit-image-preview"
          aria-label="Choose product image"
          disabled={saving}
          onClick={() => fileInput.current?.click()}
        >
          {previewImage ? (
            <img src={previewImage} alt={`${product.name} product`} />
          ) : (
            <span>No image</span>
          )}
        </button>
      </div>

      <label className="avail-toggle product-edit-availability">
        <span className="switch">
          <input
            type="checkbox"
            role="switch"
            aria-label="Available on POS"
            checked={available}
            onChange={(event) => setAvailable(event.target.checked)}
          />
          <span className="tr" />
        </span>
        <span>Available on POS</span>
      </label>

      <div className="product-edit-actions">
        <Button type="submit" variant="primary" disabled={saving}>
          {saving ? "Saving…" : "Save"}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={saving}
          onClick={() => router.push("/products")}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}

export default function EditProductPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const productId = Number(id);
  const validId = Number.isSafeInteger(productId) && productId > 0;
  const product = useQuery({
    queryKey: ["product", productId],
    enabled: !USE_MOCKS && validId,
    queryFn: () => getProduct(productId),
  });
  const productList = useQuery({
    queryKey: ["product-edit-categories"],
    enabled: !USE_MOCKS,
    queryFn: listProducts,
  });

  if (USE_MOCKS) {
    return (
      <div className="product-edit-page">
        <p className="muted" role="status">
          Product editing is available when the Admin app is connected to the
          API.
        </p>
        <Button variant="outline" onClick={() => router.push("/products")}>
          Cancel
        </Button>
      </div>
    );
  }
  if (!validId) {
    return (
      <p role="alert" className="recipe-message error">
        Invalid product id.
      </p>
    );
  }
  if (product.isPending) return <p role="status">Loading product…</p>;
  if (product.error || !product.data) {
    return (
      <div className="product-edit-page">
        <p role="alert" className="recipe-message error">
          {product.error instanceof Error
            ? product.error.message
            : "Product not found."}
        </p>
        <Button variant="outline" onClick={() => router.push("/products")}>
          Cancel
        </Button>
      </div>
    );
  }

  const categories = [
    ...new Set((productList.data ?? []).map((item) => item.category ?? "")),
  ].filter(Boolean);

  return (
    <div className="product-edit-page">
      <header>
        <p className="product-page-kicker">Gunita · Admin</p>
        <h1>Edit — {product.data.name}</h1>
      </header>
      <Tabs tabs={PRODUCT_TABS} activeTab="list" className="product-tabs" />
      {productList.error ? (
        <p role="alert" className="recipe-message error">
          Product categories could not be loaded. The current category remains
          available.
        </p>
      ) : null}
      <ProductEditForm
        key={product.data.id}
        product={product.data}
        categories={categories}
      />
    </div>
  );
}
