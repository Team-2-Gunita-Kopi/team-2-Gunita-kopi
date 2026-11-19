"use client";

import React, { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, DataTable, Dialog, Input, StatusBadge, useConfirm, useToast } from "@gunita/ui";
import type { EmployeeResponse } from "@gunita/contracts";
import { apiClient } from "@/lib/api-client";
import { USE_MOCKS } from "@/lib/use-mocks";
import { listUsers, setUserStatus } from "@/features/users/api";

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
  const toast = useToast();
  const confirm = useConfirm();
  const client = useQueryClient();
  const users = useQuery({ queryKey: ["users"], enabled: !USE_MOCKS, queryFn: listUsers });

  const rows: UserRow[] = USE_MOCKS
    ? sampleUsers
    : (users.data ?? []).map((u) => ({
        id: String(u.id),
        fullName: u.fullName,
        username: u.username,
        role: u.role,
        isActive: u.status === "active",
      }));

  // FR-45 to FR-47: an inactive account is refused on its next request. The Owner account
  // itself is not deactivated here (there is only one).
  const toggleStatus = async (row: UserRow) => {
    if (
      row.isActive &&
      !(await confirm({
        title: "Deactivate account",
        message: `Deactivate ${row.fullName}? They lose access to the POS immediately.`,
        confirmLabel: "Deactivate",
        danger: true,
      }))
    ) {
      return;
    }
    try {
      await setUserStatus(Number(row.id), row.isActive ? "inactive" : "active");
      await client.invalidateQueries({ queryKey: ["users"] });
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not update the account.", true);
    }
  };

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
    await client.invalidateQueries({ queryKey: ["users"] });
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
          {
            key: "actions",
            header: "",
            render: (row) =>
              row.role === "barista" ? (
                <Button size="sm" variant="outline" disabled={USE_MOCKS} onClick={() => void toggleStatus(row)}>
                  {row.isActive ? "Deactivate" : "Activate"}
                </Button>
              ) : null,
          },
        ]}
        data={rows}
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
