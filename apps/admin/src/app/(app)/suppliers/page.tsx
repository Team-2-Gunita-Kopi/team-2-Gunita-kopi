"use client";

import React from "react";
import { Button, DataTable } from "@gunita/ui";

interface SupplierRow extends Record<string, unknown> {
  id: string;
  name: string;
  contactPerson: string;
  phone: string;
  email: string;
}

const sampleSuppliers: SupplierRow[] = [
  {
    id: "sup-1",
    name: "Benguet Coffee Roasters Co.",
    contactPerson: "Carlos Mendoza",
    phone: "+63 917 123 4567",
    email: "carlos@benguetcoffee.ph",
  },
  {
    id: "sup-2",
    name: "Dairy Fresh Laguna",
    contactPerson: "Maria Santos",
    phone: "+63 918 765 4321",
    email: "orders@dairyfresh.ph",
  },
];

export default function SuppliersPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Suppliers</h1>
          <p className="text-sm text-gray-500">
            Manage coffee bean and ingredient suppliers
          </p>
        </div>
        <Button>Add Supplier</Button>
      </div>

      <DataTable<SupplierRow>
        columns={[
          { key: "name", header: "Supplier Name" },
          { key: "contactPerson", header: "Contact Person" },
          { key: "phone", header: "Phone" },
          { key: "email", header: "Email" },
        ]}
        data={sampleSuppliers}
        keyExtractor={(row) => row.id}
      />
    </div>
  );
}
