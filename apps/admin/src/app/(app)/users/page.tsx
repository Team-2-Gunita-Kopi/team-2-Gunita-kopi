"use client";

import React, { useState } from "react";
import {
  Button,
  DataTable,
  Dialog,
  Input,
  Select,
  StatusBadge,
} from "@gunita/ui";

interface UserRow extends Record<string, unknown> {
  id: string;
  fullName: string;
  email: string;
  role: string;
  isActive: boolean;
}

const sampleUsers: UserRow[] = [
  {
    id: "u-1",
    fullName: "Store Owner",
    email: "owner@gunitakopi.com",
    role: "owner_admin",
    isActive: true,
  },
  {
    id: "u-2",
    fullName: "Maria Santos",
    email: "maria.barista@gunitakopi.com",
    role: "barista",
    isActive: true,
  },
];

export default function UsersPage() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("barista");
  const [password, setPassword] = useState("");

  const handleCreateEmployee = (e: React.FormEvent) => {
    e.preventDefault();
    // In real implementation: calls POST /api/admin/employees via apiClient
    setIsModalOpen(false);
    setFullName("");
    setEmail("");
    setPassword("");
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Team & Users</h1>
          <p className="text-sm text-gray-500">
            Manage employee accounts. Public sign-up is disabled; all accounts
            are provisioned here.
          </p>
        </div>
        <Button onClick={() => setIsModalOpen(true)}>
          Create Employee Account
        </Button>
      </div>

      <DataTable<UserRow>
        columns={[
          { key: "fullName", header: "Name" },
          { key: "email", header: "Email" },
          {
            key: "role",
            header: "Role",
            render: (row) => (
              <span className="font-mono text-xs bg-gray-100 px-2 py-0.5 rounded text-gray-800">
                {String(row.role)}
              </span>
            ),
          },
          {
            key: "isActive",
            header: "Status",
            render: (row) => (
              <StatusBadge
                status={row.isActive ? "completed" : "cancelled"}
                label={row.isActive ? "Active" : "Inactive"}
              />
            ),
          },
        ]}
        data={sampleUsers}
        keyExtractor={(row) => row.id}
      />

      <Dialog
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Create Employee Account"
      >
        <form onSubmit={handleCreateEmployee} className="space-y-4">
          <Input
            label="Full Name"
            required
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="Barista Name"
          />
          <Input
            label="Email Address"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="barista@gunitakopi.com"
          />
          <Select
            label="System Role"
            value={role}
            onChange={(e) => setRole(e.target.value)}
            options={[
              { value: "barista", label: "Barista (POS Access)" },
              { value: "owner_admin", label: "Owner Admin (Full Access)" },
            ]}
          />
          <Input
            label="Temporary Password"
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Minimum 8 characters"
          />
          <div className="flex justify-end space-x-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsModalOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit">Create Account</Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
