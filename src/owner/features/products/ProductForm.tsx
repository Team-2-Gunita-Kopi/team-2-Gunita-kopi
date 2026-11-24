"use client";

import React, { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { PRODUCT_IMAGE_MAX_BYTES, PRODUCT_IMAGE_TYPES } from "@/contracts";
import type { Product } from "@/contracts";
import { Button, Input, Select, useToast } from "@/ui";
import { ownerImageSrc } from "./image";
import {
  createProduct,
  removeProductImage,
  updateProduct,
  uploadProductImage,
} from "./api";

interface ProductFields {
  name: string;
  category: string;
  price: string;
  description: string;
}

/**
 * Owner product form (Figma "Owner Add Product" / "Owner Edit Products"). Without `product` it
 * creates a new product; the image is stored after the product exists (it needs the id).
 */
export function ProductForm({
  product,
  categories,
}: {
  product?: Product;
  categories: string[];
}) {
  const router = useRouter();
  const client = useQueryClient();
  const toast = useToast();
  const fileInput = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState<ProductFields>({
    name: product?.name ?? "",
    category: product?.category ?? "",
    price: product ? String(product.price) : "",
    description: product?.description ?? "",
  });
  const [available, setAvailable] = useState(product?.isAvailable ?? true);
  const [file, setFile] = useState<File | null>(null);
  const [fileUrl, setFileUrl] = useState<string>();
  const [removeImage, setRemoveImage] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const storedImage = product ? ownerImageSrc(product) : undefined;
  const previewImage = fileUrl ?? (removeImage ? undefined : storedImage);
  const categoryOptions = [...new Set([...categories, product?.category ?? ""])]
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
      const body = {
        name,
        category: form.category || null,
        price,
        description: form.description.trim() || null,
        isAvailable: available,
      };
      saved = product
        ? await updateProduct(product.id, body)
        : await createProduct(body);
      if (file) saved = await uploadProductImage(saved.id, file);
      else if (removeImage) saved = await removeProductImage(saved.id);
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
    client.setQueryData(["product", saved.id], saved);
    await Promise.all([
      client.invalidateQueries({ queryKey: ["products"] }),
      client.invalidateQueries({ queryKey: ["product-edit-categories"] }),
    ]);
    toast(product ? "Product updated." : "Product added.");
    router.push("/admin/products");
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
            <img src={previewImage} alt={`${form.name || "New"} product`} />
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
          onClick={() => router.push("/admin/products")}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}
