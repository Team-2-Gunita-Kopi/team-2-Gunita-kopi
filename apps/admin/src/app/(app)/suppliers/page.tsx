"use client";

import React, { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, DataTable, Dialog, Input, StatusBadge, useToast } from "@gunita/ui";
import type { Supplier } from "@gunita/contracts";
import { USE_MOCKS } from "@/lib/use-mocks";
import { createSupplier, listSuppliers, updateSupplier } from "@/features/suppliers/api";

interface SupplierRow extends Record<string, unknown> {
  id: string;
  name: string;
  contactPerson: string;
  phone: string;
  address: string;
  status: string;
}

const sampleSuppliers: SupplierRow[] = [
  {
    id: "sup-1",
    name: "Benguet Coffee Roasters Co.",
    contactPerson: "Carlos Mendoza",
    phone: "+63 917 123 4567",
    address: "La Trinidad, Benguet",
    status: "active",
  },
  {
    id: "sup-2",
    name: "Dairy Fresh Laguna",
    contactPerson: "Maria Santos",
    phone: "+63 918 765 4321",
    address: "Calamba, Laguna",
    status: "active",
  },
];

const EMPTY = { name: "", contactPerson: "", contactNumber: "", address: "" };

export default function SuppliersPage() {
  const toast = useToast();
  const client = useQueryClient();
  const suppliers = useQuery({ queryKey: ["suppliers"], enabled: !USE_MOCKS, queryFn: listSuppliers });
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
      await refresh();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not update the supplier.", true);
    }
  };

  const set = (key: keyof typeof EMPTY) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm({ ...form, [key]: e.target.value });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Suppliers</h1>
          <p className="text-sm text-gray-500">
            Manage coffee bean and ingredient suppliers
          </p>
        </div>
        <Button onClick={() => open("new")} disabled={USE_MOCKS}>
          Add Supplier
        </Button>
      </div>

      {suppliers.error && (
        <p className="text-sm text-red-700">
          {suppliers.error instanceof Error ? suppliers.error.message : "Could not load suppliers."}
        </p>
      )}

      <DataTable<SupplierRow>
        columns={[
          { key: "name", header: "Supplier Name" },
          { key: "contactPerson", header: "Contact Person" },
          { key: "phone", header: "Phone" },
          { key: "address", header: "Address" },
          {
            key: "status",
            header: "Status",
            render: (row) => (
              <StatusBadge
                status={row.status === "active" ? "completed" : "cancelled"}
                label={row.status === "active" ? "Active" : "Inactive"}
              />
            ),
          },
          {
            key: "actions",
            header: "",
            render: (row) => (
              <div className="flex gap-2">
                <Button size="sm" variant="ghost" disabled={USE_MOCKS} onClick={() => {
                  const s = byId.get(row.id);
                  if (s) open(s);
                }}>
                  Edit
                </Button>
                <Button size="sm" variant="outline" disabled={USE_MOCKS} onClick={() => void toggleStatus(row)}>
                  {row.status === "active" ? "Deactivate" : "Activate"}
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
            <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg">
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
