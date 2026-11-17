"use client";

import React, { useState } from "react";
import { Button, DataTable, Dialog, Input, StatusBadge } from "@gunita/ui";
import type { EmployeeResponse } from "@gunita/contracts";
import { apiClient } from "@/lib/api-client";

interface UserRow extends Record<string, unknown> {
  id: string;
  fullName: string;
  username: string;
  role: string;
  isActive: boolean;
}

const sampleUsers: UserRow[] = [
  {
    id: "u-1",
    fullName: "Store Owner",
    username: "owner",
    role: "owner_admin",
    isActive: true,
  },
  {
    id: "u-2",
    fullName: "Maria Santos",
    username: "maria",
    role: "barista",
    isActive: true,
  },
];

export default function UsersPage() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [fullName, setFullName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  // Barista accounts only: username sign-in, no email. The Owner account comes from /setup.
  const handleCreateEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage("");
    const res = await apiClient<EmployeeResponse>("/api/admin/employees", {
      method: "POST",
      body: JSON.stringify({ username, password, fullName, role: "barista" }),
    });
    if (!res.success) {
      setErrorMessage(res.error?.message ?? "Could not create the account");
      return;
    }
    setIsModalOpen(false);
    setFullName("");
    setUsername("");
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
          { key: "username", header: "Username" },
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
        title="Create Barista Account"
      >
        <form onSubmit={handleCreateEmployee} className="space-y-4">
          {errorMessage && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg">
              {errorMessage}
            </div>
          )}
          <Input
            label="Full Name"
            required
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="Barista Name"
          />
          <Input
            label="Username"
            required
            autoComplete="off"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="e.g. maria"
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
