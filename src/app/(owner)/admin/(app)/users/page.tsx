"use client";

import React, { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, DataTable, Icon, StatusBadge, useConfirm, useToast } from "@/ui";
import type { EmployeeResponse, Status, UpdateUserRequest } from "@/contracts";
import { apiClient } from "@/owner/lib/api-client";
import { USE_MOCKS } from "@/owner/lib/use-mocks";
import { listUsers, setUserStatus, updateUser } from "@/owner/features/users/api";

interface UserRow extends Record<string, unknown> {
  id: string;
  fullName: string;
  username: string;
  role: string;
  isActive: boolean;
  createdAt: string;
}

const sampleUsers: UserRow[] = [
  {
    id: "u-1",
    fullName: "Store Owner",
    username: "owner",
    role: "owner_admin",
    isActive: true,
    createdAt: "2026-08-06T00:00:00Z",
  },
  {
    id: "u-2",
    fullName: "Maria Santos",
    username: "maria",
    role: "barista",
    isActive: true,
    createdAt: "2026-08-06T00:00:00Z",
  },
];

const ROLE_LABEL: Record<string, string> = { owner_admin: "Owner", barista: "Barista" };

type View = { kind: "list" } | { kind: "add" } | { kind: "edit"; user: UserRow };

const EMPTY_FORM = { fullName: "", username: "", password: "", currentPassword: "", status: "active" as Status };

