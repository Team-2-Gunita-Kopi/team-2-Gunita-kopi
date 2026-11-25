"use client";

import React, { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, DataTable, Dialog, Icon, Input, StatusBadge, useConfirm, useToast } from "@/ui";
import type { Supplier } from "@/contracts";
import { USE_MOCKS } from "@/owner/lib/use-mocks";
import { createSupplier, deleteSupplier, listSuppliers, updateSupplier } from "@/owner/features/suppliers/api";
import { listIngredients } from "@/owner/features/inventory/api";

interface SupplierRow extends Record<string, unknown> {
  id: string;
  name: string;
  contactPerson: string;
  phone: string;
  address: string;
  status: string;
  ingredients: number;
}

const sampleSuppliers: SupplierRow[] = [
  {
    id: "sup-1",
    name: "Benguet Coffee Roasters Co.",
    contactPerson: "Carlos Mendoza",
    phone: "+63 917 123 4567",
    address: "La Trinidad, Benguet",
    status: "active",
    ingredients: 3,
  },
  {
    id: "sup-2",
    name: "Dairy Fresh Laguna",
    contactPerson: "Maria Santos",
    phone: "+63 918 765 4321",
    address: "Calamba, Laguna",
    status: "active",
    ingredients: 2,
  },
];

const EMPTY = { name: "", contactPerson: "", contactNumber: "", address: "" };

export default function SuppliersPage() {
  const toast = useToast();
  const confirm = useConfirm();
  const client = useQueryClient();
  const suppliers = useQuery({ queryKey: ["suppliers"], enabled: !USE_MOCKS, queryFn: listSuppliers });
  // Same query key as the Inventory page, so the list is shared from the cache.
  const ingredients = useQuery({ queryKey: ["ingredients"], enabled: !USE_MOCKS, queryFn: listIngredients });
  const ingredientCount = new Map<number, number>();
  for (const i of ingredients.data ?? [])
    if (i.supplierId !== null) ingredientCount.set(i.supplierId, (ingredientCount.get(i.supplierId) ?? 0) + 1);
  const [editing, setEditing] = useState<Supplier | "new" | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [errorMessage, setErrorMessage] = useState("");

  const byId = new Map((suppliers.data ?? []).map((s) => [String(s.id), s]));
  const rows: SupplierRow[] = USE_MOCKS
    ? sampleSuppliers
    : (suppliers.data ?? []).map((s) => ({
        id: String(s.id),
        name: s.name,
        contactPerson: s.contactPerson ?? "",
        phone: s.contactNumber ?? "",
        address: s.address ?? "",
        status: s.status,
        ingredients: ingredientCount.get(s.id) ?? 0,
      }));

  const open = (s: Supplier | "new") => {
    setErrorMessage("");
    setEditing(s);
    setForm(
      s === "new"
        ? EMPTY
        : {
            name: s.name,
            contactPerson: s.contactPerson ?? "",
            contactNumber: s.contactNumber ?? "",
            address: s.address ?? "",
          },
    );
  };

  const refresh = () => client.invalidateQueries({ queryKey: ["suppliers"] });

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage("");
    try {
      if (editing === "new") await createSupplier(form);
      else if (editing) await updateSupplier(editing.id, form);
      toast(editing === "new" ? "Supplier added." : "Supplier updated.");
      setEditing(null);
      await refresh();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Could not save the supplier.");
    }
  };

  // FR-22: deactivate instead of delete, so ingredient links stay valid.
  const toggleStatus = async (row: SupplierRow) => {
    try {
      await updateSupplier(Number(row.id), { status: row.status === "active" ? "inactive" : "active" });
      toast(`${row.name} ${row.status === "active" ? "deactivated" : "activated"}.`);
      await refresh();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not update the supplier.", true);
    }
  };

  // Soft delete: gone from this list and the ingredient forms; its ingredients lose the link.
  const removeSupplier = async (row: SupplierRow) => {
    const linked =
      row.ingredients === 0
        ? ""
        : ` ${row.ingredients} ${row.ingredients === 1 ? "ingredient" : "ingredients"} will no longer have a supplier.`;
    const ok = await confirm({
      title: "Delete supplier",
      message: `Delete ${row.name}? This cannot be undone. It disappears from the supplier list.${linked}`,
      confirmLabel: "Delete",
      danger: true,
    });
    if (!ok) return;
    try {
      await deleteSupplier(Number(row.id));
    } catch (err) {
      toast(`Could not delete ${row.name}: ${err instanceof Error ? err.message : "please try again."}`, true);
      return;
    }
    toast(`${row.name} deleted.`);
    await Promise.all([refresh(), client.invalidateQueries({ queryKey: ["ingredients"] })]);
  };

  const set = (key: keyof typeof EMPTY) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm({ ...form, [key]: e.target.value });

  return (
    <div className="space-y-6">
      <header className="product-page-header">
        <div>
          <p className="product-page-kicker">Gunita · Suppliers Board</p>
          <h1>Suppliers</h1>
        </div>
        <Button variant="primary" onClick={() => open("new")} disabled={USE_MOCKS}>
          <Icon name="plus" />
          Add supplier
        </Button>
      </header>

      {suppliers.error && (
        <p className="text-sm text-[var(--danger)]">
          {suppliers.error instanceof Error ? suppliers.error.message : "Could not load suppliers."}
        </p>
      )}

      <DataTable<SupplierRow>
        columns={[
          { key: "name", header: "Name", render: (row) => <strong>{row.name}</strong> },
          { key: "contactPerson", header: "Contact Person" },
          { key: "phone", header: "Number", className: "mono" },
          { key: "address", header: "Address" },
          {
            key: "status",
            header: "Status",
            render: (row) => (
              <StatusBadge
                status={row.status === "active" ? "ok" : "out_of_stock"}
                label={row.status === "active" ? "Active" : "Inactive"}
                withIcon
              />
            ),
          },
          { key: "ingredients", header: "Ingredients", className: "num" },
          {
            key: "actions",
            header: "Actions",
            render: (row) => (
              <div className="flex gap-2">
                <Button size="sm" disabled={USE_MOCKS} onClick={() => {
                  const s = byId.get(row.id);
                  if (s) open(s);
                }}>
                  <Icon name="pencil" />
                  Edit
                </Button>
                <Button
                  size="sm"
                  variant={row.status === "active" ? "danger" : "default"}
                  disabled={USE_MOCKS}
                  onClick={() => void toggleStatus(row)}
                >
                  {row.status === "active" ? "Deactivate" : "Activate"}
                </Button>
                <Button
                  size="sm"
                  variant="danger"
                  disabled={USE_MOCKS}
                  aria-label={`Delete ${row.name}`}
                  onClick={() => void removeSupplier(row)}
                >
                  <Icon name="trash" />
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
        title={editing === "new" ? "Add Supplier" : "Edit Supplier"}
      >
        <form onSubmit={save} className="space-y-4">
          {errorMessage && (
            <div className="p-3 bg-[var(--surface)] border border-[var(--danger)] text-[var(--danger)] text-xs rounded-lg">
              {errorMessage}
            </div>
          )}
          <Input label="Supplier Name" required maxLength={100} value={form.name} onChange={set("name")} />
          <Input label="Contact Person" maxLength={100} value={form.contactPerson} onChange={set("contactPerson")} />
          <Input label="Contact Number" maxLength={20} value={form.contactNumber} onChange={set("contactNumber")} />
          <Input label="Address" maxLength={255} value={form.address} onChange={set("address")} />
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