export default function UsersPage() {
  const [view, setView] = useState<View>({ kind: "list" });
  const [form, setForm] = useState(EMPTY_FORM);
  const [errorMessage, setErrorMessage] = useState("");
  const [saving, setSaving] = useState(false);
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
        createdAt: u.createdAt,
      }));

  const set = (key: keyof typeof EMPTY_FORM) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm({ ...form, [key]: e.target.value });

  const openAdd = () => {
    setErrorMessage("");
    setForm(EMPTY_FORM);
    setView({ kind: "add" });
  };

  const openEdit = (user: UserRow) => {
    setErrorMessage("");
    setForm({ ...EMPTY_FORM, fullName: user.fullName, username: user.username, status: user.isActive ? "active" : "inactive" });
    setView({ kind: "edit", user });
  };

  const backToList = () => setView({ kind: "list" });

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
      toast(`${row.fullName} ${row.isActive ? "deactivated" : "activated"}.`);
      await client.invalidateQueries({ queryKey: ["users"] });
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not update the account.", true);
    }
  };

  // Barista accounts only: username sign-in, no email. The role is always barista (no role field);
  // the single Owner account comes from /setup.
  const createUser = async () => {
    const res = await apiClient<EmployeeResponse>("/api/admin/employees", {
      method: "POST",
      body: JSON.stringify({ username: form.username, password: form.password, fullName: form.fullName, role: "barista" }),
    });
    if (!res.success) throw new Error(res.error?.message ?? "Could not create the account");
  };

  // Name, username, status and password (UpdateUserRequestSchema); the role stays as it is. The
  // Owner's own new password needs the current one (checked again by the backend (src/server)).
  const saveChanges = async (user: UserRow) => {
    const changes: UpdateUserRequest = {};
    if (form.fullName.trim() !== user.fullName) changes.fullName = form.fullName;
    if (form.username.trim().toLowerCase() !== user.username) changes.username = form.username;
    if (user.role === "owner_admin" && form.password !== "") {
      if (form.currentPassword === "") throw new Error("Enter your current password to set a new one.");
      changes.currentPassword = form.currentPassword;
    }
    if (user.role === "barista" && form.status !== (user.isActive ? "active" : "inactive")) changes.status = form.status;
    if (form.password !== "") changes.password = form.password;
    if (Object.keys(changes).length > 0) await updateUser(Number(user.id), changes);
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    setErrorMessage("");
    setSaving(true);
    try {
      if (view.kind === "add") await createUser();
      else if (view.kind === "edit") await saveChanges(view.user);
      toast(view.kind === "add" ? "Account created." : "Account updated.");
      await client.invalidateQueries({ queryKey: ["users"] });
      backToList();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Could not save the account.");
    } finally {
      setSaving(false);
    }
  };

  if (view.kind !== "list") {
    const editing = view.kind === "edit" ? view.user : null;
    return (
      <div className="space-y-5">
        <header className="product-page-header">
          <div>
            <p className="product-page-kicker">Gunita · Admin</p>
            <h1>{editing ? `Edit — ${editing.fullName}` : "Add User"}</h1>
          </div>
        </header>

        <form className="user-form" onSubmit={save} noValidate={false}>
          {errorMessage ? (
            <p className="user-form-error" role="alert">
              {errorMessage}
            </p>
          ) : null}
          <div className="user-form-grid">
            <label className="field">
              Full name
              <input required minLength={2} maxLength={100} value={form.fullName} onChange={set("fullName")} />
            </label>
            <label className="field">
              Username
              <input required autoComplete="off" value={form.username} onChange={set("username")} placeholder="e.g. maria" />
            </label>
            {editing?.role === "owner_admin" ? (
              <label className="field">
                Current password
                <input
                  type="password"
                  maxLength={72}
                  autoComplete="current-password"
                  value={form.currentPassword}
                  onChange={set("currentPassword")}
                  placeholder="needed for a new password"
                />
              </label>
            ) : null}
            <label className={editing ? "field" : "field user-form-wide"}>
              {editing ? "New password (blank = keep)" : "Password (min 8 chars)"}
              <input
                type="password"
                required={!editing}
                minLength={8}
                maxLength={72}
                autoComplete="new-password"
                value={form.password}
                onChange={set("password")}
                placeholder={editing ? "leave blank to keep" : "required"}
              />
            </label>
            {editing?.role === "barista" ? (
              <label className="field">
                Status
                <select value={form.status} onChange={set("status")}>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </label>
            ) : null}
          </div>
          <p className="user-form-note">
            {editing
              ? `Role: ${ROLE_LABEL[editing.role] ?? editing.role}. The role cannot be changed.`
              : "New accounts are Barista accounts and sign in on the POS."}
          </p>
          <div className="user-form-actions">
            <Button type="submit" variant="primary" disabled={saving || USE_MOCKS}>
              {saving ? "Saving…" : "Save"}
            </Button>
            <Button onClick={backToList} disabled={saving}>
              Cancel
            </Button>
          </div>
        </form>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header className="product-page-header">
        <div>
          <p className="product-page-kicker">Gunita · Users Board</p>
          <h1>Users</h1>
        </div>
        <Button variant="primary" onClick={openAdd}>
          <Icon name="plus" />
          Add user
        </Button>
      </header>

      <DataTable<UserRow>
        columns={[
          {
            key: "fullName",
            header: "Full Name",
            render: (row) => (
              <span>
                <strong>{row.fullName}</strong>
                {row.role === "owner_admin" ? <span className="muted"> (you)</span> : null}
              </span>
            ),
          },
          { key: "username", header: "Username", className: "mono" },
          { key: "role", header: "Role", render: (row) => ROLE_LABEL[row.role] ?? row.role },
          {
            key: "isActive",
            header: "Status",
            render: (row) => (
              <StatusBadge status={row.isActive ? "ok" : "out_of_stock"} label={row.isActive ? "Active" : "Inactive"} withIcon />
            ),
          },
          {
            key: "createdAt",
            header: "Date Created",
            render: (row) => new Date(row.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
          },
          {
            key: "actions",
            header: "Actions",
            render: (row) => (
              <div className="flex gap-2">
                <Button size="sm" disabled={USE_MOCKS} onClick={() => openEdit(row)}>
                  <Icon name="pencil" />
                  Edit
                </Button>
                {row.role === "barista" ? (
                  <Button
                    size="sm"
                    variant={row.isActive ? "danger" : "default"}
                    disabled={USE_MOCKS}
                    onClick={() => void toggleStatus(row)}
                  >
                    {row.isActive ? "Deactivate" : "Activate"}
                  </Button>
                ) : null}
              </div>
            ),
          },
        ]}
        data={rows}
        keyExtractor={(row) => row.id}
      />
    </div>
  );
}
